import { getCurrentProject } from "@/aiParams";
import { processPrompt, type ProcessedPromptResult } from "@/commands/customCommandUtils";
import { PromptContextEngine } from "@/context/PromptContextEngine";
import {
  PromptContextEnvelope,
  PromptLayerId,
  PromptLayerSegment,
} from "@/context/PromptContextTypes";
import type ChainManager from "@/LLMProviders/chainManager";
import { logInfo, logWarn } from "@/logger";
import { injectVirtualToolMarkers, RuntimeChainPolicy } from "@/runtime/RuntimeChainPolicy";
import type { LegacyChainId } from "@/runtime/ChainPreset";
import { getSettings } from "@/settings/model";
import {
  getEffectiveUserPrompt,
  getSystemPrompt,
  getSystemPromptWithMemory,
} from "@/system-prompts/systemPromptBuilder";
import { FileParserManager } from "@/tools/FileParserManager";
import { ChatMessage } from "@/types/message";
import { TFile, Vault } from "obsidian";
import { ContextManager } from "./ContextManager";
import { MessageRepository } from "./MessageRepository";

export interface PreparedMessageResult {
  preparedMessage: ChatMessage;
  processedContent: string;
  contextEnvelope?: PromptContextEnvelope;
}

interface PrepareMessageParams {
  message: ChatMessage;
  messageRepo: MessageRepository;
  legacyChainId: LegacyChainId;
  vault: Vault;
  runtimePolicy: RuntimeChainPolicy;
  includeActiveNote?: boolean;
  activeNote: TFile | null;
  updateLoadingMessage?: (message: string) => void;
}

/**
 * Shared request preparation for chat and Telegram tool chains.
 * Builds the persisted envelope from stored message state, then optionally
 * overlays runtime-only policies such as Telegram's virtual manual-tool markers.
 */
export class MessagePreparationService {
  private readonly contextManager = ContextManager.getInstance();
  private readonly promptContextEngine = PromptContextEngine.getInstance();

  constructor(
    private readonly chainManager: ChainManager,
    private readonly fileParserManager: FileParserManager
  ) {}

  /**
   * Prepare a stored user message for chain execution and persistence.
   */
  async prepareMessage(params: PrepareMessageParams): Promise<PreparedMessageResult> {
    const { processedPrompt: systemPrompt, includedFiles: systemPromptIncludedFiles } =
      await this.getSystemPromptForMessage(params.runtimePolicy, params.vault, params.activeNote);

    const { processedContent, contextEnvelope } = await this.contextManager.processMessageContext(
      params.message,
      this.fileParserManager,
      params.vault,
      params.legacyChainId,
      params.runtimePolicy,
      params.includeActiveNote ?? false,
      params.activeNote,
      params.messageRepo,
      systemPrompt,
      systemPromptIncludedFiles,
      params.updateLoadingMessage
    );

    const preparedMessage = this.buildPreparedMessage({
      message: params.message,
      processedContent,
      contextEnvelope,
      runtimePolicy: params.runtimePolicy,
    });

    return {
      preparedMessage,
      processedContent,
      contextEnvelope,
    };
  }

  /**
   * Process template variables inside user-defined prompt content only.
   */
  private async processSystemPromptTemplates(
    prompt: string,
    vault: Vault,
    activeNote: TFile | null
  ): Promise<ProcessedPromptResult> {
    if (!prompt.includes("{") || !prompt.includes("}")) {
      return { processedPrompt: prompt, includedFiles: [] };
    }

    if (!getSettings().enableCustomPromptTemplating) {
      return { processedPrompt: prompt, includedFiles: [] };
    }

    try {
      const result = await processPrompt(prompt, "", vault, activeNote, true);
      return {
        processedPrompt: result.processedPrompt.trimEnd(),
        includedFiles: result.includedFiles,
      };
    } catch (error) {
      logWarn("[MessagePreparationService] Error processing system prompt templates:", error);
      return { processedPrompt: prompt, includedFiles: [] };
    }
  }

