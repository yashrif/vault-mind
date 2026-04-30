/**
 * Agent Reasoning Block State Management
 *
 * This module provides state management for the Agent Reasoning Block UI component,
 * which replaces the old tool call banner with a more informative reasoning display.
 */

export const CORTEX_REASONING_MARKER_PREFIX = "<!--CORTEX_REASONING:v1:";
const CORTEX_REASONING_MARKER_REGEX = /<!--CORTEX_REASONING:v1:([A-Za-z0-9+/=]+)-->/;
const CORTEX_REASONING_MARKER_ANY_REGEX = /<!--CORTEX_REASONING:v1:[\s\S]*?-->/g;
const MAX_ARG_STRING_LENGTH = 300;
const MAX_RESULT_PREVIEW_LENGTH = 800;
const MAX_PREVIEW_DEPTH = 3;
const MAX_PREVIEW_ENTRIES = 20;
const SENSITIVE_KEY_REGEX = /api[-_]?key|token|password|secret|authorization/i;

export type ToolDetailStatus = "running" | "success" | "error";

export interface ReasoningToolDetails {
  status: ToolDetailStatus;
  argsPreview: unknown;
  resultPreview?: string;
  durationMs?: number;
  truncated: boolean;
  errorMessage?: string;
}

/**
 * Represents a single reasoning step in the agent loop
 */
export interface ReasoningStep {
  id: string;
  timestamp: number;
  summary: string;
  toolName?: string;
  toolDetails?: ReasoningToolDetails;
}

/**
 * Status of the reasoning block
 * - idle: No agent activity
 * - reasoning: Agent is actively processing/executing tools
 * - complete: Response complete, block can be expanded
 */
export type ReasoningStatus = "idle" | "reasoning" | "complete";

export type PersistedReasoningStatus = "reasoning" | "complete";

/**
 * Full state for the Agent Reasoning Block
 */
export interface AgentReasoningState {
  status: ReasoningStatus;
  startTime: number | null;
  elapsedSeconds: number;
  steps: ReasoningStep[];
}

/**
 * Creates the initial reasoning state
 */
export function createInitialReasoningState(): AgentReasoningState {
  return {
    status: "idle",
    startTime: null,
    elapsedSeconds: 0,
    steps: [],
  };
}

export interface ReasoningPayload {
  status: PersistedReasoningStatus;
  elapsedSeconds: number;
  steps: ReasoningStep[];
}

export interface ParsedReasoningMessage {
  payload: ReasoningPayload;
  contentAfter: string;
  marker: string;
}

interface PreviewResult {
  preview: unknown;
  truncated: boolean;
}

/**
 * Encode text as base64 while preserving UTF-8 content in browsers and tests.
 */
