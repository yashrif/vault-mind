# Implementation Plan: Remove Plus Feature Gating

**Branch**: `001-remove-plus-features` | **Date**: 2026-04-24 | **Spec**: [Link to Spec](spec.md)
**Input**: Feature specification from `/specs/001-remove-plus-features/spec.md`

## Summary

The objective is to refactor the codebase to remove all Plus/Premium/Subscription tier feature gating. Copilot for Obsidian will now be a fully free application where all features (such as agent mode, specific LLM models, indexed search, and tools) are unconditionally available. This involves removing UI badges/locks, disabling runtime plan-checking logic, cleaning up unused utility files, and ensuring graceful handling of legacy user settings.

## Technical Context

**Language/Version**: TypeScript  
**Primary Dependencies**: Obsidian API, React, Langchain, Jotai
**Storage**: Local Vault (app.vault)  
**Testing**: Jest + `@testing-library/react`  
**Target Platform**: Obsidian Desktop (Electron)
**Project Type**: Obsidian Plugin  
**Performance Goals**: Improved init time (removing blocking checks to licensing servers)  
**Constraints**: Keep legacy `isPlus` or `licenseKey` keys in user settings intact but ignore them to prevent load errors.  
**Scale/Scope**: Refactoring affects multiple layers: runtime chain policies, UI components, setting definitions, and API client utilities.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                              | Check                                                                                                                                       | Status |
| :------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------ | :----- |
| **I. Code Quality & Generalizability** | All branching logic based on user tier will be removed, ensuring a generalized code path for all users.                                     | PASS   |
| **II. Testing Standards**              | Tests asserting "plus-only" behavior will be updated or removed. Unit tests covering core features will verify access unconditionally.      | PASS   |
| **III. User Experience Consistency**   | All "Plus", "Pro", or lock badges will be removed, providing a consistent UI layout regardless of previous tier status.                     | PASS   |
| **IV. Performance & Reliability**      | Removing the client-side checks and background subscription validation will slightly improve plugin initialization and overall reliability. | PASS   |

## Project Structure

### Documentation (this feature)

```text
specs/001-remove-plus-features/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── components/          # UI changes (Chat.tsx, ChatInput.tsx, ChatToolControls.tsx)
├── settings/            # Settings UI & Schema (BasicSettings.tsx, providerModels.ts)
├── LLMProviders/        # API checks (brevilabsClient.ts, chainRunner/)
├── runtime/             # Chain policies (RuntimeChainPolicy.ts)
├── search/              # Retriever availability (RetrieverFactory.ts)
├── tools/               # Tool gating (SearchTools.ts, YoutubeTools.ts)
├── constants.ts         # Strings and tier constants
└── plusUtils.ts         # To be heavily refactored or deleted
```

**Structure Decision**: We will edit the existing source code in place, specifically targeting the files identified during our discovery phase. File deletion will be favored for single-purpose utilities (like `plusUtils.ts`, unless other non-plus functions reside there).