  /**
   * Replace the custom-instructions portion of the canonical system prompt.
   */
  private injectProcessedUserCustomPromptIntoSystemPrompt(params: {
    systemPromptWithoutMemory: string;
    userCustomPrompt: string;
    processedUserCustomPrompt: string;
  }): string {
    const { systemPromptWithoutMemory, userCustomPrompt, processedUserCustomPrompt } = params;
    const userInstructionsBlockRegex =
      /<user_custom_instructions>\n[\s\S]*?\n<\/user_custom_instructions>/;

    if (userInstructionsBlockRegex.test(systemPromptWithoutMemory)) {
      return systemPromptWithoutMemory.replace(
        userInstructionsBlockRegex,
        () =>
          `<user_custom_instructions>\n${processedUserCustomPrompt}\n</user_custom_instructions>`
      );
    }

    if (systemPromptWithoutMemory === userCustomPrompt) {
      return processedUserCustomPrompt;
    }

    logInfo(
      "[MessagePreparationService] Could not locate <user_custom_instructions> block for injection; returning original system prompt."
    );
    return systemPromptWithoutMemory;
  }

  /**
   * Preserve the memory-prefixed system prompt while replacing only the tail
   * system prompt content.
   */
  private replaceSystemPromptWithoutMemoryInBasePrompt(params: {
    basePromptWithMemory: string;
    systemPromptWithoutMemory: string;
    processedSystemPromptWithoutMemory: string;
  }): string {
    const { basePromptWithMemory, systemPromptWithoutMemory, processedSystemPromptWithoutMemory } =
      params;

    if (!basePromptWithMemory.endsWith(systemPromptWithoutMemory)) {
      logInfo(
        "[MessagePreparationService] basePromptWithMemory does not end with systemPromptWithoutMemory; returning original base prompt."
      );
      return basePromptWithMemory;
    }

    const prefix = basePromptWithMemory.slice(
      0,
      basePromptWithMemory.length - systemPromptWithoutMemory.length
    );
    return `${prefix}${processedSystemPromptWithoutMemory}`;
  }

  /**
   * Resolve the per-message system prompt, including project-mode additions.
   */
  private async getSystemPromptForMessage(
    runtimePolicy: RuntimeChainPolicy,
    vault: Vault,
    activeNote: TFile | null
  ): Promise<ProcessedPromptResult> {
    const promptTarget = runtimePolicy.promptTarget;
    const userCustomPrompt = getEffectiveUserPrompt(promptTarget);
    const allIncludedFiles: TFile[] = [];
    const basePromptWithMemory = await getSystemPromptWithMemory(
      this.chainManager.userMemoryManager,
      promptTarget,
      runtimePolicy.promptProfile
    );
    const systemPromptWithoutMemory = getSystemPrompt(promptTarget, runtimePolicy.promptProfile);

    let processedBasePromptWithMemory = basePromptWithMemory;

    if (userCustomPrompt) {
      const userPromptResult = await this.processSystemPromptTemplates(
        userCustomPrompt,
        vault,
        activeNote
      );

      const processedSystemPromptWithoutMemory =
        this.injectProcessedUserCustomPromptIntoSystemPrompt({
          systemPromptWithoutMemory,
          userCustomPrompt,
          processedUserCustomPrompt: userPromptResult.processedPrompt,
        });

      const nextProcessedBasePromptWithMemory = this.replaceSystemPromptWithoutMemoryInBasePrompt({
        basePromptWithMemory,
        systemPromptWithoutMemory,
        processedSystemPromptWithoutMemory,
      });

      if (nextProcessedBasePromptWithMemory !== basePromptWithMemory) {
        allIncludedFiles.push(...userPromptResult.includedFiles);
      }

      processedBasePromptWithMemory = nextProcessedBasePromptWithMemory;
    }

    if (runtimePolicy.promptProfile === "project_agent") {
      const project = getCurrentProject();
      if (project) {
        const { default: ProjectManager } = await import("@/LLMProviders/projectManager");
        const context = await ProjectManager.instance.getProjectContext(project.id);
        const projectPromptResult = await this.processSystemPromptTemplates(
          project.systemPrompt,
          vault,
          activeNote
        );
        allIncludedFiles.push(...projectPromptResult.includedFiles);

        let result = `${processedBasePromptWithMemory}\n\n<project_system_prompt>\n${projectPromptResult.processedPrompt}\n</project_system_prompt>`;

        if (context) {
          const MAX_PROJECT_CONTEXT_CHARS = 600_000 * 4;
          let projectContext = context;
          if (context.length > MAX_PROJECT_CONTEXT_CHARS) {
            projectContext = context.substring(0, MAX_PROJECT_CONTEXT_CHARS);
            logWarn(
              `Project context truncated from ${Math.round(context.length / 4000)}k to ${Math.round(MAX_PROJECT_CONTEXT_CHARS / 4000)}k estimated tokens to stay within token budget`
            );
          }
          result += `\n\n<project_context>\n${projectContext}\n</project_context>`;
        }

        return {
          processedPrompt: result,
          includedFiles: allIncludedFiles,
        };
      }
    }

    return {
      processedPrompt: processedBasePromptWithMemory,
      includedFiles: allIncludedFiles,
    };
  }

