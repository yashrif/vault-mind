import { StreamingResult, TokenUsage } from "@/types/message";
import { AIMessage } from "@langchain/core/messages";
import { detectTruncation, extractTokenUsage } from "./finishReasonDetector";
import { formatErrorChunk } from "@/utils/toolResultUtils";
import {
  NativeToolCall,
  ToolCallChunk,
  buildToolCallsFromChunks,
  createAIMessageWithToolCalls,
} from "./nativeToolCalling";
import { logInfo, logWarn } from "@/logger";
import { stripSpecialTokens } from "@/utils/stripSpecialTokens";
import { serializeReasoningPayload } from "@/core/reasoning";
import type { ReasoningPayload, ReasoningItemState, ReasoningStatus } from "@/core/reasoning";

/** Maximum number of characters stored in the transcript detail field. */
const MAX_TRANSCRIPT_DETAIL_CHARS = 12000;

/** Prefix added when the transcript is truncated to stay within the limit. */
const TRUNCATION_PREFIX = "[Earlier reasoning omitted]\n";

/**
 * ThinkBlockStreamer handles streaming content from various LLM providers
 * that support thinking/reasoning modes (like Claude and Deepseek).
 * Also accumulates native tool calls from tool_call_chunks during streaming.
 * Also detects truncation due to token limits across all providers.
 *
 * When thinking content is present and `excludeThinking` is false, the
 * streamer emits a CORTEX_REASONING marker (serialized ReasoningPayload)
 * prepended to the visible answer. If there is no thinking content the
 * streamer emits just the visible answer with no marker.
 */
export class ThinkBlockStreamer {
  private hasOpenThinkBlock = false;
  /** Accumulates all think/reasoning content (never appears in the visible answer). */
  private thinkingTranscript = "";
  /** Accumulates the non-thinking visible text. */
  private visibleAnswer = "";
  private errorResponse = "";
  private wasTruncated = false;
  private tokenUsage: TokenUsage | null = null;
  // Track if we've handled text-level think tags (e.g., from nvidia/nemotron)
  private hasHandledTextLevelThinkTag = false;
  // Character index (within visibleAnswer) where an excluded text-level think
  // block started. -1 means we're not currently inside an excluded block.
  private excludedThinkBlockStart = -1;

  // Native tool call accumulation
  private toolCallChunks: Map<number, ToolCallChunk> = new Map();
  private accumulatedToolCalls: NativeToolCall[] = [];

  constructor(
    private updateCurrentAiMessage: (message: string) => void,
    private excludeThinking: boolean = false
  ) {
    logInfo(`[ThinkBlockStreamer] Created with excludeThinking=${excludeThinking}`);
  }

  /**
   * Build the composite string that is passed to `updateCurrentAiMessage`.
   * When thinking content exists and `excludeThinking` is false the string is:
   *   `serializeReasoningPayload(payload) + "\n" + visibleAnswer`
   * Otherwise it is just `visibleAnswer`.
   *
   * @param itemState - Whether the reasoning item is still active or done.
   * @param blockStatus - The lifecycle status of the reasoning block.
   */
  private buildCompositeString(
    itemState: ReasoningItemState = "active",
    blockStatus: ReasoningStatus = "reasoning"
  ): string {
    if (!this.thinkingTranscript) {
      return this.visibleAnswer;
    }

    // Cap the transcript detail and prefix with truncation notice if needed.
    let detail = this.thinkingTranscript;
    if (detail.length > MAX_TRANSCRIPT_DETAIL_CHARS) {
      detail = TRUNCATION_PREFIX + detail.slice(detail.length - MAX_TRANSCRIPT_DETAIL_CHARS);
    }

    const payload: ReasoningPayload = {
      version: 1,
      // Always "chat" because AutonomousAgentChainRunner always sets excludeThinking=true,
      // so this code path is never reached from the agent flow.
      source: "chat",
      status: blockStatus,
      // Intentional placeholder: chat streaming does not track reasoning elapsed time.
      elapsedSeconds: 0,
      items: [
        {
          id: "transcript-0",
          kind: "transcript",
          // Intentional placeholder: a fixed summary is used since chat does not derive
          // a dynamic summary from the reasoning content.
          summary: "Thought for a while",
          detail,
          state: itemState,
        },
      ],
    };

    return serializeReasoningPayload(payload) + "\n" + this.visibleAnswer;
  }

