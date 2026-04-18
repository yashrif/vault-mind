import { CustomModel, ModelType } from "@/aiParams";
import { SettingItem } from "@/components/ui/setting-item";
import EmbeddingManager from "@/LLMProviders/embeddingManager";
import ProjectManager from "@/LLMProviders/projectManager";
import { logError } from "@/logger";
import { setSettings, updateSetting, useSettingsValue } from "@/settings/model";
import { MODEL_CATEGORIES } from "@/settings/v2/modelCategoryConfig";
import { ModelAddDialog } from "@/settings/v2/components/ModelAddDialog";
import { ModelEditModal } from "@/settings/v2/components/ModelEditDialog";
import { ModelTable } from "@/settings/v2/components/ModelTable";
import { omit } from "@/utils";
import { Notice } from "obsidian";
import React, { useState } from "react";

export const ModelSettings: React.FC = () => {
  const settings = useSettingsValue();
  const [showAddDialog, setShowAddDialog] = useState<ModelType | null>(null);

  const onCopyModel = (model: CustomModel, modelType: ModelType = "chat") => {
    const newModel: CustomModel = {
      ...omit(model, [
        "isBuiltIn",
        "core",
        "projectEnabled",
        "capabilities",
        "displayName",
        "dimensions",
      ]),
      name: `${model.name} (copy)`,
    };

    const settingField = MODEL_CATEGORIES[modelType].settingField;
    updateSetting(settingField, [...settings[settingField], newModel]);
  };

  const handleModelReorder = (newModels: CustomModel[], modelType: ModelType = "chat") => {
    updateSetting(MODEL_CATEGORIES[modelType].settingField, newModels);
  };

  const onDeleteModel = (modelKey: string, modelType: ModelType = "chat") => {
    const [modelName, provider] = modelKey.split("|");
    const settingField = MODEL_CATEGORIES[modelType].settingField;
    const keyField = MODEL_CATEGORIES[modelType].keyField;

    const updatedModels = settings[settingField].filter(
      (model) => !(model.name === modelName && model.provider === provider)
    );

    const currentKey = settings[keyField];
    let newKey = currentKey;
    if (modelKey === currentKey) {
      const newDefault = updatedModels.find((m) => m.enabled);
      newKey = newDefault ? `${newDefault.name}|${newDefault.provider}` : "";
    }

    setSettings({
      [settingField]: updatedModels,
      [keyField]: newKey,
    });
  };

  const handleModelUpdate = (
    modelType: ModelType,
    originalModel: CustomModel,
    updatedModel: CustomModel
  ) => {
    const settingField = MODEL_CATEGORIES[modelType].settingField;
    const modelIndex = settings[settingField].findIndex(
      (m) => m.name === originalModel.name && m.provider === originalModel.provider
    );
    if (modelIndex !== -1) {
      const updatedModels = [...settings[settingField]];
      updatedModels[modelIndex] = updatedModel;
      updateSetting(settingField, updatedModels);
    } else {
      new Notice("Could not find model to update");
      logError("Could not find model to update:", originalModel);
    }
  };

  const handleTableUpdate = (updatedModel: CustomModel, modelType: ModelType = "chat") => {
    const settingField = MODEL_CATEGORIES[modelType].settingField;
    const updatedModels = settings[settingField].map((m) =>
      m.name === updatedModel.name && m.provider === updatedModel.provider ? updatedModel : m
    );
    updateSetting(settingField, updatedModels);
  };

  const handleRefreshModels = (modelType: ModelType) => {
    const { settingField, builtIns, label } = MODEL_CATEGORIES[modelType];
    const customModels = settings[settingField].filter((m) => !m.isBuiltIn);
    updateSetting(settingField, [...builtIns, ...customModels]);
    new Notice(`${label} refreshed successfully`);
  };

  const handleEditModel = (model: CustomModel, modelType: ModelType = "chat") => {
    const modal = new ModelEditModal(app, model, modelType, handleModelUpdate);
    modal.open();
  };

  const getPingFn = (modelType: ModelType) => {
    if (modelType === "embedding") {
      return (model: CustomModel) => EmbeddingManager.getInstance().ping(model);
    }
    return (model: CustomModel) =>
      ProjectManager.instance.getCurrentChainManager().chatModelManager.ping(model);
  };

  return (
    <div className="tw-space-y-4">
      {/* Chat Models section */}
      <section>
        <ModelTable
          models={settings.activeModels}
          onEdit={(model) => handleEditModel(model, "chat")}
          onCopy={(model) => onCopyModel(model, "chat")}
          onDelete={(key) => onDeleteModel(key, "chat")}
          onAdd={() => setShowAddDialog("chat")}
          onUpdateModel={(model) => handleTableUpdate(model, "chat")}
          onReorderModels={(newModels) => handleModelReorder(newModels, "chat")}
          onRefresh={() => handleRefreshModels("chat")}
          title={MODEL_CATEGORIES.chat.label}
          showEnableToggle={MODEL_CATEGORIES.chat.showEnableToggle}
        />

        <ModelAddDialog
          open={showAddDialog === "chat"}
          onOpenChange={(open) => !open && setShowAddDialog(null)}
          onAdd={(model) => {
            updateSetting("activeModels", [...settings.activeModels, model]);
          }}
          ping={getPingFn("chat")}
          modelType="chat"
        />

        <div className="tw-space-y-4">
          <SettingItem
            type="slider"
            title="Conversation turns in context"
            description="The number of previous conversation turns to include in the context. Default is 15 turns, i.e. 30 messages."
            value={settings.contextTurns}
            onChange={(value) => updateSetting("contextTurns", value)}
            min={1}
            max={50}
            step={1}
          />
          <SettingItem
            type="slider"
            title="Auto-compact threshold"
            description="Automatically summarize context when it exceeds this token count. Set to maximum to make it less aggressive."
            min={64000}
            max={1000000}
            step={64000}
            value={settings.autoCompactThreshold}
            onChange={(value) => updateSetting("autoCompactThreshold", value)}
          />
        </div>
      </section>

      {/* Embedding Models section */}
      <section>
        <ModelTable
          models={settings.activeEmbeddingModels}
          onEdit={(model) => handleEditModel(model, "embedding")}
          onDelete={(key) => onDeleteModel(key, "embedding")}
          onCopy={(model) => onCopyModel(model, "embedding")}
          onAdd={() => setShowAddDialog("embedding")}
          onUpdateModel={(model) => handleTableUpdate(model, "embedding")}
          onReorderModels={(newModels) => handleModelReorder(newModels, "embedding")}
          onRefresh={() => handleRefreshModels("embedding")}
          title={MODEL_CATEGORIES.embedding.label}
          showEnableToggle={MODEL_CATEGORIES.embedding.showEnableToggle}
        />

        <ModelAddDialog
          open={showAddDialog === "embedding"}
          onOpenChange={(open) => !open && setShowAddDialog(null)}
          onAdd={(model) => {
            updateSetting("activeEmbeddingModels", [...settings.activeEmbeddingModels, model]);
          }}
          ping={getPingFn("embedding")}
          modelType="embedding"
        />
      </section>

      {/* Audio STT Models section */}
      <section>
        <ModelTable
          models={settings.activeAudioSTTModels}
          onEdit={(model) => handleEditModel(model, "stt")}
          onDelete={(key) => onDeleteModel(key, "stt")}
          onCopy={(model) => onCopyModel(model, "stt")}
          onAdd={() => setShowAddDialog("stt")}
          onUpdateModel={(model) => handleTableUpdate(model, "stt")}
          onReorderModels={(newModels) => handleModelReorder(newModels, "stt")}
          onRefresh={() => handleRefreshModels("stt")}
          title={MODEL_CATEGORIES.stt.label}
          showEnableToggle={MODEL_CATEGORIES.stt.showEnableToggle}
        />

        <ModelAddDialog
          open={showAddDialog === "stt"}
          onOpenChange={(open) => !open && setShowAddDialog(null)}
          onAdd={(model) => {
            updateSetting("activeAudioSTTModels", [...settings.activeAudioSTTModels, model]);
          }}
          ping={getPingFn("stt")}
          modelType="stt"
        />
      </section>
    </div>
  );
};
