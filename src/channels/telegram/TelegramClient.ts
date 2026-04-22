import { logInfo, logWarn } from "@/logger";
import { requestUrl } from "obsidian";
import type { TelegramBotInfo, TelegramUpdate } from "./TelegramTypes";

type TelegramChatAction = "typing";
type TelegramParseMode = "HTML" | "MarkdownV2";

interface TelegramSendMessageOptions {
  parseMode?: TelegramParseMode;
}

/** Token-redacted string used in all log/error messages. */
function redactToken(token: string): string {
  if (!token || token.length < 8) return "[REDACTED]";
  return token.slice(0, 4) + "...[REDACTED]";
}

/**
 * Thin wrapper around the Telegram Bot API.
 * Uses native fetch + AbortController to match the codebase convention.
 * The raw token is NEVER logged; all error messages use redactToken().
 */
export class TelegramClient {
  private readonly baseUrl: string;
  private readonly redactedId: string;

  constructor(private readonly token: string) {
    this.baseUrl = `https://api.telegram.org/bot${token}`;
    this.redactedId = redactToken(token);
  }

  /** Returns basic info about the bot. */
  async getMe(): Promise<TelegramBotInfo> {
    const resp = await fetch(`${this.baseUrl}/getMe`);
    const data = await resp.json();
    if (!data.ok) {
      throw new TelegramApiError(
        data.error_code ?? 0,
        data.description ?? "getMe failed",
        this.redactedId
      );
    }
    return data.result as TelegramBotInfo;
  }

  /**
   * Long-polls for updates.
   * @param offset - Exclude updates earlier than this. Pass 0 for first call.
   * @param timeout - Server-side timeout in seconds (default: 25).
   * @param signal - AbortSignal to cancel the request.
   */
  async getUpdates(offset: number, timeout = 25, signal?: AbortSignal): Promise<TelegramUpdate[]> {
    const url = `${this.baseUrl}/getUpdates?offset=${offset}&timeout=${timeout}&allowed_updates=["message"]`;
    const clientTimeout = (timeout + 5) * 1000; // 5s padding beyond server timeout

    const controller = signal ? undefined : new AbortController();
    const effectiveSignal = signal ?? controller!.signal;
    const timer = controller ? setTimeout(() => controller.abort(), clientTimeout) : undefined;

    try {
      const resp = await fetch(url, { signal: effectiveSignal });
      if (timer !== undefined) clearTimeout(timer);

      if (resp.status === 429) {
        const retryAfter = Number(resp.headers.get("Retry-After") ?? 5);
        throw new TelegramRateLimitError(retryAfter);
      }

      if (resp.status === 401) {
        throw new TelegramUnauthorizedError(this.redactedId);
      }

      const data = await resp.json();
      if (!data.ok) {
        throw new TelegramApiError(
          data.error_code ?? 0,
          data.description ?? "getUpdates failed",
          this.redactedId
        );
      }

      return data.result as TelegramUpdate[];
    } catch (err) {
      if (timer !== undefined) clearTimeout(timer);
      if (
        err instanceof TelegramRateLimitError ||
        err instanceof TelegramUnauthorizedError ||
        err instanceof TelegramApiError
      ) {
        throw err;
      }
      // AbortError or network error — rethrow as recoverable
      throw new TelegramNetworkError(String((err as Error).message ?? err));
    }
  }

  /**
   * Removes any existing webhook so long-polling can work.
   * @param dropPending - If true, pending updates are discarded.
   */
  async deleteWebhook(dropPending = false): Promise<void> {
    const url = `${this.baseUrl}/deleteWebhook?drop_pending_updates=${dropPending}`;
    const resp = await fetch(url, { method: "POST" });
    const data = await resp.json();
    if (!data.ok) {
      logWarn(`[Telegram ${this.redactedId}] deleteWebhook failed:`, data.description);
    } else {
      logInfo(`[Telegram ${this.redactedId}] Webhook deleted.`);
    }
  }

  /**
   * Resolves a file_id to a server-side file_path (relative, no token).
   */
  async getFile(fileId: string): Promise<string> {
    const resp = await fetch(`${this.baseUrl}/getFile?file_id=${encodeURIComponent(fileId)}`);
    if (resp.status === 401) throw new TelegramUnauthorizedError(this.redactedId);
    const data = await resp.json();
    if (!data.ok) {
      throw new TelegramApiError(
        data.error_code ?? 0,
        data.description ?? "getFile failed",
        this.redactedId
      );
    }
    return data.result.file_path as string;
  }

