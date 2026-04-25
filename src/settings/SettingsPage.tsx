import CortexView from "@/components/CortexView";
import { CHAT_VIEWTYPE } from "@/constants";
import CortexPlugin from "@/main";
import { getSettings } from "@/settings/model";
import { logInfo, logError } from "@/logger";
import { App, Notice, PluginSettingTab } from "obsidian";
import React from "react";
import { createRoot } from "react-dom/client";
import SettingsMainV2 from "@/settings/v2/SettingsMainV2";
import { ContainerContext } from "@/settings/v2/components/ContainerContext";

export class CortexSettingTab extends PluginSettingTab {
  plugin: CortexPlugin;

  constructor(app: App, plugin: CortexPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async reloadPlugin() {
    try {
      const chatView = this.app.workspace.getLeavesOfType(CHAT_VIEWTYPE)[0]?.view as CortexView;

      // Analyze chat messages for memory if enabled
      if (chatView && getSettings().enableRecentConversations) {
        try {
          // Get the current chat model from the chain manager
          const chainManager = this.plugin.projectManager.getCurrentChainManager();
          const chatModel = chainManager.chatModelManager.getChatModel();
          this.plugin.userMemoryManager.addRecentConversation(
            this.plugin.chatUIState.getMessages(),
            chatModel
          );
        } catch (error) {
          logInfo("Failed to analyze chat messages for memory:", error);
        }
      }

      // Autosave the current chat before reloading
      if (chatView && getSettings().autosaveChat) {
        await this.plugin.autosaveCurrentChat();
      }

      // Reload the plugin
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const app = this.plugin.app as any;
      await app.plugins.disablePlugin("Cortex");
      await app.plugins.enablePlugin("Cortex");

      app.setting.openTabById("Cortex").display();
      new Notice("Plugin reloaded successfully.");
    } catch (error) {
      new Notice("Failed to reload the plugin. Please reload manually.");
      logError("Error reloading plugin:", error);
    }
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.style.userSelect = "text";
    const div = containerEl.createDiv("div");
    const sections = createRoot(div);

    sections.render(
      <ContainerContext.Provider value={containerEl}>
        <SettingsMainV2 plugin={this.plugin} />
      </ContainerContext.Provider>
    );
  }
}
