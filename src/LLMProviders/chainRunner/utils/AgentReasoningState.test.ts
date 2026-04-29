import {
  buildToolDetailPreview,
  parseReasoningMessage,
  serializeReasoningPayload,
  stripReasoningMarker,
  summarizeToolCall,
  summarizeToolResult,
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

  test("summarizeToolResult has daily/random CLI specific wording", () => {
    expect(
      summarizeToolResult("obsidianDailyNote", { success: true }, undefined, {
        command: "daily:read",
        vault: "Work",
      })
    ).toBe(`Loaded today's daily note from "Work"`);
    expect(
      summarizeToolResult("obsidianDailyNote", { success: true }, undefined, {
        command: "daily:read",
      })
    ).toBe("Loaded today's daily note");
    expect(
      summarizeToolResult("obsidianDailyNote", { success: true }, undefined, {
        command: "daily:path",
        vault: "Work",
      })
    ).toBe(`Got daily note path from "Work"`);

    expect(
      summarizeToolResult("obsidianRandomRead", { success: true }, undefined, { vault: "Personal" })
    ).toBe(`Loaded a random note from "Personal"`);
    expect(summarizeToolResult("obsidianRandomRead", { success: true })).toBe(
      "Loaded a random note"
    );
  });

  test("summarizeToolResult failure path reuses CLI call summary", () => {
    expect(
      summarizeToolResult("obsidianRandomRead", { success: false }, undefined, { vault: "VaultA" })
    ).toBe(`Reading a random note from "VaultA" failed`);
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

  test("summarizeToolResult has properties/tasks/links CLI specific wording", () => {
    expect(
      summarizeToolResult("obsidianProperties", { success: true }, undefined, {
        command: "properties",
      })
    ).toBe("Listed vault properties");
    expect(
      summarizeToolResult("obsidianProperties", { success: true }, undefined, {
        command: "property:read",
        name: "tags",
      })
    ).toBe(`Read property "tags"`);
    expect(
      summarizeToolResult("obsidianTasks", { success: true }, undefined, { command: "tasks" })
    ).toBe("Listed vault tasks");
    expect(
      summarizeToolResult("obsidianLinks", { success: true }, undefined, { command: "backlinks" })
    ).toBe("Listed backlinks");
    expect(
      summarizeToolResult("obsidianLinks", { success: true }, undefined, { command: "orphans" })
    ).toBe("Listed orphaned notes");
  });
});
