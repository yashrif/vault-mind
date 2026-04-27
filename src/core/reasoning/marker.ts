import type { ParsedReasoning, ReasoningPayload } from "./types";

const MARKER_PREFIX = "<!--CORTEX_REASONING:v1:";
const MARKER_SUFFIX = "-->";
const ESCAPED_CLOSE = "--\\>"; // how --> is stored inside the JSON

/**
 * Serializes a ReasoningPayload into an HTML comment marker.
 * The --> sequence in JSON values is escaped to --\> to prevent early comment close.
 */
export function serializeReasoningPayload(payload: ReasoningPayload): string {
  const json = JSON.stringify(payload).replace(/-->/g, ESCAPED_CLOSE);
  return `${MARKER_PREFIX}${json}${MARKER_SUFFIX}`;
}

/**
 * Parses a CORTEX_REASONING marker from a message string.
 * Returns null if no valid marker is found or if the JSON is malformed.
 * On failure, the original content is left intact.
 */
export function parseReasoningPayload(content: string): ParsedReasoning | null {
  const prefixIdx = content.indexOf(MARKER_PREFIX);
  if (prefixIdx === -1) return null;
  const jsonStart = prefixIdx + MARKER_PREFIX.length;
  const suffixIdx = content.indexOf(MARKER_SUFFIX, jsonStart);
  if (suffixIdx === -1) return null;
  const rawJson = content.slice(jsonStart, suffixIdx).replace(/--\\>/g, "-->");
  try {
    const payload = JSON.parse(rawJson) as ReasoningPayload;
    if (payload.version !== 1) return null;
    const contentAfter = content.slice(suffixIdx + MARKER_SUFFIX.length).trimStart();
    return { payload, contentAfter };
  } catch {
    return null;
  }
}

/**
 * Strips CORTEX_REASONING markers from a message before it enters LLM context.
 * Also strips legacy <think>…</think> tags as a safety net.
 * Does NOT affect display text or persisted markdown.
 */
export function stripReasoningForLLMContext(message: string): string {
  // Strip new marker (non-greedy to handle multiple markers)
  let result = message.replace(/<!--CORTEX_REASONING:v1:[\s\S]*?-->/g, "");
  // Safety strip for legacy <think> tags from old messages
  result = result.replace(/<think>[\s\S]*?<\/think>/g, "");
  return result.trim();
}
