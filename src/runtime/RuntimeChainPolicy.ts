import { ChainType } from "@/chainFactory";

export type PromptResolutionTarget = "default" | "telegram";
export type RichContextPolicy = "standard" | "plus";
export type ManualToolPolicy = "ui_markers" | "forced_virtual_markers";
export type AutonomousToolPolicy = "settings_filtered" | "full_builtin";
export type HistoryScope = "shared_repo" | "telegram_visible_thread";

export interface RuntimeChainPolicy {
  chainType: ChainType;
  promptTarget: PromptResolutionTarget;
  richContextPolicy: RichContextPolicy;
  manualToolPolicy: ManualToolPolicy;
  autonomousToolPolicy: AutonomousToolPolicy;
  historyScope: HistoryScope;
}

export const TELEGRAM_FORCED_MANUAL_TOOL_MARKERS = ["@vault", "@websearch", "@composer"] as const;

/**
 * Resolve the runtime behavior policy for a chain.
 * UI helpers such as isAgentChain() remain presentation-only and should not be
 * used to drive runtime context, prompt, or tool behavior.
 */
export function resolveRuntimeChainPolicy(chainType: ChainType): RuntimeChainPolicy {
  switch (chainType) {
    case ChainType.TELEGRAM_CHAIN:
      return {
        chainType,
        promptTarget: "telegram",
        richContextPolicy: "plus",
        manualToolPolicy: "forced_virtual_markers",
        autonomousToolPolicy: "full_builtin",
        historyScope: "telegram_visible_thread",
      };
    case ChainType.TOOL_CHAIN:
    case ChainType.PROJECT_CHAIN:
      return {
        chainType,
        promptTarget: "default",
        richContextPolicy: "plus",
        manualToolPolicy: "ui_markers",
        autonomousToolPolicy: "settings_filtered",
        historyScope: "shared_repo",
      };
    default:
      return {
        chainType,
        promptTarget: "default",
        richContextPolicy: "standard",
        manualToolPolicy: "ui_markers",
        autonomousToolPolicy: "settings_filtered",
        historyScope: "shared_repo",
      };
  }
}

/**
 * Return the telegram-only virtual tool markers that should be added at
 * request time without mutating the stored raw message text.
 */
export function injectVirtualToolMarkers(
  messageText: string,
  markers: readonly string[] = TELEGRAM_FORCED_MANUAL_TOOL_MARKERS
): string {
  const normalizedMessage = messageText.trimEnd();
  const lowered = normalizedMessage.toLowerCase();
  const missingMarkers = markers.filter((marker) => !lowered.includes(marker.toLowerCase()));

  if (missingMarkers.length === 0) {
    return normalizedMessage;
  }

  if (!normalizedMessage) {
    return missingMarkers.join(" ");
  }

  return `${normalizedMessage} ${missingMarkers.join(" ")}`;
}
