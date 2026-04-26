# Remove Plus Branding and Tiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all references to "Plus", "Copilot Plus", and tiered pricing/features from documentation, design docs, and reports, as if they never existed.

**Architecture:** This is a documentation and meta-file cleanup following the code-level removal of license gates. All "Plus" features are now core features available to all users with their own API keys.

**Tech Stack:** Markdown, Git

---

### Task 1: README.md Cleanup

**Modify:** `README.md`

- [ ] **Step 1: Remove "Copilot Plus Disclosure" section**
- [ ] **Step 2: Update "Authors" section to remove Brevilabs branding**
- [ ] **Step 3: Update feature descriptions to remove "Plus" or "Premium" terminology**
- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: remove Plus branding and disclosure from README"
```

### Task 2: Documentation Site Cleanup (docs/)

**Modify:**

- `docs/agent-mode-and-tools.md`
- `docs/chat-interface.md`
- `docs/context-and-mentions.md`
- `docs/custom-commands.md`
- `docs/getting-started.md`
- `docs/index.md`
- `docs/llm-providers.md`
- `docs/models-and-parameters.md`
- `docs/projects.md`
- `docs/self-host-and-memory.md`
- `docs/troubleshooting-and-faq.md`
- `docs/vault-search-and-indexing.md`

- [ ] **Step 1: Remove all mentions of "Plus license", "Premium tier", and "Copilot Plus"**
- [ ] **Step 2: Rename "Copilot Plus mode" to "Agent Mode" or simply "Copilot" where applicable**
- [ ] **Step 3: Update setup guides to remove license key steps**
- [ ] **Step 4: Commit**

```bash
git add docs/*.md
git commit -m "docs: remove tiered feature mentions from user documentation"
```

### Task 3: Design Docs and Technical Guides Cleanup

**Modify:**

- `designdocs/CITATION_IMPLEMENTATION.md`
- `designdocs/CONTEXT_ENGINEERING.md`
- `designdocs/MESSAGE_ARCHITECTURE.md`
- `designdocs/OBSIDIAN_CLI_INTEGRATION.md`
- `designdocs/TOOLS.md`
- `designdocs/todo/ACP_DESIGN.md`
- `designdocs/todo/TOKEN_BUDGET_ENFORCEMENT.md`
- `CLAUDE.md`
- `AGENTS.md`
- `CONTRIBUTING.md`

- [ ] **Step 1: Update technical references (e.g., `CopilotPlusChainRunner` -> `ToolChainRunner`)**
- [ ] **Step 2: Remove "Plus mode" distinction from architecture diagrams and tables**
- [ ] **Step 3: Clean up dev instructions related to Brevilabs/Plus mode**
- [ ] **Step 4: Commit**

```bash
git add designdocs/ CLAUDE.md AGENTS.md CONTRIBUTING.md
git commit -m "docs: update architecture docs to remove Plus terminology"
```

### Task 4: Reports Cleanup

**Modify/Delete:**

- Delete: `reports/copilot-plus-report.md`
- Modify: `reports/free-all-features-progress.md`
- Modify: `reports/tool-pipeline.md`

- [ ] **Step 1: Delete the obsolete Copilot Plus report**
- [ ] **Step 2: Mark "Free All Features" progress as complete/archived**
- [ ] **Step 3: Commit**

```bash
git rm reports/copilot-plus-report.md
git add reports/
git commit -m "docs: archive and cleanup Plus-related reports"
```

### Task 5: Final Global Scrub

**Files:** All `.md` and `.ts` files in the repository

- [ ] **Step 1: Run a final grep to ensure zero "Plus" or "Brevilabs" remain in user-facing text**
- [ ] **Step 2: Fix any missed occurrences**
- [ ] **Step 3: Commit**

```bash
git commit -m "docs: final global cleanup of Plus terminology"
```
