import { ProjectConfig } from "@/aiParams";
import { PDFCache } from "@/cache/pdfCache";
import { ProjectContextCache } from "@/cache/projectContextCache";
import { AUDIO_EXTENSIONS } from "@/constants";
import { logError, logInfo, logWarn } from "@/logger";
import { getSettings } from "@/settings/model";
import { AudioTranscriptionService } from "@/services/audioTranscriptionService";
import { saveConvertedDocOutput as saveConvertedDocOutputCore } from "@/utils/convertedDocOutput";
import { TFile, Vault } from "obsidian";
import TurndownService from "turndown";
import { CanvasLoader } from "./CanvasLoader";

interface FileParser {
  supportedExtensions: string[];
  parseFile: (file: TFile, vault: Vault) => Promise<string>;
}

/**
 * Thin wrapper that reads the output folder from settings and delegates to the pure function.
 */
export async function saveConvertedDocOutput(
  file: TFile,
  content: string,
  vault: Vault
): Promise<void> {
  const outputFolder = getSettings().convertedDocOutputFolder ?? "";
  await saveConvertedDocOutputCore(file, content, vault, outputFolder);
}

const PDF_EXTENSIONS = ["pdf"];
const DOCX_EXTENSIONS = ["doc", "docx", "docm", "dot", "dotm", "rtf"];
const SPREADSHEET_EXTENSIONS = [
  "xlsx",
  "xls",
  "xlsm",
  "xlsb",
  "xlw",
  "ods",
  "fods",
  "csv",
  "tsv",
  "dif",
  "slk",
  "sylk",
  "prn",
];
const PLAIN_TEXT_EXTENSIONS = [
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
];

const UNSUPPORTED_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "bmp",
  "svg",
  "tiff",
  "webp",
  // audio extensions removed — handled by AudioParser via STT
  "ppt",
  "pptx",
  "pptm",
  "pot",
  "potx",
  "potm",
  "pages",
  "numbers",
  "key",
  "hwp",
  "cwk",
  "abw",
  "wpd",
  "wps",
  "wk1",
  "wk2",
  "wk3",
  "wk4",
  "wks",
  "123",
  "wq1",
  "wq2",
  "wb1",
  "wb2",
  "wb3",
  "qpw",
  "xlr",
  "eth",
];

/**
 * Extract text from a PDF binary using pdfjs-dist (loaded lazily).
 */
export async function parsePdfLocal(binary: ArrayBuffer): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");

  if (!pdfjs.GlobalWorkerOptions.workerPort) {
    // @ts-ignore - The module exists but has no type definitions
    await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  }

  const doc = await pdfjs.getDocument({
    data: new Uint8Array(binary).slice(0), // Ensure a fresh copy of bytes
    useWorkerFetch: false,
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;

  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it: any) => ("str" in it ? it.str : "")).join(" ");
    parts.push(text);
    if (typeof page.cleanup === "function") {
      page.cleanup();
    }
  }
  if (typeof doc.cleanup === "function") {
    await doc.cleanup();
  }
  return parts.join("\n\n").trim();
}

/**
 * Convert DOCX/RTF to markdown using mammoth (loaded lazily). RTF uses a minimal control-word strip.
 */
export async function parseDocxLocal(binary: ArrayBuffer, extension: string): Promise<string> {
  if (extension === "rtf") {
    const text = new TextDecoder("utf-8").decode(binary);
    return text
      .replace(/\\'[0-9a-fA-F]{2}/g, "")
      .replace(/\\[a-zA-Z]+-?\d* ?/g, "")
      .replace(/[{}]/g, "")
      .trim();
  }
  const mammoth: any = await import("mammoth");
  const result = await mammoth.convertToMarkdown({ arrayBuffer: binary });
  return (result.value ?? "").trim();
}

/**
 * Parse spreadsheet bytes into a per-sheet tab-delimited block using xlsx (loaded lazily).
 */
export async function parseSpreadsheetLocal(
  binary: ArrayBuffer,
  _extension: string
): Promise<string> {
  const XLSX: any = await import("xlsx");
  const workbook = XLSX.read(new Uint8Array(binary), { type: "array" });
  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: "\t" });
    parts.push(`## Sheet: ${sheetName}\n\n${csv}`);
  }
  return parts.join("\n\n").trim();
}

/**
 * Decode plain-text formats. Synchronous. HTML is passed through turndown.
 */
export function parsePlainText(binary: ArrayBuffer, extension: string): string {
  const text = new TextDecoder("utf-8").decode(binary);
  if (extension === "htm" || extension === "html") {
    const turndown = new TurndownService({ headingStyle: "atx" });
    return turndown.turndown(text);
  }
  return text;
}

/**
 * Inline message returned for file types we cannot parse locally yet.
 */
