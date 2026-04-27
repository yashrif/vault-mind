import { ThinkBlockStreamer } from "./ThinkBlockStreamer";
import { parseReasoningPayload } from "@/core/reasoning";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ThinkBlockStreamer", () => {
  describe("OpenRouter delta.reasoning format", () => {
    it("should NOT treat empty reasoning_details array as thinking content", () => {
      let currentMessage = "";
      const streamer = new ThinkBlockStreamer((msg) => {
        currentMessage = msg;
      });

      // This was the bug: empty reasoning_details array should not trigger thinking mode
      streamer.processChunk({
        content: "Regular content",
        additional_kwargs: {
          reasoning_details: [],
        },
      });

      // No thinking content → no CORTEX_REASONING marker, just plain visible answer
      expect(currentMessage).toBe("Regular content");
      expect(currentMessage).not.toContain("CORTEX_REASONING");
      expect(currentMessage).not.toContain("<think>");
    });

    it("should handle delta.reasoning for streaming", () => {
      let currentMessage = "";
      const streamer = new ThinkBlockStreamer((msg) => {
        currentMessage = msg;
      });

      // First chunk with delta.reasoning
      streamer.processChunk({
        content: "",
        additional_kwargs: {
          delta: {
            reasoning: "Thinking step 1: ",
          },
        },
      });

      // Should contain a CORTEX_REASONING marker (no visible answer yet)
      expect(currentMessage).toContain("CORTEX_REASONING");
      const parsed1 = parseReasoningPayload(currentMessage);
      expect(parsed1).not.toBeNull();
      expect(parsed1!.payload.status).toBe("reasoning");
      expect(parsed1!.payload.items[0].state).toBe("active");
      expect(parsed1!.payload.items[0].detail).toBe("Thinking step 1: ");

      // Second chunk with more delta.reasoning
      streamer.processChunk({
        content: "",
        additional_kwargs: {
          delta: {
            reasoning: "Thinking step 2.",
          },
        },
      });

      const parsed2 = parseReasoningPayload(currentMessage);
      expect(parsed2!.payload.items[0].detail).toBe("Thinking step 1: Thinking step 2.");

      // Regular content should still appear in visible answer; marker stays
      streamer.processChunk({
        content: "Here's the result.",
        additional_kwargs: {},
      });

      const parsed3 = parseReasoningPayload(currentMessage);
      expect(parsed3).not.toBeNull();
      expect(parsed3!.contentAfter).toBe("Here's the result.");
      expect(parsed3!.payload.items[0].detail).toBe("Thinking step 1: Thinking step 2.");
    });

    it("should NOT duplicate when both delta.reasoning and reasoning_details are present", () => {
      let currentMessage = "";
      const streamer = new ThinkBlockStreamer((msg) => {
        currentMessage = msg;
      });

      // First chunk: delta.reasoning with streaming token
      streamer.processChunk({
        content: "",
        additional_kwargs: {
          delta: {
            reasoning: "Analyzing the ",
          },
        },
      });

      let parsed = parseReasoningPayload(currentMessage);
      expect(parsed!.payload.items[0].detail).toBe("Analyzing the ");

      // Second chunk: more delta.reasoning
      streamer.processChunk({
        content: "",
        additional_kwargs: {
          delta: {
            reasoning: "question carefully.",
          },
        },
      });

      parsed = parseReasoningPayload(currentMessage);
      expect(parsed!.payload.items[0].detail).toBe("Analyzing the question carefully.");

      // Final chunk: reasoning_details with complete transcript (should be IGNORED)
      streamer.processChunk({
        content: "",
        additional_kwargs: {
          reasoning_details: [
            {
              text: "Analyzing the question carefully.", // Same content as accumulated delta
            },
          ],
        },
      });

      // Should NOT duplicate - reasoning_details should be ignored
      parsed = parseReasoningPayload(currentMessage);
      expect(parsed!.payload.items[0].detail).toBe("Analyzing the question carefully.");
      expect(parsed!.payload.items[0].detail).not.toContain(
        "Analyzing the question carefully.Analyzing the question carefully."
      );

      // Regular content
      streamer.processChunk({
        content: "Here's my answer.",
        additional_kwargs: {},
      });

      parsed = parseReasoningPayload(currentMessage);
      expect(parsed).not.toBeNull();
      expect(parsed!.contentAfter).toBe("Here's my answer.");
    });
  });

  describe("Claude array-based format", () => {
    it("should handle Claude's content array with thinking type", () => {
      let currentMessage = "";
      const streamer = new ThinkBlockStreamer((msg) => {
        currentMessage = msg;
      });

      // Claude format with content array (thinking)
      streamer.processChunk({
        content: [
          {
            type: "thinking",
            thinking: "Let me analyze this...",
          },
        ],
      });

      expect(currentMessage).toContain("CORTEX_REASONING");
      let parsed = parseReasoningPayload(currentMessage);
      expect(parsed!.payload.items[0].detail).toBe("Let me analyze this...");
      expect(parsed!.contentAfter).toBe("");

      // Text content in array
      streamer.processChunk({
        content: [
          {
            type: "text",
            text: "Based on my analysis, ",
          },
        ],
      });

      parsed = parseReasoningPayload(currentMessage);
      expect(parsed!.contentAfter).toBe("Based on my analysis, ");
      expect(parsed!.payload.items[0].detail).toBe("Let me analyze this...");
    });

    it("should guard against undefined thinking content in Claude format", () => {
      let currentMessage = "";
      const streamer = new ThinkBlockStreamer((msg) => {
        currentMessage = msg;
      });

      // Malformed chunk with undefined thinking — the thinking property is absent
      streamer.processChunk({
        content: [
          {
            type: "thinking",
            // thinking property is undefined
          },
        ],
      });

      // Should not crash and should not add "undefined" to the message.
      // Because no actual transcript text was produced, no CORTEX_REASONING marker
      // is emitted (thinkingTranscript stays empty).
      expect(currentMessage).not.toContain("undefined");
      expect(currentMessage).not.toContain("<think>");
    });
  });

  describe("Deepseek format", () => {
    it("should handle Deepseek reasoning_content", () => {
      let currentMessage = "";
      const streamer = new ThinkBlockStreamer((msg) => {
        currentMessage = msg;
      });

      streamer.processChunk({
        content: "",
        additional_kwargs: {
          reasoning_content: "Deepseek is thinking...",
        },
      });

      expect(currentMessage).toContain("CORTEX_REASONING");
      let parsed = parseReasoningPayload(currentMessage);
      expect(parsed!.payload.items[0].detail).toBe("Deepseek is thinking...");

      streamer.processChunk({
        content: "The answer is here.",
        additional_kwargs: {},
      });

      parsed = parseReasoningPayload(currentMessage);
      expect(parsed!.contentAfter).toBe("The answer is here.");
      expect(parsed!.payload.items[0].detail).toBe("Deepseek is thinking...");
    });

    it("should guard against undefined reasoning_content in Deepseek format", () => {
      let currentMessage = "";
      const streamer = new ThinkBlockStreamer((msg) => {
        currentMessage = msg;
      });

      // Malformed chunk with undefined reasoning_content
      streamer.processChunk({
        content: "",
        additional_kwargs: {
          reasoning_content: undefined,
        },
      });

      // Should not crash, not open think block, and not add undefined
      expect(currentMessage).toBe("");
      expect(currentMessage).not.toContain("undefined");
      expect(currentMessage).not.toContain("CORTEX_REASONING");
      expect(currentMessage).not.toContain("<think>");
    });

    it("should handle streaming Deepseek reasoning_content without premature closure", () => {
      let currentMessage = "";
      const streamer = new ThinkBlockStreamer((msg) => {
        currentMessage = msg;
      });

      // First chunk with reasoning_content
      streamer.processChunk({
        content: "",
        additional_kwargs: {
          reasoning_content: "Thinking step 1...",
        },
      });

      let parsed = parseReasoningPayload(currentMessage);
      expect(parsed!.payload.items[0].detail).toBe("Thinking step 1...");

      // Second chunk with MORE reasoning_content (streaming)
      streamer.processChunk({
        content: "",
        additional_kwargs: {
          reasoning_content: " Step 2...",
        },
      });

      // Should be continuous accumulation in the transcript
      parsed = parseReasoningPayload(currentMessage);
      expect(parsed!.payload.items[0].detail).toBe("Thinking step 1... Step 2...");

      // Third chunk with regular content
      streamer.processChunk({
        content: "Final answer.",
        additional_kwargs: {},
      });

      parsed = parseReasoningPayload(currentMessage);
      expect(parsed!.contentAfter).toBe("Final answer.");
      expect(parsed!.payload.items[0].detail).toBe("Thinking step 1... Step 2...");
    });
  });

  describe("excludeThinking option", () => {
    it("should skip OpenRouter thinking content when excludeThinking is true", () => {
      let currentMessage = "";
      const streamer = new ThinkBlockStreamer(
        (msg) => {
          currentMessage = msg;
        },
        true // excludeThinking = true
      );

      // Thinking content should be skipped — no CORTEX_REASONING marker
      streamer.processChunk({
        content: "",
        additional_kwargs: {
          delta: {
            reasoning: "This should be skipped",
          },
        },
      });

      expect(currentMessage).toBe("");
      expect(currentMessage).not.toContain("CORTEX_REASONING");

      // Regular content should still be processed
      streamer.processChunk({
        content: "This should be included",
        additional_kwargs: {},
      });

      expect(currentMessage).toBe("This should be included");
      expect(currentMessage).not.toContain("CORTEX_REASONING");
    });

    it("should skip Claude thinking content when excludeThinking is true", () => {
      let currentMessage = "";
      const streamer = new ThinkBlockStreamer(
        (msg) => {
          currentMessage = msg;
        },
        true // excludeThinking = true
      );

      streamer.processChunk({
        content: [
          {
            type: "thinking",
            thinking: "Claude thinking",
          },
        ],
      });

      expect(currentMessage).toBe("");
      expect(currentMessage).not.toContain("CORTEX_REASONING");
      expect(currentMessage).not.toContain("<think>");
    });
  });

  describe("close() method", () => {
    it("should emit a complete-status marker when there is thinking content", () => {
      let currentMessage = "";
      const streamer = new ThinkBlockStreamer((msg) => {
        currentMessage = msg;
      });

      streamer.processChunk({
        content: "",
        additional_kwargs: {
          delta: {
            reasoning: "Thinking...",
          },
        },
      });

      // During streaming the status is "reasoning"
      const parsed = parseReasoningPayload(currentMessage);
      expect(parsed!.payload.status).toBe("reasoning");

      const result = streamer.close();

      // After close the status must be "complete"
      const parsedResult = parseReasoningPayload(result.content);
      expect(parsedResult).not.toBeNull();
      expect(parsedResult!.payload.status).toBe("complete");
      expect(parsedResult!.payload.items[0].state).toBe("done");
      expect(parsedResult!.payload.items[0].detail).toBe("Thinking...");
    });

    it("should not add a CORTEX_REASONING marker when there is no thinking content", () => {
      const streamer = new ThinkBlockStreamer(() => {});

      streamer.processChunk({
        content: "Done",
        additional_kwargs: {},
      });

      const result = streamer.close();
      expect(result.content).toBe("Done");
      expect(result.content).not.toContain("CORTEX_REASONING");
    });

    it("should produce correct content when thinking is followed by visible answer", () => {
      const streamer = new ThinkBlockStreamer(() => {});

      streamer.processChunk({
        content: "",
        additional_kwargs: {
          delta: {
            reasoning: "Thinking...",
          },
        },
      });

      streamer.processChunk({
        content: "Done",
        additional_kwargs: {},
      });

      const result = streamer.close();

      const parsed = parseReasoningPayload(result.content);
      expect(parsed).not.toBeNull();
      expect(parsed!.payload.status).toBe("complete");
      expect(parsed!.payload.items[0].state).toBe("done");
      expect(parsed!.contentAfter).toBe("Done");

      // Should not contain raw <think> tags
      expect(result.content).not.toContain("<think>");
      expect(result.content).not.toContain("</think>");
    });
  });

  describe("mixed content scenarios", () => {
    it("should accumulate all thinking into a single transcript item across alternation", () => {
      let currentMessage = "";
      const streamer = new ThinkBlockStreamer((msg) => {
        currentMessage = msg;
      });

      const chunks = [
        { thinking: "Think 1", content: "" },
        { thinking: "", content: "Text 1" },
        { thinking: "Think 2", content: "" },
        { thinking: "", content: "Text 2" },
        { thinking: "Think 3", content: "" },
        { thinking: "", content: "Text 3" },
      ];

      chunks.forEach((chunk) => {
        if (chunk.thinking) {
          streamer.processChunk({
            content: "",
            additional_kwargs: {
              delta: {
                reasoning: chunk.thinking,
              },
            },
          });
        } else {
          streamer.processChunk({
            content: chunk.content,
            additional_kwargs: {},
          });
        }
      });

      // All thinking goes into a single CORTEX_REASONING marker with one transcript item
      const parsed = parseReasoningPayload(currentMessage);
      expect(parsed).not.toBeNull();
      expect(parsed!.payload.items).toHaveLength(1);
      expect(parsed!.payload.items[0].detail).toBe("Think 1Think 2Think 3");

      // All visible text appears in the content-after portion
      expect(parsed!.contentAfter).toBe("Text 1Text 2Text 3");

      // No raw <think> tags should leak into the output
      expect(currentMessage).not.toContain("<think>");
      expect(currentMessage).not.toContain("</think>");
    });
  });

  describe("transcript truncation", () => {
    it("should cap transcript detail at 12000 chars and prepend truncation prefix", () => {
      let currentMessage = "";
      const streamer = new ThinkBlockStreamer((msg) => {
        currentMessage = msg;
      });

      // Generate 13000 chars of thinking content
      const longThinking = "x".repeat(13000);
      streamer.processChunk({
        content: "",
        additional_kwargs: {
          delta: {
            reasoning: longThinking,
          },
        },
      });

      const parsed = parseReasoningPayload(currentMessage);
      expect(parsed).not.toBeNull();
      const detail = parsed!.payload.items[0].detail!;
      expect(detail.length).toBeLessThanOrEqual(12000 + "[Earlier reasoning omitted]\n".length);
      expect(detail.startsWith("[Earlier reasoning omitted]\n")).toBe(true);
    });

    it("should not truncate transcript detail at or below 12000 chars", () => {
      let currentMessage = "";
      const streamer = new ThinkBlockStreamer((msg) => {
        currentMessage = msg;
      });

      const thinking = "y".repeat(12000);
      streamer.processChunk({
        content: "",
        additional_kwargs: {
          delta: {
            reasoning: thinking,
          },
        },
      });

      const parsed = parseReasoningPayload(currentMessage);
      expect(parsed!.payload.items[0].detail).toBe(thinking);
    });
  });

  describe("buildAIMessage()", () => {
    it("should use only the visible answer (no marker) for LLM context", () => {
      const streamer = new ThinkBlockStreamer(() => {});

      streamer.processChunk({
        content: "",
        additional_kwargs: {
          delta: { reasoning: "internal thought" },
        },
      });
      streamer.processChunk({
        content: "Visible reply",
        additional_kwargs: {},
      });

      const aiMsg = streamer.buildAIMessage();
      const msgContent =
        typeof aiMsg.content === "string" ? aiMsg.content : JSON.stringify(aiMsg.content);
      expect(msgContent).not.toContain("CORTEX_REASONING");
      expect(msgContent).toBe("Visible reply");
    });
  });

  describe("handleTextLevelThinkTags (nvidia/nemotron/qwen3 text-level path)", () => {
    it("should extract <think>...</think> block split across multiple chunks", () => {
      let currentMessage = "";
      const streamer = new ThinkBlockStreamer((msg) => {
        currentMessage = msg;
      });

      // Chunk N: open tag
      streamer.processChunk({ content: "<think>", additional_kwargs: {} });
      // Chunk N+1: thinking content (still inside the block)
      streamer.processChunk({ content: "some reasoning here", additional_kwargs: {} });
      // Chunk N+2: close tag
      streamer.processChunk({ content: "</think>", additional_kwargs: {} });

      // Transcript should have the thinking content
      const parsed = parseReasoningPayload(currentMessage);
      expect(parsed).not.toBeNull();
      expect(parsed!.payload.items[0].detail).toContain("some reasoning here");

      // visibleAnswer should contain no raw think tags
      expect(currentMessage).not.toContain("<think>");
      expect(currentMessage).not.toContain("</think>");
    });

    it("should handle malformed </think> without prior <think> without crashing", () => {
      let currentMessage = "";
      const streamer = new ThinkBlockStreamer((msg) => {
        currentMessage = msg;
      });

      // Only a close tag — no open tag ever seen
      streamer.processChunk({ content: "prefix text", additional_kwargs: {} });
      streamer.processChunk({ content: "</think>", additional_kwargs: {} });
      streamer.processChunk({ content: "suffix text", additional_kwargs: {} });

      // Should not crash; content after </think> should end up in visibleAnswer
      expect(currentMessage).not.toContain("</think>");
      expect(currentMessage).not.toContain("<think>");
      // suffix text must be present
      expect(currentMessage).toContain("suffix text");
    });

    it("should suppress text-level <think> content when excludeThinking=true", () => {
      let currentMessage = "";
      const streamer = new ThinkBlockStreamer(
        (msg) => {
          currentMessage = msg;
        },
        true // excludeThinking = true
      );

      streamer.processChunk({ content: "<think>secret thoughts</think>", additional_kwargs: {} });
      streamer.processChunk({ content: "visible answer", additional_kwargs: {} });

      // Thinking content must be suppressed — no CORTEX_REASONING marker
      expect(currentMessage).not.toContain("CORTEX_REASONING");
      expect(currentMessage).not.toContain("secret thoughts");
      expect(currentMessage).not.toContain("<think>");
      expect(currentMessage).not.toContain("</think>");
      // Visible answer must still appear
      expect(currentMessage).toContain("visible answer");
    });
  });

  describe("excludeThinking option — Deepseek reasoning_content path", () => {
    it("should skip Deepseek reasoning_content and produce no marker when excludeThinking=true", () => {
      let currentMessage = "";
      const streamer = new ThinkBlockStreamer(
        (msg) => {
          currentMessage = msg;
        },
        true // excludeThinking = true
      );

      // Thinking chunk — must be suppressed entirely
      streamer.processChunk({
        content: "",
        additional_kwargs: {
          reasoning_content: "Deepseek thinking that should be hidden",
        },
      });

      expect(currentMessage).toBe("");
      expect(currentMessage).not.toContain("CORTEX_REASONING");
      expect(currentMessage).not.toContain("Deepseek thinking");

      // Regular visible content must still be delivered
      streamer.processChunk({
        content: "Here is the answer.",
        additional_kwargs: {},
      });

      expect(currentMessage).toBe("Here is the answer.");
      expect(currentMessage).not.toContain("CORTEX_REASONING");
    });
  });
});
