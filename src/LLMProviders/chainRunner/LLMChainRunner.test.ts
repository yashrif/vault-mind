/**
 * Tests for LLMChainRunner multimodal message construction
 * Verifies that the envelope context is correctly merged with image content
 */

// ===== MOCKS =====
jest.mock("@/logger", () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

jest.mock("@/settings/model", () => ({
  getSettings: jest.fn(),
  getModelKey: jest.fn(() => "test-model"),
}));

jest.mock("@/aiParams", () => ({
  getSelectedTextContexts: jest.fn().mockReturnValue([]),
}));

jest.mock("@/chainFactory", () => ({
  ChainType: {
    LLM_CHAIN: "llm_chain",
    TOOL_CHAIN: "copilot_plus_chain",
    PROJECT_CHAIN: "project_chain",
  },
}));

jest.mock("@/contextProcessor", () => ({
  ContextProcessor: {
    getInstance: jest.fn().mockReturnValue({}),
  },
}));

jest.mock("@/mentions/Mention", () => ({
  Mention: {
    getInstance: jest.fn().mockReturnValue({}),
  },
}));

jest.mock("@/context/PromptContextEngine", () => ({
  PromptContextEngine: {
    getInstance: jest.fn().mockReturnValue({
      buildEnvelope: jest.fn((params: any) => {
        // Mock envelope builder for testing
        return {
          version: 1,
          conversationId: null,
          messageId: params.messageId,
          layers: [],
          serializedText: "system prompt context",
          layerHashes: {},
          combinedHash: "test",
        };
      }),
    }),
  },
}));

jest.mock("@/context/LayerToMessagesConverter", () => ({
  LayerToMessagesConverter: {
    convert: jest.fn(() => [
      {
        role: "system",
        content: "You are a helpful assistant.",
      },
      {
        role: "user",
        content: "Full context from envelope including notes and system info",
      },
    ]),
  },
}));

jest.mock("@/LLMProviders/chainRunner/utils/chatHistoryUtils", () => ({
  loadAndAddChatHistory: jest.fn((memory, messages) => {
    // No-op for testing
  }),
}));

jest.mock("@/LLMProviders/chainRunner/utils/ThinkBlockStreamer", () => ({
  ThinkBlockStreamer: jest.fn().mockImplementation(() => ({
    processChunk: jest.fn(),
    close: jest.fn(() => ({ content: "", wasTruncated: false, tokenUsage: null })),
    processErrorChunk: jest.fn(),
  })),
}));

jest.mock("@/utils", () => ({
  withSuppressedTokenWarnings: jest.fn((fn) => fn()),
  findCustomModel: jest.fn(() => ({ capabilities: [] })),
}));

jest.mock("@/LLMProviders/memoryManager", () => ({
  default: jest.fn().mockImplementation(() => ({
    getMemory: jest.fn(() => ({})),
  })),
}));

jest.mock("@/commands/customCommandUtils", () => ({
  processPrompt: jest.fn(),
}));

jest.mock("@/LLMProviders/chainRunner/utils/promptPayloadRecorder", () => ({
  recordPromptPayload: jest.fn(),
}));

// ===== IMPORTS =====
import { LayerToMessagesConverter } from "@/context/LayerToMessagesConverter";
import { LLMChainRunner } from "./LLMChainRunner";
import { ChatMessage } from "@/types/message";

// ===== HELPERS =====

function makeChatMessage(overrides: Record<string, unknown> = {}): ChatMessage {
  return {
    id: "msg-test",
    message: "Test message",
    sender: "user",
    timestamp: { epoch: 0, display: "", fileName: "" },
    isVisible: true,
    ...overrides,
  };
}

function buildMinimalEnvelope() {
  return {
    version: 1,
    conversationId: null,
    messageId: "msg-test",
    layers: [],
    serializedText: "test envelope",
    layerHashes: {},
    combinedHash: "test",
  };
}

// ===== TESTS =====

describe("LLMChainRunner - Multimodal Message Construction", () => {
  let runner: LLMChainRunner;
  let chainManagerMock: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock ChainManager
    chainManagerMock = {
      app: { vault: {} },
      chatModelManager: {
        getChatModel: jest.fn(() => ({
          stream: jest.fn(),
        })),
      },
      memoryManager: {
        getMemory: jest.fn(() => ({})),
      },
    };

    runner = new LLMChainRunner(chainManagerMock);
  });

  describe("constructMessages with text + image", () => {
    it("replaces text item with envelope content while preserving image_url", async () => {
      const userMessage = makeChatMessage({
        content: [
          { type: "text", text: "original text" },
          { type: "image_url", image_url: { url: "data:image/png;base64,abc123" } },
        ],
        contextEnvelope: buildMinimalEnvelope(),
      });

      (LayerToMessagesConverter.convert as jest.Mock).mockReturnValue([
        { role: "system", content: "System prompt" },
        { role: "user", content: "Envelope context text" },
      ]);

      const messages = await (runner as any).constructMessages(userMessage);

      // Should have system message
      expect(messages[0]).toEqual({ role: "system", content: "System prompt" });

      // Should have user message with replaced text + preserved image
      const userMsg = messages.find((m: any) => m.role === "user" && Array.isArray(m.content));
      expect(userMsg).toBeDefined();
      expect(userMsg.content).toHaveLength(2);
      expect(userMsg.content[0]).toEqual({
        type: "text",
        text: "Envelope context text",
      });
      expect(userMsg.content[1]).toEqual({
        type: "image_url",
        image_url: { url: "data:image/png;base64,abc123" },
      });
    });
  });

  describe("constructMessages with image only (no text item)", () => {
    it("injects envelope text as first item when no text item exists", async () => {
      const userMessage = makeChatMessage({
        content: [{ type: "image_url", image_url: { url: "data:image/png;base64,abc123" } }],
        contextEnvelope: buildMinimalEnvelope(),
      });

      (LayerToMessagesConverter.convert as jest.Mock).mockReturnValue([
        { role: "system", content: "System prompt" },
        { role: "user", content: "Envelope context with notes and history" },
      ]);

      const messages = await (runner as any).constructMessages(userMessage);

      // Should have system message
      expect(messages[0]).toEqual({ role: "system", content: "System prompt" });

      // Should have user message with INJECTED text + image
      const userMsg = messages.find((m: any) => m.role === "user" && Array.isArray(m.content));
      expect(userMsg).toBeDefined();
      expect(userMsg.content).toHaveLength(2);
      expect(userMsg.content[0]).toEqual({
        type: "text",
        text: "Envelope context with notes and history",
      });
      expect(userMsg.content[1]).toEqual({
        type: "image_url",
        image_url: { url: "data:image/png;base64,abc123" },
      });
    });

    it("does not inject text if envelope content is empty", async () => {
      const userMessage = makeChatMessage({
        content: [{ type: "image_url", image_url: { url: "data:image/png;base64,abc123" } }],
        contextEnvelope: buildMinimalEnvelope(),
      });

      (LayerToMessagesConverter.convert as jest.Mock).mockReturnValue([
        { role: "system", content: "System prompt" },
        { role: "user", content: "" }, // Empty envelope content
      ]);

      const messages = await (runner as any).constructMessages(userMessage);

      const userMsg = messages.find((m: any) => m.role === "user" && Array.isArray(m.content));
      expect(userMsg.content).toHaveLength(1);
      expect(userMsg.content[0]).toEqual({
        type: "image_url",
        image_url: { url: "data:image/png;base64,abc123" },
      });
    });
  });

  describe("constructMessages with multiple images", () => {
    it("preserves multiple image_url items and injects text", async () => {
      const userMessage = makeChatMessage({
        content: [
          { type: "image_url", image_url: { url: "data:image/png;base64,img1" } },
          { type: "image_url", image_url: { url: "data:image/jpeg;base64,img2" } },
        ],
        contextEnvelope: buildMinimalEnvelope(),
      });

      (LayerToMessagesConverter.convert as jest.Mock).mockReturnValue([
        { role: "system", content: "System prompt" },
        { role: "user", content: "Multi-image context" },
      ]);

      const messages = await (runner as any).constructMessages(userMessage);

      const userMsg = messages.find((m: any) => m.role === "user" && Array.isArray(m.content));
      expect(userMsg.content).toHaveLength(3);
      expect(userMsg.content[0]).toEqual({
        type: "text",
        text: "Multi-image context",
      });
      expect(userMsg.content[1].image_url.url).toContain("img1");
      expect(userMsg.content[2].image_url.url).toContain("img2");
    });
  });

  describe("constructMessages without multimodal content", () => {
    it("passes through non-array content as-is", async () => {
      const userMessage = makeChatMessage({
        content: undefined, // No content array
        contextEnvelope: buildMinimalEnvelope(),
      });

      (LayerToMessagesConverter.convert as jest.Mock).mockReturnValue([
        { role: "system", content: "System prompt" },
        { role: "user", content: "Simple text message" },
      ]);

      const messages = await (runner as any).constructMessages(userMessage);

      // Should have system + user message (string content, not array)
      expect(messages).toHaveLength(2);
      expect(messages[1]).toEqual({
        role: "user",
        content: "Simple text message",
      });
    });
  });
});
