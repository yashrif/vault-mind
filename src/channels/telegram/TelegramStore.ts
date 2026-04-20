import { logError, logInfo, logWarn } from "@/logger";
import type { TelegramMeta, TelegramStoredMessage, TelegramUpdate } from "./TelegramTypes";

/** Generate a unique local ID that works in Electron, browser, and Jest environments. */
function genLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const STATE_DIR = ".copilot/telegram-state";
const META_PATH = `${STATE_DIR}/meta.json`;
const THREAD_PATH = `${STATE_DIR}/thread.json`;

const DEFAULT_META: TelegramMeta = {
  bot_id: 0,
  offset: 0,
  primary_chat_id: null,
  reset_at: 0,
};

type StoreListener = () => void;

/**
 * Persistent store for the Telegram channel.
 * Owns meta.json (bot_id, offset, primary_chat_id, reset_at),
 * thread.json (primary chat messages), and other-chats/<chatId>.json.
 *
 * All writes follow store-then-commit ordering:
 *   1. Append to message file(s).
 *   2. Write updated meta.json with advanced offset.
 *   Crash before step 2 → Telegram re-delivers → idempotent append absorbs.
 */
export class TelegramStore {
  private meta: TelegramMeta = { ...DEFAULT_META };
  private thread: TelegramStoredMessage[] = [];
  private listeners: Set<StoreListener> = new Set();
  private initialized = false;
  private onLocalMessageHandler: ((msg: TelegramStoredMessage) => void) | null = null;
  private allowedChatIds: Set<number> = new Set();
  private writeQueue: Promise<void> = Promise.resolve();

  /**
   * Set chat IDs allowed to bind and receive replies.
   */
  setAllowedChatIds(chatIds: number[]): void {
    this.allowedChatIds = new Set(chatIds);

    // If the currently bound primary chat is no longer allowed, unbind it.
    if (
      this.meta.primary_chat_id !== null &&
      !this.allowedChatIds.has(this.meta.primary_chat_id)
    ) {
      logWarn(
        "[TelegramStore] Unbinding primary_chat_id because it is no longer in the allowed list:",
        this.meta.primary_chat_id
      );
      this.meta = { ...this.meta, primary_chat_id: null };

      // Write async via the lock to avoid race conditions.
      this.withWriteLock(async () => {
        await this.writeMeta(this.meta);
      }).catch((err) => {
        logError("[TelegramStore] Failed to write meta after unbinding primary chat", err);
      });
    }

    // Always notify — allowlist changes affect onboarding state visible in the UI.
    this.notify();
  }

  /** Returns true when at least one allowed chat ID has been configured. */
  hasConfiguredAllowlist(): boolean {
    return this.allowedChatIds.size > 0;
  }

  /**
   * Serialize all mutating operations to prevent interleaved file writes.
   */
  private async withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
    let result: T;

    const run = async () => {
      result = await operation();
    };

    const chained = this.writeQueue.then(run, run);
    this.writeQueue = chained.then(
      () => undefined,
      () => undefined
    );

