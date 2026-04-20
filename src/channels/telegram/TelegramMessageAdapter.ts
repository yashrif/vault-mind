import { AI_SENDER, USER_SENDER } from "@/constants";
import { ChatMessage } from "@/types/message";
import { formatDateTime } from "@/utils";
import type { TelegramStoredMessage } from "./TelegramTypes";

/**
 * Resolve a stable timestamp used for ChatMessage display metadata.
 * Prefers stored_at because it always reflects when the message was persisted locally.
 */
function getMessageTimestamp(message: TelegramStoredMessage): Date {
  return new Date(message.stored_at);
}

/**
 * Convert a Telegram sender type into the shared chat sender constants.
 */
function mapSender(senderType: TelegramStoredMessage["sender_type"]): string {
  return senderType === "bot" ? AI_SENDER : USER_SENDER;
}

/**
 * Build a deterministic fallback ID for legacy rows without local_id.
 */
function buildFallbackId(message: TelegramStoredMessage, index: number): string {
  const sourceId = message.update_id ?? message.message_id ?? message.stored_at;
  return `telegram-${message.chat_id}-${sourceId}-${index}`;
}

/**
 * Convert one Telegram stored message into the shared ChatMessage shape.
 */
export function mapTelegramMessageToChatMessage(
  message: TelegramStoredMessage,
  index: number
): ChatMessage {
  return {
    id: message.local_id ?? buildFallbackId(message, index),
    message: message.text,
    sender: mapSender(message.sender_type),
    timestamp: formatDateTime(getMessageTimestamp(message)),
    isVisible: true,
  };
}

/**
 * Convert Telegram thread messages into shared ChatMessage list for unified UI rendering.
 */
export function mapTelegramMessagesToChatMessages(messages: TelegramStoredMessage[]): ChatMessage[] {
  return messages.map((message, index) => mapTelegramMessageToChatMessage(message, index));
}
