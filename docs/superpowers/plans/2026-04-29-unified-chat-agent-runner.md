# Unified Chat Agent Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route Chat, Chat + RAG, Agent, Project Agent, and Telegram through `AutonomousAgentChainRunner` while preserving the visible capability boundaries from the approved design.

**Architecture:** Replace legacy runner dispatch with explicit preset IDs derived from the existing mode, scope, and retrieval atoms. Move shared raw streaming, multimodal message assembly, model capability checks, and local-search formatting into reusable runner utilities, then make `AutonomousAgentChainRunner` choose raw streaming or native-tool ReAct execution from the resolved preset. Keep reasoning markers mode-agnostic in local UI persistence while keeping Telegram transport and Telegram memory on clean canonical text.

**Tech Stack:** TypeScript, React, Jotai, LangChain, Jest, Testing Library, Obsidian plugin APIs, Tailwind

---

## Scope Check

This is one integrated implementation plan. Tool permissions, prompt profiles, runner execution, and the Chat/RAG UI are not independent features: each depends on the new preset contract. The work is split into small tasks so each step can be tested before the legacy runner files are deleted.

## File Structure

Create:

- `src/runtime/ChainPreset.ts`: shared preset IDs, prompt profiles, and per-turn preset contract.
- `src/LLMProviders/chainRunner/presets/ChainPresetResolver.ts`: maps active UI state or Telegram override into one `ChainPreset`.
- `src/LLMProviders/chainRunner/presets/ChainPresetResolver.test.ts`: verifies Chat, Chat + RAG, Agent, Project Agent, and Telegram preset mapping.
- `src/core/ToolPermissions.ts`: resolves tool lists from metadata, settings defaults, RAG state, and project overrides.
- `src/core/ToolPermissions.test.ts`: verifies Chat, Chat + RAG, Agent, Project Agent, and Telegram tool resolution.
- `src/LLMProviders/chainRunner/utils/runnerMessages.ts`: shared envelope-to-LangChain message assembly and multimodal content support.
- `src/LLMProviders/chainRunner/utils/rawStreaming.ts`: shared no-tools streaming path.
- `src/LLMProviders/chainRunner/utils/localSearchResultFormatting.ts`: local-search LLM/display/source formatting lifted from `ToolChainRunner`.
- `src/aiParams.test.ts`: verifies mode/scope/retrieval to preset derivation.

Modify:

- `src/aiParams.ts`: expose preset IDs instead of legacy chain types.
- `src/runtime/RuntimeChainPolicy.ts`: add `promptProfile` and resolve by preset ID.
- `src/core/MessagePreparationService.ts`: accept preset/runtime policy and use policy/profile for project and Telegram behavior.
- `src/core/ContextManager.ts` and `src/contextProcessor.ts`: replace direct `ChainType` checks with runtime policy checks.
- `src/LLMProviders/chainManager.ts`: construct presets and always use `AutonomousAgentChainRunner`.
- `src/LLMProviders/chainRunner/BaseChainRunner.ts`: accept `ChainPreset` in runner options.
- `src/LLMProviders/chainRunner/AutonomousAgentChainRunner.ts`: extend `BaseChainRunner`, branch on preset tools, and remove fallback to `ToolChainRunner`.
- `src/tools/ToolRegistry.ts` and `src/tools/builtinTools.ts`: add `accessLevel` and optional `operations` metadata to every tool.
- `src/settings/model.ts`, `src/constants.ts`, `src/settings/v2/components/ToolSettingsSection.tsx`, `src/settings/v2/components/CortexPlusSettings.tsx`: replace autonomous-agent enablement and tool ID settings with tool defaults.
- `src/components/chat-components/ChainModeSelector.tsx`, `src/components/chat-components/SuggestedPrompts.tsx`, `src/components/chat-components/ChatInput.tsx`, `src/components/chat-components/LexicalEditor.tsx`, `src/hooks/useProjectContextStatus.ts`, `src/search/indexEventHandler.ts`: update from legacy chain types to preset/mode/scope policy.
- `src/channels/telegram/TelegramAgent.ts`: pin Telegram runs to the `telegram` preset and keep isolated memory/formatting.
- User docs in `docs/`: update Chat, Chat + RAG, Agent, Project Agent, Telegram, and vault search explanations.

Delete after callers are migrated:

- `src/LLMProviders/chainRunner/LLMChainRunner.ts`
- `src/LLMProviders/chainRunner/LLMChainRunner.test.ts`
- `src/LLMProviders/chainRunner/ToolChainRunner.ts`
- `src/LLMProviders/chainRunner/VaultQAChainRunner.ts`
- `src/LLMProviders/chainRunner/ProjectChainRunner.ts`
- `src/chainFactory.ts`

## Implementation Tasks

### Task 1: Add Preset Types and Replace Legacy Derivation

**Files:**

- Create: `src/runtime/ChainPreset.ts`
- Create: `src/aiParams.test.ts`
- Modify: `src/aiParams.ts`

- [x] **Step 1: Write preset derivation tests**

Add `src/aiParams.test.ts`:

```ts
import { deriveChainPresetId } from "@/aiParams";

describe("deriveChainPresetId", () => {
  it("maps plain chat to the chat preset", () => {
    expect(deriveChainPresetId("chat", "global", "none")).toBe("chat");
  });

  it("maps chat with vault retrieval to the chat_rag preset", () => {
    expect(deriveChainPresetId("chat", "global", "vault_auto")).toBe("chat_rag");
  });

  it("maps global agent to the agent preset", () => {
    expect(deriveChainPresetId("agent", "global", "none")).toBe("agent");
  });

  it("maps project agent to the project_agent preset", () => {
    expect(deriveChainPresetId("agent", "project", "vault_auto")).toBe("project_agent");
  });
});
```

- [x] **Step 2: Run the failing test**

Run:

```bash
npm test -- --runTestsByPath src/aiParams.test.ts --runInBand
```

Expected: FAIL because `deriveChainPresetId` does not exist.

- [x] **Step 3: Add shared preset types**

Add `src/runtime/ChainPreset.ts`:

```ts
import { StructuredTool } from "@langchain/core/tools";
import { RuntimeChainPolicy } from "@/runtime/RuntimeChainPolicy";

export type ChainPresetId = "chat" | "chat_rag" | "agent" | "project_agent" | "telegram";

export type PromptProfile = ChainPresetId;

export interface ChainPreset {
  id: ChainPresetId;
  promptProfile: PromptProfile;
  runtimePolicy: RuntimeChainPolicy;
  tools: StructuredTool[];
  outputAdapter?: (text: string) => string | Promise<string>;
}

export type InteractionMode = "chat" | "agent";
export type InteractionScope = "global" | "project";
export type RetrievalPolicy = "none" | "vault_auto";

export const TOOL_CAPABILITY_ERROR =
  "This model cannot use tools, so RAG or Agent mode will not work with it. Choose a model with tool-calling support or turn RAG off.";
```

- [x] **Step 4: Update `aiParams.ts` derivation**

In `src/aiParams.ts`, remove `ChainType` imports and replace the derivation section with:

```ts
import {
  ChainPresetId,
  InteractionMode as Mode,
  InteractionScope as Scope,
  RetrievalPolicy,
} from "@/runtime/ChainPreset";

export type { Mode, Scope, RetrievalPolicy };

export function deriveChainPresetId(
  mode: Mode,
  scope: Scope,
  retrievalPolicy: RetrievalPolicy
): ChainPresetId {
  if (mode === "agent") {
    return scope === "project" ? "project_agent" : "agent";
  }

  return retrievalPolicy === "vault_auto" ? "chat_rag" : "chat";
}
```

Replace `chainTypeAtom`, `getChainType`, `setChainType`, `subscribeToChainTypeChange`, and `useChainType` with preset equivalents:

```ts
const chainPresetIdAtom = atom(
  (get) => deriveChainPresetId(get(modeAtom), get(scopeAtom), get(retrievalPolicyAtom)),
  (get, set, newValue: ChainPresetId) => {
    switch (newValue) {
      case "chat":
        set(userModeAtom, "chat");
        set(userRetrievalPolicyAtom, "none");
        return;
      case "chat_rag":
        set(userModeAtom, "chat");
        set(userRetrievalPolicyAtom, "vault_auto");
        return;
      case "agent":
        set(userModeAtom, "agent");
        set(userScopeAtom, "global");
        return;
      case "project_agent":
        set(userModeAtom, "agent");
        set(userScopeAtom, "project");
        return;
      case "telegram":
        return;
    }
  }
);

export function getChainPresetId(): ChainPresetId {
  return settingsStore.get(chainPresetIdAtom);
}

export function setChainPresetId(presetId: ChainPresetId) {
  settingsStore.set(chainPresetIdAtom, presetId);
}

export function subscribeToChainPresetIdChange(callback: () => void): () => void {
  return settingsStore.sub(chainPresetIdAtom, callback);
}

export function useChainPresetId() {
  return useAtom(chainPresetIdAtom, {
    store: settingsStore,
  });
}
```

- [x] **Step 5: Run the focused test**

Run:

