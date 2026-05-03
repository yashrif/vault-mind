import {
  buildToolCallsFromChunks,
  accumulateToolCallChunk,
  ToolCallChunk,
} from "./utils/nativeToolCalling";
import { AutonomousAgentChainRunner } from "./AutonomousAgentChainRunner";
import { resolveRuntimeChainPolicy } from "@/runtime/RuntimeChainPolicy";
import { ChatMessage } from "@/types/message";
import { getPromptProfileInstructions } from "@/system-prompts/systemPromptBuilder";
import { ABORT_REASON } from "@/constants";
import { parseReasoningMessage, ReasoningStep } from "./utils/AgentReasoningState";
import { ToolRegistry } from "@/tools/ToolRegistry";

const mockToolRegistry = {
  getAllTools: jest.fn(() => []),
  getEnabledTools: jest.fn(() => []),
  getToolMetadata: jest.fn(() => undefined),
};

jest.mock("@/logger", () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarn: jest.fn(),
}));

jest.mock("@/settings/model", () => ({
  getSettings: jest.fn(() => ({
    autonomousAgentMaxIterations: 1,
    enableInlineCitations: true,
  })),
}));

jest.mock("@/aiParams", () => ({}));

jest.mock("@/tools/builtinTools", () => ({
  initializeBuiltinTools: jest.fn(),
}));

jest.mock("@/tools/SearchTools", () => ({
  localSearchTool: { name: "localSearch" },
  webSearchTool: { name: "webSearch" },
}));

jest.mock("@/tools/ComposerTools", () => ({
  writeFileTool: { name: "writeFile" },
}));

jest.mock("@/tools/memoryTools", () => ({
  updateMemoryTool: { name: "updateMemory" },
}));

jest.mock("@/tools/toolManager", () => ({
  ToolManager: {
    callTool: jest.fn(),
  },
}));

jest.mock("@/LLMProviders/projectManager", () => ({
  __esModule: true,
  default: {
    getInstance: jest.fn(() => ({})),
  },
}));

jest.mock("@/tools/ToolRegistry", () => ({
  ToolRegistry: {
    getInstance: jest.fn(() => mockToolRegistry),
  },
}));

jest.mock("@/context/LayerToMessagesConverter", () => ({
  LayerToMessagesConverter: {
    convert: jest.fn(() => [
      { role: "system", content: "System prompt" },
      { role: "user", content: "User prompt" },
    ]),
  },
}));

jest.mock("@/LLMProviders/chainRunner/utils/chatHistoryUtils", () => ({
  loadAndAddChatHistory: jest.fn(async () => undefined),
}));

jest.mock("@/LLMProviders/chainRunner/utils/promptPayloadRecorder", () => ({
  recordPromptPayload: jest.fn(),
}));

jest.mock("@/utils", () => ({
  err2String: jest.fn((error) => error?.message ?? String(error)),
  formatDateTime: jest.fn(() => ({ epoch: 0, display: "", fileName: "" })),
  withSuppressedTokenWarnings: jest.fn((fn) => fn()),
}));

/**
 * Test suite for Gemini tool call name extraction fix (Issue #2233)
 *
 * Root cause: Gemini's @langchain/google-genai nests tool call names inside
 * `functionCall.name` instead of at the top level `name` property. Without
 * the fallback, all Gemini tool call names are empty, causing
 * buildToolCallsFromChunks to skip them → treated as "no tool calls" →
 * empty response since thinking tokens were filtered.
 */