  /**
   * Build the runtime ChatMessage from the stored envelope and apply any
   * request-only policies.
   */
  private buildPreparedMessage(params: {
    message: ChatMessage;
    processedContent: string;
    contextEnvelope?: PromptContextEnvelope;
    runtimePolicy: RuntimeChainPolicy;
  }): ChatMessage {
    const baseMessage: ChatMessage = {
      ...params.message,
      message: params.processedContent,
      originalMessage: params.message.originalMessage || params.message.message,
      contextEnvelope: params.contextEnvelope,
    };

    const shouldInjectVirtualMarkers =
      params.runtimePolicy.manualToolPolicy === "forced_virtual_markers";

    if (!shouldInjectVirtualMarkers || !params.contextEnvelope) {
      return baseMessage;
    }

    const l5Layer = params.contextEnvelope.layers.find((layer) => layer.id === "L5_USER");
    const runtimeL5Text = injectVirtualToolMarkers(
      l5Layer?.text || baseMessage.originalMessage || baseMessage.message
    );

    if (runtimeL5Text === (l5Layer?.text || "")) {
      return baseMessage;
    }

    const runtimeEnvelope = this.buildEnvelopeWithL5Override(params.contextEnvelope, runtimeL5Text);
    return {
      ...baseMessage,
      message: runtimeEnvelope.serializedText,
      contextEnvelope: runtimeEnvelope,
    };
  }

  /**
   * Rebuild an envelope with a modified L5 layer while preserving all other
   * segments and metadata.
   */
  private buildEnvelopeWithL5Override(
    envelope: PromptContextEnvelope,
    l5Text: string
  ): PromptContextEnvelope {
    const layerSegments = envelope.layers.reduce<
      Partial<Record<PromptLayerId, PromptLayerSegment[]>>
    >((acc, layer) => {
      if (layer.id === "L5_USER") {
        const baseSegment = layer.segments[0] ?? {
          id: `${envelope.messageId ?? "message"}-user`,
          stable: false,
          metadata: { source: "user_input" },
        };
        acc[layer.id] = [
          {
            ...baseSegment,
            content: l5Text,
          },
        ];
        return acc;
      }

      acc[layer.id] = layer.segments.map((segment) => ({
        ...segment,
      }));
      return acc;
    }, {});

    return this.promptContextEngine.buildEnvelope({
      conversationId: envelope.conversationId,
      messageId: envelope.messageId,
      layerSegments,
    });
  }
}
