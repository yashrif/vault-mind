import {
  buildToolCallsFromChunks,
  accumulateToolCallChunk,
  ToolCallChunk,
} from "./utils/nativeToolCalling";
import {
  serializeReasoningPayload,
  parseReasoningPayload,
  ReasoningPayload,
  ReasoningItem,
} from "../../core/reasoning";

/**
 * Test suite for Gemini tool call name extraction fix (Issue #2233)
 *
 * Root cause: Gemini's @langchain/google-genai nests tool call names inside
 * `functionCall.name` instead of at the top level `name` property. Without
 * the fallback, all Gemini tool call names are empty, causing
 * buildToolCallsFromChunks to skip them → treated as "no tool calls" →
 * empty response since thinking tokens were filtered.
 */
describe("accumulateToolCallChunk", () => {
  describe("OpenAI-format chunks (top-level name)", () => {
    it("should accumulate name from top-level tc.name", () => {
      const chunks = new Map<number, ToolCallChunk>();

      accumulateToolCallChunk(chunks, {
        index: 0,
        id: "call_123",
        name: "localSearch",
        args: '{"query":',
      });
      accumulateToolCallChunk(chunks, {
        index: 0,
        args: '"test"}',
      });

      const result = chunks.get(0)!;
      expect(result.name).toBe("localSearch");
      expect(result.id).toBe("call_123");
      expect(result.args).toBe('{"query":"test"}');
    });

    it("should handle multiple concurrent tool calls", () => {
      const chunks = new Map<number, ToolCallChunk>();

      accumulateToolCallChunk(chunks, { index: 0, name: "localSearch", args: '{"q":"a"}' });
      accumulateToolCallChunk(chunks, { index: 1, name: "readNote", args: '{"path":"b"}' });

      expect(chunks.get(0)!.name).toBe("localSearch");
      expect(chunks.get(1)!.name).toBe("readNote");
    });
  });

  describe("Gemini-format chunks (name in functionCall)", () => {
    it("should extract name from functionCall.name when top-level name is missing", () => {
      const chunks = new Map<number, ToolCallChunk>();

      // Gemini sends chunks with functionCall.name instead of top-level name
      accumulateToolCallChunk(chunks, {
        index: 0,
        id: "call_456",
        functionCall: { name: "localSearch" },
        args: '{"query":"test"}',
      });

      const result = chunks.get(0)!;
      expect(result.name).toBe("localSearch");
      expect(result.id).toBe("call_456");
      expect(result.args).toBe('{"query":"test"}');
    });

    it("should handle multiple Gemini tool calls", () => {
      const chunks = new Map<number, ToolCallChunk>();

      accumulateToolCallChunk(chunks, {
        index: 0,
        functionCall: { name: "localSearch" },
        args: '{"query":"piano"}',
      });
      accumulateToolCallChunk(chunks, {
        index: 1,
        functionCall: { name: "readNote" },
        args: '{"path":"notes/music.md"}',
      });

      expect(chunks.get(0)!.name).toBe("localSearch");
      expect(chunks.get(1)!.name).toBe("readNote");
    });

    it("should prefer top-level name over functionCall.name", () => {
      const chunks = new Map<number, ToolCallChunk>();

      accumulateToolCallChunk(chunks, {
        index: 0,
        name: "topLevel",
        functionCall: { name: "nested" },
        args: "{}",
      });

      // Top-level name takes priority via nullish coalescing (??)
      expect(chunks.get(0)!.name).toBe("topLevel");
    });
  });

  describe("Edge cases", () => {
    it("should default index to 0 when not provided", () => {
      const chunks = new Map<number, ToolCallChunk>();

      accumulateToolCallChunk(chunks, { name: "localSearch", args: "{}" });

      expect(chunks.has(0)).toBe(true);
      expect(chunks.get(0)!.name).toBe("localSearch");
    });

    it("should handle chunk with no name at all", () => {
      const chunks = new Map<number, ToolCallChunk>();

      accumulateToolCallChunk(chunks, { index: 0, args: '{"query":"test"}' });

      expect(chunks.get(0)!.name).toBe("");
      expect(chunks.get(0)!.args).toBe('{"query":"test"}');
    });

    it("should accumulate args across multiple chunks", () => {
      const chunks = new Map<number, ToolCallChunk>();

      accumulateToolCallChunk(chunks, { index: 0, name: "localSearch", args: '{"qu' });
      accumulateToolCallChunk(chunks, { index: 0, args: 'ery":' });
      accumulateToolCallChunk(chunks, { index: 0, args: '"test"}' });

      expect(chunks.get(0)!.args).toBe('{"query":"test"}');
    });
  });
});

