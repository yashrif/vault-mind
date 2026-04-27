import {
  serializeReasoningPayload,
  parseReasoningPayload,
  stripReasoningForLLMContext,
} from "./marker";
import type { ReasoningPayload } from "./types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const chatPayload: ReasoningPayload = {
  version: 1,
  source: "chat",
  status: "complete",
  elapsedSeconds: 3.2,
  items: [
    {
      id: "1",
      kind: "transcript",
      summary: "Thinking about the answer",
      detail: "The user asked about X, so I considered Y and Z.",
      state: "done",
    },
  ],
};

const agentPayload: ReasoningPayload = {
  version: 1,
  source: "agent",
  status: "collapsed",
  elapsedSeconds: 12,
  items: [
    {
      id: "step-0",
      kind: "step",
      summary: "Search the web",
      detail: "Calling search tool with query 'typescript generics'",
      toolName: "search",
      state: "done",
    },
    {
      id: "step-1",
      kind: "step",
      summary: "Synthesise results",
      state: "active",
    },
  ],
};

// ---------------------------------------------------------------------------
// 1. Round-trip tests
// ---------------------------------------------------------------------------

describe("serializeReasoningPayload / parseReasoningPayload — round-trip", () => {
  it("round-trips a chat transcript payload", () => {
    const marker = serializeReasoningPayload(chatPayload);
    const parsed = parseReasoningPayload(marker);

    expect(parsed).not.toBeNull();
    expect(parsed!.payload).toEqual(chatPayload);
    expect(parsed!.contentAfter).toBe("");
  });

  it("round-trips an agent step payload", () => {
    const marker = serializeReasoningPayload(agentPayload);
    const parsed = parseReasoningPayload(marker);

    expect(parsed).not.toBeNull();
    expect(parsed!.payload).toEqual(agentPayload);
    expect(parsed!.contentAfter).toBe("");
  });
});

// ---------------------------------------------------------------------------
// 2. --> escaping
// ---------------------------------------------------------------------------

describe("--> escaping", () => {
  it("escapes --> inside JSON values so the marker stays valid", () => {
    const payloadWithArrow: ReasoningPayload = {
      ...chatPayload,
      items: [
        {
          id: "x",
          kind: "step",
          summary: "Close tag here -->",
          detail: "Some --> detail",
          state: "done",
        },
      ],
    };

    const serialized = serializeReasoningPayload(payloadWithArrow);

    // The raw serialized string must NOT contain --> inside the JSON body
    // (only the trailing --> suffix is allowed)
    const prefixEnd =
      serialized.indexOf("<!--CORTEX_REASONING:v1:") + "<!--CORTEX_REASONING:v1:".length;
    const jsonBody = serialized.slice(prefixEnd, serialized.lastIndexOf("-->"));
    expect(jsonBody).not.toContain("-->");
    // The escaped form must be present
    expect(jsonBody).toContain("--\\>");

    // And it round-trips correctly
    const parsed = parseReasoningPayload(serialized);
    expect(parsed).not.toBeNull();
    expect(parsed!.payload).toEqual(payloadWithArrow);
  });
});

// ---------------------------------------------------------------------------
// 3. Malformed marker cases
// ---------------------------------------------------------------------------

