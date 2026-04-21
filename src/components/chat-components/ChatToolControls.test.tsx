import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChatToolControls } from "@/components/chat-components/ChatToolControls";
import { updateSetting } from "@/settings/model";
import { ChainType } from "@/chainFactory";

jest.mock("@/chainFactory", () => ({
  ChainType: {
    LLM_CHAIN: "llm_chain",
    VAULT_QA_CHAIN: "vault_qa",
    TOOL_CHAIN: "copilot_plus",
    PROJECT_CHAIN: "project",
    TELEGRAM_CHAIN: "telegram",
  },
}));

jest.mock("@/utils", () => ({
  isPlusChain: (chain: string) => chain === "copilot_plus",
}));

jest.mock("@/settings/model", () => ({
  updateSetting: jest.fn(),
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({ children, variant: _variant, size: _size, asChild: _asChild, ...props }: any) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

jest.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: any) => <div>{children}</div>,
  Tooltip: ({ children }: any) => <div>{children}</div>,
  TooltipTrigger: ({ children }: any) => <div>{children}</div>,
  TooltipContent: ({ children }: any) => <div>{children}</div>,
}));

jest.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect, onClick, disabled, ...props }: any) => (
    <button
      type="button"
      disabled={disabled}
      onClick={(event) => {
        if (onSelect) {
          onSelect(event);
        }
        if (onClick) {
          onClick(event);
        }
      }}
      {...props}
    >
      {children}
    </button>
  ),
}));

jest.mock("lucide-react", () => ({
  Database: () => <span data-testid="database-icon" />,
  Globe: () => <span data-testid="globe-icon" />,
  Pen: () => <span data-testid="pen-icon" />,
  Sparkles: () => <span data-testid="sparkles-icon" />,
  Brain: () => <span data-testid="brain-icon" />,
  Wrench: () => <span data-testid="wrench-icon" />,
  Check: () => <span data-testid="check-icon" />,
}));

describe("ChatToolControls autonomous behavior", () => {
  const setVaultToggle = jest.fn();
  const setWebToggle = jest.fn();
  const setComposerToggle = jest.fn();
  const setAutonomousAgentToggle = jest.fn();

  const baseProps = {
    vaultToggle: false,
    setVaultToggle,
    webToggle: false,
    setWebToggle,
    composerToggle: false,
    setComposerToggle,
    autonomousAgentToggle: false,
    setAutonomousAgentToggle,
    currentChain: ChainType.TOOL_CHAIN,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("toggles autonomous mode for non-Telegram chains", () => {
    render(<ChatToolControls {...baseProps} currentChain={ChainType.TOOL_CHAIN} />);

    const autonomousButton = screen.getAllByTestId("brain-icon")[0].closest("button");
    expect(autonomousButton).not.toBeNull();

    fireEvent.click(autonomousButton!);

    expect(setAutonomousAgentToggle).toHaveBeenCalledWith(true);
    expect(updateSetting).toHaveBeenCalledWith("enableAutonomousAgent", true);
  });

  it("does not render tool controls in Telegram chain", () => {
    render(
      <ChatToolControls
        {...baseProps}
        currentChain={ChainType.TELEGRAM_CHAIN}
      />
    );

    expect(screen.queryByTestId("brain-icon")).toBeNull();
    expect(setAutonomousAgentToggle).not.toHaveBeenCalled();
    expect(updateSetting).not.toHaveBeenCalled();
  });
});
