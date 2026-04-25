import React, { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Mic, Video, Music, Sticker } from "lucide-react";
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

/** Render the visual content of a message bubble. */
function MessageBubbleContent({ message }: { message: TelegramStoredMessage }) {
  // Image: resolve vault resource path for display
  if (message.mediaPath && message.mediaType?.startsWith("image/")) {
    const resourceUrl = app?.vault?.adapter?.getResourcePath?.(message.mediaPath);
    return (
      <div className="tw-flex tw-flex-col tw-gap-1">
        {resourceUrl ? (
          <img
            src={resourceUrl}
            alt="Photo"
            className="tw-max-w-[260px] tw-rounded-md tw-object-cover"
          />
        ) : (
          <span className="tw-text-xs tw-italic tw-text-muted">Photo (loading…)</span>
        )}
      </div>
    );
  }

  // Non-image file: show filename + type label
  if (message.mediaPath && message.mediaName) {
    const mediaIcon: Record<string, React.ReactNode> = {
      "audio/": <Mic className="tw-size-3.5" />,
      "video/": <Video className="tw-size-3.5" />,
    };
    const icon = Object.entries(mediaIcon).find(([prefix]) =>
      message.mediaType?.startsWith(prefix)
    )?.[1] ?? <FileText className="tw-size-3.5" />;
    return (
      <span className="tw-flex tw-items-center tw-gap-1.5 tw-text-xs">
        {icon}
        <span>{message.mediaName}</span>
      </span>
    );
  }

  // Placeholder text for messages without downloaded media
  const mediaLabel: Record<string, React.ReactNode> = {
    "[voice]": (
      <>
        <Mic className="tw-size-3.5" />
        <span>Voice message</span>
      </>
    ),
    "[audio]": (
      <>
        <Music className="tw-size-3.5" />
        <span>Audio</span>
      </>
    ),
    "[video]": (
      <>
        <Video className="tw-size-3.5" />
        <span>Video</span>
      </>
    ),
    "[document]": (
      <>
        <FileText className="tw-size-3.5" />
        <span>Document</span>
      </>
    ),
    "[sticker]": (
      <>
        <Sticker className="tw-size-3.5" />
        <span>Sticker</span>
      </>
    ),
    "[photo]": (
      <>
        <FileText className="tw-size-3.5" />
        <span>Photo</span>
      </>
    ),
  };
  const label = mediaLabel[message.text];
  if (label) {
    return (
      <span className="tw-flex tw-items-center tw-gap-1.5 tw-text-xs tw-italic tw-text-muted">
        {label}
      </span>
    );
  }

  return <span>{message.text}</span>;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.sender_type === "user";
  return (
    <div className={`tw-flex tw-flex-col tw-gap-0.5 ${isUser ? "tw-items-end" : "tw-items-start"}`}>
      <span className="tw-text-xs tw-text-muted">
        {message.sender_name} · {formatTime(message.stored_at)}
      </span>
      <div
        className={`tw-max-w-[80%] tw-rounded-lg tw-px-3 tw-py-2 tw-text-sm ${
          isUser ? "tw-bg-interactive-accent tw-text-on-accent" : "tw-bg-secondary tw-text-normal"
        }`}
      >
        <MessageBubbleContent message={message} />
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
  const [allowlistConfigured, setAllowlistConfigured] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Subscribe to store changes
  useEffect(() => {
    if (!store) return;

    const refresh = () => {
      setMessages(store.getVisibleMessages());
      setPrimaryChatId(store.getMeta().primary_chat_id);
      setAllowlistConfigured(store.hasConfiguredAllowlist());
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
    if (primaryChatId === null) return;
    setInput("");
    await store.appendLocal(text);
  }, [input, primaryChatId, store]);

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
          <div className="tw-flex tw-h-full tw-flex-col tw-items-center tw-justify-center tw-gap-3 tw-p-6 tw-text-center">
            <span className="tw-text-2xl">✈️</span>
            {!allowlistConfigured ? (
              <>
                <p className="tw-text-sm tw-font-medium tw-text-normal">
                  Get started with Telegram
                </p>
                <ol className="tw-list-none tw-space-y-1 tw-text-left tw-text-xs tw-text-muted">
                  <li>
                    1. Open <strong>Settings → Cortex → Telegram → Allowed Chat IDs</strong>
                  </li>
                  <li>2. Add your chat ID, then DM the bot from that chat to bind it</li>
                  <li>3. Once bound, the send field unlocks and you can chat</li>
                </ol>
              </>
            ) : (
              <p className="tw-text-sm tw-text-muted">
                {primaryChatId === null
                  ? "DM your bot to begin. The first allowlisted chat you message will become the primary thread."
                  : "No messages yet. DM your bot or type below."}
              </p>
            )}
          </div>
        ) : (
          <div className="tw-flex tw-flex-col tw-gap-2">
            {messages.map((m, i) => (
              <MessageBubble
                key={m.local_id ?? m.update_id ?? `obs-${m.stored_at}-${i}`}
                message={m}
              />
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
            placeholder={
              !allowlistConfigured
                ? "Configure Allowed Chat IDs in Settings first."
                : primaryChatId === null
                  ? "Bind a chat first — DM your bot from an allowlisted chat."
                  : "Message..."
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className="tw-rounded-md tw-bg-interactive-accent tw-px-3 tw-py-2 tw-text-sm tw-text-on-accent tw-transition-opacity disabled:tw-opacity-50"
            onClick={handleSend}
            disabled={!input.trim() || primaryChatId === null}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};
