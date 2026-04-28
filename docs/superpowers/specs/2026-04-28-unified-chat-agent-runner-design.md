# Unified Chat & Agent Runner — Design

**Date:** 2026-04-28
**Branch:** `22-merge-chat-and-agent-while-using-the-agent-logics`
**Status:** Approved for planning

## Goal

Route chat through the agent's execution pipeline (`AutonomousAgentChainRunner`) so chat and agent share one runner, one reasoning UI, and one persistence path — while preserving a meaningful chat-vs-agent distinction grounded in capability (read vs write) rather than a separate code path.

## Motivation

Today the plugin maintains four distinct chain runners (`LLMChainRunner`, `ToolChainRunner`, `VaultQAChainRunner`, `ProjectChainRunner`) plus the agent runner. Each duplicates streaming, error handling, history shaping, and reasoning rendering logic. Chat lacks the agent's reasoning panel and tool capabilities. Consolidating onto one runner removes duplication, brings the reasoning UI to chat, and makes it possible to expose tools to chat in a controlled way without changing the runner. The mode distinction stays — but as configuration of one runner, not as five parallel ones.

## Architecture

### Single Runner, Mode as Preset

`AutonomousAgentChainRunner` is the only runner. Each `ChainType` maps to a **preset** — a bundle of:

1. **Tool list** — the array passed to `bindTools()` for that turn (after permission resolution)
2. **System prompt** — conversational, autonomous, vault-only, or telegram-flavored (sourced from the existing `RuntimeChainPolicy.promptTarget`)
3. **Runtime policy** — the existing `RuntimeChainPolicy` (`promptTarget`, `richContextPolicy`, `autonomousToolPolicy`, `historyScope`). Each preset is a thin wrapper that selects the appropriate policy plus a tool list and (optionally) an output adapter.
4. **Output adapter** — for `TELEGRAM_CHAIN`, response formatting; otherwise identity

`chainManager.getChainRunner()` always returns `AutonomousAgentChainRunner`, constructed with a preset derived from the active `ChainType` plus the resolved tool list and the existing `RuntimeChainPolicy`. The runner consumes the preset and runs the ReAct loop.

### No-Tools Path

`bindTools()` throws on models without native tool-calling support, so the runner cannot unconditionally call it for chat with zero costly tools enabled (or for any model that lacks tool support). The runner therefore branches on resolved tool list:

- **Tool list empty (or model lacks tool calling)** — skip `bindTools()` and use a raw streaming path (`chatModel.stream(messages)`). This reproduces today's `LLMChainRunner` behavior and preserves compatibility with non-tool-capable models.
- **Tool list non-empty (and model supports tool calling)** — bind tools and run the ReAct loop as today.

The decision is per-turn, based on the resolved permissions and a model-capability check. The capability check already exists in `ToolChainRunner` — it must be lifted to a shared utility (see Pre-Extraction step below) before `ToolChainRunner` can be deleted.

### Preset Mapping

Each preset wraps an existing `RuntimeChainPolicy` (in `src/runtime/RuntimeChainPolicy.ts`) plus the resolved tool list and an optional output adapter. The runtime policy fields (`promptTarget`, `richContextPolicy`, `autonomousToolPolicy`, `historyScope`) are not duplicated — they are consumed as-is from the existing policy resolver.

| ChainType            | Tool list source                                          | RuntimeChainPolicy                                                                                                                                                                                  | Output adapter              |
| -------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `LLM_CHAIN` (chat)   | resolved `chat` permissions; write tools filtered out     | new `chat` policy (new `promptTarget: "chat"` value with conversational system prompt, `richContextPolicy: "standard"`, `autonomousToolPolicy: "settings_filtered"`, `historyScope: "shared_repo"`) | none                        |
| `TOOL_CHAIN` (agent) | resolved `agent` permissions                              | existing default policy (`promptTarget: "default"`, `autonomousToolPolicy: "settings_filtered"`)                                                                                                    | none                        |
| `VAULT_QA_CHAIN`     | only `localSearch`                                        | new `vault_qa` policy with vault-only prompt                                                                                                                                                        | none                        |
| `PROJECT_CHAIN`      | resolved `agent` permissions, scoped to project overrides | existing project policy + project context appended to `contextEnvelope`                                                                                                                             | none                        |
| `TELEGRAM_CHAIN`     | resolved `agent` permissions                              | **existing** Telegram policy unchanged (`promptTarget: "telegram"`, `richContextPolicy: "plus"`, `historyScope: "telegram_visible_thread"`, `autonomousToolPolicy: "full_builtin"`)                 | Telegram outbound formatter |