function encodeBase64Utf8(text: string): string {
  const globalObject = globalThis as typeof globalThis & {
    Buffer?: { from(input: string, encoding: string): { toString(encoding: string): string } };
  };

  if (globalObject.Buffer) {
    return globalObject.Buffer.from(text, "utf8").toString("base64");
  }

  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

/**
 * Decode base64 into UTF-8 text while preserving browser compatibility.
 */
function decodeBase64Utf8(encoded: string): string {
  const globalObject = globalThis as typeof globalThis & {
    Buffer?: { from(input: string, encoding: string): { toString(encoding: string): string } };
  };

  if (globalObject.Buffer) {
    return globalObject.Buffer.from(encoded, "base64").toString("utf8");
  }

  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Return true when a value is a plain object record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate persisted tool details before rendering.
 */
function isReasoningToolDetails(value: unknown): value is ReasoningToolDetails {
  if (!isRecord(value)) return false;
  if (!("argsPreview" in value)) return false;
  if (value.resultPreview !== undefined && typeof value.resultPreview !== "string") return false;
  if (value.durationMs !== undefined && typeof value.durationMs !== "number") return false;
  if (value.errorMessage !== undefined && typeof value.errorMessage !== "string") return false;
  return (
    (value.status === "running" || value.status === "success" || value.status === "error") &&
    typeof value.truncated === "boolean"
  );
}

/**
 * Validate a single persisted reasoning step.
 */
function isReasoningStep(value: unknown): value is ReasoningStep {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string") return false;
  if (typeof value.timestamp !== "number" || !Number.isFinite(value.timestamp)) return false;
  if (typeof value.summary !== "string") return false;
  if (value.toolName !== undefined && typeof value.toolName !== "string") return false;
  if (value.toolDetails !== undefined && !isReasoningToolDetails(value.toolDetails)) return false;
  return true;
}

/**
 * Validate a parsed reasoning payload before returning it to UI code.
 */
function isReasoningPayload(value: unknown): value is ReasoningPayload {
  if (!isRecord(value)) return false;
  if (value.status !== "reasoning" && value.status !== "complete") return false;
  if (typeof value.elapsedSeconds !== "number" || !Number.isFinite(value.elapsedSeconds))
    return false;
  if (!Array.isArray(value.steps)) return false;
  return value.steps.every(isReasoningStep);
}

/**
 * Serialize a reasoning payload into a safe HTML comment marker.
 */
export function serializeReasoningPayload(payload: ReasoningPayload): string {
  const json = JSON.stringify(payload);
  return `${CORTEX_REASONING_MARKER_PREFIX}${encodeBase64Utf8(json)}-->`;
}

/**
 * Parse a CORTEX_REASONING marker from a message.
 */
export function parseReasoningMessage(content: string): ParsedReasoningMessage | null {
  const match = content.match(CORTEX_REASONING_MARKER_REGEX);
  if (!match) return null;

  const [marker, encoded] = match;
  try {
    const payload = JSON.parse(decodeBase64Utf8(encoded));
    if (!isReasoningPayload(payload)) {
      return null;
    }

    return {
      payload,
      contentAfter: content.replace(marker, "").trim(),
      marker,
    };
  } catch {
    return null;
  }
}

/**
 * Remove persisted reasoning markers from text before reuse outside local display.
 */
export function stripReasoningMarker(content: string): string {
  return content.replace(CORTEX_REASONING_MARKER_ANY_REGEX, "").trim();
}

/**
 * Sanitize arbitrary tool args/results into bounded JSON-safe preview values.
 */
function sanitizePreviewValue(value: unknown, depth: number = 0): PreviewResult {
  if (typeof value === "string") {
    if (value.length > MAX_ARG_STRING_LENGTH) {
      return { preview: value.slice(0, MAX_ARG_STRING_LENGTH) + "...", truncated: true };
    }
    return { preview: value, truncated: false };
  }

  if (typeof value !== "object" || value === null) {
    return { preview: value, truncated: false };
  }

  if (depth >= MAX_PREVIEW_DEPTH) {
    return { preview: "[Max depth reached]", truncated: true };
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_PREVIEW_ENTRIES)
      .map((item) => sanitizePreviewValue(item, depth + 1));
    const truncated = items.some((item) => item.truncated) || value.length > MAX_PREVIEW_ENTRIES;
    const preview = items.map((item) => item.preview);
    if (value.length > MAX_PREVIEW_ENTRIES) {
      preview.push(`... ${value.length - MAX_PREVIEW_ENTRIES} more items`);
    }
    return { preview, truncated };
  }

  const entries = Object.entries(value).slice(0, MAX_PREVIEW_ENTRIES);
  let truncated = Object.keys(value).length > MAX_PREVIEW_ENTRIES;
  const preview: Record<string, unknown> = {};

  for (const [key, nestedValue] of entries) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      preview[key] = "[redacted]";
      continue;
    }
    const sanitized = sanitizePreviewValue(nestedValue, depth + 1);
    preview[key] = sanitized.preview;
    truncated = truncated || sanitized.truncated;
  }

  if (Object.keys(value).length > MAX_PREVIEW_ENTRIES) {
    preview.__truncated = `${Object.keys(value).length - MAX_PREVIEW_ENTRIES} more entries`;
  }

  return { preview, truncated };
}

/**
 * Build safe persisted details for a tool call/result pair.
 */
export function buildToolDetailPreview(params: {
  args?: Record<string, unknown>;
  result?: string;
  success?: boolean;
  durationMs?: number;
}): ReasoningToolDetails {
  const argsPreview = sanitizePreviewValue(params.args ?? {});
  const resultText = params.result ?? "";
  const resultTruncated = resultText.length > MAX_RESULT_PREVIEW_LENGTH;
  const resultPreview = resultText
    ? resultText.slice(0, MAX_RESULT_PREVIEW_LENGTH) + (resultTruncated ? "..." : "")
    : undefined;
  const status: ToolDetailStatus =
    params.success === undefined ? "running" : params.success ? "success" : "error";

  return {
    status,
    argsPreview: argsPreview.preview,
    resultPreview: status !== "error" ? resultPreview : undefined,
    durationMs: params.durationMs,
    truncated: argsPreview.truncated || resultTruncated,
    errorMessage: status === "error" ? resultPreview : undefined,
  };
}

/**
 * Generate a summary for when a tool is being called.
 *
 * @param toolName - Name of the tool being called
 * @param args - Arguments being passed to the tool
 * @returns Human-readable summary string
 */
