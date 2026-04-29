import { MAX_CHARS_FOR_LOCAL_SEARCH_CONTEXT } from "@/constants";
import { logInfo, logWarn } from "@/logger";
import { getSettings } from "@/settings/model";
import { ToolResultFormatter } from "@/tools/ToolResultFormatter";

import {
  formatSourceCatalog,
  getLocalSearchGuidance,
  sanitizeContentForCitations,
  type SourceCatalogEntry,
} from "./citationUtils";
import { buildLocalSearchInnerContent, wrapLocalSearchPayload } from "./cicPromptUtils";
import {
  extractSourcesFromSearchResults,
  formatMetadataOnlyDocuments,
  formatQualitySummary,
  formatSearchResultsForLLM,
  formatSearchResultStringForLLM,
  formatSplitSearchResultsForLLM,
  generateQualitySummary,
  isFilterOnlyResults,
  isTimeDominantResults,
  logSearchResultsDebugTable,
} from "./searchResultUtils";

export interface ProcessedLocalSearchResult {
  formattedForLLM: string;
  formattedForDisplay: string;
  sources: { title: string; path: string; score: number; explanation?: any }[];
}

/**
 * Formats localSearch tool results for model context and UI source display.
 */
export class LocalSearchResultFormatter {
  private lastCitationSources: { title?: string; path?: string }[] | null = null;

  /**
   * Gets the most recent citation source mapping for fallback citation repair.
   */
  getFallbackCitationSources(): { title?: string; path?: string }[] | null {
    return this.lastCitationSources;
  }

  /**
   * Extracts the time expression from preceding tool calls.
   */
  getTimeExpression(toolCalls: any[]): string {
    const timeRangeCall = toolCalls.find((call) => call.tool.name === "getTimeRangeMs");
    return timeRangeCall ? timeRangeCall.args.timeExpression : "";
  }

  /**
   * Processes a localSearch tool result into LLM payload, display text, and UI sources.
   */
  process(
    toolResult: { result: string; success: boolean },
    timeExpression?: string
  ): ProcessedLocalSearchResult {
    let sources: { title: string; path: string; score: number; explanation?: any }[] = [];
    let formattedForLLM: string;
    let formattedForDisplay: string;

    if (!toolResult.success) {
      formattedForLLM = "<localSearch>\nSearch failed.\n</localSearch>";
      formattedForDisplay = `Search failed: ${toolResult.result}`;
      return { formattedForLLM, formattedForDisplay, sources };
    }

    try {
      const parsed = JSON.parse(toolResult.result);
      const searchResults =
        parsed &&
        typeof parsed === "object" &&
        parsed.type === "local_search" &&
        Array.isArray(parsed.documents)
          ? parsed.documents
          : null;
      if (!Array.isArray(searchResults)) {
        formattedForLLM = "<localSearch>\nInvalid search results format.\n</localSearch>";
        formattedForDisplay = "Search results were in an unexpected format.";
        return { formattedForLLM, formattedForDisplay, sources };
      }

      logSearchResultsDebugTable(searchResults);
      sources = extractSourcesFromSearchResults(searchResults);

      formattedForLLM = this.prepare(searchResults, timeExpression || "");
      formattedForDisplay = ToolResultFormatter.format("localSearch", formattedForLLM);
    } catch (error) {
      logWarn("Failed to parse localSearch results:", error);
      const formatted = formatSearchResultStringForLLM(toolResult.result);
      formattedForLLM = timeExpression
        ? `<localSearch timeRange="${timeExpression}">\n${formatted}\n</localSearch>`
        : `<localSearch>\n${formatted}\n</localSearch>`;
      formattedForDisplay = ToolResultFormatter.format("localSearch", formattedForLLM);
    }

    return { formattedForLLM, formattedForDisplay, sources };
  }

