import { cn } from "@/lib/utils";
import { ToolDefinition } from "@/tools/ToolRegistry";
import React, { FC } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Check, Lock } from "lucide-react";

type IconComponent = React.FC<{ className?: string }>;

export interface ToolItemProps {
  toolId: string;
  index: number;
  hasOverride: boolean;
  handleToggle: (toolId: string, enabled: boolean) => void;
  checked: boolean;
  tool: ToolDefinition;
  IconComponent: IconComponent;
  iconColor: string;
}

const RAW_ROW_BUTTON_CLASS =
  "!tw-flex !tw-h-auto !tw-min-h-0 !tw-w-full !tw-appearance-none !tw-border-0 !tw-bg-transparent !tw-shadow-none focus-visible:!tw-outline-none focus-visible:!tw-ring-0 disabled:!tw-opacity-100";

const ToolItem: FC<ToolItemProps> = ({
  toolId,
  index,
  hasOverride,
  handleToggle,
  checked,
  tool,
  IconComponent,
  iconColor,
}) => {
  return (
    <div key={toolId} className={cn("last:tw-border-b")}>
      <button
        type="button"
        className={cn(
          RAW_ROW_BUTTON_CLASS,
          "tw-group tw-items-start tw-justify-start tw-gap-3 tw-rounded-md tw-px-1 tw-py-3 tw-text-left tw-transition-colors",
          hasOverride
            ? "tw-cursor-default tw-bg-transparent hover:tw-bg-transparent"
            : "hover:tw-bg-modifier-hover/40"
        )}
        onClick={() => handleToggle(toolId, !checked)}
        disabled={hasOverride}
        aria-label={`Toggle ${tool.metadata.displayName}`}
      >
        <div
          aria-hidden="true"
          className={cn(
            "tw-mt-0.5 tw-flex tw-size-4 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-[4px] tw-border tw-border-solid tw-transition-colors",
            checked
              ? "tw-border-interactive-accent tw-bg-interactive-accent tw-text-on-accent"
              : "tw-border-[--background-modifier-border-hover] tw-bg-transparent group-hover:tw-border-interactive-accent/70",
            hasOverride && "tw-opacity-60"
          )}
        >
          {checked ? <Check className="tw-size-3" /> : null}
        </div>
        <IconComponent
          className={cn(
            "tw-mt-0.5 tw-size-4 tw-shrink-0",
            iconColor,
            hasOverride && "tw-opacity-80"
          )}
        />
        <div className="tw-flex tw-min-w-0 tw-flex-1 tw-flex-col tw-gap-0.5">
          <span className="tw-truncate tw-text-sm tw-font-medium tw-leading-tight tw-text-normal">
            {tool.metadata.displayName}
          </span>
          <span className="tw-truncate tw-text-xs tw-leading-tight tw-text-muted">
            {tool.metadata.description}
          </span>
        </div>
        {hasOverride && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="tw-mt-0.5 tw-inline-flex tw-shrink-0 tw-items-center tw-justify-center tw-text-muted">
                <Lock className="tw-size-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent>Overridden by current project</TooltipContent>
          </Tooltip>
        )}
      </button>
    </div>
  );
};

export default ToolItem;
