import {
  buildToolDetailPreview,
  parseReasoningMessage,
  sanitizeTextForModelContext,
  serializeReasoningPayload,
  stripReasoningMarker,
  summarizeToolCall,
} from "./AgentReasoningState";

describe("CORTEX_REASONING payload", () => {
  it("serializes UTF-8 JSON as base64 so HTML comment terminators in tool results are safe", () => {
    const marker = serializeReasoningPayload({
      status: "complete",
      elapsedSeconds: 12,
      steps: [
        {
          id: "step-1",
          timestamp: 123,
          summary: "Searching notes",
          toolName: "localSearch",
          toolDetails: {
            status: "success",
            argsPreview: { query: "notes" },
            resultPreview: "result containing --> and বাংলা",
            durationMs: 25,
            truncated: false,
          },
        },
      ],
    });

    expect(marker).toMatch(/^<!--CORTEX_REASONING:v1:[A-Za-z0-9+/=]+-->$/);
    expect(marker).not.toContain("result containing");
    expect(marker.indexOf("-->")).toBe(marker.length - 3);

    const parsed = parseReasoningMessage(`${marker}\n\nFinal answer`);
    expect(parsed?.payload.steps[0].toolDetails?.resultPreview).toBe(
      "result containing --> and বাংলা"
    );
    expect(parsed?.contentAfter).toBe("Final answer");
  });

  it("returns null for malformed markers and strips marker-looking comments separately", () => {
    const invalidBase64 = "<!--CORTEX_REASONING:v1:not-base64@@-->Answer";
    const invalidJson = "<!--CORTEX_REASONING:v1:bm90LWpzb24=-->Answer";
    const missingSteps = "<!--CORTEX_REASONING:v1:eyJzdGF0dXMiOiJjb21wbGV0ZSJ9-->Answer";
    const missingToolArgs = serializeReasoningPayload({
      status: "complete",
      elapsedSeconds: 0,
      steps: [
        {
          id: "step-1",
          timestamp: 123,
          summary: "Searching notes",
          toolDetails: {
            status: "success",
            truncated: false,
          } as any,
        },
      ],
    });

    expect(parseReasoningMessage(invalidBase64)).toBeNull();
    expect(parseReasoningMessage(invalidJson)).toBeNull();
    expect(parseReasoningMessage(missingSteps)).toBeNull();
    expect(parseReasoningMessage(missingToolArgs)).toBeNull();
    expect(stripReasoningMarker(invalidBase64)).toBe("Answer");
  });

  it("preserves model-context whitespace while removing reasoning markers", () => {
    const content = "  \nBefore\n<!--CORTEX_REASONING:v1:abc-->\nAfter\n  ";

    expect(sanitizeTextForModelContext(content)).toBe("  \nBefore\n\nAfter\n  ");
    expect(stripReasoningMarker(content)).toBe("Before\n\nAfter");
  });

  it("redacts sensitive keys and caps previews", () => {
    const preview = buildToolDetailPreview({
      args: {
        query: "a".repeat(350),
        apiKey: "secret-value",
        nested: {
          token: "hidden-token",
          values: Array.from({ length: 25 }, (_, index) => index),
        },
      },
      result: "r".repeat(900),
      success: true,
      durationMs: 42,
    });

    expect(preview.status).toBe("success");
    expect((preview.argsPreview as any).apiKey).toBe("[redacted]");
    expect((preview.argsPreview as any).nested.token).toBe("[redacted]");
    expect((preview.argsPreview as any).query).toHaveLength(303);
    expect((preview.argsPreview as any).nested.values).toHaveLength(21);
    expect(preview.resultPreview).toHaveLength(803);
    expect(preview.durationMs).toBe(42);
    expect(preview.truncated).toBe(true);
  });
});

describe("AgentReasoningState tool summaries", () => {
  test("summarizeToolCall has daily/random CLI specific wording", () => {
    expect(summarizeToolCall("obsidianDailyNote", { command: "daily:read" })).toBe(
      "Reading today's daily note"
    );
    expect(summarizeToolCall("obsidianDailyNote", { command: "daily:read", vault: "Work" })).toBe(
      `Reading today's daily note from "Work"`
    );
    expect(summarizeToolCall("obsidianDailyNote", { command: "daily:path" })).toBe(
      "Getting daily note path"
    );

    expect(summarizeToolCall("obsidianRandomRead")).toBe("Reading a random note");
    expect(summarizeToolCall("obsidianRandomRead", { vault: "Personal" })).toBe(
      `Reading a random note from "Personal"`
    );
  });

  test("summarizeToolCall has properties/tasks/links CLI specific wording", () => {
    expect(summarizeToolCall("obsidianProperties", { command: "properties" })).toBe(
      "Listing vault properties"
    );
    expect(
      summarizeToolCall("obsidianProperties", { command: "property:read", name: "tags" })
    ).toBe(`Reading property "tags"`);
    expect(summarizeToolCall("obsidianTasks", { command: "tasks" })).toBe("Listing vault tasks");
    expect(summarizeToolCall("obsidianLinks", { command: "backlinks" })).toBe("Listing backlinks");
    expect(summarizeToolCall("obsidianLinks", { command: "orphans" })).toBe(
      "Listing orphaned notes"
    );
    expect(summarizeToolCall("obsidianLinks", { command: "unresolved" })).toBe(
      "Listing unresolved links"
    );
  });
});

describe("buildToolDetailPreview", () => {
  it("does not set resultPreview on error so the text is not shown twice", () => {
    const details = buildToolDetailPreview({
      args: {},
      result: "Tool failed: file not found",
      success: false,
      durationMs: 120,
    });

    expect(details.status).toBe("error");
    expect(details.errorMessage).toBe("Tool failed: file not found");
    expect(details.resultPreview).toBeUndefined();
  });

  it("does not set errorMessage on success", () => {
    const details = buildToolDetailPreview({
      args: { query: "hello" },
      result: "Found 3 results",
      success: true,
      durationMs: 80,
    });

    expect(details.status).toBe("success");
    expect(details.resultPreview).toBe("Found 3 results");
    expect(details.errorMessage).toBeUndefined();
  });

  it("sets status to running and leaves result fields undefined when success is absent", () => {
    const details = buildToolDetailPreview({ args: { path: "note.md" } });

    expect(details.status).toBe("running");
    expect(details.resultPreview).toBeUndefined();
    expect(details.errorMessage).toBeUndefined();
  });
});
