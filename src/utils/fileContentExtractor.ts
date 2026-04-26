import { AUDIO_EXTENSIONS } from "@/constants";
import { AudioTranscriptionService } from "@/services/audioTranscriptionService";
import {
  parseDocxLocal,
  parsePdfLocal,
  parsePlainText,
  parseSpreadsheetLocal,
} from "@/tools/FileParserManager";

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "tiff",
  "avif",
]);

const DOCX_EXTENSIONS = new Set(["doc", "docx", "docm", "dot", "dotm", "rtf"]);

const SPREADSHEET_EXTENSIONS = new Set([
  "xlsx",
  "xls",
  "xlsm",
  "xlsb",
  "xlw",
  "ods",
  "fods",
  "csv",
  "tsv",
]);

const PLAIN_TEXT_EXTENSIONS = new Set([
  "txt",
  "xml",
  "json",
  "log",
  "htm",
  "html",
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "css",
  "yaml",
  "yml",
  "java",
  "md",
  "base",
]);

const AUDIO_EXT_SET = new Set(AUDIO_EXTENSIONS);

function getExtension(file: File): string {
  return (file.name.split(".").pop() ?? "").toLowerCase();
}

/** Returns true if a File is an image (by MIME type or extension). */
export function isImageFile(file: File): boolean {
  const ext = getExtension(file);
  return file.type.startsWith("image/") || IMAGE_EXTENSIONS.has(ext);
}

/**
 * Extracts text content from a raw File object using the same underlying
 * parsers as FileParserManager (pdfjs, mammoth, xlsx, etc.).
 * Returns a plain text string, or a bracketed error message on failure.
 */
export async function extractFileContent(file: File): Promise<string> {
  const ext = getExtension(file);
  try {
    if (PLAIN_TEXT_EXTENSIONS.has(ext)) {
      const buf = await file.arrayBuffer();
      return parsePlainText(buf, ext);
    }
    if (ext === "pdf") {
      return await parsePdfLocal(await file.arrayBuffer());
    }
    if (DOCX_EXTENSIONS.has(ext)) {
      return await parseDocxLocal(await file.arrayBuffer(), ext);
    }
    if (SPREADSHEET_EXTENSIONS.has(ext)) {
      return await parseSpreadsheetLocal(await file.arrayBuffer(), ext);
    }
    if (AUDIO_EXT_SET.has(ext)) {
      return await AudioTranscriptionService.getInstance().transcribeFromFile(file);
    }
    return `[Cannot extract text from .${ext} files]`;
  } catch (err) {
    return `[Error extracting content from ${file.name}: ${err instanceof Error ? err.message : String(err)}]`;
  }
}
