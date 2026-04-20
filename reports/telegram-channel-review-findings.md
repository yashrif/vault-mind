# Telegram Isolation & Onboarding Review Findings

Date: 2026-04-20
Scope: Post-implementation review of strict Telegram memory isolation, fallback persistence, and guided onboarding updates.

## Summary
The implementation is substantially improved and most core fixes are in place, including request-scoped memory override wiring and fallback message persistence. Telegram test suites are currently passing. Remaining issues are mostly lifecycle and coverage related.

## Critical Issues (Must Fix)
None found.

## Major Issues (Should Fix)

1. Agent lifecycle disposal is incomplete and can leak isolated memory subscriptions.
- Evidence:
  - `stop()` does not dispose/clear agent: `src/channels/telegram/TelegramChannelService.ts:92`
  - `setAgent()` replaces agent without disposing prior instance: `src/channels/telegram/TelegramChannelService.ts:123`
  - New agents are created on settings changes and stop is called in disable/unload paths: `src/main.ts:127`, `src/main.ts:146`, `src/main.ts:291`
  - Each agent allocates isolated memory and each isolated memory subscribes to settings changes: `src/channels/telegram/TelegramAgent.ts:30`, `src/LLMProviders/memoryManager.ts:14`
- Impact:
  - Repeated settings toggles/restarts can leave orphan subscribers and stale isolated memory instances.
- Recommendation:
  - Dispose old agent inside `setAgent()` before reassignment.
  - In `stop()`, call `this.agent?.dispose()`, then set `this.agent = null`.

2. Legacy thread migration is only partial for `local_id`, which can reduce history quality on pre-migration rows.
- Evidence:
  - `local_id` is optional for backward compatibility: `src/channels/telegram/TelegramTypes.ts:4`
  - History exclusion falls back to `update_id` when `local_id` missing: `src/channels/telegram/TelegramAgent.ts:67`
  - Persisted thread rows are read as-is without normalization/backfill: `src/channels/telegram/TelegramStore.ts:334`
- Impact:
  - Older rows without both `local_id` and meaningful `update_id` can be filtered incorrectly during history reconstruction.
- Recommendation:
  - Backfill/normalize `local_id` on load, or perform a one-time migration pass in store initialization.

3. Coverage gaps remain for the riskiest new behavior.
- Evidence:
  - Fallback success path is tested, but no fallback-send-failure no-persist assertion in agent tests.
  - Service tests cover restart/stop but do not verify `dispose()` behavior.
  - No dedicated TelegramChatView onboarding tests found.
  - No dedicated MemoryManager disposal tests found.
- Impact:
  - Regression risk remains high for lifecycle and strict isolation guarantees.
- Recommendation:
  - Add tests for:
    - fallback send failure does not call `appendBotMessage`
    - `stop()` and `setAgent()` disposal behavior
    - onboarding rendering states in TelegramChatView
    - MemoryManager `dispose()` idempotency

## Minor Issues (Nice to Have)

1. User docs are not fully aligned with the new guided onboarding UX.
- Evidence:
  - UI now shows explicit onboarding/warnings:
    - `src/channels/telegram/TelegramChatView.tsx:106`
    - `src/channels/telegram/TelegramChatView.tsx:139`
    - `src/settings/v2/components/TelegramSettings.tsx:128`
  - Docs still describe high-level requirements without the guided flow:
    - `docs/chat-interface.md:27`
    - `docs/getting-started.md:61`
- Recommendation:
  - Add a short onboarding section documenting empty-allowlist behavior and the bind flow.

## Positive Feedback

1. Request-scoped memory override is wired through the main chain path and runners.
2. Telegram fallback persistence is implemented correctly on successful send.
3. Store/UI allowlist onboarding state is surfaced and displayed clearly.
4. Telegram suite is green (4 suites, 45 tests passing).

## Questions for Author

1. Should `stop()` be the single boundary that always disposes and nulls the current Telegram agent?
2. Do you want strict migration for old thread rows, or is partial legacy-context degradation acceptable?
3. Should `setAgent()` enforce replacement safety (dispose previous) by design?

## Verdict
Request Changes
