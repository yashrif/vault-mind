# Telegram Channel Integration — Progress Report

**Branch:** `telegram-channel`
**Date:** 2026-04-19 → 2026-04-19
**Status:** Phase 2a complete — AI auto-reply via agentic chain, build passing, all 42 tests green

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

### Phase 2a — AI Auto-Reply via Agentic Chain

- `TelegramClient.sendMessage(chatId, text)` — posts reply to Bot API
  - Chunks text at 4096-char boundary (Bot API limit)
  - Throws `TelegramUnauthorizedError`, `TelegramRateLimitError`, `TelegramApiError` on failures
- `TelegramStore.appendBotMessage(text)` — stores bot reply with `sender_type: "bot"`, `source: "telegram"`
  - Persists to `thread.json` so replies render in `TelegramChatView`
- `TelegramStore.setOnLocalMessage(handler)` — callback fired when user types in Obsidian UI
  - Routes obsidian-source messages to AI agent
- `TelegramAgent` — orchestrator for AI replies
  - Constructor takes `(client, store, chainManager)`
  - `enqueueReply(msg)` — queues message for processing, ignores bot-source only
  - Replies to both telegram-source (from Bot API) and obsidian-source (Obsidian UI) messages
  - Rehydrates `MemoryManager` from visible thread before each `runChain` call for multi-turn context
  - Serial promise queue — one reply at a time, in order
  - On chain success: sends result via `client.sendMessage`, stores via `store.appendBotMessage`
  - On chain error: sends fallback error message to Telegram, does NOT store reply
- `TelegramChannelService.setAgent(agent)` — attaches agent + registers local-message handler
  - `onMessageStored` routes inbound Telegram messages to agent
  - `agent.enqueueReply` called for both polling arrivals and obsidian-typed messages
- `ChainManager.getChainRunner()` — added `ChainType.TELEGRAM_CHAIN` case
  - Routes to `AutonomousAgentChainRunner` or `ToolChainRunner` based on `enableAutonomousAgent` setting
  - Allows `runChain` to work when Telegram view is active
- Main.ts wiring — constructs `TelegramAgent` after service start
  - Wired in both plugin load path and settings-change restart path
  - Passes current `ChainManager` from `projectManager.getCurrentChainManager()`
  - On `restart()`, clears agent and creates fresh instance with new client/token

---

## Files Added

| File | Purpose |
|------|---------|
| `src/channels/telegram/TelegramTypes.ts` | `TelegramStoredMessage`, `TelegramMeta`, Telegram API DTOs |
| `src/channels/telegram/TelegramClient.ts` | `fetch`-based Bot API client |
| `src/channels/telegram/TelegramStore.ts` | Persistent append-only store |
| `src/channels/telegram/TelegramChannelService.ts` | Poll lifecycle manager |
| `src/channels/telegram/TelegramChatView.tsx` | React thread view + input bar |
| `src/channels/telegram/TelegramAgent.ts` | AI reply orchestrator (Phase 2a) |
| `src/settings/v2/components/TelegramSettings.tsx` | Settings tab (toggle + token + verify) |
| `src/channels/telegram/__tests__/TelegramClient.test.ts` | 12 unit tests |
| `src/channels/telegram/__tests__/TelegramStore.test.ts` | 18 unit tests |
| `src/channels/telegram/__tests__/TelegramChannelService.test.ts` | 7 unit tests |
| `src/channels/telegram/__tests__/TelegramAgent.test.ts` | 6 unit tests (Phase 2a) |

## Files Modified

| File | Change |
|------|--------|
| `src/chainFactory.ts` | Added `TELEGRAM_CHAIN = "telegram"` |
| `src/settings/model.ts` | Added `telegramEnabled`, `telegramBotApiKey` fields |
| `src/constants.ts` | Added defaults for both fields |
| `src/main.ts` | Lifecycle wiring for `TelegramChannelService` + Phase 2a agent wiring |
| `src/settings/v2/SettingsMainV2.tsx` | Registered Telegram settings tab |
| `src/settings/v2/components/BasicSettings.tsx` | Added Telegram to chain dropdown |
| `src/components/chat-components/SuggestedPrompts.tsx` | Added `TELEGRAM_CHAIN` entry to `PROMPT_KEYS` |
| `src/components/chat-components/ChatControls.tsx` | Hide/adapt controls for Telegram mode |
| `src/components/Chat.tsx` | Branch render for `TELEGRAM_CHAIN` |
| `src/channels/telegram/TelegramClient.ts` | Added `sendMessage(chatId, text)` method (Phase 2a) |
| `src/channels/telegram/TelegramStore.ts` | Added `appendBotMessage(text)`, `setOnLocalMessage(handler)` (Phase 2a) |
| `src/channels/telegram/TelegramChannelService.ts` | Added `agent` field, `setAgent()`, `onMessageStored` dispatch (Phase 2a) |
| `src/LLMProviders/chainManager.ts` | Added `ChainType.TELEGRAM_CHAIN` case in `getChainRunner()` (Phase 2a) |

