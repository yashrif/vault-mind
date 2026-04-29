const mockProcessMessageContext = jest.fn();
const mockBuildEnvelope = jest.fn((params: any) => {
  const layerSegments: Record<string, any[]> = params.layerSegments ?? {};
  const layers = Object.entries(layerSegments).map(([id, segments]) => ({
    id,
    label: id,
    text: segments.map((segment) => segment.content).join("\n"),
    stable: false,
    segments,
    hash: "test-hash",
  }));

  return {
    version: 1,
    conversationId: params.conversationId ?? null,
    messageId: params.messageId ?? null,
    layers,
    serializedText: layers.map((layer) => layer.text).join("\n"),
    layerHashes: {},
    combinedHash: "test-hash",
  };
});

jest.mock("@/aiParams", () => ({
  getCurrentProject: jest.fn(),
}));

jest.mock("@/LLMProviders/projectManager", () => {
  const mockGetProjectContext = jest.fn();
  return {
    __esModule: true,
    default: {
      instance: {
        getProjectContext: mockGetProjectContext,
      },
    },
    __mockGetProjectContext: mockGetProjectContext,
  };
});

jest.mock("@/settings/model", () => ({
  getSettings: jest.fn(),
}));

jest.mock("@/system-prompts/systemPromptBuilder", () => ({
  getSystemPromptWithMemory: jest.fn(),
  getSystemPrompt: jest.fn(),
  getEffectiveUserPrompt: jest.fn(),
}));

jest.mock("@/commands/customCommandUtils", () => ({
  processPrompt: jest.fn(),
}));

jest.mock("@/context/PromptContextEngine", () => ({
  PromptContextEngine: {
    getInstance: jest.fn().mockReturnValue({
      buildEnvelope: (params: unknown) => mockBuildEnvelope(params),
    }),
  },
}));

jest.mock("./ContextManager", () => ({
  ContextManager: {
    getInstance: jest.fn().mockReturnValue({
      processMessageContext: (...args: unknown[]) => mockProcessMessageContext(...args),
    }),
  },
}));

jest.mock("@/logger", () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
}));

import { getCurrentProject } from "@/aiParams";
import { LEGACY_CHAIN_IDS } from "@/runtime/ChainPreset";
import { processPrompt } from "@/commands/customCommandUtils";
import {
  getEffectiveUserPrompt,
  getSystemPrompt,
  getSystemPromptWithMemory,
} from "@/system-prompts/systemPromptBuilder";
import { resolveRuntimeChainPolicy } from "@/runtime/RuntimeChainPolicy";
import { getSettings } from "@/settings/model";
import { ChatMessage } from "@/types/message";
import { TFile, Vault } from "obsidian";
import { MessagePreparationService } from "./MessagePreparationService";

const mockGetProjectContext = jest.requireMock("@/LLMProviders/projectManager")
  .__mockGetProjectContext as jest.Mock;

function createMessage(message = "Please check"): ChatMessage {
  return {
    id: "msg-1",
    message,
    originalMessage: message,
    sender: "user",
    timestamp: null,
    isVisible: true,
  };
}

function createEnvelope(text: string) {
  return {
    version: 1,
    conversationId: null,
    messageId: "msg-1",
    serializedText: text,
    layerHashes: {},
    combinedHash: "test-hash",
    layers: [
      {
        id: "L5_USER",
        label: "User message",
        text,
        stable: false,
        segments: [
          {
            id: "msg-1-user",
            content: text,
            stable: false,
            metadata: { source: "user_input" },
          },
        ],
        hash: "test-hash",
      },
    ],
  };
}

describe("MessagePreparationService runtime policy", () => {
  let service: MessagePreparationService;
  let vault: Vault;
  let activeNote: TFile;

  beforeEach(() => {
    jest.clearAllMocks();

    vault = {} as Vault;
    activeNote = { path: "active.md", basename: "Active Note" } as TFile;
    service = new MessagePreparationService(
      {
        userMemoryManager: {},
      } as any,
      {} as any
    );

    (getSettings as jest.Mock).mockReturnValue({
      enableCustomPromptTemplating: true,
    });
    (getEffectiveUserPrompt as jest.Mock).mockReturnValue("");
    (getSystemPrompt as jest.Mock).mockReturnValue("BASE_SYSTEM");
    (getSystemPromptWithMemory as jest.Mock).mockResolvedValue("BASE_SYSTEM");
    (processPrompt as jest.Mock).mockResolvedValue({
      processedPrompt: "PROCESSED_PROJECT_PROMPT",
      includedFiles: [],
    });
    mockGetProjectContext.mockResolvedValue("PROJECT_CONTEXT");
    mockProcessMessageContext.mockResolvedValue({
      processedContent: "prepared message",
      contextEnvelope: undefined,
    });
  });

  it("adds project prompt blocks from the runtime policy profile instead of legacy chain type", async () => {
    const project = {
      id: "project-1",
      name: "Project",
      systemPrompt: "Project prompt with {activeNote}",
    };
    (getCurrentProject as jest.Mock).mockReturnValue(project);

    await service.prepareMessage({
      message: createMessage("Hello"),
      messageRepo: {} as any,
      legacyChainId: LEGACY_CHAIN_IDS.CHAT,
      vault,
      runtimePolicy: resolveRuntimeChainPolicy("project_agent"),
      includeActiveNote: false,
      activeNote,
    });

    expect(processPrompt).toHaveBeenCalledWith(project.systemPrompt, "", vault, activeNote, true);
    expect(mockGetProjectContext).toHaveBeenCalledWith(project.id);
    expect(mockProcessMessageContext.mock.calls[0][8]).toContain("<project_system_prompt>");
    expect(mockProcessMessageContext.mock.calls[0][8]).toContain("PROJECT_CONTEXT");
  });

  it("passes the runtime prompt profile to the system prompt builder", async () => {
    await service.prepareMessage({
      message: createMessage("Hello"),
      messageRepo: {} as any,
      legacyChainId: LEGACY_CHAIN_IDS.CHAT_RAG,
      vault,
      runtimePolicy: resolveRuntimeChainPolicy("chat_rag"),
      includeActiveNote: false,
      activeNote,
    });

    expect(getSystemPromptWithMemory).toHaveBeenCalledWith(
      expect.anything(),
      "default",
      "chat_rag"
    );
    expect(getSystemPrompt).toHaveBeenCalledWith("default", "chat_rag");
  });

  it("injects Telegram virtual tool markers from policy without mutating the stored message", async () => {
    const message = createMessage("Please check");
    mockProcessMessageContext.mockResolvedValue({
      processedContent: "Please check",
      contextEnvelope: createEnvelope("Please check"),
    });

    const result = await service.prepareMessage({
      message,
      messageRepo: {} as any,
      legacyChainId: LEGACY_CHAIN_IDS.CHAT,
      vault,
      runtimePolicy: resolveRuntimeChainPolicy("telegram"),
      includeActiveNote: false,
      activeNote: null,
    });

    expect(result.preparedMessage.message).toContain("@vault");
    expect(result.preparedMessage.message).toContain("@websearch");
    expect(result.preparedMessage.message).toContain("@composer");
    expect(message.message).toBe("Please check");
  });
});
