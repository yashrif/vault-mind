jest.mock("@/logger", () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

const mockRequestUrl = jest.fn();
jest.mock("obsidian", () => ({
  requestUrl: mockRequestUrl,
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as any;

import {
  TelegramApiError,
  TelegramClient,
  TelegramNetworkError,
  TelegramRateLimitError,
  TelegramUnauthorizedError,
} from "../TelegramClient";

const TOKEN = "123456:TESTTOKEN";

function makeResponse(body: object, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k] ?? null },
    json: async () => body,
  };
}

function makeRequestUrlResponse(status = 200, arrayBuffer = new ArrayBuffer(0)) {
  return {
    status,
    arrayBuffer,
  };
}

describe("TelegramClient", () => {
  let client: TelegramClient;

  beforeEach(() => {
    client = new TelegramClient(TOKEN);
    mockFetch.mockReset();
  });

  describe("getMe", () => {
    it("returns bot info on success", async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({
          ok: true,
          result: { id: 1, first_name: "TestBot", username: "testbot", is_bot: true },
        })
      );
      const info = await client.getMe();
      expect(info.username).toBe("testbot");
    });

    it("throws TelegramApiError on API failure", async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({ ok: false, error_code: 400, description: "Bad Request" })
      );
      await expect(client.getMe()).rejects.toThrow("400");
    });
  });

  describe("getUpdates", () => {
    it("returns updates on success", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ ok: true, result: [{ update_id: 1 }] }));
      const updates = await client.getUpdates(0);
      expect(updates).toHaveLength(1);
      expect(updates[0].update_id).toBe(1);
    });

    it("throws TelegramRateLimitError on 429", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({}, 429, { "Retry-After": "10" }));
      await expect(client.getUpdates(0)).rejects.toBeInstanceOf(TelegramRateLimitError);
    });

    it("exposes retryAfter on 429", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({}, 429, { "Retry-After": "30" }));
      await expect(client.getUpdates(0)).rejects.toMatchObject({ retryAfter: 30 });
    });

    it("throws TelegramUnauthorizedError on 401", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({}, 401));
      await expect(client.getUpdates(0)).rejects.toBeInstanceOf(TelegramUnauthorizedError);
    });

    it("does not include raw token in error messages", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({}, 401));
      try {
        await client.getUpdates(0);
      } catch (err: any) {
        expect(err.message).not.toContain(TOKEN);
      }
    });

    it("throws TelegramNetworkError on fetch rejection", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network failure"));
      await expect(client.getUpdates(0)).rejects.toBeInstanceOf(TelegramNetworkError);
    });

    it("AbortController cancel surfaces as TelegramNetworkError", async () => {
      const controller = new AbortController();
      mockFetch.mockImplementationOnce(() => {
        controller.abort();
        return Promise.reject(new DOMException("Aborted", "AbortError"));
      });
      await expect(client.getUpdates(0, 25, controller.signal)).rejects.toBeInstanceOf(
        TelegramNetworkError
      );
    });
  });

  describe("deleteWebhook", () => {
    it("resolves without throwing on success", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ ok: true, result: true }));
      await expect(client.deleteWebhook()).resolves.toBeUndefined();
    });

    it("resolves without throwing on API failure (logs warning)", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ ok: false, description: "No webhook" }));
      await expect(client.deleteWebhook()).resolves.toBeUndefined();
    });
  });

  describe("downloadFileAsArrayBuffer", () => {
    it("downloads media bytes through requestUrl so renderer CORS does not block file saves", async () => {
      const bytes = Uint8Array.from([1, 2, 3, 4]).buffer;
      mockRequestUrl.mockResolvedValueOnce(makeRequestUrlResponse(200, bytes));

      await expect(client.downloadFileAsArrayBuffer("photos/file_1.jpg")).resolves.toBe(bytes);

      expect(mockRequestUrl).toHaveBeenCalledWith({
        url: `https://api.telegram.org/file/bot${TOKEN}/photos/file_1.jpg`,
        method: "GET",
        throw: false,
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("throws TelegramUnauthorizedError on 401", async () => {
      mockRequestUrl.mockResolvedValueOnce(makeRequestUrlResponse(401));

      await expect(client.downloadFileAsArrayBuffer("photos/file_1.jpg")).rejects.toBeInstanceOf(
        TelegramUnauthorizedError
      );
    });

    it("throws TelegramApiError on non-success status", async () => {
      mockRequestUrl.mockResolvedValueOnce(makeRequestUrlResponse(404));

      await expect(client.downloadFileAsArrayBuffer("photos/file_1.jpg")).rejects.toBeInstanceOf(
        TelegramApiError
      );
    });

    it("wraps requestUrl failures as TelegramNetworkError", async () => {
      mockRequestUrl.mockRejectedValueOnce(new Error("socket hang up"));

      await expect(client.downloadFileAsArrayBuffer("photos/file_1.jpg")).rejects.toBeInstanceOf(
        TelegramNetworkError
      );
    });
  });

  describe("sendMessage", () => {
    it("chunks plain text messages at the Bot API limit", async () => {
      mockFetch.mockResolvedValue(makeResponse({ ok: true, result: { message_id: 1 } }));

      await expect(client.sendMessage(42, "a".repeat(5000))).resolves.toBeUndefined();

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        `https://api.telegram.org/bot${TOKEN}/sendMessage`,
        expect.objectContaining({
          body: JSON.stringify({ chat_id: 42, text: "a".repeat(4096) }),
        })
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        `https://api.telegram.org/bot${TOKEN}/sendMessage`,
        expect.objectContaining({
          body: JSON.stringify({ chat_id: 42, text: "a".repeat(904) }),
        })
      );
    });

    it("includes parse_mode for rich HTML messages", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ ok: true, result: { message_id: 1 } }));

      await expect(
        client.sendMessage(42, "<b>Hello</b>", { parseMode: "HTML" })
      ).resolves.toBeUndefined();

      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.telegram.org/bot${TOKEN}/sendMessage`,
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: 42, text: "<b>Hello</b>", parse_mode: "HTML" }),
        })
      );
    });

    it("rejects oversized formatted messages that were not pre-chunked", async () => {
      await expect(client.sendMessage(42, "a".repeat(4097), { parseMode: "HTML" })).rejects.toThrow(
        "pre-chunked"
      );
    });
  });

  describe("sendChatAction", () => {
    it("posts typing status successfully", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ ok: true, result: true }));

      await expect(client.sendChatAction(42, "typing")).resolves.toBeUndefined();

      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.telegram.org/bot${TOKEN}/sendChatAction`,
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: 42, action: "typing" }),
        })
      );
    });

    it("throws TelegramRateLimitError on 429", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({}, 429, { "Retry-After": "7" }));

      await expect(client.sendChatAction(42, "typing")).rejects.toBeInstanceOf(
        TelegramRateLimitError
      );
    });

    it("throws TelegramUnauthorizedError on 401", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({}, 401));

      await expect(client.sendChatAction(42, "typing")).rejects.toBeInstanceOf(
        TelegramUnauthorizedError
      );
    });
  });
});
