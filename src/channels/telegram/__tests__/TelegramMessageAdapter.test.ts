import {
  mapTelegramMessageToChatMessage,
  mapTelegramMessagesToChatMessages,
} from "../TelegramMessageAdapter";
import { serializeReasoningPayload } from "@/LLMProviders/chainRunner/utils/AgentReasoningState";

/** Build a persisted reasoning marker for Telegram display mapping tests. */
function makeReasoningMarker(): string {
  return serializeReasoningPayload({
    status: "complete",
    elapsedSeconds: 3,
    steps: [
      {
        id: "step-1",
        timestamp: Date.now(),
        summary: "Consulting my notes",
      },
    ],
  });
}

describe("TelegramMessageAdapter", () => {
  it("maps a telegram bot message into shared ChatMessage shape", () => {
    const storedAt = 1_710_000_000_000;
    const telegramMessage = {
      local_id: "local-1",
      chat_id: 123,
      sender_name: "Bot",
      sender_type: "bot" as const,
      source: "telegram" as const,
      text: "Hello from bot",
      date: Math.floor(storedAt / 1000),
      stored_at: storedAt,
    };

    const chatMessage = mapTelegramMessageToChatMessage(telegramMessage, 0);

    expect(chatMessage.id).toBe("local-1");
    expect(chatMessage.sender).toBe("ai");
    expect(chatMessage.message).toBe("Hello from bot");
    expect(chatMessage.isVisible).toBe(true);
    expect(chatMessage.timestamp?.epoch).toBe(storedAt);
  });

  it("builds deterministic fallback IDs when local_id is missing", () => {
    const storedAt = 1_710_000_000_100;
    const telegramMessages = [
      {
        chat_id: 55,
        update_id: 99,
        sender_name: "Alice",
        sender_type: "user" as const,
        source: "telegram" as const,
        text: "Hello",
        date: Math.floor(storedAt / 1000),
        stored_at: storedAt,
      },
    ];

    const mapped = mapTelegramMessagesToChatMessages(telegramMessages);

    expect(mapped).toHaveLength(1);
    expect(mapped[0].id).toBe("telegram-55-99-0");
    expect(mapped[0].sender).toBe("user");
  });

  it("prefers richer display text when present", () => {
    const storedAt = 1_710_000_000_200;
    const reasoningMarker = makeReasoningMarker();
    const telegramMessage = {
      local_id: "local-2",
      chat_id: 123,
      sender_name: "Bot",
      sender_type: "bot" as const,
      source: "telegram" as const,
      text: "Hello from bot",
      displayText: `${reasoningMarker}

Hello from bot`,
      date: Math.floor(storedAt / 1000),
      stored_at: storedAt,
    };

    const chatMessage = mapTelegramMessageToChatMessage(telegramMessage, 0);

    expect(chatMessage.message).toBe(`${reasoningMarker}

Hello from bot`);
  });
});