  /**
   * Handle text-level think tags embedded in content (e.g., nvidia/nemotron, qwen3 models).
   * Some models output thinking with only </think> closing tag, no opening tag.
   * This method detects and fixes this during streaming.
   *
   * When excludeThinking is true, thinking content is suppressed during streaming
   * (not just stripped after the close tag arrives) by tracking the position where
   * the excluded block started and truncating visibleAnswer on each chunk.
   */
  private handleTextLevelThinkTags() {
    if (this.excludeThinking) {
      this.handleExcludedThinkTags();
      return;
    }

    // When not excluding: detect <think>...</think> embedded directly in visibleAnswer
    // and migrate that content into thinkingTranscript.
    const hasCloseTag = this.visibleAnswer.includes("</think>");
    const hasOpenTag = this.visibleAnswer.includes("<think>");

    if (!hasCloseTag) return;

    // Fix missing opening tag (some chat templates omit it)
    if (!hasOpenTag && !this.hasHandledTextLevelThinkTag) {
      this.hasHandledTextLevelThinkTag = true;
      logWarn(
        "Detected </think> closing tag without opening <think> tag. " +
          "This may indicate a misconfigured chat template in LM Studio. Adding opening tag."
      );
      this.visibleAnswer = "<think>" + this.visibleAnswer;
    }

    // Extract all complete <think>...</think> blocks from visibleAnswer
    // and accumulate them into thinkingTranscript.
    const closeIdx = this.visibleAnswer.indexOf("</think>");
    const openIdx = this.visibleAnswer.indexOf("<think>");

    if (openIdx !== -1 && closeIdx !== -1 && openIdx < closeIdx) {
      // Complete block present — extract it
      const thinkContent = this.visibleAnswer.slice(openIdx + "<think>".length, closeIdx);
      const before = this.visibleAnswer.slice(0, openIdx);
      const after = this.visibleAnswer.slice(closeIdx + "</think>".length);
      this.thinkingTranscript += thinkContent;
      this.visibleAnswer = (before + after).trimStart();
    }
  }

  /**
   * Strip text-level think tags when excludeThinking is true.
   * Handles three streaming states:
   * 1. Not inside a think block -- look for `<think>` to enter one
   * 2. Inside an incomplete block (no `</think>` yet) -- truncate to pre-block content
   * 3. Block just closed -- strip the complete block and exit the state
   */
  private handleExcludedThinkTags() {
    // Currently inside an excluded block from a previous chunk
    if (this.excludedThinkBlockStart >= 0) {
      const closeIdx = this.visibleAnswer.indexOf("</think>", this.excludedThinkBlockStart);
      if (closeIdx !== -1) {
        // Block closed -- stitch content before and after the block
        const before = this.visibleAnswer.substring(0, this.excludedThinkBlockStart);
        const after = this.visibleAnswer.substring(closeIdx + "</think>".length);
        this.visibleAnswer = (before + after).trimStart();
        this.excludedThinkBlockStart = -1;
      } else {
        // Still streaming thinking -- truncate to the safe prefix
        this.visibleAnswer = this.visibleAnswer.substring(0, this.excludedThinkBlockStart);
      }
      return;
    }

    // Not inside a block -- check for a new one
    const openIdx = this.visibleAnswer.indexOf("<think>");
    if (openIdx !== -1) {
      this.excludedThinkBlockStart = openIdx;
      const closeIdx = this.visibleAnswer.indexOf("</think>", openIdx);
      if (closeIdx !== -1) {
        // Complete block in one pass
        const before = this.visibleAnswer.substring(0, openIdx);
        const after = this.visibleAnswer.substring(closeIdx + "</think>".length);
        this.visibleAnswer = (before + after).trimStart();
        this.excludedThinkBlockStart = -1;
      } else {
        // Incomplete -- truncate
        this.visibleAnswer = this.visibleAnswer.substring(0, openIdx);
      }
      return;
    }

    // Handle malformed: only </think> without <think> (e.g., some chat templates)
    const closeIdx = this.visibleAnswer.indexOf("</think>");
    if (closeIdx !== -1) {
      this.visibleAnswer = this.visibleAnswer.substring(closeIdx + "</think>".length).trimStart();
    }
  }

