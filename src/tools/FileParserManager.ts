import { ProjectConfig } from "@/aiParams";
import { PDFCache } from "@/cache/pdfCache";
import { ProjectContextCache } from "@/cache/projectContextCache";
import { logError, logInfo, logWarn } from "@/logger";
import { getSettings } from "@/settings/model";
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
const EPUB_EXTENSIONS = ["epub"];
const PLAIN_TEXT_EXTENSIONS = ["txt", "xml", "json", "log", "htm", "html"];

const UNSUPPORTED_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "bmp",
  "svg",
  "tiff",
  "webp",
  "mp3",
  "mp4",
  "mpeg",
  "mpga",
  "m4a",
  "wav",
  "webm",
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
async function parsePdfLocal(binary: ArrayBuffer): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = "";
  }
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(binary),
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
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
async function parseDocxLocal(binary: ArrayBuffer, extension: string): Promise<string> {
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
async function parseSpreadsheetLocal(binary: ArrayBuffer, _extension: string): Promise<string> {
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
 * Extract text from an EPUB archive by unzipping, walking the OPF spine, and converting HTML to markdown.
 */
async function parseEpubLocal(binary: ArrayBuffer): Promise<string> {
  const JSZipMod: any = await import("jszip");
  const JSZip = JSZipMod.default ?? JSZipMod;
  const zip = await JSZip.loadAsync(binary);

  const containerFile = zip.file("META-INF/container.xml");
  if (!containerFile) throw new Error("EPUB missing META-INF/container.xml");
  const containerXml: string = await containerFile.async("string");
  const opfPathMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!opfPathMatch) throw new Error("EPUB container.xml missing rootfile");
  const opfPath = opfPathMatch[1];
  const opfDir = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1) : "";

  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error(`EPUB missing OPF file ${opfPath}`);
  const opfXml: string = await opfFile.async("string");

  const manifest: Record<string, string> = {};
  const itemRegex = /<item\s+([^/>]+)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(opfXml)) !== null) {
    const attrs = m[1];
    const idMatch = attrs.match(/\bid="([^"]+)"/);
    const hrefMatch = attrs.match(/\bhref="([^"]+)"/);
    const typeMatch = attrs.match(/\bmedia-type="([^"]+)"/);
    if (idMatch && hrefMatch && typeMatch && /(xhtml|html|xml)/.test(typeMatch[1])) {
      manifest[idMatch[1]] = hrefMatch[1];
    }
  }

  const spineOrder: string[] = [];
  const itemrefRegex = /<itemref\s+[^>]*idref="([^"]+)"/g;
  while ((m = itemrefRegex.exec(opfXml)) !== null) {
    spineOrder.push(m[1]);
  }

  const turndown = new TurndownService({ headingStyle: "atx" });
  const parts: string[] = [];
  for (const id of spineOrder) {
    const href = manifest[id];
    if (!href) continue;
    const entry = zip.file(opfDir + href);
    if (!entry) continue;
    const html = await entry.async("string");
    parts.push(turndown.turndown(html));
  }
  return parts.join("\n\n").trim();
}

/**
 * Decode plain-text formats. Synchronous. HTML is passed through turndown.
 */
function parsePlainText(binary: ArrayBuffer, extension: string): string {
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
  return `[File "${file.basename}" (.${file.extension}) is not yet supported for parsing. Please convert to PDF, DOCX, TXT, or another supported format.]`;
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
 * Parses EPUB files locally by unzipping and converting HTML to markdown.
 */
export class EpubParser implements FileParser {
  supportedExtensions = EPUB_EXTENSIONS;

  async parseFile(file: TFile, vault: Vault): Promise<string> {
    try {
      const binary = await vault.readBinary(file);
      return await parseEpubLocal(binary);
    } catch (error) {
      logError(`Error parsing EPUB ${file.path}:`, error);
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
 * Project-mode parser: dispatches all supported formats to local parsers, caches via ProjectContextCache.
 */
export class ProjectFileParser implements FileParser {
  supportedExtensions = [
    ...PDF_EXTENSIONS,
    ...DOCX_EXTENSIONS,
    ...SPREADSHEET_EXTENSIONS,
    ...EPUB_EXTENSIONS,
    ...PLAIN_TEXT_EXTENSIONS,
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

      const binary = await vault.readBinary(file);
      const ext = file.extension.toLowerCase();
      let content: string;
      if (PDF_EXTENSIONS.includes(ext)) {
        content = await parsePdfLocal(binary);
      } else if (DOCX_EXTENSIONS.includes(ext)) {
        content = await parseDocxLocal(binary, ext);
      } else if (SPREADSHEET_EXTENSIONS.includes(ext)) {
        content = await parseSpreadsheetLocal(binary, ext);
      } else if (EPUB_EXTENSIONS.includes(ext)) {
        content = await parseEpubLocal(binary);
      } else if (PLAIN_TEXT_EXTENSIONS.includes(ext)) {
        content = parsePlainText(binary, ext);
      } else {
        content = makeUnsupportedMessage(file);
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
      this.registerParser(new EpubParser());
      this.registerParser(new PlainTextParser());
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
