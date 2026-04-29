import React from "react";
import { render, screen } from "@testing-library/react";
import { SuggestedPrompts } from "@/components/chat-components/SuggestedPrompts";

jest.mock("@/aiParams", () => ({
  useChainPresetId: jest.fn(() => ["chat_rag", jest.fn()]),
}));

jest.mock("@/settings/model", () => ({
  useSettingsValue: jest.fn(() => ({
    indexVaultToVectorStore: "always",
  })),
}));

jest.mock("@/constants", () => ({
  VAULT_VECTOR_STORE_STRATEGY: {
    NEVER: "never",
  },
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

jest.mock("@/components/ui/card", () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
}));

jest.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: any) => <div>{children}</div>,
  TooltipTrigger: ({ children }: any) => <div>{children}</div>,
  TooltipContent: ({ children }: any) => <div>{children}</div>,
}));

jest.mock("lucide-react", () => ({
  PlusCircle: () => <span />,
  TriangleAlert: () => <span />,
}));

describe("SuggestedPrompts", () => {
  it("uses the chat_rag preset for vault retrieval messaging", () => {
    render(<SuggestedPrompts onClick={jest.fn()} />);

    expect(screen.getByText(/Vault retrieval is on/i)).toBeTruthy();
    expect(screen.queryByText(/retrieval-based QA/i)).toBeNull();
  });
});