describe("accumulateToolCallChunk", () => {
  describe("OpenAI-format chunks (top-level name)", () => {
    it("should accumulate name from top-level tc.name", () => {
      const chunks = new Map<number, ToolCallChunk>();

      accumulateToolCallChunk(chunks, {
        index: 0,
        id: "call_123",
        name: "localSearch",
        args: '{"query":',
      });
      accumulateToolCallChunk(chunks, {
        index: 0,
        args: '"test"}',
      });

      const result = chunks.get(0)!;
      expect(result.name).toBe("localSearch");
      expect(result.id).toBe("call_123");
      expect(result.args).toBe('{"query":"test"}');
    });

    it("should handle multiple concurrent tool calls", () => {
      const chunks = new Map<number, ToolCallChunk>();

      accumulateToolCallChunk(chunks, { index: 0, name: "localSearch", args: '{"q":"a"}' });
      accumulateToolCallChunk(chunks, { index: 1, name: "readNote", args: '{"path":"b"}' });

      expect(chunks.get(0)!.name).toBe("localSearch");
      expect(chunks.get(1)!.name).toBe("readNote");
    });
  });

  describe("Gemini-format chunks (name in functionCall)", () => {
    it("should extract name from functionCall.name when top-level name is missing", () => {
      const chunks = new Map<number, ToolCallChunk>();

      // Gemini sends chunks with functionCall.name instead of top-level name
      accumulateToolCallChunk(chunks, {
        index: 0,
        id: "call_456",
        functionCall: { name: "localSearch" },
        args: '{"query":"test"}',
      });

      const result = chunks.get(0)!;
      expect(result.name).toBe("localSearch");
      expect(result.id).toBe("call_456");
      expect(result.args).toBe('{"query":"test"}');
    });

    it("should handle multiple Gemini tool calls", () => {
      const chunks = new Map<number, ToolCallChunk>();

      accumulateToolCallChunk(chunks, {
        index: 0,
        functionCall: { name: "localSearch" },
        args: '{"query":"piano"}',
      });
      accumulateToolCallChunk(chunks, {
        index: 1,
        functionCall: { name: "readNote" },
        args: '{"path":"notes/music.md"}',
      });

      expect(chunks.get(0)!.name).toBe("localSearch");
      expect(chunks.get(1)!.name).toBe("readNote");
    });

    it("should prefer top-level name over functionCall.name", () => {
      const chunks = new Map<number, ToolCallChunk>();

      accumulateToolCallChunk(chunks, {
        index: 0,
        name: "topLevel",
        functionCall: { name: "nested" },
        args: "{}",
      });

      // Top-level name takes priority via nullish coalescing (??)
      expect(chunks.get(0)!.name).toBe("topLevel");
    });
  });

  describe("Edge cases", () => {
    it("should default index to 0 when not provided", () => {
      const chunks = new Map<number, ToolCallChunk>();

      accumulateToolCallChunk(chunks, { name: "localSearch", args: "{}" });

      expect(chunks.has(0)).toBe(true);
      expect(chunks.get(0)!.name).toBe("localSearch");
    });

    it("should handle chunk with no name at all", () => {
      const chunks = new Map<number, ToolCallChunk>();

      accumulateToolCallChunk(chunks, { index: 0, args: '{"query":"test"}' });

      expect(chunks.get(0)!.name).toBe("");
      expect(chunks.get(0)!.args).toBe('{"query":"test"}');
    });

    it("should accumulate args across multiple chunks", () => {
      const chunks = new Map<number, ToolCallChunk>();

      accumulateToolCallChunk(chunks, { index: 0, name: "localSearch", args: '{"qu' });
      accumulateToolCallChunk(chunks, { index: 0, args: 'ery":' });
      accumulateToolCallChunk(chunks, { index: 0, args: '"test"}' });

      expect(chunks.get(0)!.args).toBe('{"query":"test"}');
    });
  });
});

describe("buildToolCallsFromChunks", () => {
  it("should build tool calls from properly accumulated chunks", () => {
    const chunks = new Map<number, ToolCallChunk>();
    chunks.set(0, { id: "call_1", name: "localSearch", args: '{"query":"test"}' });

    const result = buildToolCallsFromChunks(chunks);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("localSearch");
    expect(result[0].args).toEqual({ query: "test" });
    expect(result[0].id).toBe("call_1");
  });

  it("should skip chunks with no name (the bug this fix addresses)", () => {
    const chunks = new Map<number, ToolCallChunk>();
    // This is what happened before the fix: Gemini chunks had no name
    // because the accumulator didn't check functionCall.name
    chunks.set(0, { name: "", args: '{"query":"test"}' });

    const result = buildToolCallsFromChunks(chunks);

    // Empty name → skipped → no tool calls → treated as final response
    expect(result).toHaveLength(0);
  });

  it("should handle multiple tool calls", () => {
    const chunks = new Map<number, ToolCallChunk>();
    chunks.set(0, { id: "call_1", name: "localSearch", args: '{"query":"piano"}' });
    chunks.set(1, { id: "call_2", name: "readNote", args: '{"path":"notes/music.md"}' });

    const result = buildToolCallsFromChunks(chunks);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("localSearch");
    expect(result[1].name).toBe("readNote");
  });

  it("should generate an ID when chunk has no id", () => {
    const chunks = new Map<number, ToolCallChunk>();
    chunks.set(0, { name: "localSearch", args: '{"query":"test"}' });

    const result = buildToolCallsFromChunks(chunks);

    expect(result).toHaveLength(1);
    expect(result[0].id).toMatch(/^call_/);
  });

  it("should handle malformed JSON args gracefully", () => {
    const chunks = new Map<number, ToolCallChunk>();
    chunks.set(0, { name: "localSearch", args: "not valid json" });

    const result = buildToolCallsFromChunks(chunks);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("localSearch");
    expect(result[0].args).toEqual({});
  });

  it("should handle empty args", () => {
    const chunks = new Map<number, ToolCallChunk>();
    chunks.set(0, { name: "localSearch", args: "" });

    const result = buildToolCallsFromChunks(chunks);

    expect(result).toHaveLength(1);
    expect(result[0].args).toEqual({});
  });
});

