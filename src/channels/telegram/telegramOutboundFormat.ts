import { cleanMessageForCopy } from "@/utils";
import { stripSpecialTokens } from "@/utils/stripSpecialTokens";

const TELEGRAM_MESSAGE_LIMIT = 4096;
const SAFE_TELEGRAM_LINK_PROTOCOL = /^(https?:\/\/|mailto:|tel:|tg:\/\/)/i;
const HEADING_LINE_REGEX = /^\s{0,3}#{1,6}\s+(.*)$/;
const UNORDERED_LIST_LINE_REGEX = /^(\s*)[-+*]\s+(.*)$/;
const ORDERED_LIST_LINE_REGEX = /^(\s*)(\d+)[.)]\s+(.*)$/;
const TASK_LIST_LINE_REGEX = /^(\s*)[-+*]\s+\[( |x|X)\]\s+(.*)$/;
const HORIZONTAL_RULE_REGEX = /^\s*[-*_]{3,}\s*$/;
const TABLE_SEPARATOR_REGEX = /^\s*\|?(?:\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/;

type TelegramParseMode = "HTML";

/**
 * One transport-safe Telegram message chunk.
 */
export interface TelegramTransportMessage {
  parseMode?: TelegramParseMode;
  text: string;
}

/**
 * Final outbound payload for Telegram delivery plus local persistence.
 */
export interface TelegramOutboundPayload {
  storageText: string;
  transportMessages: TelegramTransportMessage[];
}

interface InlinePattern {
  kind: "code" | "link" | "bold" | "strike" | "spoiler" | "italic";
  priority: number;
  regex: RegExp;
}

interface InlineMatch {
  kind: InlinePattern["kind"];
  match: RegExpExecArray;
  priority: number;
}

interface TelegramRenderBlock {
  fallbackText: string;
  htmlText: string;
  kind: "code" | "html";
  language?: string;
  rawCode?: string;
}

const INLINE_PATTERNS: InlinePattern[] = [
  { kind: "code", priority: 1, regex: /`([^`\n]+)`/ },
  { kind: "link", priority: 2, regex: /\[([^\]\n]+)\]\(([^)\n]+)\)/ },
  { kind: "bold", priority: 3, regex: /\*\*([^\n]+?)\*\*/ },
  { kind: "bold", priority: 4, regex: /__([^\n]+?)__/ },
  { kind: "strike", priority: 5, regex: /~~([^\n]+?)~~/ },
  { kind: "spoiler", priority: 6, regex: /\|\|([^\n]+?)\|\|/ },
  { kind: "italic", priority: 7, regex: /(^|[^\w])\*([^*\n]+)\*(?=[^\w]|$)/ },
  { kind: "italic", priority: 8, regex: /(^|[^\w])_([^_\n]+)_(?=[^\w]|$)/ },
];

/**
 * Escape content for Telegram HTML parse mode.
 *
 * @param text - Raw text content.
 * @returns HTML-escaped text.
 */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Escape content for use inside a Telegram HTML attribute.
 *
 * @param text - Raw attribute value.
 * @returns HTML-escaped attribute text.
 */
function escapeHtmlAttribute(text: string): string {
  return escapeHtml(text).replace(/"/g, "&quot;");
}

/**
 * Normalize raw model output into cleaned markdown suitable for local storage.
 *
 * @param message - Raw assistant output.
 * @returns Cleaned markdown text with internal markers removed.
 */
function buildStorageText(message: string): string {
  return stripSpecialTokens(cleanMessageForCopy(message))
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Validate whether a markdown link destination is safe to forward as HTML.
 *
 * @param url - Candidate link target.
 * @returns True when the destination uses a safe Telegram-supported protocol.
 */
function isSafeTelegramUrl(url: string): boolean {
  return SAFE_TELEGRAM_LINK_PROTOCOL.test(url.trim());
}

/**
 * Reduce markdown destinations like `url "title"` to the actual href.
 *
 * @param destination - Raw markdown destination text.
 * @returns Normalized href string.
 */
function normalizeLinkDestination(destination: string): string {
  return destination.trim().split(/\s+/)[0] ?? "";
}

/**
 * Find the next inline markdown token to render.
 *
 * @param source - Unrendered markdown source.
 * @returns The earliest inline match, preferring higher-priority token kinds on ties.
 */
function findFirstInlineMatch(source: string): InlineMatch | undefined {
  let bestMatch: InlineMatch | undefined;

  for (const pattern of INLINE_PATTERNS) {
    const match = pattern.regex.exec(source);
    if (!match) {
      continue;
    }

    if (!bestMatch) {
      bestMatch = { kind: pattern.kind, match, priority: pattern.priority };
      continue;
    }

    if (match.index < bestMatch.match.index) {
      bestMatch = { kind: pattern.kind, match, priority: pattern.priority };
      continue;
    }

    if (match.index === bestMatch.match.index && pattern.priority < bestMatch.priority) {
      bestMatch = { kind: pattern.kind, match, priority: pattern.priority };
    }
  }

  return bestMatch;
}

/**
 * Render a single inline markdown token into Telegram HTML.
 *
 * @param inlineMatch - Match data selected by findFirstInlineMatch().
 * @returns HTML representation of that markdown token.
 */
function renderInlineToken(inlineMatch: InlineMatch): string {
  const { kind, match } = inlineMatch;

  if (kind === "code") {
    return `<code>${escapeHtml(match[1] ?? "")}</code>`;
  }

  if (kind === "link") {
    const label = renderInline(match[1] ?? "");
    const href = normalizeLinkDestination(match[2] ?? "");
    if (!isSafeTelegramUrl(href)) {
      return `${label} (${escapeHtml(href)})`;
    }
    return `<a href="${escapeHtmlAttribute(href)}">${label}</a>`;
  }

  if (kind === "bold") {
    return `<b>${renderInline(match[1] ?? "")}</b>`;
  }

  if (kind === "strike") {
    return `<s>${renderInline(match[1] ?? "")}</s>`;
  }

  if (kind === "spoiler") {
    return `<tg-spoiler>${renderInline(match[1] ?? "")}</tg-spoiler>`;
  }

  const prefix = escapeHtml(match[1] ?? "");
  const content = renderInline(match[2] ?? "");
  return `${prefix}<i>${content}</i>`;
}

/**
 * Render inline markdown constructs into Telegram-safe HTML.
 *
 * @param source - Markdown source for a single block.
 * @returns Telegram HTML string using supported tags only.
 */
function renderInline(source: string): string {
  const nextMatch = findFirstInlineMatch(source);
  if (!nextMatch) {
    return escapeHtml(source);
  }

  const before = source.slice(0, nextMatch.match.index);
  const after = source.slice(nextMatch.match.index + nextMatch.match[0].length);
  return `${escapeHtml(before)}${renderInlineToken(nextMatch)}${renderInline(after)}`;
}

/**
 * Convert markdown into readable plain text for local fallback delivery.
 *
 * @param text - Markdown-ish source text.
 * @returns Telegram-friendly plain text without markdown markers.
 */
function normalizeMarkdownToTelegramText(text: string): string {
  let normalizedText = text.replace(/\r\n?/g, "\n");

  normalizedText = normalizedText.replace(
    /```([A-Za-z0-9_+-]+)?\s*\n?([\s\S]*?)```/g,
    (_match, language: string | undefined, code: string) => {
      const trimmedCode = code.replace(/^\n+|\n+$/g, "");
      const languageLabel = language ? `${language}:\n` : "";
      return `\n${languageLabel}${trimmedCode}\n`;
    }
  );

  normalizedText = normalizedText.replace(/`([^`\n]+)`/g, "$1");
  normalizedText = normalizedText.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, url) =>
    alt ? `${alt} (${url})` : url
  );
  normalizedText = normalizedText.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
  normalizedText = normalizedText.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  normalizedText = normalizedText.replace(/^\s{0,3}>\s?/gm, "");
  normalizedText = normalizedText.replace(/^\s*[-*_]{3,}\s*$/gm, "");
  normalizedText = normalizedText.replace(/^\s*[-+*]\s+\[(?: |x|X)\]\s+/gm, "• ");
  normalizedText = normalizedText.replace(/^(\s*)[-+*]\s+/gm, "$1• ");
  normalizedText = normalizedText.replace(/^\s*(\d+)[.)]\s+/gm, "$1. ");
  normalizedText = normalizedText.replace(/\*\*(.*?)\*\*/g, "$1");
  normalizedText = normalizedText.replace(/__(.*?)__/g, "$1");
  normalizedText = normalizedText.replace(/~~(.*?)~~/g, "$1");
  normalizedText = normalizedText.replace(/\|\|(.*?)\|\|/g, "$1");
  normalizedText = normalizedText.replace(/(^|[^\w])\*([^*\n]+)\*(?=[^\w]|$)/g, "$1$2");
  normalizedText = normalizedText.replace(/(^|[^\w])_([^_\n]+)_(?=[^\w]|$)/g, "$1$2");
  normalizedText = normalizedText.replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, "$1");
  normalizedText = normalizedText.replace(/[ \t]+\n/g, "\n");
  normalizedText = normalizedText.replace(/\n{3,}/g, "\n\n");

  return normalizedText.trim();
}