describe("buildToolCallsFromChunks", () => {
  it("should build tool calls from properly accumulated chunks", () => {
    const chunks = new Map<number, ToolCallChunk>();
    chunks.set(0, { id: "call_1", name: "localSearch", args: '{"query":"test"}' });

    const result = buildToolCallsFromChunks(chunks);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("localSearch");
    expect(result[0].args).toEqual({ query: "test" });
    expect(result[0].id).toBe("call_1");
  });

  it("should skip chunks with no name (the bug this fix addresses)", () => {
    const chunks = new Map<number, ToolCallChunk>();
    // This is what happened before the fix: Gemini chunks had no name
    // because the accumulator didn't check functionCall.name
    chunks.set(0, { name: "", args: '{"query":"test"}' });

    const result = buildToolCallsFromChunks(chunks);

    // Empty name → skipped → no tool calls → treated as final response
    expect(result).toHaveLength(0);
  });

  it("should handle multiple tool calls", () => {
    const chunks = new Map<number, ToolCallChunk>();
    chunks.set(0, { id: "call_1", name: "localSearch", args: '{"query":"piano"}' });
    chunks.set(1, { id: "call_2", name: "readNote", args: '{"path":"notes/music.md"}' });

    const result = buildToolCallsFromChunks(chunks);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("localSearch");
    expect(result[1].name).toBe("readNote");
  });

  it("should generate an ID when chunk has no id", () => {
    const chunks = new Map<number, ToolCallChunk>();
    chunks.set(0, { name: "localSearch", args: '{"query":"test"}' });

    const result = buildToolCallsFromChunks(chunks);

    expect(result).toHaveLength(1);
    expect(result[0].id).toMatch(/^call_/);
  });

  it("should handle malformed JSON args gracefully", () => {
    const chunks = new Map<number, ToolCallChunk>();
    chunks.set(0, { name: "localSearch", args: "not valid json" });

    const result = buildToolCallsFromChunks(chunks);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("localSearch");
    expect(result[0].args).toEqual({});
  });

  it("should handle empty args", () => {
    const chunks = new Map<number, ToolCallChunk>();
    chunks.set(0, { name: "localSearch", args: "" });

    const result = buildToolCallsFromChunks(chunks);

    expect(result).toHaveLength(1);
    expect(result[0].args).toEqual({});
  });
});

/**
 * Tests for CORTEX_REASONING payload behavior used by AutonomousAgentChainRunner.
 *
 * These tests verify the rolling window logic and full-history swap behavior
 * that the runner implements internally using ReasoningItem[] and ReasoningPayload.
 * They operate on the shared serializer/parser so we can confirm end-to-end
 * that the runner's produced marker format is parseable and correct.
 */
