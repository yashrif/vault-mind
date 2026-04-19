# Design Specification: Rename to Cortex (Approach B)

## Overview
This specification outlines the execution plan for renaming the "Copilot for Obsidian" plugin to "Cortex". Based on user feedback, we are proceeding with **Approach B**, which focuses on renaming the user-facing elements and configurations while leaving internal variables/classes untouched to minimize unnecessary code churn.

## Scope of Changes

### 1. Plugin Configuration (`manifest.json`)
- `id`: "copilot" -> "cortex" (Breaking change requested logic, resets user settings intentionally)
- `name`: "Copilot" -> "Cortex"
- `description`: Mentions of "Copilot" -> "Cortex"

### 2. Package Configuration (`package.json`)
- `name`: "obsidian-copilot" -> "obsidian-cortex"
- `description`: Mentions of "Copilot" -> "Cortex"

### 3. User Interface (UI), Labels, & Constants
- Obsidian Ribbon icon label ("Copilot" -> "Cortex")
- Context Menu sub-menus ("Copilot" -> "Cortex" in `src/commands/contextMenu.ts`)
- Command Palette names ("Copilot: <Action>" -> "Cortex: <Action>")
- Translations / Settings headers inside React components (e.g., Settings menu headers).
- Internal feature brands pointing forward: "Copilot Plus" -> "Cortex Plus"

### 4. Cache & Data directories (User Folder Names)
- Rename `.copilot/` directory references to `.cortex/` inside the code (e.g. `src/cache/audioTranscriptionCache.ts`, `pdfCache.ts`, `projectContextCache.ts`). This happens silently alongside the `id` change in settings generation.

### 5. Documentation
- All `.md` files in `docs/` and project roots (like `README.md`, `index.md`, `getting-started.md`, etc.).
- Update links or text that references "Copilot" as the tool.

## Excluded (No Changes Here)
- Internal code file names (`CopilotChat.ts` will stay `CopilotChat.ts`)
- Internal classes (`CopilotChat`, `CopilotPlugin`, `copilotManager`)
- Internal CSS variable prefixes or non-surface classNames if modifying them creates significant refactoring overhead. (Only tailwind variables visible to user or root settings changed).
- Internal constants that track logic but are unseen, like `COPILOT_COMMAND_SLASH_ENABLED` will remain intact, or only selectively changed if directly rendering UI Strings.
