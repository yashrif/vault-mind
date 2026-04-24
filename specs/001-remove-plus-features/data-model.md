# Phase 1: Data Model & State Changes

## Settings State Interface

The `CopilotSettings` or relevant Jotai atoms will be simplified.

### Fields to Deprecate/Remove from Interfaces

- `copilotPlusStatus` (enum / boolean)
- `copilotPlusTier` (string)
- `licenseKey` (string)
- `selfHostMode` (boolean)

_(Note: These will no longer be rendered in the UI or checked conditionally, but we will not actively purge them from the on-disk `data.json` to prevent parsing failures)._

## Component State

### Chat UI

- `isPlusUser` props or context variables passed down the component tree (e.g., inside `Chat.tsx`, `ChatInput.tsx`, `ChatToolControls.tsx`) will be systematically removed.
- The components will assume full capability (e.g., rendering the Agent Mode toggle directly without checking `if (isPlusUser)`).

### Tool Definitions

- Within `SearchTools.ts` and `YoutubeTools.ts`, the checks guarding tool execution (which previously threw errors like "Plus subscription required for this tool") won't be needed. The contract transitions from conditional capability to universal capability.

## External API Contracts

We will no longer send licensing or subscription payloads to Brevilabs endpoints for feature validation.
