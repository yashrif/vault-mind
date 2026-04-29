import React from "react";
import { render, screen } from "@testing-library/react";

import { CortexPlusSettings } from "@/settings/v2/components/CortexPlusSettings";
import { useSettingsValue } from "@/settings/model";

jest.mock("@/settings/model", () => ({
  useSettingsValue: jest.fn(),
  updateSetting: jest.fn(),
}));

jest.mock("@/components/ui/help-tooltip", () => ({
  HelpTooltip: () => <span data-testid="help-tooltip" />,
}));

jest.mock("@/components/ui/setting-item", () => ({
  SettingItem: ({ title, children }: any) => (
    <div>
      <div>{title}</div>
      {children}
    </div>
  ),
}));

jest.mock("@/settings/v2/components/ToolSettingsSection", () => ({
  ToolSettingsSection: () => <div data-testid="tool-settings-section" />,
}));

describe("CortexPlusSettings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useSettingsValue as jest.Mock).mockReturnValue({
      convertedDocOutputFolder: "",
      memoryFolderName: "Cortex/memory",
      enableRecentConversations: false,
      enableSavedMemory: false,
      enableSelfHostMode: false,
    });
  });

  it("renders tool settings without an autonomous-agent enable switch", () => {
    render(<CortexPlusSettings />);

    expect(screen.queryByText("Enable Autonomous Agent")).toBeNull();
    expect(screen.getByTestId("tool-settings-section")).toBeTruthy();
  });
});
