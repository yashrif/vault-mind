jest.mock("@/logger", () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

jest.mock("@/chatUtils", () => ({
  updateChatMemory: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/utils", () => ({
  formatDateTime: jest.fn().mockReturnValue("2024-01-01 00:00:00"),
}));

// ─── Mock TelegramClient ───────────────────────────────────────────────────

const mockSendMessage = jest.fn();

jest.mock("../TelegramClient", () => ({
  TelegramClient: jest.fn().mockImplementation(() => ({
    sendMessage: mockSendMessage,
  })),
}));

// ─── Mock TelegramStore ────────────────────────────────────────────────────

const mockGetVisibleMessages = jest.fn();
const mockAppendBotMessage = jest.fn();

jest.mock("../TelegramStore", () => ({
  TelegramStore: jest.fn().mockImplementation(() => ({
    getVisibleMessages: mockGetVisibleMessages,
    appendBotMessage: mockAppendBotMessage,
  })),
}));

// ─── Imports (after mocks) ─────────────────────────────────────────────────

import { TelegramAgent } from "../TelegramAgent";
import { TelegramClient } from "../TelegramClient";
import { TelegramStore } from "../TelegramStore";
import { updateChatMemory } from "@/chatUtils";
import type { TelegramStoredMessage } from "../TelegramTypes";

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Build a mock ChainManager-like object with runChain controlled by the test. */
function makeChainManager(runChainImpl?: jest.Mock) {
  return {
    memoryManager: {},
    runChain: runChainImpl ?? jest.fn().mockResolvedValue(undefined),
  };
}

/** Build a minimal telegram-source user message. */
function makeUserMsg(overrides: Partial<TelegramStoredMessage> = {}): TelegramStoredMessage {
  return {
    update_id: 1,
    message_id: 10,
    chat_id: 42,
    sender_name: "Alice",
    sender_type: "user",
    source: "telegram",
    text: "Hello bot",
    date: 1700000000,
    stored_at: Date.now(),
    ...overrides,
  };
}

/**
 * Flush all pending micro-tasks and promise continuations.
 * Needed because enqueueReply chains onto a private promise queue.
 */
async function flushQueue(): Promise<void> {
  // Multiple rounds ensure deeply nested promise chains resolve
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("TelegramAgent", () => {
  let client: InstanceType<typeof TelegramClient>;
  let store: InstanceType<typeof TelegramStore>;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new TelegramClient("token");
    store = new TelegramStore();
    mockGetVisibleMessages.mockReturnValue([]);
    mockAppendBotMessage.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue(undefined);
  });

  // ── 1. Ignores bot-source messages ────────────────────────────────────────

  it("does NOT call runChain for bot-source messages", async () => {
    const runChain = jest.fn();
    const agent = new TelegramAgent(client, store, makeChainManager(runChain) as any);

    const botMsg = makeUserMsg({ sender_type: "bot" });
    await agent.enqueueReply(botMsg);
    await flushQueue();

    expect(runChain).not.toHaveBeenCalled();
  });

  // ── 2. Ignores obsidian-source messages ───────────────────────────────────

  it("does NOT call runChain for obsidian-source messages", async () => {
    const runChain = jest.fn();
    const agent = new TelegramAgent(client, store, makeChainManager(runChain) as any);

    const obsidianMsg = makeUserMsg({ source: "obsidian" });
    await agent.enqueueReply(obsidianMsg);
    await flushQueue();

    expect(runChain).not.toHaveBeenCalled();
  });

  // ── 3. Happy path ─────────────────────────────────────────────────────────

  it("calls runChain, then sendMessage, then appendBotMessage for a telegram user message", async () => {
    const callOrder: string[] = [];

    const runChain = jest
      .fn()
      .mockImplementation(
        async (
          _userMsg: unknown,
          _abort: unknown,
          _onPartial: unknown,
          addMessage: (m: { message: string }) => void
        ) => {
          callOrder.push("runChain");
          addMessage({ message: "I am the AI reply" });
        }
      );

    mockSendMessage.mockImplementation(async () => {
      callOrder.push("sendMessage");
    });

    mockAppendBotMessage.mockImplementation(async () => {
      callOrder.push("appendBotMessage");
    });

    const agent = new TelegramAgent(client, store, makeChainManager(runChain) as any);
    const msg = makeUserMsg();

    await agent.enqueueReply(msg);
    await flushQueue();

    expect(runChain).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).toHaveBeenCalledWith(42, "I am the AI reply");
    expect(mockAppendBotMessage).toHaveBeenCalledWith("I am the AI reply");
    expect(callOrder).toEqual(["runChain", "sendMessage", "appendBotMessage"]);
  });

  // ── 4. Serializes two back-to-back enqueues ───────────────────────────────

  it("processes two enqueued messages serially — second only starts after first completes", async () => {
    const order: string[] = [];

    let resolveFirst!: () => void;
    const firstBlocked = new Promise<void>((res) => {
      resolveFirst = res;
    });

    const runChain = jest
      .fn()
      .mockImplementationOnce(
        async (
          _userMsg: unknown,
          _abort: unknown,
          _onPartial: unknown,
          addMessage: (m: { message: string }) => void
        ) => {
          order.push("chain-1-start");
          await firstBlocked;
          addMessage({ message: "reply-1" });
          order.push("chain-1-end");
        }
      )
      .mockImplementationOnce(
        async (
          _userMsg: unknown,
          _abort: unknown,
          _onPartial: unknown,
          addMessage: (m: { message: string }) => void
        ) => {
          order.push("chain-2-start");
          addMessage({ message: "reply-2" });
          order.push("chain-2-end");
        }
      );

    const agent = new TelegramAgent(client, store, makeChainManager(runChain) as any);

    const msg1 = makeUserMsg({ update_id: 1, text: "msg1", stored_at: 1000 });
    const msg2 = makeUserMsg({ update_id: 2, text: "msg2", stored_at: 2000 });

    // Enqueue both without waiting
    const p1 = agent.enqueueReply(msg1);
    const p2 = agent.enqueueReply(msg2);
    await p1;
    await p2;

    // At this point msg1 is blocked; msg2 has not started
    expect(order).toContain("chain-1-start");
    expect(order).not.toContain("chain-2-start");

    // Unblock msg1 and let the queue drain
    resolveFirst();
    // Allow more flush cycles to drain the chained promise queue fully
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }

    expect(order).toEqual(["chain-1-start", "chain-1-end", "chain-2-start", "chain-2-end"]);
  });

  // ── 5. Chain error → fallback sendMessage; appendBotMessage NOT called ────

  it("sends fallback error message and does NOT call appendBotMessage when runChain throws", async () => {
    const runChain = jest.fn().mockRejectedValue(new Error("LLM exploded"));

    const agent = new TelegramAgent(client, store, makeChainManager(runChain) as any);
    const msg = makeUserMsg();

    await agent.enqueueReply(msg);
    await flushQueue();

    expect(mockSendMessage).toHaveBeenCalledWith(42, "Sorry, I couldn't respond right now.");
    expect(mockAppendBotMessage).not.toHaveBeenCalled();
  });

  // ── 6. updateChatMemory is called with history excluding the current message

  it("calls updateChatMemory with the thread history excluding the inbound message", async () => {
    const storedAt = 1000;
    const updateId = 99;

    const previousMsg = makeUserMsg({ update_id: 10, stored_at: 500, text: "earlier msg" });
    const currentMsg = makeUserMsg({ update_id: updateId, stored_at: storedAt, text: "current" });

    // Visible messages include both; current should be excluded from history passed to memory
    mockGetVisibleMessages.mockReturnValue([previousMsg, currentMsg]);

    const runChain = jest
      .fn()
      .mockImplementation(
        async (
          _userMsg: unknown,
          _abort: unknown,
          _onPartial: unknown,
          addMessage: (m: { message: string }) => void
        ) => {
          addMessage({ message: "ok" });
        }
      );

    const agent = new TelegramAgent(client, store, makeChainManager(runChain) as any);
    await agent.enqueueReply(currentMsg);
    await flushQueue();

    const [historyArg] = (updateChatMemory as jest.Mock).mock.calls[0];
    // History should contain the previous message but not the current one
    expect(historyArg).toHaveLength(1);
    expect(historyArg[0].message).toBe("earlier msg");
  });
});