  private handleClaudeChunk(content: any[]): void {
    let textContent = "";
    for (const item of content) {
      switch (item.type) {
        case "text":
          textContent += item.text;
          break;
        case "thinking":
          // Skip thinking content if excludeThinking is enabled
          if (this.excludeThinking) {
            break;
          }
          this.hasOpenThinkBlock = true;
          // Guard against undefined thinking content
          if (item.thinking !== undefined) {
            this.thinkingTranscript += item.thinking;
          }
          // processChunk's tail call to updateCurrentAiMessage handles all providers uniformly
          break;
      }
    }
    // Close think block before adding text content
    if (textContent && this.hasOpenThinkBlock) {
      this.hasOpenThinkBlock = false;
    }
    if (textContent) {
      this.visibleAnswer += stripSpecialTokens(textContent);
    }
  }

  private handleDeepseekChunk(chunk: any) {
    // Handle deepseek reasoning/thinking content
    const reasoning = chunk.additional_kwargs?.reasoning_content;
    if (reasoning) {
      // Skip thinking content if excludeThinking is enabled
      if (this.excludeThinking) {
        return true; // Indicate we handled (but skipped) a thinking chunk
      }
      this.hasOpenThinkBlock = true;
      this.thinkingTranscript += reasoning;
      return true; // Indicate we handled a thinking chunk
    }
    // Only append visible content when no reasoning content is present
    if (typeof chunk.content === "string") {
      this.visibleAnswer += stripSpecialTokens(chunk.content);
    }
    return false; // No thinking chunk handled
  }

  /**
   * Handle OpenRouter reasoning/thinking content
   *
   * OpenRouter exposes reasoning via two channels:
   * - delta.reasoning (streaming, token-by-token)
   * - reasoning_details (cumulative transcript array)
   *
   * STRATEGY: We use ONLY delta.reasoning for thinking content.
   *
   * Why delta-only?
   * - Provides minimal latency (streaming as tokens arrive)
   * - No duplication issues (single source of truth)
   * - No complex cumulative bookkeeping needed
   *
   * Trade-offs:
   * - Models that only populate reasoning_details (without delta.reasoning) won't show thinking
   * - This is acceptable for now as most models use delta.reasoning for streaming
   */
  private handleOpenRouterChunk(chunk: any) {
    // Only process delta.reasoning (streaming), ignore reasoning_details entirely
    if (chunk.additional_kwargs?.delta?.reasoning) {
      // Skip thinking content if excludeThinking is enabled
      if (this.excludeThinking) {
        return true;
      }
      this.hasOpenThinkBlock = true;
      this.thinkingTranscript += chunk.additional_kwargs.delta.reasoning;
      return true; // Handled thinking
    }

    // Close think block before adding regular content
    if (typeof chunk.content === "string" && chunk.content && this.hasOpenThinkBlock) {
      this.hasOpenThinkBlock = false;
    }

    // Handle standard string content (this is the actual response, not thinking)
    if (typeof chunk.content === "string" && chunk.content) {
      this.visibleAnswer += stripSpecialTokens(chunk.content);
    }

    return false; // No thinking handled
  }

  /**
   * Accumulate native tool call chunks during streaming.
   * LangChain providers send tool_call_chunks with incremental data.
   */
  private handleToolCallChunks(chunk: any) {
    // Check for tool_call_chunks in the chunk (LangChain streaming format)
    const toolCallChunks = chunk.tool_call_chunks;
    if (!toolCallChunks || !Array.isArray(toolCallChunks)) {
      return;
    }

    for (const tc of toolCallChunks) {
      const idx = tc.index ?? 0;
      const existing = this.toolCallChunks.get(idx) || { name: "", args: "" };

      // Accumulate data from chunk
      if (tc.id) existing.id = tc.id;
      if (tc.name) existing.name += tc.name;
      if (tc.args) existing.args += tc.args;

      this.toolCallChunks.set(idx, existing);
    }
  }

