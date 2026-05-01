import { getCurrentProject, ToolOverrideValue } from "@/aiParams";
import { ToolDefaultSettings } from "@/settings/model";
import { ToolDefinition } from "@/tools/ToolRegistry";

/**
 * Returns whether the given tool should be configurable for the Chat surface.
 * Only costly (read-only) tools are shown; localSearch is excluded because
 * it is controlled separately by the RAG toggle.
 */
export function isChatConfigurableTool(t: ToolDefinition): boolean {
  return t.metadata.accessLevel === "costly" && t.metadata.id !== "localSearch";
}

/**
 * Returns the checked state for a tool toggle based on surface semantics.
 * - `chat` and `agent` use opt-in semantics: checked only when explicitly `true`.
 * - `telegram` uses opt-out semantics: checked unless explicitly `false`.
 */
export function isToolChecked(
  surface: "chat" | "agent" | "telegram",
  toolDefaults: ToolDefaultSettings,
  toolId: string
): boolean {
  if (surface === "telegram") return toolDefaults.telegram?.[toolId] !== false;
  return toolDefaults[surface]?.[toolId] === true;
}

/**
 * Returns the active project's override value for the given agent tool, if any.
 * Returns `undefined` when there is no active project or no override is set.
 */
export function getProjectAgentOverride(toolId: string): ToolOverrideValue | undefined {
  return getCurrentProject()?.toolOverrides?.agent?.[toolId];
}

/**
 * Returns the effective enabled state for an agent tool by applying any active
 * project-level override on top of the global default.
 * - When the project override is a boolean, that value wins.
 * - When the override is `"inherit"` or absent, falls back to `toolDefaults.agent`.
 */
export function effectiveAgentToolEnabled(
  toolDefaults: ToolDefaultSettings,
  toolId: string
): boolean {
  const override = getProjectAgentOverride(toolId);
  if (override !== undefined && override !== "inherit") return override;
  return toolDefaults.agent?.[toolId] === true;
}
