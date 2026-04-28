/**
 * Shared reasoning payload helpers for chat and agent responses.
 */

import { compactAssistantOutput } from "@/context/ChatHistoryCompactor";

const REASONING_MARKER_PREFIX = "<!--CORTEX_REASONING:v1:";
const MAX_REASONING_DETAIL_LENGTH = 400;
const CHAT_REASONING_TRANSCRIPT_ID = "transcript";
const CHAT_REASONING_TRANSCRIPT_SUMMARY = "Reasoning transcript";

/**
 * Shared reasoning lifecycle states exposed in persisted reasoning payloads.
 */
export type ReasoningLifecycleStatus = "reasoning" | "collapsed" | "complete";

/**
 * State value used by the legacy internal agent timer state.
 */
export type ReasoningStatus = "idle" | ReasoningLifecycleStatus;

/**
 * Shared reasoning item persisted in assistant display text.
 */
export interface ReasoningItem {
  id: string;
  kind: "transcript" | "step";
  summary: string;
  detail?: string;
  toolName?: string;
  state?: "active" | "done" | "error";
}

/**
 * Shared reasoning payload persisted in assistant display text.
 */
export interface ReasoningPayload {
  source: "chat" | "agent";
  status: ReasoningLifecycleStatus;
  elapsedSeconds: number;
  items: ReasoningItem[];
}

/**
 * Represents a single reasoning step in the agent loop
 */
export interface ReasoningStep {
  timestamp: number;
  summary: string;
  toolName?: string;
}

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

/**
 * Parsed reasoning data from a shared persisted marker.
 */
export interface ParsedReasoningMessage {
  payload: ReasoningPayload;
  contentAfter: string;
}

/**
 * Escape raw closing comment sequences so the reasoning marker remains valid HTML comment syntax.
 *
 * @param serializedJson - Raw JSON payload string.
 * @returns JSON with comment-closing sequences escaped.
 */
function escapeReasoningJson(serializedJson: string): string {
  return serializedJson.replace(/-->/g, "--\\>");
}

/**
 * Restore escaped closing comment sequences prior to JSON parsing.
 *
 * @param serializedJson - Escaped JSON payload string.
 * @returns JSON with original comment-closing sequences restored.
 */
function unescapeReasoningJson(serializedJson: string): string {
  return serializedJson.replace(/--\\>/g, "-->");
}

/**
 * Serialize a shared reasoning payload into the persisted comment marker.
 *
 * @param payload - Shared reasoning payload.
 * @returns Persisted reasoning marker.
 */
export function serializeReasoningPayload(payload: ReasoningPayload): string {
  const serializedJson = escapeReasoningJson(JSON.stringify(payload));
  return `${REASONING_MARKER_PREFIX}${serializedJson}-->`;
}

/**
 * Build a chat reasoning payload from a transcript and lifecycle status.
 *
 * @param detail - Transcript content to surface in the shared reasoning panel.
 * @param elapsedSeconds - Whole seconds spent reasoning so far.
 * @param status - Lifecycle status for the reasoning panel.
 * @returns Shared reasoning payload for chat-mode responses.
 */
export function createChatReasoningPayload(
  detail: string,
  elapsedSeconds: number,
  status: Extract<ReasoningLifecycleStatus, "reasoning" | "complete">
): ReasoningPayload {
  return {
    source: "chat",
    status,
    elapsedSeconds,
    items: [
      {
        id: CHAT_REASONING_TRANSCRIPT_ID,
        kind: "transcript",
        summary: CHAT_REASONING_TRANSCRIPT_SUMMARY,
        detail,
        state: status === "reasoning" ? "active" : "done",
      },
    ],
  };
}

/**
 * Compose assistant display text from a persisted reasoning payload and visible answer text.
 *
 * @param payload - Shared reasoning payload.
 * @param visibleText - Visible assistant answer text.
 * @returns Combined display text.
 */
export function composeReasoningMessage(payload: ReasoningPayload, visibleText: string): string {
  const marker = serializeReasoningPayload(payload);
  if (!visibleText) {
    return marker;
  }

  return `${marker}\n\n${visibleText}`;
}

/**
 * Parse a shared reasoning marker from assistant display text.
 *
 * @param content - Assistant display text.
 * @returns Parsed reasoning payload and visible answer text.
 */
export function parseReasoningMessage(content: string): ParsedReasoningMessage | null {
  const markerStart = content.indexOf(REASONING_MARKER_PREFIX);
  if (markerStart === -1) {
    return null;
  }

  const markerContentStart = markerStart + REASONING_MARKER_PREFIX.length;
  const markerEnd = content.indexOf("-->", markerContentStart);
  if (markerEnd === -1) {
    return null;
  }

  const escapedJson = content.slice(markerContentStart, markerEnd);
  const rawJson = unescapeReasoningJson(escapedJson);

  try {
    const payload = JSON.parse(rawJson) as ReasoningPayload;
    return {
      payload,
      contentAfter: content.slice(markerEnd + 3).trim(),
    };
  } catch {
    return null;
  }
}

