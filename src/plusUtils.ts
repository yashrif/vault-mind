/**
 * Plus/self-host mode stubs — all tier gating removed.
 * These exports are kept only to avoid breaking callers during transition.
 */

/** Always returns true — Plus licensing removed. */
export async function checkIsPlusUser(_context?: Record<string, unknown>): Promise<boolean> {
  return true;
}

/**
 * Self-host mode is now the default behavior.
 * Returns true so callers always use user-configured API keys when available.
 */
export function isSelfHostModeValid(): boolean {
  return true;
}

/** Always returns true — all users are eligible. */
export function useIsSelfHostEligible(): boolean {
  return true;
}

/** No-op — isPlusUser setting removed. */
export function turnOnPlus(): void {}

/** No-op — isPlusUser setting removed. */
export function turnOffPlus(): void {}
