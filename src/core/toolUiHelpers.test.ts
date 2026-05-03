import { ToolOverrideValue } from "@/aiParams";
import { ToolDefaultSettings } from "@/settings/model";
import { ToolDefinition } from "@/tools/ToolRegistry";

// Mock @/aiParams so getCurrentProject is controllable in tests.
jest.mock("@/aiParams", () => ({
  getCurrentProject: jest.fn(),
}));

import { getCurrentProject } from "@/aiParams";
import {
  effectiveAgentToolEnabled,
  getProjectAgentOverride,
  isChatConfigurableTool,
  isToolChecked,
} from "@/core/toolUiHelpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal ToolDefinition for use in tests.
 */
function makeToolDef(
  id: string,
  accessLevel: "free" | "costly" | "write" | "mixed"
): ToolDefinition {
  return {
    tool: { name: id } as never,
    metadata: {
      id,
      displayName: id,
      description: "",
      category: "search",
      accessLevel,
    },
  };
}

const mockGetCurrentProject = getCurrentProject as jest.MockedFunction<typeof getCurrentProject>;

// ---------------------------------------------------------------------------
// isChatConfigurableTool
// ---------------------------------------------------------------------------

describe("isChatConfigurableTool", () => {
  it("returns false for localSearch even though it is costly", () => {
    const def = makeToolDef("localSearch", "costly");
    expect(isChatConfigurableTool(def)).toBe(false);
  });

  it("returns false for write-level tools", () => {
    const def = makeToolDef("createNote", "write");
    expect(isChatConfigurableTool(def)).toBe(false);
  });

  it("returns false for free-level tools", () => {
    const def = makeToolDef("getCurrentTime", "free");
    expect(isChatConfigurableTool(def)).toBe(false);
  });

  it("returns false for mixed-level tools", () => {
    const def = makeToolDef("mixedTool", "mixed");
    expect(isChatConfigurableTool(def)).toBe(false);
  });

  it("returns true for other costly tools (e.g. webSearch)", () => {
    const def = makeToolDef("webSearch", "costly");
    expect(isChatConfigurableTool(def)).toBe(true);
  });

  it("returns true for any costly tool that is not localSearch", () => {
    const def = makeToolDef("someOtherCostlyTool", "costly");
    expect(isChatConfigurableTool(def)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isToolChecked
// ---------------------------------------------------------------------------

describe("isToolChecked", () => {
  const toolDefaults: ToolDefaultSettings = {
    chat: { webSearch: true, otherTool: false },
    agent: { webSearch: true, otherTool: false },
    telegram: { webSearch: false, otherTool: true },
  };

  describe("chat surface (opt-in semantics)", () => {
    it("returns true when explicitly set to true", () => {
      expect(isToolChecked("chat", toolDefaults, "webSearch")).toBe(true);
    });

    it("returns false when explicitly set to false", () => {
      expect(isToolChecked("chat", toolDefaults, "otherTool")).toBe(false);
    });

    it("returns false when tool is absent (not === true)", () => {
      expect(isToolChecked("chat", toolDefaults, "unknownTool")).toBe(false);
    });
  });

  describe("agent surface (opt-in semantics)", () => {
    it("returns true when explicitly set to true", () => {
      expect(isToolChecked("agent", toolDefaults, "webSearch")).toBe(true);
    });

    it("returns false when explicitly set to false", () => {
      expect(isToolChecked("agent", toolDefaults, "otherTool")).toBe(false);
    });

    it("returns false when tool is absent (not === true)", () => {
      expect(isToolChecked("agent", toolDefaults, "unknownTool")).toBe(false);
    });
  });

  describe("telegram surface (opt-out semantics)", () => {
    it("returns false when explicitly set to false", () => {
      expect(isToolChecked("telegram", toolDefaults, "webSearch")).toBe(false);
    });

    it("returns true when explicitly set to true", () => {
      expect(isToolChecked("telegram", toolDefaults, "otherTool")).toBe(true);
    });

    it("returns true when tool is absent (not !== false)", () => {
      expect(isToolChecked("telegram", toolDefaults, "unknownTool")).toBe(true);
    });

    it("returns true when telegram record is undefined", () => {
      const defaultsNoTelegram: ToolDefaultSettings = {
        chat: {},
        agent: {},
      };
      expect(isToolChecked("telegram", defaultsNoTelegram, "webSearch")).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// getProjectAgentOverride
// ---------------------------------------------------------------------------

describe("getProjectAgentOverride", () => {
  afterEach(() => {
    mockGetCurrentProject.mockReset();
  });

  it("returns the override value when project has one", () => {
    mockGetCurrentProject.mockReturnValue({
      id: "proj1",
      name: "Test",
      systemPrompt: "",
      projectModelKey: "",
      modelConfigs: {},
      contextSource: {},
      toolOverrides: { agent: { webSearch: true } },
      created: 0,
      UsageTimestamps: 0,
    });
    expect(getProjectAgentOverride("webSearch")).toBe(true);
  });

  it("returns 'inherit' when override is set to inherit", () => {
    mockGetCurrentProject.mockReturnValue({
      id: "proj1",
      name: "Test",
      systemPrompt: "",
      projectModelKey: "",
      modelConfigs: {},
      contextSource: {},
      toolOverrides: { agent: { webSearch: "inherit" as ToolOverrideValue } },
      created: 0,
      UsageTimestamps: 0,
    });
    expect(getProjectAgentOverride("webSearch")).toBe("inherit");
  });

  it("returns undefined when tool has no override", () => {
    mockGetCurrentProject.mockReturnValue({
      id: "proj1",
      name: "Test",
      systemPrompt: "",
      projectModelKey: "",
      modelConfigs: {},
      contextSource: {},
      toolOverrides: { agent: {} },
      created: 0,
      UsageTimestamps: 0,
    });
    expect(getProjectAgentOverride("webSearch")).toBeUndefined();
  });

  it("returns undefined when no active project", () => {
    mockGetCurrentProject.mockReturnValue(null);
    expect(getProjectAgentOverride("webSearch")).toBeUndefined();
  });

  it("returns undefined when project has no toolOverrides", () => {
    mockGetCurrentProject.mockReturnValue({
      id: "proj1",
      name: "Test",
      systemPrompt: "",
      projectModelKey: "",
      modelConfigs: {},
      contextSource: {},
      created: 0,
      UsageTimestamps: 0,
    });
    expect(getProjectAgentOverride("webSearch")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// effectiveAgentToolEnabled
// ---------------------------------------------------------------------------

describe("effectiveAgentToolEnabled", () => {
  const toolDefaults: ToolDefaultSettings = {
    chat: {},
    agent: { webSearch: true, createNote: false },
  };

  afterEach(() => {
    mockGetCurrentProject.mockReset();
  });

  it("applies boolean true project override over global default of false", () => {
    mockGetCurrentProject.mockReturnValue({
      id: "proj1",
      name: "Test",
      systemPrompt: "",
      projectModelKey: "",
      modelConfigs: {},
      contextSource: {},
      toolOverrides: { agent: { createNote: true } },
      created: 0,
      UsageTimestamps: 0,
    });
    expect(effectiveAgentToolEnabled(toolDefaults, "createNote")).toBe(true);
  });

  it("applies boolean false project override over global default of true", () => {
    mockGetCurrentProject.mockReturnValue({
      id: "proj1",
      name: "Test",
      systemPrompt: "",
      projectModelKey: "",
      modelConfigs: {},
      contextSource: {},
      toolOverrides: { agent: { webSearch: false } },
      created: 0,
      UsageTimestamps: 0,
    });
    expect(effectiveAgentToolEnabled(toolDefaults, "webSearch")).toBe(false);
  });

  it("falls back to toolDefaults when override is 'inherit'", () => {
    mockGetCurrentProject.mockReturnValue({
      id: "proj1",
      name: "Test",
      systemPrompt: "",
      projectModelKey: "",
      modelConfigs: {},
      contextSource: {},
      toolOverrides: { agent: { webSearch: "inherit" as ToolOverrideValue } },
      created: 0,
      UsageTimestamps: 0,
    });
    // toolDefaults.agent.webSearch === true → should return true
    expect(effectiveAgentToolEnabled(toolDefaults, "webSearch")).toBe(true);
  });

  it("falls back to toolDefaults (false) when override is 'inherit'", () => {
    mockGetCurrentProject.mockReturnValue({
      id: "proj1",
      name: "Test",
      systemPrompt: "",
      projectModelKey: "",
      modelConfigs: {},
      contextSource: {},
      toolOverrides: { agent: { createNote: "inherit" as ToolOverrideValue } },
      created: 0,
      UsageTimestamps: 0,
    });
    // toolDefaults.agent.createNote === false → should return false
    expect(effectiveAgentToolEnabled(toolDefaults, "createNote")).toBe(false);
  });

  it("falls back to toolDefaults when override is undefined (no override key)", () => {
    mockGetCurrentProject.mockReturnValue({
      id: "proj1",
      name: "Test",
      systemPrompt: "",
      projectModelKey: "",
      modelConfigs: {},
      contextSource: {},
      toolOverrides: { agent: {} },
      created: 0,
      UsageTimestamps: 0,
    });
    expect(effectiveAgentToolEnabled(toolDefaults, "webSearch")).toBe(true);
  });

  it("falls back to toolDefaults when no active project", () => {
    mockGetCurrentProject.mockReturnValue(null);
    expect(effectiveAgentToolEnabled(toolDefaults, "webSearch")).toBe(true);
    expect(effectiveAgentToolEnabled(toolDefaults, "createNote")).toBe(false);
  });

  it("returns false when tool is absent from toolDefaults and no override", () => {
    mockGetCurrentProject.mockReturnValue(null);
    expect(effectiveAgentToolEnabled(toolDefaults, "unknownTool")).toBe(false);
  });
});
