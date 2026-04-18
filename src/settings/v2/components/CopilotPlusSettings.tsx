import { HelpTooltip } from "@/components/ui/help-tooltip";
import { SettingItem } from "@/components/ui/setting-item";
import { updateSetting, useSettingsValue } from "@/settings/model";
import React from "react";
import { ToolSettingsSection } from "./ToolSettingsSection";

export const CopilotPlusSettings: React.FC = () => {
  const settings = useSettingsValue();

  /**
   * Toggle self-host mode.
   *
   * @param enabled - Whether self-host mode should be enabled.
   */
  const handleSelfHostModeToggle = async (enabled: boolean) => {
    updateSetting("enableSelfHostMode", enabled);
  };

  return (
    <div className="tw-flex tw-flex-col tw-gap-4">
      <section className="tw-flex tw-flex-col tw-gap-4">
        <div className="tw-flex tw-flex-col tw-gap-4">
          <div className="tw-pt-4 tw-text-xl tw-font-semibold">Autonomous Agent</div>

          <SettingItem
            type="switch"
            title="Enable Autonomous Agent"
            description="Enable autonomous agent mode. The AI will reason step-by-step and decide which tools to use automatically, improving response quality for complex queries."
            checked={settings.enableAutonomousAgent}
            onCheckedChange={(checked) => {
              updateSetting("enableAutonomousAgent", checked);
            }}
          />

          {settings.enableAutonomousAgent && (
            <>
              <ToolSettingsSection />
            </>
          )}

          <div className="tw-pt-4 tw-text-xl tw-font-semibold">Document Processor</div>

          <SettingItem
            type="text"
            title="Store converted markdown at"
            description="When PDFs and other documents are processed, the converted markdown is saved to this folder. Leave empty to skip saving."
            value={settings.convertedDocOutputFolder}
            onChange={(value) => {
              updateSetting("convertedDocOutputFolder", value);
            }}
            placeholder="e.g. copilot/converteddocs"
          />

          <div className="tw-pt-4 tw-text-xl tw-font-semibold">Memory (experimental)</div>

          <SettingItem
            type="text"
            title="Memory Folder Name"
            description="Specify the folder where memory data is stored."
            value={settings.memoryFolderName}
            onChange={(value) => {
              updateSetting("memoryFolderName", value);
            }}
            placeholder="copilot/memory"
          />

          <SettingItem
            type="switch"
            title="Reference Recent Conversation"
            description="When enabled, Copilot references your recent conversation history to provide more contextually relevant responses. All history data is stored locally in your vault."
            checked={settings.enableRecentConversations}
            onCheckedChange={(checked) => {
              updateSetting("enableRecentConversations", checked);
            }}
          />

          {settings.enableRecentConversations && (
            <SettingItem
              type="slider"
              title="Max Recent Conversations"
              description="Number of recent conversations to remember for context. Higher values provide more context but may slow down responses."
              min={10}
              max={50}
              step={1}
              value={settings.maxRecentConversations}
              onChange={(value) => updateSetting("maxRecentConversations", value)}
            />
          )}

          <SettingItem
            type="switch"
            title="Reference Saved Memories"
            description="When enabled, Copilot can access memories that you explicitly asked it to remember. Use this to store important facts, preferences, or context for future conversations."
            checked={settings.enableSavedMemory}
            onCheckedChange={(checked) => {
              updateSetting("enableSavedMemory", checked);
            }}
          />

          <>
            <div className="tw-flex tw-items-center tw-gap-1.5 tw-pt-4 tw-text-xl tw-font-semibold">
              Self-Host Mode
            </div>

            <SettingItem
              type="switch"
              title="Enable Self-Host Mode"
              description={
                <div className="tw-flex tw-items-center tw-gap-1.5">
                  <span className="tw-leading-none">
                    Use your own infrastructure for web search, YouTube transcripts, and semantic
                    search backends.
                  </span>
                  <HelpTooltip
                    content={
                      <div className="tw-flex tw-max-w-96 tw-flex-col tw-gap-2 tw-py-4">
                        <div className="tw-text-sm tw-font-medium tw-text-accent">
                          Self-Host Mode
                        </div>
                        <div className="tw-text-xs tw-text-muted">
                          Bring your own API keys for Firecrawl / Perplexity (web search) and
                          Supadata (YouTube transcripts), or point at a self-hosted semantic search
                          backend.
                        </div>
                      </div>
                    }
                  />
                </div>
              }
              checked={settings.enableSelfHostMode}
              onCheckedChange={handleSelfHostModeToggle}
            />

            {settings.enableSelfHostMode && (
              <>
                <SettingItem
                  type="select"
                  title="Web Search Provider"
                  description="Choose which service to use for self-host web search."
                  value={settings.selfHostSearchProvider}
                  onChange={(value) =>
                    updateSetting("selfHostSearchProvider", value as "firecrawl" | "perplexity")
                  }
                  options={[
                    { label: "Firecrawl (default)", value: "firecrawl" },
                    { label: "Perplexity Sonar", value: "perplexity" },
                  ]}
                />

                {settings.selfHostSearchProvider === "firecrawl" && (
                  <SettingItem
                    type="password"
                    title="Firecrawl API Key"
                    description={
                      <span>
                        API key for web search via Firecrawl.{" "}
                        <a
                          href="https://firecrawl.link/logan-yang"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="tw-text-accent"
                        >
                          Sign up &rarr;
                        </a>
                      </span>
                    }
                    value={settings.firecrawlApiKey}
                    onChange={(value) => updateSetting("firecrawlApiKey", value)}
                    placeholder="fc-..."
                  />
                )}

                {settings.selfHostSearchProvider === "perplexity" && (
                  <SettingItem
                    type="password"
                    title="Perplexity API Key"
                    description={
                      <span>
                        API key for web search via Perplexity Sonar.{" "}
                        <a
                          href="https://docs.perplexity.ai"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="tw-text-accent"
                        >
                          Get API key &rarr;
                        </a>
                      </span>
                    }
                    value={settings.perplexityApiKey}
                    onChange={(value) => updateSetting("perplexityApiKey", value)}
                    placeholder="pplx-..."
                  />
                )}

                <SettingItem
                  type="password"
                  title="Supadata API Key"
                  description={
                    <span>
                      API key for YouTube transcripts via Supadata.{" "}
                      <a
                        href="https://supadata.ai/?ref=obcopilot"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tw-text-accent"
                      >
                        Sign up &rarr;
                      </a>
                    </span>
                  }
                  value={settings.supadataApiKey}
                  onChange={(value) => updateSetting("supadataApiKey", value)}
                  placeholder="sd-..."
                />
              </>
            )}
          </>
        </div>
      </section>
    </div>
  );
};