describe("End-to-end: Gemini streaming → buildToolCallsFromChunks", () => {
  it("should correctly process Gemini-format chunks through the full pipeline", () => {
    const chunks = new Map<number, ToolCallChunk>();

    // Simulate Gemini streaming: name comes via functionCall, not top-level
    accumulateToolCallChunk(chunks, {
      index: 0,
      id: "call_gemini_1",
      functionCall: { name: "localSearch" },
      args: '{"query":"piano notes"}',
    });

    const result = buildToolCallsFromChunks(chunks);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("localSearch");
    expect(result[0].args).toEqual({ query: "piano notes" });
  });

  it("should correctly process OpenAI-format chunks through the full pipeline", () => {
    const chunks = new Map<number, ToolCallChunk>();

    // Simulate OpenAI streaming: name at top level
    accumulateToolCallChunk(chunks, {
      index: 0,
      id: "call_openai_1",
      name: "localSearch",
      args: '{"query":"piano notes"}',
    });

    const result = buildToolCallsFromChunks(chunks);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("localSearch");
    expect(result[0].args).toEqual({ query: "piano notes" });
  });

  it("should handle sequential Gemini tool calls (the failing scenario)", () => {
    const chunks = new Map<number, ToolCallChunk>();

    // This is the exact scenario that was failing:
    // Gemini 3.1 Pro returns 2 sequential tool calls, but names were dropped
    accumulateToolCallChunk(chunks, {
      index: 0,
      id: "call_g1",
      functionCall: { name: "localSearch" },
      args: '{"query":"search term"}',
    });
    accumulateToolCallChunk(chunks, {
      index: 1,
      id: "call_g2",
      functionCall: { name: "readNote" },
      args: '{"path":"some/note.md"}',
    });

    const result = buildToolCallsFromChunks(chunks);

    // Both tool calls should be preserved — before the fix, both were dropped
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("localSearch");
    expect(result[1].name).toBe("readNote");
  });
});

