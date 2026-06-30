# OpenClaw Telegram Channel Report

Date: 2026-04-19
Target analyzed: https://github.com/openclaw/openclaw
Target integration project: vault-mind (current workspace)

## Executive Summary

OpenClaw's Telegram implementation is production-grade and built around clear boundaries: channel lifecycle supervision, resilient transport handling, session-aware routing, safe persistence primitives, and cautious outbound retry behavior.

For this repository, the best path is to introduce a channel adapter layer that reuses the existing ChatManager and chain execution pipeline instead of duplicating UI-bound message logic. This keeps one source of truth for context processing, message history, and model execution.

## Part 1: Detailed Report on How OpenClaw Handles Telegram

## 1. Runtime entry and mode selection

OpenClaw starts Telegram from a monitor layer that resolves account and token, then branches into either polling mode or webhook mode.

The monitor is not passive. It supervises runtime health and explicitly controls restart behavior, including when to force restart on transport/network failures.

## 2. Polling architecture and lifecycle

OpenClaw polling is implemented as restartable cycles, not a single endless loop.

Key behavior:

1. Performs startup webhook cleanup to avoid polling/webhook conflicts.
2. Loads persisted update watermark to continue from safe offset.
3. Runs polling with watchdog/stall detection.
4. Applies bounded backoff before cycle restart.
5. Marks transport dirty and rebuilds transport after recoverable network faults.
6. Handles getUpdates conflict cases as recoverable restart states.

This design minimizes both missed updates and dead polling loops.

## 3. Webhook architecture and ingress hardening

Webhook mode includes strict guardrails:

1. Requires a non-empty webhook secret.
2. Validates incoming secret header on each request.
3. Enforces request-size and request-time limits.
4. Applies ingress rate limiting.
5. Handles startup registration and shutdown cleanup explicitly.
6. Avoids dropping pending updates by default on shutdown.

This protects both reliability and security of webhook ingestion.

## 4. Error model and retry policy

OpenClaw distinguishes error classes instead of treating all failures equally.

Important distinctions:

1. Recoverable network errors for polling/control-plane behavior.
2. Safe-to-retry send errors for non-idempotent sends.
3. Telegram rate-limit handling with retry_after support.
4. Telegram server-side and client-side API rejection classes.

Critical design choice:
OpenClaw separates recoverable errors from safe-to-retry send errors. That prevents duplicate visible messages when uncertain delivery semantics exist.

## 5. Update dedupe and offset safety

Inbound dedupe has multiple layers:

1. In-memory key dedupe for short-term replay suppression.
2. Pending/completed/failed update tracking.
3. Safe offset watermark persistence only when unresolved updates are not bypassed.

This guards against both duplicate processing and accidental message loss.

## 6. Offset persistence safeguards

Offset persistence is account-scoped and validated with schema and constraints.

Observed protections:

1. Non-negative safe-integer validation of update IDs.
2. Bot/account identity checks to avoid stale cross-token offset reuse.
3. Delete/reset pathways for controlled recovery.

## 7. Session routing and conversation semantics

OpenClaw treats Telegram as a sessioned channel with explicit conversation grammar.

Notable behaviors:

1. Inbound session recording updates route/session metadata.
2. Group and forum topics are represented with thread-aware keys.
3. Parent/base conversation candidate resolution supports topic context.
4. Last-route update logic avoids incorrect route replacement in DM owner-pin scenarios.

## 8. Thread binding persistence

Thread/topic bindings are persisted and lifecycle-managed.

Key patterns:

1. Per-account binding registries.
2. Queued async persistence to disk.
3. touch/idle/max-age cleanup policies.

This enables durable topic routing without unbounded state growth.

## 9. Outbound send pipeline behavior

OpenClaw send logic includes robust fallback and diagnostics:

1. Normalizes and resolves chat targets.
2. Supports text/media/sticker/poll/edit/react/pin/delete operations.
3. Retries thread-not-found paths by retrying once without message_thread_id in safe contexts.
4. Falls back from parse-mode formatting errors to plain text sends.
5. Wraps chat-not-found and membership/blocked errors with actionable diagnostics.

## 10. Sent-message ownership cache

A persisted TTL sent-message cache is used to remember bot-sent messages across restarts.

Benefits:

1. Helps avoid bot echo loops.
2. Improves inbound ownership checks after process restart.

## 11. Typing indicator protection against token failures

OpenClaw includes a global per-account sendChatAction 401 backoff/circuit-breaker pattern.

Behavior:

1. Exponential backoff on consecutive 401 failures.
2. Suspension after threshold to avoid continuous unauthorized request storms.
3. Requires explicit recovery/reset after credential correction.

## 12. Why OpenClaw's Telegram design is strong

Main strengths:

1. Explicit lifecycle control beyond library defaults.
2. Safe state persistence (offsets, sent IDs, bindings).
3. Idempotency-aware retry boundaries.
4. Session and thread semantics encoded as domain logic.
5. Operational diagnostics that aid debugging.

## Part 2: Integration Plan for This Project (vault-mind)

This plan is mapped to the current codebase architecture, especially:

1. src/core/ChatManager.ts
2. src/state/ChatUIState.ts
3. src/langchainStream.ts
4. src/LLMProviders/chainManager.ts
5. src/settings/model.ts
6. src/constants.ts
7. src/main.ts

## 1. Integration objective

Add Telegram as an external channel while preserving existing chat architecture as the single source of truth for:

