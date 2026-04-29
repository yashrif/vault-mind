import type { Vault } from "obsidian";

import { formatTelegramOutboundMessage } from "@/channels/telegram/telegramOutboundFormat";
import { resolveToolPermissions } from "@/core/ToolPermissions";
import type { ChainPreset, ChainPresetId } from "@/runtime/ChainPreset";
import { resolveRuntimeChainPolicy } from "@/runtime/RuntimeChainPolicy";

export interface BuildChainPresetOptions {
  presetId: ChainPresetId;
  projectId?: string;
  vault?: Vault;
  vaultAvailable?: boolean;
}

/**
 * Builds the unified runtime preset for a chat, agent, project, or Telegram turn.
 */
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
