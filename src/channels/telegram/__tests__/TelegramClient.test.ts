jest.mock("@/logger", () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as any;

import {
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
});