The `LLM_CHAIN` chat policy is new (chat does not currently have a runtime policy entry). The vault-QA policy is also new (today's `VaultQAChainRunner` doesn't go through the policy system). All other chains use their existing policy values verbatim — the unification is in the runner, not in the policies.

### Capability Boundary: Read vs Write

The chat-vs-agent identity is grounded in _what the mode can do_, not _how many tools it has_:

- **Read tools** — `localSearch`, `webSearch`, `getCurrentTime`, `getFileTree`, `youtubeTranscription`, `pomodoroTool`, MCP read-only tools. Available to both chat and agent.
- **Write tools** — `composer` (create/edit notes) and any future state-mutating tool (delete, run shell, etc.). Available to agent only. Never bound to a chat-mode runner.

This boundary is enforced in the tool registry, not in user-facing settings: tools gain a new field `accessLevel: "free" | "costly" | "write"`, separate from the existing `category` field (which remains the UI taxonomy: `search`, `time`, `file`, `media`, `mcp`, `memory`, `custom`, `cli`). The permission resolver refuses to bind `accessLevel: "write"` tools when the mode is chat. Adding a new write tool automatically inherits this boundary; no per-tool decision is required.

## Tool Permission Cascade

### Two Levels: Global, Project (agent only)

There are no thread-level overrides. A thread inherits its mode's permissions fully. Per-thread customization was considered and rejected — it overlaps with project's purpose and dilutes project-as-a-scope.

**Level 1 — Global (settings tab):**

```
toolDefaults: {
  chat:  { localSearch: true,  webSearch: false, youtubeTranscription: false }
  agent: { localSearch: true,  webSearch: true,  youtubeTranscription: true,
           composer: true /* + future write tools */ }
}
```

Stored in the existing settings model. Only tools with `accessLevel: "costly"` and `accessLevel: "write"` are listed — `accessLevel: "free"` tools are always on, no toggle. Chat config never lists `write` tools (mode-restricted).

**Level 2 — Project (agent only):**

```
project.toolOverrides.agent: {
  localSearch: "inherit" | true | false
  webSearch:   "inherit" | true | false
  composer:    "inherit" | true | false
  ...
}
```

Tri-state per tool. No `chat` block — projects only configure agent. The chat config remains global.

### Resolution

A new module `src/core/ToolPermissions.ts` exports:

```ts
resolveToolPermissions(mode: "chat" | "agent", projectId?: string): Tool[]
```

Algorithm:

1. Start with all `accessLevel: "free"` tools (always on).
2. For each `accessLevel: "costly"` tool, look up `globalDefaults[mode][tool]`. Apply.
3. For `agent` mode with a `projectId`: for each tool, if `project.toolOverrides.agent[tool]` is `true` or `false`, override; if `"inherit"`, keep the global value.
4. For `chat` mode: `accessLevel: "write"` tools are filtered out unconditionally, regardless of any setting.
5. Return the array of tools to pass to `bindTools()`.

`chainManager.runChain()` calls `resolveToolPermissions` before constructing the preset, so the resolved tool list is part of the `ChainPreset` passed to the unified runner.

### UI Surface

**Settings tab — "Default tools" section** (in `BasicSettings.tsx`):

- Two columns: Chat / Agent
- Rows: only `costly` tools (and `write` tools in the Agent column)
- Free tools are not listed; explanatory copy notes "passive tools like time and file tree are always available"

**Project settings — "Tool access" section:**

- Single column (Agent only)
- Rows: same as global Agent column
- Each row is tri-state: inherit (default) / on / off, with a reset affordance to return to inherit
- "Inherited" state shows the value cascading from global as a faded indicator

**Chat header — `ChatToolControls`:**

- Becomes a read-only indicator showing which tools are active in this thread (resolved from the cascade)
- No toggles — toggles live in settings/project, not on the thread

## Reasoning UI & Persistence

There are two separate persistence paths and the spec deliberately treats them as distinct:

1. **UI markdown persistence** — what `ChatPersistenceManager` writes to the saved chat file. This includes `AGENT_REASONING` markers so the reasoning panel can re-render on reload.
2. **LLM memory across turns / reloads** — what the chat model sees as context. This is shaped by `BaseChainRunner` / `chatHistoryUtils.ts`.

### Reasoning Panel

`AgentReasoningBlock` rendering in `ChatSingleMessage.tsx` becomes mode-agnostic. The component renders whenever the message text contains `AGENT_REASONING` markers, regardless of the originating `ChainType`. The marker name is preserved (no rename to `CORTEX_REASONING`) — keeps the diff small and lets persisted threads continue rendering.

