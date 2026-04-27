/**
 * Cross-cutting integration tests for the shared reasoning surface.
 *
 * These tests verify that all the pieces (marker serialization/parsing,
 * LLM-context stripping, and clipboard cleaning) work together correctly.
 * They test contracts between components, not individual unit behaviour.
 */

import {
  serializeReasoningPayload,
  parseReasoningPayload,
  stripReasoningForLLMContext,
} from "@/core/reasoning";
import { cleanMessageForCopy } from "../../utils";
import type { ReasoningPayload } from "@/core/reasoning";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

/** Minimal valid chat payload (one transcript item). */
const chatPayload: ReasoningPayload = {
  version: 1,
  source: "chat",
  status: "complete",
  elapsedSeconds: 3.2,
  items: [
    {
      id: "t-1",
      kind: "transcript",
      summary: "Thinking about the answer",
      detail: "The user asked about X, so I considered Y and Z.",
      state: "done",
    },
  ],
};

/** Agent payload with multiple step items. */
const agentPayload: ReasoningPayload = {
  version: 1,
  source: "agent",
  status: "complete",
  elapsedSeconds: 12,
  items: [
    {
      id: "step-0",
      kind: "step",
      summary: "Search the vault",
      detail: "Calling search tool with query 'typescript generics'",
      toolName: "localSearch",
      state: "done",
    },
    {
      id: "step-1",
      kind: "step",
      summary: "Synthesise results",
      detail: "Combining 3 results into a coherent answer.",
      state: "done",
    },
  ],
};

// ---------------------------------------------------------------------------
// Group 1: Context sanitization chain
// ---------------------------------------------------------------------------

