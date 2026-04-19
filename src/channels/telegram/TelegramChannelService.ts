import { logError, logInfo, logWarn } from "@/logger";
import { Notice, Platform } from "obsidian";
import {
  TelegramClient,
  TelegramNetworkError,
  TelegramRateLimitError,
  TelegramUnauthorizedError,
} from "./TelegramClient";
import { TelegramStore } from "./TelegramStore";
import type { TelegramStoredMessage } from "./TelegramTypes";

const MAX_BACKOFF_MS = 60_000;
const INITIAL_BACKOFF_MS = 1_000;

/**
 * Manages the lifecycle of the Telegram long-poll channel.
 * Desktop-only (guarded by Platform.isDesktopApp).
 *
 * Startup sequence:
 *   1. getMe → load meta → if bot_id mismatch, resetForNewBot
 *   2. deleteWebhook
 *   3. Begin restartable poll cycle
 *
 * Recoverable errors (network, 429): bounded exponential backoff, then restart cycle.
 * Unrecoverable errors (401): stop loop + Notice.
 */
export class TelegramChannelService {
  private token: string;
  private client: TelegramClient;
  readonly store: TelegramStore;
  private running = false;
  private abortController: AbortController | null = null;

  constructor(token: string) {
    this.token = token;
    this.client = new TelegramClient(token);
    this.store = new TelegramStore();
  }

  /** Start polling. No-op on mobile. */
  async start(): Promise<void> {
    if (!Platform.isDesktopApp) return;
    if (this.running) return;
    this.running = true;

    try {
      await this.store.initialize();
      await this.runStartupSequence();
      this.schedulePollCycle(0);
    } catch (err) {
      if (err instanceof TelegramUnauthorizedError) {
        this.running = false;
        new Notice(`Telegram: Invalid bot token. Check Settings → Telegram.`);
        return;
      }
      logError("[TelegramChannelService] Startup error:", err);
      this.running = false;
    }
  }

  /** Stop polling. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.abortController?.abort();
    this.abortController = null;
    logInfo("[TelegramChannelService] Stopped.");
  }

  /** Restart with a new token (called on settings change). */
  async restart(newToken: string): Promise<void> {
    this.stop();
    this.token = newToken;
    this.client = new TelegramClient(newToken);
    await this.start();
  }

  /** Phase 2 extension point: no-op in Phase 1. */
  onMessageStored(_chatId: number, _message: TelegramStoredMessage): void {
    // Phase 2: route to TelegramOutboundGateway if source === "obsidian"
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  private async runStartupSequence(): Promise<void> {
    const botInfo = await this.client.getMe();
    logInfo(`[TelegramChannelService] Connected as @${botInfo.username} (id: ${botInfo.id})`);

    const meta = this.store.getMeta();
    if (meta.bot_id !== 0 && meta.bot_id !== botInfo.id) {
      logWarn("[TelegramChannelService] Bot identity changed. Resetting polling state.");
      await this.store.resetForNewBot(botInfo.id);
    } else if (meta.bot_id === 0) {
      await this.store.setOffset(botInfo.id, meta.offset);
    }

    await this.client.deleteWebhook(false);
  }

  /** Schedules a single poll cycle after `delayMs`. */
  private schedulePollCycle(delayMs: number): void {
    if (!this.running) return;
    setTimeout(() => this.runPollCycle(), delayMs);
  }

  private async runPollCycle(): Promise<void> {
    if (!this.running) return;

    this.abortController = new AbortController();
    const meta = this.store.getMeta();

    try {
      const updates = await this.client.getUpdates(meta.offset, 25, this.abortController.signal);

      // Store-then-commit: write all messages first, advance offset last
      let newOffset = meta.offset;
      for (const update of updates) {
        const stored = await this.store.appendInbound(update);
        if (stored) {
          this.onMessageStored(stored.chat_id, stored);
        }
        newOffset = Math.max(newOffset, update.update_id + 1);
      }

      if (newOffset > meta.offset) {
        await this.store.setOffset(this.store.getMeta().bot_id, newOffset);
      }

      this.schedulePollCycle(0); // Immediate next cycle on success
    } catch (err) {
      if (!this.running) return;

      if (err instanceof TelegramUnauthorizedError) {
        logError("[TelegramChannelService]", err.message);
        this.running = false;
        new Notice(`Telegram: Bot token is no longer valid. Check Settings → Telegram.`);
        return;
      }

      let backoffMs = INITIAL_BACKOFF_MS;
      if (err instanceof TelegramRateLimitError) {
        backoffMs = Math.min(err.retryAfter * 1000, MAX_BACKOFF_MS);
        logWarn(`[TelegramChannelService] Rate limited. Backing off ${backoffMs}ms.`);
      } else if (err instanceof TelegramNetworkError) {
        logWarn("[TelegramChannelService] Network error. Backing off:", backoffMs, "ms");
      } else {
        // Unexpected API error — backoff and retry
        logWarn("[TelegramChannelService] Recoverable error, backing off:", err);
      }

      this.schedulePollCycle(Math.min(backoffMs, MAX_BACKOFF_MS));
    }
  }
}
