<!--
SYNC IMPACT REPORT
==================
Version change: (unversioned template) → 1.0.0
Principles added:
  - I. Code Quality & Generalizability (new)
  - II. Testing Standards (new)
  - III. User Experience Consistency (new)
  - IV. Performance & Reliability (new)
Sections added:
  - Core Principles (4 principles)
  - Technology & Style Constraints
  - Development Workflow
  - Governance
Sections removed: N/A (was unversioned placeholder template)
Templates requiring updates:
  ✅ .specify/templates/plan-template.md — Constitution Check section already present; gates now reference the 4 named principles
  ✅ .specify/templates/spec-template.md — success criteria and FR sections align with these principles; no structural changes required
  ✅ .specify/templates/tasks-template.md — task categories (tests, performance, polish) align with the new principles; no structural changes required
Deferred TODOs:
  - TODO(RATIFICATION_DATE): Original adoption date unknown; set to 2026-04-24 (today, first ratification)
-->

# Copilot for Obsidian — Constitution

## Core Principles

### I. Code Quality & Generalizability

Every implementation MUST be generalizable. Solutions MUST work for all user
configurations without hardcoded folder names, file patterns, or special-case
logic tied to specific scenarios (e.g., "daily notes", "piano notes").

- Code MUST be written in TypeScript strict mode (no implicit `any`, strict null checks).
- All functions and methods MUST have JSDoc comments.
- File naming MUST follow: PascalCase for React components, camelCase for utilities.
- Imports MUST be organized: React → external libraries → internal (`@/` prefix).
- Inline styles are PROHIBITED; Tailwind CSS classes MUST be used instead.
- `console.log` is PROHIBITED; structured logging MUST use `logInfo()`, `logWarn()`,
  or `logError()` from `@/logger`.
- AI prompt content (system prompts, model adapter prompts) MUST NOT be modified
  unless explicitly requested by the user.
- CSS MUST NOT be edited in the generated `styles.css`; the source file
  `src/styles/tailwind.css` is the only permitted edit target.
- Configuration MUST govern variant behavior; convention-based hardcoding is
  PROHIBITED.

**Rationale**: This plugin serves an open-ended note-taking tool with arbitrary
vault structures. Hardcoded assumptions break for any user whose vault differs
from the developer's mental model. Generalizability is the only defensible default.

### II. Testing Standards

All new logic MUST be covered by unit tests. Integration tests MUST be used for
API-boundary and multi-provider scenarios. Tests MUST be written before
implementation is considered complete for any non-trivial feature.

- Unit tests MUST use Jest with TypeScript support (`npm run test`).
- Test files MUST be placed adjacent to the implementation file (`.test.ts`).
- The Obsidian API MUST be mocked in all tests that touch plugin internals.
- React components MUST be tested using `@testing-library/react`.
- Integration tests MUST live separately and MUST NOT run without explicit API keys
  (`.env.test`); they are invoked via `npm run test:integration`.
- New code MUST follow the dependency-injection principle: functions MUST accept
  primitive values or explicit dependencies as parameters rather than calling
  singletons (e.g., `getSettings()`, `PDFCache.getInstance()`) internally. This
  ensures every function is testable by direct invocation with plain arguments.
- Singletons MAY only be called at top-level orchestration points (constructors,
  main entry points); inner modules MUST receive dependencies as parameters.
- Deep transitive import chains that force excessive mocking MUST be refactored:
  extract pure logic into leaf modules with minimal imports.

**Rationale**: The codebase has deep import chains that make tests brittle when
dependencies are not injected. The dependency-injection rule is the primary
structural defense against test fragility, and adjacency keeps tests discoverable.

### III. User Experience Consistency

The plugin MUST present a consistent, predictable interface across all chat modes,
providers, and project contexts. UI behavior MUST be uniform regardless of the
active LLM provider, project, or vault configuration.

- UI components MUST be React functional components; class components are PROHIBITED.
- Custom hooks MUST encapsulate all reusable UI logic; business logic MUST NOT live
  inside component bodies beyond what React lifecycle requires.
- All business logic MUST be delegated through the established architecture:
  `MessageRepository → ChatManager → ChatUIState → React Components`.
  No component MAY directly mutate message state outside this chain.
- Project chat isolation MUST be transparent to the user: switching projects MUST
  instantly and silently switch the active `MessageRepository` with no manual
  configuration.
- Context displayed in the UI MUST reflect only the user's raw input (`displayText`);
  processed context (XML envelopes, system prompt fragments) MUST NEVER appear in
  the chat UI.
- User-facing behavior changes (new features, changed settings, removed functionality)
  MUST be accompanied by corresponding updates to the relevant file in `docs/`.
  Documentation MUST be written for non-technical users with no source-code
  references.
