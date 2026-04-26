import type { TelegramReplyState } from "@/channels/telegram/TelegramTypes";
import type { TelegramStore } from "@/channels/telegram/TelegramStore";
import ChatMessages from "@/components/chat-components/ChatMessages";
import type { ChatMessage } from "@/types/message";
import type { App } from "obsidian";
import React from "react";

interface TelegramChannelViewProps {
  telegramStore: TelegramStore | undefined;
  chatHistory: ChatMessage[];
  replyState: TelegramReplyState | null;
  primaryChatId: number | null;
  allowlistConfigured: boolean;
  app: App;
}

export function TelegramChannelView({
  telegramStore,
  chatHistory,
  replyState,
  primaryChatId,
  allowlistConfigured,
  app,
}: TelegramChannelViewProps) {
  if (chatHistory.length > 0 || replyState) {
    return (
      <ChatMessages
        chatHistory={chatHistory}
        currentAiMessage={replyState?.partialText ?? ""}
        streamingMessageId={replyState?.streamingMessageId}
        loading={!!replyState}
        loadingMessage={replyState?.loadingMessage}
        app={app}
        onRegenerate={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        onReplaceChat={() => {}}
        showHelperComponents={false}
        actionCapabilities={{
          allowUserEdit: false,
          allowDelete: false,
          allowRegenerate: false,
          allowInsert: false,
          allowShowSources: false,
        }}
      />
    );
  }

  return (
    <div className="tw-flex tw-flex-1 tw-flex-col tw-items-center tw-justify-center tw-gap-3 tw-p-6 tw-text-center">
      <span className="tw-text-2xl">✈️</span>
      {!telegramStore ? (
        <>
          <p className="tw-text-sm tw-font-medium tw-text-normal">Telegram</p>
          <p className="tw-text-xs tw-text-muted">
            Enable Telegram in Settings and enter your bot token.
          </p>
        </>
      ) : !allowlistConfigured ? (
        <>
          <p className="tw-text-sm tw-font-medium tw-text-normal">Get started with Telegram</p>
          <ol className="tw-list-none tw-space-y-1 tw-text-left tw-text-xs tw-text-muted">
            <li>1. Open Settings -&gt; Cortex -&gt; Telegram -&gt; Allowed Chat IDs</li>
            <li>2. Add your chat ID, then DM the bot from that chat to bind it</li>
            <li>3. Once bound, inbound messages and replies appear in this thread</li>
          </ol>
        </>
      ) : (
        <p className="tw-text-sm tw-text-muted">
          {primaryChatId === null
            ? "DM your bot to begin. The first allowlisted chat you message will become the primary thread."
            : "No messages yet. Send a message to your bot in Telegram to start."}
        </p>
      )}
    </div>
  );
}