```bash
npm test -- --runTestsByPath src/aiParams.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

Execution note: deferred in inline workspace execution; no commit created for this slice.

Run:

```bash
git add src/runtime/ChainPreset.ts src/aiParams.ts src/aiParams.test.ts
git commit -m "refactor: add chain preset state"
```

### Task 2: Add Prompt Profiles to Runtime Policy

**Files:**

- Modify: `src/runtime/RuntimeChainPolicy.ts`
- Modify: `src/runtime/RuntimeChainPolicy.test.ts`
- Modify later callers that compile against `RuntimeChainPolicy`

- [x] **Step 1: Update runtime policy tests**

Replace the first two tests in `src/runtime/RuntimeChainPolicy.test.ts` with:

```ts
import {
  injectVirtualToolMarkers,
  resolveRuntimeChainPolicy,
  TELEGRAM_FORCED_MANUAL_TOOL_MARKERS,
} from "@/runtime/RuntimeChainPolicy";

describe("RuntimeChainPolicy", () => {
  it("resolves telegram to isolated prompt/tool policies", () => {
    const policy = resolveRuntimeChainPolicy("telegram");

    expect(policy.promptProfile).toBe("telegram");
    expect(policy.promptTarget).toBe("telegram");
    expect(policy.richContextPolicy).toBe("plus");
    expect(policy.manualToolPolicy).toBe("forced_virtual_markers");
    expect(policy.autonomousToolPolicy).toBe("full_builtin");
    expect(policy.historyScope).toBe("telegram_visible_thread");
  });

  it("resolves chat_rag as conversational chat with plus context", () => {
    const policy = resolveRuntimeChainPolicy("chat_rag");

    expect(policy.promptProfile).toBe("chat_rag");
    expect(policy.promptTarget).toBe("default");
    expect(policy.richContextPolicy).toBe("plus");
    expect(policy.manualToolPolicy).toBe("ui_markers");
    expect(policy.autonomousToolPolicy).toBe("settings_filtered");
    expect(policy.historyScope).toBe("shared_repo");
  });
});
```

Keep the existing virtual-marker injection test.

- [x] **Step 2: Run the failing policy test**

Run:

```bash
npm test -- --runTestsByPath src/runtime/RuntimeChainPolicy.test.ts --runInBand
```

Expected: FAIL because the resolver still accepts `ChainType` and does not return `promptProfile`.

- [x] **Step 3: Update `RuntimeChainPolicy.ts`**

Replace the `ChainType` import and policy interface with:

```ts
import { ChainPresetId, PromptProfile } from "@/runtime/ChainPreset";

export type PromptResolutionTarget = "default" | "telegram";
export type RichContextPolicy = "standard" | "plus";
export type ManualToolPolicy = "ui_markers" | "forced_virtual_markers";
export type AutonomousToolPolicy = "settings_filtered" | "full_builtin";
export type HistoryScope = "shared_repo" | "telegram_visible_thread";

export interface RuntimeChainPolicy {
  presetId: ChainPresetId;
  promptProfile: PromptProfile;
  promptTarget: PromptResolutionTarget;
  richContextPolicy: RichContextPolicy;
  manualToolPolicy: ManualToolPolicy;
  autonomousToolPolicy: AutonomousToolPolicy;
  historyScope: HistoryScope;
}
```

Replace `resolveRuntimeChainPolicy` with:

```ts
export function resolveRuntimeChainPolicy(presetId: ChainPresetId): RuntimeChainPolicy {
  switch (presetId) {
    case "telegram":
      return {
        presetId,
        promptProfile: "telegram",
        promptTarget: "telegram",
        richContextPolicy: "plus",
        manualToolPolicy: "forced_virtual_markers",
        autonomousToolPolicy: "full_builtin",
        historyScope: "telegram_visible_thread",
      };
    case "agent":
      return {
        presetId,
        promptProfile: "agent",
        promptTarget: "default",
        richContextPolicy: "plus",
        manualToolPolicy: "ui_markers",
        autonomousToolPolicy: "settings_filtered",
        historyScope: "shared_repo",
      };
    case "project_agent":
      return {
        presetId,
        promptProfile: "project_agent",
        promptTarget: "default",
        richContextPolicy: "plus",
        manualToolPolicy: "ui_markers",
        autonomousToolPolicy: "settings_filtered",
        historyScope: "shared_repo",
      };
    case "chat_rag":
      return {
        presetId,
        promptProfile: "chat_rag",
        promptTarget: "default",
        richContextPolicy: "plus",
        manualToolPolicy: "ui_markers",
        autonomousToolPolicy: "settings_filtered",
        historyScope: "shared_repo",
      };
    case "chat":
      return {
        presetId,
        promptProfile: "chat",
        promptTarget: "default",
        richContextPolicy: "standard",
        manualToolPolicy: "ui_markers",
        autonomousToolPolicy: "settings_filtered",
        historyScope: "shared_repo",
      };
  }
}
```

- [x] **Step 4: Run the focused policy test**

Run:

```bash
npm test -- --runTestsByPath src/runtime/RuntimeChainPolicy.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

Execution note: deferred in inline workspace execution; no commit created for this slice.

Run:

```bash
git add src/runtime/RuntimeChainPolicy.ts src/runtime/RuntimeChainPolicy.test.ts
git commit -m "refactor: resolve runtime policy by preset"
```

### Task 3: Add Tool Access Metadata and Settings Shape

**Files:**

- Modify: `src/tools/ToolRegistry.ts`
- Modify: `src/tools/builtinTools.ts`
- Modify: `src/settings/model.ts`
- Modify: `src/constants.ts`
- Modify: `src/settings/model.test.ts`

- [x] **Step 1: Write settings and metadata tests**

Add tests to `src/settings/model.test.ts`:

```ts
it("sanitizes toolDefaults when missing", () => {
  const result = sanitizeSettings({} as any);

  expect(result.toolDefaults.chat.webSearch).toBe(false);
  expect(result.toolDefaults.chat.youtubeTranscription).toBe(false);
  expect(result.toolDefaults.agent.localSearch).toBe(true);
  expect(result.toolDefaults.agent.writeFile).toBe(true);
});
```

Add a metadata validation check to `src/tools/allTools.validation.test.ts`:

```ts
expect(["free", "costly", "write", "mixed"]).toContain(metadata.accessLevel);
```

- [x] **Step 2: Run failing tests**

Run:

```bash
npm test -- --runTestsByPath src/settings/model.test.ts src/tools/allTools.validation.test.ts --runInBand
```

Expected: FAIL because `toolDefaults` and `metadata.accessLevel` do not exist.

- [x] **Step 3: Extend `ToolMetadata`**

In `src/tools/ToolRegistry.ts`, add:

```ts
export type ToolAccessLevel = "free" | "costly" | "write" | "mixed";
export type ToolOperationAccess = "read" | "write";
export type ToolUiCategory =
  | "search"
  | "time"
  | "file"
  | "media"
  | "mcp"
  | "memory"
  | "custom"
  | "cli";
```

Update `ToolMetadata`:

```ts
export interface ToolMetadata {
  id: string;
  displayName: string;
  description: string;
  category: ToolUiCategory;
  accessLevel: ToolAccessLevel;
  operations?: Record<string, ToolOperationAccess>;
  isAlwaysEnabled?: boolean;
  requiresVault?: boolean;
  customPromptInstructions?: string;
  CortexCommands?: string[];
  timeoutMs?: number;
  isBackground?: boolean;
  requiresUserMessageContent?: boolean;
}
```

Update `getConfigurableTools` so `free` tools are not toggled:

```ts
getConfigurableTools(): ToolDefinition[] {
  return Array.from(this.tools.values()).filter(
    (def) => !def.metadata.isAlwaysEnabled && def.metadata.accessLevel !== "free"
  );
}
```

- [x] **Step 4: Add access metadata to built-in tools**

In `src/tools/builtinTools.ts`, set:

```ts
localSearch.accessLevel = "costly";
webSearch.accessLevel = "costly";
getCurrentTime.accessLevel = "free";
getTimeInfo.accessLevel = "free";
getTimeRangeMs.accessLevel = "free";
convertTimezones.accessLevel = "free";
readNote.accessLevel = "free";
writeFile.accessLevel = "write";
editFile.accessLevel = "write";
youtubeTranscription.accessLevel = "costly";
getFileTree.accessLevel = "free";
getTagList.accessLevel = "free";
updateMemory.accessLevel = "write";
obsidianDailyNote.accessLevel = "mixed";
obsidianRandomRead.accessLevel = "free";
obsidianProperties.accessLevel = "mixed";
obsidianTasks.accessLevel = "mixed";
obsidianLinks.accessLevel = "free";
obsidianTemplates.accessLevel = "mixed";
obsidianBases.accessLevel = "mixed";
```

Use actual object properties in each `metadata` literal:

```ts
metadata: {
  id: "writeFile",
  displayName: "Write to File",
  description: "Create or overwrite a note in the vault.",
  category: "file",
  accessLevel: "write",
  requiresVault: true,
  CortexCommands: ["@composer"],
  customPromptInstructions: `For writeFile:
...existing instructions...`,
}
```

- [x] **Step 5: Add settings defaults**

In `src/settings/model.ts`, add types near `CortexSettings`:

```ts
export type ToolDefaultSettings = {
  chat: Record<string, boolean>;
  agent: Record<string, boolean>;
};
```

Add to `CortexSettings`:

```ts
toolDefaults: ToolDefaultSettings;
```

Remove these fields:

```ts
enableAutonomousAgent: boolean;
autonomousAgentEnabledToolIds: string[];
```

Keep `autonomousAgentMaxIterations` for the uniform iteration cap.

In `src/constants.ts` `DEFAULT_SETTINGS`, replace the old enable/tool ID settings with:

```ts
toolDefaults: {
  chat: {
    webSearch: false,
    youtubeTranscription: false,
  },
  agent: {
    localSearch: true,
    webSearch: true,
    youtubeTranscription: true,
    writeFile: true,
    editFile: true,
    updateMemory: true,
    obsidianDailyNote: false,
    obsidianProperties: false,
    obsidianTasks: false,
    obsidianTemplates: false,
    obsidianBases: false,
  },
},
```

In `sanitizeSettings`, add:

```ts
if (!sanitizedSettings.toolDefaults || typeof sanitizedSettings.toolDefaults !== "object") {
  sanitizedSettings.toolDefaults = DEFAULT_SETTINGS.toolDefaults;
}

sanitizedSettings.toolDefaults = {
  chat: {
    ...DEFAULT_SETTINGS.toolDefaults.chat,
    ...(sanitizedSettings.toolDefaults.chat ?? {}),
  },
  agent: {
    ...DEFAULT_SETTINGS.toolDefaults.agent,
    ...(sanitizedSettings.toolDefaults.agent ?? {}),
  },
};
```

Remove the legacy `autonomousAgentEnabledToolIds` rename block.

- [x] **Step 6: Run focused tests**

Run:

```bash
npm test -- --runTestsByPath src/settings/model.test.ts src/tools/allTools.validation.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit**

Execution note: deferred in inline workspace execution; no commit created for this slice.

Run:

```bash
git add src/tools/ToolRegistry.ts src/tools/builtinTools.ts src/settings/model.ts src/constants.ts src/settings/model.test.ts src/tools/allTools.validation.test.ts
git commit -m "refactor: add tool access metadata"
```

### Task 4: Implement Tool Permission Resolution

**Files:**

- Create: `src/core/ToolPermissions.ts`
- Create: `src/core/ToolPermissions.test.ts`
- Modify: `src/aiParams.ts` project config type

- [x] **Step 1: Write permission tests**

Add `src/core/ToolPermissions.test.ts`:

```ts
import { StructuredTool } from "@langchain/core/tools";
import { resolveToolPermissions } from "@/core/ToolPermissions";
import { ToolRegistry } from "@/tools/ToolRegistry";

const makeTool = (name: string) => ({ name }) as StructuredTool;

describe("resolveToolPermissions", () => {
  beforeEach(() => {
    ToolRegistry.getInstance().clear();
    const registry = ToolRegistry.getInstance();
    registry.registerAll([
      {
        tool: makeTool("getCurrentTime"),
        metadata: {
          id: "getCurrentTime",
          displayName: "Time",
          description: "Read current time.",
          category: "time",
          accessLevel: "free",
        },
      },
      {
        tool: makeTool("localSearch"),
        metadata: {
          id: "localSearch",
          displayName: "Vault Search",
          description: "Search notes.",
          category: "search",
          accessLevel: "costly",
          requiresVault: true,
        },
      },
      {
        tool: makeTool("webSearch"),
        metadata: {
          id: "webSearch",
          displayName: "Web Search",
          description: "Search web.",
          category: "search",
          accessLevel: "costly",
        },
      },
      {
        tool: makeTool("writeFile"),
        metadata: {
          id: "writeFile",
          displayName: "Write File",
          description: "Write vault file.",
          category: "file",
          accessLevel: "write",
          requiresVault: true,
        },
      },
      {
        tool: makeTool("obsidianBases"),
        metadata: {
          id: "obsidianBases",
          displayName: "Bases",
          description: "Read or modify bases.",
          category: "cli",
          accessLevel: "mixed",
          requiresVault: true,
        },
      },
    ]);
  });

  it("chat includes free tools and enabled costly tools but excludes write and mixed tools", () => {
    const tools = resolveToolPermissions({
      surface: "chat",
      ragEnabled: false,
      vaultAvailable: true,
      toolDefaults: {
        chat: { webSearch: true },
        agent: {},
      },
    });

    expect(tools.map((tool) => tool.name)).toEqual(["getCurrentTime", "webSearch"]);
  });

  it("chat with RAG includes localSearch regardless of generic chat defaults", () => {
    const tools = resolveToolPermissions({
      surface: "chat",
      ragEnabled: true,
      vaultAvailable: true,
      toolDefaults: {
        chat: { webSearch: false },
        agent: {},
      },
    });

    expect(tools.map((tool) => tool.name)).toContain("localSearch");
  });

  it("agent includes enabled costly, write, and mixed tools", () => {
    const tools = resolveToolPermissions({
      surface: "agent",
      vaultAvailable: true,
      toolDefaults: {
        chat: {},
        agent: { localSearch: true, writeFile: true, obsidianBases: true },
      },
    });

    expect(tools.map((tool) => tool.name)).toEqual([
      "getCurrentTime",
      "localSearch",
      "writeFile",
      "obsidianBases",
    ]);
  });
});
```

- [x] **Step 2: Run the failing permission test**

Run:

```bash
npm test -- --runTestsByPath src/core/ToolPermissions.test.ts --runInBand
```

Expected: FAIL because `ToolPermissions.ts` does not exist.

- [x] **Step 3: Add project override type**

In `src/aiParams.ts`, add:

```ts
export type ToolOverrideValue = "inherit" | boolean;

export interface ProjectToolOverrides {
  agent?: Record<string, ToolOverrideValue>;
}
```

Add to `ProjectConfig`:

```ts
toolOverrides?: ProjectToolOverrides;
```

- [x] **Step 4: Implement `ToolPermissions.ts`**

Add:

```ts
import { getCurrentProject } from "@/aiParams";
import { getSettings, ToolDefaultSettings } from "@/settings/model";
import { initializeBuiltinTools } from "@/tools/builtinTools";
import { ToolDefinition, ToolRegistry } from "@/tools/ToolRegistry";
import { StructuredTool } from "@langchain/core/tools";
import { Vault } from "obsidian";

export interface ToolPermissionContext {
  surface: "chat" | "agent" | "telegram";
  ragEnabled?: boolean;
  projectId?: string;
  vaultAvailable?: boolean;
  vault?: Vault;
  toolDefaults?: ToolDefaultSettings;
}

function ensureToolsInitialized(vault?: Vault): ToolRegistry {
  const registry = ToolRegistry.getInstance();
  if (registry.getAllTools().length === 0) {
    initializeBuiltinTools(vault);
  }
  return registry;
}

function isAvailableForVault(definition: ToolDefinition, vaultAvailable: boolean): boolean {
  return !definition.metadata.requiresVault || vaultAvailable;
}

function isEnabled(defaults: Record<string, boolean>, id: string): boolean {
  return defaults[id] === true;
}

function applyProjectOverride(defaultValue: boolean, toolId: string): boolean {
  const override = getCurrentProject()?.toolOverrides?.agent?.[toolId];
  if (override === "inherit" || override === undefined) {
    return defaultValue;
  }
  return override;
}

export function resolveToolPermissions(context: ToolPermissionContext): StructuredTool[] {
  const registry = ensureToolsInitialized(context.vault);
  const vaultAvailable = context.vaultAvailable ?? !!context.vault;

  if (context.surface === "telegram") {
    return registry
      .getAllTools()
      .filter((definition) => isAvailableForVault(definition, vaultAvailable))
      .map((definition) => definition.tool);
  }

  const defaults = context.toolDefaults ?? getSettings().toolDefaults;
  const resolved: StructuredTool[] = [];

  for (const definition of registry.getAllTools()) {
    const { metadata, tool } = definition;
    if (!isAvailableForVault(definition, vaultAvailable)) {
      continue;
    }

    if (metadata.accessLevel === "free") {
      resolved.push(tool);
      continue;
    }

    if (context.surface === "chat") {
      if (metadata.accessLevel === "write" || metadata.accessLevel === "mixed") {
        continue;
      }
      if (metadata.id === "localSearch" && context.ragEnabled) {
        resolved.push(tool);
        continue;
      }
      if (metadata.accessLevel === "costly" && isEnabled(defaults.chat, metadata.id)) {
        resolved.push(tool);
      }
      continue;
    }

    const enabledByDefault = isEnabled(defaults.agent, metadata.id);
    if (applyProjectOverride(enabledByDefault, metadata.id)) {
      resolved.push(tool);
    }
  }

  return resolved;
}
```

- [x] **Step 5: Run focused permission tests**

Run:

```bash
npm test -- --runTestsByPath src/core/ToolPermissions.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

