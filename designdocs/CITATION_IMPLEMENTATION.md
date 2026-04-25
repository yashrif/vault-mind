# Inline Citation System

This guide explains how inline citations are produced across Tool Mode, Vault QA, and web search, and how the feature is exercised by automated tests.

- Both `ToolChainRunner.prepareLocalSearchResult` and `VaultQAChainRunner` sanitize note content with `sanitizeContentForCitations` to strip stray `[^n]`/`[n]` markers before prompting.

- A compact source catalog is built via `formatSourceCatalog`, and Tool Mode caches the first 20 entries in `lastCitationSources` for fallback footnotes.

- `getCitationInstructions` (Tool Mode) and `getQACitationInstructionsConditional` (Vault QA) append guidance and a source catalog only when inline citations are enabled.

- Tool Mode passes structured `lastCitationSources` into the fallback helper; Vault QA derives titles from the retriever output.

- Mixed Tool Mode turn (local search + another tool): ensure fallback still works if the model omits the sources block.
- Web search answer: verify footnote definitions render as `[title](url)` links when citations are enabled.

## Watchlist

- `sanitizeContentForCitations` intentionally strips bracketed numbers; keep an eye on domains (math, law) where literal `[1990]` values might be desirable.
- Inline citations remain model-dependent. `addFallbackSources` guarantees a sources list, but the UI still reflects whatever inline markers the provider returns.
