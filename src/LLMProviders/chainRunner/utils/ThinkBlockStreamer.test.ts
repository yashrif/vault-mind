import { parseReasoningMessage } from "./AgentReasoningState";
import { ThinkBlockStreamer } from "./ThinkBlockStreamer";

const TRUNCATION_SUFFIX = "\n\n[Reasoning truncated at 12,000 characters]";

describe("ThinkBlockStreamer", () => {
  it("emits a shared reasoning marker for OpenRouter delta.reasoning content", () => {
    let currentMessage = "";
    const streamer = new ThinkBlockStreamer((message) => {
      currentMessage = message;
    });

    streamer.processChunk({
      content: "",
      additional_kwargs: { delta: { reasoning: "Analyzing the request" } },
    });

    let parsedReasoning = parseReasoningMessage(currentMessage);
    expect(parsedReasoning?.payload.status).toBe("reasoning");
    expect(parsedReasoning?.payload.items[0]?.detail).toBe("Analyzing the request");
    expect(parsedReasoning?.contentAfter).toBe("");

    streamer.processChunk({
      content: "Here is the answer.",
      additional_kwargs: {},
    });

    parsedReasoning = parseReasoningMessage(currentMessage);
    expect(parsedReasoning?.payload.status).toBe("complete");
    expect(parsedReasoning?.contentAfter).toBe("Here is the answer.");
  });

  it("maps Claude array content into transcript and visible answer text", () => {
    const streamer = new ThinkBlockStreamer(() => {});

    streamer.processChunk({
      content: [{ type: "thinking", thinking: "Let me analyze this..." }],
    });
    streamer.processChunk({
      content: [{ type: "text", text: "Final answer" }],
    });

    const result = streamer.close();
    const parsedReasoning = parseReasoningMessage(result.content);
    expect(parsedReasoning?.payload.items[0]?.detail).toBe("Let me analyze this...");
    expect(parsedReasoning?.contentAfter).toBe("Final answer");
  });

  it("maps Deepseek reasoning_content into the shared transcript", () => {
    const streamer = new ThinkBlockStreamer(() => {});

    streamer.processChunk({
      content: "",
      additional_kwargs: { reasoning_content: "Deepseek is thinking..." },
    });
    streamer.processChunk({
      content: "The answer is here.",
      additional_kwargs: {},
    });

    const parsedReasoning = parseReasoningMessage(streamer.close().content);
    expect(parsedReasoning?.payload.status).toBe("complete");
    expect(parsedReasoning?.payload.items[0]?.detail).toBe("Deepseek is thinking...");
    expect(parsedReasoning?.contentAfter).toBe("The answer is here.");
  });

  it("maps text-level <think> tags into transcript content", () => {
    const streamer = new ThinkBlockStreamer(() => {});

    streamer.processChunk({ content: "<think>First thought</think>Visible answer" });

    const parsedReasoning = parseReasoningMessage(streamer.close().content);
    expect(parsedReasoning?.payload.status).toBe("complete");
    expect(parsedReasoning?.payload.items[0]?.detail).toBe("First thought");
    expect(parsedReasoning?.contentAfter).toBe("Visible answer");
  });

  it("does not emit a reasoning marker when no reasoning content exists", () => {
    let currentMessage = "";
    const streamer = new ThinkBlockStreamer((message) => {
      currentMessage = message;
    });

    streamer.processChunk({ content: "Plain answer", additional_kwargs: {} });

    expect(parseReasoningMessage(currentMessage)).toBeNull();
    expect(streamer.close().content).toBe("Plain answer");
  });

  it("strips reasoning entirely when excludeThinking is true", () => {
    const streamer = new ThinkBlockStreamer(() => {}, true);

    streamer.processChunk({
      content: "",
      additional_kwargs: { delta: { reasoning: "This should not be visible" } },
    });
    streamer.processChunk({
      content: "Visible answer",
      additional_kwargs: {},
    });

    expect(streamer.close().content).toBe("Visible answer");
  });

  it("caps the transcript at 12,000 characters and appends the truncation note", () => {
    const streamer = new ThinkBlockStreamer(() => {});
    const longTranscript = "x".repeat(12050);

    streamer.processChunk({
      content: "",
      additional_kwargs: { delta: { reasoning: longTranscript } },
    });
    streamer.processChunk({
      content: "Visible answer",
      additional_kwargs: {},
    });

    const parsedReasoning = parseReasoningMessage(streamer.close().content);
    expect(parsedReasoning?.payload.items[0]?.detail?.endsWith(TRUNCATION_SUFFIX)).toBe(true);
    expect(parsedReasoning?.payload.items[0]?.detail?.length).toBe(
      12000 + TRUNCATION_SUFFIX.length
    );
    expect(parsedReasoning?.contentAfter).toBe("Visible answer");
  });
});