describe("CORTEX_REASONING payload (agent runner rolling window logic)", () => {
  /**
   * Simulate the runner's addReasoningStep + rolling window logic.
   * Returns { livePayload, allItems } after adding `summaries`.
   */
  function simulateSteps(
    summaries: string[],
    basePayload: ReasoningPayload = {
      version: 1,
      source: "agent",
      status: "reasoning",
      elapsedSeconds: 0,
      items: [],
    }
  ): { livePayload: ReasoningPayload; allItems: ReasoningItem[] } {
    let currentPayload = { ...basePayload, items: [] as ReasoningItem[] };
    const allItems: ReasoningItem[] = [];

    for (const summary of summaries) {
      const item: ReasoningItem = {
        id: `step-${allItems.length}`,
        kind: "step",
        summary,
        state: "done",
      };
      allItems.push(item);
      // Rolling window: last 4
      currentPayload = { ...currentPayload, items: allItems.slice(-4) };
    }

    return { livePayload: currentPayload, allItems };
  }

  it("should show max 4 items in the live payload during reasoning", () => {
    const summaries = ["Step 1", "Step 2", "Step 3", "Step 4", "Step 5", "Step 6"];
    const { livePayload } = simulateSteps(summaries);

    expect(livePayload.items).toHaveLength(4);
    expect(livePayload.items.map((i) => i.summary)).toEqual([
      "Step 3",
      "Step 4",
      "Step 5",
      "Step 6",
    ]);
  });

  it("should show fewer than 4 items when not enough steps added", () => {
    const { livePayload } = simulateSteps(["Only step"]);
    expect(livePayload.items).toHaveLength(1);
    expect(livePayload.items[0].summary).toBe("Only step");
  });

  it("should contain all items in allItems regardless of window size", () => {
    const summaries = Array.from({ length: 10 }, (_, i) => `Step ${i + 1}`);
    const { allItems } = simulateSteps(summaries);

    expect(allItems).toHaveLength(10);
    expect(allItems[0].summary).toBe("Step 1");
    expect(allItems[9].summary).toBe("Step 10");
  });

  it("should swap full allItems into payload when transitioning to complete", () => {
    const summaries = ["Step 1", "Step 2", "Step 3", "Step 4", "Step 5"];
    const { livePayload, allItems } = simulateSteps(summaries);

    // Before completion: only 4 items in live payload
    expect(livePayload.items).toHaveLength(4);

    // Transition to complete: swap in full history
    const completedPayload: ReasoningPayload = {
      ...livePayload,
      status: "complete",
      items: allItems,
    };

    expect(completedPayload.items).toHaveLength(5);
    expect(completedPayload.status).toBe("complete");
    expect(completedPayload.items.map((i) => i.summary)).toEqual([
      "Step 1",
      "Step 2",
      "Step 3",
      "Step 4",
      "Step 5",
    ]);
  });

  it("should produce a parseable CORTEX_REASONING marker with correct format", () => {
    const summaries = ["Analyzing your request", "Searching notes for query"];
    const { livePayload } = simulateSteps(summaries);

    const marker = serializeReasoningPayload(livePayload);

    expect(marker).toMatch(/^<!--CORTEX_REASONING:v1:/);
    expect(marker).toMatch(/-->$/);
    expect(marker).not.toContain("AGENT_REASONING");

    const parsed = parseReasoningPayload(marker);
    expect(parsed).not.toBeNull();
    expect(parsed!.payload.source).toBe("agent");
    expect(parsed!.payload.status).toBe("reasoning");
    expect(parsed!.payload.items).toHaveLength(2);
    expect(parsed!.payload.items[0].summary).toBe("Analyzing your request");
  });

  it("should include detail capped at 400 chars in ReasoningItem", () => {
    const longDetail = "x".repeat(500);
    const item: ReasoningItem = {
      id: "step-0",
      kind: "step",
      summary: "Tool call",
      detail: longDetail.slice(0, 400),
      toolName: "localSearch",
      state: "done",
    };

    expect(item.detail).toHaveLength(400);

    const payload: ReasoningPayload = {
      version: 1,
      source: "agent",
      status: "reasoning",
      elapsedSeconds: 0,
      items: [item],
    };

    const marker = serializeReasoningPayload(payload);
    const parsed = parseReasoningPayload(marker);
    expect(parsed!.payload.items[0].detail).toHaveLength(400);
  });

  it("should round-trip the CORTEX_REASONING marker with content after it", () => {
    const payload: ReasoningPayload = {
      version: 1,
      source: "agent",
      status: "complete",
      elapsedSeconds: 12,
      items: [{ id: "step-0", kind: "step", summary: "Done", state: "done" }],
    };

    const marker = serializeReasoningPayload(payload);
    const fullMessage = marker + "\n\nHere is the answer.";
    const parsed = parseReasoningPayload(fullMessage);

    expect(parsed).not.toBeNull();
    expect(parsed!.payload.status).toBe("complete");
    expect(parsed!.payload.elapsedSeconds).toBe(12);
    expect(parsed!.contentAfter).toBe("Here is the answer.");
  });
});

describe("End-to-end: Gemini streaming → buildToolCallsFromChunks", () => {
  it("should correctly process Gemini-format chunks through the full pipeline", () => {
    const chunks = new Map<number, ToolCallChunk>();

    // Simulate Gemini streaming: name comes via functionCall, not top-level
    accumulateToolCallChunk(chunks, {
      index: 0,
      id: "call_gemini_1",
      functionCall: { name: "localSearch" },
      args: '{"query":"piano notes"}',
    });

    const result = buildToolCallsFromChunks(chunks);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("localSearch");
    expect(result[0].args).toEqual({ query: "piano notes" });
  });

  it("should correctly process OpenAI-format chunks through the full pipeline", () => {
    const chunks = new Map<number, ToolCallChunk>();

    // Simulate OpenAI streaming: name at top level
    accumulateToolCallChunk(chunks, {
      index: 0,
      id: "call_openai_1",
      name: "localSearch",
      args: '{"query":"piano notes"}',
    });

    const result = buildToolCallsFromChunks(chunks);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("localSearch");
    expect(result[0].args).toEqual({ query: "piano notes" });
  });

  it("should handle sequential Gemini tool calls (the failing scenario)", () => {
    const chunks = new Map<number, ToolCallChunk>();

    // This is the exact scenario that was failing:
    // Gemini 3.1 Pro returns 2 sequential tool calls, but names were dropped
    accumulateToolCallChunk(chunks, {
      index: 0,
      id: "call_g1",
      functionCall: { name: "localSearch" },
      args: '{"query":"search term"}',
    });
    accumulateToolCallChunk(chunks, {
      index: 1,
      id: "call_g2",
      functionCall: { name: "readNote" },
      args: '{"path":"some/note.md"}',
    });

    const result = buildToolCallsFromChunks(chunks);

    // Both tool calls should be preserved — before the fix, both were dropped
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("localSearch");
    expect(result[1].name).toBe("readNote");
  });
});