/**
 * Convert markdown indentation into a readable nested list prefix.
 *
 * @param whitespace - Leading whitespace captured from a list item.
 * @returns Indentation prefix for plain Telegram text.
 */
function buildListIndent(whitespace: string): string {
  return " ".repeat(Math.floor(whitespace.length / 2) * 2);
}

/**
 * Determine whether a line begins a markdown code fence.
 *
 * @param line - Candidate source line.
 * @returns Matched language info when the line opens a code fence.
 */
function getCodeFenceLanguage(line: string): string | undefined {
  const match = line.match(/^```([A-Za-z0-9_+-]+)?\s*$/);
  return match?.[1];
}

/**
 * Check whether the current line begins a markdown table block.
 *
 * @param lines - Full source split by line.
 * @param index - Current line index.
 * @returns True when the current and next line look like a markdown table.
 */
function isTableStart(lines: string[], index: number): boolean {
  const currentLine = lines[index]?.trim() ?? "";
  const nextLine = lines[index + 1]?.trim() ?? "";
  return currentLine.includes("|") && TABLE_SEPARATOR_REGEX.test(nextLine);
}

/**
 * Determine whether a line is a quote block line.
 *
 * @param line - Candidate source line.
 * @returns True when the line starts with `>`.
 */
function isBlockquoteLine(line: string): boolean {
  return /^\s*>/.test(line);
}

/**
 * Determine whether a line is any supported markdown list item.
 *
 * @param line - Candidate source line.
 * @returns True when the line represents a list row.
 */
function isListLine(line: string): boolean {
  return (
    TASK_LIST_LINE_REGEX.test(line) ||
    ORDERED_LIST_LINE_REGEX.test(line) ||
    UNORDERED_LIST_LINE_REGEX.test(line)
  );
}

/**
 * Determine whether a line begins a heading block.
 *
 * @param line - Candidate source line.
 * @returns True when the line uses markdown heading syntax.
 */
function isHeadingLine(line: string): boolean {
  return HEADING_LINE_REGEX.test(line);
}

/**
 * Determine whether a line is a horizontal rule.
 *
 * @param line - Candidate source line.
 * @returns True when the line is only a markdown divider.
 */
function isHorizontalRule(line: string): boolean {
  return HORIZONTAL_RULE_REGEX.test(line);
}

/**
 * Determine whether a line starts a different block type and should terminate a paragraph.
 *
 * @param lines - Full source split by line.
 * @param index - Current line index.
 * @returns True when paragraph accumulation should stop before this line.
 */
function startsNewBlock(lines: string[], index: number): boolean {
  const line = lines[index] ?? "";
  return (
    getCodeFenceLanguage(line) !== undefined ||
    isTableStart(lines, index) ||
    isBlockquoteLine(line) ||
    isListLine(line) ||
    isHeadingLine(line) ||
    isHorizontalRule(line)
  );
}

/**
 * Build a rendered block for one markdown heading line.
 *
 * @param line - Raw heading line.
 * @returns HTML/render fallback metadata for that heading.
 */
function buildHeadingBlock(line: string): TelegramRenderBlock {
  const headingText = line
    .replace(HEADING_LINE_REGEX, "$1")
    .replace(/\s+#+\s*$/, "")
    .trim();
  return {
    kind: "html",
    htmlText: `<b>${renderInline(headingText)}</b>`,
    fallbackText: headingText,
  };
}

/**
 * Build a rendered block for a plain paragraph.
 *
 * @param lines - Paragraph lines.
 * @returns HTML/render fallback metadata for that paragraph.
 */
function buildParagraphBlock(lines: string[]): TelegramRenderBlock {
  const text = lines.join("\n").trim();
  return {
    kind: "html",
    htmlText: renderInline(text),
    fallbackText: normalizeMarkdownToTelegramText(text),
  };
}

/**
 * Build a rendered block for a markdown list.
 *
 * @param lines - List item lines.
 * @returns HTML/render fallback metadata for the list block.
 */
function buildListBlock(lines: string[]): TelegramRenderBlock {
  const renderedLines = lines.map((line) => {
    const taskMatch = line.match(TASK_LIST_LINE_REGEX);
    if (taskMatch) {
      const indent = buildListIndent(taskMatch[1] ?? "");
      const checked = (taskMatch[2] ?? "").toLowerCase() === "x";
      const prefix = checked ? "☑ " : "☐ ";
      return `${indent}${prefix}${renderInline(taskMatch[3] ?? "")}`;
    }

    const orderedMatch = line.match(ORDERED_LIST_LINE_REGEX);
    if (orderedMatch) {
      const indent = buildListIndent(orderedMatch[1] ?? "");
      return `${indent}${orderedMatch[2]}. ${renderInline(orderedMatch[3] ?? "")}`;
    }

    const unorderedMatch = line.match(UNORDERED_LIST_LINE_REGEX);
    const indent = buildListIndent(unorderedMatch?.[1] ?? "");
    return `${indent}• ${renderInline(unorderedMatch?.[2] ?? line)}`;
  });

  return {
    kind: "html",
    htmlText: renderedLines.join("\n"),
    fallbackText: normalizeMarkdownToTelegramText(lines.join("\n")),
  };
}

/**
 * Build a rendered block for markdown blockquote lines.
 *
 * @param lines - Quote lines including their `>` marker.
 * @returns HTML/render fallback metadata for the blockquote.
 */
function buildBlockquoteBlock(lines: string[]): TelegramRenderBlock {
  const quoteText = lines
    .map((line) => line.replace(/^\s*>\s?/, ""))
    .join("\n")
    .trim();
  return {
    kind: "html",
    htmlText: `<blockquote>${renderInline(quoteText)}</blockquote>`,
    fallbackText: normalizeMarkdownToTelegramText(quoteText),
  };
}

/**
 * Build a rendered block for a markdown table.
 *
 * @param lines - Table lines.
 * @returns HTML/render fallback metadata for the table block.
 */
function buildTableBlock(lines: string[]): TelegramRenderBlock {
  const tableText = lines.join("\n").trim();
  return {
    kind: "html",
    htmlText: `<pre>${escapeHtml(tableText)}</pre>`,
    fallbackText: tableText,
  };
}

/**
 * Sanitize a fenced code language token for Telegram HTML.
 *
 * @param language - Raw language token from the opening fence.
 * @returns Safe code language or undefined when absent.
 */
function sanitizeCodeLanguage(language?: string): string | undefined {
  const trimmedLanguage = language?.trim();
  if (!trimmedLanguage) {
    return undefined;
  }
  return trimmedLanguage.replace(/[^A-Za-z0-9_+-]/g, "");
}

/**
 * Build a rendered block for fenced code.
 *
 * @param codeText - Raw code content.
 * @param language - Optional fenced language token.
 * @returns HTML/render fallback metadata for the code block.
 */
function buildCodeBlock(codeText: string, language?: string): TelegramRenderBlock {
  const safeLanguage = sanitizeCodeLanguage(language);
  const escapedCode = escapeHtml(codeText);
  const htmlText = safeLanguage
    ? `<pre><code class="language-${escapeHtmlAttribute(safeLanguage)}">${escapedCode}</code></pre>`
    : `<pre>${escapedCode}</pre>`;

  return {
    kind: "code",
    htmlText,
    fallbackText: safeLanguage ? `${safeLanguage}:\n${codeText}` : codeText,
    language: safeLanguage,
    rawCode: codeText,
  };
}

/**
 * Tokenize cleaned markdown into Telegram-renderable blocks.
 *
 * @param storageText - Cleaned markdown intended for local storage.
 * @returns Ordered list of Telegram render blocks.
 */
function buildTelegramRenderBlocks(storageText: string): TelegramRenderBlock[] {
  const lines = storageText.split("\n");
  const blocks: TelegramRenderBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const codeLanguage = getCodeFenceLanguage(line);
    if (codeLanguage !== undefined || line.trim() === "```") {
      const collectedLines: string[] = [];
      index += 1;
      while (index < lines.length && lines[index]?.trim() !== "```") {
        collectedLines.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length && lines[index]?.trim() === "```") {
        index += 1;
      }
      blocks.push(buildCodeBlock(collectedLines.join("\n"), codeLanguage));
      continue;
    }

    if (isTableStart(lines, index)) {
      const tableLines: string[] = [];
      while (index < lines.length && (lines[index]?.trim() ?? "") !== "") {
        tableLines.push(lines[index] ?? "");
        index += 1;
      }
      blocks.push(buildTableBlock(tableLines));
      continue;
    }

    if (isBlockquoteLine(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && isBlockquoteLine(lines[index] ?? "")) {
        quoteLines.push(lines[index] ?? "");
        index += 1;
      }
      blocks.push(buildBlockquoteBlock(quoteLines));
      continue;
    }

    if (isListLine(line)) {
      const listLines: string[] = [];
      while (index < lines.length && isListLine(lines[index] ?? "")) {
        listLines.push(lines[index] ?? "");
        index += 1;
      }
      blocks.push(buildListBlock(listLines));
      continue;
    }

    if (isHeadingLine(line)) {
      blocks.push(buildHeadingBlock(line));
      index += 1;
      continue;
    }

    if (isHorizontalRule(line)) {
      index += 1;
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      (lines[index]?.trim() ?? "") !== "" &&
      !startsNewBlock(lines, index)
    ) {
      paragraphLines.push(lines[index] ?? "");
      index += 1;
    }
    blocks.push(buildParagraphBlock(paragraphLines));
  }

  return blocks;
}

