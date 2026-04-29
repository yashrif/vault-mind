import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatPromptTemplate } from "@langchain/core/prompts";

import { ModelCapability, ReasoningEffort, Verbosity } from "@/constants";
import {
  type ChainPresetId,
  type InteractionMode,
  type InteractionScope,
  type RetrievalPolicy as ChainRetrievalPolicy,
} from "@/runtime/ChainPreset";
import { settingsAtom, settingsStore } from "@/settings/model";
import { SelectedTextContext } from "@/types/message";
import { atom, useAtom } from "jotai";

const userModelKeyAtom = atom<string | null>(null);
const modelKeyAtom = atom(
  (get) => {
    const userValue = get(userModelKeyAtom);
    if (userValue !== null) {
      return userValue;
    }
    return get(settingsAtom).defaultModelKey;
  },
  (get, set, newValue) => {
    set(userModelKeyAtom, newValue);
  }
);

export type Mode = InteractionMode;
export type Scope = InteractionScope;
export type RetrievalPolicy = ChainRetrievalPolicy;

const userModeAtom = atom<Mode | null>(null);
const modeAtom = atom(
  (get) => {
    const userValue = get(userModeAtom);
    if (userValue !== null) {
      return userValue;
    }
    return get(settingsAtom).defaultMode;
  },
  (get, set, newValue: Mode) => {
    set(userModeAtom, newValue);
  }
);

const userScopeAtom = atom<Scope | null>(null);
const scopeAtom = atom(
  (get) => {
    const userValue = get(userScopeAtom);
    if (userValue !== null) {
      return userValue;
    }
    return get(settingsAtom).defaultScope;
  },
  (get, set, newValue: Scope) => {
    set(userScopeAtom, newValue);
  }
);

const userRetrievalPolicyAtom = atom<RetrievalPolicy | null>(null);
const retrievalPolicyAtom = atom(
  (get) => {
    const userValue = get(userRetrievalPolicyAtom);
    if (userValue !== null) {
      return userValue;
    }
    return get(settingsAtom).defaultRetrievalPolicy;
  },
  (get, set, newValue: RetrievalPolicy) => {
    set(userRetrievalPolicyAtom, newValue);
  }
);

/**
 * Maps the visible interaction axes to the internal chain preset ID.
 */
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

/**
 * Derived preset ID used by the unified chat and agent runner. Reads from the
 * three axis atoms; writes are decomposed back into axis updates.
 */
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

const currentProjectAtom = atom<ProjectConfig | null>(null);
const projectLoadingAtom = atom<boolean>(false);

export interface FailedItem {
  path: string;
  type: "md" | "web" | "youtube" | "nonMd";
  error?: string;
  timestamp?: number;
}

interface ProjectContextLoadState {
  success: Array<string>;
  failed: Array<FailedItem>;
  processingFiles: Array<string>;
  total: Array<string>;
}

export const projectContextLoadAtom = atom<ProjectContextLoadState>({
  success: [],
  failed: [],
  processingFiles: [],
  total: [],
});

export interface IndexingProgressState {
  isActive: boolean;
  isPaused: boolean;
  isCancelled: boolean;
  indexedCount: number;
  totalFiles: number;
  errors: string[];
  completionStatus: "none" | "success" | "cancelled" | "error";
}

export const indexingProgressAtom = atom<IndexingProgressState>({
  isActive: false,
  isPaused: false,
  isCancelled: false,
  indexedCount: 0,
  totalFiles: 0,
  errors: [],
  completionStatus: "none",
});

const selectedTextContextsAtom = atom<SelectedTextContext[]>([]);

export type ToolOverrideValue = "inherit" | boolean;

export interface ProjectToolOverrides {
  agent?: Record<string, ToolOverrideValue>;
}