  /**
   * Downloads a Telegram file and returns its raw bytes.
   * @param filePath - The file_path returned by getFile().
   */
  async downloadFileAsArrayBuffer(filePath: string): Promise<ArrayBuffer> {
    const url = `https://api.telegram.org/file/bot${this.token}/${filePath}`;
    try {
      const resp = await requestUrl({
        url,
        method: "GET",
        throw: false,
      });

      if (resp.status === 401) {
        throw new TelegramUnauthorizedError(this.redactedId);
      }

      if (resp.status < 200 || resp.status >= 300) {
        throw new TelegramApiError(
          resp.status,
          `Failed to download file (status ${resp.status})`,
          this.redactedId
        );
      }

      return resp.arrayBuffer;
    } catch (err) {
      if (err instanceof TelegramUnauthorizedError || err instanceof TelegramApiError) {
        throw err;
      }

      throw new TelegramNetworkError(String((err as Error).message ?? err));
    }
  }

  /**
   * Sends a text message to a Telegram chat.
   * Plain-text sends are automatically chunked at the 4096-character Bot API limit.
   * Rich formatted sends must already be pre-chunked so HTML/Markdown entities are
   * never split across requests.
   * @param chatId - Telegram chat ID to send to.
   * @param text - The message text to send.
   * @param options - Optional Telegram delivery options such as parse mode.
   */
  async sendMessage(
    chatId: number,
    text: string,
    options?: TelegramSendMessageOptions
  ): Promise<void> {
    const CHUNK_SIZE = 4096;
    const chunks: string[] = [];

    if (options?.parseMode) {
      if (text.length > CHUNK_SIZE) {
        throw new Error(
          "Formatted Telegram messages must be pre-chunked before sendMessage is called."
        );
      }
      chunks.push(text);
    } else {
      for (let i = 0; i < text.length; i += CHUNK_SIZE) {
        chunks.push(text.slice(i, i + CHUNK_SIZE));
      }
    }

    for (const chunk of chunks) {
      const url = `${this.baseUrl}/sendMessage`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunk,
          ...(options?.parseMode ? { parse_mode: options.parseMode } : {}),
        }),
      });
      if (resp.status === 401) {
        throw new TelegramUnauthorizedError(this.redactedId);
      }
      if (resp.status === 429) {
        const retryAfter = Number(resp.headers.get("Retry-After") ?? 5);
        throw new TelegramRateLimitError(retryAfter);
      }
      const data = await resp.json();
      if (!data.ok) {
        throw new TelegramApiError(
          data.error_code ?? 0,
          data.description ?? "sendMessage failed",
          this.redactedId
        );
      }
    }
  }

  /**
   * Sends a transient chat action to Telegram, such as "typing".
   * Telegram clears these indicators automatically after a short period, so
   * callers should heartbeat them while long generations are in progress.
   * @param chatId - Telegram chat ID to update.
   * @param action - Bot API chat action identifier.
   */
  async sendChatAction(chatId: number, action: TelegramChatAction): Promise<void> {
    const url = `${this.baseUrl}/sendChatAction`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action }),
    });
    if (resp.status === 401) {
      throw new TelegramUnauthorizedError(this.redactedId);
    }
    if (resp.status === 429) {
      const retryAfter = Number(resp.headers.get("Retry-After") ?? 5);
      throw new TelegramRateLimitError(retryAfter);
    }
    const data = await resp.json();
    if (!data.ok) {
      throw new TelegramApiError(
        data.error_code ?? 0,
        data.description ?? "sendChatAction failed",
        this.redactedId
      );
    }
  }
}

// ─── Error types ─────────────────────────────────────────────────────────────

export class TelegramApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    redactedId: string
  ) {
    super(`[Telegram ${redactedId}] API error ${code}: ${message}`);
    this.name = "TelegramApiError";
  }
}

/** HTTP 429 — caller should back off by retry_after seconds. */
export class TelegramRateLimitError extends Error {
  constructor(public readonly retryAfter: number) {
    super(`[Telegram] Rate limited. Retry after ${retryAfter}s.`);
    this.name = "TelegramRateLimitError";
  }
}

/** HTTP 401 — token is invalid. Unrecoverable. */
export class TelegramUnauthorizedError extends Error {
  constructor(redactedId: string) {
    super(`[Telegram ${redactedId}] Unauthorized (401). Check your bot token.`);
    this.name = "TelegramUnauthorizedError";
  }
}

/** Network or abort error — recoverable with backoff. */
export class TelegramNetworkError extends Error {
  constructor(message: string) {
    super(`[Telegram] Network error: ${message}`);
    this.name = "TelegramNetworkError";
  }
}
