# Unified Chat & Agent Runner - Design

**Date:** 2026-04-28
**Branch:** `22-merge-chat-and-agent-while-using-the-agent-logics`
**Status:** Approved for planning

## Goal

Route Chat, Chat + RAG, Agent, Project Agent, and Telegram through one execution pipeline based on `AutonomousAgentChainRunner`, while preserving the user-visible capability boundaries:

- Chat is conversational and may use read-only tools.
- Chat + RAG is conversational but retrieval-biased through `localSearch`.
- Agent can use write tools when enabled.
- Project Agent is Agent plus project prompt/context.
- Telegram remains a transport-specific preset with isolated memory and Telegram formatting.

No migration or backwards-compatibility shim is required. Old runner paths, old settings shapes, and old UI surfaces can be removed outright.

## Motivation

The plugin currently maintains separate runners for basic chat, tool chat, Vault QA, project chat, and autonomous agent behavior. This duplicates streaming, error handling, prompt shaping, memory handling, and reasoning rendering. The target architecture keeps one runner and moves product differences into explicit presets.

`Vault QA` is no longer a standalone mode. Its useful behavior becomes a first-class **RAG toggle** inside Chat. This removes the confusing peer mode while keeping retrieval visible and semantically honest.

## Architecture

### Single Runner, Explicit Presets

`chainManager.getChainRunner()` always returns `AutonomousAgentChainRunner`. The runner accepts a per-turn `ChainPreset`:

```ts
type PromptProfile = "chat" | "chat_rag" | "agent" | "project_agent" | "telegram";

interface ChainPreset {
  id: "chat" | "chat_rag" | "agent" | "project_agent" | "telegram";
  promptProfile: PromptProfile;
  runtimePolicy: RuntimeChainPolicy;
  tools: StructuredTool[];
  outputAdapter?: (text: string) => string | Promise<string>;
}
```

`promptProfile` controls the built-in mode instructions. `promptTarget` remains part of `RuntimeChainPolicy` for user-selected prompt storage (`default` vs `telegram`). This keeps runtime behavior separate from where custom prompt content is loaded from.

### Preset Mapping

| Preset        | UI state                                  | Tool source                              | Prompt profile  | Runtime policy                       | Output adapter     |
| ------------- | ----------------------------------------- | ---------------------------------------- | --------------- | ------------------------------------ | ------------------ |
| Chat          | `mode=chat`, `retrievalPolicy=none`       | resolved Chat read-only tools            | `chat`          | shared history, standard context     | none               |
| Chat + RAG    | `mode=chat`, `retrievalPolicy=vault_auto` | Chat read-only tools + `localSearch`     | `chat_rag`      | shared history, standard context     | none               |
| Agent         | `mode=agent`, `scope=global`              | resolved Agent tools                     | `agent`         | shared history, plus context         | none               |
| Project Agent | `mode=agent`, `scope=project`             | resolved Agent tools + project overrides | `project_agent` | shared history, plus project context | none               |
| Telegram      | `chainType=TELEGRAM_CHAIN` override       | existing Telegram full-builtin behavior  | `telegram`      | existing Telegram policy unchanged   | Telegram formatter |

`VAULT_QA_CHAIN` is removed from user-facing dispatch. `deriveChainType()` should stop mapping `retrievalPolicy=vault_auto` to a standalone runner; instead, retrieval policy participates in preset selection.

### Chat + RAG Semantics

Chat + RAG is retrieval-biased, not retrieval-forced. When the user asks a vault-grounded question, the `chat_rag` prompt profile instructs the model to use `localSearch` before answering. When the user says something like `Hi`, asks a generic writing question, or otherwise does not need vault grounding, the model may answer without calling `localSearch`.

This is intentional for efficiency. The RAG toggle means “make vault retrieval available and preferred when relevant,” not “run search on every turn.”

### Tool-Capability Errors

The runner branches by resolved tool list and model capability:

- **No tools resolved**: use raw streaming via `chatModel.stream(messages)`. This preserves plain Chat behavior and works with non-tool-capable models.
- **Tools resolved and model supports native tool calling**: call `bindTools()` and run the ReAct loop.
- **Tools resolved and model does not support native tool calling**: show a friendly natural error and do not silently answer without tools.

Suggested error copy:

> This model cannot use tools, so RAG or Agent mode will not work with it. Choose a model with tool-calling support or turn RAG off.

This rule prevents the UI from implying that RAG, Agent, Project Agent, or Telegram tool behavior happened when the model could not actually call tools.

## Tool Permission Model

### Access Levels

`ToolMetadata.category` remains the UI taxonomy (`search`, `time`, `file`, `media`, `mcp`, `memory`, `custom`, `cli`). Add a separate access field:

```ts
type ToolAccessLevel = "free" | "costly" | "write" | "mixed";

interface ToolMetadata {
  id: string;
  displayName: string;
  description: string;
  category: ToolUiCategory;
  accessLevel: ToolAccessLevel;
  operations?: Record<string, "read" | "write">;
}
```

Access semantics:

- `free`: passive, cheap, always available when its runtime dependency exists.
- `costly`: read-only but user-configurable because it may cost money, time, or external requests.
- `write`: mutates vault/app/external state; Agent-only.
- `mixed`: one registered tool can perform both read and write operations; not directly bindable in Chat.

Mixed tools are treated conservatively. Chat and Chat + RAG never bind a `mixed` tool directly. Implementation must either split the tool into read/write registrations or keep the mixed tool Agent-only.

Examples:

- Split `obsidianBases` into a read/query tool and a create/mutate tool, or mark the existing tool `mixed` and Agent-only.
- Split daily-note read/path behavior from create/update behavior, or mark the existing daily-note tool `mixed` and Agent-only.
- `writeFile`, `editFile`, and future note-mutating tools are `write`.
- `localSearch`, `webSearch`, and `youtubeTranscription` are `costly`.
- `getCurrentTime`, `getFileTree`, and `readNote` are `free` if they are passive and vault-safe.

### Permission Cascade

There are two levels: global defaults and project overrides. There are no per-thread tool permission overrides.

Global defaults live in settings:

```ts
toolDefaults: {
  chat: {
    webSearch: false,
    youtubeTranscription: false
  },
  agent: {
    localSearch: true,
    webSearch: true,
    youtubeTranscription: true,
    writeFile: true,
    editFile: true
  }
}
```

`localSearch` for Chat is controlled by the RAG toggle, not by generic Chat defaults.

Project overrides are Agent-only:

```ts
project.toolOverrides.agent: {
  localSearch: "inherit" | true | false,
  webSearch: "inherit" | true | false,
  writeFile: "inherit" | true | false,
  editFile: "inherit" | true | false
}
```

### Resolution API

Create `src/core/ToolPermissions.ts`:

```ts
interface ToolPermissionContext {
  surface: "chat" | "agent" | "telegram";
  ragEnabled?: boolean;
  projectId?: string;
}

function resolveToolPermissions(context: ToolPermissionContext): StructuredTool[];
```

Resolution rules:

1. Register built-in tools if needed and filter out vault-required tools when no vault is available.
2. Always include eligible `free` tools.
3. For `surface="chat"`, include enabled `costly` tools only; always filter out `write` and `mixed`.
4. For `surface="chat"` with `ragEnabled=true`, include `localSearch` even if generic Chat defaults omit it.
5. For `surface="agent"`, include enabled `costly`, `write`, and `mixed` tools; apply project tri-state overrides when `projectId` exists.
6. For `surface="telegram"`, preserve the existing Telegram full-builtin behavior from `RuntimeChainPolicy`; do not route it through normal Chat/Agent defaults.

## Prompt Profiles

Add a runtime `PromptProfile` layer:

```ts
type PromptProfile = "chat" | "chat_rag" | "agent" | "project_agent" | "telegram";
```

Prompt profile responsibilities:

- `chat`: conversational assistant, no autonomous/write behavior.
- `chat_rag`: conversational assistant with vault retrieval guidance; use `localSearch` for vault-grounded questions, but do not search for greetings or generic non-vault requests.
- `agent`: autonomous tool-using assistant; may call read and write tools according to permissions.
- `project_agent`: agent prompt plus project system prompt and project context.
- `telegram`: Telegram-safe assistant with transport-aware wording, isolated history, and Telegram formatting constraints.

`RuntimeChainPolicy` should gain `promptProfile`. `promptTarget` should remain for custom prompt source selection, with Telegram continuing to use `promptTarget: "telegram"`. Non-Telegram profiles can use the shared default custom prompt source unless a later feature adds per-profile custom prompt files.

## UI Surface

- Remove `Vault QA` as a peer mode.
- Keep Chat and Agent as visible interaction modes.
- Add a first-class RAG toggle for Chat. This sets `retrievalPolicy=vault_auto` and selects the `chat_rag` preset.
- Keep Project as Agent scope, not a separate runner family.
- Keep Telegram as transport/channel behavior with its own preset.
- Convert old per-thread tool toggles into resolved tool indicators where appropriate. The RAG toggle is the only Chat-level retrieval control; individual tool permissions live in settings/project config.
- Update suggested prompts so the old Vault QA prompts attach to Chat + RAG instead of a standalone Vault QA mode.

## Reasoning UI & Persistence

There are two separate persistence paths:

1. **UI markdown persistence**: what `ChatPersistenceManager` writes to saved chat files. Reasoning markers are saved with assistant display text so the reasoning panel can render on reload.
2. **LLM memory across turns/reloads**: what the model sees as context. This remains user/assistant content only; prior structured `AIMessage(tool_calls)` / `ToolMessage` chains are not reconstructed across reloads.

`AgentReasoningBlock` rendering in `ChatSingleMessage.tsx` becomes mode-agnostic. It renders whenever the assistant message contains reasoning markers, regardless of whether the response came from Chat + RAG, Agent, Project Agent, or Telegram.

Behavior:

- Plain Chat with no tool calls: no reasoning marker, no panel.
- Chat + RAG with a tool call: reasoning marker present, shared panel renders.
- Agent/Project Agent/Telegram with tool calls: shared panel renders.

