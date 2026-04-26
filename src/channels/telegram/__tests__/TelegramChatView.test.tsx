import React from "react";
import { render, screen } from "@testing-library/react";
import { TelegramChatView } from "../TelegramChatView";
import type { TelegramStore } from "../TelegramStore";
import type { TelegramStoredMessage } from "../TelegramTypes";

/** Build a minimal mock TelegramStore. */
function makeStore(overrides: {
  messages?: TelegramStoredMessage[];
  primaryChatId?: number | null;
  allowlistConfigured?: boolean;
}): TelegramStore {
  const { messages = [], primaryChatId = null, allowlistConfigured = false } = overrides;
  return {
    getVisibleMessages: jest.fn(() => messages),
    getMeta: jest.fn(() => ({
      bot_id: 0,
      offset: 0,
      primary_chat_id: primaryChatId,
      reset_at: 0,
    })),
    hasConfiguredAllowlist: jest.fn(() => allowlistConfigured),
    subscribe: jest.fn(() => () => {}),
  } as unknown as TelegramStore;
}

function makeMessage(overrides: Partial<TelegramStoredMessage> = {}): TelegramStoredMessage {
  return {
    local_id: "uuid-1",
    chat_id: 42,
    sender_name: "Alice",
    sender_type: "user",
    source: "telegram",
    text: "Hello",
    date: 1700000000,
    stored_at: Date.now(),
    ...overrides,
  };
}

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
});

describe("TelegramChatView", () => {
  // ── 1. No store ─────────────────────────────────────────────────────────

  it("shows onboarding prompt when store is not provided", () => {
    render(<TelegramChatView />);
    screen.getByText(/Enable Telegram in Settings/i);
  });

  // ── 2. Store present, allowlist not configured ──────────────────────────

  it("shows setup guide when store is present but allowlist is not configured", () => {
    const store = makeStore({ allowlistConfigured: false });
    render(<TelegramChatView store={store} />);
    screen.getByText(/Get started with Telegram/i);
    screen.getByText(/Allowed Chat IDs/i);
  });

  // ── 3. Store present, allowlist configured, no bound chat ───────────────

  it("shows bind prompt when allowlist is configured but no chat is bound", () => {
    const store = makeStore({ allowlistConfigured: true, primaryChatId: null });
    render(<TelegramChatView store={store} />);
    screen.getByText(/DM your bot to begin/i);
  });

  // ── 4. Store present, allowlist configured, chat bound, no messages ─────

  it("shows empty state when chat is bound but no messages exist", () => {
    const store = makeStore({ allowlistConfigured: true, primaryChatId: 42 });
    render(<TelegramChatView store={store} />);
    screen.getByText(/No messages yet/i);
  });

  // ── 5. Store present with messages ──────────────────────────────────────

  it("renders message bubbles when messages are present", () => {
    const store = makeStore({
      allowlistConfigured: true,
      primaryChatId: 42,
      messages: [
        makeMessage({
          local_id: "uuid-1",
          text: "Hello bot",
          sender_type: "user",
          sender_name: "Alice",
        }),
        makeMessage({
          local_id: "uuid-2",
          text: "Hello human",
          sender_type: "bot",
          sender_name: "Bot",
        }),
      ],
    });
    render(<TelegramChatView store={store} />);
    screen.getByText("Hello bot");
    screen.getByText("Hello human");
  });
});
