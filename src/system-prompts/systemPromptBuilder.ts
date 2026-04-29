import { UserMemoryManager } from "@/memory/UserMemoryManager";
import { getSettings } from "@/settings/model";
import { DEFAULT_SYSTEM_PROMPT } from "@/constants";
import { logInfo } from "@/logger";
import {
  getDisableBuiltinSystemPromptForTarget,
  getEffectiveSystemPromptContent,
} from "@/system-prompts/state";
import { PromptResolutionTarget } from "@/runtime/RuntimeChainPolicy";
import type { PromptProfile } from "@/runtime/ChainPreset";

/**
 * Return the runtime instruction suffix for a prompt profile.
 *
 * @param profile - Runtime prompt profile selected by the active preset.
 * @returns Profile-specific system prompt instructions.
 */
export function getPromptProfileInstructions(profile: PromptProfile): string {
  switch (profile) {
    case "chat":
      return "You are in Chat mode. Be conversational and do not perform autonomous write actions.";
    case "chat_rag":
      return "You are in Chat with vault retrieval enabled. Prefer localSearch for vault-grounded questions, but answer greetings and generic non-vault requests without searching.";
    case "agent":
      return "You are in Agent mode. Use available tools according to the resolved permissions and never claim a tool result you did not receive.";
    case "project_agent":
      return "You are in Project Agent mode. Use project context and available tools according to the resolved permissions.";
    case "telegram":
      return "You are replying through Telegram. Keep wording transport-safe and concise, and respect Telegram formatting constraints.";
  }
}

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
 * @param target - Prompt resolution target for session/global custom instructions.
 * @param profile - Runtime prompt profile selected by the active preset.
 * @returns The complete system prompt string
 */
export function getSystemPrompt(
  target: PromptResolutionTarget = "default",
  profile: PromptProfile = "chat"
): string {
  const userPrompt = getEffectiveUserPrompt(target);

  // Check if builtin prompt is disabled for current session
  const disableBuiltin = getDisableBuiltinSystemPromptForTarget(target);

  if (disableBuiltin) {
    // Only return user custom prompt
    return userPrompt;
  }

  // Default behavior: use builtin prompt
  const basePrompt = `${DEFAULT_SYSTEM_PROMPT}\n\n${getPromptProfileInstructions(profile)}`;

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
 * @param target - Prompt resolution target for session/global custom instructions.
 * @param profile - Runtime prompt profile selected by the active preset.
 * @returns The complete system prompt with memory prefix
 */
export async function getSystemPromptWithMemory(
  userMemoryManager: UserMemoryManager | undefined,
  target: PromptResolutionTarget = "default",
  profile: PromptProfile = "chat"
): Promise<string> {
  const systemPrompt = getSystemPrompt(target, profile);

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
