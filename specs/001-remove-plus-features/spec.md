# Feature Specification: Remove Plus Feature Gating — Full Free Application

**Feature Branch**: `001-remove-plus-features`
**Created**: 2026-04-24
**Status**: Draft
**Input**: User description: "refactor the codebase to remove all the plus feature checking by making these all free like other features. the codebase shouldn't contain any premium & free features rather a full free application"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - All Features Available Without Paywall (Priority: P1)

A user opens the plugin and has unrestricted access to every capability — chat, autocomplete, semantic search, agent tools, and any other previously gated functionality — without being prompted to upgrade, subscribe, or activate a plus plan.

**Why this priority**: This is the core goal. Every other story depends on the paywall being removed first.

**Independent Test**: A user can navigate to any feature area (chat, search, tools, settings) and use all functionality without encountering an upgrade prompt, a "Plus required" message, or a disabled state.

**Acceptance Scenarios**:

1. **Given** a user has no plus subscription configured, **When** they open the plugin settings, **Then** no tier labels ("Free", "Plus", "Pro") appear and all settings are editable.
2. **Given** a user has no plus subscription configured, **When** they invoke any command or feature, **Then** the feature executes normally without an upgrade gate or error.
3. **Given** any feature that previously required plus, **When** a user attempts to use it, **Then** it behaves identically to how it would have behaved for a plus subscriber.

---

### User Story 2 - No Plus-Related UI Elements (Priority: P2)

All upgrade prompts, "Plus only" badges, locked UI states, and subscription-related banners have been removed from the interface. The UI presents a uniform experience with no indication that a tiered system ever existed.

**Why this priority**: Even if the underlying functionality is unlocked, leftover UI artefacts create confusion and a degraded experience.

**Independent Test**: A user can inspect every settings panel, modal, and chat UI element and find no mention of "Plus", "Free tier", upgrade buttons, or feature locks.

**Acceptance Scenarios**:

1. **Given** the plugin is installed, **When** a user browses all settings pages, **Then** no tier badges, lock icons, or upgrade calls-to-action are visible.
2. **Given** a feature that previously showed a "Plus required" tooltip or modal, **When** a user hovers or clicks it, **Then** no upgrade prompt appears; the feature activates normally.
3. **Given** any onboarding or welcome flow, **When** a user proceeds through it, **Then** no subscription plans or pricing tiers are mentioned.

---

### User Story 3 - Clean Codebase With No Dead Premium Logic (Priority: P3)

Developers reviewing or contributing to the codebase find no remnants of premium/free branching logic, feature flags tied to subscription status, or gating utility functions. The code reads as if it was always a fully free application.

**Why this priority**: Important for long-term maintainability but does not directly affect the end user experience.

**Independent Test**: A developer can search the entire codebase for plus/premium/subscription gating patterns and find zero occurrences of active gating code.

**Acceptance Scenarios**:

1. **Given** the refactored codebase, **When** a developer searches for plus/premium/subscription check patterns, **Then** no active gating logic is found (removed code, not commented out).
2. **Given** any utility or helper that previously determined feature eligibility, **When** a developer looks for it, **Then** it has been removed or replaced with unconditional access.
3. **Given** the existing test suite, **When** tests run after the refactor, **Then** all tests that previously tested plus gating either pass unconditionally or have been removed, with no regressions in other tests.

---

### Edge Cases

- What happens to settings that were previously persisted as plus-only values in a user's config file — are they migrated gracefully or silently ignored?
- How does the system handle any external API calls or server-side checks that enforced plus status — are they removed, bypassed, or left intact but never triggered?
- What happens if a user who previously had plus configured now opens the plugin — do stale plus references cause errors or are they safely ignored?

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST make all features previously restricted to plus subscribers available to all users unconditionally.
- **FR-002**: The system MUST remove all runtime checks that evaluate whether a user has a plus subscription before enabling a feature.
- **FR-003**: The system MUST remove all UI elements that communicate plan tiers, upgrade prompts, or feature locks to the user.
- **FR-004**: The system MUST remove or replace all utility functions, hooks, and helpers whose sole purpose was to determine plus eligibility.
- **FR-005**: The system MUST remove all feature flags or conditional branches that fork behaviour based on subscription status.
- **FR-006**: The system MUST ensure that previously plus-gated settings are now visible and editable in the settings UI for all users.
- **FR-007**: The system MUST preserve all non-gating functionality: removing plus logic must not break unrelated features.
- **FR-008**: The system MUST ensure no plus/premium/subscription references remain in user-visible text (labels, tooltips, error messages, onboarding copy).
- **FR-009**: The system MUST handle any stored user configuration that references plus status gracefully, without throwing errors on load.

### Key Entities

- **Plus Feature Gate**: A conditional check or flag that previously restricted a capability to plus subscribers — to be fully removed.
- **Subscription Status**: A data value (stored or fetched) representing whether a user has a plus plan — to be removed or replaced with an always-true constant during transition, then eliminated entirely.
- **Gated UI Element**: Any UI component (button, setting, modal, badge) that previously appeared differently for free vs. plus users — to be unified into a single always-accessible state.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of features previously labelled or gated as "Plus only" are accessible to a user with no subscription configured.
- **SC-002**: Zero upgrade prompts, plan tier labels, or subscription-related UI elements appear anywhere in the plugin interface.
- **SC-003**: Zero active plus/premium/subscription gating code paths remain in the codebase after the refactor (verified by search).
- **SC-004**: All existing automated tests pass after the refactor with no new test failures introduced.
- **SC-005**: A user who had a previously saved plus configuration can open the plugin without encountering errors or broken states.

## Assumptions

- The plugin's plus feature gating is implemented entirely within the client-side codebase and does not depend on a remote subscription validation service that must also be decommissioned.
- Any server-side or API-side plus checks (e.g., from Brevilabs or external services) are either not present or out of scope for this refactor; the goal is the client codebase only.
- The existing test suite covers enough of the gated feature paths that passing tests after the refactor is a reliable signal of correctness.
- Users' existing settings files may contain plus-related keys; these will be silently ignored (treated as if the user has full access) rather than migrated to a new schema.
- Public marketing copy update is out of scope, but user documentation MUST be updated to reflect the removal of Plus tiers as per the constitution.