export function summarizeToolCall(toolName: string, args?: Record<string, unknown>): string {
  switch (toolName) {
    case "localSearch": {
      const query = args?.query as string | undefined;
      if (query) {
        const truncatedQuery = query.length > 50 ? query.slice(0, 50) + "..." : query;
        return `Searching notes for "${truncatedQuery}"`;
      }
      return "Searching notes";
    }
    case "webSearch": {
      const query = args?.query as string | undefined;
      if (query) {
        const truncatedQuery = query.length > 30 ? query.slice(0, 30) + "..." : query;
        return `Searching web for "${truncatedQuery}"`;
      }
      return "Searching the web";
    }
    case "getTimeRangeMs":
      return "Calculating time range";
    case "readFile": {
      const path = args?.path as string | undefined;
      if (path) {
        const fileName = path.split("/").pop() || path;
        return `Reading "${fileName}"`;
      }
      return "Reading file";
    }
    case "readNote": {
      const notePath = args?.notePath as string | undefined;
      if (notePath) {
        // Extract note title from path (remove .md extension and get last segment)
        const noteTitle = notePath.split("/").pop()?.replace(/\.md$/i, "") || notePath;
        return `Reading "${noteTitle}"`;
      }
      return "Reading note";
    }
    case "createNote":
      return "Creating new note";
    case "appendToNote":
      return "Appending to note";
    case "editNote":
      return "Editing note";
    case "deleteNote":
      return "Deleting note";
    case "youtubeTranscript":
    case "youtubeTranscription":
      return "Fetching video transcript";
    case "fetchUrl":
      return "Fetching URL content";
    case "getFileTree":
      return "Browsing vault file tree";
    case "getTagList":
      return "Loading vault tags";
    case "getCurrentTime":
      return "Getting current time";
    case "getTimeInfoByEpoch":
      return "Converting timestamp";
    case "convertTimeBetweenTimezones":
      return "Converting timezone";
    case "obsidianDailyNote": {
      const command = args?.command as string | undefined;
      const vault = args?.vault as string | undefined;
      const vaultSuffix = vault && vault.trim().length > 0 ? ` from "${vault}"` : "";
      if (command === "daily:path") return `Getting daily note path${vaultSuffix}`;
      return `Reading today's daily note${vaultSuffix}`;
    }
    case "obsidianRandomRead": {
      const vault = args?.vault as string | undefined;
      if (vault && vault.trim().length > 0) {
        return `Reading a random note from "${vault}"`;
      }
      return "Reading a random note";
    }
    case "obsidianProperties": {
      const command = args?.command as string | undefined;
      if (command === "property:read") {
        const name = args?.name as string | undefined;
        return name ? `Reading property "${name}"` : "Reading property";
      }
      return "Listing vault properties";
    }
    case "obsidianTasks":
      return "Listing vault tasks";
    case "obsidianLinks": {
      const command = args?.command as string | undefined;
      if (command === "backlinks") return "Listing backlinks";
      if (command === "links") return "Listing outgoing links";
      if (command === "orphans") return "Listing orphaned notes";
      if (command === "unresolved") return "Listing unresolved links";
      return "Querying link graph";
    }
    case "obsidianTemplates": {
      const command = args?.command as string | undefined;
      if (command === "template:read") {
        const name = args?.name as string | undefined;
        return name ? `Reading template "${name}"` : "Reading template";
      }
      return "Listing templates";
    }
    case "obsidianBases": {
      const command = args?.command as string | undefined;
      if (command === "base:views") return "Listing base views";
      if (command === "base:query") return "Querying base data";
      return "Listing bases";
    }
    case "indexVault":
      return "Indexing vault";
    case "updateMemory":
      return "Saving to memory";
    case "writeFile": {
      const filePath = args?.path as string | undefined;
      if (filePath) {
        const fileName = filePath.split("/").pop() || filePath;
        return `Writing to "${fileName}"`;
      }
      return "Writing to file";
    }
    case "editFile": {
      const filePath = args?.path as string | undefined;
      if (filePath) {
        const fileName = filePath.split("/").pop() || filePath;
        return `Editing "${fileName}"`;
      }
      return "Editing file";
    }
    default:
      return "Processing";
  }
}

/**
 * Truncate text to a maximum length, adding ellipsis if needed.
 */
function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen - 3) + "..." : text;
}

/**
 * Extract the first sentence from model's intermediate reasoning content.
 * Used to show what the model found/concluded from previous tool calls.
 *
 * Uses a simple approach: take first line, truncate if needed.
 * This avoids edge cases with abbreviations (Dr., U.S.) that confuse regex-based
 * sentence detection.
 *
 * @param content - Model's intermediate content (may contain reasoning about findings)
 * @returns First line/sentence if found, null otherwise
 */
export function extractFirstSentence(content: string): string | null {
  if (!content || content.trim().length === 0) {
    return null;
  }

  const firstLine = content.trim().split("\n")[0];
  return truncate(firstLine, 100);
}