1. context processing
2. message storage and session state
3. model execution and streaming logic

## 2. Architectural approach

Introduce a channel adapter boundary.

Design rule:
Telegram must feed into the same core message pipeline used by the UI, not a parallel implementation.

Recommended top-level components:

1. TelegramChannelService: lifecycle, polling/webhook, update normalization.
2. TelegramSessionRouter: mapping Telegram update metadata to internal conversation/session keys.
3. TelegramOutboundGateway: send operations with safe retry policies.
4. TelegramStores: persistent offset, sent-message cache, thread binding data.
5. ChatExecutionService: non-UI wrapper over ChatManager plus chain execution used by both UI and Telegram.

## 3. Phase-by-phase implementation

## Phase 0: Foundation and contracts

Deliverables:

1. Define channel interfaces and event DTOs.
2. Add Telegram settings fields and defaults.
3. Add secret handling integration with existing encryption flow.

Acceptance criteria:

1. Telegram settings exist and persist.
2. Token is encrypted when encryption is enabled.
3. No runtime behavior change yet.

## Phase 1: Inbound receive-only path

Deliverables:

1. Polling mode receiver for updates.
2. Update normalization into internal inbound events.
3. Conversation key derivation for DM/group/topic.
4. Structured logging and metrics counters.

Acceptance criteria:

1. Incoming updates are captured and deduped.
2. No outbound sending yet.

## Phase 2: End-to-end response path

Deliverables:

1. Bridge inbound events into ChatExecutionService.
2. Reuse ChatManager send and context processing flow.
3. Reuse chain run flow from current model execution path.
4. Basic outbound sendMessage implementation.

Acceptance criteria:

1. Telegram DM messages get model responses.
2. Message order and session continuity are stable.

## Phase 3: Reliability and persistence hardening

Deliverables:

1. Update offset store with account-scoped state.
2. Sent-message cache with TTL and persistence.
3. Retry classification split: recoverable vs safe-to-retry-send.
4. Thread-not-found and parse fallback behavior.
5. Polling restart watchdog and transport dirty/rebuild behavior.

Acceptance criteria:

1. Restart resumes without dropping updates.
2. No duplicate outbound sends under common transient errors.

## Phase 4: Group and topic support

Deliverables:

1. Topic/thread-aware routing keys.
2. Optional thread binding persistence for long-lived mappings.
3. Last-route update policies for group/topic and DM edge cases.

Acceptance criteria:

1. Topic messages route to the expected internal conversation.
2. Thread behavior survives process restarts.

## Phase 5: Webhook mode and security

Deliverables:

1. Webhook listener mode with secret verification.
2. Body/time/rate limits.
3. Startup registration and graceful cleanup.

Acceptance criteria:

1. Webhook path can replace polling in always-on deployments.
2. Security checks block invalid ingress.

## Phase 6: Test matrix and rollout

Deliverables:

1. Unit tests for retry classification and error parsing.
2. Unit tests for offset watermark safety.
3. Integration tests for polling restart and dedupe.
4. Integration tests for thread fallback logic.
5. Staged rollout checklist and observability dashboard.

Acceptance criteria:

1. Reliability behavior is validated before broad rollout.

## 4. Data model recommendations

Recommended persistent artifacts:

1. telegram-offset-{account}.json
2. telegram-sent-message-cache-{account}.json
3. telegram-thread-bindings-{account}.json (if topics enabled)

Recommended keys:

1. DM: telegram:{account}:{chatId}
2. Group: telegram:{account}:{chatId}
3. Topic: telegram:{account}:{chatId}:topic:{threadId}

## 5. Retry and idempotency policy to adopt

Rules:

1. Polling/control-plane operations may use broad recoverable retry.
2. Non-idempotent send operations must only retry safe pre-connect or explicit rate-limit scenarios.
3. Avoid generic retry envelopes that can duplicate visible messages.
4. Add one controlled threadless retry only for known thread-not-found errors.

## 6. Security and ops requirements

Minimum requirements:

1. Store bot token in encrypted settings path.
2. Never log raw token.
3. Add structured error logs with account and operation labels.
4. Track counters for restarts, retries, webhook rejects, and duplicate suppressions.

## 7. Risks and mitigations

Risk: Duplicate outbound messages under uncertain send failures.
Mitigation: strict safe-to-retry-send classification and sent-message cache.

Risk: Lost updates after restart.
Mitigation: safe watermark persistence with pending/failed update awareness.

Risk: Session drift across topics.
Mitigation: thread-aware conversation keys and persisted bindings.

Risk: Webhook abuse.
Mitigation: secret validation, rate limits, and request guards.

## 8. Recommended immediate next steps

1. Implement Phase 0 contracts and settings.
2. Build ChatExecutionService to reuse existing ChatManager plus chain pipeline outside UI components.
3. Deliver Phase 1 polling receive-only mode with logging and dedupe.
4. Add Phase 2 DM response flow and validate end-to-end.

## Appendix: Repository touchpoints for implementation

Core orchestration and state:

1. src/core/ChatManager.ts
2. src/state/ChatUIState.ts
3. src/types/message.ts

Execution and streaming:

1. src/langchainStream.ts
2. src/LLMProviders/chainManager.ts

Plugin lifecycle and config:

1. src/main.ts
2. src/settings/model.ts
3. src/constants.ts
4. src/encryptionService.ts
