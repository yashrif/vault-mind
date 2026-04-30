import type { ToolMetadata } from "@/tools/ToolRegistry";

import { buildToolPromptGuidance } from "./toolPromptGuidance";

function makeMetadata(overrides: Partial<ToolMetadata>): ToolMetadata {
  return {
    id: "testTool",
    displayName: "Test Tool",
    description: "Test tool",
    category: "custom",
    accessLevel: "free",
    ...overrides,
  };
}

describe("buildToolPromptGuidance", () => {
  it("omits conditional instructions when a required tool is unavailable", () => {
    const guidance = buildToolPromptGuidance({
      toolMetadata: [
        makeMetadata({
          id: "getTimeRangeMs",
          displayName: "Get Time Range",
          customPromptInstructions: "Convert natural language time expressions to date ranges.",
          conditionalPromptInstructions: [
            {
              requiredToolIds: ["localSearch"],
              content:
                "For time-based vault search, call localSearch with the returned time range.",
            },
          ],
        }),
      ],
      availableToolNames: ["getTimeRangeMs"],
    });

    expect(guidance).toContain("Convert natural language time expressions");
    expect(guidance).not.toContain("localSearch");
    expect(guidance).not.toContain("vault search");
  });

  it("includes conditional instructions when all required tools are available", () => {
    const guidance = buildToolPromptGuidance({
      toolMetadata: [
        makeMetadata({
          id: "getTimeRangeMs",
          displayName: "Get Time Range",
          customPromptInstructions: "Convert natural language time expressions to date ranges.",
          conditionalPromptInstructions: [
            {
              requiredToolIds: ["localSearch"],
              content:
                "For time-based vault search, call localSearch with the returned time range.",
            },
          ],
        }),
      ],
      availableToolNames: ["getTimeRangeMs", "localSearch"],
    });

    expect(guidance).toContain("Convert natural language time expressions");
    expect(guidance).toContain("call localSearch");
  });

  it("retains Cortex command alias instructions for available tools", () => {
    const guidance = buildToolPromptGuidance({
      toolMetadata: [
        makeMetadata({
          id: "webSearch",
          displayName: "Web Search",
          CortexCommands: ["@websearch"],
          customPromptInstructions: "Search the web only when requested.",
        }),
      ],
      availableToolNames: ["webSearch"],
    });

    expect(guidance).toContain(
      "When the user explicitly includes a Cortex command alias (e.g., @vault)"
    );
    expect(guidance).toContain("Honor these aliases exactly (case-insensitive):");
    expect(guidance).toContain("- @websearch: call the tool named webSearch");
    expect(guidance).toContain(
      "If the referenced tool is unavailable, explain that the command cannot be fulfilled instead of ignoring it."
    );
    expect(guidance).not.toContain("@vault: call the tool named localSearch");
  });

  it("prefixes tool instructions with display names when requested", () => {
    const guidance = buildToolPromptGuidance({
      toolMetadata: [
        makeMetadata({
          id: "readNote",
          displayName: "Read Note",
          customPromptInstructions: "Read a specific note when its path is known.",
        }),
      ],
      availableToolNames: ["readNote"],
      prefixCustomInstructionsWithDisplayName: true,
    });

    expect(guidance).toContain("For Read Note: Read a specific note when its path is known.");
  });
});