/**
 * Split plain text into Telegram-safe chunks with readable boundaries.
 *
 * @param text - Plain text fallback content.
 * @returns Chunks that each fit within Telegram's text limit.
 */
function splitPlainText(text: string): string[] {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return [];
  }

  if (normalizedText.length <= TELEGRAM_MESSAGE_LIMIT) {
    return [normalizedText];
  }

  const chunks: string[] = [];
  let remainingText = normalizedText;

  while (remainingText.length > TELEGRAM_MESSAGE_LIMIT) {
    let splitIndex = remainingText.lastIndexOf("\n\n", TELEGRAM_MESSAGE_LIMIT);
    if (splitIndex <= 0) {
      splitIndex = remainingText.lastIndexOf("\n", TELEGRAM_MESSAGE_LIMIT);
    }
    if (splitIndex <= 0) {
      splitIndex = remainingText.lastIndexOf(" ", TELEGRAM_MESSAGE_LIMIT);
    }
    if (splitIndex <= 0) {
      splitIndex = TELEGRAM_MESSAGE_LIMIT;
    }

    chunks.push(remainingText.slice(0, splitIndex).trim());
    remainingText = remainingText.slice(splitIndex).trim();
  }

  if (remainingText) {
    chunks.push(remainingText);
  }

  return chunks;
}