describe("parseReasoningPayload — malformed inputs", () => {
  it("returns null when the prefix is missing", () => {
    expect(parseReasoningPayload("Hello, world!")).toBeNull();
  });

  it("returns null when the closing --> is missing (truncated JSON)", () => {
    const truncated = '<!--CORTEX_REASONING:v1:{"version":1,"source":"chat"';
    expect(parseReasoningPayload(truncated)).toBeNull();
  });

  it("returns null when the JSON is present but invalid", () => {
    const bad = "<!--CORTEX_REASONING:v1:{this is not json}-->";
    expect(parseReasoningPayload(bad)).toBeNull();
  });

  it("returns null when JSON version !== 1", () => {
    const wrongVersion = {
      version: 2,
      source: "chat",
      status: "complete",
      elapsedSeconds: 0,
      items: [],
    };
    const marker = `<!--CORTEX_REASONING:v1:${JSON.stringify(wrongVersion)}-->`;
    expect(parseReasoningPayload(marker)).toBeNull();
  });

  it("returns null when JSON version is a string '1' instead of number 1", () => {
    // Manually construct JSON where version is a string, not a number
    const jsonWithStringVersion = JSON.stringify({
      version: "1",
      source: "chat",
      status: "complete",
      elapsedSeconds: 0,
      items: [],
    });
    const marker = `<!--CORTEX_REASONING:v1:${jsonWithStringVersion}-->`;
    expect(parseReasoningPayload(marker)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. contentAfter
// ---------------------------------------------------------------------------

describe("parseReasoningPayload — contentAfter", () => {
  it("returns the trimmed text that follows the marker", () => {
    const marker = serializeReasoningPayload(chatPayload);
    const message = `${marker}\n\n  This is the actual response.`;
    const parsed = parseReasoningPayload(message);

    expect(parsed).not.toBeNull();
    expect(parsed!.contentAfter).toBe("This is the actual response.");
  });

  it("returns an empty string when there is no text after the marker", () => {
    const marker = serializeReasoningPayload(chatPayload);
    const parsed = parseReasoningPayload(marker);

    expect(parsed).not.toBeNull();
    expect(parsed!.contentAfter).toBe("");
  });

  it("returns empty string when only whitespace follows the marker", () => {
    const marker = serializeReasoningPayload(chatPayload);
    const parsed = parseReasoningPayload(`${marker}   \n  `);

    expect(parsed).not.toBeNull();
    expect(parsed!.contentAfter).toBe("");
  });
});

// ---------------------------------------------------------------------------
// 5. Additional edge cases for parseReasoningPayload
// ---------------------------------------------------------------------------

describe("parseReasoningPayload — additional edge cases", () => {
  it("finds the marker even when content appears before it, and contentAfter is correct", () => {
    const marker = serializeReasoningPayload(chatPayload);
    const input = `some text ${marker}\nafter text`;
    const parsed = parseReasoningPayload(input);

    // The marker is found despite preceding text
    expect(parsed).not.toBeNull();
    // contentAfter is the text that follows the marker (leading whitespace trimmed)
    expect(parsed!.contentAfter).toBe("after text");
    // The return type has no contentBefore field — the preceding text is not in the result
    expect(parsed).not.toHaveProperty("contentBefore");
  });

  it("only parses the first marker when two markers are concatenated", () => {
    const marker1 = serializeReasoningPayload(chatPayload);
    const marker2 = serializeReasoningPayload(agentPayload);
    const input = `${marker1}\n${marker2}`;
    const parsed = parseReasoningPayload(input);

    // The first marker is parsed
    expect(parsed).not.toBeNull();
    expect(parsed!.payload).toEqual(chatPayload);
    // contentAfter contains the raw second marker text as a string (not parsed)
    expect(parsed!.contentAfter).toBe(marker2);
  });

  it("round-trips a detail containing the literal escape sequence --\\>", () => {
    const escapeSequencePayload: ReasoningPayload = {
      ...chatPayload,
      items: [
        {
          id: "esc",
          kind: "transcript",
          summary: "Escape test",
          // The detail itself contains the four characters --, \, >
          detail: "--\\>",
          state: "done",
        },
      ],
    };

    const marker = serializeReasoningPayload(escapeSequencePayload);
    const parsed = parseReasoningPayload(marker);

    expect(parsed).not.toBeNull();
    // The detail must survive the serialize→parse round-trip unchanged
    expect(parsed!.payload.items[0].detail).toBe("--\\>");
  });
});

// ---------------------------------------------------------------------------
// 6. stripReasoningForLLMContext
// ---------------------------------------------------------------------------

describe("stripReasoningForLLMContext", () => {
  it("removes a single CORTEX_REASONING marker", () => {
    const marker = serializeReasoningPayload(chatPayload);
    const message = `${marker} Hello there.`;
    expect(stripReasoningForLLMContext(message)).toBe("Hello there.");
  });

  it("removes multiple CORTEX_REASONING markers in one string", () => {
    const m1 = serializeReasoningPayload(chatPayload);
    const m2 = serializeReasoningPayload(agentPayload);
    // Markers appear at the start — no inter-marker spaces needed
    const message = `${m1}${m2} Both markers stripped.`;
    expect(stripReasoningForLLMContext(message)).toBe("Both markers stripped.");
  });

  it("removes legacy <think>…</think> tags", () => {
    const message = "<think>internal thoughts</think> Actual answer.";
    expect(stripReasoningForLLMContext(message)).toBe("Actual answer.");
  });

  it("removes multi-line <think> blocks", () => {
    const message = "<think>\nline 1\nline 2\n</think>\nFinal answer.";
    expect(stripReasoningForLLMContext(message)).toBe("Final answer.");
  });

  it("leaves unrelated content intact", () => {
    const plain = "No markers here. Just a plain message.";
    expect(stripReasoningForLLMContext(plain)).toBe(plain);
  });

  it("handles a mix of CORTEX_REASONING marker and <think> tags", () => {
    const marker = serializeReasoningPayload(chatPayload);
    const message = `${marker}\n<think>extra thoughts</think>\nClean output.`;
    expect(stripReasoningForLLMContext(message)).toBe("Clean output.");
  });

  it("returns empty string when message is only markers", () => {
    const marker = serializeReasoningPayload(chatPayload);
    expect(stripReasoningForLLMContext(marker)).toBe("");
  });
});
