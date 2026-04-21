jest.mock("@/logger", () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

import { TelegramStore } from "../TelegramStore";
import type { TelegramUpdate } from "../TelegramTypes";

// ─── Mock app.vault.adapter ────────────────────────────────────────────────

const mockAdapter = {
  exists: jest.fn(),
  mkdir: jest.fn(),
  read: jest.fn(),
  write: jest.fn(),
};

// @ts-ignore — global app is available in Obsidian runtime; we set it for tests
global.app = { vault: { adapter: mockAdapter } };

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeUpdate(updateId: number, chatId: number, text = "hello"): TelegramUpdate {
  return {
    update_id: updateId,
    message: {
      message_id: updateId * 10,
      from: { id: chatId + 1000, first_name: "Alice" },
      chat: { id: chatId, type: "private" },
      date: Math.floor(Date.now() / 1000),
      text,
    },
  };
}

function setupEmptyVault() {
  mockAdapter.exists.mockResolvedValue(false);
  mockAdapter.mkdir.mockResolvedValue(undefined);
  mockAdapter.read.mockResolvedValue("[]");
  mockAdapter.write.mockResolvedValue(undefined);
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("TelegramStore", () => {
  let store: TelegramStore;
  let mockTime: number;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTime = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => mockTime++);
    store = new TelegramStore();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("initialize", () => {
    it("starts with default meta when no files exist", async () => {
      setupEmptyVault();
      await store.initialize();
      const meta = store.getMeta();
      expect(meta.offset).toBe(0);
      expect(meta.primary_chat_id).toBeNull();
      expect(meta.reset_at).toBe(0);
    });

    it("loads persisted meta from disk", async () => {
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockImplementation(async (path: string) => {
        if (path.includes("meta.json")) {
          return JSON.stringify({ bot_id: 99, offset: 42, primary_chat_id: 555, reset_at: 1000 });
        }
        return "[]";
      });
      await store.initialize();
      const meta = store.getMeta();
      expect(meta.offset).toBe(42);
      expect(meta.primary_chat_id).toBe(555);
    });
  });

  describe("appendInbound", () => {
    beforeEach(async () => {
      setupEmptyVault();
      await store.initialize();
      store.setAllowedChatIds([111, 999]);
    });

    it("binds primary_chat_id on first allowlisted message", async () => {
      await store.appendInbound(makeUpdate(1, 111));
      expect(store.getMeta().primary_chat_id).toBe(111);
    });

    it("ignores inbound messages until allowlist is configured", async () => {
      const unconfiguredStore = new TelegramStore();
      setupEmptyVault();
      await unconfiguredStore.initialize();

      const stored = await unconfiguredStore.appendInbound(makeUpdate(1, 111));
      expect(stored).toBeNull();
      expect(unconfiguredStore.getMeta().primary_chat_id).toBeNull();
      expect(unconfiguredStore.getVisibleMessages()).toHaveLength(0);
    });

    it("appends to thread for primary chat", async () => {
      await store.appendInbound(makeUpdate(1, 111));
      await store.appendInbound(makeUpdate(2, 111));
      expect(store.getVisibleMessages()).toHaveLength(2);
    });

    it("is idempotent for duplicate update_id", async () => {
      await store.appendInbound(makeUpdate(1, 111));
      await store.appendInbound(makeUpdate(1, 111)); // duplicate
      expect(store.getVisibleMessages()).toHaveLength(1);
    });

    it("routes non-primary chats to other-chats (not visible)", async () => {
      await store.appendInbound(makeUpdate(1, 111)); // binds primary
      await store.appendInbound(makeUpdate(2, 999)); // different chat
      expect(store.getVisibleMessages()).toHaveLength(1);
      // other-chat file should have been written
      const writeCalls = mockAdapter.write.mock.calls;
      const otherChatWrite = writeCalls.some(([path]: [string]) =>
        path.includes("other-chats/999")
      );
      expect(otherChatWrite).toBe(true);
    });

    it("ignores messages from non-allowlisted chats", async () => {
      const stored = await store.appendInbound(makeUpdate(1, 222));
      expect(stored).toBeNull();
      expect(store.getVisibleMessages()).toHaveLength(0);
      expect(store.getMeta().primary_chat_id).toBeNull();
    });

    it("sets source field to 'telegram' on inbound messages", async () => {
      await store.appendInbound(makeUpdate(1, 111));
      const msgs = store.getVisibleMessages();
      expect(msgs[0].source).toBe("telegram");
    });

    it("notifies subscribers on new primary-chat message", async () => {
      const listener = jest.fn();
      store.subscribe(listener);
      await store.appendInbound(makeUpdate(1, 111));
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("prefers media captions over generic document placeholders", async () => {
      const update: TelegramUpdate = {
        update_id: 7,
        message: {
          message_id: 70,
          from: { id: 9999, first_name: "Bob" },
          chat: { id: 111, type: "private" },
          date: Math.floor(Date.now() / 1000),
          caption: "Explain the last 2 pages",
          document: {
            file_id: "doc-1",
            file_unique_id: "doc-1-unique",
            file_name: "lecture_03.pdf",
            mime_type: "application/pdf",
          },
        },
      };

      await store.appendInbound(update);
      expect(store.getVisibleMessages()[0].text).toBe("Explain the last 2 pages");
    });
  });

  describe("appendLocal", () => {
    beforeEach(async () => {
      setupEmptyVault();
      await store.initialize();
      store.setAllowedChatIds([111]);
      await store.appendInbound(makeUpdate(1, 111));
    });

    it("always appends with source 'obsidian'", async () => {
      await store.appendLocal("hello from obsidian");
      const msgs = store.getVisibleMessages();
      const localMessage = msgs[msgs.length - 1];
      expect(localMessage.source).toBe("obsidian");
      expect(localMessage.sender_name).toBe("You");
    });

    it("throws when primary chat is not bound", async () => {
      const unboundStore = new TelegramStore();
      setupEmptyVault();
      await unboundStore.initialize();
      await expect(unboundStore.appendLocal("test")).rejects.toThrow(
        "Telegram primary chat is not bound yet."
      );
    });

    it("notifies subscribers", async () => {
      const listener = jest.fn();
      store.subscribe(listener);
      await store.appendLocal("test");
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("appendBotMessage", () => {
    beforeEach(async () => {
      setupEmptyVault();
      await store.initialize();
      store.setAllowedChatIds([111]);
      await store.appendInbound(makeUpdate(1, 111));
    });

    it("defaults source to 'telegram'", async () => {
      await store.appendBotMessage("hello from bot", 111);
      const msgs = store.getVisibleMessages();
      const botMessage = msgs[msgs.length - 1];
      expect(botMessage.source).toBe("telegram");
      expect(botMessage.sender_type).toBe("bot");
    });

    it("supports explicit local-only bot source 'obsidian'", async () => {
      await store.appendBotMessage("local-only bot reply", 111, "obsidian");
      const msgs = store.getVisibleMessages();
      const botMessage = msgs[msgs.length - 1];
      expect(botMessage.source).toBe("obsidian");
      expect(botMessage.sender_type).toBe("bot");
    });
  });

  describe("updateMessagePromptState", () => {
    beforeEach(async () => {
      setupEmptyVault();
      await store.initialize();
      store.setAllowedChatIds([111]);
    });

    it("stores processed prompt state on an existing thread message", async () => {
      const stored = await store.appendInbound(makeUpdate(1, 111));
      expect(stored).not.toBeNull();

      await store.updateMessagePromptState(
        {
          chat_id: 111,
          local_id: stored!.local_id,
          update_id: stored!.update_id,
          message_id: stored!.message_id,
        },
        {
          processedText: "hello\n\n[Attached file: lecture_03.pdf]\nPage text",
          contextEnvelope: {
            version: 1,
            conversationId: null,
            messageId: null,
            layers: [],
            serializedText: "hello\n\n[Attached file: lecture_03.pdf]\nPage text",
            layerHashes: {} as any,
            combinedHash: "",
          },
        }
      );

      const updated = store.getVisibleMessages()[0];
      expect(updated.processedText).toContain("Page text");
      expect(updated.contextEnvelope?.serializedText).toContain("Page text");
    });
  });

  describe("resetView", () => {
    beforeEach(async () => {
      setupEmptyVault();
      await store.initialize();
      store.setAllowedChatIds([111]);
    });

    it("hides pre-reset messages from getVisibleMessages", async () => {
      await store.appendInbound(makeUpdate(1, 111));
      await store.resetView();
      expect(store.getVisibleMessages()).toHaveLength(0);
    });

    it("keeps pre-reset messages in thread (disk not modified via remove)", async () => {
      await store.appendInbound(makeUpdate(1, 111));
      const beforeReset = mockAdapter.write.mock.calls.length;
      await store.resetView();
      // reset_at written to meta; thread file should NOT have shrunk
      const writtenPaths = mockAdapter.write.mock.calls.map(([p]: [string]) => p);
      const threadWrites = writtenPaths.filter((p: string) => p.includes("thread.json"));
      // thread.json is only written by appendInbound, not by resetView
      expect(threadWrites.length).toBeLessThanOrEqual(beforeReset);
    });

    it("post-reset messages remain visible", async () => {
      await store.appendInbound(makeUpdate(1, 111));
      await store.resetView();
      await store.appendInbound(makeUpdate(2, 111));
      expect(store.getVisibleMessages()).toHaveLength(1);
    });

    it("notifies subscribers", async () => {
      const listener = jest.fn();
      store.subscribe(listener);
      await store.resetView();
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("resetForNewBot", () => {
    it("resets offset and primary_chat_id but keeps message files", async () => {
      setupEmptyVault();
      await store.initialize();
      await store.appendInbound(makeUpdate(1, 111));
      await store.resetForNewBot(42);
      const meta = store.getMeta();
      expect(meta.bot_id).toBe(42);
      expect(meta.offset).toBe(0);
      expect(meta.primary_chat_id).toBeNull();
      expect(meta.reset_at).toBe(0);
    });
  });

  describe("subscribe / unsubscribe", () => {
    beforeEach(async () => {
      setupEmptyVault();
      await store.initialize();
      store.setAllowedChatIds([111]);
      await store.appendInbound(makeUpdate(1, 111));
    });

    it("unsubscribe stops notifications", async () => {
      const listener = jest.fn();
      const unsub = store.subscribe(listener);
      unsub();
      await store.appendLocal("test");
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("setOnLocalMessage", () => {
    it("clears the callback when called with null so appendLocal no longer fires it", async () => {
      setupEmptyVault();
      const store = new TelegramStore();
      await store.initialize();
      // bind a chat id so appendLocal does not throw
      store.setAllowedChatIds([100]);
      await store.appendInbound(makeUpdate(1, 100));

      const handler = jest.fn();
      store.setOnLocalMessage(handler);
      await store.appendLocal("first");
      expect(handler).toHaveBeenCalledTimes(1);

      store.setOnLocalMessage(null);
      await store.appendLocal("second");
      expect(handler).toHaveBeenCalledTimes(1); // must NOT increase
    });
  });

  describe("non-text message handling", () => {
    beforeEach(async () => {
      setupEmptyVault();
      await store.initialize();
      store.setAllowedChatIds([111]);
    });

    it("stores [photo] stub for photo messages", async () => {
      const update: TelegramUpdate = {
        update_id: 5,
        message: {
          message_id: 50,
          from: { id: 9999, first_name: "Bob" },
          chat: { id: 111, type: "private" },
          date: Math.floor(Date.now() / 1000),
          photo: [{ file_id: "abc", file_unique_id: "uabc", width: 100, height: 100 }],
        },
      };
      await store.appendInbound(update);
      expect(store.getVisibleMessages()[0].text).toBe("[photo]");
    });
  });

  describe("readThread backfill", () => {
    it("backfills local_id without throwing when crypto.randomUUID is unavailable", async () => {
      // Simulate runtime without crypto.randomUUID
      const originalCrypto = global.crypto;
      try {
        Object.defineProperty(global, "crypto", {
          value: undefined,
          configurable: true,
        });

        const freshStore = new TelegramStore();
        mockAdapter.exists.mockResolvedValue(true);
        mockAdapter.mkdir.mockResolvedValue(undefined);
        mockAdapter.write.mockResolvedValue(undefined);
        // Return a thread entry missing local_id, with primary_chat_id bound so message is visible
        mockAdapter.read.mockImplementation(async (path: string) => {
          if (path.includes("thread.json")) {
            return JSON.stringify([
              {
                chat_id: 100,
                sender_name: "Bot",
                sender_type: "bot",
                source: "telegram",
                text: "hello",
                date: 0,
                stored_at: 0,
                // no local_id
              },
            ]);
          }
          if (path.includes("meta.json")) {
            return JSON.stringify({ bot_id: 0, offset: 0, primary_chat_id: 100, reset_at: 0 });
          }
          return "[]";
        });

        // Should not throw and should return a message with local_id set
        await expect(freshStore.initialize()).resolves.not.toThrow();
        const messages = freshStore.getVisibleMessages();
        // Without the fix, readThread throws internally and returns [] — messages would be empty
        expect(messages).toHaveLength(1);
        expect(messages[0].local_id).toBeDefined();
        expect(typeof messages[0].local_id).toBe("string");
      } finally {
        // Restore
        Object.defineProperty(global, "crypto", {
          value: originalCrypto,
          configurable: true,
        });
      }
    });
  });
});
