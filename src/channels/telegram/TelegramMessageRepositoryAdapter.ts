import { MessageRepository } from "@/core/MessageRepository";
import { PromptContextEnvelope } from "@/context/PromptContextTypes";
import { ChatMessage, MessageContext } from "@/types/message";
import { TelegramStoredMessage } from "./TelegramTypes";

export interface TelegramRepositoryMessage {
  id: string;
  displayText: string;
  processedText: string;
  sender: string;
  timestamp: ChatMessage["timestamp"];
  originalMessage?: string;
  context?: MessageContext;
  contextEnvelope?: PromptContextEnvelope;
  content?: ChatMessage["content"];
  isVisible?: boolean;
}

/**
 * Stable message ID for Telegram thread materialization.
 * Uses local_id when present and falls back to persisted Telegram identifiers
 * for compatibility with older rows.
 */
export function getTelegramStableMessageId(message: TelegramStoredMessage): string {
  if (message.local_id) {
    return message.local_id;
  }

  if (typeof message.update_id === "number") {
    return `telegram-update-${message.update_id}`;
  }

  if (typeof message.message_id === "number") {
    return `telegram-message-${message.message_id}`;
  }

  return `telegram-${message.chat_id}-${message.stored_at}`;
}

/**
 * Materializes Telegram thread messages into a transient MessageRepository so
 * shared L2/L3 preparation logic can run without touching ChatUIState.
 */
export class TelegramMessageRepositoryAdapter {
  /**
   * Build an isolated repository from already-adapted Telegram messages.
   */
  materialize(messages: TelegramRepositoryMessage[]): MessageRepository {
    const repo = new MessageRepository();

    messages.forEach((message) => {
      const id = repo.addMessage({
        id: message.id,
        message: message.displayText,
        originalMessage: message.originalMessage ?? message.displayText,
        sender: message.sender,
        timestamp: message.timestamp,
        isVisible: message.isVisible ?? true,
        context: message.context,
        contextEnvelope: message.contextEnvelope,
        content: message.content,
      });

      repo.updateProcessedText(id, message.processedText, message.contextEnvelope);
    });

    return repo;
  }
}
