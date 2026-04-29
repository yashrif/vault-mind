import { StructuredTool } from "@langchain/core/tools";

import { resolveToolPermissions } from "@/core/ToolPermissions";
import { ToolRegistry } from "@/tools/ToolRegistry";

const makeTool = (name: string) => ({ name }) as StructuredTool;

describe("resolveToolPermissions", () => {
  beforeEach(() => {
    ToolRegistry.getInstance().clear();
    const registry = ToolRegistry.getInstance();
    registry.registerAll([
      {
        tool: makeTool("getCurrentTime"),
        metadata: {
          id: "getCurrentTime",
          displayName: "Time",
          description: "Read current time.",
          category: "time",
          accessLevel: "free",
        },
      },
      {
        tool: makeTool("localSearch"),
        metadata: {
          id: "localSearch",
          displayName: "Vault Search",
          description: "Search notes.",
          category: "search",
          accessLevel: "costly",
          requiresVault: true,
        },
      },
      {
        tool: makeTool("webSearch"),
        metadata: {
          id: "webSearch",
          displayName: "Web Search",
          description: "Search web.",
          category: "search",
          accessLevel: "costly",
        },
      },
      {
        tool: makeTool("writeFile"),
        metadata: {
          id: "writeFile",
          displayName: "Write File",
          description: "Write vault file.",
          category: "file",
          accessLevel: "write",
          requiresVault: true,
        },
      },
      {
        tool: makeTool("obsidianBases"),
        metadata: {
          id: "obsidianBases",
          displayName: "Bases",
          description: "Read or modify bases.",
          category: "cli",
          accessLevel: "mixed",
          requiresVault: true,
        },
      },
    ]);
  });

  it("chat includes free tools and enabled costly tools but excludes write and mixed tools", () => {
    const tools = resolveToolPermissions({
      surface: "chat",
      ragEnabled: false,
      vaultAvailable: true,
      toolDefaults: {
        chat: { webSearch: true },
        agent: {},
      },
    });

    expect(tools.map((tool) => tool.name)).toEqual(["getCurrentTime", "webSearch"]);
  });

  it("chat with RAG includes localSearch regardless of generic chat defaults", () => {
    const tools = resolveToolPermissions({
      surface: "chat",
      ragEnabled: true,
      vaultAvailable: true,
      toolDefaults: {
        chat: { webSearch: false },
        agent: {},
      },
    });

    expect(tools.map((tool) => tool.name)).toContain("localSearch");
  });

  it("agent includes enabled costly, write, and mixed tools", () => {
    const tools = resolveToolPermissions({
      surface: "agent",
      vaultAvailable: true,
      toolDefaults: {
        chat: {},
        agent: { localSearch: true, writeFile: true, obsidianBases: true },
      },
    });

    expect(tools.map((tool) => tool.name)).toEqual([
      "getCurrentTime",
      "localSearch",
      "writeFile",
      "obsidianBases",
    ]);
  });
});
