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
import { logInfo } from "@/logger";
import { stripSpecialTokens } from "@/utils/stripSpecialTokens";
import { composeReasoningMessage, createChatReasoningPayload } from "./AgentReasoningState";

const THINKING_TRANSCRIPT_LIMIT = 12000;
const THINKING_TRANSCRIPT_TRUNCATION_SUFFIX = "\n\n[Reasoning truncated at 12,000 characters]";

interface TextLevelThinkingState {
  hasReasoning: boolean;
  isInsideReasoning: boolean;
  sawReasoningClose: boolean;
  transcript: string;
  visibleText: string;
}

/**
 * Parse text-level `<think>` tags from a raw streamed transcript.
 *
 * @param rawText - Full raw streamed text seen so far.
 * @returns Split transcript/visible text state for text-level thinking models.
 */
function parseTextLevelThinking(rawText: string): TextLevelThinkingState {
  let cursor = 0;
  let visibleText = "";
  let transcript = "";
  let hasReasoning = false;
  let isInsideReasoning = false;
  let sawReasoningClose = false;

  while (cursor < rawText.length) {
    if (!isInsideReasoning) {
      const nextOpen = rawText.indexOf("<think>", cursor);
      const nextClose = rawText.indexOf("</think>", cursor);

      if (nextClose !== -1 && (nextOpen === -1 || nextClose < nextOpen)) {
        hasReasoning = true;
        transcript += rawText.slice(cursor, nextClose);
        cursor = nextClose + "</think>".length;
        sawReasoningClose = true;
        continue;
      }

      if (nextOpen === -1) {
        visibleText += rawText.slice(cursor);
        break;
      }

      visibleText += rawText.slice(cursor, nextOpen);
      cursor = nextOpen + "<think>".length;
      hasReasoning = true;
      isInsideReasoning = true;
      continue;
    }

    const nextClose = rawText.indexOf("</think>", cursor);
    if (nextClose === -1) {
      transcript += rawText.slice(cursor);
      break;
    }

    transcript += rawText.slice(cursor, nextClose);
    cursor = nextClose + "</think>".length;
    isInsideReasoning = false;
    sawReasoningClose = true;
  }

  return {
    hasReasoning,
    isInsideReasoning,
    sawReasoningClose,
    transcript,
    visibleText,
  };
}

/**
 * ThinkBlockStreamer handles streaming content from reasoning-capable providers.
 * Chat-mode responses emit the shared reasoning marker; excludeThinking mode strips
 * reasoning and returns only the visible answer text.
 */
export class ThinkBlockStreamer {
  private visibleText = "";
  private thinkingTranscript = "";
  private rawTextLevelContent = "";
  private errorResponse = "";
  private wasTruncated = false;
  private tokenUsage: TokenUsage | null = null;
  private reasoningSeen = false;
  private reasoningStatus: "idle" | "reasoning" | "complete" = "idle";
  private reasoningStartTime: number | null = null;
  private transcriptTruncated = false;

  private toolCallChunks: Map<number, ToolCallChunk> = new Map();
  private accumulatedToolCalls: NativeToolCall[] = [];

  constructor(
    private updateCurrentAiMessage: (message: string) => void,
    private excludeThinking: boolean = false
  ) {
    logInfo(`[ThinkBlockStreamer] Created with excludeThinking=${excludeThinking}`);
  }

  /**
   * Mark reasoning as active and initialize timer state.
   */
  private startReasoning(): void {
    if (this.excludeThinking) {
      this.reasoningSeen = true;
      return;
    }

    this.reasoningSeen = true;
    if (this.reasoningStartTime === null) {
      this.reasoningStartTime = Date.now();
    }
    if (this.reasoningStatus === "idle") {
      this.reasoningStatus = "reasoning";
    }
  }

  /**
   * Transition reasoning to complete once visible answer text starts flowing.
   */
  private completeReasoning(): void {
    if (!this.excludeThinking && this.reasoningSeen) {
      this.reasoningStatus = "complete";
    }
  }

