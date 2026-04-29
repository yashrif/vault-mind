import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import type { StreamingResult } from "@/types/message";
import { withSuppressedTokenWarnings } from "@/utils";

import { ThinkBlockStreamer } from "./ThinkBlockStreamer";
import type { RunnerMessage } from "./runnerMessages";

export interface StreamRawModelResponseOptions {
  chatModel: BaseChatModel;
  messages: RunnerMessage[];
  abortController: AbortController;
  updateCurrentAiMessage: (message: string) => void;
  excludeThinking: boolean;
  handleError?: (error: any, processErrorChunk: (message: string) => void) => Promise<void> | void;
}

/**
 * Streams a raw chat model response through the shared thinking-block streamer.
 */
export async function streamRawModelResponse(
  options: StreamRawModelResponseOptions
): Promise<StreamingResult> {
  const streamer = new ThinkBlockStreamer(options.updateCurrentAiMessage, options.excludeThinking);

  try {
    const stream = await withSuppressedTokenWarnings(() =>
      options.chatModel.stream(options.messages as any, {
        signal: options.abortController.signal,
      })
    );

    for await (const chunk of stream) {
      if (options.abortController.signal.aborted) {
        break;
      }
      streamer.processChunk(chunk);
    }
  } catch (error: any) {
    if (error.name !== "AbortError" && !options.abortController.signal.aborted) {
      if (options.handleError) {
        await options.handleError(error, streamer.processErrorChunk.bind(streamer));
        return streamer.close();
      }
      throw error;
    }
  }

  return streamer.close();
}
