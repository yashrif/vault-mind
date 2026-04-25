# Context Engineering - Layered Prefix System

## Table of Contents

1. [Purpose](#purpose)
2. [First-Principles Goals](#first-principles-goals)
3. [Current Architecture (Verified)](#current-architecture-verified)
4. [Example Chat Walkthrough](#example-chat-walkthrough)
5. [Chain Runner Envelope Usage](#chain-runner-envelope-usage)
6. [Strengths](#strengths)
7. [Known Gaps](#known-gaps)
8. [Improvement Roadmap](#improvement-roadmap)
9. [Testing and Observability](#testing-and-observability)
10. [References](#references)

---

## Purpose

The context envelope system is the canonical prompt-construction pipeline for chat turns.

It exists to guarantee:

- reproducible prompt assembly,
- minimal duplication across L2/L3/L4,
- safe compaction behavior on large context,
- and cache-friendly request prefixes for major providers.

This document is an implementation audit and roadmap based on current production code.

---

## First-Principles Goals

### 1. Reproducibility

For the same turn inputs, envelope construction should be deterministic and byte-stable.

### 2. Token Efficiency

Context artifacts should appear once in canonical form (or as references), not duplicated across layers.

### 3. Prefix Cache Stability

Stable content should stay in early request tokens (L1/L2) so implicit provider caching has maximal hit rate.

### 4. Compaction Safety

Compaction must preserve answerability and recovery affordances, especially for non-recoverable context.

### 5. Persistence Parity

Loading chat history should preserve envelope quality (or deterministically reconstruct it), so behavior after load matches in-session behavior.

---

## Current Architecture (Verified)

### Layer Definitions

| Layer           | Current Source                                               | Update Trigger                  | Stability |
| --------------- | ------------------------------------------------------------ | ------------------------------- | --------- |
| **L1_SYSTEM**   | `ChatManager.getSystemPromptForMessage()`                    | settings/memory/project changes | High      |
| **L2_PREVIOUS** | Auto-promoted previous user-turn L3 segments                 | per user turn                   | Medium    |
| **L3_TURN**     | Current-turn context artifacts (notes/URLs/tags/folders/etc) | every user turn                 | Low       |
| **L4_STRIP**    | Deferred in envelope, injected from LangChain memory         | every turn                      | Low       |
| **L5_USER**     | processed user query (templated user text)                   | every user turn                 | Lowest    |

### End-to-End Flow

1. `ChatManager.sendMessage()` creates a user message and resolves L1 system prompt.
2. `ContextManager.processMessageContext()`:
   - builds L2 from previous user messages' stored envelopes,
   - processes current-turn context artifacts,
   - optionally compacts large context,
   - builds `PromptContextEnvelope` via `PromptContextEngine`.
3. `MessageRepository.updateProcessedText()` stores both legacy `processedText` and `contextEnvelope`.
4. Chain runners require `contextEnvelope`, convert with `LayerToMessagesConverter`, inject L4 from memory, then append tool context into user-side payload.

### L2/L3 Smart Referencing

- L2 is now deduplicated by segment ID with last-write-wins content updates and stable first-seen ordering.
- L3 segments whose IDs already exist in L2 are rendered as references; new IDs include full content.
- Segment parsing is centralized in `parseContextIntoSegments()` using `contextBlockRegistry` tags.

### Tool Placement Model

- System message contains only L1 + L2.
- Tool outputs remain turn-scoped and are prepended to user-side content (`CiC` ordering).
- This keeps cacheable prefix isolated from tool variability.

### Persistence Behavior

- Chat markdown persists message text plus context references (`[Context: ...]`), not full envelopes.
- On load, messages are restored without `contextEnvelope`.
- Regeneration now has lazy reprocessing: if envelope is missing, `ChatManager.regenerateMessage()` reprocesses the target user message before running the chain.
- Continuing chat after load still does not automatically reconstruct historical envelopes for prior turns.

### Compaction Stack

- **Turn-time compaction** (`ContextCompactor`): map-reduce summarization when total context exceeds threshold.
- **L2 carry-forward compaction** (`compactSegmentForL2` + `L2ContextCompactor`): deterministic structure+preview compression for promoted previous context.

### L4 Memory Behavior

- L4 (chat history) is injected by chain runners from LangChain `BufferWindowMemory`.
- **Only L5 text (bare user message) is saved to memory** — context artifacts are NOT included. `BaseChainRunner.handleResponse()` extracts `l5Text` from the envelope, falling back to `originalMessage` or `message`.
- This prevents duplication: context artifacts already live in L2/L3 via the envelope; baking them into L4 would cause triple-inclusion and waste tokens.
- Assistant responses are compacted at save time by `ChatHistoryCompactor` (strips tool result XML) before storage. Agent-mode responses save only the final answer, not the full reasoning/tool-call chain.

---

## Example Chat Walkthrough

This shows the concrete layer contents across a 3-turn conversation. The user attaches `project-spec.md` in Turn 1, adds `api-docs.md` in Turn 2, then drops `api-docs.md` in Turn 3.

### Turn 1: User adds `project-spec.md`

```
L1 (System):
  [system prompt + user memory + project instructions]

L2 (Previous Context Library):
  (empty — first turn, no prior context)

L3 (Current Turn Context):
  <note_context>
  <title>project-spec</title>
  <path>project-spec.md</path>
  <content>... full note content ...</content>
  </note_context>
  → Segment ID: "project-spec.md" (NEW — full content included)

L4 (Chat History):
  (empty — first turn)

L5 (User Message):
  "Summarize this"
```

After Turn 1, `BaseChainRunner.handleResponse()` saves to memory:

- Input: `"Summarize this"` (displayText only — no context XML)
- Output: `"Here is a summary of the project spec..."`

### Turn 2: User keeps `project-spec.md`, adds `api-docs.md`

```
L1 (System):
  [system prompt — stable ✅, cache-friendly]

L2 (Previous Context Library):
  <prior_context source="project-spec.md" type="note">
  Structure: project-spec (project-spec.md) | Preview: ...first 200 chars...
  </prior_context>
  → Segment ID: "project-spec.md" (promoted from Turn 1 L3, compacted for L2)

L3 (Current Turn Context):
  Context attached to this message:
  - project-spec.md

  Find them in the Context Library in the system prompt above.

  <note_context>
  <title>api-docs</title>
  <path>docs/api-docs.md</path>
  <content>... full note content ...</content>
  </note_context>
  → "project-spec.md" rendered as REFERENCE (already in L2)
  → "docs/api-docs.md" is NEW — full content included

L4 (Chat History):
  Human: "Summarize this"
  AI: "Here is a summary of the project spec..."
  → Only displayText — no context XML in L4

L5 (User Message):
  "What endpoints does the API support?"
```

### Turn 3: User keeps `project-spec.md` only (drops `api-docs.md`)

```
L1 (System):
  [system prompt — stable ✅]

L2 (Previous Context Library):
  <prior_context source="project-spec.md" type="note">
  Structure: project-spec (project-spec.md) | Preview: ...first 200 chars...
  </prior_context>
  <prior_context source="docs/api-docs.md" type="note">
  Structure: api-docs (docs/api-docs.md) | Preview: ...first 200 chars...
  </prior_context>
  → Both deduplicated by segment ID. "project-spec.md" retains its
    first-seen position; "docs/api-docs.md" added after.
  → L2 is CUMULATIVE and STABLE — cache hit for the prefix ✅

L3 (Current Turn Context):
  Context attached to this message:
  - project-spec.md

  Find them in the Context Library in the system prompt above.
  → "project-spec.md" is a REFERENCE (in L2)
  → "docs/api-docs.md" is NOT referenced (user didn't attach it this turn)
    but it remains in L2 for cache stability and potential follow-up use

L4 (Chat History):
  Human: "Summarize this"
  AI: "Here is a summary of the project spec..."
  Human: "What endpoints does the API support?"
  AI: "The API supports the following endpoints..."
  → Clean displayText only — no bloat

L5 (User Message):
  "Explain the auth flow from the spec"
```

### Key Behaviors Demonstrated

| Behavior                        | Where       | Example                                                           |
| ------------------------------- | ----------- | ----------------------------------------------------------------- |
| **Per-artifact segment IDs**    | L3 parsing  | `"project-spec.md"`, `"docs/api-docs.md"` — not generic `"notes"` |
| **L2 dedup (last-write-wins)**  | L2 build    | Same ID across turns → content updated, position preserved        |
| **Smart referencing**           | L3 render   | Items in L2 become `- project-spec.md` references                 |
| **L2 cumulative growth**        | L2 library  | `api-docs.md` stays in L2 even when dropped from L3               |
| **L2 carry-forward compaction** | L2 content  | Full `<note_context>` → `<prior_context>` with structure+preview  |
| **L4 displayText only**         | Memory save | `"Summarize this"` — no `<note_context>` XML                      |
| **Prefix cache stability**      | L1+L2       | L1 stable across turns; L2 grows monotonically, doesn't shrink    |

---

## Chain Runner Envelope Usage

All four chain runners use the context envelope for LLM message construction. Each delegates final response handling to `BaseChainRunner.handleResponse()`, which saves only L5 text (expanded user query, no context XML) to L4 memory.

### Per-Runner Behavior

| Runner              | Envelope Construction                                                      | Tool Results                           | User Message Source  |
| ------------------- | -------------------------------------------------------------------------- | -------------------------------------- | -------------------- |
| **LLMChainRunner**  | `LayerToMessagesConverter.convert()` → system (L1+L2), user (L3 refs + L5) | None                                   | Envelope only        |
| **ToolChainRunner** | Same converter, then `ensureUserQueryLabel` adds `[User query]:` separator | Prepended to user message in CiC order | L5 text via envelope |

### Tool Mode: Single-Shot Tool Flow

1. Initial message array built identically to ToolChain: `[system (L1+L2+tool guidelines)] → [L4 history] → [user (L3 refs + L5)]`.

- `src/LLMProviders/chainRunner/ToolChainRunner.ts`
- `src/LLMProviders/chainRunner/AutonomousAgentChainRunner.ts`

### Related Docs

- `designdocs/MESSAGE_ARCHITECTURE.md`
- `designdocs/TOOLS.md`
- `designdocs/NATIVE_TOOL_CALLING_MIGRATION.md`
- `designdocs/todo/TECHDEBT.md`
- `TODO.md`
