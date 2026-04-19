import React, { useCallback, useEffect, useRef, useState } from "react";
import type { TelegramStore } from "./TelegramStore";
import type { TelegramStoredMessage } from "./TelegramTypes";

interface TelegramChatViewProps {
  store?: TelegramStore;
  onReset?: () => void;
}

/** Formats a stored_at timestamp for display. */
function formatTime(storedAt: number): string {
  return new Date(storedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface MessageBubbleProps {
  message: TelegramStoredMessage;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isObsidian = message.source === "obsidian";
  return (
    <div
      className={`tw-flex tw-flex-col tw-gap-0.5 ${isObsidian ? "tw-items-end" : "tw-items-start"}`}
    >
      <span className="tw-text-xs tw-text-muted">
        {message.sender_name} · {formatTime(message.stored_at)}
      </span>
      <div
        className={`tw-max-w-[80%] tw-rounded-lg tw-px-3 tw-py-2 tw-text-sm ${
          isObsidian
            ? "tw-bg-interactive-accent tw-text-on-accent"
            : "tw-bg-secondary tw-text-normal"
        }`}
      >
        {message.text}
      </div>
    </div>
  );
};

/**
 * Full Telegram thread view.
 * Renders visible messages from TelegramStore, input bar, and reset button.
 */
export const TelegramChatView: React.FC<TelegramChatViewProps> = ({ store, onReset }) => {
  const [messages, setMessages] = useState<TelegramStoredMessage[]>([]);
  const [input, setInput] = useState("");
  const [primaryChatId, setPrimaryChatId] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Subscribe to store changes
  useEffect(() => {
    if (!store) return;

    const refresh = () => {
      setMessages(store.getVisibleMessages());
      setPrimaryChatId(store.getMeta().primary_chat_id);
    };
    refresh();
    const unsub = store.subscribe(refresh);
    return unsub;
  }, [store]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !store) return;
    setInput("");
    await store.appendLocal(text);
  }, [input, store]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  if (!store) {
    return (
      <div className="tw-flex tw-h-full tw-flex-col tw-items-center tw-justify-center tw-gap-3 tw-p-6 tw-text-center">
        <span className="tw-text-2xl">✈️</span>
        <p className="tw-text-sm tw-font-medium tw-text-normal">Telegram</p>
        <p className="tw-text-xs tw-text-muted">
          Enable Telegram in Settings → Telegram and enter your bot token.
        </p>
      </div>
    );
  }

  return (
    <div className="tw-flex tw-h-full tw-flex-col tw-overflow-hidden">
      {/* Messages */}
      <div className="tw-flex-1 tw-overflow-y-auto tw-p-3">
        {messages.length === 0 ? (
          <div className="tw-flex tw-h-full tw-flex-col tw-items-center tw-justify-center tw-gap-2 tw-text-center">
            <span className="tw-text-2xl">✈️</span>
            <p className="tw-text-sm tw-text-muted">
              {primaryChatId === null
                ? "DM your bot to begin. The first chat you message will become the primary thread."
                : "No messages yet. DM your bot or type below."}
            </p>
          </div>
        ) : (
          <div className="tw-flex tw-flex-col tw-gap-2">
            {messages.map((m, i) => (
              <MessageBubble key={m.update_id ?? `obs-${m.stored_at}-${i}`} message={m} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="tw-border-t tw-border-border tw-p-2">
        <div className="tw-flex tw-items-end tw-gap-2">
          <textarea
            className="tw-flex-1 tw-resize-none tw-rounded-md tw-border tw-border-border tw-bg-modifier-form-field tw-p-2 tw-text-sm tw-text-normal tw-outline-none focus:tw-border-interactive-accent"
            rows={1}
            placeholder="Message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className="tw-rounded-md tw-bg-interactive-accent tw-px-3 tw-py-2 tw-text-sm tw-text-on-accent tw-transition-opacity disabled:tw-opacity-50"
            onClick={handleSend}
            disabled={!input.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};