  /**
   * Append visible answer text.
   *
   * @param text - Visible answer delta.
   */
  private appendVisibleText(text?: string): void {
    if (!text) {
      return;
    }

    this.visibleText += stripSpecialTokens(text);
    if (this.reasoningStatus === "reasoning") {
      this.completeReasoning();
    }
  }

  /**
   * Append reasoning transcript text while enforcing the persistence cap.
   *
   * @param text - Transcript delta.
   */
  private appendThinkingText(text?: string): void {
    if (!text) {
      return;
    }

    this.startReasoning();
    if (this.excludeThinking || this.transcriptTruncated) {
      return;
    }

    const nextTranscript = this.thinkingTranscript + stripSpecialTokens(text);
    if (nextTranscript.length <= THINKING_TRANSCRIPT_LIMIT) {
      this.thinkingTranscript = nextTranscript;
      return;
    }

    this.thinkingTranscript =
      nextTranscript.slice(0, THINKING_TRANSCRIPT_LIMIT) + THINKING_TRANSCRIPT_TRUNCATION_SUFFIX;
    this.transcriptTruncated = true;
  }

  /**
   * Get elapsed reasoning time in whole seconds.
   *
   * @returns Whole seconds since reasoning started.
   */
  private getElapsedSeconds(): number {
    if (this.reasoningStartTime === null) {
      return 0;
    }

    return Math.max(0, Math.floor((Date.now() - this.reasoningStartTime) / 1000));
  }

  /**
   * Rebuild derived text from the accumulated raw text-level `<think>` transcript.
   */
  private syncTextLevelThinkingState(): void {
    const parsedState = parseTextLevelThinking(this.rawTextLevelContent);

    if (!parsedState.hasReasoning) {
      this.visibleText = parsedState.visibleText;
      return;
    }

    this.startReasoning();
    this.visibleText = parsedState.visibleText;

    if (this.excludeThinking) {
      if (parsedState.sawReasoningClose && this.reasoningStatus === "reasoning") {
        this.completeReasoning();
      }
      return;
    }

    if (parsedState.transcript.length <= THINKING_TRANSCRIPT_LIMIT) {
      this.thinkingTranscript = parsedState.transcript;
      this.transcriptTruncated = false;
    } else if (!this.transcriptTruncated) {
      this.thinkingTranscript =
        parsedState.transcript.slice(0, THINKING_TRANSCRIPT_LIMIT) +
        THINKING_TRANSCRIPT_TRUNCATION_SUFFIX;
      this.transcriptTruncated = true;
    }

    if (
      parsedState.sawReasoningClose &&
      (!parsedState.isInsideReasoning || parsedState.visibleText.length > 0)
    ) {
      this.completeReasoning();
    }
  }

  /**
   * Build the current streamed output.
   *
   * @returns Display text for the in-progress assistant message.
   */
  private buildOutput(): string {
    const visibleAnswer = this.errorResponse
      ? `${this.visibleText}${this.errorResponse}`
      : this.visibleText;

    if (this.excludeThinking || !this.reasoningSeen || !this.thinkingTranscript) {
      return visibleAnswer;
    }

    const payload = createChatReasoningPayload(
      this.thinkingTranscript,
      this.getElapsedSeconds(),
      this.reasoningStatus === "reasoning" ? "reasoning" : "complete"
    );

    return composeReasoningMessage(payload, visibleAnswer);
  }

  /**
   * Push the latest composed output to the UI.
   */
  private emit(): void {
    this.updateCurrentAiMessage(this.buildOutput());
  }

  /**
   * Accumulate native tool call chunks during streaming.
   *
   * @param chunk - Raw streamed chunk.
   */
  private handleToolCallChunks(chunk: any): void {
    const toolCallChunks = chunk.tool_call_chunks;
    if (!toolCallChunks || !Array.isArray(toolCallChunks)) {
      return;
    }

    for (const toolCallChunk of toolCallChunks) {
      const index = toolCallChunk.index ?? 0;
      const existingChunk = this.toolCallChunks.get(index) || { name: "", args: "" };

      if (toolCallChunk.id) {
        existingChunk.id = toolCallChunk.id;
      }
      if (toolCallChunk.name) {
        existingChunk.name += toolCallChunk.name;
      }
      if (toolCallChunk.args) {
        existingChunk.args += toolCallChunk.args;
      }

      this.toolCallChunks.set(index, existingChunk);
    }
  }