  processChunk(chunk: any) {
    // Detect truncation using multi-provider detector
    const truncationResult = detectTruncation(chunk);
    if (truncationResult.wasTruncated) {
      this.wasTruncated = true;
    }

    // Extract token usage if available
    const usage = extractTokenUsage(chunk);
    if (usage) {
      this.tokenUsage = usage;
    }

    // Handle native tool call chunks (LangChain streaming)
    this.handleToolCallChunks(chunk);

    // Determine if this chunk will handle thinking content
    // Note: For OpenRouter, we process only delta.reasoning, but we still need to recognize
    // reasoning_details as a thinking chunk to prevent premature think block closure
    const isThinkingChunk =
      Array.isArray(chunk.content) ||
      chunk.additional_kwargs?.delta?.reasoning ||
      (chunk.additional_kwargs?.reasoning_details &&
        Array.isArray(chunk.additional_kwargs.reasoning_details) &&
        chunk.additional_kwargs.reasoning_details.length > 0) ||
      chunk.additional_kwargs?.reasoning_content; // Deepseek format

    // Close think block BEFORE processing non-thinking content
    if (this.hasOpenThinkBlock && !isThinkingChunk) {
      this.hasOpenThinkBlock = false;
    }

    // Now process the chunk
    // Route based on the actual chunk format
    if (Array.isArray(chunk.content)) {
      // Claude format with content array
      this.handleClaudeChunk(chunk.content);
    } else if (chunk.additional_kwargs?.reasoning_content) {
      // Deepseek format with reasoning_content
      this.handleDeepseekChunk(chunk);
    } else if (isThinkingChunk) {
      // OpenRouter format with delta.reasoning or reasoning_details
      this.handleOpenRouterChunk(chunk);
    } else {
      // Default case: regular content or other formats
      this.handleDeepseekChunk(chunk);
    }

    // Handle text-level think tags (e.g., from nvidia/nemotron models)
    this.handleTextLevelThinkTags();

    this.updateCurrentAiMessage(this.buildCompositeString("active", "reasoning"));
  }

  processErrorChunk(errorMessage: string) {
    this.errorResponse = formatErrorChunk(errorMessage);
  }

  /**
   * Get the accumulated tool calls from streaming chunks.
   * Call this after streaming is complete to get all tool calls.
   */
  getToolCalls(): NativeToolCall[] {
    // If we have pre-accumulated tool calls (from non-streaming), return those
    if (this.accumulatedToolCalls.length > 0) {
      return this.accumulatedToolCalls;
    }
    // Otherwise build from streaming chunks
    return buildToolCallsFromChunks(this.toolCallChunks);
  }

  /**
   * Check if there are any tool calls accumulated
   */
  hasToolCalls(): boolean {
    return this.toolCallChunks.size > 0 || this.accumulatedToolCalls.length > 0;
  }

  /**
   * Set tool calls directly (for non-streaming responses)
   */
  setToolCalls(toolCalls: NativeToolCall[]) {
    this.accumulatedToolCalls = toolCalls;
  }

  /**
   * Build an AIMessage with the accumulated content and tool calls.
   * Use this to add the complete response to conversation history.
   * The message content uses just the visible answer (no reasoning marker) so
   * LLM context stays clean.
   */
  buildAIMessage(): AIMessage {
    const toolCalls = this.getToolCalls();
    return createAIMessageWithToolCalls(this.visibleAnswer, toolCalls);
  }

  /**
   * Finalise streaming and return the persisted content string along with
   * truncation and token usage metadata.
   *
   * The returned `content` contains the CORTEX_REASONING marker (if any
   * thinking content was accumulated) followed by the visible answer. This
   * is the value that gets written to the chat history file.
   */
  close(): StreamingResult {
    // Ensure any open think block is considered closed
    if (this.hasOpenThinkBlock) {
      this.hasOpenThinkBlock = false;
    }

    // Final check for text-level think tags (in case stream ended before </think> was seen)
    this.handleTextLevelThinkTags();

    if (this.errorResponse) {
      this.visibleAnswer += this.errorResponse;
    }

    // Build final composite string with "complete" status
    const finalComposite = this.buildCompositeString("done", "complete");

    this.updateCurrentAiMessage(finalComposite);

    return {
      content: finalComposite,
      wasTruncated: this.wasTruncated,
      tokenUsage: this.tokenUsage,
    };
  }
}
