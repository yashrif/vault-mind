import { buildRunnerMessages } from "@/LLMProviders/chainRunner/utils/runnerMessages";
import { ChatMessage } from "@/types/message";

jest.mock("@/context/LayerToMessagesConverter", () => ({
  LayerToMessagesConverter: {
    convert: jest.fn(() => [
      { role: "system", content: "System prompt" },
      { role: "user", content: "Envelope user text" },
    ]),
  },
}));

jest.mock("@/LLMProviders/chainRunner/utils/chatHistoryUtils", () => ({
  loadAndAddChatHistory: jest.fn(async (_memory, messages) => {
    messages.push({ role: "assistant", content: "Previous answer" });
  }),
}));

const makeUserMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage =>
  ({
    id: "msg-test",
    message: "Test",
    sender: "user",
    timestamp: { epoch: 0, display: "", fileName: "" },
    isVisible: true,
    contextEnvelope: {
      version: 1,
      conversationId: null,
      messageId: "msg-test",
      layers: [],
      serializedText: "serialized",
      layerHashes: {},
      combinedHash: "hash",
    },
    ...overrides,
  }) as ChatMessage;

describe("buildRunnerMessages", () => {
  it("places the system message first and current user message last", async () => {
    const messages = await buildRunnerMessages({
      userMessage: makeUserMessage(),
      memory: {
        getMemory: jest.fn(() => ({})),
      } as any,
      includeSystemMessage: true,
      buildMultimodalContent: async (text) => text,
    });

    expect(messages[0].role).toBe("system");
    expect(messages[messages.length - 1].role).toBe("user");
    expect(messages[messages.length - 1].content).toBe("Envelope user text");
  });

  it("allows callers to merge envelope text into multimodal content", async () => {
    const messages = await buildRunnerMessages({
      userMessage: makeUserMessage({
        content: [{ type: "image_url", image_url: { url: "data:image/png;base64,abc123" } }],
      }),
      memory: {
        getMemory: jest.fn(() => ({})),
      } as any,
      includeSystemMessage: true,
      buildMultimodalContent: async (text, userMessage) => [
        { type: "text", text },
        ...(userMessage.content as any[]),
      ],
    });

    expect(messages[messages.length - 1].content).toEqual([
      { type: "text", text: "Envelope user text" },
      { type: "image_url", image_url: { url: "data:image/png;base64,abc123" } },
    ]);
  });
});