/**
 * Split oversized code content into multiple Telegram HTML code blocks.
 *
 * @param codeText - Raw code content.
 * @param language - Optional code language token.
 * @returns HTML chunks that each fit within Telegram's text limit.
 */
function splitCodeBlock(codeText: string, language?: string): TelegramTransportMessage[] {
  const safeLanguage = sanitizeCodeLanguage(language);
  const openingTag = safeLanguage
    ? `<pre><code class="language-${escapeHtmlAttribute(safeLanguage)}">`
    : "<pre>";
  const closingTag = safeLanguage ? "</code></pre>" : "</pre>";
  const availableLength = TELEGRAM_MESSAGE_LIMIT - openingTag.length - closingTag.length;
  const codeLines = codeText.split("\n");
  const messages: TelegramTransportMessage[] = [];
  let currentCode = "";

  for (const codeLine of codeLines) {
    const escapedLine = escapeHtml(codeLine);
    const nextCode = currentCode ? `${currentCode}\n${escapedLine}` : escapedLine;

    if (nextCode.length <= availableLength) {
      currentCode = nextCode;
      continue;
    }

    if (currentCode) {
      messages.push({
        parseMode: "HTML",
        text: `${openingTag}${currentCode}${closingTag}`,
      });
      currentCode = "";
    }

    if (escapedLine.length <= availableLength) {
      currentCode = escapedLine;
      continue;
    }

    for (const chunk of splitPlainText(codeLine)) {
      messages.push({ text: chunk });
    }
  }

  if (currentCode) {
    messages.push({
      parseMode: "HTML",
      text: `${openingTag}${currentCode}${closingTag}`,
    });
  }

  return messages;
}

