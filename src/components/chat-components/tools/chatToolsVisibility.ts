import type { ChainPresetId } from "@/runtime/ChainPreset";

/**
 * Returns whether the composer should show the configurable tools popover for
 * the active preset.
 *
 * Chat + RAG already exposes vault behavior through the retrieval control, and
 * Project Agent already exposes project-scoped behavior through the scope
 * selector, so the extra tools popover stays hidden in those modes.
 */
export function shouldShowChatToolsPopover(presetId: ChainPresetId): boolean {
  return presetId !== "chat_rag" && presetId !== "project_agent";
}
