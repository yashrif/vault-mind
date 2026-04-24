# Tasks: Remove Plus Feature Gating

## Overview

This document contains the execution tasks for transforming the codebase to remove all Plus/Premium/Subscription tier gating logic and UI elements.
The tasks are organized by User Story to support incremental implementation and testing.

## Phase 1: Setup

_(No specific initial project setup is required as this is an inline refactoring feature.)_

## Phase 2: Foundational (Blocking Prerequisites)

These tasks must be completed before functionality changes, as they alter the core data definitions that downstream components rely upon.

- [x] T001 Remove tier-related values (`copilotPlusStatus`, `copilotPlusTier`, `licenseKey`, `selfHostMode`) from settings interfaces/definitions
- [x] T002 Purge or modify `src/plusUtils.ts` to remove logic related to tier-checking and grace periods (ensuring basic structural changes don't break downstream momentarily)
- [x] T003 Remove constants related to Plus tiers and strings in `src/constants.ts`

## Phase 3: [US1] All Features Available Without Paywall (Priority: P1)

**Story Goal**: A user opens the plugin and has unrestricted access to every capability without paywall restrictions or self-host-only modes.
**Independent Test**: All features execute normally without throwing "Plus Required" errors.

- [x] T004 [P] [US1] Remove gating and branch logic in `src/runtime/RuntimeChainPolicy.ts` that restricts chains based on user tier
- [x] T005 [P] [US1] Remove capability constraints in `src/search/RetrieverFactory.ts` so algorithm choices aren't tier-based
- [x] T006 [P] [US1] Update `src/tools/SearchTools.ts` to allow execution unconditionally (remove "Self-Host Mode" gate logic)
- [x] T007 [P] [US1] Update `src/tools/YoutubeTools.ts` to allow execution unconditionally
- [x] T008 [P] [US1] Remove logic gating execution of "Plus" tools in `src/LLMProviders/chainRunner/ToolChainRunner.ts`
- [x] T009 [P] [US1] Remove or gut license/subscription verification checks inside `src/LLMProviders/brevilabsClient.ts`
- [x] T010 [P] [US1] Remove restriction logic in `src/LLMProviders/projectManager.ts` to conditionally gate project features
- [x] T011 [P] [US1] Remove conditional checks in `src/settings/providerModels.ts` that decouple advanced model availability from tiers

## Phase 4: [US2] No Plus-Related UI Elements (Priority: P2)

**Story Goal**: All upgrade prompts, lock icons, "Plus only" badges, and UI restrictions disappear.
**Independent Test**: A user can inspect every settings panel and the Chat GUI without finding any reference to Plus/Free tiers.

- [x] T012 [P] [US2] Remove `isPlusUser` usages and "Plus required" tooltips/badges from `src/components/Chat.tsx`
- [x] T013 [P] [US2] Clean up gated UI elements and specific mention-type blocks in `src/components/chat-components/ChatInput.tsx`
- [x] T014 [P] [US2] Clean up tool lock icons or tier badges in `src/components/chat-components/ChatToolControls.tsx`
- [x] T015 [P] [US2] Remove tier labels, subscription plan references, and self-host mode toggles from `src/settings/v2/components/BasicSettings.tsx`

## Phase 5: [US3] Clean Codebase With No Dead Premium Logic (Priority: P3)

**Story Goal**: Full cleanup of code references, unneeded unit tests, and leftover `isPlus` parameters.
**Independent Test**: A codebase-wide search returns 0 instances of relevant `plus`, `tier`, or `subscription` active gating logic, and all test suites pass.

- [x] T016 [US3] Search the codebase and remove leftover unused `isPlusUser` or `checkIsPlusUser` imports and arguments in remaining files
- [x] T017 [US3] Update test suites for utilities, tools, and `brevilabsClient` to remove mocks/assertions referencing "Plus" states

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T018 Run `npm run format` and `npm run lint` and apply fixes to satisfy CI gates across the codebase
- [x] T019 Run unit tests `npm run test` to verify no regressions
- [x] T020 Review and update relevant markdown files in `docs/` to remove references to Plus tiers and feature gating

## Dependencies

- **US1** depends on Phase 2 (Foundational types modified).
- **US2** depends on US1 (Component logic cleanup builds upon functional cleanup).
- **US3** depends on US1 & US2 completion.

## Parallel Execution Examples

- While T001-T003 are running, T004-T007 and T008-T011 can be distributed as they touch distinctly separate runtime areas / API tools.
- T012, T013, T014, and T015 can be executed completely independently by different contributors or parallel agents.

## Implementation Strategy

**MVP First**: Complete Phase 2 and Phase 3 (US1) first. Once the runtime paths have no blocks (API/Chain gating disabled), you effectively have the MVP: a fully unlocked plugin feature set.
**Incremental Delivery**: After MVP, the UI fixes (US2) can follow without affecting the functional behavior. Finally, dead code purging (US3) guarantees maintainability.
