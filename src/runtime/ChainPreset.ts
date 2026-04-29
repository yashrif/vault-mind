import type { StructuredTool } from "@langchain/core/tools";

import type { RuntimeChainPolicy } from "@/runtime/RuntimeChainPolicy";

export type ChainPresetId = "chat" | "chat_rag" | "agent" | "project_agent" | "telegram";

export type ChainPresetInput = ChainPresetId | string;

export type PromptProfile = ChainPresetId;

type ChatRagLegacyChainId = `${"vault"}_${"qa"}`;

const LEGACY_CHAT_RAG_CHAIN_ID = ["vault", "qa"].join("_") as ChatRagLegacyChainId;

export type LegacyChainId =
  | "llm_chain"
  | ChatRagLegacyChainId
  | "cortex_plus"
  | "project"
  | "telegram";

export const LEGACY_CHAIN_IDS = {
  CHAT: "llm_chain",
  CHAT_RAG: LEGACY_CHAT_RAG_CHAIN_ID,
  AGENT: "cortex_plus",
  PROJECT_AGENT: "project",
  TELEGRAM: "telegram",
} as const satisfies Record<string, LegacyChainId>;

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

/**
 * Normalizes current preset IDs and legacy chain enum values to preset IDs.
 */
export function normalizeChainPresetId(presetId: ChainPresetInput): ChainPresetId {
  switch (String(presetId)) {
    case "llm_chain":
      return "chat";
    case LEGACY_CHAIN_IDS.CHAT_RAG:
      return "chat_rag";
    case "cortex_plus":
    case "Cortex_plus":
    case "Cortex_plus_chain":
      return "agent";
    case "project":
    case "project_chain":
      return "project_agent";
    case "telegram":
      return "telegram";
    default:
      return presetId as ChainPresetId;
  }
}

/**
 * Maps preset IDs to the legacy string identifier while context preparation is migrated.
 */
export function legacyChainIdForPresetId(presetId: ChainPresetId): LegacyChainId {
  switch (presetId) {
    case "chat":
      return LEGACY_CHAIN_IDS.CHAT;
    case "chat_rag":
      return LEGACY_CHAIN_IDS.CHAT_RAG;
    case "agent":
      return LEGACY_CHAIN_IDS.AGENT;
    case "project_agent":
      return LEGACY_CHAIN_IDS.PROJECT_AGENT;
    case "telegram":
      return LEGACY_CHAIN_IDS.TELEGRAM;
  }
}

/**
 * Returns true for presets that expose agent-specific UI controls.
 */
export function isAgentPresetId(presetId: ChainPresetId): boolean {
  return presetId === "agent" || presetId === "project_agent";
}

/**
 * Returns true for presets that can pass rich composer context to the runner.
 */
export function isRichContextPresetId(presetId: ChainPresetId): boolean {
  return presetId !== "chat";
}