function makeUnsupportedMessage(file: TFile): string {
  return `[Format .${file.extension} is not supported for parsing. Supported formats include PDF, DOCX, XLSX, TXT, MD, Canvas, and audio files (MP3, M4A, WAV, WebM).]`;
}

export class MarkdownParser implements FileParser {
  supportedExtensions = ["md", "base"];

  async parseFile(file: TFile, vault: Vault): Promise<string> {
    return await vault.read(file);
  }
}

export class CanvasParser implements FileParser {
  supportedExtensions = ["canvas"];

  async parseFile(file: TFile, vault: Vault): Promise<string> {
    try {
      logInfo("Parsing Canvas file:", file.path);
      const canvasLoader = new CanvasLoader(vault);
      const canvasData = await canvasLoader.load(file);
      return canvasLoader.buildPrompt(canvasData);
    } catch (error) {
      logError(`Error parsing Canvas file ${file.path}:`, error);
      return `[Error: Could not parse Canvas file ${file.basename}]`;
    }
  }
}

/**
 * Chat-mode PDF parser. Reads bytes locally via pdfjs-dist and caches results in PDFCache.
 */
export class PDFParser implements FileParser {
  supportedExtensions = PDF_EXTENSIONS;
  private pdfCache: PDFCache;

  constructor() {
    this.pdfCache = PDFCache.getInstance();
  }

  async parseFile(file: TFile, vault: Vault): Promise<string> {
    try {
      logInfo("Parsing PDF file:", file.path);

      const cached = await this.pdfCache.get(file);
      if (cached) {
        logInfo("Using cached PDF content for:", file.path);
        await saveConvertedDocOutput(file, cached.response, vault);
        return cached.response;
      }

      const start = Date.now();
      const binary = await vault.readBinary(file);
      const content = await parsePdfLocal(binary);
      await this.pdfCache.set(file, {
        response: content,
        elapsed_time_ms: Date.now() - start,
      });
      await saveConvertedDocOutput(file, content, vault);
      return content;
    } catch (error) {
      logError(`Error extracting content from PDF ${file.path}:`, error);
      return `[Error: Could not extract content from PDF ${file.basename}]`;
    }
  }

  async clearCache(): Promise<void> {
    logInfo("Clearing PDF cache");
    await this.pdfCache.clear();
  }
}

/**
 * Parses DOCX/DOC/RTF locally using mammoth.
 */
export class DocxParser implements FileParser {
  supportedExtensions = DOCX_EXTENSIONS;

  async parseFile(file: TFile, vault: Vault): Promise<string> {
    try {
      const binary = await vault.readBinary(file);
      return await parseDocxLocal(binary, file.extension.toLowerCase());
    } catch (error) {
      logError(`Error parsing ${file.extension} file ${file.path}:`, error);
      return `[Error: Could not parse ${file.basename}: ${(error as Error).message}]`;
    }
  }
}

/**
 * Parses spreadsheet formats (XLSX, ODS, CSV, etc.) locally using xlsx.
 */
export class SpreadsheetParser implements FileParser {
  supportedExtensions = SPREADSHEET_EXTENSIONS;

  async parseFile(file: TFile, vault: Vault): Promise<string> {
    try {
      const binary = await vault.readBinary(file);
      return await parseSpreadsheetLocal(binary, file.extension.toLowerCase());
    } catch (error) {
      logError(`Error parsing spreadsheet ${file.path}:`, error);
      return `[Error: Could not parse ${file.basename}: ${(error as Error).message}]`;
    }
  }
}

/**
 * Reads plain-text / lightly-structured formats (txt, json, xml, log, html) directly from bytes.
 */
export class PlainTextParser implements FileParser {
  supportedExtensions = PLAIN_TEXT_EXTENSIONS;

  async parseFile(file: TFile, vault: Vault): Promise<string> {
    try {
      const binary = await vault.readBinary(file);
      return parsePlainText(binary, file.extension.toLowerCase());
    } catch (error) {
      logError(`Error reading text file ${file.path}:`, error);
      return `[Error: Could not read ${file.basename}]`;
    }
  }
}

/**
 * Returns a human-readable message for formats we don't parse locally yet.
 */
export class UnsupportedFormatParser implements FileParser {
  supportedExtensions: string[];

  constructor(extensions: string[]) {
    this.supportedExtensions = extensions;
  }

  async parseFile(file: TFile): Promise<string> {
    logWarn(`[UnsupportedFormatParser] Unsupported file type: ${file.path}`);
    return makeUnsupportedMessage(file);
  }
}

/**
 * Transcribes audio files via the configured STT service (e.g. Groq whisper-large-v3).
 * Results are cached in AudioTranscriptionCache so repeated attaches are free.
 */