Execution note: deferred in inline workspace execution; no commit created for this slice.

Run:

```bash
git add src/core/ToolPermissions.ts src/core/ToolPermissions.test.ts src/aiParams.ts
git commit -m "feat: resolve tools by preset permissions"
```

### Task 5: Build Chain Presets

**Files:**

- Create: `src/LLMProviders/chainRunner/presets/ChainPresetResolver.ts`
- Create: `src/LLMProviders/chainRunner/presets/ChainPresetResolver.test.ts`
- Modify: `src/LLMProviders/chainRunner/index.ts`

- [x] **Step 1: Write preset resolver tests**

Add `src/LLMProviders/chainRunner/presets/ChainPresetResolver.test.ts`:

```ts
import { buildChainPreset } from "@/LLMProviders/chainRunner/presets/ChainPresetResolver";

jest.mock("@/core/ToolPermissions", () => ({
  resolveToolPermissions: jest.fn((context) => [{ name: `${context.surface}-tool` }]),
}));

describe("buildChainPreset", () => {
  it("builds the plain chat preset without RAG", () => {
    const preset = buildChainPreset({
      presetId: "chat",
      vaultAvailable: true,
    });

    expect(preset.id).toBe("chat");
    expect(preset.promptProfile).toBe("chat");
    expect(preset.runtimePolicy.promptProfile).toBe("chat");
  });

  it("builds the chat_rag preset with RAG enabled", () => {
    const preset = buildChainPreset({
      presetId: "chat_rag",
      vaultAvailable: true,
    });

    expect(preset.id).toBe("chat_rag");
    expect(preset.runtimePolicy.richContextPolicy).toBe("plus");
  });

  it("builds telegram with full-builtin policy", () => {
    const preset = buildChainPreset({
      presetId: "telegram",
      vaultAvailable: true,
    });

    expect(preset.id).toBe("telegram");
    expect(preset.runtimePolicy.promptTarget).toBe("telegram");
    expect(preset.runtimePolicy.historyScope).toBe("telegram_visible_thread");
  });
});
```

- [x] **Step 2: Run the failing preset test**

Run:

```bash
npm test -- --runTestsByPath src/LLMProviders/chainRunner/presets/ChainPresetResolver.test.ts --runInBand
```

Expected: FAIL because the resolver does not exist.

- [x] **Step 3: Implement preset resolver**

Add:

```ts
import { ChainPreset, ChainPresetId } from "@/runtime/ChainPreset";
import { resolveRuntimeChainPolicy } from "@/runtime/RuntimeChainPolicy";
import { resolveToolPermissions } from "@/core/ToolPermissions";
import { formatTelegramOutboundMessage } from "@/channels/telegram/telegramOutboundFormat";
import { Vault } from "obsidian";

export interface BuildChainPresetOptions {
  presetId: ChainPresetId;
  projectId?: string;
  vault?: Vault;
  vaultAvailable?: boolean;
}

export function buildChainPreset(options: BuildChainPresetOptions): ChainPreset {
  const runtimePolicy = resolveRuntimeChainPolicy(options.presetId);
  const surface =
    options.presetId === "telegram"
      ? "telegram"
      : options.presetId === "agent" || options.presetId === "project_agent"
        ? "agent"
        : "chat";

  const tools = resolveToolPermissions({
    surface,
    ragEnabled: options.presetId === "chat_rag",
    projectId: options.projectId,
    vault: options.vault,
    vaultAvailable: options.vaultAvailable,
  });

  return {
    id: options.presetId,
    promptProfile: runtimePolicy.promptProfile,
    runtimePolicy,
    tools,
    outputAdapter:
      options.presetId === "telegram"
        ? (text: string) => formatTelegramOutboundMessage(text).storageText
        : undefined,
  };
}
```

- [x] **Step 4: Export the resolver**

In `src/LLMProviders/chainRunner/index.ts`, add:

```ts
export { buildChainPreset } from "./presets/ChainPresetResolver";
export type { BuildChainPresetOptions } from "./presets/ChainPresetResolver";
```

- [x] **Step 5: Run focused preset tests**

Run:

```bash
npm test -- --runTestsByPath src/LLMProviders/chainRunner/presets/ChainPresetResolver.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

Execution note: deferred in inline workspace execution; no commit created for this slice.

Run:

```bash
git add src/LLMProviders/chainRunner/presets src/LLMProviders/chainRunner/index.ts
git commit -m "feat: build chain presets"
```

### Task 6: Extract Shared Runner Utilities Before Deleting Runners

**Files:**

- Create: `src/LLMProviders/chainRunner/utils/runnerMessages.ts`
- Create: `src/LLMProviders/chainRunner/utils/rawStreaming.ts`
- Create: `src/LLMProviders/chainRunner/utils/localSearchResultFormatting.ts`
- Modify: `src/LLMProviders/chainRunner/BaseChainRunner.ts`
- Modify: `src/LLMProviders/chainRunner/LLMChainRunner.ts`
- Modify: `src/LLMProviders/chainRunner/ToolChainRunner.ts`
- Modify: existing runner tests

- [x] **Step 1: Add utility tests by moving existing behavior assertions**

Move or add focused tests that verify:

```ts
// runnerMessages
expect(messages[0].role).toBe("system");
expect(messages[messages.length - 1].role).toBe("user");

// rawStreaming
expect(updateCurrentAiMessage).toHaveBeenCalledWith(expect.stringContaining("hello"));

// localSearchResultFormatting
expect(result.formattedForLLM).toContain("<localSearch>");
expect(result.sources[0].path).toBe("note.md");
```

Use exact fixtures from existing `LLMChainRunner.test.ts` and `AutonomousAgentChainRunner.test.ts` where available so behavior is preserved before refactoring.

- [x] **Step 2: Run the utility tests and confirm they fail**

Run:

```bash
npm test -- --runTestsByPath src/LLMProviders/chainRunner/LLMChainRunner.test.ts src/LLMProviders/chainRunner/AutonomousAgentChainRunner.test.ts --runInBand
```

Expected: existing tests still pass before extraction. New utility test paths fail until files are created.

- [x] **Step 3: Extract envelope message assembly**

Create `runnerMessages.ts` with functions copied from `LLMChainRunner.constructMessages()` and the multimodal helpers in `ToolChainRunner`:

```ts
export interface BuildRunnerMessagesOptions {
  userMessage: ChatMessage;
  memory: MemoryManager;
  chatModel: BaseChatModel;
  includeSystemMessage: boolean;
  buildMultimodalContent: (
    text: string,
    userMessage: ChatMessage
  ) => Promise<string | MessageContent[]>;
}

export async function buildRunnerMessages(
  options: BuildRunnerMessagesOptions
): Promise<BaseMessage[]> {
  if (!options.userMessage.contextEnvelope) {
    throw new Error("[RunnerMessages] Context envelope is required but not available.");
  }

  const baseMessages = LayerToMessagesConverter.convert(options.userMessage.contextEnvelope, {
    includeSystemMessage: options.includeSystemMessage,
    mergeUserContent: true,
    debug: false,
  });

  const messages: BaseMessage[] = [];
  const systemMessage = baseMessages.find((message) => message.role === "system");
  if (systemMessage) {
    messages.push(new SystemMessage({ content: systemMessage.content }));
  }

  const historyMessages: { role: string; content: string | MessageContent[] }[] = [];
  await loadAndAddChatHistory(options.memory.getMemory(), historyMessages);
  for (const historyMessage of historyMessages) {
    messages.push(
      historyMessage.role === "user"
        ? new HumanMessage(historyMessage.content)
        : new AIMessage(historyMessage.content)
    );
  }

  const userMessageContent = baseMessages.find((message) => message.role === "user");
  if (userMessageContent) {
    const content = await options.buildMultimodalContent(
      userMessageContent.content,
      options.userMessage
    );
    messages.push(new HumanMessage(content));
  }

  return messages;
}
```

- [x] **Step 4: Extract raw streaming**

Create `rawStreaming.ts`:

```ts
export interface StreamRawModelResponseOptions {
  chatModel: BaseChatModel;
  messages: BaseMessage[];
  abortController: AbortController;
  updateCurrentAiMessage: (message: string) => void;
  excludeThinking: boolean;
}

export async function streamRawModelResponse(
  options: StreamRawModelResponseOptions
): Promise<StreamingResult> {
  const streamer = new ThinkBlockStreamer(options.updateCurrentAiMessage, options.excludeThinking);

  try {
    const stream = await withSuppressedTokenWarnings(() =>
      options.chatModel.stream(options.messages, {
        signal: options.abortController.signal,
      })
    );

    for await (const chunk of stream) {
      if (options.abortController.signal.aborted) {
        break;
      }
      streamer.processChunk(chunk);
    }
  } catch (error: any) {
    if (error.name !== "AbortError" && !options.abortController.signal.aborted) {
      throw error;
    }
  }

  return streamer.close();
}
```

- [x] **Step 5: Extract local-search formatting**

Move `prepareLocalSearchResult`, `processLocalSearchResult`, `getTimeExpression`, and `lastCitationSources` support from `ToolChainRunner.ts` into `localSearchResultFormatting.ts` as a small class:

```ts
export class LocalSearchResultFormatter {
  private lastCitationSources: { title?: string; path?: string }[] | null = null;

