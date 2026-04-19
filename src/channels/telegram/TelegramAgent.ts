import { AI_SENDER, USER_SENDER } from "@/constants";
import ChainManager from "@/LLMProviders/chainManager";
import { logError, logInfo } from "@/logger";
import { updateChatMemory } from "@/chatUtils";
import { formatDateTime } from "@/utils";
import { ChatMessage } from "@/types/message";
import type { PromptContextEnvelope } from "@/context/PromptContextTypes";
import { TelegramClient } from "./TelegramClient";
import { TelegramStore } from "./TelegramStore";
import type { TelegramStoredMessage } from "./TelegramTypes";

// Max characters per Telegram message chunk (Bot API limit)
const TELEGRAM_CHUNK_SIZE = 4096;

/**
 * Orchestrates AI auto-replies for the Telegram channel.
 *
 * When an inbound telegram-source message arrives, TelegramAgent:
 *   1. Rehydrates MemoryManager from the visible Telegram thread (for multi-turn context).
 *   2. Runs the message through ChainManager.runChain (uses the same agentic chain as the UI chat).
 *   3. Posts the final response back to Telegram via TelegramClient.sendMessage.
 *   4. Stores the bot reply in TelegramStore for display in TelegramChatView.
 *
 * Replies are serialized by a promise queue — one at a time, in order.
 *
 * Memory note: MemoryManager is a plugin-wide singleton. TelegramAgent rehydrates it
 * with the Telegram thread before each call; the UI chat rehydrates it before its own
 * calls. Brief cross-contamination is bounded to the duration of a single Telegram
 * response and is an acceptable tradeoff for Phase 2a.
 */
export class TelegramAgent {
  /** Serial promise queue — prevents concurrent chain invocations. */
  private queue: Promise<void> = Promise.resolve();

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

    try {
      // Build history from visible thread, excluding the current inbound message
      const history = this.store
        .getVisibleMessages()
        .filter((m) => m.update_id !== msg.update_id)
        .map((m) => this.toChainMessage(m));

      // Rehydrate shared MemoryManager with Telegram thread context
      await updateChatMemory(history, this.chainManager.memoryManager);

      // Build the user ChatMessage for the chain
      const userChatMessage: ChatMessage = {
        message: msg.text,
        sender: USER_SENDER,
        isVisible: true,
        timestamp: formatDateTime(new Date(msg.stored_at)),
        contextEnvelope: this.buildMinimalEnvelope(msg.text),
      };

      // Run chain — collect the final AI message via the addMessage callback
      const abortController = new AbortController();
      let finalText = "";

      await this.chainManager.runChain(
        userChatMessage,
        abortController,
        (_partial: string) => {
          // Streaming partial — no-op; we only need the final text
        },
        (finalMessage: ChatMessage) => {
          finalText = finalMessage.message ?? "";
        },
        { debug: false }
      );

      if (!finalText) {
        logError("[TelegramAgent] Chain returned empty response.");
        return;
      }

      // Post reply back to Telegram (chunked to respect Bot API limit)
      await this.sendChunked(msg.chat_id, finalText);

      // Store the bot reply so TelegramChatView re-renders
      await this.store.appendBotMessage(finalText, msg.chat_id);

      logInfo(`[TelegramAgent] Reply sent to chat ${msg.chat_id} (${finalText.length} chars).`);
    } catch (err) {
      logError("[TelegramAgent] Failed to generate/send reply:", err);
      try {
        await this.client.sendMessage(msg.chat_id, "Sorry, I couldn't respond right now.");
      } catch (sendErr) {
        logError("[TelegramAgent] Also failed to send error message:", sendErr);
      }
    }
  }

  /**
   * Send a potentially long text to Telegram, splitting into chunks of at most
   * TELEGRAM_CHUNK_SIZE characters to respect the Bot API message-length limit.
   */
  private async sendChunked(chatId: number, text: string): Promise<void> {
    if (text.length <= TELEGRAM_CHUNK_SIZE) {
      await this.client.sendMessage(chatId, text);
      return;
    }
    let offset = 0;
    while (offset < text.length) {
      const chunk = text.slice(offset, offset + TELEGRAM_CHUNK_SIZE);
      await this.client.sendMessage(chatId, chunk);
      offset += TELEGRAM_CHUNK_SIZE;
    }
  }

  /**
   * Convert a TelegramStoredMessage to a ChatMessage suitable for updateChatMemory.
   */
  private toChainMessage(m: TelegramStoredMessage): ChatMessage {
    return {
      message: m.text,
      sender: m.sender_type === "bot" ? AI_SENDER : USER_SENDER,
      isVisible: true,
      timestamp: formatDateTime(new Date(m.stored_at)),
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
