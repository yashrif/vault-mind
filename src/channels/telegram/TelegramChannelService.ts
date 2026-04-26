import { logError, logInfo, logWarn } from "@/logger";
import { Notice, Platform } from "obsidian";
import {
  TelegramClient,
  TelegramNetworkError,
  TelegramRateLimitError,
  TelegramUnauthorizedError,
} from "./TelegramClient";
import { TelegramStore } from "./TelegramStore";
import type { TelegramMessage, TelegramStoredMessage } from "./TelegramTypes";
import { TelegramAgent } from "./TelegramAgent";

const MAX_BACKOFF_MS = 60_000;
const INITIAL_BACKOFF_MS = 1_000;
const MEDIA_DIR = ".Cortex/telegram-state/media";

interface TelegramChannelServiceOptions {
  allowedChatIds?: number[];
}

/** Resolved info for a downloadable Telegram media attachment. */
interface MediaInfo {
  fileId: string;
  fileName: string;
  mimeType: string;
}

/**
 * Parse a comma-separated chat-ID string into unique numeric IDs.
 * Rejects empty tokens and non-integer values (e.g. trailing commas, spaces).
 */
export function parseTelegramAllowedChatIds(raw: string): number[] {
  if (!raw.trim()) {
    return [];
  }
  const parsed = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => /^-?\d+$/.test(part)) // reject empty and non-numeric tokens
    .map(Number);
  return Array.from(new Set(parsed));
}

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
  private _client: TelegramClient;
  readonly store: TelegramStore;
  private allowedChatIds: number[];
  private running = false;
  private abortController: AbortController | null = null;
  private agent: TelegramAgent | null = null;
  private consecutiveFailures = 0;

  /** The underlying Telegram API client. */
  get client(): TelegramClient {
    return this._client;
  }

  constructor(token: string, options: TelegramChannelServiceOptions = {}) {
    this.token = token;
    this._client = new TelegramClient(token);
    this.store = new TelegramStore();
    this.allowedChatIds = [...(options.allowedChatIds ?? [])];
    this.store.setAllowedChatIds(this.allowedChatIds);
  }

  /** Start polling. No-op on mobile. */
  async start(): Promise<void> {
    if (!Platform.isDesktopApp) return;
    if (this.running) return;
    this.running = true;

    try {
      await this.ensureMediaDir();
      await this.store.initialize();
      this.store.setAllowedChatIds(this.allowedChatIds);
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

  /** Stop polling and dispose the current agent. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.abortController?.abort();
    this.abortController = null;
    this.agent?.dispose();
    this.agent = null;
    this.store.setOnLocalMessage(null); // clear stale callback
    logInfo("[TelegramChannelService] Stopped.");
  }

  /** Restart with a new token (called on settings change). */
  async restart(newToken: string): Promise<void> {
    this.stop();
    this.consecutiveFailures = 0;
    this.token = newToken;
    this._client = new TelegramClient(newToken);
    await this.start();
  }

  /**
   * Update allowlisted chat IDs used for explicit primary-chat binding.
   */
  setAllowedChatIds(chatIds: number[]): void {
    this.allowedChatIds = [...chatIds];
    this.store.setAllowedChatIds(this.allowedChatIds);
  }

  /**
   * Attach the AI reply agent. Call after construction.
   * @param agent - The TelegramAgent instance to handle inbound message replies.
   */
  setAgent(agent: TelegramAgent): void {
    this.agent?.dispose();
    this.agent = agent;
    // TelegramAgent decides whether replies are sent to Telegram or kept local based on message source.
    this.store.setOnLocalMessage((msg) => agent.enqueueReply(msg));
  }

  /** Routes inbound Telegram messages to the AI reply agent. */
  onMessageStored(_chatId: number, message: TelegramStoredMessage): void {
    this.agent?.enqueueReply(message);
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  private async ensureMediaDir(): Promise<void> {
    if (!(await app.vault.adapter.exists(MEDIA_DIR))) {
      await app.vault.adapter.mkdir(MEDIA_DIR);
    }
  }

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

  /**
   * Compute bounded exponential backoff and honor Telegram retry_after hints.
   */
  private computeBackoffMs(retryAfterSeconds?: number): number {
    const exponential = Math.min(
      INITIAL_BACKOFF_MS * 2 ** Math.max(this.consecutiveFailures - 1, 0),
      MAX_BACKOFF_MS
    );
    if (retryAfterSeconds === undefined) {
      return exponential;
    }
    return Math.min(Math.max(exponential, retryAfterSeconds * 1000), MAX_BACKOFF_MS);
  }

  /**
   * Extract downloadable media info from a Telegram message.
   * Returns undefined if the message has no downloadable media.
   */
  private extractMediaInfo(msg: TelegramMessage): MediaInfo | undefined {
    if (msg.photo && msg.photo.length > 0) {
      const largest = msg.photo[msg.photo.length - 1];
      return { fileId: largest.file_id, fileName: "photo.jpg", mimeType: "image/jpeg" };
    }
    if (msg.document) {
      return {
        fileId: msg.document.file_id,
        fileName: msg.document.file_name ?? "document",
        mimeType: msg.document.mime_type ?? "application/octet-stream",
      };
    }
    if (msg.voice) {
      return {
        fileId: msg.voice.file_id,
        fileName: "voice.ogg",
        mimeType: msg.voice.mime_type ?? "audio/ogg",
      };
    }
    if (msg.audio) {
      const name = msg.audio.file_name ?? msg.audio.title ?? "audio";
      return {
        fileId: msg.audio.file_id,
        fileName: name,
        mimeType: msg.audio.mime_type ?? "audio/mpeg",
      };
    }
    if (msg.video) {
      const name = msg.video.file_name ?? "video.mp4";
      return {
        fileId: msg.video.file_id,
        fileName: name,
        mimeType: msg.video.mime_type ?? "video/mp4",
      };
    }
    return undefined;
  }

  /**
   * Download a Telegram media file, save it under MEDIA_DIR, and return the vault path.
   * Returns undefined if download fails.
   */
  private async downloadAndSaveMedia(
    msg: TelegramMessage
  ): Promise<{ mediaPath: string; mediaType: string; mediaName: string } | undefined> {
    const info = this.extractMediaInfo(msg);
    if (!info) return undefined;

    try {
      const filePath = await this.client.getFile(info.fileId);
      const buffer = await this.client.downloadFileAsArrayBuffer(filePath);

      // Build a stable filename: <messageId>_<originalName>
      const safeName = info.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const vaultPath = `${MEDIA_DIR}/${msg.message_id}_${safeName}`;

      await app.vault.adapter.writeBinary(vaultPath, buffer);
      logInfo(`[TelegramChannelService] Saved media to ${vaultPath} (${buffer.byteLength} bytes)`);

      return { mediaPath: vaultPath, mediaType: info.mimeType, mediaName: info.fileName };
    } catch (err) {
      logWarn("[TelegramChannelService] Failed to download/save media:", err);
      return undefined;
    }
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
        const mediaData = update.message
          ? await this.downloadAndSaveMedia(update.message)
          : undefined;
        const stored = await this.store.appendInbound(update, mediaData);
        if (stored) {
          this.onMessageStored(stored.chat_id, stored);
        }
        newOffset = Math.max(newOffset, update.update_id + 1);
      }

      if (newOffset > meta.offset) {
        await this.store.setOffset(this.store.getMeta().bot_id, newOffset);
      }

      this.consecutiveFailures = 0;

      this.schedulePollCycle(0); // Immediate next cycle on success
    } catch (err) {
      if (!this.running) return;

      if (err instanceof TelegramUnauthorizedError) {
        logError("[TelegramChannelService]", err.message);
        this.running = false;
        new Notice(`Telegram: Bot token is no longer valid. Check Settings → Telegram.`);
        return;
      }

      this.consecutiveFailures += 1;
      let backoffMs = this.computeBackoffMs();
      if (err instanceof TelegramRateLimitError) {
        backoffMs = this.computeBackoffMs(err.retryAfter);
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