/**
 * Strip shared reasoning metadata and stray raw think tags from assistant output before memory use.
 *
 * @param content - Raw assistant output string.
 * @returns Clean assistant answer suitable for memory/history.
 */
export function stripReasoningForLLMContext(content: string): string {
  let stripped = content;
  const parsed = parseReasoningMessage(stripped);
  if (parsed) {
    stripped = parsed.contentAfter;
  }

  stripped = stripped.replace(/<think>[\s\S]*?<\/think>/g, "");
  stripped = stripped.replace(/<think>[\s\S]*$/g, "");
  stripped = stripped.replace(/<\/think>/g, "");
  stripped = stripped.replace(/\n{3,}/g, "\n\n").trim();

  return stripped;
}

/**
 * Prepare assistant output for memory by stripping reasoning metadata before compaction.
 *
 * @param output - Raw assistant output.
 * @returns Compacted assistant output safe for LLM memory.
 */
export function prepareAssistantOutputForMemory(output: string | any[]): string | any[] {
  if (Array.isArray(output)) {
    return compactAssistantOutput(
      output.map((item) => {
        if (item?.type === "text" && typeof item.text === "string") {
          return { ...item, text: stripReasoningForLLMContext(item.text) };
        }
        return item;
      })
    );
  }

  return compactAssistantOutput(stripReasoningForLLMContext(output));
}

/**
 * Clip persisted reasoning detail to a bounded size.
 *
 * @param detail - Candidate detail string.
 * @returns Bounded detail string or undefined when empty.
 */
export function sanitizeReasoningDetail(detail?: string): string | undefined {
  if (!detail) {
    return undefined;
  }

  const normalizedDetail = detail.replace(/\r\n?/g, "\n").trim();
  if (!normalizedDetail) {
    return undefined;
  }

  return normalizedDetail.length > MAX_REASONING_DETAIL_LENGTH
    ? `${normalizedDetail.slice(0, MAX_REASONING_DETAIL_LENGTH - 1).trimEnd()}…`
    : normalizedDetail;
}

/**
 * Convert arbitrary tool data into a short reasoning-safe preview string.
 *
 * @param value - Arbitrary tool value.
 * @returns Normalized preview text or undefined when not useful.
 */
export function summarizeReasoningValue(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    return sanitizeReasoningDetail(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return sanitizeReasoningDetail(String(value));
  }

  try {
    return sanitizeReasoningDetail(JSON.stringify(value, null, 2));
  } catch {
    return sanitizeReasoningDetail(String(value));
  }
}

/**
 * Query expansion info for localSearch.
 * Contains both the individual expansion components and a combined list of all recall terms.
 */
export interface QueryExpansionInfo {
  originalQuery: string;
  salientTerms: string[]; // Terms from original query (used for ranking)
  expandedQueries: string[]; // Alternative phrasings (used for recall)
  recallTerms: string[]; // All terms combined that were used for recall
}

/**
 * Source info for localSearch results
 */
export interface LocalSearchSourceInfo {
  titles: string[];
  count: number;
  queryExpansion?: QueryExpansionInfo;
}

/**
 * Generate a human-readable summary for a tool result.
 *
 * @param toolName - Name of the tool that was executed
 * @param result - Result from the tool execution
 * @param sourceInfo - Optional source info for localSearch results
 * @param args - Optional original tool call arguments for context
 * @returns Human-readable summary string
 */
