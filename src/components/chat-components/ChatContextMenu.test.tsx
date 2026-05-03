import React from "react";
import { render, screen } from "@testing-library/react";
import { ChatContextMenu } from "@/components/chat-components/ChatContextMenu";
import type { ChainPresetId } from "@/runtime/ChainPreset";

const mockGetCurrentProject = jest.fn();
const mockUseChainPresetId = jest.fn();
const mockUseIndexingProgress = jest.fn();
const mockUseProjectContextStatus = jest.fn();

jest.mock("@/aiParams", () => ({
  getCurrentProject: () => mockGetCurrentProject(),
  useChainPresetId: () => mockUseChainPresetId(),
  useIndexingProgress: () => mockUseIndexingProgress(),
}));

jest.mock("@/hooks/useProjectContextStatus", () => ({
  useProjectContextStatus: () => mockUseProjectContextStatus(),
}));

jest.mock("@/components/ui/button", () => ({
  Button: (() => {
    const MockButton = React.forwardRef<HTMLButtonElement, any>(({ children, ...props }, ref) => (
      <button ref={ref} type="button" {...props}>
        {children}
      </button>
    ));
    MockButton.displayName = "MockButton";
    return MockButton;
  })(),
}));

jest.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));

jest.mock("@/components/chat-components/ContextBadges", () => ({
  ContextNoteBadge: () => <span data-testid="context-note-badge" />,
  ContextActiveNoteBadge: () => <span data-testid="context-active-note-badge" />,
  ContextActiveWebTabBadge: () => <span data-testid="context-active-web-tab-badge" />,
  ContextWebTabBadge: () => <span data-testid="context-web-tab-badge" />,
  ContextUrlBadge: () => <span data-testid="context-url-badge" />,
  ContextFolderBadge: () => <span data-testid="context-folder-badge" />,
  FaviconOrGlobe: () => <span data-testid="favicon-or-globe" />,
}));

jest.mock("@/components/ui/separator", () => ({
  Separator: () => <span data-testid="separator" />,
}));

jest.mock("@/utils", () => ({
  getDomainFromUrl: () => "example.com",
  openFileInWorkspace: jest.fn(),
}));

jest.mock("@/runtime/ChainPreset", () => ({
  isAgentPresetId: () => false,
}));

jest.mock("@/utils/urlNormalization", () => ({
  mergeWebTabContexts: (tabs: any[]) => tabs,
}));

jest.mock("@/components/chat-components/AtMentionTypeahead", () => ({
  AtMentionTypeahead: () => <div data-testid="at-mention-typeahead" />,
}));

jest.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: any) => <>{children}</>,
  PopoverContent: ({ children }: any) => <>{children}</>,
  PopoverTrigger: ({ children }: any) => <>{children}</>,
}));

jest.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

jest.mock("lucide-react", () => ({
  AlertCircle: () => <span data-testid="icon-project-context-status" />,
  CheckCircle: () => <span data-testid="icon-project-context-status" />,
  CircleDashed: () => <span data-testid="icon-project-context-status" />,
  FileText: () => <span data-testid="icon-file-text" />,
  Loader2: () => <span data-testid="icon-loader" />,
  X: () => <span data-testid="icon-x" />,
}));

jest.mock("obsidian", () => ({
  Platform: {
    isDesktopApp: true,
  },
  TFile: class {},
}));

describe("ChatContextMenu project context status button", () => {
  const baseProps = {
    includeActiveNote: false,
    currentActiveFile: null,
    includeActiveWebTab: false,
    activeWebTab: null,
    contextNotes: [],
    contextUrls: [],
    contextFolders: [],
    contextWebTabs: [],
    selectedTextContexts: [],
    onRemoveContext: jest.fn(),
    showProgressCard: jest.fn(),
    showIndexingCard: jest.fn(),
    onTypeaheadSelect: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentProject.mockReturnValue({ id: "project-1", name: "Project 1" });
    mockUseIndexingProgress.mockReturnValue([
      {
        isActive: false,
        completionStatus: "none",
      },
    ]);
    mockUseProjectContextStatus.mockReturnValue("success");
  });

  function renderMenu(presetId: ChainPresetId) {
    mockUseChainPresetId.mockReturnValue([presetId, jest.fn()]);
    render(<ChatContextMenu {...baseProps} />);
  }

  it("hides the project context status button outside project preset even when a project is selected", () => {
    renderMenu("chat");

    expect(screen.queryByTestId("icon-project-context-status")).toBeNull();
  });

  it("shows the project context status button in project preset when a project is selected", () => {
    renderMenu("project_agent");

    expect(screen.getByTestId("icon-project-context-status")).toBeTruthy();
  });
});
