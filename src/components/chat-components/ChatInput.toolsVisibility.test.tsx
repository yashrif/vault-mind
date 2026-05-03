import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import ChatInput from "@/components/chat-components/ChatInput";
import type { ChainPresetId } from "@/runtime/ChainPreset";

const mockUseChainPresetId = jest.fn();
const mockUseModelKey = jest.fn();
const mockUseProjectLoading = jest.fn();
const mockGetCurrentProject = jest.fn();
const mockSubscribeToProjectChange = jest.fn();

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
  isImageFile: () => false,
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

jest.mock("@/components/ui/ModelSelector", () => ({
  ModelSelector: () => <div data-testid="model-selector" />,
}));

jest.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: any) => <>{children}</>,
  Tooltip: ({ children }: any) => <>{children}</>,
  TooltipTrigger: ({ children }: any) => <>{children}</>,
  TooltipContent: ({ children }: any) => <>{children}</>,
}));

jest.mock("@/components/chat-components/ChainModeSelector", () => ({
  ChainModeSelector: () => <div data-testid="chain-mode-selector" />,
}));

jest.mock("@/utils/urlNormalization", () => ({
  mergeWebTabContexts: (tabs: any[]) => tabs,
  normalizeUrlString: (value: string) => value,
  normalizeWebTabContext: (value: any) => value,
}));

jest.mock("@/utils", () => ({
  isAllowedFileForNoteContext: () => false,
}));

jest.mock("lucide-react", () => ({
  ArrowUp: () => <span data-testid="icon-arrow-up" />,
  FileText: () => <span data-testid="icon-file-text" />,
  Image: () => <span data-testid="icon-image" />,
  Loader2: () => <span data-testid="icon-loader" />,
  Paperclip: () => <span data-testid="icon-paperclip" />,
  Save: () => <span data-testid="icon-save" />,
  Square: () => <span data-testid="icon-square" />,
  X: () => <span data-testid="icon-x" />,
}));

jest.mock("lexical", () => ({
  $getSelection: () => null,
  $isRangeSelection: () => false,
}));

jest.mock("@/components/chat-components/ContextControl", () => ({
  ContextControl: () => <div data-testid="context-control" />,
}));

jest.mock("@/components/chat-components/pills/NotePillNode", () => ({
  $removePillsByPath: jest.fn(),
}));

jest.mock("@/components/chat-components/pills/ActiveNotePillNode", () => ({
  $removeActiveNotePills: jest.fn(),
}));

jest.mock("@/components/chat-components/pills/URLPillNode", () => ({
  $removePillsByURL: jest.fn(),
}));

jest.mock("@/components/chat-components/pills/FolderPillNode", () => ({
  $removePillsByFolder: jest.fn(),
}));

jest.mock("@/components/chat-components/pills/ToolPillNode", () => ({
  $removePillsByToolName: jest.fn(),
  $createToolPillNode: jest.fn(),
}));

jest.mock("@/components/chat-components/pills/ActiveWebTabPillNode", () => ({
  $removeActiveWebTabPills: jest.fn(),
}));

jest.mock("@/components/chat-components/pills/WebTabPillNode", () => ({
  $findWebTabPills: () => [],
  $removeWebTabPillsByUrl: jest.fn(),
}));

jest.mock("@/components/chat-components/LexicalEditor", () => ({
  __esModule: true,
  default: (() => {
    const MockLexicalEditor = React.forwardRef((_props: any, _ref) => (
      <div data-testid="lexical-editor" />
    ));
    MockLexicalEditor.displayName = "MockLexicalEditor";
    return MockLexicalEditor;
  })(),
}));

jest.mock("@/components/chat-components/tools/ChatToolsPopover", () => ({
  ChatToolsPopover: () => <div data-testid="chat-tools-popover" />,
}));

jest.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

describe("ChatInput tools visibility", () => {
  const baseProps = {
    inputMessage: "hello",
    setInputMessage: jest.fn(),
    handleSendMessage: jest.fn(),
    isGenerating: false,
    onStopGenerating: jest.fn(),
    app: {
      workspace: {
        getActiveFile: () => null,
        on: () => ({ id: "active-leaf-change-listener" }),
        offref: jest.fn(),
      },
    } as any,
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
    showProgressCard: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseModelKey.mockReturnValue(["gpt-4", jest.fn()]);
    mockUseProjectLoading.mockReturnValue([false]);
    mockGetCurrentProject.mockReturnValue(null);
    mockSubscribeToProjectChange.mockReturnValue(jest.fn());
  });

  function renderForPreset(presetId: ChainPresetId) {
    mockUseChainPresetId.mockReturnValue([presetId, jest.fn()]);
    render(<ChatInput {...baseProps} />);
  }

  it("shows the tools popover in plain Chat and global Agent", () => {
    renderForPreset("chat");
    expect(screen.getByTestId("chat-tools-popover")).toBeTruthy();

    cleanup();
    renderForPreset("agent");
    expect(screen.getByTestId("chat-tools-popover")).toBeTruthy();
  });

  it("hides the tools popover in Chat + RAG and Project Agent", () => {
    renderForPreset("chat_rag");
    expect(screen.queryByTestId("chat-tools-popover")).toBeNull();

    cleanup();
    renderForPreset("project_agent");
    expect(screen.queryByTestId("chat-tools-popover")).toBeNull();
  });
});
