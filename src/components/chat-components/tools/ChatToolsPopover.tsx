import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DEFAULT_SETTINGS } from "@/constants";
import {
  getProjectAgentOverride,
  isChatConfigurableTool,
  isToolChecked,
} from "@/core/toolUiHelpers";
import { cn } from "@/lib/utils";
import { updateSetting, useSettingsValue } from "@/settings/model";
import { ToolRegistry } from "@/tools/ToolRegistry";
import {
  Brain,
  Calendar,
  Code2,
  Database,
  FileText,
  Globe,
  Image,
  PlugZap,
  Search,
  Settings,
  Wrench,
  X,
} from "lucide-react";
import React, { useState } from "react";
import ToolItem from "./ToolItem";

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

const RAW_ICON_BUTTON_CLASS =
  "!tw-inline-flex !tw-h-auto !tw-min-h-0 !tw-appearance-none !tw-border-0 !tw-bg-transparent !tw-p-0 !tw-shadow-none focus-visible:!tw-outline-none focus-visible:!tw-ring-0";

const RAW_TEXT_BUTTON_CLASS =
  "!tw-inline-flex !tw-h-auto !tw-min-h-0 !tw-appearance-none !tw-border-0 !tw-bg-transparent !tw-p-0 !tw-shadow-none focus-visible:!tw-outline-none focus-visible:!tw-ring-0 disabled:!tw-opacity-50";

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

  /** Empty-state copy shown when search produces no matching tools. */
  const emptyStateMessage = search ? `No tools match "${search}"` : "No tools available.";

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
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <div className="tw-relative tw-inline-flex">
                <Button
                  variant="ghost2"
                  size="fit"
                  className={cn("tw-text-muted hover:tw-text-accent", open && "tw-text-accent")}
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
          className="tw-w-80 tw-overflow-hidden tw-rounded-md tw-p-0"
        >
          <div className="tw-flex tw-max-h-[500px] tw-flex-col">
            {/* ── Header ── */}
            <div className="tw-shrink-0 tw-border-b tw-px-4">
              <div className="tw-flex tw-items-center tw-justify-between">
                <h3 className="tw-font-semibold">Tools</h3>
                <span className="tw-rounded-md tw-bg-secondary tw-px-1.5 tw-py-0.5 tw-text-xs tw-font-medium tw-text-muted">
                  {activeCount}/{tools.length}
                </span>
              </div>
            </div>

            <Separator />

            {/* ── Search ── */}
            <div className="tw-shrink-0 tw-p-4 tw-pb-3">
              <div className="tw-relative">
                <Search className="tw-pointer-events-none tw-absolute tw-left-3 tw-top-1/2 tw-size-4 tw--translate-y-1/2 tw-text-muted" />
                <Input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search tools..."
                  className="tw-rounded-md tw-border-border !tw-px-9 !tw-text-sm tw-bg-secondary/30 placeholder:tw-text-sm focus-visible:tw-ring-ring"
                />
                {search && (
                  <button
                    type="button"
                    className={cn(
                      RAW_ICON_BUTTON_CLASS,
                      "tw-absolute tw-right-3 tw-top-1/2 tw-size-4 tw--translate-y-1/2 tw-items-center tw-justify-center tw-text-muted tw-transition-all hover:tw-scale-110 hover:tw-text-normal"
                    )}
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                  >
                    <X className="tw-size-3.5" />
                  </button>
                )}
              </div>
            </div>

            <Separator />

            {/* ── Tool list ── */}
            <ScrollArea className="tw-flex-1 tw-overflow-y-auto">
              <div className="tw-px-4 tw-py-2">
                {filtered.length === 0 && (
                  <div className="tw-flex tw-flex-col tw-items-center tw-gap-1.5 tw-py-8 tw-text-center tw-text-muted">
                    <Search className="tw-size-4 tw-opacity-50" />
                    <span className="tw-text-[12px]">{emptyStateMessage}</span>
                  </div>
                )}
                {filtered.map((tool, index) => {
                  const toolId = tool.metadata.id;
                  const checked = isChecked(toolId);
                  const override =
                    surface === "agent" ? getProjectAgentOverride(toolId) : undefined;
                  const hasOverride = override !== undefined && override !== "inherit";
                  const IconComponent = getToolIcon(tool.metadata.category, toolId);
                  const iconColor = CATEGORY_COLOR[tool.metadata.category] ?? "tw-text-muted";

                  return (
                    <ToolItem
                      key={toolId}
                      toolId={toolId}
                      index={index}
                      hasOverride={hasOverride}
                      handleToggle={handleToggle}
                      checked={checked}
                      tool={tool}
                      IconComponent={IconComponent}
                      iconColor={iconColor}
                    />
                  );
                })}
              </div>
            </ScrollArea>

            <Separator />

            {/* ── Footer ── */}
            <div className="tw-flex tw-shrink-0 tw-items-center tw-justify-between tw-px-4 tw-py-3">
              <div className="tw-flex tw-items-center tw-gap-3">
                <button
                  type="button"
                  className={cn(
                    RAW_TEXT_BUTTON_CLASS,
                    "tw-text-xs tw-font-medium tw-text-muted tw-transition-colors hover:tw-text-accent"
                  )}
                  onClick={handleEnableAll}
                >
                  Enable all
                </button>
                <div className="tw-h-3 tw-border-l tw-border-border" />
                <button
                  type="button"
                  className={cn(
                    RAW_TEXT_BUTTON_CLASS,
                    "tw-text-xs tw-font-medium tw-text-muted tw-transition-colors hover:tw-text-normal"
                  )}
                  onClick={handleReset}
                >
                  Reset
                </button>
              </div>
              <button
                type="button"
                className={cn(
                  RAW_TEXT_BUTTON_CLASS,
                  "tw-text-xs tw-font-medium tw-text-muted tw-transition-colors hover:tw-text-normal"
                )}
                onClick={handleClearAll}
              >
                Clear all
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
};

export { ChatToolsPopover };