Behavior by mode:

- Chat with no tool calls → no markers → panel stays hidden → identical to today's chat
- Chat with tool calls → markers present → panel renders, same UI as agent today
- Agent → unchanged from today

### UI Markdown Persistence

Reasoning is saved alongside the final request/response in the markdown file:

- Tool calls and tool results that occurred during a turn are embedded in the assistant message text via `AGENT_REASONING` markers. This is the existing mechanism in `ChatPersistenceManager` for agent threads; chat threads now use the same path.
- The full turn — user request, reasoning trace, final response — persists as one unit. Reload reproduces the panel for the human reader.

### LLM Memory (Within a Turn vs Across Reloads)

- **Within a single turn** — the runner builds the message list with `AIMessage(tool_calls)` and `ToolMessage` entries. This is the standard ReAct flow and is unchanged. Chat now produces this same shape when tools are used.
- **Across reloads** — `BaseChainRunner` / `chatHistoryUtils.ts` reconstitute LLM memory from saved user/assistant content only. The structured `tool_calls` / `ToolMessage` chain is **not** reconstructed; the model sees the final responses, not the intermediate tool calls. This matches today's agent reload behavior. Cross-reload structured tool-call memory is a non-goal for this change.

`MessageRepository` is unchanged. It stores `displayText` and `processedText` per message; the LLM-facing view continues to be assembled by `ChatManager` from those fields. No new field is added to track intermediate tool-call structure for reload — that is explicitly deferred.

## Code Changes

### Sequencing: Pre-Extraction Required

`AutonomousAgentChainRunner extends ToolChainRunner` and inherits non-trivial behavior: multimodal-content building, model-capability checks, local-search result formatting, and a fallback path. These cannot be deleted with `ToolChainRunner` itself — they must first be lifted into `BaseChainRunner` (or a sibling `chainRunnerUtils.ts`) so the agent runner no longer depends on the tool-runner class. This is a prerequisite step in the plan, not a separate refactor:

1. **Phase 0 — Lift shared utilities**: extract from `ToolChainRunner` into `BaseChainRunner` / shared utils:
   - Multimodal content assembly (the `streamMultimodalResponse` helpers)
   - Model capability check (does this model support `bindTools()`)
   - Local search result formatting
   - Tool-execution fallback / retry path
2. **Phase 1 — Switch agent runner to use the lifted utilities** instead of inheriting from `ToolChainRunner`. Change `AutonomousAgentChainRunner extends ToolChainRunner` to `extends BaseChainRunner`. Verify agent mode still behaves identically.
3. **Phase 2 — Build presets and the no-tools branch** in `AutonomousAgentChainRunner`. Land permission resolver, tag tool registry with `accessLevel`.
4. **Phase 3 — Switch chat / vault-QA / project / telegram dispatch** to the unified runner via presets. Update UI surfaces.
5. **Phase 4 — Delete the obsolete runners** (`LLMChainRunner`, `ToolChainRunner`, `VaultQAChainRunner`, `ProjectChainRunner`) and the `enableAutonomousAgent` flag.

### Delete (in Phase 4)

- `src/LLMProviders/chainRunner/LLMChainRunner.ts` and its test
- `src/LLMProviders/chainRunner/ToolChainRunner.ts`
- `src/LLMProviders/chainRunner/VaultQAChainRunner.ts`
- `src/LLMProviders/chainRunner/ProjectChainRunner.ts`
- `src/chainFactory.ts` (already marked deprecated; remove if unused after the merge)
- The `enableAutonomousAgent` flag and any code branches that depended on it

### Add

- `src/LLMProviders/chainRunner/presets/` — one file per `ChainType` exporting a `ChainPreset` (`{ runtimePolicy, toolListResolver, outputAdapter? }`). The `runtimePolicy` references the existing `RuntimeChainPolicy` map; the preset adds the resolved tool list and any output transform.
- `src/core/ToolPermissions.ts` — `resolveToolPermissions(mode, projectId?)` walking the cascade
- `ToolRegistry` extension — add `accessLevel: "free" | "costly" | "write"` to `ToolMetadata` (separate from the existing `category` field). Existing tool registrations are updated with the appropriate `accessLevel`.
- New `RuntimeChainPolicy` entries for `chat` and `vault_qa` (chat does not have a dedicated policy today; vault-QA bypasses the policy system).

### Modify

