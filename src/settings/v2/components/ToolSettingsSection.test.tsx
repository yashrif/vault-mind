import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { ToolSettingsSection } from "@/settings/v2/components/ToolSettingsSection";
import { updateSetting, useSettingsValue } from "@/settings/model";

const mockGetToolsByCategory = jest.fn();
const mockGetConfigurableTools = jest.fn();

jest.mock("@/settings/model", () => ({
  useSettingsValue: jest.fn(),
  updateSetting: jest.fn(),
}));

jest.mock("@/components/ui/setting-item", () => ({
  SettingItem: ({ title, checked, onCheckedChange, children }: any) => (
    <div>
      <button type="button" onClick={() => onCheckedChange?.(!checked)}>
        {title}
      </button>
      {children}
    </div>
  ),
}));

jest.mock("@/tools/ToolRegistry", () => ({
  ToolRegistry: {
    getInstance: () => ({
      getToolsByCategory: mockGetToolsByCategory,
      getConfigurableTools: mockGetConfigurableTools,
    }),
  },
}));

const webSearchTool = {
  metadata: {
    id: "webSearch",
    displayName: "Web Search",
    description: "Search the web",
    category: "search",
    accessLevel: "costly",
  },
};
const localSearchTool = {
  metadata: {
    id: "localSearch",
    displayName: "Vault Search",
    description: "Search the vault",
    category: "search",
    accessLevel: "costly",
  },
};
const writeFileTool = {
  metadata: {
    id: "writeFile",
    displayName: "Write to File",
    description: "Write files",
    category: "file",
    accessLevel: "write",
  },
};

describe("ToolSettingsSection", () => {
  const settings = {
    autonomousAgentMaxIterations: 4,
    toolDefaults: {
      chat: {
        webSearch: false,
      },
      agent: {
        localSearch: true,
        webSearch: true,
        writeFile: false,
      },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useSettingsValue as jest.Mock).mockReturnValue(settings);
    const tools = [webSearchTool, localSearchTool, writeFileTool];
    mockGetConfigurableTools.mockReturnValue(tools);
    mockGetToolsByCategory.mockReturnValue(
      new Map([
        ["search", [webSearchTool, localSearchTool]],
        ["file", [writeFileTool]],
      ])
    );
  });

  it("renders separate Chat and Agent tool sections", () => {
    render(<ToolSettingsSection />);

    expect(screen.getByText("Chat Tools")).toBeTruthy();
    expect(screen.getByText("Agent Tools")).toBeTruthy();
    expect(screen.getByText(/Vault Search is controlled by the RAG toggle/i)).toBeTruthy();
  });

  it("updates Chat costly tools through toolDefaults.chat", () => {
    render(<ToolSettingsSection />);

    fireEvent.click(screen.getAllByRole("button", { name: "Web Search" })[0]);

    expect(updateSetting).toHaveBeenCalledWith("toolDefaults", {
      ...settings.toolDefaults,
      chat: {
        ...settings.toolDefaults.chat,
        webSearch: true,
      },
    });
  });

  it("updates Agent tools through toolDefaults.agent", () => {
    render(<ToolSettingsSection />);

    fireEvent.click(screen.getByRole("button", { name: "Write to File" }));

    expect(updateSetting).toHaveBeenCalledWith("toolDefaults", {
      ...settings.toolDefaults,
      agent: {
        ...settings.toolDefaults.agent,
        writeFile: true,
      },
    });
  });
});
