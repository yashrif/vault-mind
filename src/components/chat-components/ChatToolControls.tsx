import React from "react";
import { Database, Globe, Pen, Sparkles, Wrench, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { isAgentPresetId, type ChainPresetId } from "@/runtime/ChainPreset";

interface ChatToolControlsProps {
  // Tool toggle states
  vaultToggle: boolean;
  setVaultToggle: (value: boolean) => void;
  webToggle: boolean;
  setWebToggle: (value: boolean) => void;
  composerToggle: boolean;
  setComposerToggle: (value: boolean) => void;

  // Toggle-off callbacks for pill removal
  onVaultToggleOff?: () => void;
  onWebToggleOff?: () => void;
  onComposerToggleOff?: () => void;

  // Other props
  presetId: ChainPresetId;
}

const ChatToolControls: React.FC<ChatToolControlsProps> = ({
  vaultToggle,
  setVaultToggle,
  webToggle,
  setWebToggle,
  composerToggle,
  setComposerToggle,
  onVaultToggleOff,
  onWebToggleOff,
  onComposerToggleOff,
  presetId,
}) => {
  const isAgentMode = isAgentPresetId(presetId);
  const canShowToolControls = isAgentMode;

  const handleVaultToggle = () => {
    const newValue = !vaultToggle;
    setVaultToggle(newValue);
    // If toggling off, remove pills
    if (!newValue && onVaultToggleOff) {
      onVaultToggleOff();
    }
  };

  const handleWebToggle = () => {
    const newValue = !webToggle;
    setWebToggle(newValue);
    // If toggling off, remove pills
    if (!newValue && onWebToggleOff) {
      onWebToggleOff();
    }
  };

  const handleComposerToggle = () => {
    const newValue = !composerToggle;
    setComposerToggle(newValue);
    // If toggling off, remove pills
    if (!newValue && onComposerToggleOff) {
      onComposerToggleOff();
    }
  };

  // If not agent mode, don't show any tools
  if (!canShowToolControls) {
    return null;
  }

  const toolOptions = [
    {
      label: "Vault Search",
      description: "Search your Obsidian vault for context",
      active: vaultToggle,
      icon: Database,
      onToggle: handleVaultToggle,
    },
    {
      label: "Web Search",
      description: "Search the web for current information",
      active: webToggle,
      icon: Globe,
      onToggle: handleWebToggle,
    },
    {
      label: "Composer",
      description: "Allow note editing and composition tools",
      active: composerToggle,
      icon: Pen,
      onToggle: handleComposerToggle,
      leadingIcon: Sparkles,
    },
  ];
  const activeToolCount = toolOptions.filter((tool) => tool.active).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost2"
          size="fit"
          title="Tools"
          aria-label={`Tools${activeToolCount > 0 ? `, ${activeToolCount} enabled` : ""}`}
          className={cn(
            "tw-relative tw-size-7 tw-px-0 tw-text-muted hover:tw-text-accent",
            activeToolCount > 0 && "tw-text-accent"
          )}
        >
          <Wrench className="tw-size-4" />
          {activeToolCount > 0 && (
            <span
              data-testid="active-tool-count"
              className="tw-absolute -tw-right-1 -tw-top-1 tw-flex tw-size-3.5 tw-items-center tw-justify-center tw-rounded-full tw-bg-interactive-accent tw-text-[8px] tw-font-medium tw-leading-none tw-text-on-accent"
            >
              {activeToolCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="tw-w-64 tw-p-1">
        <div className="tw-flex tw-items-center tw-justify-between tw-px-2 tw-py-1.5">
          <div className="tw-flex tw-items-center tw-gap-2 tw-text-sm tw-font-medium">
            <Wrench className="tw-size-4 tw-text-accent" />
            Tools
          </div>
          <span className="tw-rounded-sm tw-bg-secondary tw-px-1.5 tw-py-0.5 tw-text-xs tw-text-muted">
            {activeToolCount}/{toolOptions.length}
          </span>
        </div>
        {toolOptions.map((tool) => {
          const Icon = tool.icon;
          const LeadingIcon = tool.leadingIcon;
          return (
            <DropdownMenuItem
              key={tool.label}
              onSelect={(event) => {
                event.preventDefault();
                tool.onToggle();
              }}
              className="tw-flex tw-items-center tw-gap-2 tw-p-2"
            >
              <span
                className={cn(
                  "tw-flex tw-size-4 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-sm tw-border tw-border-solid",
                  tool.active
                    ? "tw-border-interactive-accent tw-bg-interactive-accent tw-text-on-accent"
                    : "tw-border-border tw-text-transparent"
                )}
              >
                <Check className="tw-size-3" strokeWidth={3} />
              </span>
              <span className="tw-flex tw-size-4 tw-shrink-0 tw-items-center tw-justify-center tw-text-muted">
                {LeadingIcon ? (
                  <>
                    <LeadingIcon className="tw-size-2" />
                    <Icon className="tw-size-3" />
                  </>
                ) : (
                  <Icon className="tw-size-4" />
                )}
              </span>
              <span className="tw-flex tw-min-w-0 tw-flex-1 tw-flex-col">
                <span className="tw-text-sm tw-leading-tight tw-text-normal">{tool.label}</span>
                <span className="tw-truncate tw-text-xs tw-leading-tight tw-text-muted">
                  {tool.description}
                </span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export { ChatToolControls };
