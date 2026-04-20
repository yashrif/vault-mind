/** A single message stored in the primary thread or an other-chats file. */
export interface TelegramStoredMessage {
  /** Stable local UUID assigned on append. Optional only for backward compat with pre-existing rows. */
  local_id?: string;
  /** Telegram update_id — only for source "telegram"; used for idempotent append. */
  update_id?: number;
  /** Telegram message ID. */
  message_id?: number;
  chat_id: number;
  /** Display name: Telegram first name for telegram-source, "You" for obsidian-source. */
  sender_name: string;
  sender_type: "user" | "bot";
  /**
   * Message origin marker:
   * - "telegram": delivered via Telegram transport
   * - "obsidian": created locally in the plugin (including local-only bot replies)
   */
  source: "telegram" | "obsidian";
  /** Plain text, or "[photo]" / "[sticker]" etc. for unsupported message types. */
  text: string;
  /** Unix seconds from Telegram; Date.now() for obsidian-source. */
  date: number;
  /** Date.now() when appended to the store. Used for reset_at filtering. */
  stored_at: number;
}

/** Persisted meta.json shape. */
export interface TelegramMeta {
  bot_id: number;
  offset: number;
  /** chatId of the designated primary chat; null until first inbound message. */
  primary_chat_id: number | null;
  /** stored_at threshold — messages with stored_at < reset_at are hidden from view. */
  reset_at: number;
}

/** Telegram Bot API Update object (minimal subset we care about). */
export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

/** Telegram Bot API Message object (minimal subset). */
export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  photo?: unknown[];
  sticker?: unknown;
  document?: unknown;
  audio?: unknown;
  video?: unknown;
  voice?: unknown;
}

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  is_bot?: boolean;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
}

/** Response from getMe. */
export interface TelegramBotInfo {
  id: number;
  first_name: string;
  username: string;
  is_bot: true;
}
