import { AI_SENDER, USER_SENDER } from "@/constants";
import { ChatMessage } from "@/types/message";
import { formatDateTime } from "@/utils";
import type { App } from "obsidian";
import type { TelegramStoredMessage } from "./TelegramTypes";

const IMAGE_MIME_PREFIXES = ["image/"];

function isImageMime(mimeType?: string): boolean {
  if (!mimeType) return false;
  return IMAGE_MIME_PREFIXES.some((p) => mimeType.startsWith(p));
}

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
 * @param app - Obsidian App instance, used to resolve vault resource paths for images.
 */
export function mapTelegramMessageToChatMessage(
  message: TelegramStoredMessage,
  index: number,
  app?: App
): ChatMessage {
  // Build multimodal content for image messages so ChatSingleMessage renders the preview.
  let content: ChatMessage["content"] | undefined;
  if (message.mediaPath && isImageMime(message.mediaType) && app) {
    const resourceUrl = app.vault.adapter.getResourcePath(message.mediaPath);
    content = [{ type: "image_url", image_url: { url: resourceUrl } }];
  }

  return {
    id: message.local_id ?? buildFallbackId(message, index),
    message: message.text,
    sender: mapSender(message.sender_type),
    timestamp: formatDateTime(getMessageTimestamp(message)),
    isVisible: true,
    content,
  };
}

/**
 * Convert Telegram thread messages into shared ChatMessage list for unified UI rendering.
 * @param app - Obsidian App instance, forwarded to mapTelegramMessageToChatMessage.
 */
export function mapTelegramMessagesToChatMessages(
  messages: TelegramStoredMessage[],
  app?: App
): ChatMessage[] {
  return messages.map((message, index) => mapTelegramMessageToChatMessage(message, index, app));
}
