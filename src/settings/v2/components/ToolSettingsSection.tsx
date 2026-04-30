import React from "react";
import { SettingItem } from "@/components/ui/setting-item";
import { AGENT_MAX_ITERATIONS_LIMIT } from "@/constants";
import { updateSetting, useSettingsValue } from "@/settings/model";
import { ToolDefinition } from "@/tools/ToolRegistry";
import { ToolRegistry } from "@/tools/ToolRegistry";

/**
 * Returns whether the tool should be configurable for Chat.
 */
function isChatConfigurableTool({ metadata }: ToolDefinition): boolean {
  return metadata.accessLevel === "costly" && metadata.id !== "localSearch";
}

interface ToolSettingsSectionProps {
  /** When provided, renders only that surface's section. Omit to render Chat + Agent (default). */
  surface?: "telegram";
}

export const ToolSettingsSection: React.FC<ToolSettingsSectionProps> = ({ surface }) => {
  const settings = useSettingsValue();
  const registry = ToolRegistry.getInstance();
  const toolDefaults = settings.toolDefaults;

  // Get configurable tools grouped by category.
  const toolsByCategory = registry.getToolsByCategory();
  const configurableTools = registry.getConfigurableTools();
  const configurableToolIds = new Set(configurableTools.map((tool) => tool.metadata.id));

  /**
   * Updates the default state for a tool on the selected surface.
   */
  const handleToolToggle = (
    surf: "chat" | "agent" | "telegram",
    toolId: string,
    enabled: boolean
  ) => {
    updateSetting("toolDefaults", {
      ...toolDefaults,
      [surf]: {
        ...toolDefaults[surf],
        [toolId]: enabled,
      },
    });
  };

  /**
   * Renders a switch row bound to one surface-specific tool default.
   * Telegram uses opt-out semantics (checked unless explicitly false);
   * chat and agent use opt-in semantics (checked only when explicitly true).
   */
  const renderToolSwitch = (definition: ToolDefinition, surf: "chat" | "agent" | "telegram") => {
    const { metadata } = definition;
    const checked =
      surf === "telegram"
        ? toolDefaults.telegram?.[metadata.id] !== false
        : toolDefaults[surf]?.[metadata.id] === true;
    return (
      <SettingItem
        key={`${surf}-${metadata.id}`}
        type="switch"
        title={metadata.displayName}
        description={metadata.description}
        checked={checked}
        onCheckedChange={(value) => handleToolToggle(surf, metadata.id, value)}
      />
    );
  };

  /**
   * Renders costly read-only tools that Chat may use when enabled.
   */
  const renderChatCostlyTools = () => {
    return configurableTools.filter(isChatConfigurableTool).map((tool) => {
      return renderToolSwitch(tool, "chat");
    });
  };

  /**
   * Renders all configurable tools available to Agent surfaces.
   */
  const renderAgentTools = () => {
    const categories = Array.from(toolsByCategory.entries()).filter(([_, tools]) =>
      tools.some((tool) => configurableToolIds.has(tool.metadata.id))
    );
    return categories.map(([category, tools]) => {
      const configurableInCategory = tools.filter((tool) =>
        configurableToolIds.has(tool.metadata.id)
      );

      if (configurableInCategory.length === 0) return null;

      return (
        <div key={category} className="tw-flex tw-flex-col tw-gap-2">
          {configurableInCategory.map((definition) => renderToolSwitch(definition, "agent"))}
        </div>
      );
    });
  };

  /**
   * Renders all configurable tools available to Telegram, defaulting to enabled.
   */
  const renderTelegramTools = () => {
    const categories = Array.from(toolsByCategory.entries()).filter(([_, tools]) =>
      tools.some((tool) => configurableToolIds.has(tool.metadata.id))
    );
    return categories.map(([category, tools]) => {
      const configurableInCategory = tools.filter((tool) =>
        configurableToolIds.has(tool.metadata.id)
      );

      if (configurableInCategory.length === 0) return null;

      return (
        <div key={category} className="tw-flex tw-flex-col tw-gap-2">
          {configurableInCategory.map((definition) => renderToolSwitch(definition, "telegram"))}
        </div>
      );
    });
  };

  if (surface === "telegram") {
    return (
      <div className="tw-mt-4 tw-rounded-lg tw-bg-secondary tw-p-4">
        <div className="tw-mb-2 tw-text-sm tw-font-medium">Telegram Tools</div>
        <div className="tw-mb-4 tw-text-xs tw-text-muted">
          Tools available to the Telegram bot. All tools are on by default; toggle off to disable
          individually.
        </div>
        <div className="tw-flex tw-flex-col tw-gap-2">{renderTelegramTools()}</div>
      </div>
    );
  }

  return (
    <>
      <SettingItem
        type="slider"
        title="Max Iterations"
        description="Maximum number of reasoning iterations the autonomous agent can perform. Higher values allow for more complex reasoning but may take longer."
        value={settings.autonomousAgentMaxIterations ?? 4}
        onChange={(value) => {
          updateSetting("autonomousAgentMaxIterations", value);
        }}
        min={4}
        max={AGENT_MAX_ITERATIONS_LIMIT}
        step={1}
      />

      <div className="tw-mt-4 tw-rounded-lg tw-bg-secondary tw-p-4">
        <div className="tw-mb-2 tw-text-sm tw-font-medium">Chat Tools</div>
        <div className="tw-mb-4 tw-text-xs tw-text-muted">
          Optional read-only tools available to Chat. Vault Search is controlled by the RAG toggle.
        </div>

        <div className="tw-flex tw-flex-col tw-gap-2">{renderChatCostlyTools()}</div>
      </div>

      <div className="tw-mt-4 tw-rounded-lg tw-bg-secondary tw-p-4">
        <div className="tw-mb-2 tw-text-sm tw-font-medium">Agent Tools</div>
        <div className="tw-mb-4 tw-text-xs tw-text-muted">
          Tools available to Agent and Project Agent.
        </div>

        <div className="tw-flex tw-flex-col tw-gap-2">{renderAgentTools()}</div>
      </div>
    </>
  );
};
