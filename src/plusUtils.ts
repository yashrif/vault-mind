// Phase 1: Licensing removed. All users have Plus access.
// Self-host mode retained for YouTube (Supadata) and web search (Firecrawl/Perplexity) with user-supplied keys.

import { logInfo } from "@/logger";
import { getSettings, updateSetting } from "@/settings/model";

const SELF_HOST_GRACE_PERIOD_MS = 15 * 24 * 60 * 60 * 1000;
const SELF_HOST_PERMANENT_VALIDATION_COUNT = 3;

/**
 * Always returns true — Plus licensing removed.
 */
export async function checkIsPlusUser(_context?: Record<string, unknown>): Promise<boolean> {
  return true;
}

/**
 * Check if self-host access is valid (permanently validated or within grace period).
 */
export function isSelfHostAccessValid(): boolean {
  const settings = getSettings();
  if (settings.selfHostModeValidatedAt == null) {
    return false;
  }
  if (settings.selfHostValidationCount >= SELF_HOST_PERMANENT_VALIDATION_COUNT) {
    return true;
  }
  return Date.now() - settings.selfHostModeValidatedAt < SELF_HOST_GRACE_PERIOD_MS;
}

/**
 * Check if self-host mode is enabled and valid.
 */
export function isSelfHostModeValid(): boolean {
  const settings = getSettings();
  return settings.enableSelfHostMode === true && isSelfHostAccessValid();
}

/**
 * Validate self-host mode when user enables the toggle.
 * All users are eligible; just records the timestamp.
 */
export async function validateSelfHostMode(): Promise<boolean> {
  const settings = getSettings();

  if (settings.selfHostValidationCount >= SELF_HOST_PERMANENT_VALIDATION_COUNT) {
    updateSetting("selfHostModeValidatedAt", Date.now());
    return true;
  }

  if (
    settings.selfHostModeValidatedAt != null &&
    Date.now() - settings.selfHostModeValidatedAt < SELF_HOST_GRACE_PERIOD_MS
  ) {
    return true;
  }

  const newCount = Math.max(settings.selfHostValidationCount || 0, 1);
  updateSetting("selfHostModeValidatedAt", Date.now());
  updateSetting("selfHostValidationCount", newCount);
  logInfo(`Self-host mode validation successful (${newCount}/3)`);
  return true;
}

/**
 * Refresh self-host mode validation on plugin load.
 */
export async function refreshSelfHostModeValidation(): Promise<void> {
  const settings = getSettings();
  if (!settings.enableSelfHostMode) {
    return;
  }
  if (settings.selfHostValidationCount >= SELF_HOST_PERMANENT_VALIDATION_COUNT) {
    return;
  }

  const now = Date.now();
  const timeSinceLastValidation = now - (settings.selfHostModeValidatedAt || 0);
  if (timeSinceLastValidation >= SELF_HOST_GRACE_PERIOD_MS) {
    const newCount = (settings.selfHostValidationCount || 0) + 1;
    updateSetting("selfHostModeValidatedAt", now);
    updateSetting("selfHostValidationCount", newCount);
    logInfo(`Self-host mode validation refreshed (${newCount}/3)`);
  }
}

/**
 * Always returns true — all users are eligible for self-host mode.
 */
export function useIsSelfHostEligible(): boolean {
  return true;
}

/** No-op — isPlusUser setting removed. */
export function turnOnPlus(): void {}

/** No-op — isPlusUser setting removed. */
export function turnOffPlus(): void {}
