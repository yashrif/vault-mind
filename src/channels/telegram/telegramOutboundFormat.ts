import { cleanMessageForCopy } from "@/utils";
import { stripSpecialTokens } from "@/utils/stripSpecialTokens";

/**
 * Normalize model markdown into Telegram-safe plain text.
 * Telegram bots can support parse modes, but arbitrary model markdown is too
 * fragile to pass through directly, so the transport keeps readable plain text.
 *
 * @param text - Cleaned assistant response text.
 * @returns Telegram-friendly plain text that preserves structure without markdown markers.
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
 * Convert a raw assistant response into the text that should be sent and
 * stored for Telegram-facing conversations.
 *
 * @param message - Raw assistant response from the chain.
 * @returns Telegram-friendly plain text.
 */
export function formatTelegramOutboundText(message: string): string {
  const cleanedMessage = stripSpecialTokens(cleanMessageForCopy(message));
  return normalizeMarkdownToTelegramText(cleanedMessage);
}