The marker name is not renamed in this change.

## Code Changes

### Sequencing: Pre-Extraction Required

`AutonomousAgentChainRunner` currently extends `ToolChainRunner`. Before deleting `ToolChainRunner`, lift the shared behavior it owns into `BaseChainRunner` or focused utilities:

1. Multimodal content assembly.
2. Model capability checks, including native tool-calling support.
3. Local-search result formatting.
4. Shared raw streaming path.
5. Friendly tool-capability error handling.

Then change `AutonomousAgentChainRunner` to extend `BaseChainRunner`.

### Delete

- `src/LLMProviders/chainRunner/LLMChainRunner.ts` and its test.
- `src/LLMProviders/chainRunner/ToolChainRunner.ts`.
- `src/LLMProviders/chainRunner/VaultQAChainRunner.ts`.
- `src/LLMProviders/chainRunner/ProjectChainRunner.ts`.
- `src/chainFactory.ts` if no remaining imports require it after replacing `ChainType` dispatch.
- `enableAutonomousAgent` and all UI/settings branches depending on it.
- The user-facing Vault QA mode.

No migration or backwards-compatibility shim is required for removed settings or modes.

### Add

- `src/LLMProviders/chainRunner/presets/` with presets for `chat`, `chat_rag`, `agent`, `project_agent`, and `telegram`.
- `src/core/ToolPermissions.ts` with `resolveToolPermissions()`.
- `ToolMetadata.accessLevel` and optional `ToolMetadata.operations`.
- `RuntimeChainPolicy.promptProfile`.
- Prompt-profile support in the system prompt builder.

### Modify

- `aiParams.ts`: stop deriving a standalone Vault QA chain from `retrievalPolicy=vault_auto`; use retrieval policy during preset selection instead.
- `RuntimeChainPolicy.ts`: preserve Telegram policy, add `promptProfile`, and map Chat/Agent/Project/Telegram presets explicitly.
- `chainManager.runChain()`: construct the preset, resolve tools, and pass the preset to `AutonomousAgentChainRunner`.
- `AutonomousAgentChainRunner`: branch between raw streaming, ReAct loop, and friendly tool-capability error.
- `ToolRegistry` and all built-in tool registrations: set `accessLevel`; mark unsplit mixed tools as `mixed` and Agent-only.
- Chat UI controls: replace Vault QA with a RAG toggle; remove old autonomous-agent toggles.
- `SuggestedPrompts.tsx`: move Vault QA-style prompts under Chat + RAG.
- `settings/model.ts`: add `toolDefaults` and project `toolOverrides`; remove `enableAutonomousAgent`.
- User docs in `docs/`: explain Chat, Chat + RAG, Agent, Project Agent, and Telegram behavior in non-technical terms.

## Tests

- `ToolPermissions.test.ts`

  - Chat includes `free` tools and enabled `costly` tools.
  - Chat filters out `write` and `mixed`.
  - Chat + RAG includes `localSearch`.
  - Agent includes enabled `costly`, `write`, and `mixed`.
  - Project Agent applies tri-state overrides.
  - Telegram preserves full-builtin policy.

- `AutonomousAgentChainRunner.test.ts`

  - Plain Chat with no tools uses raw streaming and does not call `bindTools()`.
  - Tool-required preset with a non-tool-capable model returns the friendly natural error.
  - Chat + RAG with a greeting can complete without `localSearch`.
  - Chat + RAG with a vault-grounded request can call `localSearch` and render reasoning.
  - Agent and Project Agent run the ReAct path with resolved tools.
  - Telegram preset preserves prompt profile, history scope, and output adapter.

- UI tests

  - Vault QA is not rendered as a peer mode.
  - RAG toggle selects the `chat_rag` preset.
  - Suggested prompts reflect Chat + RAG instead of Vault QA.
  - Old autonomous-agent toggle controls are removed.

- Docs/tests cleanup
  - Remove tests that assert `LLMChainRunner`, `ToolChainRunner`, `VaultQAChainRunner`, or `ProjectChainRunner` dispatch.
  - Update user-facing docs for the new mode model.

## Non-Goals / Deferred

- Migration or backwards compatibility for old settings, old modes, old runners, or old internal APIs.
- Per-thread tool permission overrides.
- Cross-reload reconstruction of structured `AIMessage(tool_calls)` / `ToolMessage` history.
- Renaming the existing reasoning marker.
- Fine-grained MCP metadata beyond default `accessLevel: "costly"`.
- Splitting every mixed tool in the first pass. Mixed tools that are not split are Agent-only.

## Open Implementation Notes

- `localSearch` should be controlled by Chat's RAG toggle, not by generic Chat tool defaults.
- `mixed` tools should be reviewed one by one. Prefer split read/write registrations when the read side is useful in Chat; otherwise keep the tool Agent-only.
- Telegram must continue to use isolated memory, Telegram prompt target/profile, fixed tool behavior, typing/reply state, and Telegram outbound formatting.
- The iteration cap stays uniform across tool-using presets unless a later feature creates per-preset limits.