export interface ProjectConfig {
  id: string;
  name: string;
  description?: string;
  systemPrompt: string;
  projectModelKey: string;
  modelConfigs: {
    temperature?: number;
    maxTokens?: number;
  };
  contextSource: {
    inclusions?: string;
    exclusions?: string;
    webUrls?: string;
    youtubeUrls?: string;
  };
  toolOverrides?: ProjectToolOverrides;
  created: number;
  UsageTimestamps: number;
}

export interface ModelConfig {
  modelName: string;
  temperature?: number;
  streaming: boolean;
  maxRetries: number;
  maxConcurrency: number;
  maxTokens?: number;
  maxCompletionTokens?: number;
  openAIApiKey?: string;
  openAIOrgId?: string;
  anthropicApiKey?: string;
  cohereApiKey?: string;
  azureOpenAIApiKey?: string;
  azureOpenAIApiInstanceName?: string;
  azureOpenAIApiDeploymentName?: string;
  azureOpenAIApiVersion?: string;
  // Google and TogetherAI API key share this property
  apiKey?: string;
  openAIProxyBaseUrl?: string;
  groqApiKey?: string;
  mistralApiKey?: string;
  enableCors?: boolean;
}

export interface SetChainOptions {
  prompt?: ChatPromptTemplate;
  chatModel?: BaseChatModel;
  noteFile?: any;
  abortController?: AbortController;
  refreshIndex?: boolean;
}

export type ModelType = "chat" | "embedding" | "stt";

export interface CustomModel {
  name: string;
  provider: string;
  baseUrl?: string;
  apiKey?: string;
  enabled: boolean;
  /** Discriminates chat / embedding / stt model families. */
  modelType?: ModelType;
  isBuiltIn?: boolean;
  enableCors?: boolean;
  core?: boolean;
  stream?: boolean;
  streamUsage?: boolean;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;

  // Ollama specific fields
  numCtx?: number;

  // LM Studio specific fields
  useResponsesApi?: boolean;

  // OpenRouter specific fields
  enablePromptCaching?: boolean;

  projectEnabled?: boolean;
  capabilities?: ModelCapability[];
  displayName?: string;

  // Embedding models only (Jina at the moment)
  dimensions?: number;
  // OpenAI specific fields
  openAIOrgId?: string;

  // Azure OpenAI specific fields
  azureOpenAIApiInstanceName?: string;
  azureOpenAIApiDeploymentName?: string;
  azureOpenAIApiVersion?: string;
  azureOpenAIApiEmbeddingDeploymentName?: string;

  // Amazon Bedrock specific fields
  bedrockRegion?: string;

  // OpenAI GPT-5 and O-series specific fields
  reasoningEffort?: ReasoningEffort;
  verbosity?: Verbosity;
}

export function getModelType(model: CustomModel): ModelType {
  return model.modelType ?? "chat";
}

export function setModelKey(modelKey: string) {
  settingsStore.set(modelKeyAtom, modelKey);
}

export function getModelKey(): string {
  return settingsStore.get(modelKeyAtom);
}

export function subscribeToModelKeyChange(callback: () => void): () => void {
  return settingsStore.sub(modelKeyAtom, callback);
}

export function useModelKey() {
  return useAtom(modelKeyAtom, {
    store: settingsStore,
  });
}

/**
 * Gets the current chain preset ID derived from the visible interaction axes.
 */
export function getChainPresetId(): ChainPresetId {
  return settingsStore.get(chainPresetIdAtom);
}

/**
 * Sets the current chain preset ID by decomposing it into visible axes.
 */
export function setChainPresetId(presetId: ChainPresetId) {
  settingsStore.set(chainPresetIdAtom, presetId);
}

/**
 * Subscribes to chain preset ID changes.
 */
export function subscribeToChainPresetIdChange(callback: () => void): () => void {
  return settingsStore.sub(chainPresetIdAtom, callback);
}

/**
 * Hook to get and set the chain preset ID from React components.
 */
export function useChainPresetId() {
  return useAtom(chainPresetIdAtom, {
    store: settingsStore,
  });
}

export function getMode(): Mode {
  return settingsStore.get(modeAtom);
}