  getFallbackCitationSources(): { title?: string; path?: string }[] | null {
    return this.lastCitationSources;
  }

  process(toolResult: { result: string; success: boolean }, timeExpression?: string) {
    // Move the existing processLocalSearchResult body here unchanged.
  }
}
```

- [x] **Step 6: Use extracted utilities without changing behavior**

Update `LLMChainRunner.ts` and `ToolChainRunner.ts` to call the new utilities while keeping their public behavior intact. This keeps extraction verifiable before deleting those files.

- [x] **Step 7: Run focused runner tests**

Run:

```bash
npm test -- --runTestsByPath src/LLMProviders/chainRunner/LLMChainRunner.test.ts src/LLMProviders/chainRunner/AutonomousAgentChainRunner.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit**

Execution note: deferred in inline workspace execution; no commit created for this slice.

Run:

```bash
git add src/LLMProviders/chainRunner src/LLMProviders/chainRunner/utils
git commit -m "refactor: extract shared runner utilities"
```

### Task 7: Refactor AutonomousAgentChainRunner Into the Single Runner

**Files:**

- Modify: `src/LLMProviders/chainRunner/BaseChainRunner.ts`
- Modify: `src/LLMProviders/chainRunner/AutonomousAgentChainRunner.ts`
- Modify: `src/LLMProviders/chainRunner/AutonomousAgentChainRunner.test.ts`

- [x] **Step 1: Update runner contract**

In `BaseChainRunner.ts`, add `preset?: ChainPreset` to `ChainRunner.run()` options:

```ts
import { ChainPreset } from "@/runtime/ChainPreset";

options: {
  debug?: boolean;
  ignoreSystemMessage?: boolean;
  updateLoading?: (loading: boolean) => void;
  memoryManager?: MemoryManager;
  runtimePolicy?: RuntimeChainPolicy;
  preset?: ChainPreset;
}
```

- [x] **Step 2: Add single-runner tests**

In `AutonomousAgentChainRunner.test.ts`, add tests:

```ts
it("uses raw streaming when the preset has no tools", async () => {
  const preset = {
    id: "chat",
    promptProfile: "chat",
    runtimePolicy: resolveRuntimeChainPolicy("chat"),
    tools: [],
  } as const;

  await runner.run(userMessage, abortController, updateCurrentAiMessage, addMessage, {
    preset,
    runtimePolicy: preset.runtimePolicy,
  });

  expect(chatModel.bindTools).not.toHaveBeenCalled();
  expect(chatModel.stream).toHaveBeenCalled();
});

it("returns the friendly tool capability error when tools are required but bindTools is unavailable", async () => {
  const preset = {
    id: "chat_rag",
    promptProfile: "chat_rag",
    runtimePolicy: resolveRuntimeChainPolicy("chat_rag"),
    tools: [{ name: "localSearch" }],
  } as any;

  delete chatModel.bindTools;

  const result = await runner.run(
    userMessage,
    abortController,
    updateCurrentAiMessage,
    addMessage,
    {
      preset,
      runtimePolicy: preset.runtimePolicy,
    }
  );

  expect(result).toContain("This model cannot use tools");
});
```

- [x] **Step 3: Run failing single-runner tests**

Run:

```bash
npm test -- --runTestsByPath src/LLMProviders/chainRunner/AutonomousAgentChainRunner.test.ts --runInBand
```

Expected: FAIL because the runner still computes tools internally and extends `ToolChainRunner`.

- [x] **Step 4: Change inheritance and remove internal tool selection**

In `AutonomousAgentChainRunner.ts`:

```ts
import { BaseChainRunner } from "./BaseChainRunner";
import { ChainPreset, TOOL_CAPABILITY_ERROR } from "@/runtime/ChainPreset";

export class AutonomousAgentChainRunner extends BaseChainRunner {
```

Remove `getAvailableTools()` and replace every call with `options.preset.tools`.

- [x] **Step 5: Add raw-stream branch**

At the start of `run()` after validating the envelope:

```ts
const preset = options.preset;
if (!preset) {
  throw new Error("[Agent] Chain preset is required.");
}

if (preset.tools.length === 0) {
  return this.runRawChatPreset(
    userMessage,
    abortController,
    updateCurrentAiMessage,
    addMessage,
    options
  );
}
```

Add `runRawChatPreset` using `buildRunnerMessages()` and `streamRawModelResponse()`:

```ts
private async runRawChatPreset(
  userMessage: ChatMessage,
  abortController: AbortController,
  updateCurrentAiMessage: (message: string) => void,
  addMessage: (message: ChatMessage) => void,
  options: RunnerOptions
): Promise<string> {
  const chatModel = this.chainManager.chatModelManager.getChatModel();
  const messages = await buildRunnerMessages({
    userMessage,
    memory: this.resolveMemory(options),
    chatModel,
    includeSystemMessage: true,
    buildMultimodalContent: async (content) => content,
  });

  const result = await streamRawModelResponse({
    chatModel,
    messages,
    abortController,
    updateCurrentAiMessage,
    excludeThinking: !this.hasCapability(chatModel, ModelCapability.REASONING),
  });

  return this.handleResponse(
    result.content,
    userMessage,
    abortController,
    addMessage,
    updateCurrentAiMessage,
    undefined,
    undefined,
    {
      wasTruncated: result.wasTruncated,
      tokenUsage: result.tokenUsage ?? undefined,
    },
    this.resolveMemory(options)
  );
}
```

- [x] **Step 6: Add friendly tool capability branch**

In `prepareAgentConversation`, replace the current thrown `bindTools` error with:

```ts
if (typeof chatModel.bindTools !== "function") {
  return {
    kind: "tool_capability_error",
    message: TOOL_CAPABILITY_ERROR,
  };
}
```

If keeping `prepareAgentConversation` return type simple is cleaner, perform the check in `run()` before calling it:

```ts
if (typeof (chatModel as any).bindTools !== "function") {
  updateCurrentAiMessage(TOOL_CAPABILITY_ERROR);
  return this.handleResponse(
    TOOL_CAPABILITY_ERROR,
    userMessage,
    abortController,
    addMessage,
    updateCurrentAiMessage,
    undefined,
    undefined,
    undefined,
    options.memoryManager
  );
}
```

- [x] **Step 7: Preserve reasoning behavior only for tool-using presets**

Keep `startReasoningTimer()` inside the tool path only. Plain `chat` with zero tools must not write a `CORTEX_REASONING` marker. `chat_rag`, `agent`, `project_agent`, and `telegram` should render the shared reasoning panel only when the model actually enters the tool path.

- [x] **Step 8: Remove fallback to `ToolChainRunner`**

Delete the catch-block fallback:

```ts
const fallbackRunner = new ToolChainRunner(this.chainManager);
return await fallbackRunner.run(...);
```

Replace it with normal `handleError()` behavior so tool-capability failures are explicit and no old runner path remains.

- [x] **Step 9: Run focused runner tests**

Run:

```bash
npm test -- --runTestsByPath src/LLMProviders/chainRunner/AutonomousAgentChainRunner.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 10: Commit**

Execution note: deferred in inline workspace execution; no commit created for this slice.

Run:

```bash
git add src/LLMProviders/chainRunner/BaseChainRunner.ts src/LLMProviders/chainRunner/AutonomousAgentChainRunner.ts src/LLMProviders/chainRunner/AutonomousAgentChainRunner.test.ts
git commit -m "refactor: make autonomous runner handle all presets"
```

### Task 8: Route ChainManager Through Presets Only

**Files:**

- Modify: `src/LLMProviders/chainManager.ts`
- Modify: `src/core/ChatManager.ts`
- Modify: `src/hooks/useChatManager.ts`
- Modify: `src/channels/telegram/TelegramAgent.ts`
- Modify: `src/core/ChatManager.test.ts`

- [x] **Step 1: Update manager tests**

In `src/core/ChatManager.test.ts`, replace `ChainType.LLM_CHAIN` expectations with preset IDs:

```ts
await chatManager.sendMessage("Hello", context, "chat");

