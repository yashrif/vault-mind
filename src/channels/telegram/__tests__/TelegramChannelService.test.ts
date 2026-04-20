jest.mock("@/logger", () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

// Mock Platform.isDesktopApp = true
jest.mock("obsidian", () => ({
  Platform: { isDesktopApp: true },
  Notice: jest.fn(),
}));

// Mock TelegramClient methods
const mockGetMe = jest.fn();
const mockGetUpdates = jest.fn();
const mockDeleteWebhook = jest.fn();

jest.mock("../TelegramClient", () => ({
  TelegramClient: jest.fn().mockImplementation(() => ({
    getMe: mockGetMe,
    getUpdates: mockGetUpdates,
    deleteWebhook: mockDeleteWebhook,
  })),
  TelegramUnauthorizedError: class TelegramUnauthorizedError extends Error {
    constructor(id: string) {
      super(id);
      this.name = "TelegramUnauthorizedError";
    }
  },
  TelegramRateLimitError: class TelegramRateLimitError extends Error {
    retryAfter: number;
    constructor(r: number) {
      super("rate limited");
      this.name = "TelegramRateLimitError";
      this.retryAfter = r;
    }
  },
  TelegramNetworkError: class TelegramNetworkError extends Error {
    constructor(m: string) {
      super(m);
      this.name = "TelegramNetworkError";
    }
  },
}));

// Mock TelegramStore
const mockStoreInitialize = jest.fn();
const mockGetMeta = jest.fn();
const mockSetOffset = jest.fn();
const mockResetForNewBot = jest.fn();
const mockAppendInbound = jest.fn();
const mockSetAllowedChatIds = jest.fn();
const mockSetOnLocalMessage = jest.fn();

jest.mock("../TelegramStore", () => ({
  TelegramStore: jest.fn().mockImplementation(() => ({
    initialize: mockStoreInitialize,
    getMeta: mockGetMeta,
    setOffset: mockSetOffset,
    resetForNewBot: mockResetForNewBot,
    appendInbound: mockAppendInbound,
    setAllowedChatIds: mockSetAllowedChatIds,
    setOnLocalMessage: mockSetOnLocalMessage,
  })),
}));

import { TelegramChannelService } from "../TelegramChannelService";
import { TelegramUnauthorizedError } from "../TelegramClient";
import { Notice, Platform } from "obsidian";

const BOT_INFO = { id: 7, first_name: "TestBot", username: "testbot", is_bot: true as const };

describe("TelegramChannelService", () => {
  let service: TelegramChannelService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    service = new TelegramChannelService("test-token");
    mockStoreInitialize.mockResolvedValue(undefined);
    mockGetMe.mockResolvedValue(BOT_INFO);
    mockDeleteWebhook.mockResolvedValue(undefined);
    mockGetMeta.mockReturnValue({ bot_id: 7, offset: 0, primary_chat_id: null, reset_at: 0 });
    mockSetOffset.mockResolvedValue(undefined);
    mockResetForNewBot.mockResolvedValue(undefined);
    mockGetUpdates.mockResolvedValue([]);
  });

  afterEach(() => {
    service.stop();
    jest.useRealTimers();
  });

  it("is a no-op on mobile (Platform.isDesktopApp = false)", async () => {
    (Platform as any).isDesktopApp = false;
    await service.start();
    expect(mockStoreInitialize).not.toHaveBeenCalled();
    (Platform as any).isDesktopApp = true;
  });

  it("re-applies allowlist after store initialize", async () => {
    expect(mockSetAllowedChatIds).toHaveBeenCalledTimes(1);
    expect(mockSetAllowedChatIds).toHaveBeenLastCalledWith([]);

    await service.start();

    expect(mockStoreInitialize).toHaveBeenCalledTimes(1);
    expect(mockSetAllowedChatIds).toHaveBeenCalledTimes(2);
    expect(mockSetAllowedChatIds).toHaveBeenLastCalledWith([]);
  });

  it("runs startup sequence: getMe → deleteWebhook", async () => {
    await service.start();
    expect(mockGetMe).toHaveBeenCalledTimes(1);
    expect(mockDeleteWebhook).toHaveBeenCalledTimes(1);
    // setOffset only called if bot_id === 0 (new install) — not for matching ids
    expect(mockResetForNewBot).not.toHaveBeenCalled();
  });

  it("resets store when bot_id changes", async () => {
    mockGetMeta.mockReturnValue({ bot_id: 999, offset: 100, primary_chat_id: 1, reset_at: 0 });
    await service.start();
    expect(mockResetForNewBot).toHaveBeenCalledWith(7);
  });

  it("stops loop and fires Notice on 401", async () => {
    mockGetMe.mockRejectedValueOnce(new TelegramUnauthorizedError("redacted-id"));
    await service.start();
    expect(Notice).toHaveBeenCalled();
    // Should not be running
    expect((service as any).running).toBe(false);
  });

  it("advances offset after successful poll batch (store-then-commit)", async () => {
    const updates = [
      {
        update_id: 1,
        message: { message_id: 10, chat: { id: 1 }, date: 0, from: { id: 2, first_name: "A" } },
      },
      {
        update_id: 2,
        message: { message_id: 11, chat: { id: 1 }, date: 0, from: { id: 2, first_name: "A" } },
      },
    ];
    mockGetUpdates.mockResolvedValueOnce(updates).mockResolvedValue([]);
    mockAppendInbound.mockResolvedValue(null);
    // Directly invoke the poll cycle without going through start() / timers
    (service as any).running = true;
    await (service as any).runPollCycle();

    expect(mockSetOffset).toHaveBeenCalledWith(7, 3); // max update_id + 1
  });

  it("stops cleanly via stop()", async () => {
    await service.start();
    service.stop();
    expect((service as any).running).toBe(false);
  });

  it("restart() changes token and restarts", async () => {
    await service.start();
    await service.restart("new-token");
    // Should have started twice in total
    expect(mockStoreInitialize).toHaveBeenCalledTimes(2);
  });

  it("stop() disposes the current agent", async () => {
    const mockAgent = { dispose: jest.fn(), enqueueReply: jest.fn() };
    service.setAgent(mockAgent as any);
    (service as any).running = true;
    service.stop();
    expect(mockAgent.dispose).toHaveBeenCalledTimes(1);
  });

  it("setAgent() disposes the previous agent before replacing", () => {
    const firstAgent = { dispose: jest.fn(), enqueueReply: jest.fn() };
    const secondAgent = { dispose: jest.fn(), enqueueReply: jest.fn() };

    service.setAgent(firstAgent as any);
    service.setAgent(secondAgent as any);

    expect(firstAgent.dispose).toHaveBeenCalledTimes(1);
    expect(secondAgent.dispose).not.toHaveBeenCalled();
  });

  it("clears the store onLocalMessage callback when stopped", () => {
    (service as any).running = true;
    service.stop();
    expect(mockSetOnLocalMessage).toHaveBeenCalledWith(null);
  });
});
