import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChatToolControls } from "@/components/chat-components/ChatToolControls";
import { updateSetting } from "@/settings/model";

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

  const baseProps = {
    vaultToggle: false,
    setVaultToggle,
    webToggle: false,
    setWebToggle,
    composerToggle: false,
    setComposerToggle,
    presetId: "agent" as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders manual tool toggles without the legacy autonomous switch", () => {
    render(<ChatToolControls {...baseProps} presetId="agent" />);

    expect(screen.queryByTestId("brain-icon")).toBeNull();

    const vaultButton = screen.getByText("Vault Search").closest("button");
    expect(vaultButton).not.toBeNull();

    fireEvent.click(vaultButton!);

    expect(setVaultToggle).toHaveBeenCalledWith(true);
    expect(updateSetting).not.toHaveBeenCalled();
  });

  it("renders one wrench popover with active count for real supported tools only", () => {
    render(
      <ChatToolControls
        {...baseProps}
        vaultToggle={true}
        webToggle={true}
        composerToggle={false}
        presetId="agent"
      />
    );

    expect(screen.getByTitle("Tools")).toBeTruthy();
    expect(screen.getByTestId("active-tool-count").textContent).toBe("2");
    expect(screen.getByText("Vault Search")).toBeTruthy();
    expect(screen.getByText("Web Search")).toBeTruthy();
    expect(screen.getByText("Composer")).toBeTruthy();
    expect(screen.queryByText("Smart Search")).toBeNull();
  });

  it("calls the toggle-off callback when an active tool is unchecked", () => {
    const onVaultToggleOff = jest.fn();

    render(
      <ChatToolControls
        {...baseProps}
        vaultToggle={true}
        onVaultToggleOff={onVaultToggleOff}
        presetId="agent"
      />
    );

    const vaultButton = screen.getByText("Vault Search").closest("button");
    expect(vaultButton).not.toBeNull();

    fireEvent.click(vaultButton!);

    expect(setVaultToggle).toHaveBeenCalledWith(false);
    expect(onVaultToggleOff).toHaveBeenCalled();
  });

  it("does not render tool controls in Telegram chain", () => {
    render(<ChatToolControls {...baseProps} presetId="telegram" />);

    expect(screen.queryByTestId("brain-icon")).toBeNull();
    expect(updateSetting).not.toHaveBeenCalled();
  });
});