describe("AutonomousAgentChainRunner preset routing", () => {
  let chatModel: any;
  let runner: AutonomousAgentChainRunner;
  let userMessage: ChatMessage;
  let abortController: AbortController;
  let updateCurrentAiMessage: jest.Mock;
  let addMessage: jest.Mock;

  beforeEach(() => {
    mockToolRegistry.getAllTools.mockReturnValue([]);
    mockToolRegistry.getEnabledTools.mockReturnValue([]);
    mockToolRegistry.getToolMetadata.mockReset();
    mockToolRegistry.getToolMetadata.mockReturnValue(undefined);
    chatModel = {
      modelName: "test-model",
      bindTools: jest.fn(() => ({
        stream: jest.fn(async function* () {
          yield { content: "tool answer" };
        }),
      })),
      stream: jest.fn(async function* () {
        yield { content: "hello" };
      }),
    };
    const memory = {
      chatHistory: { messages: [] },
    };
    runner = new AutonomousAgentChainRunner({
      app: { vault: {} },
      chatModelManager: {
        getChatModel: jest.fn(() => chatModel),
        findModelByName: jest.fn(() => ({ capabilities: [] })),
      },
      memoryManager: {
        getMemory: jest.fn(() => memory),
        saveContext: jest.fn(),
      },
      userMemoryManager: {},
    } as any);
    userMessage = {
      id: "msg-test",
      message: "Hello",
      originalMessage: "Hello",
      sender: "user",
      timestamp: { epoch: 0, display: "", fileName: "" },
      isVisible: true,
      contextEnvelope: {
        version: 1,
        conversationId: null,
        messageId: "msg-test",
        layers: [{ id: "L5_USER", text: "Hello" }],
        serializedText: "serialized",
        layerHashes: {},
        combinedHash: "hash",
      },
    } as ChatMessage;
    abortController = new AbortController();
    updateCurrentAiMessage = jest.fn();
    addMessage = jest.fn();
  });

  it("uses raw streaming when the preset has no tools", async () => {
    const preset = {
      id: "chat",
      promptProfile: "chat",
      runtimePolicy: resolveRuntimeChainPolicy("chat"),
      tools: [],
    } as any;

    await runner.run(userMessage, abortController, updateCurrentAiMessage, addMessage, {
      preset,
      runtimePolicy: preset.runtimePolicy,
    });

    expect(chatModel.bindTools).not.toHaveBeenCalled();
    expect(chatModel.stream).toHaveBeenCalled();
  });

  it("returns the friendly tool capability error when tools are required but bindTools is unavailable", async () => {
    const preset = {
      id: "chat_rag",
      promptProfile: "chat_rag",
      runtimePolicy: resolveRuntimeChainPolicy("chat_rag"),
      tools: [{ name: "localSearch" }],
    } as any;

    delete chatModel.bindTools;

    const result = await runner.run(
      userMessage,
      abortController,
      updateCurrentAiMessage,
      addMessage,
      {
        preset,
        runtimePolicy: preset.runtimePolicy,
      }
    );

    expect(result).toContain("This model cannot use tools");
  });

  it("passes L1_SYSTEM profile instructions through to the agent system content without duplication", async () => {
    const profileInstruction = getPromptProfileInstructions("chat_rag");
    const { LayerToMessagesConverter } = await import("@/context/LayerToMessagesConverter");
    (LayerToMessagesConverter.convert as jest.Mock).mockReturnValueOnce([
      { role: "system", content: `Base prompt\n\n${profileInstruction}` },
      { role: "user", content: "User prompt" },
    ]);

    const preset = {
      id: "chat_rag",
      promptProfile: "chat_rag",
      runtimePolicy: resolveRuntimeChainPolicy("chat_rag"),
      tools: [{ name: "localSearch" }],
    } as any;

    await runner.run(userMessage, abortController, updateCurrentAiMessage, addMessage, {
      preset,
      runtimePolicy: preset.runtimePolicy,
    });

    const boundModel = chatModel.bindTools.mock.results[0].value;
    const messages = boundModel.stream.mock.calls[0][0];
    const systemMessage = messages.find(
      (message: any) => message.constructor.name === "SystemMessage"
    );

    expect(systemMessage.content).toContain(profileInstruction);
    // Profile instruction must not appear twice (no double-injection).
    const occurrences = systemMessage.content.split(profileInstruction).length - 1;
    expect(occurrences).toBe(1);
  });

  it("does not include localSearch guidance for plain Chat when localSearch is unavailable", async () => {
    const registry = ToolRegistry.getInstance();
    (registry.getToolMetadata as jest.Mock).mockImplementation((toolName: string) => {
      if (toolName !== "getTimeRangeMs") {
        return undefined;
      }

      return {
        id: "getTimeRangeMs",
        displayName: "Get Time Range",
        description: "Convert time expressions",
        category: "time",
        accessLevel: "free",
        customPromptInstructions: "Convert natural language time expressions to date ranges.",
        conditionalPromptInstructions: [
          {
            requiredToolIds: ["localSearch"],
            content: "For time-based vault search, call localSearch with the returned time range.",
          },
        ],
      };
    });

    const preset = {
      id: "chat",
      promptProfile: "chat",
      runtimePolicy: resolveRuntimeChainPolicy("chat"),
      tools: [{ name: "getTimeRangeMs" }],
    } as any;

    await runner.run(userMessage, abortController, updateCurrentAiMessage, addMessage, {
      preset,
      runtimePolicy: preset.runtimePolicy,
    });

    const boundModel = chatModel.bindTools.mock.results[0].value;
    const messages = boundModel.stream.mock.calls[0][0];
    const systemMessage = messages.find(
      (message: any) => message.constructor.name === "SystemMessage"
    );

    expect(systemMessage.content).toContain("Convert natural language time expressions");
    expect(systemMessage.content).not.toContain("localSearch");
  });

  it("keeps localSearch guidance for Chat + RAG when localSearch is available", async () => {
    const registry = ToolRegistry.getInstance();
    (registry.getToolMetadata as jest.Mock).mockImplementation((toolName: string) => {
      if (toolName !== "localSearch") {
        return undefined;
      }

      return {
        id: "localSearch",
        displayName: "Vault Search",
        description: "Search vault notes",
        category: "search",
        accessLevel: "costly",
        customPromptInstructions: "Call localSearch for vault-grounded questions.",
      };
    });

    const preset = {
      id: "chat_rag",
      promptProfile: "chat_rag",
      runtimePolicy: resolveRuntimeChainPolicy("chat_rag"),
      tools: [{ name: "localSearch" }],
    } as any;

    await runner.run(userMessage, abortController, updateCurrentAiMessage, addMessage, {
      preset,
      runtimePolicy: preset.runtimePolicy,
    });

    const boundModel = chatModel.bindTools.mock.results[0].value;
    const messages = boundModel.stream.mock.calls[0][0];
    const systemMessage = messages.find(
      (message: any) => message.constructor.name === "SystemMessage"
    );

    expect(systemMessage.content).toContain("For Vault Search:");
    expect(systemMessage.content).toContain("localSearch");
  });

  it("clears the message and returns empty string when new-chat abort occurs during raw streaming", async () => {
    const preset = {
      id: "chat",
      promptProfile: "chat",
      runtimePolicy: resolveRuntimeChainPolicy("chat"),
      tools: [],
    } as any;

    const newChatAbortController = new AbortController();
    chatModel.stream = jest.fn(async function* () {
      newChatAbortController.abort(ABORT_REASON.NEW_CHAT);
      yield { content: "partial content that should be discarded" };
    });

    const result = await runner.run(
      userMessage,
      newChatAbortController,
      updateCurrentAiMessage,
      addMessage,
      { preset, runtimePolicy: preset.runtimePolicy }
    );

    expect(result).toBe("");
    expect(updateCurrentAiMessage).toHaveBeenLastCalledWith("");
    expect(addMessage).not.toHaveBeenCalled();
  });

  it("updates the same pending tool reasoning step with result details during live streaming", () => {
    const update = jest.fn();

    (runner as any).startReasoningTimer(update);
    const stepId = (runner as any).addToolReasoningStep(
      "provider-call-1",
      "Searching notes",
      "localSearch",
      { query: "roadmap", apiKey: "secret" },
      update
    );
    (runner as any).completeToolReasoningStep(
      "provider-call-1",
      { success: true, result: "Found roadmap.md" },
      25,
      update
    );
    (runner as any).stopReasoningTimer();

    expect(stepId).toBe("step-1");
    expect(update).toHaveBeenCalledWith(expect.stringContaining("CORTEX_REASONING"));
    const parsed = parseReasoningMessage(update.mock.calls.at(-1)?.[0] ?? "");
    expect(parsed?.payload.steps).toHaveLength(1);
    expect(parsed?.payload.steps[0]).toMatchObject({
      id: "step-1",
      summary: "Searching notes",
      toolName: "localSearch",
      toolDetails: {
        status: "success",
        resultPreview: "Found roadmap.md",
        durationMs: 25,
      },
    });
    expect((parsed?.payload.steps[0].toolDetails?.argsPreview as any).apiKey).toBe("[redacted]");
  });
});

