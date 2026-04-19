# Telegram Integration - Incomplete Problem Definitions

Source: reports/telegram-channel-review-analysis.md
Date extracted: 2026-04-20

## Major

### [ ] Shared MemoryManager contamination risk
Status: Open

Problem definition:
- Telegram replies and UI chat flows currently rely on shared memory state, which can create context bleed between concurrent or near-concurrent runs.
- This can degrade response relevance, produce cross-thread context leakage, and make behavior non-deterministic under load.
- The issue is architectural and affects correctness, isolation, and debuggability.

### [ ] Chain mode scoping ambiguity for Telegram runs
Status: Open

Problem definition:
- Telegram background replies do not have an explicitly isolated chain-mode contract independent of mutable UI mode state.
- When UI mode changes during background processing, routing behavior can become ambiguous.
- This creates risk of incorrect chain selection and inconsistent Telegram reply behavior.

## Minor

### [ ] Duplicate chunking responsibility (agent + client)
Status: Open

Problem definition:
- Message chunking logic exists in more than one layer, creating overlapping responsibility.
- This duplication increases maintenance cost, raises drift risk between layers, and makes failures harder to reason about.
- The issue is primarily maintainability and clarity, with potential behavioral inconsistency risk over time.
