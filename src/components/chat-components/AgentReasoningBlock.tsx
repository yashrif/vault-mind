/* eslint-disable tailwindcss/no-custom-classname */
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ReasoningItem,
  ReasoningPayload,
} from "@/LLMProviders/chainRunner/utils/AgentReasoningState";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import React, { MutableRefObject, useEffect, useMemo, useState } from "react";

/**
 * Props for the shared reasoning panel.
 */
export interface ReasoningPanelProps {
  payload: ReasoningPayload;
  messageId: string;
  openStateRef: MutableRefObject<Map<string, boolean>>;
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
            className={`cortex-spinner-dot cortex-spinner-dot-${dot.animIndex}`}
          />
        );
      })}
    </svg>
  );
};

/**
 * Resolve a persisted open state value.
 *
 * @param openStateRef - Shared open-state store.
 * @param key - Stable open-state key.
 * @param fallback - Default value when no state was stored yet.
 * @returns Resolved open state.
 */
function resolveOpenState(
  openStateRef: MutableRefObject<Map<string, boolean>>,
  key: string,
  fallback: boolean
): boolean {
  return openStateRef.current.get(key) ?? fallback;
}

/**
 * Persist an open state value.
 *
 * @param openStateRef - Shared open-state store.
 * @param key - Stable open-state key.
 * @param value - Next open state.
 */
function persistOpenState(
  openStateRef: MutableRefObject<Map<string, boolean>>,
  key: string,
  value: boolean
): void {
  openStateRef.current.set(key, value);
}

/**
 * Render one reasoning item row, with expandable detail when available.
 *
 * @param item - Shared reasoning item.
 * @param messageId - Stable message identifier.
 * @param openStateRef - Shared open-state store.
 * @returns Rendered reasoning item.
 */
const ReasoningItemRow: React.FC<{
  item: ReasoningItem;
  messageId: string;
  openStateRef: MutableRefObject<Map<string, boolean>>;
}> = ({ item, messageId, openStateRef }) => {
  const itemKey = `${messageId}:item:${item.id}`;
  const hasDetail = Boolean(item.detail);
  const [isExpanded, setIsExpanded] = useState<boolean>(() =>
    resolveOpenState(openStateRef, itemKey, false)
  );

  useEffect(() => {
    setIsExpanded(resolveOpenState(openStateRef, itemKey, false));
  }, [itemKey, openStateRef]);

  const handleOpenChange = (nextOpen: boolean): void => {
    setIsExpanded(nextOpen);
    persistOpenState(openStateRef, itemKey, nextOpen);
  };

  if (!hasDetail) {
    return <li className="agent-reasoning-step">{item.summary}</li>;
  }

  return (
    <li className="agent-reasoning-step tw-list-none">
      <Collapsible open={isExpanded} onOpenChange={handleOpenChange}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="tw-flex tw-w-full tw-items-start tw-gap-1.5 tw-rounded-sm tw-bg-transparent tw-p-0 tw-text-left tw-text-inherit tw-transition-colors hover:tw-bg-transparent"
          >
            <ChevronRight
              className={cn(
                "tw-mt-0.5 tw-size-3 tw-shrink-0 tw-text-muted tw-transition-transform",
                isExpanded && "tw-rotate-90"
              )}
            />
            <span>{item.summary}</span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="tw-ml-[1.125rem] tw-mt-1 tw-rounded-sm tw-border tw-border-solid tw-border-border tw-p-2 tw-text-xs tw-leading-5 tw-text-muted tw-bg-secondary/50">
            <div className="tw-m-0 tw-whitespace-pre-wrap tw-break-words tw-bg-transparent">
              {item.detail}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
};

/**
 * Shared reasoning panel for both chat transcript reasoning and agent step reasoning.
 */
export const ReasoningPanel: React.FC<ReasoningPanelProps> = ({
  payload,
  messageId,
  openStateRef,
}) => {
  const panelKey = `${messageId}:panel`;
  const isActive = payload.status === "reasoning";
  const canExpand = payload.items.length > 0 && !isActive;
  const [isExpanded, setIsExpanded] = useState<boolean>(() =>
    resolveOpenState(openStateRef, panelKey, isActive)
  );

  useEffect(() => {
    if (payload.status === "reasoning") {
      setIsExpanded(true);
      persistOpenState(openStateRef, panelKey, true);
      return;
    }

    setIsExpanded(false);
    persistOpenState(openStateRef, panelKey, false);
  }, [openStateRef, panelKey, payload.status]);

  const headerLabel = useMemo(() => {
    return isActive ? "Reasoning" : "Thought for";
  }, [isActive]);

  const handlePanelOpenChange = (nextOpen: boolean): void => {
    setIsExpanded(nextOpen);
    persistOpenState(openStateRef, panelKey, nextOpen);
  };

  return (
    <Collapsible
      open={isActive ? true : isExpanded}
      onOpenChange={canExpand ? handlePanelOpenChange : undefined}
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
          <span className="agent-reasoning-title">{headerLabel}</span>
          <span className="agent-reasoning-timer">{formatTime(payload.elapsedSeconds)}</span>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        {payload.items.length > 0 && (
          <ul className="agent-reasoning-steps">
            {payload.items.map((item) => (
              <ReasoningItemRow
                key={item.id}
                item={item}
                messageId={messageId}
                openStateRef={openStateRef}
              />
            ))}
          </ul>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
};

export const AgentReasoningBlock = ReasoningPanel;

export default ReasoningPanel;
