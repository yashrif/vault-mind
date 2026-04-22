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
  cleanMessageForCopy: jest.fn().mockImplementation((message: string) =>
    message
      .replace(/<!--AGENT_REASONING:\w+:\d+:.*-->/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  ),
}));

const mockArrayBufferToBase64 = jest.fn().mockReturnValue("base64-image");
const mockExtractFileContent = jest.fn();
const mockIsImageFile = jest.fn();

jest.mock("@/utils/base64", () => ({
  arrayBufferToBase64: (...args: unknown[]) => mockArrayBufferToBase64(...args),
}));

jest.mock("@/utils/fileContentExtractor", () => ({
  extractFileContent: (...args: unknown[]) => mockExtractFileContent(...args),
  isImageFile: (...args: unknown[]) => mockIsImageFile(...args),
}));

const mockPrepareMessage = jest.fn();

jest.mock("@/core/MessagePreparationService", () => ({
  MessagePreparationService: jest.fn().mockImplementation(() => ({
    prepareMessage: (...args: unknown[]) => mockPrepareMessage(...args),
  })),
}));

// ─── Mock TelegramClient ───────────────────────────────────────────────────

const mockSendMessage = jest.fn();
const mockSendChatAction = jest.fn();

jest.mock("../TelegramClient", () => ({
  TelegramClient: jest.fn().mockImplementation(() => ({
    sendMessage: mockSendMessage,
    sendChatAction: mockSendChatAction,
  })),
}));

// ─── Mock TelegramStore ────────────────────────────────────────────────────

const mockGetVisibleMessages = jest.fn();
const mockBeginReply = jest.fn();
const mockUpdateReplyState = jest.fn();
const mockClearReplyState = jest.fn();
const mockAppendBotMessage = jest.fn();
const mockUpdateMessagePromptState = jest.fn();

