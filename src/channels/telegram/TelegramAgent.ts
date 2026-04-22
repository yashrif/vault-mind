import { AI_SENDER, LOADING_MESSAGES, USER_SENDER } from "@/constants";
import type ChainManager from "@/LLMProviders/chainManager";
import MemoryManager from "@/LLMProviders/memoryManager";
import { ChainType } from "@/chainFactory";
import { MessagePreparationService } from "@/core/MessagePreparationService";
import { MessageRepository } from "@/core/MessageRepository";
import { logError, logInfo, logWarn } from "@/logger";
import { resolveRuntimeChainPolicy, RuntimeChainPolicy } from "@/runtime/RuntimeChainPolicy";
import { FileParserManager } from "@/tools/FileParserManager";
import { updateChatMemory } from "@/chatUtils";
import { formatDateTime } from "@/utils";
import { arrayBufferToBase64 } from "@/utils/base64";
import { extractFileContent, isImageFile } from "@/utils/fileContentExtractor";
import { ChatMessage, MessageContext } from "@/types/message";
import type { PromptContextEnvelope } from "@/context/PromptContextTypes";
import { formatTelegramOutboundText } from "@/channels/telegram/telegramOutboundFormat";
import {
  getTelegramStableMessageId,
  TelegramMessageRepositoryAdapter,
  TelegramRepositoryMessage,
} from "./TelegramMessageRepositoryAdapter";
import { TelegramClient } from "./TelegramClient";
import { TelegramStore } from "./TelegramStore";
import type { TelegramStoredMessage } from "./TelegramTypes";

interface PreparedTelegramPromptState {
  processedText: string;
  contextEnvelope: PromptContextEnvelope;
  content?: ChatMessage["content"];
  context?: MessageContext;
}

const TELEGRAM_TYPING_HEARTBEAT_MS = 4000;

/**
 * Orchestrates AI auto-replies for the Telegram channel.
 *
 * For every non-bot message (telegram or obsidian source), TelegramAgent:
 *   1. Rehydrates its own isolated MemoryManager from the visible Telegram thread.
 *   2. Runs the message through ChainManager.runChain, pinned to TELEGRAM_CHAIN.
 *   3. Routes delivery by message source:
 *      - telegram source: send to Telegram API and persist in TelegramStore.
 *      - obsidian source: persist locally only (no Telegram API send).
 *
 * Replies are serialized by a promise queue — one at a time, in order.
 */
export class TelegramAgent {
  /** Serial promise queue — prevents concurrent chain invocations. */
  private queue: Promise<void> = Promise.resolve();

  /** Isolated memory — not the shared UI singleton, preventing context bleed. */
  private readonly telegramMemory: MemoryManager = MemoryManager.createIsolated();
  private readonly runtimePolicy: RuntimeChainPolicy = resolveRuntimeChainPolicy(
    ChainType.TELEGRAM_CHAIN
  );
  private readonly fileParserManager: FileParserManager;
  private readonly messagePreparationService: MessagePreparationService;
  private readonly messageRepositoryAdapter = new TelegramMessageRepositoryAdapter();

  constructor(
    private readonly client: TelegramClient,
    private readonly store: TelegramStore,
    private readonly chainManager: ChainManager
  ) {
    const vault = this.chainManager.app?.vault ?? app.vault;
    this.fileParserManager = new FileParserManager(vault);
    this.messagePreparationService = new MessagePreparationService(
      this.chainManager,
      this.fileParserManager
    );
  }