export class AudioParser implements FileParser {
  supportedExtensions = AUDIO_EXTENSIONS;

  async parseFile(file: TFile, vault: Vault): Promise<string> {
    logInfo("Transcribing audio file:", file.path);
    return AudioTranscriptionService.getInstance().transcribe(file, vault);
  }
}

/**
 * Project-mode parser: dispatches all supported formats to local parsers, caches via ProjectContextCache.
 */
export class ProjectFileParser implements FileParser {
  supportedExtensions = [
    ...PDF_EXTENSIONS,
    ...DOCX_EXTENSIONS,
    ...SPREADSHEET_EXTENSIONS,
    ...PLAIN_TEXT_EXTENSIONS,
    ...AUDIO_EXTENSIONS,
  ];
  private projectContextCache: ProjectContextCache;
  private currentProject: ProjectConfig | null;

  constructor(project: ProjectConfig | null = null) {
    this.projectContextCache = ProjectContextCache.getInstance();
    this.currentProject = project;
  }

  async parseFile(file: TFile, vault: Vault): Promise<string> {
    try {
      logInfo(
        `[ProjectFileParser] Project ${this.currentProject?.name}: Parsing ${file.extension} file: ${file.path}`
      );

      if (!this.currentProject) {
        logError("[ProjectFileParser] No project context for parsing file: ", file.path);
        throw new Error("No project context provided for file parsing");
      }

      const cachedContent = await this.projectContextCache.getOrReuseFileContext(
        this.currentProject,
        file.path
      );
      if (cachedContent) {
        logInfo(
          `[ProjectFileParser] Project ${this.currentProject.name}: Using cached content for: ${file.path}`
        );
        await saveConvertedDocOutput(file, cachedContent, vault);
        return cachedContent;
      }

      const ext = file.extension.toLowerCase();
      let content: string;
      if (AUDIO_EXTENSIONS.includes(ext)) {
        // Audio transcription uses its own cache keyed on model; skip the project cache.
        content = await AudioTranscriptionService.getInstance().transcribe(file, vault);
      } else {
        const binary = await vault.readBinary(file);
        if (PDF_EXTENSIONS.includes(ext)) {
          content = await parsePdfLocal(binary);
        } else if (DOCX_EXTENSIONS.includes(ext)) {
          content = await parseDocxLocal(binary, ext);
        } else if (SPREADSHEET_EXTENSIONS.includes(ext)) {
          content = await parseSpreadsheetLocal(binary, ext);
        } else if (PLAIN_TEXT_EXTENSIONS.includes(ext)) {
          content = parsePlainText(binary, ext);
        } else {
          content = makeUnsupportedMessage(file);
        }
      }

      await this.projectContextCache.setFileContext(this.currentProject, file.path, content);
      await saveConvertedDocOutput(file, content, vault);

      logInfo(
        `[ProjectFileParser] Project ${this.currentProject.name}: Successfully processed and cached: ${file.path}`
      );
      return content;
    } catch (error) {
      logError(
        `[ProjectFileParser] Project ${this.currentProject?.name}: Error processing file ${file.path}:`,
        error
      );
      const msg = error instanceof Error ? error.message : String(error);
      return `[Error: Could not parse ${file.basename}: ${msg}]`;
    }
  }
}

export class FileParserManager {
  private parsers: Map<string, FileParser> = new Map();

  constructor(_vault: Vault, isProjectMode: boolean = false, project: ProjectConfig | null = null) {
    this.registerParser(new MarkdownParser());
    this.registerParser(new CanvasParser());

    if (isProjectMode) {
      this.registerParser(new ProjectFileParser(project));
    } else {
      this.registerParser(new PDFParser());
      this.registerParser(new DocxParser());
      this.registerParser(new SpreadsheetParser());
      this.registerParser(new PlainTextParser());
      this.registerParser(new AudioParser());
    }

    this.registerParser(new UnsupportedFormatParser(UNSUPPORTED_EXTENSIONS));
  }

  registerParser(parser: FileParser) {
    for (const ext of parser.supportedExtensions) {
      this.parsers.set(ext, parser);
    }
  }

  async parseFile(file: TFile, vault: Vault): Promise<string> {
    const parser = this.parsers.get(file.extension.toLowerCase());
    if (!parser) {
      logWarn(`[FileParserManager] No parser for extension: ${file.extension}`);
      return makeUnsupportedMessage(file);
    }
    return await parser.parseFile(file, vault);
  }

  supportsExtension(extension: string): boolean {
    return this.parsers.has(extension.toLowerCase());
  }

  async clearPDFCache(): Promise<void> {
    const pdfParser = this.parsers.get("pdf");
    if (pdfParser instanceof PDFParser) {
      await pdfParser.clearCache();
    }
  }
}
