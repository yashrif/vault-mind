import React, { useRef, useState } from "react";
import { ChevronRight, AlertCircle } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ReasoningItem, ReasoningPayload } from "@/core/reasoning";
import { cn } from "@/lib/utils";

/**
 * Props for the ReasoningPanel component.
 * Accepts a unified ReasoningPayload that covers both chat and agent reasoning.
 */
export interface ReasoningPanelProps {
  /** The full reasoning payload (source, status, elapsed time, items). */
  payload: ReasoningPayload;
}

/**
 * Formats elapsed seconds into a human-readable string.
 *
 * @param seconds - Elapsed time in seconds
 * @returns Formatted time string (e.g., "9s" or "1m 30s")
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
 * Animated spinner using a 7-dot sigma (Σ) pattern.
 * Dots light up in sequence with gradient trail (snake effect).
 *
 * Grid positions (3x3 grid, sigma shape):
 * 0 1 2
 *   4
 * 6 7 8
 *
 * Animation sequence (traces sigma shape):
 * 2 → 1 → 0 → 4 → 6 → 7 → 8 → (all dim) → repeat
 */
const CortexSpinner: React.FC = () => {
  // Sigma pattern dots: [row, col, animation index]
  // Animation traces the sigma: top-right to top-left, down to center, then bottom-left to bottom-right
  const sigmaDots: { row: number; col: number; animIndex: number }[] = [
    { row: 0, col: 0, animIndex: 2 }, // top-left - 3rd
    { row: 0, col: 1, animIndex: 1 }, // top-center - 2nd
    { row: 0, col: 2, animIndex: 0 }, // top-right - 1st (leads)
    { row: 1, col: 1, animIndex: 3 }, // center - 4th
    { row: 2, col: 0, animIndex: 4 }, // bottom-left - 5th
    { row: 2, col: 1, animIndex: 5 }, // bottom-center - 6th
    { row: 2, col: 2, animIndex: 6 }, // bottom-right - 7th (last)
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
 * A small pulsing dot that indicates an active item state.
 */
const ActiveDot: React.FC = () => (
  <span
    aria-hidden="true"
    className="tw-inline-block tw-size-1.5 tw-animate-pulse tw-rounded-full tw-bg-interactive-accent"
  />
);

/**
 * Props for the ReasoningItemRow sub-component.
 */
interface ReasoningItemRowProps {
  item: ReasoningItem;
}

/**
 * Renders a single reasoning item with optional expandable detail.
 * Active items show a pulsing dot; error items show an error icon and error color.
 * If the item has a `detail` string, a disclosure triangle is shown to expand it.
 */
const ReasoningItemRow: React.FC<ReasoningItemRowProps> = ({ item }) => {
  const [detailOpen, setDetailOpen] = useState(false);
  const hasDetail = Boolean(item.detail);
  const isError = item.state === "error";
  const isActive = item.state === "active";

  return (
    <li className="agent-reasoning-step">
      <div className="tw-flex tw-items-start tw-gap-1.5">
        {/* State indicator */}
        <span className="tw-mt-0.5 tw-flex tw-shrink-0 tw-items-center">
          {isActive && <ActiveDot />}
          {isError && <AlertCircle aria-hidden="true" className="tw-size-3 tw-text-error" />}
          {!isActive && !isError && (
            // Invisible placeholder to keep alignment consistent
            <span className="tw-inline-block tw-w-1.5" />
          )}
        </span>

        {/* Summary + optional detail toggle */}
        <div className="tw-min-w-0 tw-flex-1">
          <div className="tw-flex tw-items-center tw-gap-1">
            {hasDetail && (
              <button
                type="button"
                onClick={() => setDetailOpen((prev) => !prev)}
                className="tw-flex tw-shrink-0 tw-items-center tw-text-muted tw-transition-colors hover:tw-text-normal"
                aria-expanded={detailOpen}
                aria-label="Toggle detail"
              >
                <ChevronRight
                  className={cn("tw-size-3 tw-transition-transform", detailOpen && "tw-rotate-90")}
                />
              </button>
            )}
            {!hasDetail && (
              // Invisible spacer so summaries without detail still line up
              <span className="tw-w-3 tw-shrink-0" />
            )}
            <span
              className={cn(
                "tw-truncate tw-text-ui-smaller tw-leading-tight",
                isError ? "tw-text-error" : "tw-text-muted"
              )}
            >
              {item.summary}
            </span>
          </div>

          {/* Expandable detail */}
          {hasDetail && detailOpen && (
            <pre
              className={cn(
                "tw-mt-1 tw-whitespace-pre-wrap tw-break-words tw-text-ui-smaller",
                "tw-max-h-40 tw-overflow-y-auto tw-font-mono tw-text-muted",
                "tw-rounded-sm tw-border tw-border-border tw-bg-secondary tw-p-1"
              )}
            >
              {item.detail}
            </pre>
          )}
        </div>
      </div>
    </li>
  );
};

/**
 * ReasoningPanel — displays reasoning from both chat (transcript) and agent (steps).
 *
 * Behavior by status:
 * - `reasoning`: Always expanded, shows CortexSpinner + elapsed time + item list.
 * - `collapsed` / `complete`: Collapsible panel. Summary row shows elapsed time
 *   and "Reasoned for Xs" label. Expanded view lists all items with their summaries.
 *   Agent step items with a `detail` field have their own per-item disclosure.
 *
 * Returns null when `payload.items` is empty.
 */
export const ReasoningPanel: React.FC<ReasoningPanelProps> = ({ payload }) => {
  const { status, elapsedSeconds, items } = payload;
  const [isExpanded, setIsExpanded] = useState(status === "reasoning");
  const prevStatusRef = useRef(status);

  // Synchronous during render (no useEffect lag):
  if (prevStatusRef.current !== status) {
    prevStatusRef.current = status;
    if (status === "reasoning") setIsExpanded(true);
    else if (status === "collapsed" || status === "complete") setIsExpanded(false);
  }

  // Nothing to show
  if (items.length === 0) {
    return null;
  }

  const isActive = status === "reasoning";
  const canExpand = !isActive;

  return (
    <Collapsible
      open={canExpand ? isExpanded : isActive}
      onOpenChange={canExpand ? setIsExpanded : undefined}
      className="agent-reasoning-block"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          disabled={!canExpand}
          className={cn("agent-reasoning-header", !canExpand && "tw-cursor-default")}
          aria-label={
            isActive
              ? "Reasoning in progress"
              : isExpanded
                ? "Collapse reasoning"
                : "Expand reasoning"
          }
        >
          {/* Spinner or expand chevron */}
          <span className="agent-reasoning-icon">
            {isActive ? (
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

          {/* Title and timer */}
          <span className="agent-reasoning-title">{isActive ? "Reasoning" : "Reasoned for"}</span>
          <span className="agent-reasoning-timer">{formatTime(elapsedSeconds)}</span>
        </button>
      </CollapsibleTrigger>

      {/* Item list — visible when expanded or actively reasoning */}
      <CollapsibleContent>
        <ul className="agent-reasoning-steps">
          {items.map((item) => (
            <ReasoningItemRow key={item.id} item={item} />
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default ReasoningPanel;