jest.mock("../TelegramStore", () => ({
  TelegramStore: jest.fn().mockImplementation(() => ({
    getVisibleMessages: mockGetVisibleMessages,
    beginReply: mockBeginReply,
    updateReplyState: mockUpdateReplyState,
    clearReplyState: mockClearReplyState,
    appendBotMessage: mockAppendBotMessage,
    updateMessagePromptState: mockUpdateMessagePromptState,
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
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("TelegramAgent", () => {
  let client: InstanceType<typeof TelegramClient>;
  let store: InstanceType<typeof TelegramStore>;
  let originalApp: any;
  let originalFile: typeof File | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new TelegramClient("token");
    store = new TelegramStore();
    mockGetVisibleMessages.mockReturnValue([]);
    mockBeginReply.mockImplementation((chatId: number) => ({
      chatId,
      streamingMessageId: `stream-${chatId}`,
      partialText: "",
      loadingMessage: "",
      startedAt: Date.now(),
    }));
    mockUpdateReplyState.mockReset();
    mockClearReplyState.mockReset();
    mockAppendBotMessage.mockResolvedValue(undefined);
    mockUpdateMessagePromptState.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue(undefined);
    mockSendChatAction.mockResolvedValue(undefined);
    mockExtractFileContent.mockResolvedValue("Parsed attachment text");
    mockIsImageFile.mockReturnValue(false);
    originalApp = global.app;
    originalFile = global.File;
    class MockFile {
      name: string;
      type: string;

      constructor(_parts: BlobPart[], name: string, options?: FilePropertyBag) {
        this.name = name;
        this.type = options?.type ?? "";
      }

      async arrayBuffer(): Promise<ArrayBuffer> {
        return new ArrayBuffer(8);
      }
    }
    global.File = MockFile as unknown as typeof File;
    global.app = {
      vault: {
        adapter: {
          readBinary: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
        },
      },
    } as any;
    mockPrepareMessage.mockImplementation(async (params: any) => {
      const userText = params.message.originalMessage || params.message.message;
      const attachmentText =
        params.message.context?.attachedFileContents
          ?.map((file: { content: string }) => file.content)
          .join("\n\n") || "";
      const processedText = attachmentText ? `${attachmentText}\n\n${userText}` : userText;
      const layers = [
        {
          id: "L1_SYSTEM",
          label: "System Instructions",
          text: "Telegram system",
          stable: true,
          segments: [],
          hash: "",
        },
      ];

      if (attachmentText) {
        layers.push({
          id: "L3_TURN",
          label: "Current Turn Context",
          text: attachmentText,
          stable: true,
          segments: [
            {
              id: "telegram-attachment",
              content: attachmentText,
              stable: true,
            },
          ],
          hash: "",
        } as any);
      }

      layers.push({
        id: "L5_USER",
        label: "User message",
        text: userText,
        stable: true,
        segments: [
          {
            id: "telegram-user",
            content: userText,
            stable: true,
          },
        ],
        hash: "",
      } as any);

      const contextEnvelope = {
        version: 1,
        conversationId: null,
        messageId: params.message.id ?? null,
        serializedText: processedText,
        combinedHash: "",
        layerHashes: {} as Record<string, string>,
        layers,
      };

      return {
        preparedMessage: {
          ...params.message,
          message: processedText,
          originalMessage: userText,
          contextEnvelope,
        },
        processedContent: processedText,
        contextEnvelope,
      };
    });
  });

  afterEach(() => {
    global.app = originalApp;
    global.File = originalFile as typeof File;
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

  // ── 2. Processes obsidian-source messages ─────────────────────────────────

  it("calls runChain for obsidian-source messages and keeps reply local-only", async () => {
    const runChain = jest
      .fn()
      .mockImplementation(
        async (
          _userMsg: unknown,
          _abort: unknown,
          _onPartial: unknown,
          addMessage: (m: { message: string }) => void
        ) => {
          addMessage({ message: "local reply" });
        }
      );
    const agent = new TelegramAgent(client, store, makeChainManager(runChain) as any);

    const obsidianMsg = makeUserMsg({ source: "obsidian" });
    await agent.enqueueReply(obsidianMsg);
    await flushQueue();

    expect(runChain).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(mockSendChatAction).not.toHaveBeenCalled();
    expect(mockAppendBotMessage).toHaveBeenCalledWith("local reply", 42, "obsidian", {
      displayText: undefined,
      localId: "stream-42",
    });
    expect(mockClearReplyState).toHaveBeenCalledWith("stream-42");
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
          onPartial: (text: string) => void,
          addMessage: (m: { message: string }) => void
        ) => {
          callOrder.push("runChain");
          onPartial("**Partial**");
          addMessage({
            message: `<!--AGENT_REASONING:complete:3:["Consulting my notes"]-->
# Reply

- I am the **AI** reply`,
          });
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
    expect(mockSendChatAction).toHaveBeenCalledWith(42, "typing");
    expect(mockUpdateReplyState).toHaveBeenCalledWith("stream-42", {
      partialText: "**Partial**",
    });
    expect(mockSendMessage).toHaveBeenCalledWith(42, "<b>Reply</b>\n\n• I am the <b>AI</b> reply", {
      parseMode: "HTML",
    });
    expect(mockAppendBotMessage).toHaveBeenCalledWith(
      "# Reply\n\n- I am the **AI** reply",
      42,
      "telegram",
      {
        displayText: `<!--AGENT_REASONING:complete:3:["Consulting my notes"]-->
# Reply

- I am the **AI** reply`,
        localId: "stream-42",
      }
    );
    expect(mockClearReplyState).toHaveBeenCalledWith("stream-42");
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
    await flushQueue();

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

  // ── 5. Chain error → fallback sendMessage; appendBotMessage IS called (fallback persisted) ──

  it("sends fallback error message and persists it via appendBotMessage when fallback send succeeds", async () => {
    const runChain = jest.fn().mockRejectedValue(new Error("LLM exploded"));

    const agent = new TelegramAgent(client, store, makeChainManager(runChain) as any);
    const msg = makeUserMsg();

    await agent.enqueueReply(msg);
    await flushQueue();

    expect(mockSendMessage).toHaveBeenCalledWith(42, "Sorry, I couldn't respond right now.");
    expect(mockAppendBotMessage).toHaveBeenCalledWith(
      "Sorry, I couldn't respond right now.",
      42,
      "telegram",
      { displayText: undefined, localId: "stream-42" }
    );
    expect(mockClearReplyState).toHaveBeenCalledWith("stream-42");
  });

  // ── 6. Chain error → fallback send fails; appendBotMessage is NOT called ──

  it("does not persist fallback message when fallback send itself fails", async () => {
    const runChain = jest.fn().mockRejectedValue(new Error("LLM exploded"));
    mockSendMessage.mockRejectedValue(new Error("network error"));

    const agent = new TelegramAgent(client, store, makeChainManager(runChain) as any);
    const msg = makeUserMsg();

    await agent.enqueueReply(msg);
    await flushQueue();

    expect(mockAppendBotMessage).not.toHaveBeenCalled();
    expect(mockClearReplyState).toHaveBeenCalledWith("stream-42");
  });

  // ── 7. Obsidian-source chain error → local fallback append; no Telegram send ──

  it("persists local fallback message without sending to Telegram for obsidian-source failures", async () => {
    const runChain = jest.fn().mockRejectedValue(new Error("LLM exploded"));

    const agent = new TelegramAgent(client, store, makeChainManager(runChain) as any);
    const msg = makeUserMsg({ source: "obsidian" });

    await agent.enqueueReply(msg);
    await flushQueue();

    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(mockSendChatAction).not.toHaveBeenCalled();
    expect(mockAppendBotMessage).toHaveBeenCalledWith(
      "Sorry, I couldn't respond right now.",
      42,
      "obsidian",
      { displayText: undefined, localId: "stream-42" }
    );
    expect(mockClearReplyState).toHaveBeenCalledWith("stream-42");
  });

  // ── 8. dispose() is idempotent ────────────────────────────────────────────

  it("dispose() is safe to call multiple times", () => {
    const agent = new TelegramAgent(client, store, makeChainManager() as any);
    expect(() => {
      agent.dispose();
      agent.dispose();
    }).not.toThrow();
  });

  // ── 9. updateChatMemory is called with history excluding the current message

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

  it("hydrates previous document turns into memory history and persists the resolved prompt state", async () => {
    const previousMsg = makeUserMsg({
      local_id: "prev-doc",
      update_id: 10,
      stored_at: 500,
      text: "[document]",
      mediaPath: ".copilot/telegram-state/media/10_lecture_03.pdf",
      mediaType: "application/pdf",
      mediaName: "lecture_03.pdf",
    });
    const currentMsg = makeUserMsg({
      local_id: "current-follow-up",
      update_id: 99,
      stored_at: 1000,
      text: "Explain the last 2 pages",
    });

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
    expect(historyArg).toHaveLength(1);
    expect(historyArg[0].message).toBe("[document]");
    expect(historyArg[0].contextEnvelope?.serializedText).toContain(
      "[Attached file: lecture_03.pdf]"
    );
    expect(historyArg[0].contextEnvelope?.serializedText).toContain("Parsed attachment text");
    expect(mockUpdateMessagePromptState).toHaveBeenCalledWith(
      expect.objectContaining({ local_id: "prev-doc" }),
      expect.objectContaining({
        processedText: expect.stringContaining("Parsed attachment text"),
        contextEnvelope: expect.objectContaining({
          serializedText: expect.stringContaining("Parsed attachment text"),
        }),
      })
    );
  });

  it("persists resolved prompt state for the current inbound document turn", async () => {
    const mediaMsg = makeUserMsg({
      local_id: "current-doc",
      text: "[document]",
      mediaPath: ".copilot/telegram-state/media/11_lecture_03.pdf",
      mediaType: "application/pdf",
      mediaName: "lecture_03.pdf",
    });

    const runChain = jest.fn().mockImplementation(
      async (
        userMsg: {
          message: string;
          originalMessage?: string;
          contextEnvelope?: { layers: Array<{ id: string }> };
        },
        _abort: unknown,
        _onPartial: unknown,
        addMessage: (m: { message: string }) => void
      ) => {
        expect(userMsg.message).toContain("Parsed attachment text");
        expect(userMsg.originalMessage).toBe("[document]");
        expect(
          userMsg.contextEnvelope?.layers.some((layer: { id: string }) => layer.id === "L1_SYSTEM")
        ).toBe(true);
        addMessage({ message: "ok" });
      }
    );

    const agent = new TelegramAgent(client, store, makeChainManager(runChain) as any);
    await agent.enqueueReply(mediaMsg);
    await flushQueue();

    expect(mockUpdateMessagePromptState).toHaveBeenCalledWith(
      expect.objectContaining({ local_id: "current-doc" }),
      expect.objectContaining({
        processedText: expect.stringContaining("Parsed attachment text"),
        contextEnvelope: expect.objectContaining({
          serializedText: expect.stringContaining("Parsed attachment text"),
        }),
      })
    );
  });
});
