import { AI_SENDER, USER_SENDER } from "@/constants";
import ChainManager from "@/LLMProviders/chainManager";
import MemoryManager from "@/LLMProviders/memoryManager";
import { logError, logInfo } from "@/logger";
import { updateChatMemory } from "@/chatUtils";
import { formatDateTime } from "@/utils";
import { ChatMessage } from "@/types/message";
import type { PromptContextEnvelope } from "@/context/PromptContextTypes";
import { ChainType } from "@/chainFactory";
import { TelegramClient } from "./TelegramClient";
import { TelegramStore } from "./TelegramStore";
import type { TelegramStoredMessage } from "./TelegramTypes";

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
      })
      .map((m) => this.toChainMessage(m));

    // Rehydrate the isolated Telegram MemoryManager with thread context
    await updateChatMemory(history, this.telegramMemory);

    // Build the user ChatMessage for the chain
    const userChatMessage: ChatMessage = {
      message: msg.text,
      sender: USER_SENDER,
      isVisible: true,
      timestamp: formatDateTime(new Date(msg.stored_at)),
      contextEnvelope: this.buildMinimalEnvelope(msg.text),
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
