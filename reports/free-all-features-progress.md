# Free All Features — Progress Report

Goal: Remove all Copilot Plus license gates so every feature in `copilot-plus-report.md` works for all users with their own API keys.

---

## Feature 1: Hosted Premium AI Models & Embeddings ✅ Done

All model and provider locks removed.

- `chatModelManager.ts` — Removed `MissingPlusLicenseError` throw and `plusExclusive` gating logic
- `embeddingManager.ts` — Removed `plusExclusive` and `believerExclusive` access checks
- `chainRunner/ToolChainRunner.ts` — Renamed from `CopilotPlusChainRunner`; license check in `run()` removed
- `chainRunner/AutonomousAgentChainRunner.ts` — License check in `run()` removed
- `aiParams.ts` — Removed `plusExclusive` and `believerExclusive` fields from `CustomModel`
- `constants.ts` — Plus model entries (COPILOT_PLUS_FLASH, embedding models) commented out; removed from `DEFAULT_SETTINGS`
- `settings/model.ts` — Removed `plusLicenseKey` and `isPlusUser` fields
- `ChatControls.tsx` — TOOL_CHAIN and PROJECT_CHAIN always shown; removed `isPlusUser` gating
- `Chat.tsx` — Always uses `TOOL_CHAIN`; removed `useIsPlusUser()` hook

---

## Feature 2: Advanced File Parsing (PDFs & Non-Markdown) ⚠️ Partial

Parsing works via self-host (Miyo) when enabled. Direct Brevilabs route has no auth (removed license key).

- `FileParserManager.ts` — Routes to Miyo when `isSelfHostModeValid()`, falls back to `BrevilabsClient` (unauthenticated — will fail without a self-host setup)
- `constants.ts` — `NON_MARKDOWN_FILES_RESTRICTED` and `URL_PROCESSING_RESTRICTED` strings still exist but are no longer enforced at the model/chain level

**Remaining:** Decide whether to route PDF parsing through the user's own provider or require self-host. Remove `NON_MARKDOWN_FILES_RESTRICTED` and `URL_PROCESSING_RESTRICTED` constants if no longer used.

---

## Feature 3: YouTube Video Transcription ❌ Still Gated

Two active license gates remain.

- `builtinTools.ts:235` — `isPlusOnly: true` on `youtubeTranscriptionTool` → blocks tool execution for non-Plus users in `toolExecution.ts`
- `commands/index.ts:625` — `checkIsPlusUser()` guard on `DOWNLOAD_YOUTUBE_SCRIPT` command

**Remaining:** Remove `isPlusOnly: true` from `builtinTools.ts`. Remove `checkIsPlusUser` guard from the download command in `commands/index.ts`. YouTube via Brevilabs will fail without auth; via self-host (Supadata key) will work.

---

## Feature 4: Live Web Search & URL Processing ⚠️ Partial

Works via self-host (Firecrawl/Perplexity). Brevilabs route no longer has auth.

- `SearchTools.ts` — Routes to self-host search when `isSelfHostModeValid() && hasSelfHostSearchKey()`; falls back to `BrevilabsClient` (unauthenticated — will fail)
- `Chat.tsx` — URL context previously restricted; `isPlusChain()` check still gates URL inclusion but is a chain-mode check, not a license check

**Remaining:** No hard license gates left. Users need a self-host search provider key configured. Consider removing the `BrevilabsClient` fallback path for search entirely.

---

## Feature 5: Autonomous Agents & Tool Execution ✅ Done

- `AutonomousAgentChainRunner.ts` — License check removed; agent runs for all users
- `toolExecution.ts` — `checkIsPlusUser()` now always returns `true`; the `isPlusOnly` check in `toolExecution.ts` passes, but YouTube tool still has `isPlusOnly: true` (see Feature 3)
- `ChatToolControls.tsx` — Agent controls shown when in TOOL_CHAIN mode (`isPlusChain` is a chain-mode check, not a license check)

---

## Feature 6: Hybrid & Advanced Semantic Search ✅ Done (functionally)

- `hybridRetriever.ts` — Uses `BrevilabsClient.rerank()` which no longer requires a license key (auth header removed)
- Rerank requests will reach the Brevilabs API unauthenticated; server may reject them. Self-host (Miyo) semantic search is fully operational.

**Remaining:** If Brevilabs rerank is needed without a license, an alternative rerank strategy (local or different provider) may be needed.

---

## Infrastructure & Scaffolding ✅ Done

- `plusUtils.ts` — Recreated as minimal stub: `checkIsPlusUser` always `true`; self-host mode functions kept for Phase 2
- `brevilabsClient.ts` — License key auth headers removed; client still functional for API calls
- `PlusSettings.tsx` — Deleted
- `error.ts` — `MissingPlusLicenseError` removed
- `settings/v2/SettingsMainV2.tsx` — "plus" tab renamed to "tools"
- `settings/v2/components/CopilotPlusSettings.tsx` — Plus badge and gating removed; self-host section always visible

---

## Summary

| Feature | Status |
|---|---|
| AI Models & Embeddings | ✅ Fully free |
| Autonomous Agents | ✅ Fully free |
| File Parsing (PDF/DOCX) | ⚠️ Self-host only |
| Web Search | ⚠️ Self-host only |
| YouTube Transcription | ❌ Still gated (2 remaining guards) |
| Hybrid Search / Rerank | ⚠️ Self-host works; Brevilabs unauthenticated |

### Next Steps (Phase 2)
1. Remove `isPlusOnly: true` from `youtubeTranscriptionTool` in `src/tools/builtinTools.ts`
2. Remove `checkIsPlusUser` guard from YouTube download command in `src/commands/index.ts`
3. Decide routing strategy for PDF parsing and web search without Brevilabs auth (self-host-only or new provider)
4. Remove or replace `BrevilabsClient` rerank with a local/open alternative
5. Clean up `NON_MARKDOWN_FILES_RESTRICTED` and `URL_PROCESSING_RESTRICTED` constants if unused
