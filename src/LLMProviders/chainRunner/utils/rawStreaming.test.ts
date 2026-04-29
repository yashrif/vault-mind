import { streamRawModelResponse } from "@/LLMProviders/chainRunner/utils/rawStreaming";

jest.mock("@/logger", () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

jest.mock("@/utils", () => ({
  withSuppressedTokenWarnings: jest.fn((fn) => fn()),
}));

describe("streamRawModelResponse", () => {
  it("streams chunks through the current AI message updater", async () => {
    const updateCurrentAiMessage = jest.fn();
    const chatModel = {
      stream: jest.fn(async function* () {
        yield { content: "hello" };
      }),
    };

    const result = await streamRawModelResponse({
      chatModel: chatModel as any,
      messages: [],
      abortController: new AbortController(),
      updateCurrentAiMessage,
      excludeThinking: false,
    });

    expect(updateCurrentAiMessage).toHaveBeenCalledWith(expect.stringContaining("hello"));
    expect(result.content).toContain("hello");
  });
});