  /**
   * Prepares valid localSearch documents into the structured XML-like LLM payload.
   */
  private prepare(documents: any[], timeExpression: string): string {
    const settings = getSettings();

    const includedDocs = documents.filter((doc) => doc.includeInContext !== false);
    const qualitySummary = generateQualitySummary(includedDocs);
    const qualityHeader = formatQualitySummary(qualitySummary);

    const filterOnly = isFilterOnlyResults(includedDocs);
    const timeDominant = isTimeDominantResults(includedDocs);

    let tier1Docs: any[];
    let tier2Docs: any[];
    if (timeDominant) {
      const sorted = [...includedDocs].sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
      tier1Docs = sorted.slice(0, settings.maxSourceChunks);
      tier2Docs = sorted.slice(settings.maxSourceChunks);
    } else if (filterOnly) {
      tier1Docs = [];
      tier2Docs = includedDocs;
    } else if (includedDocs.length > settings.maxSourceChunks) {
      tier1Docs = includedDocs.slice(0, settings.maxSourceChunks);
      tier2Docs = includedDocs.slice(settings.maxSourceChunks);
    } else {
      tier1Docs = includedDocs;
      tier2Docs = [];
    }

    const totalContentLength = tier1Docs.reduce((sum, doc) => sum + (doc.content?.length || 0), 0);
    let processedDocs = tier1Docs;
    if (totalContentLength > MAX_CHARS_FOR_LOCAL_SEARCH_CONTEXT) {
      const truncationRatio = MAX_CHARS_FOR_LOCAL_SEARCH_CONTEXT / totalContentLength;
      logInfo(
        "Truncating document contents to fit context length. Truncation ratio:",
        truncationRatio
      );
      processedDocs = tier1Docs.map((doc) => ({
        ...doc,
        content:
          doc.content?.slice(0, Math.floor((doc.content?.length || 0) * truncationRatio)) || "",
      }));
    }

    const withIds = processedDocs.map((doc, idx) => ({
      ...doc,
      __sourceId: idx + 1,
      content: sanitizeContentForCitations(doc.content || ""),
    }));

    const filterDocs = withIds.filter((doc: any) => doc.isFilterResult === true);
    const searchDocs = withIds.filter((doc: any) => doc.isFilterResult !== true);

    const hasFilterResults = filterDocs.length > 0;
    let formattedContent = hasFilterResults
      ? formatSplitSearchResultsForLLM(filterDocs, searchDocs)
      : tier1Docs.length === 0 && tier2Docs.length > 0
        ? formatMetadataOnlyDocuments(tier2Docs)
        : formatSearchResultsForLLM(withIds);

    if (tier1Docs.length > 0 && tier2Docs.length > 0) {
      if (timeDominant) {
        logInfo(
          `Time-dominant search: ${tier1Docs.length} recent notes (full content), ${tier2Docs.length} older notes (metadata-only)`
        );
      } else {
        logInfo(
          `Two-tier search: ${tier1Docs.length} full-content docs, ${tier2Docs.length} metadata-only docs`
        );
      }
      formattedContent = `${formattedContent}\n\n${formatMetadataOnlyDocuments(tier2Docs)}`;
    } else if (filterOnly) {
      logInfo(`Tag-only search: ${tier2Docs.length} notes (metadata-only)`);
    }

    const sourceEntries: SourceCatalogEntry[] = withIds
      .slice(0, Math.min(20, withIds.length))
      .map((doc: any) => ({
        title: doc.title || doc.path || "Untitled",
        path: doc.path || doc.title || "",
      }));
    const catalogLines = formatSourceCatalog(sourceEntries);

    this.lastCitationSources = withIds.slice(0, Math.min(20, withIds.length)).map((doc: any) => {
      const title = doc.title || doc.path || "Untitled";
      return {
        title,
        path: doc.path || undefined,
      };
    });

    const guidance = getLocalSearchGuidance(catalogLines, settings.enableInlineCitations).trim();
    const ragInstruction = "Answer the question based only on the following context:";
    const documentsSection = buildLocalSearchInnerContent(ragInstruction, formattedContent);

    const fullInnerContent = guidance
      ? `${qualityHeader}\n\n${documentsSection}\n\n${guidance}`
      : `${qualityHeader}\n\n${documentsSection}`;

    return wrapLocalSearchPayload(fullInnerContent, timeExpression);
  }
}
