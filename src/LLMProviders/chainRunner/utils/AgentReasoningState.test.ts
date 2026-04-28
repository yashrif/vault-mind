import {
  composeReasoningMessage,
  parseReasoningMessage,
  prepareAssistantOutputForMemory,
  serializeReasoningPayload,
  stripReasoningForLLMContext,
  summarizeToolCall,
  summarizeToolResult,
} from "./AgentReasoningState";

jest.mock("@/context/ChatHistoryCompactor", () => ({
  compactAssistantOutput: jest.fn((value: string) => `COMPACTED:${value}`),
}));

describe("shared reasoning payload helpers", () => {
  test("serializes and parses a chat reasoning marker with escaped closing comment sequence", () => {
    const payload = {
      source: "chat" as const,
      status: "complete" as const,
      elapsedSeconds: 7,
      items: [
        {
          id: "transcript",
          kind: "transcript" as const,
          summary: "Reasoning transcript",
          detail: "step 1 --> detail",
        },
      ],
    };

    const marker = serializeReasoningPayload(payload);
    expect(marker).toContain("<!--CORTEX_REASONING:v1:");
    expect(marker).toContain("--\\>");

    const composed = composeReasoningMessage(payload, "Final answer");
    const parsed = parseReasoningMessage(composed);

    expect(parsed).not.toBeNull();
    expect(parsed?.payload).toEqual(payload);
    expect(parsed?.contentAfter).toBe("Final answer");
  });

  test("returns a marker only when composing with empty visible text", () => {
    const payload = {
      source: "chat" as const,
      status: "reasoning" as const,
      elapsedSeconds: 0,
      items: [
        {
          id: "transcript",
          kind: "transcript" as const,
          summary: "Reasoning transcript",
          detail: "thinking",
        },
      ],
    };

    const composed = composeReasoningMessage(payload, "");
    expect(composed).toBe(serializeReasoningPayload(payload));
  });

  test("strips the shared marker and stray think tags before memory usage", () => {
    const payload = {
      source: "chat" as const,
      status: "complete" as const,
      elapsedSeconds: 2,
      items: [
        {
          id: "transcript",
          kind: "transcript" as const,
          summary: "Reasoning transcript",
          detail: "hidden reasoning",
        },
      ],
    };

    const composed = composeReasoningMessage(payload, "Visible answer");

    expect(
      stripReasoningForLLMContext(`${composed}\n\n<think>extra hidden</think>\nTrailing`)
    ).toBe("Visible answer\n\nTrailing");
  });

  test("prepares assistant output for memory by stripping reasoning before compaction", () => {
    const payload = {
      source: "chat" as const,
      status: "complete" as const,
      elapsedSeconds: 2,
      items: [
        {
          id: "transcript",
          kind: "transcript" as const,
          summary: "Reasoning transcript",
          detail: "hidden reasoning",
        },
      ],
    };

    const composed = composeReasoningMessage(payload, "Visible answer");

    expect(prepareAssistantOutputForMemory(composed)).toBe("COMPACTED:Visible answer");
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
