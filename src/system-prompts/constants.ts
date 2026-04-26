import { UserSystemPrompt } from "@/system-prompts/type";

export const EMPTY_SYSTEM_PROMPT: UserSystemPrompt = {
  title: "",
  content: "",
  createdMs: 0,
  modifiedMs: 0,
  lastUsedMs: 0,
};

// System prompt frontmatter property constants
export const Cortex_SYSTEM_PROMPT_CREATED = "cortex-system-prompt-created";
export const Cortex_SYSTEM_PROMPT_MODIFIED = "cortex-system-prompt-modified";
export const Cortex_SYSTEM_PROMPT_LAST_USED = "cortex-system-prompt-last-used";
export const Cortex_SYSTEM_PROMPT_DEFAULT = "cortex-system-prompt-default";
