const mockContextProcessor = {
  processContextNotes: jest.fn(),
  processSelectedTextContexts: jest.fn(),
  processContextWebTabs: jest.fn(),
};

const mockMention = {
  processUrlList: jest.fn(),
};

jest.mock("@/aiParams", () => ({
  getSelectedTextContexts: jest.fn().mockReturnValue([]),
}));

jest.mock("@/logger", () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

jest.mock("@/settings/model", () => ({
  getSettings: jest.fn().mockReturnValue({
    autoCompactThreshold: 1000000,
  }),
}));

jest.mock("@/contextProcessor", () => ({
  ContextProcessor: {
    getInstance: jest.fn().mockReturnValue(mockContextProcessor),
  },
}));

jest.mock("@/mentions/Mention", () => ({
  Mention: {
    getInstance: jest.fn().mockReturnValue(mockMention),
  },
}));

jest.mock("@/context/PromptContextEngine", () => ({
  PromptContextEngine: {
    getInstance: jest.fn().mockReturnValue({
      buildEnvelope: jest.fn((params: any) => ({
        version: 1,
        conversationId: null,
        messageId: params.messageId ?? null,
        layers: Object.entries(params.layerSegments ?? {}).map(([id, segments]) => ({
          id,
          label: id,
          text: (segments as any[]).map((segment) => segment.content).join("\n"),
          stable: false,
          segments,
          hash: "test-hash",
        })),
        serializedText: "",
        layerHashes: {},
        combinedHash: "test-hash",
      })),
    }),
  },
}));

jest.mock("@/commands/customCommandUtils", () => ({
  processPrompt: jest.fn().mockResolvedValue({
    processedPrompt: "Hello",
    includedFiles: [],
  }),
}));

jest.mock("./ContextCompactor", () => ({}));

import { LEGACY_CHAIN_IDS } from "@/runtime/ChainPreset";
import { resolveRuntimeChainPolicy } from "@/runtime/RuntimeChainPolicy";
import { ChatMessage } from "@/types/message";
import { TFile, Vault } from "obsidian";
import { ContextManager } from "./ContextManager";

describe("ContextManager runtime policy", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockContextProcessor.processContextNotes.mockResolvedValue("");
    mockContextProcessor.processSelectedTextContexts.mockReturnValue("");
    mockContextProcessor.processContextWebTabs.mockResolvedValue("");
    mockMention.processUrlList.mockResolvedValue({ urlContext: "", imageUrls: [] });
  });

  it("suppresses active-note context from project runtime policy regardless of legacy chain type", async () => {
    const message: ChatMessage = {
      id: "msg-1",
      message: "Hello",
      originalMessage: "Hello",
      sender: "user",
      timestamp: null,
      isVisible: true,
      context: {
        notes: [],
        urls: [],
      },
    };
    const activeNote = { path: "active.md", basename: "Active Note" } as TFile;
    const messageRepo = {
      getDisplayMessages: jest.fn().mockReturnValue([message]),
    };

    await ContextManager.getInstance().processMessageContext(
      message,
      {} as any,
      {} as Vault,
      LEGACY_CHAIN_IDS.CHAT,
      resolveRuntimeChainPolicy("project_agent"),
      true,
      activeNote,
      messageRepo as any
    );

    expect(mockContextProcessor.processContextNotes).toHaveBeenCalled();
    expect(mockContextProcessor.processContextNotes.mock.calls[0][3]).toEqual([]);
    expect(mockContextProcessor.processContextNotes.mock.calls[0][4]).toBe(false);
  });
});
