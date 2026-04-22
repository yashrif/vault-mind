import { ToolChainRunner } from "./ToolChainRunner";

/**
 * ProjectChainRunner - Chain runner for project-based chats
 *
 * Project context is automatically added to L1 via ChatManager.getSystemPromptForMessage()
 * No override needed - inherits all behavior from ToolChainRunner
 */
export class ProjectChainRunner extends ToolChainRunner {
  // No overrides needed - project context automatically in L1 via ChatManager
}
