import { ModelType } from "@/aiParams";
import {
  BUILTIN_AUDIO_STT_MODELS,
  BUILTIN_CHAT_MODELS,
  BUILTIN_EMBEDDING_MODELS,
  ChatModelProviders,
  EmbeddingModelProviders,
  ModelCapability,
} from "@/constants";
import { CortexSettings } from "@/settings/model";

export interface ModelCategoryConfig {
  label: string;
  settingField: keyof Pick<
    CortexSettings,
    "activeModels" | "activeEmbeddingModels" | "activeAudioSTTModels"
  >;
  keyField: keyof Pick<
    CortexSettings,
    "defaultModelKey" | "embeddingModelKey" | "audioSTTModelKey"
  >;
  builtIns: typeof BUILTIN_CHAT_MODELS;
  /** Provider enum values available in the Add/Edit dialogs for this category */
  providerValues: string[];
  /** Whether the capabilities multi-select is shown in Add/Edit dialogs */
  supportsCapabilities: boolean;
  /** Subset of capabilities shown in Add/Edit dialogs. If absent, all capabilities are shown. */
  allowedCapabilities?: ModelCapability[];
  /** Whether Azure embedding-specific fields are shown */
  showAzureEmbeddingFields: boolean;
  /** Whether the Enable/Disable checkbox is shown in ModelTable rows */
  showEnableToggle: boolean;
  /** Default provider shown in the Add dialog */
  defaultProvider: string;
}

export const MODEL_CATEGORIES: Record<ModelType, ModelCategoryConfig> = {
  chat: {
    label: "Chat Models",
    settingField: "activeModels",
    keyField: "defaultModelKey",
    builtIns: BUILTIN_CHAT_MODELS,
    providerValues: Object.values(ChatModelProviders),
    supportsCapabilities: true,
    allowedCapabilities: [
      ModelCapability.REASONING,
      ModelCapability.VISION,
      ModelCapability.WEB_SEARCH,
    ],
    showAzureEmbeddingFields: false,
    showEnableToggle: true,
    defaultProvider: ChatModelProviders.OPENROUTERAI,
  },
  embedding: {
    label: "Embedding Models",
    settingField: "activeEmbeddingModels",
    keyField: "embeddingModelKey",
    builtIns: BUILTIN_EMBEDDING_MODELS,
    providerValues: Object.values(EmbeddingModelProviders),
    supportsCapabilities: false,
    showAzureEmbeddingFields: true,
    showEnableToggle: false,
    defaultProvider: EmbeddingModelProviders.OPENAI,
  },
  stt: {
    label: "Audio STT Models",
    settingField: "activeAudioSTTModels",
    keyField: "audioSTTModelKey",
    builtIns: BUILTIN_AUDIO_STT_MODELS,
    // STT providers are a subset of ChatModelProviders; Groq is the first
    providerValues: [ChatModelProviders.GROQ],
    supportsCapabilities: false,
    showAzureEmbeddingFields: false,
    showEnableToggle: false,
    defaultProvider: ChatModelProviders.GROQ,
  },
};

export const MODEL_CATEGORY_ORDER: ModelType[] = ["chat", "embedding", "stt"];
