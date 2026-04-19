# Rename to Cortex Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely rename Copilot for Obsidian to Cortex strictly touching user-facing strings, package metadata, and configurations without breaking internal variables and class names.

**Architecture:** A sweeping mechanical replacement via regex (`Grep` and `Edit`) for `manifest.json`, `package.json`, React UI constants, Translation files (if applicable), and `/docs/`.

**Tech Stack:** NodeJS tools, regex find and replace, Markdown, JSON.

---

### Task 1: Update JSON configurations
**Files:**
- Modify: `manifest.json`
- Modify: `package.json`

- [ ] **Step 1: Edit manifest.json**
  Replace "copilot" with "cortex" inside `manifest.json`.
  Changes required:
  - `"id": "copilot"` -> `"id": "cortex"`
  - `"name": "Copilot"` -> `"name": "Cortex"`
  - Replace any description containing "Copilot" -> "Cortex".
  
- [ ] **Step 2: Edit package.json**
  Replace "obsidian-copilot" with "obsidian-cortex" and descriptions in `package.json`.
  Changes required:
  - `"name": "obsidian-copilot"` -> `"name": "obsidian-cortex"`
  - Replace description mentions of "Copilot" with "Cortex".

- [ ] **Step 3: Run project standard formatting/checks**
  Run: `npm run format`
  Expected: Successful format.

- [ ] **Step 4: Commit**
  Run:
  ```bash
  git add manifest.json package.json
  git commit -m "build: update node and obsidian plugin manifest to cortex"
  ```

---

### Task 2: Standardize Cache Paths
**Files:**
- Modify: `src/cache/audioTranscriptionCache.ts`
- Modify: `src/cache/fileCache.ts`
- Modify: `src/cache/pdfCache.ts`
- Modify: `src/cache/projectContextCache.ts`

- [ ] **Step 1: Replace hardcoded `.copilot/` with `.cortex/` directories**
  Use the Edit tool or `sed` to replace `.copilot/` with `.cortex/` inside the `src/cache/` directory.

- [ ] **Step 2: Commit**
  Run:
  ```bash
  git add src/cache/
  git commit -m "refactor: rename internal cache directory paths from copilot to cortex"
  ```

---

### Task 3: Update ContextMenu UI strings
**Files:**
- Modify: `src/commands/contextMenu.ts`

- [ ] **Step 1: Replace user-facing UI labels**
  Replace strings inside `setTitle("Copilot")` and related UI strings leaving internal command identifiers like `COMMAND_IDS` untouched unless rendered purely as strings.
  Ensure logic around `copilot:` prefixes inside `execute` commands are safe or rename them if Obsidian commands change. (Since `manifest.json` id is `cortex`, Obsidian commands might require prefix `cortex:` instead of `copilot:`).
  
  *Crucial validation*: Because we changed `'id': 'cortex'` in manifest, all commands invoked through the `execute(...)` call that previously invoked `copilot:xxxxx` must now invoke `cortex:xxxxx` depending on how they are registered. Replace `execute(\`copilot:\${COMMAND_IDS...\`)` to `execute(\`cortex:\${COMMAND_IDS...\`)`.

- [ ] **Step 2: Commit**
  Run:
  ```bash
  git add src/commands/contextMenu.ts
  git commit -m "refactor: update context menu strings to cortex"
  ```

---

### Task 4: UI String & Command constants updates
**Files:**
- Locate and Modify: Anywhere that renders "Copilot" to the user, like top ribbons.

- [ ] **Step 1: Perform Global search for "Copilot" and "COPILOT" in src/components and src/main.ts**
  Run: `grep -r "Copilot" src/main.ts src/components/ | grep -v "class\|interface\|type"`
  Identify labels.

- [ ] **Step 2: Edit UI Labels**
  - Update any Ribbon hover text: `addRibbonIcon('bot', 'Copilot', ...)` -> `addRibbonIcon('bot', 'Cortex', ...)` in `src/main.ts`.
  - Update names in Plugin settings tabs.
  - Update "Copilot Plus" to "Cortex Plus" everywhere.

- [ ] **Step 3: Commit**
  Run:
  ```bash
  git add src/
  git commit -m "refactor: surface UI strings renamed to Cortex"
  ```

---

### Task 5: Documentation Sweeps
**Files:**
- Modify: Everything in `docs/`
- Modify: `README.md` (if exists)

- [ ] **Step 1: Fix `docs/index.md`**
  Replace all `Copilot` to `Cortex` and lowercase `copilot` to `cortex` in `docs/index.md`. Include updating standard paths and URLs.

- [ ] **Step 2: Fix remaining `docs/*.md` files**
  Use `sed` or standard Find/Replace to iteratively fix all docs markdown text replacing "Copilot" with "Cortex". Ensure file names like `docs/copilot-plus-and-self-host.md` are handled correctly or kept as is depending on strictness (better to rename to `docs/cortex-plus-and-self-host.md`).

- [ ] **Step 3: Commit**
  Run:
  ```bash
  git add docs/ README.md
  git commit -m "docs: rename all documentation references to cortex"
  ```

---
