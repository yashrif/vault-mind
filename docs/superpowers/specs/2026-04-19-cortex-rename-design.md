# Cortex Full Codebase Rename Design

## Overview
Rename the Obsidian plugin from "Copilot" to "Cortex" globally across the entire repository. This includes breaking backward compatibility for existing users, as the plugin ID in `manifest.json` will be changed.

## Scope
- All source files (`.ts`, `.tsx`, `.json`, `.css`, etc.)
- All documentation files (`.md`)
- All filenames/directory names containing the target string

## Approach
We will use **Approach A (The Full Nuclear Rename)** as approved by the user.

### 1. File Renaming
- Search the `src/`, `docs/`, and root directories for any filenames containing `copilot` (case-insensitive).
- Rename filenames while preserving case (e.g., `CopilotChat.ts` -> `CortexChat.ts`, `copilot-settings.ts` -> `cortex-settings.ts`).

### 2. Content Find & Replace
- Execute global case-preserving find-and-replace across all relevant files (`.ts`, `.tsx`, `.json`, `.md`, `.css`, etc.).
- **Rules:**
  - `Copilot` -> `Cortex` (covers ClassNames, Interfaces, Components, UI text)
  - `copilot` -> `cortex` (covers variable names, IDs, URLs, imports, CLI commands)
  - `COPILOT` -> `CORTEX` (covers constants, ENUMs)

### 3. Verification & Cleanup
- Run typescript compilation (`npm run build`) to ensure no import paths were broken by file renaming.
- Run the linter (`npm run lint:fix`) to fix any formatting issues introduced by string length changes.
- Ensure `manifest.json` properly exports the new plugin ID: `"cortex"`.
- Ensure `package.json` package names and build scripts are correct.

## Known Trade-offs
- **Backward Compatibility:** All existing user settings, API keys, and chat histories will be lost (or technically, stranded in the `.obsidian/plugins/copilot` directory) because Obsidian will treat "Cortex" as a brand new plugin. The user explicitly approved this.
- **Merge Conflicts:** This will create a massive diff, making it extremely difficult to pull in upstream updates from the original Copilot repository in the future.