import { AI_SENDER, USER_SENDER } from "@/constants";
import ChainManager from "@/LLMProviders/chainManager";
import MemoryManager from "@/LLMProviders/memoryManager";
import { logError, logInfo, logWarn } from "@/logger";
import { updateChatMemory } from "@/chatUtils";
import { formatDateTime } from "@/utils";
import { arrayBufferToBase64 } from "@/utils/base64";
import { extractFileContent, isImageFile } from "@/utils/fileContentExtractor";
import { ChatMessage } from "@/types/message";
import type { PromptContextEnvelope } from "@/context/PromptContextTypes";
import { ChainType } from "@/chainFactory";
import { TelegramClient } from "./TelegramClient";
import { TelegramStore } from "./TelegramStore";
import type { TelegramStoredMessage } from "./TelegramTypes";

interface PreparedTelegramPromptState {
  messageText: string;
  processedText: string;
  contextEnvelope: PromptContextEnvelope;
  content?: ChatMessage["content"];
}

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

  constructor(
    private readonly client: TelegramClient,
    private readonly store: TelegramStore,
    private readonly chainManager: ChainManager
  ) {}

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

    // Build history from visible thread, excluding the current inbound message.
    // Use local_id when available (new messages); fall back to update_id for pre-migration rows.
    const history = this.store
      .getVisibleMessages()
      .filter((m) => {
        if (m.local_id && msg.local_id) return m.local_id !== msg.local_id;
        return m.update_id !== msg.update_id;
      });

    const chainHistory = await Promise.all(history.map((message) => this.toChainMessage(message)));

    // Rehydrate the isolated Telegram MemoryManager with thread context
    await updateChatMemory(chainHistory, this.telegramMemory);

    const preparedMessage = await this.prepareMessageForLLM(msg, {
      includeRichContent: true,
      persistResolvedPromptState: true,
    });

    // Build the user ChatMessage for the chain
    const userChatMessage: ChatMessage = {
      message: preparedMessage.messageText,
      originalMessage: msg.text,
      sender: USER_SENDER,
      isVisible: true,
      timestamp: formatDateTime(new Date(msg.stored_at)),
      contextEnvelope: preparedMessage.contextEnvelope,
      content: preparedMessage.content,
    };

    // Run chain pinned to TELEGRAM_CHAIN so UI chain-type changes don't affect it.
    // Pass telegramMemory via options — no global mutation of chainManager.memoryManager.
    const abortController = new AbortController();
    let finalText = "";

    try {
      await this.chainManager.runChain(
        userChatMessage,
        abortController,
        (_partial: string) => {
          // Streaming partial — no-op; we only need the final text
        },
        (finalMessage: ChatMessage) => {
          finalText = finalMessage.message ?? "";
        },
        { debug: false, chainType: ChainType.TELEGRAM_CHAIN, memoryManager: this.telegramMemory }
      );

      if (!finalText) {
        logError("[TelegramAgent] Chain returned empty response.");
        return;
      }

      if (shouldSendToTelegram) {
        // TelegramClient.sendMessage handles chunking at the Bot API 4096-char limit
        await this.client.sendMessage(msg.chat_id, finalText);
      }

      // Store the bot reply so TelegramChatView re-renders.
      // For obsidian-source turns, this is local-only and never sent to Telegram.
      await this.store.appendBotMessage(
        finalText,
        msg.chat_id,
        shouldSendToTelegram ? "telegram" : "obsidian"
      );

      logInfo(`[TelegramAgent] Reply sent to chat ${msg.chat_id} (${finalText.length} chars).`);
    } catch (err) {
      logError("[TelegramAgent] Failed to generate/send reply:", err);
      const fallbackText = "Sorry, I couldn't respond right now.";
      if (shouldSendToTelegram) {
        try {
          await this.client.sendMessage(msg.chat_id, fallbackText);
          // Persist only when the fallback send succeeded — never store an unsent Telegram message.
          await this.store.appendBotMessage(fallbackText, msg.chat_id, "telegram");
        } catch (sendErr) {
          logError("[TelegramAgent] Also failed to send error message:", sendErr);
        }
      } else {
        try {
          // Local-only fallback for messages authored in Obsidian.
          await this.store.appendBotMessage(fallbackText, msg.chat_id, "obsidian");
        } catch (storeErr) {
          logError("[TelegramAgent] Also failed to persist local fallback message:", storeErr);
        }
      }
    }
  }

  /** Release the settings-change subscription held by the isolated MemoryManager. */
  dispose(): void {
    this.telegramMemory.dispose();
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
   * Convert a TelegramStoredMessage to a ChatMessage suitable for updateChatMemory.
   */
  private async toChainMessage(m: TelegramStoredMessage): Promise<ChatMessage> {
    const preparedMessage = await this.prepareMessageForLLM(m, {
      includeRichContent: false,
      persistResolvedPromptState: true,
    });

    return {
      message: preparedMessage.processedText,
      originalMessage: m.text,
      sender: m.sender_type === "bot" ? AI_SENDER : USER_SENDER,
      isVisible: true,
      timestamp: formatDateTime(new Date(m.stored_at)),
    };
  }

  /**
   * Resolve the prompt-visible state for a Telegram message, including any
   * lazy media parsing needed for future follow-up turns.
   */
  private async prepareMessageForLLM(
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
        messageText: persistedText,
        processedText: persistedText,
        contextEnvelope: persistedEnvelope,
      };
    }

    const needsMediaRead = options.includeRichContent || !hasResolvedPromptState;
    let resolvedContent: ChatMessage["content"] | undefined;
    let attachmentContext = "";

    if (needsMediaRead) {
      const resolvedMedia = await this.resolveMediaForLLM(msg.mediaPath, msg.mediaType, msg.mediaName);
      resolvedContent = options.includeRichContent ? resolvedMedia.content : undefined;
      attachmentContext = resolvedMedia.context;
    }

    if (hasResolvedPromptState) {
      return {
        messageText: persistedText,
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
      messageText: processedText,
      processedText,
      contextEnvelope,
      content: resolvedContent,
    };
  }

  /**
   * Combine the message text with any extracted attachment context, avoiding
   * duplicate insertion when a message has already been upgraded.
   */
  private mergeMessageWithAttachmentContext(messageText: string, attachmentContext: string): string {
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
