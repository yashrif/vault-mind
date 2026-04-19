import { SettingItem } from "@/components/ui/setting-item";
import { PasswordInput } from "@/components/ui/password-input";
import { getDecryptedKey } from "@/encryptionService";
import { logError } from "@/logger";
import { updateSetting, useSettingsValue } from "@/settings/model";
import { err2String } from "@/utils";
import { CheckCircle, XCircle } from "lucide-react";
import { Platform } from "obsidian";
import React, { useState } from "react";

export const TelegramSettings: React.FC = () => {
  const settings = useSettingsValue();
  const [validationState, setValidationState] = useState<"idle" | "checking" | "ok" | "error">(
    "idle"
  );
  const [botUsername, setBotUsername] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  if (!Platform.isDesktopApp) {
    return (
      <div className="tw-space-y-4">
        <p className="tw-text-sm tw-text-muted">
          Telegram integration is only available on desktop.
        </p>
      </div>
    );
  }

  const handleTokenChange = (value: string) => {
    updateSetting("telegramBotApiKey", value);
    setValidationState("idle");
    setBotUsername("");
    setErrorMessage("");
  };

  const handleValidate = async () => {
    const rawToken = await getDecryptedKey(settings.telegramBotApiKey).catch(
      () => settings.telegramBotApiKey
    );
    if (!rawToken) {
      setValidationState("error");
      setErrorMessage("Token is empty.");
      return;
    }
    setValidationState("checking");
    try {
      const resp = await fetch(`https://api.telegram.org/bot${rawToken}/getMe`);
      const data = await resp.json();
      if (data.ok) {
        setValidationState("ok");
        setBotUsername(`@${data.result.username}`);
      } else {
        setValidationState("error");
        setErrorMessage(data.description || "Invalid token.");
      }
    } catch (err) {
      logError("[Telegram] Token validation error:", err2String(err));
      setValidationState("error");
      setErrorMessage("Network error — check your connection.");
    }
  };

  return (
    <div className="tw-space-y-4">
      <section className="tw-space-y-4 tw-rounded-lg tw-border tw-p-4">
        <h3 className="tw-text-lg tw-font-semibold">Telegram</h3>

        <SettingItem
          type="switch"
          title="Enable Telegram"
          description="Start receiving messages from your Telegram bot on plugin load."
          checked={settings.telegramEnabled}
          onCheckedChange={(checked) => updateSetting("telegramEnabled", checked)}
        />

        <SettingItem
          type="custom"
          title="Bot API Token"
          description="Paste the token from @BotFather. Encrypted at rest when encryption is enabled."
        >
          <div className="tw-flex tw-w-full tw-flex-col tw-gap-1">
            <div className="tw-flex tw-items-center tw-gap-2">
              <PasswordInput
                value={settings.telegramBotApiKey}
                onChange={handleTokenChange}
                placeholder="123456:ABC-DEF..."
                className="tw-flex-1"
              />
              <button
                className="tw-rounded tw-border tw-border-solid tw-px-3 tw-py-1 tw-text-sm tw-transition-colors hover:tw-bg-modifier-hover"
                onClick={handleValidate}
                disabled={validationState === "checking" || !settings.telegramBotApiKey}
              >
                {validationState === "checking" ? "Checking…" : "Verify"}
              </button>
            </div>
            {validationState === "ok" && (
              <div className="tw-flex tw-items-center tw-gap-1 tw-text-sm tw-text-success">
                <CheckCircle className="tw-size-3.5" />
                <span>Connected as {botUsername}</span>
              </div>
            )}
            {validationState === "error" && (
              <div className="tw-flex tw-items-center tw-gap-1 tw-text-sm tw-text-error">
                <XCircle className="tw-size-3.5" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>
        </SettingItem>
      </section>
    </div>
  );
};
