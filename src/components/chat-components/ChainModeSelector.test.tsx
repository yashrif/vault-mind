import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChainModeSelector } from "@/components/chat-components/ChainModeSelector";

const mockSetMode = jest.fn();
const mockSetScope = jest.fn();
const mockSetRetrieval = jest.fn();

jest.mock("@/aiParams", () => ({
  deriveChainPresetId: jest.fn((_mode: string, _scope: string, retrieval: string) =>
    retrieval === "vault_auto" ? "chat_rag" : "chat"
  ),
  setCurrentProject: jest.fn(),
  useMode: jest.fn(() => ["chat", mockSetMode]),
  useScope: jest.fn(() => ["global", mockSetScope]),
  useRetrievalPolicy: jest.fn(() => ["none", mockSetRetrieval]),
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

jest.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect }: any) => (
    <button type="button" onClick={onSelect}>
      {children}
    </button>
  ),
}));

jest.mock("@/components/chat-components/ProjectScopePopover", () => ({
  ProjectScopePopover: () => <div data-testid="project-scope-popover" />,
}));

jest.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

jest.mock("lucide-react", () => ({
  Bot: () => <span />,
  ChevronDown: () => <span />,
  Database: () => <span />,
  MessageCircle: () => <span />,
}));

describe("ChainModeSelector", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("emits the chat_rag preset when vault retrieval is enabled", () => {
    const onSelectChain = jest.fn();

    render(<ChainModeSelector onSelectChain={onSelectChain} />);
    fireEvent.click(screen.getByTitle("Vault retrieval off — click to turn on"));

    expect(mockSetRetrieval).toHaveBeenCalledWith("vault_auto");
    expect(onSelectChain).toHaveBeenCalledWith("chat_rag");
  });
});
