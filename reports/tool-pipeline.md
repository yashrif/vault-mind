Findings

Critical: The plan does not explicitly handle the history-adapter gap required for shared preparation.
The shared prep flow in ChatManager.ts:475 passes a repository into ContextManager, and L2 context construction depends on that repository contract in ContextManager.ts:92 and ContextManager.ts:375. Telegram currently provides history via TelegramStore.ts:323, not MessageRepository, so parity will be incomplete unless the plan adds an explicit adapter step.

Critical: Your own UI-vs-runtime separation requirement is correct, but easy to accidentally violate unless made explicit in implementation steps.
UI helpers currently use tool-access checks in ChatInput.tsx:138 and ChatToolControls.tsx:50. Runtime/context logic also depends on access checks in contextProcessor.ts:252. If someone “just adds Telegram to isAgentChain” in utils.ts:411, Telegram UI controls may unintentionally surface. The plan should explicitly require a new runtime policy helper and keep utils.ts:411 UI-facing only.

Critical: L1 parity is not just “use shared path”; it also needs legacy compatibility strategy.
Telegram currently builds minimal envelopes in TelegramAgent.ts:224, TelegramAgent.ts:302, and TelegramAgent.ts:351. Regular tool mode depends on envelope-provided system content. Without explicit lazy/eager migration handling for existing stored Telegram rows, behavior will be inconsistent across old/new turns.

Major: Manual-tool “always on” behavior is under-specified at the exact injection point.
Manual tools are currently marker-driven in ToolChainRunner.ts:248 and called from ToolChainRunner.ts:823. The plan should explicitly say whether Telegram prep injects markers before runner execution or ToolChainRunner applies a Telegram-specific forced policy branch.

Major: Autonomous full-toolset requirement needs a concrete policy thread from ChainManager to runner.
Autonomous tool filtering is currently settings-driven in AutonomousAgentChainRunner.ts:128 and AutonomousAgentChainRunner.ts:138. The plan should explicitly add option plumbing from chainManager.ts:327 so Telegram can ignore enabled IDs while normal chains keep current behavior.

Major: Prompt isolation requirement is solid, but needs explicit channel-aware resolver extraction.
Current prompt resolution is session/global state based in state.ts:11, state.ts:12, and systemPromptBuilder.ts:34. The plan should explicitly add a channel-aware resolver path (Telegram vs default) so Telegram ignores session overrides by design, not by incidental UI hiding.

Major: Settings scope is correct but incomplete unless migration/testing/docs are first-class tasks.
The settings model has Telegram transport fields only in model.ts:197 to model.ts:201, and Telegram settings UI currently lacks prompt selection in TelegramSettings.tsx. Add explicit migration tests and user docs updates, plus reuse picker patterns from AdvancedSettings.tsx:25.

Minor: Your regression list includes checks that are already partially covered.
Telegram UI hiding is already tested in ChatControls.test.tsx:107, and Telegram history/reset behaviors are already exercised in TelegramStore.test.ts:261. Keep them, but focus new tests on parity deltas (L1 inclusion, policy routing, prompt fallback order).

Evaluation
Plan quality is strong and directionally correct. I would rate it 8/10.
The architecture intent is right, runner mapping constraints are respected, and test thinking is good.
Main risk is execution ambiguity at policy boundaries (history adapter, runtime policy plumbing, legacy migration behavior).

Refined Plan (Scannable)

Define internal runtime policy contracts first (default vs telegram; regular vs autonomous tool policy), and thread them through chainManager.ts:327.
Extract a shared message-preparation method from ChatManager.ts:413 and reuse it for both normal chat and Telegram.
Add Telegram-to-MessageRepository history adaptation so ContextManager L2 generation works with Telegram visible-history boundaries.
Replace Telegram primary minimal-envelope path with shared-prep path for new turns, while preserving lazy compatibility for existing stored rows.
Add Telegram prompt isolation end-to-end: new persisted setting, resolver order, templating reuse, and Telegram settings picker UI.
Implement Telegram manual regular mode as forced marker-equivalent behavior, independent of chat pills/UI.
Implement Telegram autonomous mode with full built-in autonomous tools, ignoring enabled-tool IDs only for Telegram policy.
Keep UI controls hidden for Telegram mode as-is in ChatControls.tsx:199.
Add focused tests for parity deltas and keep existing regression coverage for Telegram reset/history/UI.
Update user-facing docs for Telegram prompt/tool behavior changes.
