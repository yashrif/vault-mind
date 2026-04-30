# Revised Plain Chat Tool Guidance Contract Plan

## Summary

Plain Chat already has the right runtime tool boundary: it does not bind `localSearch`. The fix is to make all prompt guidance and missing-tool feedback reflect that boundary, so plain Chat never tells the model to call `localSearch`, while Chat + RAG and Agent keep vault-search guidance when `localSearch` is actually available.

This revision incorporates the review: `TimeTools.ts` localSearch wording is mandatory to remove, the hardcoded `modelAdapter.ts` time-query section gets an exact replacement, runner prompt prefixes are preserved, dead code is removed, and Cortex command alias guidance keeps the existing fallback/case-insensitive behavior.

## Key Changes

- Add `conditionalPromptInstructions?: { requiredToolIds: string[]; content: string }[]` to `ToolMetadata`.
- Create `toolPromptGuidance.ts` to build tool guidance from resolved metadata and `availableToolNames`.
- Include normal custom instructions only for resolved tools, and include conditional instructions only when all required tools are available.
- Preserve runner prompt prefixes with `prefixCustomInstructionsWithDisplayName: true`.
- Preserve Cortex command alias guidance: direct request semantics, case-insensitive aliases, alias list, and unavailable-tool fallback instruction.
- Remove the now-dead private alias builder from `modelAdapter.ts`.
- Leave `ToolPermissions` unchanged as the runtime source of truth.

## Implementation Changes

- Move cross-tool `localSearch` instructions in `builtinTools.ts` behind `conditionalPromptInstructions` for `getTimeRangeMs`, `readNote`, `getFileTree`, and `obsidianTasks`.
- Remove `localSearch` from `TimeTools.ts` tool/schema descriptions; describe time ranges as usable by another available tool or the final answer.
- Use shared guidance generation in `AutonomousAgentChainRunner.ts` and `modelAdapter.ts`.
- Gate `modelAdapter.ts` generic time-query, source-priority, GPT-5, Claude, Gemini, and Agent-model guidance on `hasLocalSearch`.
- Remove Gemini's unconditional user-message reminder that named `localSearch`.
- Make missing-tool feedback mode-aware in `toolExecution.ts`, including the plain Chat + `localSearch` message that points users to Chat + RAG.
- Pass `preset.id` into the ReAct loop and then into `executeSequentialToolCall`.
- Update `docs/chat-interface.md` to clarify that plain Chat uses provided/open context and Chat + RAG performs automatic vault search.

## Test Plan

- Add `toolPromptGuidance.test.ts` for conditional guidance, Cortex aliases, and display-name prefixing.
- Update `modelAdapter.test.ts` for plain Chat no-`localSearch` guidance, retained Chat + RAG guidance, and Gemini reminder cleanup.
- Update `AutonomousAgentChainRunner.test.ts` for plain Chat prompt hygiene and Chat + RAG localSearch guidance.
- Update `toolExecution.test.ts` for mode-aware missing-tool messages.
- Update `TimeTools.test.ts` for localSearch-free time range descriptions.
- Run focused Jest, `npx tsc --noEmit --skipLibCheck`, `npm run format`, `npm run lint`, and `npm run build`.

## Assumptions

- Plain Chat keeps free/read-only tools like time, note-read, file-tree, tags, random note, and links.
- Plain Chat does not perform automatic vault-wide retrieval; that remains Chat + RAG.
- `ToolPermissions` should stay pure and registry-filter-only.