describe("Group 1: Context sanitization chain", () => {
  it("1. stripReasoningForLLMContext removes a marker that serializeReasoningPayload produced — round-trip to clean string", () => {
    const marker = serializeReasoningPayload(chatPayload);
    const visibleText = "Here is the actual answer.";
    const fullMessage = `${marker}\n${visibleText}`;

    const result = stripReasoningForLLMContext(fullMessage);

    expect(result).toBe(visibleText);
    expect(result).not.toContain("CORTEX_REASONING");
  });

  it("2. stripReasoningForLLMContext + cleanMessageForCopy both agree on visible text — no marker at either boundary", () => {
    const marker = serializeReasoningPayload(chatPayload);
    const visibleText = "Both boundaries should agree on this text.";
    const fullMessage = `${marker}\n${visibleText}`;

    const llmResult = stripReasoningForLLMContext(fullMessage);
    const clipboardResult = cleanMessageForCopy(fullMessage);

    // Both produce the same visible text
    expect(llmResult).toBe(visibleText);
    expect(clipboardResult).toBe(visibleText);

    // Neither retains the marker
    expect(llmResult).not.toContain("CORTEX_REASONING");
    expect(clipboardResult).not.toContain("CORTEX_REASONING");
  });

  it("3. A message with ONLY a marker (no visible text) produces an empty string after stripping", () => {
    const marker = serializeReasoningPayload(chatPayload);

    expect(stripReasoningForLLMContext(marker)).toBe("");
    expect(cleanMessageForCopy(marker)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Group 2: Persistence round-trip
// ---------------------------------------------------------------------------

describe("Group 2: Persistence round-trip", () => {
  it("4. Serialize payload → embed in message → cleanMessageForCopy strips it → result is just the visible text", () => {
    const marker = serializeReasoningPayload(chatPayload);
    const visibleText = "The actual response to the user.";
    const storedMessage = `${marker}\n${visibleText}`;

    const cleaned = cleanMessageForCopy(storedMessage);

    expect(cleaned).toBe(visibleText);
    expect(cleaned).not.toContain("CORTEX_REASONING");
  });

  it("5. Parse a marker → parseReasoningPayload returns payload + contentAfter → re-serialize → output matches original marker", () => {
    const originalMarker = serializeReasoningPayload(chatPayload);
    const message = `${originalMarker}\nSome text after.`;

    const parsed = parseReasoningPayload(message);

    expect(parsed).not.toBeNull();
    expect(parsed!.contentAfter).toBe("Some text after.");

    // Re-serializing the parsed payload produces the same marker
    const reserialized = serializeReasoningPayload(parsed!.payload);
    expect(reserialized).toBe(originalMarker);
  });
});

// ---------------------------------------------------------------------------
// Group 3: Legacy compatibility
// ---------------------------------------------------------------------------

describe("Group 3: Legacy compatibility", () => {
  const legacyMarker = '<!--AGENT_REASONING:complete:10:["step1","step2"]-->';

  it("6a. parseReasoningPayload returns null for old AGENT_REASONING format (does not parse legacy format)", () => {
    const message = `${legacyMarker}Here is the response.`;
    expect(parseReasoningPayload(message)).toBeNull();
  });

  it("6b. stripReasoningForLLMContext does NOT strip the old AGENT_REASONING format", () => {
    const message = `${legacyMarker}Here is the response.`;
    // The new LLM stripper only knows about CORTEX_REASONING:v1 and <think> — legacy markers pass through
    const result = stripReasoningForLLMContext(message);
    expect(result).toContain("AGENT_REASONING");
  });

  it("6c. cleanMessageForCopy DOES strip the old AGENT_REASONING format (has the legacy regex)", () => {
    const message = `${legacyMarker}Here is the response.`;
    const result = cleanMessageForCopy(message);
    expect(result).not.toContain("AGENT_REASONING");
    expect(result).toBe("Here is the response.");
  });

  it("7. A <think>…</think> tag: stripReasoningForLLMContext removes it; parseReasoningPayload returns null", () => {
    const message = "<think>internal chain-of-thought</think>Final answer here.";

    // The LLM stripper removes think tags
    const stripped = stripReasoningForLLMContext(message);
    expect(stripped).toBe("Final answer here.");
    expect(stripped).not.toContain("<think>");

    // The parser doesn't recognise think tags as a CORTEX_REASONING marker
    expect(parseReasoningPayload(message)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Group 4: Chat and agent payload interoperability
// ---------------------------------------------------------------------------

describe("Group 4: Chat and agent payload interoperability", () => {
  it("8a. A chat payload (source: 'chat', one transcript item) serializes and parses correctly", () => {
    const marker = serializeReasoningPayload(chatPayload);
    const parsed = parseReasoningPayload(marker);

    expect(parsed).not.toBeNull();
    expect(parsed!.payload.source).toBe("chat");
    expect(parsed!.payload.items).toHaveLength(1);
    expect(parsed!.payload.items[0].kind).toBe("transcript");
    expect(parsed!.payload).toEqual(chatPayload);
  });

  it("8b. An agent payload (source: 'agent', multiple step items) serializes and parses correctly", () => {
    const marker = serializeReasoningPayload(agentPayload);
    const parsed = parseReasoningPayload(marker);

    expect(parsed).not.toBeNull();
    expect(parsed!.payload.source).toBe("agent");
    expect(parsed!.payload.items).toHaveLength(2);
    expect(parsed!.payload.items[0].kind).toBe("step");
    expect(parsed!.payload.items[1].kind).toBe("step");
    expect(parsed!.payload).toEqual(agentPayload);
  });

  it("9. A payload with --> in a step detail survives serialize → parse unchanged (escape/unescape round-trip)", () => {
    const payloadWithArrow: ReasoningPayload = {
      version: 1,
      source: "agent",
      status: "complete",
      elapsedSeconds: 5,
      items: [
        {
          id: "arrow-step",
          kind: "step",
          summary: "Step with --> in summary -->",
          detail: "Detail containing --> an HTML comment close sequence",
          state: "done",
        },
      ],
    };

    const marker = serializeReasoningPayload(payloadWithArrow);

    // The raw marker must not contain a premature --> inside the JSON body
    const prefix = "<!--CORTEX_REASONING:v1:";
    const jsonStart = prefix.length;
    const jsonBody = marker.slice(jsonStart, marker.lastIndexOf("-->"));
    expect(jsonBody).not.toContain("-->");
    expect(jsonBody).toContain("--\\>");

    // And the full round-trip restores the original values
    const parsed = parseReasoningPayload(marker);
    expect(parsed).not.toBeNull();
    expect(parsed!.payload.items[0].summary).toBe("Step with --> in summary -->");
    expect(parsed!.payload.items[0].detail).toBe(
      "Detail containing --> an HTML comment close sequence"
    );
    expect(parsed!.payload).toEqual(payloadWithArrow);
  });
});
