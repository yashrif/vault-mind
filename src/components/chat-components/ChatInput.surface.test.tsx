import React from "react";
import { render, screen } from "@testing-library/react";
import ChatInput from "@/components/chat-components/ChatInput";

const mockGetCurrentProject = jest.fn();
const mockSubscribeToProjectChange = jest.fn();
const mockUseChainPresetId = jest.fn();
const mockUseModelKey = jest.fn();
const mockUseProjectLoading = jest.fn();

jest.mock("@/aiParams", () => ({
  getCurrentProject: () => mockGetCurrentProject(),
  subscribeToProjectChange: (...args: any[]) => mockSubscribeToProjectChange(...args),
  useChainPresetId: () => mockUseChainPresetId(),
  useModelKey: () => mockUseModelKey(),
  useProjectLoading: () => mockUseProjectLoading(),
}));

jest.mock("@/components/modals/AddFileModal", () => ({
  AddFileModal: class {
    open() {}
  },
}));

jest.mock("@/utils/fileContentExtractor", () => ({
  isImageFile: jest.fn((file: File) => file.type.startsWith("image/")),
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

jest.mock("@/components/ui/ModelSelector", () => ({
  ModelSelector: ({ value, disabled }: any) => (
    <div data-testid="model-selector" data-disabled={disabled ? "true" : "false"}>
      {value}
    </div>
  ),
}));

jest.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: any) => <>{children}</>,
  TooltipContent: ({ children }: any) => <span>{children}</span>,
  TooltipProvider: ({ children }: any) => <>{children}</>,
  TooltipTrigger: ({ children }: any) => <>{children}</>,
}));

jest.mock("@/components/chat-components/tools/ChatToolsPopover", () => ({
  ChatToolsPopover: ({ surface }: any) => <div data-testid="chat-tools-popover">{surface}</div>,
}));

jest.mock("./ChainModeSelector", () => ({
  ChainModeSelector: () => <div data-testid="chain-mode-selector" />,
}));

jest.mock("@/utils/urlNormalization", () => ({
  mergeWebTabContexts: jest.fn((contexts: any[]) => contexts),
  normalizeUrlString: jest.fn((url: string | null | undefined) => url ?? null),
  normalizeWebTabContext: jest.fn((context: any) => context),
}));

jest.mock("@/runtime/ChainPreset", () => ({
  isAgentPresetId: jest.fn(() => false),
  isRichContextPresetId: jest.fn(() => true),
}));

jest.mock("@/utils", () => ({
  isAllowedFileForNoteContext: jest.fn(() => false),
}));

jest.mock("./ContextControl", () => ({
  ContextControl: () => <div data-testid="context-control" />,
}));

jest.mock("./pills/NotePillNode", () => ({
  $removePillsByPath: jest.fn(),
}));

jest.mock("./pills/ActiveNotePillNode", () => ({
  $removeActiveNotePills: jest.fn(),
}));

jest.mock("./pills/URLPillNode", () => ({
  $removePillsByURL: jest.fn(),
}));

jest.mock("./pills/FolderPillNode", () => ({
  $removePillsByFolder: jest.fn(),
}));

jest.mock("./pills/ToolPillNode", () => ({
  $createToolPillNode: jest.fn(),
  $removePillsByToolName: jest.fn(),
}));

jest.mock("./pills/ActiveWebTabPillNode", () => ({
  $removeActiveWebTabPills: jest.fn(),
}));

jest.mock("./pills/WebTabPillNode", () => ({
  $findWebTabPills: jest.fn(() => []),
  $removeWebTabPillsByUrl: jest.fn(),
}));

jest.mock("./LexicalEditor", () => ({
  __esModule: true,
  default: ({ value, placeholder }: any) => (
    <div data-testid="lexical-editor" data-placeholder={placeholder}>
      {value}
    </div>
  ),
}));

jest.mock("lexical", () => ({
  $getSelection: jest.fn(() => null),
  $isRangeSelection: jest.fn(() => false),
}));

