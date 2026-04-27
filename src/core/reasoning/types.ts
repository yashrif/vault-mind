/** The source of a reasoning session — either the chat interface or the agent. */
export type ReasoningSource = "chat" | "agent";

/** Lifecycle status of a reasoning block displayed in the UI. */
export type ReasoningStatus = "reasoning" | "collapsed" | "complete";

/** Discriminates between a single reasoning step and a full transcript entry. */
export type ReasoningItemKind = "step" | "transcript";

/** Current state of an individual reasoning item. */
export type ReasoningItemState = "active" | "done" | "error";

/**
 * A single item within a reasoning payload, representing either
 * an agent step or a transcript entry.
 */
export interface ReasoningItem {
  /** Stable id for React keys — use timestamp-string or index-based string */
  id: string;
  kind: ReasoningItemKind;
  /** Always-visible one-line label */
  summary: string;
  /** Optional expanded detail, capped at 400 chars for steps, 12000 for transcript */
  detail?: string;
  /** Only set for step items with a specific tool involved */
  toolName?: string;
  state: ReasoningItemState;
}

/**
 * The full reasoning payload serialized into a CORTEX_REASONING marker.
 * Embeds source, status, elapsed time, and all reasoning items.
 */
export interface ReasoningPayload {
  version: 1;
  source: ReasoningSource;
  /** chat: reasoning→complete only. agent: reasoning→collapsed→complete */
  status: ReasoningStatus;
  elapsedSeconds: number;
  items: ReasoningItem[];
}

/** Result of parsing a CORTEX_REASONING marker out of a message string */
export interface ParsedReasoning {
  payload: ReasoningPayload;
  /** The message text that follows the marker, with leading whitespace trimmed */
  contentAfter: string;
}
