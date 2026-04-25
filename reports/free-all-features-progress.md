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

## Feature 2: Advanced File Parsing (PDFs & Non-Markdown) ✅ Done

All file parsing happens locally, in-process. Zero network calls, zero premium backend. Miyo removed entirely.

- `FileParserManager.ts` — Rewritten as a dispatch registry of local parsers:
  - `LocalPdfParser` (`pdfjs-dist` legacy build, worker disabled) → PDF text extraction with existing `PDFCache`
  - `LocalDocxParser` (`mammoth`) → DOCX/DOC/RTF → markdown
  - `LocalSpreadsheetParser` (`xlsx`) → XLSX/XLS/ODS/CSV/TSV → markdown tables
  - `PlainTextParser` → TXT/XML/JSON/LOG/HTML
  - `UnsupportedFormatParser` → returns a human-readable "not supported" string including PDF, DOCX, XLSX, TXT, MD, and Canvas.
  - Heavy parsers loaded via dynamic `import()` so esbuild code-splitting them — cold-start bundle stays minimal
- `brevilabsClient.ts` — Deleted `pdf4llm()`, `docs4llm()`, and `getMimeTypeFromExtension()` helpers
- `pdfCache.ts` — Introduced local `PdfCacheEntry` type to decouple cache from removed Brevilabs types
- `constants.ts` — Removed `NON_MARKDOWN_FILES_RESTRICTED` and `URL_PROCESSING_RESTRICTED` from `RESTRICTION_MESSAGES`
- `contextProcessor.ts` / `Chat.tsx` / `AddContextNoteModal.tsx` — Removed restriction-notice blocks; any file can be added to chat context.
- `utils.ts` — Simplified `isAllowedFileForChainContext` to allow all files (no chain-based gating)

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
- `Chat.tsx` — URL context previously restricted; `isAgentChain()` check still gates URL inclusion but is a chain-mode check, not a license check

**Remaining:** No hard license gates left. Users need a self-host search provider key configured. Consider removing the `BrevilabsClient` fallback path for search entirely.

---

## Feature 5: Autonomous Agents & Tool Execution ✅ Done

- `AutonomousAgentChainRunner.ts` — License check removed; agent runs for all users
- `toolExecution.ts` — `checkIsPlusUser()` now always returns `true`; the `isPlusOnly` check in `toolExecution.ts` passes, but YouTube tool still has `isPlusOnly: true` (see Feature 3)
- `ChatToolControls.tsx` — Agent controls shown when in TOOL_CHAIN mode (`isAgentChain` is a chain-mode check, not a license check)

---

## Feature 6: Hybrid & Advanced Semantic Search ✅ Done (functionally)

- `hybridRetriever.ts` — Uses `BrevilabsClient.rerank()` which no longer requires a license key (auth header removed)
- Rerank requests will reach the Brevilabs API unauthenticated; server may reject them. Local Orama-backed semantic search is fully operational.
- Miyo semantic retriever and index backend deleted — `SelfHostRetriever` (for user-supplied backends) + `MergedSemanticRetriever` (Orama, local) + `TieredLexicalRetriever` handle all cases

**Remaining:** If Brevilabs rerank is needed without a license, an alternative rerank strategy (local or different provider) may be needed.

---

## Infrastructure & Scaffolding ✅ Done

- `plusUtils.ts` — Recreated as minimal stub: `checkIsPlusUser` always `true`; self-host mode functions kept (still used for user-supplied Firecrawl/Perplexity/Supadata keys)
- `brevilabsClient.ts` — License key auth headers removed; client still functional for `rerank`, `url4llm`, `webSearch`, `youtube4llm`, `twitter4llm`
- `PlusSettings.tsx` — Deleted
- `error.ts` — `MissingPlusLicenseError` removed
- `settings/v2/SettingsMainV2.tsx` — "plus" tab renamed to "tools"
- `settings/v2/components/CopilotPlusSettings.tsx` — Plus badge and gating removed; self-host section always visible
- **Miyo removed entirely** — Deleted `src/miyo/`, `src/search/miyo/`, `MiyoIndexBackend`, `enableMiyo`/`miyoServerUrl` settings, and all Miyo branches in `RetrieverFactory`, `vectorStoreManager`, `findRelevantNotes`, `VaultQAChainRunner`, `CopilotPlusSettings`, `QASettings`, `RelevantNotes`, and `commands/index.ts`. Legacy settings sanitization strips `enableMiyo`/`miyoSearchAll`/`miyoServerUrl`/etc. from existing user configs.

---

## Summary

| Feature                      | Status                                                    |
| ---------------------------- | --------------------------------------------------------- |
| AI Models & Embeddings       | ✅ Fully free                                             |
| Autonomous Agents            | ✅ Fully free                                             |
| File Parsing (PDF/DOCX/XLSX) | ✅ Fully free (local parsing, zero network)               |
| Web Search                   | ⚠️ Self-host only                                         |
| YouTube Transcription        | ❌ Still gated (2 remaining guards)                       |
| Hybrid Search / Rerank       | ⚠️ Local semantic works; Brevilabs rerank unauthenticated |

### Next Steps (Phase 2)

1. Remove `isPlusOnly: true` from `youtubeTranscriptionTool` in `src/tools/builtinTools.ts`
2. Remove `checkIsPlusUser` guard from YouTube download command in `src/commands/index.ts`
3. Decide routing strategy for web search without Brevilabs auth (self-host-only or new provider)
4. Remove or replace `BrevilabsClient` rerank with a local/open alternative
