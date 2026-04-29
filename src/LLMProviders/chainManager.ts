import { getChainPresetId, getCurrentProject, getModelKey, SetChainOptions } from "@/aiParams";
import type { Document } from "@langchain/core/documents";
import { BUILTIN_CHAT_MODELS } from "@/constants";
import { AutonomousAgentChainRunner, buildChainPreset } from "@/LLMProviders/chainRunner/index";
import { logError, logInfo } from "@/logger";
import type { ChainPresetId } from "@/runtime/ChainPreset";
import { getSettings, subscribeToSettingsChange } from "@/settings/model";
import { ChatMessage } from "@/types/message";
import { findCustomModel } from "@/utils";
import { MissingModelKeyError } from "@/error";
import { App, Notice } from "obsidian";
import ChatModelManager from "./chatModelManager";
import MemoryManager from "./memoryManager";
import PromptManager from "./promptManager";
import { UserMemoryManager } from "@/memory/UserMemoryManager";

export default class ChainManager {
  private retrievedDocuments: Document[] = [];

  public getRetrievedDocuments(): Document[] {
    return this.retrievedDocuments;
  }

  public app: App;
  public chatModelManager: ChatModelManager;
  public memoryManager: MemoryManager;
  public promptManager: PromptManager;
  public userMemoryManager: UserMemoryManager;
  private pendingModelError: Error | null = null;

  constructor(app: App) {
    // Instantiate singletons
    this.app = app;
    this.memoryManager = MemoryManager.getInstance();
    this.chatModelManager = ChatModelManager.getInstance();
    this.promptManager = PromptManager.getInstance();
    this.userMemoryManager = new UserMemoryManager(app);

    // Initialize async operations
    this.initialize();

    subscribeToSettingsChange(async () => {
      await this.createChainWithNewModel();
    });
  }

  private async initialize() {
    await this.createChainWithNewModel();
  }

  private validateChatModel() {
    if (this.pendingModelError) {
      throw this.pendingModelError;
    }

    if (!this.chatModelManager.validateChatModel(this.chatModelManager.getChatModel())) {
      const errorMsg =
        "Chat model is not initialized properly, check your API key in Cortex setting and make sure you have API access.";
      throw new MissingModelKeyError(errorMsg);
    }
  }

  public storeRetrieverDocuments(documents: Document[]) {
    this.retrievedDocuments = documents;
  }

  /**
   * Update the active model and create a new chain with the specified model
   * name.
   */
  async createChainWithNewModel(
    options: SetChainOptions = {},
    neededReInitChatMode: boolean = true
  ): Promise<void> {
    let newModelKey: string | undefined;
    const presetId = getChainPresetId();
    const currentProject = getCurrentProject();
    const isProjectPreset = presetId === "project_agent";

    if (isProjectPreset && !currentProject) {
      return;
    }

    try {
      await this.refreshSearchIndexIfRequested(options);

      newModelKey = isProjectPreset ? currentProject?.projectModelKey : getModelKey();

      if (!newModelKey) {
        throw new MissingModelKeyError("No model key found. Please select a model in settings.");
      }

      if (neededReInitChatMode) {
        let customModel = findCustomModel(newModelKey, getSettings().activeModels);
        if (!customModel) {
          // Reset default model if no model is found
          console.error("Resetting default model. No model configuration found for: ", newModelKey);
          customModel = BUILTIN_CHAT_MODELS[0];
          newModelKey = customModel.name + "|" + customModel.provider;
        }

        // Add validation for project mode
        if (isProjectPreset && !customModel.projectEnabled) {
          // If the model is not project-enabled, find the first project-enabled model
          const projectEnabledModel = getSettings().activeModels.find(
            (m) => m.enabled && m.projectEnabled
          );
          if (projectEnabledModel) {
            customModel = projectEnabledModel;
            newModelKey = projectEnabledModel.name + "|" + projectEnabledModel.provider;
            new Notice(
              `Model ${customModel.name} is not available in project mode. Switching to ${projectEnabledModel.name}.`
            );
          } else {
            throw new Error(
              "No project-enabled models available. Please enable a model for project mode in settings."
            );
          }
        }

        const mergedModel = {
          ...customModel,
          ...currentProject?.modelConfigs,
        };
        await this.chatModelManager.setChatModel(mergedModel);
        this.pendingModelError = null;
      }

      logInfo(`Setting model to ${newModelKey}`);
    } catch (error) {
      this.pendingModelError = error instanceof Error ? error : new Error(String(error));
      logError(`createChainWithNewModel failed: ${error}`);
      logInfo(`modelKey: ${newModelKey || getModelKey()}`);
    }
  }

  private async refreshSearchIndexIfRequested(options: SetChainOptions) {
    if (options.refreshIndex) {
      const settings = getSettings();
      if (settings.enableSemanticSearchV3) {
        // Use VectorStoreManager for Orama indexing
        const VectorStoreManager = (await import("@/search/vectorStoreManager")).default;
        await VectorStoreManager.getInstance().indexVaultToVectorStore(false);
      }
      // V3 search builds indexes on demand, no action needed
    }
  }

  async runChain(
    userMessage: ChatMessage,
    abortController: AbortController,
    updateCurrentAiMessage: (message: string) => void,
    addMessage: (message: ChatMessage) => void,
    options: {
      debug?: boolean;
      ignoreSystemMessage?: boolean;
      updateLoading?: (loading: boolean) => void;
      /** Pin a specific preset, bypassing the mutable UI preset atom. */
      presetId?: ChainPresetId;
      /** Request-scoped MemoryManager override — use instead of the shared singleton. */
      memoryManager?: import("@/LLMProviders/memoryManager").default;
      /** Request-scoped runtime policy override. */
      runtimePolicy?: import("@/runtime/RuntimeChainPolicy").RuntimeChainPolicy;
    } = {}
  ) {
    const resolvedPresetId = options.presetId ?? getChainPresetId();
    const preset = buildChainPreset({
      presetId: resolvedPresetId,
      projectId: getCurrentProject()?.id,
      vault: this.app?.vault,
      vaultAvailable: !!this.app?.vault,
    });
    const runtimePolicy = options.runtimePolicy ?? preset.runtimePolicy;

    const l5Text = userMessage.contextEnvelope?.layers.find((l) => l.id === "L5_USER")?.text;
    logInfo(
      "Step 0: Initial user message:\n",
      l5Text || userMessage.originalMessage || userMessage.message
    );

    this.validateChatModel();

    const chainRunner = new AutonomousAgentChainRunner(this);
    return await chainRunner.run(userMessage, abortController, updateCurrentAiMessage, addMessage, {
      ...options,
      preset,
      runtimePolicy,
    });
  }
}
