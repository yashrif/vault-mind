# Phase 0: Outline & Research

## Architectural Decisions

### 1. Handling "Self-Host Mode"

**Decision**: Remove the distinction of "Self-Host Mode" versus "Managed Mode".
**Rationale**: Previously, certain tools (like Web Search plugins or Perplexity) required either a Plus subscription covering the API cost, or "Self-Host Mode" where users entered standard API keys. With the plugin becoming fully free, the "Self-Host Mode" concept becomes the default and only behavior. We will remove the "Self-Host" toggles and treat these integrations as standard features requiring users to provide their own keys.
**Alternatives considered**: Keeping "Self-Host Mode" toggles visible but unlocked. Rejected because it implies a managed alternative exists, confusing new users.

### 2. Brevilabs Client License Checking

**Decision**: Gut the license verification endpoints inside `brevilabsClient.ts`.
**Rationale**: The plugin currently verifies licenses via an external check. Since all features are free, this backend verification is dead code and causes unnecessary network requests. We will delete the verification logic entirely. If `brevilabsClient.ts` performs other telemetry or model routing, we will preserve those, but forcefully decouple them from license status.
**Alternatives considered**: Replacing API returns with mocked `true` values. Rejected as it leaves dead code and tech debt behind.

### 3. Graceful Settings Migration

**Decision**: Silently ignore existing Plus-related keys in user settings (`licenseKey`, `copilotPlusStatus`, `isSelfHostModeEligible`).
**Rationale**: Explicitly migrating and deleting these keys from users' stored JSON could be risky. By simply un-mapping them from the internal UI and omitting them from the default settings object, they will be naturally ignored and eventually overwritten or fade out without causing load-time validation errors.
**Alternatives considered**: Running a migration script to sanitize `data.json`. Rejected due to risk of corrupting user Vault settings for a purely cosmetic key cleanup.

### 4. Code Cleanup of Utility Functions

**Decision**: Remove `plusUtils.ts` (if fully dedicated to gating) and constants related to tiers in `constants.ts`.
**Rationale**: Satisfies FR-004. Leaving no-op functions (`checkIsPlusUser => return true`) pollutes the codebase and misleads future contributors.
**Alternatives considered**: Keeping the functions and just making them return `true`. Rejected as incomplete cleanup (violates SC-003).