expect(mockChainManager.runChain).toHaveBeenCalledWith(
  expect.any(Object),
  expect.any(AbortController),
  expect.any(Function),
  expect.any(Function),
  expect.objectContaining({
    presetId: "chat",
    runtimePolicy: expect.objectContaining({ promptProfile: "chat" }),
  })
);
```

Add one assertion for RAG:

```ts
await chatManager.sendMessage("Search my notes", context, "chat_rag");
expect(mockChainManager.runChain).toHaveBeenCalledWith(
  expect.any(Object),
  expect.any(AbortController),
  expect.any(Function),
  expect.any(Function),
  expect.objectContaining({ presetId: "chat_rag" })
);
```

- [x] **Step 2: Run failing ChatManager test**

Run:

```bash
npm test -- --runTestsByPath src/core/ChatManager.test.ts --runInBand
```

Expected: FAIL because `ChatManager` still accepts `ChainType`.

- [x] **Step 3: Update `chainManager.runChain()` options**

Execution note: implemented with a transitional `chainType` to `presetId` mapper so existing UI and ChatManager callers continue to work until the later UI/signature migration steps are completed.

In `src/LLMProviders/chainManager.ts`, remove `ChainFactory` and legacy runner imports. Import:

```ts
import { getChainPresetId, getCurrentProject, getModelKey, SetChainOptions } from "@/aiParams";
import {
  AutonomousAgentChainRunner,
  buildChainPreset,
  ChainRunner,
} from "@/LLMProviders/chainRunner/index";
import { ChainPresetId } from "@/runtime/ChainPreset";
import { resolveRuntimeChainPolicy } from "@/runtime/RuntimeChainPolicy";
```

Update `runChain()` options:

```ts
options: {
  debug?: boolean;
  ignoreSystemMessage?: boolean;
  updateLoading?: (loading: boolean) => void;
  presetId?: ChainPresetId;
  memoryManager?: import("@/LLMProviders/memoryManager").default;
  runtimePolicy?: import("@/runtime/RuntimeChainPolicy").RuntimeChainPolicy;
} = {}
```

Build the preset:

```ts
const resolvedPresetId = options.presetId ?? getChainPresetId();
const preset = buildChainPreset({
  presetId: resolvedPresetId,
  projectId: getCurrentProject()?.id,
  vault: this.app?.vault,
  vaultAvailable: !!this.app?.vault,
});
const runtimePolicy = options.runtimePolicy ?? preset.runtimePolicy;
const chainRunner = new AutonomousAgentChainRunner(this);

return await chainRunner.run(userMessage, abortController, updateCurrentAiMessage, addMessage, {
  ...options,
  preset,
  runtimePolicy,
});
```

- [x] **Step 4: Remove chain initialization dispatch**

Delete `validateChainInitialization()`, `setChain()`, `initializeQAChain()`, `getChainRunner()`, and `ChainFactory` use from `chainManager.ts`. Keep model setup and project-model selection in `createChainWithNewModel()`.

For index refresh on RAG/Agent switches, move the existing refresh logic into the subscriber in `projectManager.ts` after Task 10 updates preset subscriptions.

- [x] **Step 5: Update `ChatManager` signatures**

Execution note: `ChatManager`, `ChatUIState`, and `useChatManager` now accept normalized preset inputs while retaining a local legacy mapping for `MessagePreparationService` until Task 9 removes the remaining context-prep `ChainType` dependency.

Change parameters named `chainType` to `presetId: ChainPresetId`. When resolving policy:

```ts
const runtimePolicy = resolveRuntimeChainPolicy(presetId);
```

Pass:

```ts
{
  presetId,
  runtimePolicy,
}
```

- [x] **Step 6: Update TelegramAgent**

In `src/channels/telegram/TelegramAgent.ts`, replace `ChainType.TELEGRAM_CHAIN` with `"telegram"`:

```ts
private readonly runtimePolicy: RuntimeChainPolicy = resolveRuntimeChainPolicy("telegram");
```

When preparing and running:

```ts
presetId: "telegram",
runtimePolicy: this.runtimePolicy,
```

Keep `formatTelegramOutboundMessage(finalText)` in `TelegramAgent`. This preserves the existing split where Telegram transport/history get clean canonical text while local display can retain richer display text.

- [x] **Step 7: Run focused manager tests**

Execution note: verified `npx tsc -noEmit -skipLibCheck`, `src/core/ChatManager.test.ts`, and `src/channels/telegram/__tests__/TelegramAgent.test.ts`.

Run:

```bash
npm test -- --runTestsByPath src/core/ChatManager.test.ts src/channels/telegram/__tests__/TelegramAgent.test.ts --runInBand
```

Expected: PASS after mocks are updated to preset IDs.

- [ ] **Step 8: Commit**

Execution note: deferred in inline workspace execution; no commit created for this slice.

Run:

```bash
git add src/LLMProviders/chainManager.ts src/core/ChatManager.ts src/hooks/useChatManager.ts src/channels/telegram/TelegramAgent.ts src/core/ChatManager.test.ts src/channels/telegram/__tests__/TelegramAgent.test.ts
git commit -m "refactor: route chain execution through presets"
```

### Task 9: Update Context Preparation to Use Runtime Policy Instead of ChainType

**Files:**

- Modify: `src/core/MessagePreparationService.ts`
- Modify: `src/core/ContextManager.ts`
- Modify: `src/contextProcessor.ts`
- Modify: related tests in `src/core/ChatManager.test.ts`, `src/contextProcessor.*.test.ts`, and `src/core/ContextManager.*.test.ts`

- [x] **Step 1: Replace project checks**

Replace checks like:

```ts
chainType === ChainType.PROJECT_CHAIN;
```

with:

```ts
runtimePolicy.promptProfile === "project_agent";
```

- [x] **Step 2: Replace rich-context checks**

Execution note: rich-context processing was already policy-backed in `ContextManager` and `ContextProcessor`; Task 9 kept that path and added policy regression coverage around project active-note suppression.

Keep current behavior by using:

```ts
runtimePolicy.richContextPolicy === "plus";
```

This preserves PDF/embed rich context for Chat + RAG, Agent, Project Agent, and Telegram, while plain Chat remains standard.

- [x] **Step 3: Replace manual Telegram marker condition**

In `MessagePreparationService.buildPreparedMessage`, remove the `enableAutonomousAgent` guard:

```ts
const shouldInjectVirtualMarkers =
  params.runtimePolicy.manualToolPolicy === "forced_virtual_markers";
```

Then verify the injected markers only mutate the runtime envelope and do not mutate stored Telegram text.

- [x] **Step 4: Update tests**

Execution note: added focused runtime-policy tests for `MessagePreparationService` and `ContextManager`.

Update mocks to use:

```ts
resolveRuntimeChainPolicy("chat");
resolveRuntimeChainPolicy("chat_rag");
resolveRuntimeChainPolicy("agent");
resolveRuntimeChainPolicy("project_agent");
resolveRuntimeChainPolicy("telegram");
```

- [x] **Step 5: Run focused preparation/context tests**

Execution note: verified `npx tsc -noEmit -skipLibCheck`; `src/core/ChatManager.test.ts`, `src/core/MessagePreparationService.test.ts`, `src/core/ContextManager.runtimePolicy.test.ts`; and `src/contextProcessor.embeds.test.ts`, `src/contextProcessor.dataview.test.ts`, `src/contextProcessor.selectedText.test.ts`.

Run:

```bash
npm test -- --runTestsByPath src/core/ChatManager.test.ts src/contextProcessor.embeds.test.ts src/contextProcessor.dataview.test.ts src/contextProcessor.selectedText.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

Execution note: deferred in inline workspace execution; no commit created for this slice.

Run:

```bash
git add src/core/MessagePreparationService.ts src/core/ContextManager.ts src/contextProcessor.ts src/core/ChatManager.test.ts src/contextProcessor.embeds.test.ts src/contextProcessor.dataview.test.ts src/contextProcessor.selectedText.test.ts
git commit -m "refactor: drive context preparation from runtime policy"
```

### Task 10: Update UI From ChainType to Preset IDs

**Files:**

- Modify: `src/components/chat-components/ChainModeSelector.tsx`
- Modify: `src/components/chat-components/ChatControls.tsx`
- Modify: `src/components/chat-components/SuggestedPrompts.tsx`
- Modify: `src/components/chat-components/ChatInput.tsx`
- Modify: `src/components/chat-components/LexicalEditor.tsx`
- Modify: `src/components/chat-components/ChatContextMenu.tsx`
- Modify: `src/hooks/useProjectContextStatus.ts`
- Modify: `src/components/chat-components/ChatControls.test.tsx`
- Add or modify tests for `SuggestedPrompts`

- [x] **Step 1: Update UI prop types**

Replace `ChainType` props with `ChainPresetId`:

```ts
import { ChainPresetId } from "@/runtime/ChainPreset";

interface ChatControlsProps {
  onModeChange: (presetId: ChainPresetId) => void | Promise<void>;
}
```

- [x] **Step 2: Update `ChainModeSelector`**

Replace:

```ts
deriveChainType(nextMode, nextScope, nextRetrieval);
```

with:

```ts
deriveChainPresetId(nextMode, nextScope, nextRetrieval);
```

Use `useChainPresetId()` where a preset ID is needed. Keep visible modes as Chat and Agent, and keep the existing Chat RAG toggle visible as the first-class retrieval control.

- [x] **Step 3: Update `SuggestedPrompts` mapping**

Replace the prompt key map with:

```ts
const PROMPT_KEYS: Record<ChainPresetId, Array<keyof typeof SUGGESTED_PROMPTS>> = {
  chat: ["activeNote", "quoteNote", "fun"],
  chat_rag: ["qaVault", "qaVault", "quoteNote"],
  agent: ["agentMode", "agentMode", "agentMode"],
  project_agent: ["agentMode", "agentMode", "agentMode"],
  telegram: ["activeNote", "quoteNote", "fun"],
};
```