jest.mock("lucide-react", () => ({
  ArrowUp: () => <span data-testid="send-icon" />,
  FileText: () => <span data-testid="file-icon" />,
  Image: () => <span data-testid="image-icon" />,
  Loader2: () => <span data-testid="loader-icon" />,
  Paperclip: () => <span data-testid="paperclip-icon" />,
  Save: () => <span data-testid="save-icon" />,
  Square: () => <span data-testid="stop-icon" />,
  X: () => <span data-testid="remove-icon" />,
}));

jest.mock("obsidian", () => ({
  Notice: jest.fn(),
  TFile: class {},
}));

describe("ChatInput command-center surface", () => {
  const app = {
    vault: {
      getAbstractFileByPath: jest.fn(() => null),
    },
    workspace: {
      getActiveFile: jest.fn(() => null),
      on: jest.fn(() => "workspace-ref"),
      offref: jest.fn(),
    },
  } as any;

  const baseProps = {
    inputMessage: "Summarize this note",
    setInputMessage: jest.fn(),
    handleSendMessage: jest.fn(),
    isGenerating: false,
    onStopGenerating: jest.fn(),
    app,
    contextNotes: [],
    setContextNotes: jest.fn(),
    includeActiveNote: false,
    setIncludeActiveNote: jest.fn(),
    includeActiveWebTab: false,
    setIncludeActiveWebTab: jest.fn(),
    activeWebTab: null,
    selectedFiles: [],
    onAddFile: jest.fn(),
    setSelectedFiles: jest.fn(),
    selectedTextContexts: [],
    onRemoveSelectedText: jest.fn(),
    showProgressCard: jest.fn(),
    showIndexingCard: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentProject.mockReturnValue(null);
    mockSubscribeToProjectChange.mockReturnValue(jest.fn());
    mockUseChainPresetId.mockReturnValue(["chat", jest.fn()]);
    mockUseModelKey.mockReturnValue(["gpt-4.1-mini", jest.fn()]);
    mockUseProjectLoading.mockReturnValue([false]);
  });

  it("renders the command-center affordances when the command-center surface is enabled", () => {
    const { container } = render(
      React.createElement(ChatInput as any, {
        ...baseProps,
        surface: "command-center",
      })
    );

    expect((container.firstChild as HTMLElement)?.getAttribute("data-surface")).toBe(
      "command-center"
    );
    expect(screen.getByTestId("model-selector")).toBeTruthy();
    expect(screen.getByTestId("paperclip-icon")).toBeTruthy();
    expect(screen.getByTestId("send-icon")).toBeTruthy();
  });

  it("keeps the default surface affordances unchanged", () => {
    render(<ChatInput {...baseProps} />);

    expect(screen.getByTestId("model-selector")).toBeTruthy();
    expect(screen.getByTestId("image-icon")).toBeTruthy();
    expect(screen.getByTestId("context-control")).toBeTruthy();
  });

  it.each(["chat", "chat_rag", "agent"] as const)(
    "keeps the global model selectable in %s even when a project is selected",
    (presetId) => {
      mockUseChainPresetId.mockReturnValue([presetId, jest.fn()]);
      mockGetCurrentProject.mockReturnValue({
        id: "project-1",
        name: "Project One",
        projectModelKey: "project-model",
      });

      render(<ChatInput {...baseProps} />);

      const selector = screen.getByTestId("model-selector");
      expect(selector.textContent).toBe("gpt-4.1-mini");
      expect(selector.getAttribute("data-disabled")).toBe("false");
    }
  );

  it("locks the project model only in the project agent preset", () => {
    mockUseChainPresetId.mockReturnValue(["project_agent", jest.fn()]);
    mockGetCurrentProject.mockReturnValue({
      id: "project-1",
      name: "Project One",
      projectModelKey: "project-model",
    });

    render(<ChatInput {...baseProps} />);

    const selector = screen.getByTestId("model-selector");
    expect(selector.textContent).toBe("project-model");
    expect(selector.getAttribute("data-disabled")).toBe("true");
  });
});
