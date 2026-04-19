# Telegram Channel Integration — Progress Report

**Branch:** `telegram-channel`
**Date:** 2026-04-19
**Status:** Phase 1 complete — build passing, all 36 tests green

---

## What Was Built

The Telegram channel is a new, isolated input path that sits entirely outside the existing
`ChatManager` / `MessageRepository` / `ChatUIState` pipeline. It adds a fifth chain type,
`TELEGRAM_CHAIN`, and gives the user a single always-on thread that receives messages from
both Telegram and the Obsidian input bar.

---

## Phases Completed

### Phase 0 — Scaffolding

- Added `ChainType.TELEGRAM_CHAIN = "telegram"` to `src/chainFactory.ts`
- Added `telegramEnabled: boolean` and `telegramBotApiKey: string` to settings model and
  `DEFAULT_SETTINGS` in `src/constants.ts`
- Registered a **Telegram** tab in `src/settings/v2/SettingsMainV2.tsx`
- Added a `TelegramSettings` component: toggle + password-masked token field + **Verify** button
  that calls `getMe` and shows the connected bot username on success
- Added **Telegram** to the chain dropdown (`BasicSettings.tsx`) and `SuggestedPrompts.tsx`
- Wired lifecycle into `src/main.ts`: construct + `start()` on load, `stop()` on unload,
  `restart()` on settings change — all behind `Platform.isDesktopApp`

### Phase 1a — Polling, Offset Safety, Bot Identity Guard

- `TelegramClient` — thin `fetch`-based wrapper for `getMe`, `getUpdates`, `deleteWebhook`
  - Error hierarchy: `TelegramUnauthorizedError`, `TelegramRateLimitError` (carries `retryAfter`),
    `TelegramNetworkError`
  - Token never written to logs; `redactToken()` used in all error messages
- `TelegramChannelService` — restartable poll loop (OpenClaw pattern)
  - Startup: `getMe` → load `meta.json` → bot-identity guard → `deleteWebhook` → poll cycle
  - Bot-identity guard: if `stored_bot_id !== fetched_bot_id`, resets offset + primary_chat_id
    (keeps message files intact)
  - Recoverable errors (network, 429 + `retry_after`): bounded exponential backoff, max 60 s
  - Unrecoverable 401: loop stops immediately + `Notice` to user

### Phase 1b — Store, Thread View, Bidirectional Input, Reset

- `TelegramStore` — append-only log backed by vault adapter JSON files
  - Storage layout under `.copilot/telegram-state/`:
    - `meta.json` — `{ bot_id, offset, primary_chat_id, reset_at }`
    - `thread.json` — primary chat messages (append-only, never deleted)
    - `other-chats/<chatId>.json` — non-primary chat messages (stored, not rendered)
  - **Idempotent append** by `update_id` prevents duplicates on crash/re-delivery
  - **Store-then-commit ordering**: all message files written before `meta.json` offset advances;
    crash before `meta.json` write → re-delivery → idempotent absorb
  - **Auto-bind**: first inbound update sets `meta.primary_chat_id`; subsequent inbound routes
    by chat id
  - **`resetView()`**: advances `reset_at = Date.now() + 1`; `getVisibleMessages()` filters
    `stored_at >= reset_at`; `thread.json` is never truncated
- `TelegramChatView` — React component, subscribes to store
  - Single thread, no history list, no session switching
  - All **user** messages (`sender_type === "user"`) render right-aligned (accent background),
    regardless of source (`"telegram"` or `"obsidian"`)
  - Bot messages render left-aligned
  - Empty state: "DM your bot to begin" when `primary_chat_id === null`
  - Input bar: Enter sends, calls `store.appendLocal(text)` — no outbound Telegram traffic in
    Phase 1
- `Chat.tsx` branches on `TELEGRAM_CHAIN` → renders `<TelegramChatView>`, hides history sidebar
- `ChatControls.tsx` hides save, history, and settings buttons when in Telegram mode; "New"
  button calls `store.resetView()`

---

## Files Added

| File | Purpose |
|------|---------|
| `src/channels/telegram/TelegramTypes.ts` | `TelegramStoredMessage`, `TelegramMeta`, Telegram API DTOs |
| `src/channels/telegram/TelegramClient.ts` | `fetch`-based Bot API client |
| `src/channels/telegram/TelegramStore.ts` | Persistent append-only store |
| `src/channels/telegram/TelegramChannelService.ts` | Poll lifecycle manager |
| `src/channels/telegram/TelegramChatView.tsx` | React thread view + input bar |
| `src/settings/v2/components/TelegramSettings.tsx` | Settings tab (toggle + token + verify) |
| `src/channels/telegram/__tests__/TelegramClient.test.ts` | 12 unit tests |
| `src/channels/telegram/__tests__/TelegramStore.test.ts` | 18 unit tests |
| `src/channels/telegram/__tests__/TelegramChannelService.test.ts` | 7 unit tests |

## Files Modified

| File | Change |
|------|--------|
| `src/chainFactory.ts` | Added `TELEGRAM_CHAIN = "telegram"` |
| `src/settings/model.ts` | Added `telegramEnabled`, `telegramBotApiKey` fields |
| `src/constants.ts` | Added defaults for both fields |
| `src/main.ts` | Lifecycle wiring for `TelegramChannelService` |
| `src/settings/v2/SettingsMainV2.tsx` | Registered Telegram settings tab |
| `src/settings/v2/components/BasicSettings.tsx` | Added Telegram to chain dropdown |
| `src/components/chat-components/SuggestedPrompts.tsx` | Added `TELEGRAM_CHAIN` entry to `PROMPT_KEYS` |
| `src/components/chat-components/ChatControls.tsx` | Hide/adapt controls for Telegram mode |
| `src/components/Chat.tsx` | Branch render for `TELEGRAM_CHAIN` |

---

## Test Results

```
Test Suites: 3 passed
Tests:       36 passed (12 client + 18 store + 7 service)
```

Key scenarios covered: idempotent append, bot-identity guard reset, primary-chat auto-bind,
non-primary routing to `other-chats/`, `resetView()` cursor advance, pre/post-reset visibility,
401 stops loop + Notice, store-then-commit offset ordering, mobile no-op.

---

## Build Status

`npm run build` — clean (0 TypeScript errors, 0 lint errors)

---

## Architectural Invariants

- `ChatManager`, `MessageRepository`, `ChatUIState`, `ContextManager`, `ChatPersistenceManager`
  are **untouched** — Telegram is a fully isolated path
- `telegramBotApiKey` auto-encrypts via the `apikey`-substring rule in `encryptionService.ts`
- All logging uses `logInfo`/`logWarn`/`logError`; no `console.log`

---

## Backlog (not built)

| Phase | Feature |
|-------|---------|
| 2 | Outbound send: Obsidian-typed messages echoed back to Telegram |
| 2 | Primary-chat-rebind UI in settings |
| 2 | `telegramAllowedChatIds` allowlist |
| 3 | AI auto-response (`TelegramChainRunner`) using archived reset segments as context |
| 4 | Multi-chat UI (surfacing `other-chats/` entries) |
| 5 | Webhook mode |