  /**
   * Enqueue an AI reply for the given inbound message.
   * Silently ignores bot-source messages.
   * All non-bot senders get an AI reply, regardless of source.
   */
  async enqueueReply(msg: TelegramStoredMessage): Promise<void> {
    if (msg.sender_type === "bot") {
      return;
    }
    this.queue = this.queue
      .then(() => this.runReply(msg))
      .catch(() => {
        // Queue must not break on error; individual reply errors are handled inside runReply
      });
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  /**
   * Execute one AI reply cycle for the given inbound message.
   */
  private async runReply(msg: TelegramStoredMessage): Promise<void> {
    logInfo(`[TelegramAgent] Generating reply for chat ${msg.chat_id}: "${msg.text.slice(0, 80)}"`);
    const shouldSendToTelegram = msg.source === "telegram";
    const replyState = this.store.beginReply(msg.chat_id, {
      loadingMessage: LOADING_MESSAGES.DEFAULT,
    });
    const stopTypingHeartbeat = shouldSendToTelegram
      ? this.startTypingHeartbeat(msg.chat_id)
      : () => {};
    try {
      const { repo, currentMessageId } = await this.buildTransientMessageRepo(msg);
      const historyMessages = repo
        .getLLMMessages()
        .filter((message) => message.id !== currentMessageId);

      await updateChatMemory(historyMessages, this.telegramMemory);

      const currentMessage = repo.getMessage(currentMessageId);
      if (!currentMessage) {
        throw new Error(`Failed to materialize Telegram message ${currentMessageId}`);
      }

      const { preparedMessage, processedContent, contextEnvelope } =
        await this.messagePreparationService.prepareMessage({
          message: currentMessage,
          messageRepo: repo,
          chainType: ChainType.TELEGRAM_CHAIN,
          vault: this.chainManager.app?.vault ?? app.vault,
          runtimePolicy: this.runtimePolicy,
          includeActiveNote: false,
          activeNote: null,
        });
      if (!contextEnvelope) {
        throw new Error("Telegram shared preparation did not produce a context envelope.");
      }
      repo.updateProcessedText(currentMessageId, processedContent, contextEnvelope);
      await this.store.updateMessagePromptState(msg, {
        processedText: processedContent,
        contextEnvelope,
      });

      // Run chain pinned to TELEGRAM_CHAIN so UI chain-type changes don't affect it.
      // Pass telegramMemory via options — no global mutation of chainManager.memoryManager.
      const abortController = new AbortController();
      let finalText = "";
      let partialText = "";

      await this.chainManager.runChain(
        preparedMessage,
        abortController,
        (nextPartialText: string) => {
          partialText = nextPartialText;
          this.store.updateReplyState(replyState.streamingMessageId, {
            partialText: nextPartialText,
          });
        },
        (finalMessage: ChatMessage) => {
          finalText = finalMessage.message ?? partialText;
        },
        {
          debug: false,
          chainType: ChainType.TELEGRAM_CHAIN,
          memoryManager: this.telegramMemory,
          runtimePolicy: this.runtimePolicy,
        }
      );

      finalText = finalText || partialText;

      if (!finalText) {
        logError("[TelegramAgent] Chain returned empty response.");
        return;
      }

      const outboundText = formatTelegramOutboundText(finalText);
      if (!outboundText) {
        logError("[TelegramAgent] Formatted Telegram response was empty.");
        return;
      }

      if (shouldSendToTelegram) {
        // TelegramClient.sendMessage handles chunking at the Bot API 4096-char limit
        await this.client.sendMessage(msg.chat_id, outboundText);
      }

      // Store the bot reply so TelegramChatView re-renders.
      // For obsidian-source turns, this is local-only and never sent to Telegram.
      await this.store.appendBotMessage(
        outboundText,
        msg.chat_id,
        shouldSendToTelegram ? "telegram" : "obsidian",
        { localId: replyState.streamingMessageId }
      );

      logInfo(`[TelegramAgent] Reply sent to chat ${msg.chat_id} (${outboundText.length} chars).`);
    } catch (err) {
      logError("[TelegramAgent] Failed to generate/send reply:", err);
      const fallbackText = "Sorry, I couldn't respond right now.";
      if (shouldSendToTelegram) {
        try {
          await this.client.sendMessage(msg.chat_id, fallbackText);
          // Persist only when the fallback send succeeded — never store an unsent Telegram message.
          await this.store.appendBotMessage(fallbackText, msg.chat_id, "telegram", {
            localId: replyState.streamingMessageId,
          });
        } catch (sendErr) {
          logError("[TelegramAgent] Also failed to send error message:", sendErr);
        }
      } else {
        try {
          // Local-only fallback for messages authored in Obsidian.
          await this.store.appendBotMessage(fallbackText, msg.chat_id, "obsidian", {
            localId: replyState.streamingMessageId,
          });
        } catch (storeErr) {
          logError("[TelegramAgent] Also failed to persist local fallback message:", storeErr);
        }
      }
    } finally {
      stopTypingHeartbeat();
      this.store.clearReplyState(replyState.streamingMessageId);
    }
  }

  /** Release the settings-change subscription held by the isolated MemoryManager. */
  dispose(): void {
    this.telegramMemory.dispose();
  }

  /**
   * Keep Telegram's native typing indicator alive while a long-running reply
   * is being generated. Individual heartbeat failures are logged and ignored.
   */
  private startTypingHeartbeat(chatId: number): () => void {
    let stopped = false;

    const sendHeartbeat = async () => {
      if (stopped) {
        return;
      }

      try {
        await this.client.sendChatAction(chatId, "typing");
      } catch (err) {
        logWarn("[TelegramAgent] Failed to send typing heartbeat:", err);
      }
    };

    void sendHeartbeat();
    const intervalId = setInterval(() => {
      void sendHeartbeat();
    }, TELEGRAM_TYPING_HEARTBEAT_MS);

    return () => {
      stopped = true;
      clearInterval(intervalId);
    };
  }

  /**
   * Read a saved media file from the vault and prepare it for the LLM.
   * - Images: returns multimodal content array with base64 data URL.
   * - Non-images: extracts text content and returns it as a context string.
   */
  private async resolveMediaForLLM(
    mediaPath: string,
    mediaType = "application/octet-stream",
    mediaName = "file"
  ): Promise<{ content: ChatMessage["content"]; context: string }> {
    try {
      const buffer = await app.vault.adapter.readBinary(mediaPath);
      const file = new File([buffer], mediaName, { type: mediaType });

      if (isImageFile(file)) {
        const base64 = arrayBufferToBase64(buffer);
        return {
          content: [
            { type: "image_url", image_url: { url: `data:${mediaType};base64,${base64}` } },
          ],
          context: `[Attached image: ${mediaName}]`,
        };
      }

      const text = await extractFileContent(file);
      return {
        content: undefined,
        context: `[Attached file: ${mediaName}]\n${text}`,
      };
    } catch (err) {
      logWarn("[TelegramAgent] Failed to read media file:", mediaPath, err);
      return { content: undefined, context: "" };
    }
  }

  /**
   * Build a transient repository from the visible Telegram thread plus the
   * current inbound turn. This repo never escapes the Telegram pipeline.
   */
  private async buildTransientMessageRepo(
    currentMessage: TelegramStoredMessage
  ): Promise<{ repo: MessageRepository; currentMessageId: string }> {
    const visibleMessages = this.store.getVisibleMessages();
    const hasCurrentMessage = visibleMessages.some((message) =>
      this.isSameStoredMessage(message, currentMessage)
    );
    const materializedMessages = hasCurrentMessage
      ? visibleMessages
      : [...visibleMessages, currentMessage];

    const repositoryMessages = await Promise.all(
      materializedMessages.map(async (message) => {
        if (this.isSameStoredMessage(message, currentMessage)) {
          return this.buildCurrentTurnRepositoryMessage(message);
        }

        return this.buildHistoricalRepositoryMessage(message);
      })
    );

    return {
      repo: this.messageRepositoryAdapter.materialize(repositoryMessages),
      currentMessageId: getTelegramStableMessageId(currentMessage),
    };
  }

  /**
   * Build the current inbound Telegram turn for shared prompt preparation.
   */
  private async buildCurrentTurnRepositoryMessage(
    msg: TelegramStoredMessage
  ): Promise<TelegramRepositoryMessage> {
    const resolvedMedia = await this.resolveTelegramMessageMedia(msg, {
      includeRichContent: true,
    });

    return {
      id: getTelegramStableMessageId(msg),
      displayText: msg.text,
      originalMessage: msg.text,
      processedText: msg.text,
      sender: msg.sender_type === "bot" ? AI_SENDER : USER_SENDER,
      timestamp: formatDateTime(new Date(msg.stored_at)),
      context: resolvedMedia.context,
      content: resolvedMedia.content,
      isVisible: true,
    };
  }

  /**
   * Build a historical Telegram row for transient repo materialization.
   * Full envelopes are reused as-is; legacy plain/media rows are handled via
   * compatibility readers without eagerly migrating the whole thread file.
   */
  private async buildHistoricalRepositoryMessage(
    msg: TelegramStoredMessage
  ): Promise<TelegramRepositoryMessage> {
    const preparedMessage = await this.preparePromptStateForStoredMessage(msg, {
      includeRichContent: false,
      persistResolvedPromptState: true,
    });

    return {
      id: getTelegramStableMessageId(msg),
      displayText: msg.text,
      originalMessage: msg.text,
      processedText: preparedMessage.processedText,
      sender: msg.sender_type === "bot" ? AI_SENDER : USER_SENDER,
      timestamp: formatDateTime(new Date(msg.stored_at)),
      contextEnvelope: preparedMessage.contextEnvelope,
      content: preparedMessage.content,
      context: preparedMessage.context,
      isVisible: true,
    };
  }

  /**
   * Resolve runtime media state for a Telegram message.
   * Images keep multimodal content and a lightweight textual breadcrumb.
   * Non-image files are exposed through attachedFileContents so shared prep
   * emits them into L3 like normal chat attachments.
   */
  private async resolveTelegramMessageMedia(
    msg: TelegramStoredMessage,
    options: {
      includeRichContent: boolean;
    }
  ): Promise<{ context?: MessageContext; content?: ChatMessage["content"] }> {
    if (!msg.mediaPath) {
      return {};
    }

    const resolvedMedia = await this.resolveMediaForLLM(
      msg.mediaPath,
      msg.mediaType,
      msg.mediaName
    );
    const attachedFileContent = resolvedMedia.context
      ? [
          {
            name: msg.mediaName || "attachment",
            content: resolvedMedia.context,
          },
        ]
      : [];

    return {
      context:
        attachedFileContent.length > 0
          ? {
              notes: [],
              urls: [],
              attachedFileContents: attachedFileContent,
            }
          : undefined,
      content: options.includeRichContent ? resolvedMedia.content : undefined,
    };
  }

  /**
   * Resolve the compatibility prompt state for persisted Telegram messages.
   * Full envelopes are reused; legacy media rows can be lazily upgraded when
   * their attachment context is re-read during normal use.
   */
  private async preparePromptStateForStoredMessage(
    msg: TelegramStoredMessage,
    options: {
      includeRichContent: boolean;
      persistResolvedPromptState: boolean;
    }
  ): Promise<PreparedTelegramPromptState> {
    const persistedText = msg.processedText || msg.contextEnvelope?.serializedText || msg.text;
    const persistedEnvelope = msg.contextEnvelope || this.buildMinimalEnvelope(persistedText);
    const hasResolvedPromptState = !!(msg.processedText || msg.contextEnvelope);

    if (!msg.mediaPath) {
      return {
        processedText: persistedText,
        contextEnvelope: persistedEnvelope,
      };
    }

    const needsMediaRead = options.includeRichContent || !hasResolvedPromptState;
    let resolvedContent: ChatMessage["content"] | undefined;
    let attachmentContext = "";

    if (needsMediaRead) {
      const resolvedMedia = await this.resolveMediaForLLM(
        msg.mediaPath,
        msg.mediaType,
        msg.mediaName
      );
      resolvedContent = options.includeRichContent ? resolvedMedia.content : undefined;
      attachmentContext = resolvedMedia.context;
    }

    if (hasResolvedPromptState) {
      return {
        processedText: persistedText,
        contextEnvelope: persistedEnvelope,
        content: resolvedContent,
      };
    }

    const processedText = this.mergeMessageWithAttachmentContext(msg.text, attachmentContext);
    const contextEnvelope = attachmentContext
      ? this.buildMediaEnvelope(msg.text, attachmentContext, msg.mediaName)
      : this.buildMinimalEnvelope(processedText);

    if (options.persistResolvedPromptState) {
      await this.store.updateMessagePromptState(msg, {
        contextEnvelope,
        processedText,
      });
    }

    return {
      processedText,
      contextEnvelope,
      content: resolvedContent,
    };
  }

  /**
   * Compare two stored Telegram rows using the stable IDs available in the
   * current store schema and older pre-local-id rows.
   */
  private isSameStoredMessage(left: TelegramStoredMessage, right: TelegramStoredMessage): boolean {
    if (left.local_id && right.local_id) {
      return left.local_id === right.local_id;
    }

    if (left.update_id !== undefined && right.update_id !== undefined) {
      return left.update_id === right.update_id;
    }

    if (left.message_id !== undefined && right.message_id !== undefined) {
      return left.chat_id === right.chat_id && left.message_id === right.message_id;
    }

    return (
      left.chat_id === right.chat_id &&
      left.stored_at === right.stored_at &&
      left.sender_type === right.sender_type &&
      left.text === right.text
    );
  }

  /**
   * Combine the message text with any extracted attachment context, avoiding
   * duplicate insertion when a message has already been upgraded.
   */
  private mergeMessageWithAttachmentContext(
    messageText: string,
    attachmentContext: string
  ): string {
    if (!attachmentContext) {
      return messageText;
    }

    if (messageText.includes(attachmentContext)) {
      return messageText;
    }

    return `${messageText}\n\n${attachmentContext}`;
  }

  /**
   * Build a lightweight envelope that keeps attachment context in L3 and the
   * original Telegram text or caption in L5.
   */
  private buildMediaEnvelope(
    userText: string,
    attachmentContext: string,
    mediaName = "attachment"
  ): PromptContextEnvelope {
    return {
      version: 1,
      conversationId: null,
      messageId: null,
      serializedText: `${attachmentContext}\n\n${userText}`,
      combinedHash: "",
      layerHashes: {} as Record<string, string>,
      layers: [
        {
          id: "L3_TURN",
          label: "Current Turn Context",
          text: attachmentContext,
          stable: true,
          segments: [
            {
              id: `telegram-media-${mediaName}`,
              content: attachmentContext,
              stable: true,
            },
          ],
          hash: "",
        },
        {
          id: "L5_USER",
          label: "User message",
          text: userText,
          stable: true,
          segments: [
            {
              id: "telegram-user-message",
              content: userText,
              stable: true,
            },
          ],
          hash: "",
        },
      ],
    };
  }

  /**
   * Build a minimal PromptContextEnvelope for a plain-text user turn.
   * Only the L5_USER layer is populated; all other optional layers are absent.
   */
  private buildMinimalEnvelope(text: string): PromptContextEnvelope {
    return {
      version: 1,
      conversationId: null,
      messageId: null,
      serializedText: text,
      combinedHash: "",
      layerHashes: {} as Record<string, string>,
      layers: [
        {
          id: "L5_USER",
          label: "User message",
          text,
          stable: true,
          segments: [],
          hash: "",
        },
      ],
    };
  }
}
