# Quickstart: Remove Plus Features Refactor

This refactor aims to completely strip out any code verifying, gating, or indicating Subscription/Plus status within the Copilot for Obsidian plugin.

## Getting Started

1. Start by searching for constants and settings related to Plus in `src/constants.ts` and settings files.
2. Remove the utility checks inside `src/plusUtils.ts`.
3. Eliminate UI checks (e.g., `{isPlus ? <AgentToggle/> : <UpgradeBadge/>}`) across components in `src/components/`, notably `Chat.tsx`.
4. Run `npm run test` repeatedly to catch areas where mocks and conditional logic expected `isPlus` values.
5. In `src/tools/` and `src/LLMProviders/`, remove runtime gates so that all tools execute unconditionally.