Replace the Vault QA warning condition with:

```tsx
{
  presetId === "chat_rag" && (
    <div className="tw-rounded-md tw-border tw-border-solid tw-border-border tw-p-2 tw-text-sm">
      Vault retrieval is on. Cortex will prefer searching your notes when the request needs vault
      context.
    </div>
  );
}
```

- [x] **Step 4: Update editor/tool-control checks**

Replace checks such as:

```tsx
currentChain && currentChain !== ChainType.LLM_CHAIN;
```

with:

```tsx
presetId === "chat_rag" ||
  presetId === "agent" ||
  presetId === "project_agent" ||
  presetId === "telegram";
```

- [x] **Step 5: Run UI tests**

Run:

```bash
npm test -- --runTestsByPath src/components/chat-components/ChatControls.test.tsx src/components/chat-components/ChatInput.test.ts --runInBand
```

Expected: PASS.

Execution note:

- `node --max-old-space-size=6144 ./node_modules/jest/bin/jest.js --runTestsByPath src/components/chat-components/ChainModeSelector.test.tsx src/components/chat-components/SuggestedPrompts.test.tsx src/components/chat-components/ChatControls.test.tsx src/components/chat-components/ChatInput.test.ts src/components/chat-components/ChatToolControls.test.tsx --runInBand --testPathIgnorePatterns=src/integration_tests/ --detectOpenHandles` — PASS (20 tests)
- `npx tsc -noEmit -skipLibCheck` — PASS

- [ ] **Step 6: Commit**

Run:

```bash
git add src/components/chat-components src/hooks/useProjectContextStatus.ts
git commit -m "refactor: update chat UI to preset ids"
```

Deferred in inline workspace execution.

### Task 11: Update Settings UI for Tool Defaults

**Files:**

- Modify: `src/settings/v2/components/CortexPlusSettings.tsx`
- Modify: `src/settings/v2/components/ToolSettingsSection.tsx`
- Modify: `src/settings/v2/components/BasicSettings.tsx` if default mode labels mention Vault QA
- Modify: project modal files that edit `ProjectConfig`

- [x] **Step 1: Remove autonomous-agent enable switch**

In `CortexPlusSettings.tsx`, delete the switch that writes:

```ts
updateSetting("enableAutonomousAgent", checked);
```

Render the tool settings section unconditionally because Agent is now always backed by the unified runner.

- [x] **Step 2: Update tool settings labels**

In `ToolSettingsSection.tsx`, read:

```ts
const toolDefaults = settings.toolDefaults;
```

For Chat costly tools, update:

```ts
updateSetting("toolDefaults", {
  ...settings.toolDefaults,
  chat: {
    ...settings.toolDefaults.chat,
    [toolId]: checked,
  },
});
```

For Agent tools, update:

```ts
updateSetting("toolDefaults", {
  ...settings.toolDefaults,
  agent: {
    ...settings.toolDefaults.agent,
    [toolId]: checked,
  },
});
```

Render two sections:

```tsx
<div className="tw-mt-4 tw-rounded-lg tw-bg-secondary tw-p-4">
  <div className="tw-mb-2 tw-text-sm tw-font-medium">Chat Tools</div>
  <div className="tw-mb-4 tw-text-xs tw-text-muted">
    Optional read-only tools available to Chat. Vault Search is controlled by the RAG toggle.
  </div>
  {renderChatCostlyTools()}
</div>

<div className="tw-mt-4 tw-rounded-lg tw-bg-secondary tw-p-4">
  <div className="tw-mb-2 tw-text-sm tw-font-medium">Agent Tools</div>
  <div className="tw-mb-4 tw-text-xs tw-text-muted">
    Tools available to Agent and Project Agent.
  </div>
  {renderAgentTools()}
</div>
```

- [x] **Step 3: Add project override editing**

In the project modal that edits `ProjectConfig`, add tri-state values for Agent-only overrides:

```ts
const updateProjectToolOverride = (toolId: string, value: "inherit" | boolean) => {
  setProject({
    ...project,
    toolOverrides: {
      ...project.toolOverrides,
      agent: {
        ...project.toolOverrides?.agent,
        [toolId]: value,
      },
    },
  });
};
```

Use a three-option segmented control per configurable Agent tool:

```tsx
<button type="button" onClick={() => updateProjectToolOverride(toolId, "inherit")}>
  Inherit
</button>
<button type="button" onClick={() => updateProjectToolOverride(toolId, true)}>
  On
</button>
<button type="button" onClick={() => updateProjectToolOverride(toolId, false)}>
  Off
</button>
```

- [x] **Step 4: Run settings tests and typecheck**

Run:

```bash
npm test -- --runTestsByPath src/settings/model.test.ts --runInBand
npx tsc --noEmit --skipLibCheck
```

Expected: PASS.

Execution note:

- `node --max-old-space-size=6144 ./node_modules/jest/bin/jest.js --runTestsByPath src/settings/model.test.ts src/settings/v2/components/CortexPlusSettings.test.tsx src/settings/v2/components/ToolSettingsSection.test.tsx src/components/modals/project/projectToolOverrides.test.ts --runInBand --testPathIgnorePatterns=src/integration_tests/ --detectOpenHandles` — PASS (40 tests)
- `npx tsc -noEmit -skipLibCheck` — PASS

- [ ] **Step 5: Commit**

Run:

```bash
git add src/settings src/components/modals/project
git commit -m "feat: configure tool defaults by surface"
```

Deferred in inline workspace execution.

### Task 12: Delete Legacy Runners and ChainFactory

**Files:**

- Delete: `src/LLMProviders/chainRunner/LLMChainRunner.ts`
- Delete: `src/LLMProviders/chainRunner/LLMChainRunner.test.ts`
- Delete: `src/LLMProviders/chainRunner/ToolChainRunner.ts`
- Delete: `src/LLMProviders/chainRunner/VaultQAChainRunner.ts`
- Delete: `src/LLMProviders/chainRunner/ProjectChainRunner.ts`
- Delete: `src/chainFactory.ts`
- Modify: `src/LLMProviders/chainRunner/index.ts`
- Modify: `src/utils.ts`
- Modify all remaining imports found by search

- [x] **Step 1: Search for legacy imports**

Run:

```bash
rg -n "chainFactory|ChainType|LLMChainRunner|ToolChainRunner|VaultQAChainRunner|ProjectChainRunner|VAULT_QA_CHAIN|TOOL_CHAIN|PROJECT_CHAIN|LLM_CHAIN" src docs
```

Expected: hits remain before cleanup.

- [x] **Step 2: Replace remaining helpers**

In `src/utils.ts`, replace:

```ts
export function isAgentChain(chainType: ChainType): boolean;
```

with:

```ts
export function isAgentPreset(presetId: ChainPresetId): boolean {
  return presetId === "agent" || presetId === "project_agent";
}
```

Remove `stringToChainType`, `isLLMChain`, `isRetrievalQAChain`, and `isSupportedChain` if no callers remain.

- [x] **Step 3: Update chain runner index**

In `src/LLMProviders/chainRunner/index.ts`, remove exports for deleted runner classes:

```ts
export type { ChainRunner } from "./BaseChainRunner";
export { BaseChainRunner } from "./BaseChainRunner";
export { AutonomousAgentChainRunner } from "./AutonomousAgentChainRunner";
export { ThinkBlockStreamer } from "./utils/ThinkBlockStreamer";
```

Keep native tool-calling and tool-execution utility exports used by tests.

- [x] **Step 4: Delete files**

Run:

```bash
git rm src/LLMProviders/chainRunner/LLMChainRunner.ts
git rm src/LLMProviders/chainRunner/LLMChainRunner.test.ts
git rm src/LLMProviders/chainRunner/ToolChainRunner.ts
git rm src/LLMProviders/chainRunner/VaultQAChainRunner.ts
git rm src/LLMProviders/chainRunner/ProjectChainRunner.ts
git rm src/chainFactory.ts
```

- [x] **Step 5: Verify zero legacy hits**

Run:

```bash
rg -n "chainFactory|ChainType|LLMChainRunner|ToolChainRunner|VaultQAChainRunner|ProjectChainRunner|VAULT_QA_CHAIN|TOOL_CHAIN|PROJECT_CHAIN|LLM_CHAIN" src
```

Expected: no output.

- [x] **Step 6: Typecheck**

Run:

```bash
npx tsc --noEmit --skipLibCheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

Deferred in inline workspace execution.

Run:

```bash
git add src
git commit -m "refactor: remove legacy chain runners"
```

### Task 13: Update Prompt Profile Instructions

**Files:**

- Modify: `src/system-prompts/systemPromptBuilder.ts`
- Modify: `src/LLMProviders/chainRunner/AutonomousAgentChainRunner.ts`
- Modify: `src/LLMProviders/chainRunner/utils/modelAdapter.ts`
- Modify tests for prompt construction

- [x] **Step 1: Add profile suffix builder**

In `systemPromptBuilder.ts`, add:

```ts
import { PromptProfile } from "@/runtime/ChainPreset";