describe("AutonomousAgentChainRunner citation fallback", () => {
  let runner: AutonomousAgentChainRunner;
  let userMessage: ChatMessage;
  let abortController: AbortController;
  let updateCurrentAiMessage: jest.Mock;
  let addMessage: jest.Mock;

  beforeEach(() => {
    const chatModel = {
      modelName: "test-model",
      bindTools: jest.fn(() => ({
        stream: jest.fn(async function* () {
          yield { content: "answer" };
        }),
      })),
      stream: jest.fn(async function* () {
        yield { content: "answer" };
      }),
    };
    runner = new AutonomousAgentChainRunner({
      app: { vault: {} },
      chatModelManager: {
        getChatModel: jest.fn(() => chatModel),
        findModelByName: jest.fn(() => ({ capabilities: [] })),
      },
      memoryManager: {
        getMemory: jest.fn(() => ({ chatHistory: { messages: [] } })),
        saveContext: jest.fn(),
      },
      userMemoryManager: {},
    } as any);
    userMessage = {
      id: "msg-cit",
      message: "Hello",
      originalMessage: "Hello",
      sender: "user",
      timestamp: { epoch: 0, display: "", fileName: "" },
      isVisible: true,
      contextEnvelope: {
        version: 1,
        conversationId: null,
        messageId: "msg-cit",
        layers: [{ id: "L5_USER", text: "Hello" }],
        serializedText: "serialized",
        layerHashes: {},
        combinedHash: "hash",
      },
    } as ChatMessage;
    abortController = new AbortController();
    updateCurrentAiMessage = jest.fn();
    addMessage = jest.fn();
  });

  it("appends fallback Sources block when localSearch ran but response has no citations", async () => {
    const preset = {
      id: "chat_rag",
      promptProfile: "chat_rag",
      runtimePolicy: resolveRuntimeChainPolicy("chat_rag"),
      tools: [{ name: "localSearch" }],
    } as any;

    jest.spyOn(runner as any, "runReActLoop").mockResolvedValue({
      finalResponse: "Here is the answer.",
      sources: [],
      responseMetadata: undefined,
      fallbackCitationSources: [{ title: "Note A", path: "Note A.md" }],
    });

    const result = await runner.run(
      userMessage,
      abortController,
      updateCurrentAiMessage,
      addMessage,
      {
        preset,
        runtimePolicy: preset.runtimePolicy,
      }
    );

    expect(result).toContain("#### Sources:");
    expect(addMessage).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("#### Sources:") })
    );
  });

  it("leaves response unchanged when it already contains a Sources block", async () => {
    const preset = {
      id: "chat_rag",
      promptProfile: "chat_rag",
      runtimePolicy: resolveRuntimeChainPolicy("chat_rag"),
      tools: [{ name: "localSearch" }],
    } as any;

    const responseWithSources = "Here is the answer.\n\n#### Sources:\n\n[^1]: [[Note A]]";

    jest.spyOn(runner as any, "runReActLoop").mockResolvedValue({
      finalResponse: responseWithSources,
      sources: [],
      responseMetadata: undefined,
      fallbackCitationSources: [{ title: "Note A", path: "Note A.md" }],
    });

    const result = await runner.run(
      userMessage,
      abortController,
      updateCurrentAiMessage,
      addMessage,
      {
        preset,
        runtimePolicy: preset.runtimePolicy,
      }
    );

    const sourcesMatches = (result.match(/#### Sources:/g) || []).length;
    expect(sourcesMatches).toBe(1);
  });

  it("uses accumulated sources from all searches, not just the last one", async () => {
    const preset = {
      id: "chat_rag",
      promptProfile: "chat_rag",
      runtimePolicy: resolveRuntimeChainPolicy("chat_rag"),
      tools: [{ name: "localSearch" }],
    } as any;

    // Formatter would only return last search's sources, but the accumulator has both
    jest.spyOn(runner as any, "runReActLoop").mockResolvedValue({
      finalResponse: "Combined answer from two searches.",
      sources: [],
      responseMetadata: undefined,
      fallbackCitationSources: [
        { title: "Note A", path: "Note A.md" },
        { title: "Note B", path: "Note B.md" },
      ],
    });

    const result = await runner.run(
      userMessage,
      abortController,
      updateCurrentAiMessage,
      addMessage,
      {
        preset,
        runtimePolicy: preset.runtimePolicy,
      }
    );

    expect(result).toContain("Note A");
    expect(result).toContain("Note B");
  });
});

