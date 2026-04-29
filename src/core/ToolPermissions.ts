import type { StructuredTool } from "@langchain/core/tools";
import type { Vault } from "obsidian";

import { getCurrentProject } from "@/aiParams";
import { getSettings, type ToolDefaultSettings } from "@/settings/model";
import { type ToolDefinition, ToolRegistry } from "@/tools/ToolRegistry";

export interface ToolPermissionContext {
  surface: "chat" | "agent" | "telegram";
  ragEnabled?: boolean;
  projectId?: string;
  vaultAvailable?: boolean;
  vault?: Vault;
  toolDefaults?: ToolDefaultSettings;
}

/**
 * Returns whether a tool is available for the current vault context.
 */
function isAvailableForVault(definition: ToolDefinition, vaultAvailable: boolean): boolean {
  return !definition.metadata.requiresVault || vaultAvailable;
}

/**
 * Returns whether a tool ID is explicitly enabled in a default map.
 */
function isEnabled(defaults: Record<string, boolean>, id: string): boolean {
  return defaults[id] === true;
}

/**
 * Applies the current project's agent tool override to a default value.
 */
function applyProjectOverride(defaultValue: boolean, toolId: string): boolean {
  const override = getCurrentProject()?.toolOverrides?.agent?.[toolId];
  if (override === "inherit" || override === undefined) {
    return defaultValue;
  }
  return override;
}

/**
 * Resolves the LangChain tools allowed for the active surface and tool defaults.
 */
export function resolveToolPermissions(context: ToolPermissionContext): StructuredTool[] {
  const registry = ToolRegistry.getInstance();
  const vaultAvailable = context.vaultAvailable ?? !!context.vault;
  const defaults = context.toolDefaults ?? getSettings().toolDefaults;

  if (context.surface === "telegram") {
    const telegramDefaults = defaults.telegram ?? {};
    return registry
      .getAllTools()
      .filter(
        (definition) =>
          isAvailableForVault(definition, vaultAvailable) &&
          telegramDefaults[definition.metadata.id] !== false
      )
      .map((definition) => definition.tool);
  }
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