/**
 * Convert one render block into one or more transport messages.
 *
 * @param block - Render block to convert.
 * @returns Telegram transport chunks for that block.
 */
function chunkRenderBlock(block: TelegramRenderBlock): TelegramTransportMessage[] {
  if (block.htmlText.length <= TELEGRAM_MESSAGE_LIMIT) {
    return [{ parseMode: "HTML", text: block.htmlText }];
  }

  if (block.kind === "code" && block.rawCode !== undefined) {
    return splitCodeBlock(block.rawCode, block.language);
  }

  return splitPlainText(block.fallbackText).map((text) => ({ text }));
}

/**
 * Pack render blocks into Telegram message-sized transport chunks.
 *
 * @param blocks - Ordered render blocks.
 * @returns Transport-safe Telegram messages ready for sendMessage().
 */
function packTransportMessages(blocks: TelegramRenderBlock[]): TelegramTransportMessage[] {
  const transportMessages: TelegramTransportMessage[] = [];
  let currentHtmlChunk = "";

  const flushCurrentChunk = (): void => {
    if (!currentHtmlChunk) {
      return;
    }
    transportMessages.push({ parseMode: "HTML", text: currentHtmlChunk });
    currentHtmlChunk = "";
  };

  for (const block of blocks) {
    const blockChunks = chunkRenderBlock(block);
    for (const chunk of blockChunks) {
      if (chunk.parseMode !== "HTML") {
        flushCurrentChunk();
        transportMessages.push(chunk);
        continue;
      }

      const nextHtmlChunk = currentHtmlChunk ? `${currentHtmlChunk}\n\n${chunk.text}` : chunk.text;
      if (nextHtmlChunk.length <= TELEGRAM_MESSAGE_LIMIT) {
        currentHtmlChunk = nextHtmlChunk;
        continue;
      }

      flushCurrentChunk();
      currentHtmlChunk = chunk.text;
    }
  }

  flushCurrentChunk();
  return transportMessages;
}

/**
 * Build a safe outbound Telegram payload from raw model output.
 *
 * @param message - Raw assistant response.
 * @returns Rich Telegram transport chunks plus clean local storage text.
 */
export function formatTelegramOutboundMessage(message: string): TelegramOutboundPayload {
  const storageText = buildStorageText(message);
  if (!storageText) {
    return { storageText: "", transportMessages: [] };
  }

  const renderBlocks = buildTelegramRenderBlocks(storageText);
  const transportMessages = packTransportMessages(renderBlocks);
  return { storageText, transportMessages };
}