- Settings MUST be versioned; migrations MUST be provided for any breaking settings
  change.

**Rationale**: Users switch between providers, projects, and vault configurations
frequently. Any visible inconsistency erodes trust in the tool as an AI assistant
embedded in a personal knowledge system.

### IV. Performance & Reliability

The plugin MUST remain responsive under typical Obsidian workloads. LLM streaming,
vector indexing, and context processing MUST not block the Obsidian UI thread.

- All LLM interactions MUST use stream-based responses; blocking synchronous API
  calls to remote providers are PROHIBITED.
- Rate limiting MUST be implemented for all external API calls.
- Multi-layer caching (files, PDFs, API responses) MUST be used to avoid redundant
  network or disk I/O.
- Vector store index rebuilds are expected when switching embedding providers; the
  user MUST be informed of this cost before switching.
- Context assembly (L1–L5 layers) MUST be deterministic for the same turn inputs.
  Non-deterministic fallback segment IDs (e.g., timestamp-based) are PROHIBITED.
- Memory efficiency: each message MUST be stored once in `MessageRepository`;
  duplicate storage for UI vs. LLM views is PROHIBITED. Computed views
  (`getDisplayMessages()`, `getLLMMessages()`) MUST be generated on demand.
- The `npm run dev` command MUST NOT be run by agents; production builds use
  `npm run build`. All builds MUST pass TypeScript strict-mode checks.

**Rationale**: Obsidian is a desktop application where UI jank is immediately
perceptible. The plugin handles large vaults (100k+ notes), long chat sessions,
and expensive embedding operations; every layer must be efficient by design, not
by accident.

## Technology & Style Constraints

- **Runtime**: Obsidian Plugin (Electron-based desktop); `app` is globally available —
  no import or declaration required.
- **Language**: TypeScript (strict mode); absolute imports via `@/` prefix.
- **UI**: React (functional components only) + Radix UI primitives + Tailwind CSS
  (via CVA). No class components. No inline styles.
- **State**: Jotai for settings atoms; `ChatUIState` subscription pattern for chat state.
- **Testing**: Jest + `@testing-library/react`; test files adjacent to implementation.
- **Logging**: `logInfo` / `logWarn` / `logError` from `@/logger` only.
- **CSS source**: `src/styles/tailwind.css` → compiled to `styles.css` via
  `npm run build`. Never edit `styles.css` directly.
- **LLM providers**: OpenAI, Anthropic, Google, Azure, local (Ollama/LM Studio),
  AWS Bedrock (cross-region inference profile IDs required), and others. Provider
  abstraction lives in `src/LLMProviders/`.
- **AWS Bedrock**: MUST use cross-region inference profile IDs
  (e.g., `global.anthropic.claude-sonnet-4-5-20250929-v1:0`). Regional model IDs
  without prefix are PROHIBITED.

## Development Workflow

- **Before any PR**: `npm run format && npm run lint` MUST pass with zero errors.
- **Build gate**: `npm run build` MUST succeed (TypeScript check + minified output).
- **Test gate**: `npm run test` MUST pass for all unit tests.
- **Session tracking**: A `TODO.md` file MUST serve as the single source of truth
  for in-progress development sessions, tracking completed and pending tasks,
  architecture decisions, and a testing checklist.
- **Documentation**: When user-facing behavior changes, the corresponding file in
  `docs/` MUST be updated in the same PR/commit. `docs/index.md` lists all docs
  with descriptions.
- **Technical debt**: Known issues and deferred work MUST be tracked in
  `designdocs/todo/TECHDEBT.md`.

## Governance

This constitution supersedes all other implicit conventions in the repository.
Where conflicts arise between this document and any other guidance file, this
constitution takes precedence.

**Amendment procedure**:

1. Propose the change with a rationale describing which principle is affected and why.
2. Increment the version according to semantic versioning:
   - MAJOR: removal or redefinition of an existing principle.
   - MINOR: addition of a new principle or materially expanded guidance.
   - PATCH: clarification, wording fix, or non-semantic refinement.
3. Update `LAST_AMENDED_DATE` to the ISO date of the change.
4. Propagate any impacted changes to `.specify/templates/` files and `docs/` as needed.

**Compliance**: All implementation plans MUST include a Constitution Check section
that verifies the planned approach against these four principles before Phase 0
research begins, and re-checks after Phase 1 design.

**Runtime guidance**: See `AGENTS.md` and `CLAUDE.md` for agent-specific runtime
guidance. See `designdocs/` for architecture documentation.

**Version**: 1.0.0 | **Ratified**: 2026-04-24 | **Last Amended**: 2026-04-24
