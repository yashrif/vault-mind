import { getSettings } from "@/settings/model";

/**
 * Returns true when the user has enabled self-host mode in settings.
 * Self-host mode routes YouTube / web-search calls through the user's
 * own API keys instead of the built-in cloud service.
 */
export function isSelfHostModeValid(): boolean {
  return getSettings().enableSelfHostMode === true;
}