describe("stopReasoningTimer", () => {
  it("marks in-flight tool steps as interrupted when reasoning is stopped before result arrives", () => {
    const runner = new AutonomousAgentChainRunner({
      app: { vault: {} },
      chatModelManager: {
        getChatModel: jest.fn(() => ({})),
        findModelByName: jest.fn(() => ({ capabilities: [] })),
      },
      memoryManager: {
        getMemory: jest.fn(() => ({ chatHistory: { messages: [] } })),
        saveContext: jest.fn(),
      },
      userMemoryManager: {},
    } as any);

    const step: ReasoningStep = {
      id: "step-1",
      timestamp: Date.now(),
      summary: "Searching notes for ...",
      toolName: "localSearch",
      toolDetails: {
        status: "running",
        argsPreview: { query: "test" },
        truncated: false,
      },
    };

    (runner as any).allReasoningSteps = [step];
    (runner as any).pendingToolStepIds = new Map([["tc-1", "step-1"]]);
    (runner as any).pendingToolArgs = new Map([["tc-1", { query: "test" }]]);
    (runner as any).reasoningState = {
      status: "reasoning",
      startTime: Date.now(),
      elapsedSeconds: 0,
      steps: [],
    };

    (runner as any).stopReasoningTimer();

    const finalStep = (runner as any).allReasoningSteps[0] as ReasoningStep;
    expect(finalStep.toolDetails?.status).toBe("error");
    expect(finalStep.toolDetails?.errorMessage).toBe("Interrupted");
    expect((runner as any).pendingToolStepIds.size).toBe(0);
    expect((runner as any).pendingToolArgs.size).toBe(0);
  });
});