export function summarizeToolResult(
  toolName: string,
  result: { success: boolean; result?: string },
  sourceInfo?: LocalSearchSourceInfo,
  args?: Record<string, unknown>
): string {
  if (!result.success) {
    // Reuse the human-friendly call summary (e.g., "Searching notes") → "Searching notes failed"
    return `${summarizeToolCall(toolName, args)} failed`;
  }

  switch (toolName) {
    case "localSearch": {
      if (sourceInfo && sourceInfo.count > 0) {
        // Show just the count and first few note titles (terms are shown in tool call summary)
        const titleList = sourceInfo.titles.slice(0, 3);
        const remaining = sourceInfo.count - titleList.length;
        let result = `Found ${sourceInfo.count} note${sourceInfo.count !== 1 ? "s" : ""}: ${titleList.join(", ")}`;
        if (remaining > 0) {
          result += ` +${remaining} more`;
        }
        return result;
      }
      return "No matching notes found";
    }
    case "webSearch":
      return "Retrieved web search results";
    case "getTimeRangeMs":
      return "Calculated time range";
    case "readFile":
      return "Read file content";
    case "readNote": {
      const notePath = args?.notePath as string | undefined;
      if (notePath) {
        const noteTitle = notePath.split("/").pop()?.replace(/\.md$/i, "") || notePath;
        return `Read "${noteTitle}"`;
      }
      return "Read note content";
    }
    case "createNote":
      return "Created new note";
    case "appendToNote":
      return "Appended to note";
    case "editNote":
      return "Edited note";
    case "deleteNote":
      return "Deleted note";
    case "youtubeTranscript":
    case "youtubeTranscription":
      return "Fetched video transcript";
    case "fetchUrl":
      return "Fetched URL content";
    case "getFileTree":
      return "Retrieved vault file tree";
    case "getTagList":
      return "Retrieved vault tags";
    case "getCurrentTime":
      return "Got current time";
    case "getTimeInfoByEpoch":
      return "Converted timestamp";
    case "convertTimeBetweenTimezones":
      return "Converted timezone";
    case "obsidianDailyNote": {
      const command = args?.command as string | undefined;
      const vault = args?.vault as string | undefined;
      const vaultSuffix = vault && vault.trim().length > 0 ? ` from "${vault}"` : "";
      if (command === "daily:path") return `Got daily note path${vaultSuffix}`;
      return `Loaded today's daily note${vaultSuffix}`;
    }
    case "obsidianRandomRead": {
      const vault = args?.vault as string | undefined;
      if (vault && vault.trim().length > 0) {
        return `Loaded a random note from "${vault}"`;
      }
      return "Loaded a random note";
    }
    case "obsidianProperties": {
      const command = args?.command as string | undefined;
      if (command === "property:read") {
        const name = args?.name as string | undefined;
        return name ? `Read property "${name}"` : "Read property";
      }
      return "Listed vault properties";
    }
    case "obsidianTasks":
      return "Listed vault tasks";
    case "obsidianLinks": {
      const command = args?.command as string | undefined;
      if (command === "backlinks") return "Listed backlinks";
      if (command === "links") return "Listed outgoing links";
      if (command === "orphans") return "Listed orphaned notes";
      if (command === "unresolved") return "Listed unresolved links";
      return "Queried link graph";
    }
    case "obsidianTemplates": {
      const command = args?.command as string | undefined;
      if (command === "template:read") {
        const name = args?.name as string | undefined;
        return name ? `Read template "${name}"` : "Read template";
      }
      return "Listed templates";
    }
    case "obsidianBases": {
      const command = args?.command as string | undefined;
      if (command === "base:views") return "Listed base views";
      if (command === "base:query") return "Queried base data";
      return "Listed bases";
    }
    case "indexVault":
      return "Indexed vault";
    case "updateMemory":
      return "Updated memory";
    case "writeFile":
    case "editFile": {
      // Parse the result to check if accepted/rejected
      const filePath = args?.path as string | undefined;
      const fileName = filePath ? filePath.split("/").pop() || filePath : "file";

      // Result is JSON string, check for rejected/accepted status
      const resultStr = result.result || "";
      if (resultStr.includes('"rejected"') || resultStr.includes("rejected")) {
        return `Edit rejected for "${fileName}"`;
      }
      if (resultStr.includes('"failed"') || resultStr.includes("Error")) {
        return `Edit failed for "${fileName}"`;
      }
      // TODO(@wenzhengjiang): Handle no-op cases (e.g., "File is too small", "Search text not found")
      // Requires ComposerTools to return structured results instead of plain strings.
      // See docs/TODO-composer-tool-redesign.md
      return toolName === "writeFile" ? `Wrote to "${fileName}"` : `Edited "${fileName}"`;
    }
    default:
      return "Done";
  }
}

// TODO: The `expansion` parameter and QueryExpansionInfo interface are now dead code --
// the agent runner no longer pre-expands queries. Clean up the expansion branch below
// and the _preExpandedQuery schema field in SearchTools.ts.
/**
 * Generate a summary for when a tool is being called.
 *
 * @param toolName - Name of the tool being called
 * @param args - Arguments being passed to the tool
 * @param expansion - Optional pre-expanded query data for localSearch
 * @returns Human-readable summary string
 */
export function summarizeToolCall(
  toolName: string,
  args?: Record<string, unknown>,
  expansion?: QueryExpansionInfo
): string {
  switch (toolName) {
    case "localSearch": {
      // If we have pre-expanded terms, show all recall terms
      if (expansion && expansion.recallTerms && expansion.recallTerms.length > 0) {
        // Filter to valid strings only, excluding "[object Object]" artifacts
        const validTerms = expansion.recallTerms.filter(
          (t): t is string =>
            typeof t === "string" &&
            t.trim().length > 0 &&
            !t.includes("[object ") &&
            t !== "[object Object]"
        );
        if (validTerms.length > 0) {
          const terms = validTerms
            .slice(0, 6)
            .map((t) => `"${t}"`)
            .join(", ");
          const moreCount = validTerms.length - 6;
          const termsSuffix = moreCount > 0 ? ` +${moreCount} more` : "";
          return `Searching notes for ${terms}${termsSuffix}`;
        }
      }
      // Fallback to query if no expansion available
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
