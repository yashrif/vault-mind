import { UserMemoryManager } from "@/memory/UserMemoryManager";
import { getSettings } from "@/settings/model";
import { DEFAULT_SYSTEM_PROMPT } from "@/constants";
import { logInfo } from "@/logger";
import {
  getDisableBuiltinSystemPromptForTarget,
  getEffectiveSystemPromptContent,
} from "@/system-prompts/state";
import { PromptResolutionTarget } from "@/runtime/RuntimeChainPolicy";

/**
 * Get the effective user custom prompt with legacy fallback.
 * This is the single source of truth for user prompt content.
 *
 * Priority: file-based (session override > global default) > legacy setting > ""
 *
 * @returns The user custom prompt content
 */
export function getEffectiveUserPrompt(target: PromptResolutionTarget = "default"): string {
  const fileBasedUserPrompt = getEffectiveSystemPromptContent(target);

  // Fallback: if file-based prompts are unavailable (e.g. migration failed to write files),
  // continue honoring the legacy settings field to fulfill the promise in migration error message.
  return fileBasedUserPrompt || getSettings()?.userSystemPrompt || "";
}

/**
 * Build the complete system prompt for the current session.
 * Combines builtin prompt with user custom instructions.
 *
 * Priority for user prompt: session override > global default > legacy setting fallback > ""
 *
 * @returns The complete system prompt string
 */
export function getSystemPrompt(target: PromptResolutionTarget = "default"): string {
  const userPrompt = getEffectiveUserPrompt(target);

  // Check if builtin prompt is disabled for current session
  const disableBuiltin = getDisableBuiltinSystemPromptForTarget(target);

  if (disableBuiltin) {
    // Only return user custom prompt
    return userPrompt;
  }

  // Default behavior: use builtin prompt
  const basePrompt = DEFAULT_SYSTEM_PROMPT;

  if (userPrompt) {
    return `${basePrompt}
<user_custom_instructions>
${userPrompt}
</user_custom_instructions>`;
  }
  return basePrompt;
}

/**
 * Build system prompt with user memory prefix.
 * Memory content is prepended to the system prompt if available.
 *
 * @param userMemoryManager - Optional memory manager to fetch user memory
 * @returns The complete system prompt with memory prefix
 */
export async function getSystemPromptWithMemory(
  userMemoryManager: UserMemoryManager | undefined,
  target: PromptResolutionTarget = "default"
): Promise<string> {
  const systemPrompt = getSystemPrompt(target);

  if (!userMemoryManager) {
    logInfo("No UserMemoryManager provided to getSystemPromptWithMemory");
    return systemPrompt;
  }
  const memoryPrompt = await userMemoryManager.getUserMemoryPrompt();

  // Only include user_memory section if there's actual memory content
  if (!memoryPrompt) {
    return systemPrompt;
  }

  return `${memoryPrompt}\n${systemPrompt}`;
}
