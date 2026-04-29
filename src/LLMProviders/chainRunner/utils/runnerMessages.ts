import type MemoryManager from "@/LLMProviders/memoryManager";
import { LayerToMessagesConverter } from "@/context/LayerToMessagesConverter";
import type { ChatMessage } from "@/types/message";

import { loadAndAddChatHistory } from "./chatHistoryUtils";

export type RunnerMessageContent = string | Array<Record<string, unknown>>;

export interface RunnerMessage {
  role: string;
  content: RunnerMessageContent;
}

export interface BuildRunnerMessagesOptions {
  userMessage: ChatMessage;
  memory: MemoryManager;
  includeSystemMessage: boolean;
  buildMultimodalContent: (
    text: string,
    userMessage: ChatMessage
  ) => Promise<RunnerMessageContent> | RunnerMessageContent;
}

/**
 * Merges envelope text into the current user message's multimodal content.
 */
export function buildEnvelopeMultimodalContent(
  text: string,
  userMessage: ChatMessage
): RunnerMessageContent {
  if (!userMessage.content || !Array.isArray(userMessage.content)) {
    return text;
  }

  const hasTextItem = userMessage.content.some((item: any) => item.type === "text");
  const updatedContent = userMessage.content.map((item: any) => {
    if (item.type === "text") {
      return { ...item, text };
    }
    return item;
  });

  if (!hasTextItem && text) {
    updatedContent.unshift({ type: "text", text });
  }

  return updatedContent;
}

/**
 * Builds model-ready messages from a context envelope, memory history, and current user input.
 */
export async function buildRunnerMessages(
  options: BuildRunnerMessagesOptions
): Promise<RunnerMessage[]> {
  if (!options.userMessage.contextEnvelope) {
    throw new Error("[RunnerMessages] Context envelope is required but not available.");
  }

  const baseMessages = LayerToMessagesConverter.convert(options.userMessage.contextEnvelope, {
    includeSystemMessage: options.includeSystemMessage,
    mergeUserContent: true,
    debug: false,
  });

  const messages: RunnerMessage[] = [];
  const systemMessage = baseMessages.find((message) => message.role === "system");
  if (systemMessage) {
    messages.push({ role: "system", content: systemMessage.content });
  }

  await loadAndAddChatHistory(options.memory.getMemory(), messages);

  const userMessageContent = baseMessages.find((message) => message.role === "user");
  if (userMessageContent) {
    const content = await options.buildMultimodalContent(
      userMessageContent.content,
      options.userMessage
    );
    messages.push({ role: "user", content });
  }

  return messages;
}
