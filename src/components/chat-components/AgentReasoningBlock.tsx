import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  ReasoningPayload,
  ReasoningStep,
} from "@/LLMProviders/chainRunner/utils/AgentReasoningState";
import { ChevronRight } from "lucide-react";
import React, { useEffect, useState } from "react";

/**
 * Props for the AgentReasoningBlock component.
 */
interface AgentReasoningBlockProps {
  payload: ReasoningPayload;
  isStreaming: boolean;
}

/**
 * Formats elapsed time into a human-readable string.
 *
 * @param seconds - Elapsed time in seconds.
 * @returns Formatted time string.
 */
const formatTime = (seconds: number): string => {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
};

/**
 * Animated spinner using a 7-dot sigma pattern.
 */
const CortexSpinner: React.FC = () => {
  const sigmaDots: { row: number; col: number; animIndex: number }[] = [
    { row: 0, col: 0, animIndex: 2 },
    { row: 0, col: 1, animIndex: 1 },
    { row: 0, col: 2, animIndex: 0 },
    { row: 1, col: 1, animIndex: 3 },
    { row: 2, col: 0, animIndex: 4 },
    { row: 2, col: 1, animIndex: 5 },
    { row: 2, col: 2, animIndex: 6 },
  ];

  const dotSize = 2.5;
  const gap = 3;
  const gridSize = dotSize * 3 + gap * 2;

  return (
    <svg
      width={gridSize}
      height={gridSize}
      viewBox={`0 0 ${gridSize} ${gridSize}`}
      className="cortex-spinner"
    >
      {sigmaDots.map((dot, index) => {
        const cx = dot.col * (dotSize + gap) + dotSize / 2;
        const cy = dot.row * (dotSize + gap) + dotSize / 2;

        return (
          <circle
            key={index}
            cx={cx}
            cy={cy}
            r={dotSize / 2}
            // eslint-disable-next-line tailwindcss/no-custom-classname
            className={`cortex-spinner-dot cortex-spinner-dot-${dot.animIndex}`}
          />
        );
      })}
    </svg>
  );
};

/**
 * Format a persisted preview value for display.
 *
 * @param value - Preview value from the reasoning payload.
 * @returns Readable preview text.
 */
const formatPreview = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
};

/**
 * Render one reasoning step and optional nested tool details.
 */
const ReasoningStepItem: React.FC<{ step: ReasoningStep }> = ({ step }) => {
  const [isOpen, setIsOpen] = useState(false);
  const details = step.toolDetails;

  return (
    <li className="agent-reasoning-step">
      <div className="tw-flex tw-flex-col tw-gap-1">
        <span>{step.summary}</span>
        {details && (
          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="tw-flex tw-w-fit tw-items-center tw-gap-1 tw-text-xs tw-text-muted hover:tw-text-normal"
              >
                <ChevronRight
                  className={cn("tw-size-3 tw-transition-transform", isOpen && "tw-rotate-90")}
                />
                <span>{step.toolName ?? "Tool details"}</span>
                <span>({details.status})</span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="tw-mt-1 tw-flex tw-flex-col tw-gap-2 tw-rounded tw-border tw-border-solid tw-border-border tw-p-2 tw-bg-secondary/40">
                <div className="tw-flex tw-flex-wrap tw-gap-2 tw-text-xs tw-text-muted">
                  {details.durationMs !== undefined && <span>{details.durationMs}ms</span>}
                  {details.truncated && <span>Preview truncated</span>}
                  {details.errorMessage && <span>{details.errorMessage}</span>}
                </div>
                <div>
                  <div className="tw-mb-1 tw-text-xs tw-font-medium tw-text-muted">Args</div>
                  <pre className="tw-overflow-x-auto tw-whitespace-pre-wrap tw-text-xs">
                    {formatPreview(details.argsPreview)}
                  </pre>
                </div>
                {details.resultPreview && (
                  <div>
                    <div className="tw-mb-1 tw-text-xs tw-font-medium tw-text-muted">Result</div>
                    <pre className="tw-overflow-x-auto tw-whitespace-pre-wrap tw-text-xs">
                      {details.resultPreview}
                    </pre>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </li>
  );
};

/**
 * Displays the shared reasoning process panel for Chat and Agent responses.
 */
export const AgentReasoningBlock: React.FC<AgentReasoningBlockProps> = ({
  payload,
  isStreaming,
}) => {
  const { status, elapsedSeconds, steps } = payload;
  const [isExpanded, setIsExpanded] = useState(status === "reasoning");

  useEffect(() => {
    if (status === "reasoning") {
      setIsExpanded(true);
    } else {
      setIsExpanded(false);
    }
  }, [status]);

  const isActive = status === "reasoning";
  const canExpand = !isActive && steps.length > 0;

  return (
    <Collapsible
      open={canExpand ? isExpanded : isActive}
      onOpenChange={canExpand ? setIsExpanded : undefined}
      disabled={!canExpand}
      className="agent-reasoning-block"
    >
      <CollapsibleTrigger asChild disabled={!canExpand}>
        <div
          className={cn(
            "agent-reasoning-header",
            canExpand && "tw-cursor-pointer",
            !canExpand && "tw-cursor-default"
          )}
        >
          <span className="agent-reasoning-icon">
            {isActive || isStreaming ? (
              <CortexSpinner />
            ) : (
              <ChevronRight
                className={cn(
                  "tw-size-3 tw-text-muted tw-transition-transform",
                  isExpanded && "tw-rotate-90"
                )}
              />
            )}
          </span>
          <span className="agent-reasoning-title">{isActive ? "Reasoning" : "Thought for"}</span>
          <span className="agent-reasoning-timer">{formatTime(elapsedSeconds)}</span>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        {steps.length > 0 && (
          <ul className="agent-reasoning-steps">
            {steps.map((step, index) => (
              <ReasoningStepItem key={step.id || index} step={step} />
            ))}
          </ul>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
};

export default AgentReasoningBlock;