- `chainManager.getChainRunner()` — always returns `AutonomousAgentChainRunner` constructed with the preset; remove the switch over `ChainType → Runner` mapping
- `chainManager.runChain()` — calls `resolveToolPermissions` before constructing the preset; passes resolved tool list and `ChainPreset` into the runner
- `AutonomousAgentChainRunner` — extends `BaseChainRunner` (not `ToolChainRunner`); accepts a `ChainPreset` per run; branches on resolved tool list (empty → raw streaming path; non-empty → ReAct loop with `bindTools()`)
- `BaseChainRunner` — gains the lifted utilities (multimodal content, capability check, search result formatting, fallback path) so both the unified runner and any future runner can use them
- `ChatSingleMessage.tsx` — drop the agent-mode gate on `AgentReasoningBlock` rendering; render whenever markers are present
- `BasicSettings.tsx` — add "Default tools" section (Chat / Agent columns)
- Project settings UI — add "Tool access" section (Agent column only, tri-state per tool)
- `ChatToolControls.tsx` — convert from toggle widget to read-only indicator of active tools
- `settings/model.ts` — add `toolDefaults` schema; add `toolOverrides` to project schema
- All existing tool registrations in `src/tools/` — set the `accessLevel` field on each `ToolMetadata`

### Tests

- `AutonomousAgentChainRunner.test.ts` — extended with cases for:
  - Chat preset, empty tool list → no `bindTools()` call, raw streaming path
  - Chat preset, read-only tool set → `bindTools()` called, ReAct loop runs
  - Vault-QA preset → only `localSearch` bound, "answer from vault only" prompt active. **Lock the new soft-enforcement semantics**: a test case where the model could ignore the directive and still return a response (no hard retrieval guarantee).
  - Telegram preset → existing telegram policy preserved (`promptTarget`, `historyScope`, etc.)
- `ToolPermissions.test.ts` — cascade resolution: free tools always present, costly tools follow global, project tri-state, chat strips `accessLevel: "write"` tools
- Existing `LLMChainRunner.test.ts` and `ToolChainRunner` references deleted with the runners
- **User docs updated** for the vault-QA semantic change (model-decided retrieval instead of guaranteed retrieval) — see `docs/` index for which file owns this

## Non-Goals / Deferred

- **Migration / backwards compatibility** — explicitly not in scope. Old runners are deleted outright. The `enableAutonomousAgent` flag is removed without a fallback. `toolDefaults` ships with built-in defaults — no migration code reads pre-existing settings shapes. Existing persisted chat threads continue to render because the markdown format hasn't changed, but no internal-API or settings shims are added.
- **Hard enforcement of "answer from vault only" for vault-QA** — soft enforcement via system prompt is acceptable. A post-response filter is not added. **This is a behavioral change from today's `VaultQAChainRunner`, which guarantees retrieval before answering.** New semantics are locked via tests and user-doc updates as part of this change.
- **Forcing first-turn retrieval for vault-QA** — accepted that the model decides when to call `localSearch`. Strong system-prompt directive only.
- **Cross-reload structured tool-call memory** — when a thread is reloaded, the LLM sees user/assistant content only, not the prior `AIMessage(tool_calls)` / `ToolMessage` chain. Same as today's agent reload behavior. Improving this is out of scope.
- **Rename `AGENT_REASONING` to `CORTEX_REASONING`** — left as a separate cleanup; not part of this change.
- **Per-thread tool permission overrides** — explicitly rejected; project is the customization scope for agent mode.
- **MCP tool access-level tagging beyond a default** — MCP server tools register with `accessLevel: "costly"` by default; finer per-tool tagging from MCP metadata is a follow-up.

## Open Implementation Notes

- **Tool registry category default**: every registered tool in `src/tools/` (Composer, Note, Tag, ObsidianCli, FileTree, Search, Time, Youtube, memory, MCP, etc.) must be reviewed and tagged before the runner can resolve permissions. Suggested baseline:
  - `free`: `getCurrentTime`, `getFileTree`, `pomodoroTool`, `ReadNoteTool`, and any other purely passive query
  - `costly`: `localSearch`, `webSearch`, `youtubeTranscription`, MCP tools (default; individual MCP tools may be re-tagged)
  - `write`: `composer`, any `NoteTools` / `TagTools` / `ObsidianCliTools` / `ObsidianCliDailyTools` operation that mutates vault state or runs a command
    Each tool's category is determined by per-tool review during implementation; the mapping above is a starting point, not a final decision.
- **Iteration cap** (currently 4) stays uniform across modes. Not a per-mode setting.
- **Telegram preset** continues to dispatch through the existing channel adapter; the unification is internal — no Telegram contract changes.