export function setMode(mode: Mode) {
  settingsStore.set(modeAtom, mode);
}

export function subscribeToModeChange(callback: () => void): () => void {
  return settingsStore.sub(modeAtom, callback);
}

export function useMode() {
  return useAtom(modeAtom, {
    store: settingsStore,
  });
}

export function getScope(): Scope {
  return settingsStore.get(scopeAtom);
}

export function setScope(scope: Scope) {
  settingsStore.set(scopeAtom, scope);
}

export function subscribeToScopeChange(callback: () => void): () => void {
  return settingsStore.sub(scopeAtom, callback);
}

export function useScope() {
  return useAtom(scopeAtom, {
    store: settingsStore,
  });
}

export function getRetrievalPolicy(): RetrievalPolicy {
  return settingsStore.get(retrievalPolicyAtom);
}

export function setRetrievalPolicy(policy: RetrievalPolicy) {
  settingsStore.set(retrievalPolicyAtom, policy);
}

export function subscribeToRetrievalPolicyChange(callback: () => void): () => void {
  return settingsStore.sub(retrievalPolicyAtom, callback);
}

export function useRetrievalPolicy() {
  return useAtom(retrievalPolicyAtom, {
    store: settingsStore,
  });
}

export function setCurrentProject(project: ProjectConfig | null) {
  settingsStore.set(currentProjectAtom, project);
}

export function getCurrentProject(): ProjectConfig | null {
  return settingsStore.get(currentProjectAtom);
}

export function subscribeToProjectChange(
  callback: (project: ProjectConfig | null) => void
): () => void {
  return settingsStore.sub(currentProjectAtom, () => {
    callback(settingsStore.get(currentProjectAtom));
  });
}

export function useCurrentProject() {
  return useAtom(currentProjectAtom, {
    store: settingsStore,
  });
}

export function setProjectLoading(loading: boolean) {
  settingsStore.set(projectLoadingAtom, loading);
}

export function isProjectLoading(): boolean {
  return settingsStore.get(projectLoadingAtom);
}

export function subscribeToProjectLoadingChange(callback: (loading: boolean) => void): () => void {
  return settingsStore.sub(projectLoadingAtom, () => {
    callback(settingsStore.get(projectLoadingAtom));
  });
}

export function useProjectLoading() {
  return useAtom(projectLoadingAtom, {
    store: settingsStore,
  });
}

export function isProjectMode() {
  return getMode() === "agent" && getScope() === "project";
}

export function setSelectedTextContexts(contexts: SelectedTextContext[]) {
  settingsStore.set(selectedTextContextsAtom, contexts);
}

export function getSelectedTextContexts(): SelectedTextContext[] {
  return settingsStore.get(selectedTextContextsAtom);
}

export function addSelectedTextContext(context: SelectedTextContext) {
  const current = getSelectedTextContexts();
  setSelectedTextContexts([...current, context]);
}

export function removeSelectedTextContext(id: string) {
  const current = getSelectedTextContexts();
  setSelectedTextContexts(current.filter((context) => context.id !== id));
}

export function clearSelectedTextContexts() {
  setSelectedTextContexts([]);
}

export function useSelectedTextContexts() {
  return useAtom(selectedTextContextsAtom, {
    store: settingsStore,
  });
}

/**
 * Gets the project context load state from the atom.
 */
export function getProjectContextLoadState(): Readonly<ProjectContextLoadState> {
  return settingsStore.get(projectContextLoadAtom);
}

/**
 * Sets the project context load state in the atom.
 */
export function setProjectContextLoadState(state: ProjectContextLoadState) {
  settingsStore.set(projectContextLoadAtom, state);
}

/**
 * Updates a specific field in the project context load state.
 */
export function updateProjectContextLoadState<K extends keyof ProjectContextLoadState>(
  key: K,
  valueFn: (prev: ProjectContextLoadState[K]) => ProjectContextLoadState[K]
) {
  settingsStore.set(projectContextLoadAtom, (prev) => ({
    ...prev,
    [key]: valueFn(prev[key]),
  }));
}

