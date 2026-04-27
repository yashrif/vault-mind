// Mock heavy dependencies before any imports
jest.mock("@/settings/model", () => ({
  getSettings: jest.fn().mockReturnValue({ contextTurns: 5 }),
  subscribeToSettingsChange: jest.fn().mockReturnValue(() => undefined),
}));

jest.mock("@/context/ChatHistoryCompactor", () => ({
  compactAssistantOutput: jest.fn((output: string) => output),
}));

jest.mock("@langchain/classic/memory", () => {
  const mockSaveContext = jest.fn().mockResolvedValue(undefined);
  const mockClear = jest.fn().mockResolvedValue(undefined);
  const mockLoadMemoryVariables = jest.fn().mockResolvedValue({ history: [] });

  const MockBufferWindowMemory = jest.fn().mockImplementation(() => ({
    saveContext: mockSaveContext,
    clear: mockClear,
    loadMemoryVariables: mockLoadMemoryVariables,
    chatHistory: undefined,
  }));

  return {
    BaseChatMemory: class {},
    BufferWindowMemory: MockBufferWindowMemory,
    __mockSaveContext: mockSaveContext,
  };
});

jest.mock("@langchain/core/chat_history", () => ({
  BaseChatMessageHistory: class {},
}));

import MemoryManager from "./memoryManager";
import { compactAssistantOutput } from "@/context/ChatHistoryCompactor";
import { serializeReasoningPayload } from "@/core/reasoning";
import type { ReasoningPayload } from "@/core/reasoning";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Retrieve the mock saveContext function from the BufferWindowMemory mock.
 */
function getMockSaveContext(): jest.Mock {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { __mockSaveContext } = require("@langchain/classic/memory");
  return __mockSaveContext as jest.Mock;
}

const minimalPayload: ReasoningPayload = {
  version: 1,
  source: "chat",
  status: "complete",
  elapsedSeconds: 2.5,
  items: [
    {
      id: "r1",
      kind: "transcript",
      summary: "Thinking about the answer",
      state: "done",
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MemoryManager.saveContext — reasoning marker stripping", () => {
  let manager: MemoryManager;
  let mockSaveContext: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    // Make compactAssistantOutput pass through the string unchanged for easy assertion
    (compactAssistantOutput as jest.Mock).mockImplementation((output: string) => output);
    manager = MemoryManager.createIsolated();
    mockSaveContext = getMockSaveContext();
  });

  afterEach(() => {
    manager.dispose();
  });

  it("strips a CORTEX_REASONING marker from string output before saving to memory", async () => {
    const marker = serializeReasoningPayload(minimalPayload);
    const outputWithMarker = `${marker}\nThis is the actual response.`;

    await manager.saveContext({ input: "User question" }, outputWithMarker);

    expect(mockSaveContext).toHaveBeenCalledTimes(1);
    const savedOutput: string = mockSaveContext.mock.calls[0][1] as string;
    expect(savedOutput).not.toContain("CORTEX_REASONING");
    expect(savedOutput).toContain("This is the actual response.");
  });

  it("strips a legacy <think> tag from string output before saving to memory", async () => {
    const outputWithThink = "<think>internal reasoning here</think> Final answer.";

    await manager.saveContext({ input: "User question" }, outputWithThink);

    expect(mockSaveContext).toHaveBeenCalledTimes(1);
    const savedOutput: string = mockSaveContext.mock.calls[0][1] as string;
    expect(savedOutput).not.toContain("<think>");
    expect(savedOutput).not.toContain("</think>");
    expect(savedOutput).toContain("Final answer.");
  });

  it("passes normal string output through unchanged", async () => {
    const normalOutput = "This is a plain answer with no markers.";

    await manager.saveContext({ input: "User question" }, normalOutput);

    expect(mockSaveContext).toHaveBeenCalledTimes(1);
    const savedOutput: string = mockSaveContext.mock.calls[0][1] as string;
    expect(savedOutput).toBe(normalOutput);
  });

  it("strips CORTEX_REASONING from object output (output.output field)", async () => {
    const marker = serializeReasoningPayload(minimalPayload);
    const objectOutput = {
      output: `${marker}\nAssistant reply text.`,
    };

    await manager.saveContext({ input: "User question" }, objectOutput);

    expect(mockSaveContext).toHaveBeenCalledTimes(1);
    const savedOutput = mockSaveContext.mock.calls[0][1] as { output: string };
    expect(savedOutput.output).not.toContain("CORTEX_REASONING");
    expect(savedOutput.output).toContain("Assistant reply text.");
  });

  it("strips legacy <think> from object output (output.output field)", async () => {
    const objectOutput = {
      output: "<think>some reasoning</think> Object-based response.",
    };

    await manager.saveContext({ input: "User question" }, objectOutput);

    expect(mockSaveContext).toHaveBeenCalledTimes(1);
    const savedOutput = mockSaveContext.mock.calls[0][1] as { output: string };
    expect(savedOutput.output).not.toContain("<think>");
    expect(savedOutput.output).toContain("Object-based response.");
  });

  it("calls compactAssistantOutput AFTER stripping reasoning markers", async () => {
    const marker = serializeReasoningPayload(minimalPayload);
    const outputWithMarker = `${marker} Response text.`;

    let capturedInput: string | undefined;
    (compactAssistantOutput as jest.Mock).mockImplementation((s: string) => {
      capturedInput = s;
      return s;
    });

    await manager.saveContext({ input: "User question" }, outputWithMarker);

    // compactAssistantOutput must have received already-stripped text
    expect(capturedInput).not.toContain("CORTEX_REASONING");
    expect(capturedInput).toContain("Response text.");
  });

  it("removes marker-only output, leaving an empty string in memory", async () => {
    const marker = serializeReasoningPayload(minimalPayload);

    await manager.saveContext({ input: "User question" }, marker);

    expect(mockSaveContext).toHaveBeenCalledTimes(1);
    const savedOutput: string = mockSaveContext.mock.calls[0][1] as string;
    expect(savedOutput).toBe("");
  });
});