  /**
   * Process a Claude array-based streaming chunk.
   *
   * @param content - Claude content array.
   */
  private handleClaudeChunk(content: any[]): void {
    for (const item of content) {
      if (item.type === "thinking") {
        this.appendThinkingText(item.thinking);
        continue;
      }

      if (item.type === "text") {
        this.appendVisibleText(item.text);
      }
    }
  }

  /**
   * Process a non-Claude chunk, including native reasoning providers and text-level think tags.
   *
   * @param chunk - Raw streamed chunk.
   */
  private handleStandardChunk(chunk: any): void {
    const deepseekReasoning = chunk.additional_kwargs?.reasoning_content;
    const openRouterReasoning = chunk.additional_kwargs?.delta?.reasoning;
    const content = typeof chunk.content === "string" ? chunk.content : "";

    if (typeof deepseekReasoning === "string" && deepseekReasoning.length > 0) {
      this.appendThinkingText(deepseekReasoning);
    }

    if (typeof openRouterReasoning === "string" && openRouterReasoning.length > 0) {
      this.appendThinkingText(openRouterReasoning);
    }

    if (
      content &&
      !this.reasoningSeen &&
      !deepseekReasoning &&
      !openRouterReasoning &&
      !chunk.additional_kwargs?.reasoning_details
    ) {
      this.rawTextLevelContent += stripSpecialTokens(content);
      this.syncTextLevelThinkingState();
      return;
    }

    this.appendVisibleText(content);
  }

  /**
   * Process a streamed model chunk.
   *
   * @param chunk - Raw streamed chunk.
   */
  processChunk(chunk: any): void {
    const truncationResult = detectTruncation(chunk);
    if (truncationResult.wasTruncated) {
      this.wasTruncated = true;
    }

    const usage = extractTokenUsage(chunk);
    if (usage) {
      this.tokenUsage = usage;
    }

    this.handleToolCallChunks(chunk);

    if (Array.isArray(chunk.content)) {
      this.handleClaudeChunk(chunk.content);
    } else {
      this.handleStandardChunk(chunk);
    }

    this.emit();
  }

  /**
   * Append a formatted error chunk to the final visible answer.
   *
   * @param errorMessage - Error message to format.
   */
  processErrorChunk(errorMessage: string): void {
    this.errorResponse = formatErrorChunk(errorMessage);
  }

  /**
   * Get accumulated native tool calls.
   *
   * @returns Parsed native tool calls.
   */
  getToolCalls(): NativeToolCall[] {
    if (this.accumulatedToolCalls.length > 0) {
      return this.accumulatedToolCalls;
    }

    return buildToolCallsFromChunks(this.toolCallChunks);
  }

  /**
   * Check whether any tool calls were accumulated.
   *
   * @returns True when tool calls are present.
   */
  hasToolCalls(): boolean {
    return this.toolCallChunks.size > 0 || this.accumulatedToolCalls.length > 0;
  }

  /**
   * Set pre-accumulated tool calls for non-streaming responses.
   *
   * @param toolCalls - Native tool calls to store.
   */
  setToolCalls(toolCalls: NativeToolCall[]): void {
    this.accumulatedToolCalls = toolCalls;
  }

  /**
   * Build an AIMessage from the clean visible answer text plus tool calls.
   *
   * @returns LangChain AIMessage instance.
   */
  buildAIMessage(): AIMessage {
    return createAIMessageWithToolCalls(this.visibleText, this.getToolCalls());
  }

  /**
   * Finalize the stream and return the last composed output.
   *
   * @returns Final streaming result.
   */
  close(): StreamingResult {
    if (this.rawTextLevelContent) {
      this.syncTextLevelThinkingState();
    }

    if (!this.excludeThinking && this.reasoningSeen) {
      this.completeReasoning();
    }

    const finalContent = this.buildOutput();
    this.updateCurrentAiMessage(finalContent);

    return {
      content: finalContent,
      wasTruncated: this.wasTruncated,
      tokenUsage: this.tokenUsage,
    };
  }
}