/**
 * Subscribes to changes in the project context load state.
 */
export function subscribeToProjectContextLoadChange(
  callback: (state: ProjectContextLoadState) => void
): () => void {
  return settingsStore.sub(projectContextLoadAtom, () => {
    callback(settingsStore.get(projectContextLoadAtom));
  });
}

/**
 * Hook to get the project context load state from the atom.
 */
export function useProjectContextLoad() {
  return useAtom(projectContextLoadAtom, {
    store: settingsStore,
  });
}

/**
 * Gets the indexing progress state from the atom.
 */
export function getIndexingProgressState(): Readonly<IndexingProgressState> {
  return settingsStore.get(indexingProgressAtom);
}

/**
 * Sets the indexing progress state in the atom.
 */
export function setIndexingProgressState(state: IndexingProgressState) {
  settingsStore.set(indexingProgressAtom, state);
}

/**
 * Updates specific fields in the indexing progress state.
 */
export function updateIndexingProgressState(partial: Partial<IndexingProgressState>) {
  settingsStore.set(indexingProgressAtom, (prev) => ({
    ...prev,
    ...partial,
  }));
}

// --- Throttled indexing count updater ---
// Limits atom writes to at most once per 500ms during indexing to avoid
// cascading React re-renders from frequent Jotai atom updates.
let _lastUpdateTime = 0;
let _pendingCount = 0;
let _throttleTimer: ReturnType<typeof setTimeout> | null = null;
const THROTTLE_INTERVAL_MS = 500;

/**
 * Resets the indexing progress state to the default (idle) state.
 * Use when indexing completes with nothing to do (e.g. index already up to date).
 */
export function resetIndexingProgressState() {
  // Cancel any pending throttled indexing count write so a stale timer from a
  // previous run cannot corrupt the freshly-reset state.
  if (_throttleTimer !== null) {
    clearTimeout(_throttleTimer);
    _throttleTimer = null;
  }
  _lastUpdateTime = 0;
  _pendingCount = 0;

  settingsStore.set(indexingProgressAtom, {
    isActive: false,
    isPaused: false,
    isCancelled: false,
    indexedCount: 0,
    totalFiles: 0,
    errors: [],
    completionStatus: "none",
  });
}

/**
 * Throttled version of updateIndexingProgressState for indexedCount.
 * Limits atom writes to once per 500ms to reduce React re-renders.
 */
export function throttledUpdateIndexingCount(indexedCount: number): void {
  _pendingCount = indexedCount;
  const now = Date.now();

  if (now - _lastUpdateTime >= THROTTLE_INTERVAL_MS) {
    // Enough time has passed — write immediately
    _lastUpdateTime = now;
    if (_throttleTimer !== null) {
      clearTimeout(_throttleTimer);
      _throttleTimer = null;
    }
    updateIndexingProgressState({ indexedCount: _pendingCount });
  } else if (_throttleTimer === null) {
    // Schedule a trailing write
    _throttleTimer = setTimeout(
      () => {
        _lastUpdateTime = Date.now();
        _throttleTimer = null;
        updateIndexingProgressState({ indexedCount: _pendingCount });
      },
      THROTTLE_INTERVAL_MS - (now - _lastUpdateTime)
    );
  }
}

/**
 * Forces an immediate write of the pending indexedCount.
 * Call at indexing completion to ensure the final count is displayed.
 */
export function flushIndexingCount(): void {
  if (_throttleTimer !== null) {
    clearTimeout(_throttleTimer);
    _throttleTimer = null;
  }
  updateIndexingProgressState({ indexedCount: _pendingCount });
  _lastUpdateTime = 0;
  _pendingCount = 0;
}

/**
 * Hook to get the indexing progress state from the atom.
 */
export function useIndexingProgress() {
  return useAtom(indexingProgressAtom, {
    store: settingsStore,
  });
}