export function getPromptProfileInstructions(profile: PromptProfile): string {
  switch (profile) {
    case "chat":
      return "You are in Chat mode. Be conversational and do not perform autonomous write actions.";
    case "chat_rag":
      return "You are in Chat with vault retrieval enabled. Prefer localSearch for vault-grounded questions, but answer greetings and generic non-vault requests without searching.";
    case "agent":
      return "You are in Agent mode. Use available tools according to the resolved permissions and never claim a tool result you did not receive.";
    case "project_agent":
      return "You are in Project Agent mode. Use project context and available tools according to the resolved permissions.";
    case "telegram":
      return "You are replying through Telegram. Keep wording transport-safe and concise, and respect Telegram formatting constraints.";
  }
}
```

Update `getSystemPrompt` to accept:

```ts
export function getSystemPrompt(
  target: PromptResolutionTarget = "default",
  profile: PromptProfile = "chat"
): string;
```

Append profile instructions after the builtin prompt and before user custom instructions.

- [x] **Step 2: Thread prompt profile through message preparation**

When `MessagePreparationService` calls:

```ts
getSystemPromptWithMemory(this.chainManager.userMemoryManager, promptTarget);
```

change to:

```ts
getSystemPromptWithMemory(
  this.chainManager.userMemoryManager,
  promptTarget,
  runtimePolicy.promptProfile
);
```

- [x] **Step 3: Use profile in autonomous system prompt**

In `AutonomousAgentChainRunner.prepareAgentConversation`, include:

```ts
getPromptProfileInstructions(runtimePolicy.promptProfile);
```

in the system content before tool guidelines.

- [x] **Step 4: Run prompt tests**

Run:

```bash
npm test -- --runTestsByPath src/settings/model.test.ts src/core/ChatManager.test.ts src/LLMProviders/chainRunner/AutonomousAgentChainRunner.test.ts --runInBand
```

Expected: PASS after expected prompt strings are updated.

- [ ] **Step 5: Commit**

Execution note: deferred in inline workspace execution; no commit created for this slice.

Run:

```bash
git add src/system-prompts src/core/MessagePreparationService.ts src/LLMProviders/chainRunner/AutonomousAgentChainRunner.ts src/LLMProviders/chainRunner/utils/modelAdapter.ts
git commit -m "feat: add prompt profiles"
```

### Task 14: Update Docs and User-Facing Copy

**Files:**

- Modify: `docs/chat-interface.md`
- Modify: `docs/agent-mode-and-tools.md`
- Modify: `docs/vault-search-and-indexing.md`
- Modify: `docs/context-and-mentions.md`
- Modify: `docs/getting-started.md`
- Modify: `docs/models-and-parameters.md`
- Modify: `docs/troubleshooting-and-faq.md`
- Modify: `docs/index.md` if topic descriptions reference Vault QA as a mode
- Modify: `src/LLMProviders/chainRunner/README.md` or delete sections for removed runner classes

- [x] **Step 1: Update Chat docs**

In `docs/chat-interface.md`, describe:

```md
- **Chat**: conversational mode for general questions and note-aware context.
- **Chat + RAG**: Chat with vault retrieval enabled. Cortex prefers searching your notes when your request needs vault context.
- **Agent**: tool-using mode that can use read and write tools according to your settings.
- **Project Agent**: Agent scoped to the selected project context.
- **Telegram**: channel-specific behavior with isolated Telegram history and Telegram-safe formatting.
```

- [x] **Step 2: Remove Vault QA as a peer mode**

Search and update:

```bash
rg -n "Vault QA|VAULT_QA|vault_qa" docs src/LLMProviders/chainRunner/README.md
```

Replace user-facing mode references with `Chat + RAG` or `vault retrieval` as appropriate.

- [x] **Step 3: Update troubleshooting**

In `docs/troubleshooting-and-faq.md`, replace "What's the difference between Chat mode and Vault QA mode?" with "What does the RAG toggle do in Chat?" and explain retrieval-biased behavior.

- [x] **Step 4: Run doc search**

Run:

```bash
rg -n "Vault QA|VAULT_QA|vault_qa|enableAutonomousAgent|autonomousAgentEnabledToolIds|ToolChainRunner|LLMChainRunner|ProjectChainRunner|VaultQAChainRunner" docs src
```

Expected: no user-facing stale references. Technical references should remain only if they are in migration notes describing removed files.

- [ ] **Step 5: Commit**

Execution note: deferred in inline workspace execution; no commit created for this slice. Verified public docs/source stale-reference searches, excluding implementation plan notes, returned no matches.

Run:

```bash
git add docs src/LLMProviders/chainRunner/README.md
git commit -m "docs: explain unified chat and agent presets"
```

### Task 15: Final Verification

**Files:** all touched files

- [x] **Step 1: Run focused tests**

Run:

```bash
npm test -- --runTestsByPath src/aiParams.test.ts src/runtime/RuntimeChainPolicy.test.ts src/core/ToolPermissions.test.ts src/LLMProviders/chainRunner/presets/ChainPresetResolver.test.ts src/LLMProviders/chainRunner/AutonomousAgentChainRunner.test.ts src/core/ChatManager.test.ts src/components/chat-components/ChatControls.test.tsx src/components/chat-components/ChatInput.test.ts --runInBand
```

Expected: PASS.

Execution note: `node --max-old-space-size=6144 ./node_modules/jest/bin/jest.js --runTestsByPath src/aiParams.test.ts src/runtime/RuntimeChainPolicy.test.ts src/core/ToolPermissions.test.ts src/LLMProviders/chainRunner/presets/ChainPresetResolver.test.ts src/LLMProviders/chainRunner/AutonomousAgentChainRunner.test.ts src/core/ChatManager.test.ts src/components/chat-components/ChatControls.test.tsx src/components/chat-components/ChatInput.test.ts --runInBand --testPathIgnorePatterns=src/integration_tests/ --detectOpenHandles` passed with 8 suites and 111 tests.

- [x] **Step 2: Run typecheck**

Run:

```bash
npx tsc --noEmit --skipLibCheck
```

Expected: PASS.

Execution note: `npx tsc --noEmit --skipLibCheck` passed.

- [x] **Step 3: Run stale-reference searches**

Run:

```bash
rg -n "chainFactory|ChainType|VAULT_QA_CHAIN|LLMChainRunner|ToolChainRunner|VaultQAChainRunner|ProjectChainRunner|enableAutonomousAgent|autonomousAgentEnabledToolIds" src
```

Expected: no output.

Run:

```bash
rg -n "Vault QA|vault_qa|VAULT_QA" docs src
```

Expected: no user-facing references to Vault QA as a peer mode.

Execution note: source stale-reference search returned no matches. Public docs/source search excluding `docs/superpowers/**` returned no matches; exact `docs src` search only reports implementation spec/plan migration notes.

- [x] **Step 4: Run format and lint**

Run:

```bash
npm run format
npm run lint
```

Expected: PASS.

Execution note: `npm run format` and `npm run lint` passed.

- [x] **Step 5: Run production build**

Run:

```bash
npm run build
```

Expected: PASS.

Execution note: `npm run build` passed. Build emitted the existing Browserslist `caniuse-lite is outdated` warning.

- [ ] **Step 6: Manual runtime checks**

After the user builds and reloads the plugin, check:

```powershell
obsidian plugin:reload id=cortex
obsidian dev:errors
```

Manual scenarios:

- Plain Chat with "Hi" streams a normal response and does not show a reasoning panel.
- Chat with RAG on can answer "Hi" without searching.
- Chat with RAG on can answer a vault-grounded question by calling `localSearch` and rendering the shared reasoning panel.
- Agent can use write tools when enabled.
- Project Agent uses project model/context and project tool overrides.
- Telegram keeps isolated memory, typing/partial state, Telegram-safe outbound formatting, and no reasoning leakage into Telegram transport text.

Execution note: CLI smoke check passed: `obsidian plugin:reload id=cortex` reported `Reloaded: cortex`, and `obsidian dev:errors` reported `No errors captured`. Interactive chat scenarios were not run in this session.

- [ ] **Step 7: Commit final verification fixes**

Run:

```bash
git add .
git commit -m "test: verify unified preset runner"
```

## Self-Review Checklist

- [ ] `chat_rag` remains retrieval-biased, not retrieval-forced.
- [ ] Plain Chat can use zero tools and raw streaming with non-tool-capable models.
- [ ] Tool-required presets show the friendly model-capability error instead of silently answering without tools.
- [ ] Chat never binds `write` or `mixed` tools.
- [ ] Agent and Project Agent can bind enabled `costly`, `write`, and `mixed` tools.
- [ ] Telegram keeps `promptTarget: "telegram"`, isolated memory, full built-in tool behavior, typing state, and outbound formatting.
- [ ] The `CORTEX_REASONING` marker name is unchanged.
- [ ] LLM memory is still user/assistant text only; structured `AIMessage(tool_calls)` and `ToolMessage` chains are not reconstructed across reloads.
- [ ] `Vault QA` is gone as a peer mode in UI and docs; RAG is visible as a Chat control.
- [ ] Deleted runner paths have no imports or stale tests left.
