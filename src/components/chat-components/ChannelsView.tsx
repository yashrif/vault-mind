import type { TelegramReplyState } from "@/channels/telegram/TelegramTypes";
import type { TelegramStore } from "@/channels/telegram/TelegramStore";
import { Button } from "@/components/ui/button";
import { TelegramChannelView } from "@/components/chat-components/TelegramChannelView";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types/message";
import { Send } from "lucide-react";
import type { App } from "obsidian";
import React, { useState } from "react";

type ChannelId = "telegram";

interface Channel {
  id: ChannelId;
  label: string;
  icon: React.ReactNode;
}

const CHANNELS: Channel[] = [
  { id: "telegram", label: "Telegram", icon: <Send className="tw-size-4" /> },
];

interface ChannelsViewProps {
  telegramStore: TelegramStore | undefined;
  telegramChatHistory: ChatMessage[];
  telegramReplyState: TelegramReplyState | null;
  telegramPrimaryChatId: number | null;
  telegramAllowlistConfigured: boolean;
  app: App;
}

export function ChannelsView({
  telegramStore,
  telegramChatHistory,
  telegramReplyState,
  telegramPrimaryChatId,
  telegramAllowlistConfigured,
  app,
}: ChannelsViewProps) {
  const [activeChannel] = useState<ChannelId>("telegram");

  return (
    <div className="tw-flex tw-size-full tw-min-w-0 tw-flex-col tw-overflow-hidden">
      <div className="tw-flex tw-shrink-0 tw-items-center tw-gap-2 tw-overflow-x-auto tw-border-b tw-border-border tw-px-3 tw-py-2">
        {CHANNELS.map((ch) => (
          <Button
            key={ch.id}
            variant="ghost2"
            size="fit"
            className={cn(
              "tw-h-8 tw-shrink-0 tw-justify-start tw-gap-2 tw-rounded-full tw-px-3 tw-text-sm",
              activeChannel === ch.id ? "tw-text-accent" : "tw-text-muted"
            )}
          >
            {ch.icon}
            {ch.label}
          </Button>
        ))}
      </div>
      <div className="tw-flex tw-min-h-0 tw-min-w-0 tw-flex-1 tw-flex-col tw-overflow-hidden">
        {activeChannel === "telegram" && (
          <TelegramChannelView
            telegramStore={telegramStore}
            chatHistory={telegramChatHistory}
            replyState={telegramReplyState}
            primaryChatId={telegramPrimaryChatId}
            allowlistConfigured={telegramAllowlistConfigured}
            app={app}
          />
        )}
      </div>
    </div>
  );
}
