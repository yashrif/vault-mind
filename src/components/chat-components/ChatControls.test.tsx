import React from "react";
import { render, screen } from "@testing-library/react";
import { ChainType } from "@/chainFactory";
import { ChatControls } from "@/components/chat-components/ChatControls";
import { useSettingsValue } from "@/settings/model";

jest.mock("@/chainFactory", () => ({
  ChainType: {
    LLM_CHAIN: "llm_chain",
    VAULT_QA_CHAIN: "vault_qa",
    TOOL_CHAIN: "Cortex_plus",
    PROJECT_CHAIN: "project",
    TELEGRAM_CHAIN: "telegram",
  },
}));

jest.mock("@/settings/model", () => ({
  useSettingsValue: jest.fn(),
  updateSetting: jest.fn(),
}));

jest.mock("@/components/chat-components/ChainModeSelector", () => ({
  ChainModeSelector: () => <div data-testid="chain-mode-selector" />,
}));

jest.mock("@/components/chat-components/ChatSettingsPopover", () => ({
  ChatSettingsPopover: () => <div data-testid="chat-settings-popover" />,
}));

jest.mock("@/components/chat-components/ChatHistoryPopover", () => ({
  ChatHistoryPopover: ({ children }: any) => (
    <div data-testid="chat-history-popover">{children}</div>
  ),
}));

jest.mock("@/components/chat-components/TokenCounter", () => ({
  TokenCounter: () => <div data-testid="token-counter" />,
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

jest.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: any) => <div>{children}</div>,
  TooltipTrigger: ({ children }: any) => <div>{children}</div>,
  TooltipContent: ({ children }: any) => <div>{children}</div>,
}));

jest.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect }: any) => (
    <button type="button" onClick={onSelect}>
      {children}
    </button>
  ),
}));

jest.mock("@radix-ui/react-dropdown-menu", () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
}));

jest.mock("lucide-react", () => ({
  AlertTriangle: () => <span />,
  CheckCircle: () => <span />,
  Download: () => <span />,
  FileText: () => <span />,
  History: () => <span />,
  MessageCirclePlus: () => <span />,
  MoreHorizontal: () => <span />,
  RefreshCw: () => <span />,
  Sparkles: () => <span />,
}));

describe("ChatControls Telegram behavior", () => {
  const mockSettings = {
    autosaveChat: false,
    showSuggestedPrompts: false,
    showRelevantNotes: false,
    autoAcceptEdits: false,
  };

  const baseProps = {
    onNewChat: jest.fn(),
    onSaveAsNote: jest.fn(async () => {}),
    onLoadHistory: jest.fn(),
    onModeChange: jest.fn(),
    chatHistory: [],
    onUpdateChatTitle: jest.fn(async () => {}),
    onDeleteChat: jest.fn(async () => {}),
    onLoadChat: jest.fn(async () => {}),
    onOpenSourceFile: jest.fn(async () => {}),
    latestTokenCount: 123,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useSettingsValue as jest.Mock).mockReturnValue(mockSettings);
  });

  it("shows only mode switch and reset in Telegram mode", () => {
    render(<ChatControls {...baseProps} selectedChain={ChainType.TELEGRAM_CHAIN} />);

    expect(screen.getByTestId("chain-mode-selector")).toBeTruthy();
    expect(screen.getByTitle("Reset Telegram Thread")).toBeTruthy();

    expect(screen.queryByTestId("token-counter")).toBeNull();
    expect(screen.queryByTestId("chat-settings-popover")).toBeNull();
    expect(screen.queryByTestId("chat-history-popover")).toBeNull();
    expect(screen.queryByTitle("Save Chat as Note")).toBeNull();
    expect(screen.queryByTitle("Advanced Settings")).toBeNull();
  });

  it("keeps standard controls in non-Telegram mode", () => {
    render(<ChatControls {...baseProps} selectedChain={ChainType.TOOL_CHAIN} />);

    expect(screen.getByTestId("chain-mode-selector")).toBeTruthy();
    expect(screen.getByTitle("New Chat")).toBeTruthy();
    expect(screen.getByTestId("token-counter")).toBeTruthy();
    expect(screen.getByTestId("chat-settings-popover")).toBeTruthy();
    expect(screen.getByTestId("chat-history-popover")).toBeTruthy();
    expect(screen.getByTitle("Save Chat as Note")).toBeTruthy();
    expect(screen.getByTitle("Advanced Settings")).toBeTruthy();
  });
});