---

## Test Results

```
Test Suites: 4 passed
Tests:       42 passed (12 client + 18 store + 7 service + 6 agent [Phase 2a])
```

**Phase 1 scenarios:** idempotent append, bot-identity guard reset, primary-chat auto-bind,
non-primary routing to `other-chats/`, `resetView()` cursor advance, pre/post-reset visibility,
401 stops loop + Notice, store-then-commit offset ordering, mobile no-op.

**Phase 2a scenarios (TelegramAgent):**
- Ignores bot-source messages (prevents reply loops)
- Processes both telegram-source (from Bot API) and obsidian-source (UI) messages
- Serial queue enforcement — second message waits for first to complete
- Chain success: calls `client.sendMessage` then `store.appendBotMessage`
- Chain error: calls fallback `client.sendMessage` without storing reply
- Memory history exclusion — current message filtered from context

---

## Build Status

`npm run build` — clean (0 TypeScript errors, 0 lint errors)

---

## Architectural Invariants

- `ChatManager`, `MessageRepository`, `ChatUIState`, `ContextManager`, `ChatPersistenceManager`
  are **untouched** — Telegram is a fully isolated path
- `telegramBotApiKey` auto-encrypts via the `apikey`-substring rule in `encryptionService.ts`
- All logging uses `logInfo`/`logWarn`/`logError`; no `console.log`

## Known Limitations (Phase 2a)

- **Memory pollution**: `MemoryManager` is a plugin-wide singleton. Telegram replies rehydrate it from the thread before each chain call; the UI chat rehydrates it before its calls. If both run concurrently during a brief window, one overwrites the other's history. Mitigated by:
  - Single-user plugin (no concurrent interactions expected)
  - UI chat regenerates memory on next send/regenerate
  - **Future fix**: Phase 3 will create isolated MemoryManager per channel

- **No message streaming to Telegram**: Bot replies only sent once (final text), not chunked as streamed. Reduces API cost and prevents partial responses looking unfinished.

---

## Backlog (not built)

| Phase | Feature | Notes |
|-------|---------|-------|
| 2b | Outbound echo: obsidian-typed messages relayed back to Telegram | Separate from AI replies; for message sync |
| 2b | Markdown `parse_mode` for bot replies | Phase 2a ships plain text only |
| 2b | Streaming partial replies to Telegram | Edit message as AI responds — deferred for cost/complexity |
| 3 | Dedicated Telegram memory isolation | Phase 2a shares singleton MemoryManager; rehydrates per-call |
| 3 | Primary-chat-rebind UI in settings | Allow user to switch primary chat without re-binding |
| 3 | `telegramAllowedChatIds` allowlist | Restrict replies to specific chats |
| 4 | Multi-chat UI (surfacing `other-chats/` entries) | Display conversations from non-primary chats |
| 5 | Webhook mode | Replace polling with push notifications |

---

## Review Logs (2026-04-20)

### Log 01 — External baseline (`openclaw-telegram-channel-report.md`)
- Established reliability target: restartable polling cycles, strict offset safety, dedupe, webhook hardening, and idempotency-aware retry boundaries.
- Recommended adapter-first architecture and phased rollout (foundation → inbound → end-to-end → hardening → groups/topics → webhook).

### Log 02 — First deep review (`telegram-channel-review-analysis.md`)
- Flagged critical memory isolation risk from shared memory pointer mutation and major context-quality risk from `update_id`-based exclusion.
- Requested lifecycle cleanup for isolated memory subscriptions and stronger outbound/send-path tests.
- Status at this point: **Request Changes**.

### Log 03 — Follow-up fixes (`telegram-channel-review-analysis-2.md`)
- Fixed: explicit allowlist binding, obsidian-source reply behavior, pre-bind local-send guard, true exponential backoff, serialized store writes, and cold-start allowlist revalidation.
- Planned then tracked: channel-scoped memory isolation and explicit Telegram chain scoping API.
- Test snapshot updated to 4 suites / 45 tests passing.

### Log 04 — Isolation/onboarding review (`telegram-channel-review-findings.md`)
- Confirmed: request-scoped memory override wiring, fallback persistence behavior, and onboarding visibility improvements.
- Reported remaining gaps at that time: agent disposal lifecycle, legacy `local_id` normalization, and additional coverage/doc alignment.
- Status at this point: **Request Changes**.

### Log 05 — Agentic integration review (`telegram-agentic-integration-review-report.md`)
- Confirmed agentic routing correctness through `TELEGRAM_CHAIN` with isolated request-scoped memory.
- Raised two key issues: stale local callback path after disable and allowlist parsing edge case (`0` from empty tokens).
- Full validation snapshot captured: 102 suites / 1918 tests passing.

### Log 06 — Current closure update
- User-confirmed fix applied for the reported blocking issue.
- Consolidated state: Telegram channel is functionally stable with review-driven hardening applied; remaining backlog items stay in Phase 2b+ and Phase 3+ scope above.