    await chained;
    return result!;
  }

  /**
   * Register a callback invoked whenever a message is appended via appendLocal.
   * Used by TelegramChannelService to route UI-typed messages to the AI agent.
   */
  setOnLocalMessage(handler: (msg: TelegramStoredMessage) => void): void {
    this.onLocalMessageHandler = handler;
  }

  /** Load persisted state from disk. Must be called before any other method. */
  async initialize(): Promise<void> {
    await this.ensureDirs();
    this.meta = await this.readMeta();
    this.thread = await this.readThread();
    this.initialized = true;
    logInfo(
      "[TelegramStore] Initialized. primary_chat_id:",
      this.meta.primary_chat_id,
      "offset:",
      this.meta.offset
    );
  }

  // ─── Meta ─────────────────────────────────────────────────────────────────

  getMeta(): Readonly<TelegramMeta> {
    return this.meta;
  }

  /**
   * Advance the polling offset.
   * Called AFTER all batch messages have been written (store-then-commit).
   */
  async setOffset(botId: number, offset: number): Promise<void> {
    await this.withWriteLock(async () => {
      this.meta = { ...this.meta, bot_id: botId, offset };
      await this.writeMeta(this.meta);
    });
  }

  /**
   * Reset meta when the bot token is swapped.
   * Keeps message files intact; only clears polling state.
   */
  async resetForNewBot(botId: number): Promise<void> {
    await this.withWriteLock(async () => {
      logInfo("[TelegramStore] Bot identity changed — resetting meta. New bot_id:", botId);
      this.meta = { ...DEFAULT_META, bot_id: botId };
      await this.writeMeta(this.meta);
    });
  }

  // ─── Inbound message routing ──────────────────────────────────────────────

  /**
   * Idempotent-append a Telegram update.
   * Routes to thread.json if chat_id === primary_chat_id (or binds on first message).
   * Routes to other-chats/<chatId>.json otherwise.
   * Returns the stored message if it was new, or null if it was a duplicate.
   */
  async appendInbound(update: TelegramUpdate): Promise<TelegramStoredMessage | null> {
    return this.withWriteLock(async () => {
      const msg = update.message;
      if (!msg) return null;

      const chatId = msg.chat.id;

      if (this.allowedChatIds.size === 0) {
        logWarn("[TelegramStore] Ignoring inbound message because Allowed Chat IDs is empty.");
        return null;
      }

      if (!this.allowedChatIds.has(chatId)) {
        logWarn("[TelegramStore] Ignoring inbound from non-allowlisted chat:", chatId);
        return null;
      }

      // Explicit binding: bind primary_chat_id to the first allowlisted chat that messages us.
      if (this.meta.primary_chat_id === null) {
        logInfo("[TelegramStore] Binding primary_chat_id to allowlisted chat:", chatId);
        this.meta = { ...this.meta, primary_chat_id: chatId };
        await this.writeMeta(this.meta);
      }

      const stored: TelegramStoredMessage = {
        local_id: genLocalId(),
        update_id: update.update_id,
        message_id: msg.message_id,
        chat_id: chatId,
        sender_name: msg.from?.first_name ?? "Unknown",
        sender_type: "user",
        source: "telegram",
        text: this.extractText(msg),
        date: msg.date,
        stored_at: Date.now(),
      };

      if (chatId === this.meta.primary_chat_id) {
        // Idempotent: skip if update_id already present
        const isDuplicate = this.thread.some((m) => m.update_id === update.update_id);
        if (isDuplicate) return null;

        this.thread.push(stored);
        await this.writeThread(this.thread);
        this.notify();
        return stored;
      }

      // Non-primary chat — store silently
      await this.appendToOtherChat(chatId, update.update_id, stored);
      return null; // Not notified — not rendered
    });
  }

  /**
   * Append a message typed in the Obsidian input.
   * Always appends to thread.json (no dedup needed).
   */
  async appendLocal(text: string): Promise<TelegramStoredMessage> {
    return this.withWriteLock(async () => {
      if (this.meta.primary_chat_id === null) {
        throw new Error("Telegram primary chat is not bound yet.");
      }

      const stored: TelegramStoredMessage = {
        local_id: genLocalId(),
        chat_id: this.meta.primary_chat_id,
        sender_name: "You",
        sender_type: "user",
        source: "obsidian",
        text,
        date: Math.floor(Date.now() / 1000),
        stored_at: Date.now(),
      };

      this.thread.push(stored);
      await this.writeThread(this.thread);
      this.notify();
      this.onLocalMessageHandler?.(stored);
      return stored;
    });
  }

  /**
   * Append a bot reply to the thread.
   * Always appends to thread.json (no dedup needed).
   */
  async appendBotMessage(text: string, chatId?: number): Promise<TelegramStoredMessage> {
    return this.withWriteLock(async () => {
      const resolvedChatId = chatId ?? this.meta.primary_chat_id;
      if (resolvedChatId === null || resolvedChatId === undefined) {
        throw new Error("Telegram primary chat is not bound yet.");
      }

      const stored: TelegramStoredMessage = {
        local_id: genLocalId(),
        chat_id: resolvedChatId,
        sender_name: "Bot",
        sender_type: "bot",
        source: "telegram",
        text,
        date: Math.floor(Date.now() / 1000),
        stored_at: Date.now(),
      };

      this.thread.push(stored);
      await this.writeThread(this.thread);
      this.notify();
      return stored;
    });
  }

  // ─── View ──────────────────────────────────────────────────────────────────

  /**
   * Messages shown in the current view (post-reset only).
   * Pre-reset messages remain on disk for Phase 3 AI context.
   */
  getVisibleMessages(): TelegramStoredMessage[] {
    return this.thread.filter((m) => m.stored_at >= this.meta.reset_at);
  }

  /** Advance reset_at to now+1 — clears the view without deleting history.
   * Adding 1ms ensures messages appended at the exact same moment are hidden. */
  async resetView(): Promise<void> {
    await this.withWriteLock(async () => {
      this.meta = { ...this.meta, reset_at: Date.now() + 1 };
      await this.writeMeta(this.meta);
      this.notify();
      logInfo("[TelegramStore] View reset. reset_at:", this.meta.reset_at);
    });
  }

  // ─── Subscription ──────────────────────────────────────────────────────────

  /** Subscribe to store changes. Returns an unsubscribe function. */
  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }

  // ─── Disk I/O ──────────────────────────────────────────────────────────────

  private async ensureDirs(): Promise<void> {
    if (!(await app.vault.adapter.exists(STATE_DIR))) {
      await app.vault.adapter.mkdir(STATE_DIR);
    }
    const otherChatsDir = `${STATE_DIR}/other-chats`;
    if (!(await app.vault.adapter.exists(otherChatsDir))) {
      await app.vault.adapter.mkdir(otherChatsDir);
    }
  }

  private async readMeta(): Promise<TelegramMeta> {
    try {
      if (await app.vault.adapter.exists(META_PATH)) {
        const raw = await app.vault.adapter.read(META_PATH);
        return { ...DEFAULT_META, ...JSON.parse(raw) };
      }
    } catch (err) {
      logWarn("[TelegramStore] Could not read meta.json — starting fresh:", err);
    }
    return { ...DEFAULT_META };
  }

  private async writeMeta(meta: TelegramMeta): Promise<void> {
    await app.vault.adapter.write(META_PATH, JSON.stringify(meta));
  }

  private async readThread(): Promise<TelegramStoredMessage[]> {
    try {
      if (await app.vault.adapter.exists(THREAD_PATH)) {
        const raw = await app.vault.adapter.read(THREAD_PATH);
        return JSON.parse(raw) as TelegramStoredMessage[];
      }
    } catch (err) {
      logWarn("[TelegramStore] Could not read thread.json — starting fresh:", err);
    }
    return [];
  }

  private async writeThread(messages: TelegramStoredMessage[]): Promise<void> {
    await app.vault.adapter.write(THREAD_PATH, JSON.stringify(messages));
  }

  private async appendToOtherChat(
    chatId: number,
    updateId: number,
    stored: TelegramStoredMessage
  ): Promise<void> {
    const path = `${STATE_DIR}/other-chats/${chatId}.json`;
    let existing: TelegramStoredMessage[] = [];
    try {
      if (await app.vault.adapter.exists(path)) {
        existing = JSON.parse(await app.vault.adapter.read(path));
      }
    } catch {
      // Start fresh on parse error
    }

    const isDuplicate = existing.some((m) => m.update_id === updateId);
    if (!isDuplicate) {
      existing.push(stored);
      await app.vault.adapter.write(path, JSON.stringify(existing));
    }
  }

  private extractText(msg: {
    text?: string;
    photo?: unknown[];
    sticker?: unknown;
    document?: unknown;
    audio?: unknown;
    video?: unknown;
    voice?: unknown;
  }): string {
    if (msg.text) return msg.text;
    if (msg.photo) return "[photo]";
    if (msg.sticker) return "[sticker]";
    if (msg.document) return "[document]";
    if (msg.audio) return "[audio]";
    if (msg.video) return "[video]";
    if (msg.voice) return "[voice]";
    return "[unsupported message type]";
  }
}
