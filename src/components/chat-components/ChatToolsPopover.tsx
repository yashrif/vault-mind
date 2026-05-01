import React, { useState } from "react";
import {
  Brain,
  Calendar,
  Check,
  Code2,
  Database,
  FileText,
  Globe,
  Image,
  Lock,
  PlugZap,
  Search,
  Settings,
  Wrench,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { DEFAULT_SETTINGS } from "@/constants";
import { updateSetting, useSettingsValue } from "@/settings/model";
import { ToolRegistry } from "@/tools/ToolRegistry";
import {
  getProjectAgentOverride,
  isChatConfigurableTool,
  isToolChecked,
} from "@/core/toolUiHelpers";

/** Shorthand for a Lucide-style icon component */
type IconComponent = React.FC<{ className?: string }>;

/** Category icon mapping keyed by ToolUiCategory value */
const CATEGORY_ICON: Record<string, IconComponent> = {
  search: Database,
  file: FileText,
  media: Image,
  memory: Brain,
  time: Calendar,
  cli: Code2,
  mcp: PlugZap,
  custom: Settings,
};

/** Category colour classes keyed by ToolUiCategory value */
const CATEGORY_COLOR: Record<string, string> = {
  search: "tw-text-context-manager-blue",
  file: "tw-text-context-manager-green",
  media: "tw-text-context-manager-orange",
  memory: "tw-text-context-manager-purple",
  time: "tw-text-context-manager-yellow",
  cli: "tw-text-context-manager-orange",
  mcp: "tw-text-context-manager-red",
  custom: "tw-text-muted",
};

export interface ChatToolsPopoverProps {
  /** "chat" binds to toolDefaults.chat; "agent" binds to toolDefaults.agent */
  surface: "chat" | "agent";
  /** Called when localSearch is toggled in agent mode */
  setVaultToggle?: (v: boolean) => void;
  /** Called when webSearch is toggled in agent mode */
  setWebToggle?: (v: boolean) => void;
  /** Called when writeFile is toggled in agent mode */
  setComposerToggle?: (v: boolean) => void;
  /** Called when localSearch is toggled off in agent mode */
  onVaultToggleOff?: () => void;
  /** Called when webSearch is toggled off in agent mode */
  onWebToggleOff?: () => void;
  /** Called when writeFile is toggled off in agent mode */
  onComposerToggleOff?: () => void;
}

/**
 * Returns the category icon component for the given tool.
 * For the "search" category, uses Globe for webSearch and Database for others.
 */
function getToolIcon(category: string, toolId: string): IconComponent {
  if (category === "search" && toolId === "webSearch") {
    return Globe;
  }
  return CATEGORY_ICON[category] ?? Settings;
}

/**
 * Rich tools popover for the chat composer bottom action bar.
 * Shows all configurable tools from the ToolRegistry filtered by surface,
 * supports search, per-tool toggle, bulk enable/disable/reset, and project
 * override indicators.
 */
const ChatToolsPopover: React.FC<ChatToolsPopoverProps> = ({
  surface,
  setVaultToggle,
  setWebToggle,
  setComposerToggle,
  onVaultToggleOff,
  onWebToggleOff,
  onComposerToggleOff,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const settings = useSettingsValue();

  const registry = ToolRegistry.getInstance();
  const allConfigurable = registry.getConfigurableTools();

  /** Tools visible for this surface */
  const tools =
    surface === "chat" ? allConfigurable.filter(isChatConfigurableTool) : allConfigurable;

  /**
   * Returns whether the given tool ID is currently checked for this surface.
   */
  const isChecked = (toolId: string): boolean =>
    isToolChecked(surface, settings.toolDefaults, toolId);

  /** Number of currently enabled tools in this surface */
  const activeCount = tools.filter((t) => isChecked(t.metadata.id)).length;

  /** Tools matching the current search query */
  const filtered = tools.filter(
    (t) =>
      !search ||
      t.metadata.displayName.toLowerCase().includes(search.toLowerCase()) ||
      t.metadata.description.toLowerCase().includes(search.toLowerCase())
  );

  /**
   * Toggles a single tool on or off, updates settings, and fires pill-sync
   * callbacks in agent mode for the three bridged tool IDs.
   */
  const handleToggle = (toolId: string, enabled: boolean): void => {
    updateSetting("toolDefaults", {
      ...settings.toolDefaults,
      [surface]: { ...settings.toolDefaults[surface], [toolId]: enabled },
    });

    // Pill sync — agent mode only
    if (surface === "agent") {
      if (toolId === "localSearch") {
        setVaultToggle?.(enabled);
        if (!enabled) onVaultToggleOff?.();
      }
      if (toolId === "webSearch") {
        setWebToggle?.(enabled);
        if (!enabled) onWebToggleOff?.();
      }
      if (toolId === "writeFile") {
        setComposerToggle?.(enabled);
        if (!enabled) onComposerToggleOff?.();
      }
    }
  };

  /**
   * Enables all tools for this surface.
   */
  const handleEnableAll = (): void => {
    const all = Object.fromEntries(tools.map((t) => [t.metadata.id, true]));
    updateSetting("toolDefaults", {
      ...settings.toolDefaults,
      [surface]: { ...settings.toolDefaults[surface], ...all },
    });
  };

  /**
   * Disables all tools for this surface.
   */
  const handleClearAll = (): void => {
    const all = Object.fromEntries(tools.map((t) => [t.metadata.id, false]));
    updateSetting("toolDefaults", {
      ...settings.toolDefaults,
      [surface]: { ...settings.toolDefaults[surface], ...all },
    });
  };

  /**
   * Resets this surface's tool defaults to the plugin-shipped defaults.
   */
  const handleReset = (): void => {
    updateSetting("toolDefaults", {
      ...settings.toolDefaults,
      [surface]: { ...DEFAULT_SETTINGS.toolDefaults[surface] },
    });
  };

  /**
   * Handles popover open/close state and clears search when closing.
   */
  const handleOpenChange = (v: boolean): void => {
    setOpen(v);
    if (!v) setSearch("");
  };

  return (
    <TooltipProvider delayDuration={0}>
      <Popover open={open} onOpenChange={handleOpenChange}>
        {/* Trigger: wrench button with active-count badge */}
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <div className="tw-relative tw-inline-flex">
                <Button
                  variant="ghost2"
                  size="fit"
                  className={cn(
                    "tw-text-muted hover:tw-text-accent",
                    open && "tw-text-accent tw-bg-accent/10"
                  )}
                  aria-label="Configure tools"
                >
                  <Wrench className="tw-size-4" />
                </Button>
                {activeCount > 0 && (
                  <span
                    className={cn(
                      "tw-pointer-events-none tw-absolute tw--right-1 tw--top-1",
                      "tw-size-3.5 tw-rounded-full",
                      "tw-bg-interactive-accent tw-text-on-accent",
                      "tw-flex tw-items-center tw-justify-center tw-text-[9px]"
                    )}
                  >
                    {activeCount}
                  </span>
                )}
              </div>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent className="tw-px-1 tw-py-0.5">Configure tools</TooltipContent>
        </Tooltip>

        <PopoverContent
          side="top"
          align="end"
          sideOffset={8}
          className="tw-w-80 tw-overflow-hidden tw-rounded-xl tw-border tw-border-border tw-bg-primary tw-p-0 tw-shadow-lg"
        >
          {/* ── Header ── */}
          <div className="tw-flex tw-items-center tw-gap-2 tw-border-b tw-border-border tw-px-3 tw-py-2.5">
            <div className="tw-flex tw-size-6 tw-items-center tw-justify-center tw-rounded tw-text-accent tw-bg-interactive-accent/10">
              <Wrench className="tw-size-3.5" />
            </div>
            <span className="tw-text-sm tw-font-medium tw-text-normal">Tools</span>
            <span className="tw-rounded-full tw-bg-secondary tw-px-1.5 tw-py-0.5 tw-text-[10px] tw-text-muted">
              {activeCount}/{tools.length}
            </span>
            <button
              className="tw-ml-auto tw-flex tw-items-center tw-justify-center tw-rounded tw-p-0.5 tw-text-muted hover:tw-text-normal"
              onClick={() => setOpen(false)}
              aria-label="Close tools popover"
            >
              <X className="tw-size-3.5" />
            </button>
          </div>

          {/* ── Search ── */}
          <div className="tw-border-b tw-border-border tw-px-3 tw-py-2">
            <div className="tw-relative">
              <Search className="tw-absolute tw-left-2 tw-top-1/2 tw-size-3.5 tw--translate-y-1/2 tw-text-muted" />
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tools..."
                className="tw-pl-7 tw-pr-6 tw-text-[12px]"
              />
              {search && (
                <button
                  className="tw-absolute tw-right-1.5 tw-top-1/2 tw--translate-y-1/2 tw-text-muted hover:tw-text-normal"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                >
                  <X className="tw-size-3" />
                </button>
              )}
            </div>
          </div>

          {/* ── Tool list ── */}
          <div className="tw-max-h-[280px] tw-overflow-y-auto tw-py-1">
            {filtered.length === 0 && (
              <div className="tw-px-3 tw-py-4 tw-text-center tw-text-[12px] tw-text-muted">
                No tools match your search.
              </div>
            )}
            {filtered.map((tool) => {
              const toolId = tool.metadata.id;
              const checked = isChecked(toolId);
              const override = surface === "agent" ? getProjectAgentOverride(toolId) : undefined;
              const hasOverride = override !== undefined && override !== "inherit";
              const IconComponent = getToolIcon(tool.metadata.category, toolId);
              const iconColor = CATEGORY_COLOR[tool.metadata.category] ?? "tw-text-muted";

              return (
                <button
                  key={toolId}
                  className="tw-group tw-flex tw-w-full tw-items-start tw-gap-2.5 tw-px-3 tw-py-2 tw-text-left hover:tw-bg-modifier-hover"
                  onClick={() => handleToggle(toolId, !checked)}
                  disabled={hasOverride}
                  aria-label={`Toggle ${tool.metadata.displayName}`}
                >
                  <div
                    aria-hidden="true"
                    className={cn(
                      "tw-mt-0.5 tw-flex tw-size-4 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-sm tw-border tw-transition-colors",
                      checked
                        ? "tw-border-interactive-accent tw-bg-interactive-accent tw-text-on-accent"
                        : "tw-border-border tw-text-transparent group-hover:tw-border-border-hover",
                      hasOverride && "tw-opacity-60"
                    )}
                  >
                    <Check className="tw-size-3" />
                  </div>
                  <IconComponent className={cn("tw-mt-0.5 tw-size-3.5 tw-shrink-0", iconColor)} />
                  <div className="tw-flex tw-min-w-0 tw-flex-col tw-gap-0.5">
                    <span className="tw-truncate tw-text-[12px] tw-font-medium tw-text-normal">
                      {tool.metadata.displayName}
                    </span>
                    <span className="tw-line-clamp-1 tw-text-[11px] tw-text-muted">
                      {tool.metadata.description}
                    </span>
                  </div>
                  {hasOverride && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="tw-ml-auto tw-mt-0.5 tw-shrink-0">
                          <Lock className="tw-size-3 tw-text-muted" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Overridden by current project</TooltipContent>
                    </Tooltip>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Footer ── */}
          <div className="tw-flex tw-items-center tw-justify-between tw-border-t tw-border-border tw-px-3 tw-py-2.5 tw-bg-secondary/40">
            <div className="tw-flex tw-items-center tw-gap-2.5">
              <Button
                variant="ghost2"
                size="fit"
                className="tw-text-[11px]"
                onClick={handleEnableAll}
              >
                Enable all
              </Button>
              <div className="tw-h-3 tw-w-px tw-border-l tw-border-border" />
              <Button variant="ghost2" size="fit" className="tw-text-[11px]" onClick={handleReset}>
                Reset
              </Button>
            </div>
            <Button variant="ghost2" size="fit" className="tw-text-[11px]" onClick={handleClearAll}>
              Clear all
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
};

export { ChatToolsPopover };
