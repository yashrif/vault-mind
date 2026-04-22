// ----- mocks (hoisted above imports) -----

jest.mock("@/tools/FileParserManager", () => ({
  parsePlainText: jest.fn(() => "plain text content"),
  parsePdfLocal: jest.fn().mockResolvedValue("pdf content"),
  parseDocxLocal: jest.fn().mockResolvedValue("docx content"),
  parseSpreadsheetLocal: jest.fn().mockResolvedValue("spreadsheet content"),
}));

jest.mock("@/services/audioTranscriptionService", () => ({
  AudioTranscriptionService: {
    getInstance: jest.fn(() => ({
      transcribeFromFile: jest.fn().mockResolvedValue("audio transcript"),
    })),
  },
}));

jest.mock("@/logger", () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
}));

// ----- imports (after mocks) -----
import {
  parsePlainText,
  parsePdfLocal,
  parseDocxLocal,
  parseSpreadsheetLocal,
} from "@/tools/FileParserManager";
import { AudioTranscriptionService } from "@/services/audioTranscriptionService";
import { isImageFile, extractFileContent } from "./fileContentExtractor";

// ----- helpers -----

/** Create a minimal File-like object for testing. */
function makeFile(name: string, mimeType = ""): File {
  const buf = new ArrayBuffer(8);
  return {
    name,
    type: mimeType,
    size: 8,
    arrayBuffer: jest.fn().mockResolvedValue(buf),
  } as unknown as File;
}

let mockTranscribeFromFile: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockTranscribeFromFile = jest.fn().mockResolvedValue("audio transcript");
  (AudioTranscriptionService.getInstance as jest.Mock).mockReturnValue({
    transcribeFromFile: mockTranscribeFromFile,
  });
});

// ----- isImageFile -----

describe("isImageFile", () => {
  it("returns true for MIME type starting with image/", () => {
    expect(isImageFile(makeFile("photo.png", "image/png"))).toBe(true);
    expect(isImageFile(makeFile("pic.jpeg", "image/jpeg"))).toBe(true);
  });

  it("returns true for image extensions regardless of MIME type", () => {
    const imageExts = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "tiff", "avif"];
    for (const ext of imageExts) {
      expect(isImageFile(makeFile(`file.${ext}`))).toBe(true);
    }
  });

  it("returns false for non-image extensions", () => {
    const nonImageExts = ["pdf", "txt", "docx", "mp3", "xlsx", "json", "mp4"];
    for (const ext of nonImageExts) {
      expect(isImageFile(makeFile(`file.${ext}`))).toBe(false);
    }
  });

  it("returns false for a file with no extension and no MIME type", () => {
    expect(isImageFile(makeFile("noextension"))).toBe(false);
  });

  it("is case-insensitive for extensions", () => {
    expect(isImageFile(makeFile("photo.PNG"))).toBe(true);
    expect(isImageFile(makeFile("photo.JPG"))).toBe(true);
  });
});

// ----- extractFileContent -----

describe("extractFileContent", () => {
  describe("plain text routing", () => {
    it.each(["txt", "json", "md", "ts", "tsx", "js", "jsx", "py", "css", "yaml", "yml", "xml"])(
      "routes .%s to parsePlainText",
      async (ext) => {
        const file = makeFile(`file.${ext}`);
        const result = await extractFileContent(file);
        expect(parsePlainText).toHaveBeenCalled();
        expect(result).toBe("plain text content");
      }
    );
  });

  describe("PDF routing", () => {
    it("routes .pdf to parsePdfLocal", async () => {
      const file = makeFile("doc.pdf");
      const result = await extractFileContent(file);
      expect(parsePdfLocal).toHaveBeenCalled();
      expect(result).toBe("pdf content");
    });
  });

  describe("DOCX routing", () => {
    it.each(["docx", "doc", "docm"])(
      "routes .%s to parseDocxLocal",
      async (ext) => {
        const file = makeFile(`doc.${ext}`);
        const result = await extractFileContent(file);
        expect(parseDocxLocal).toHaveBeenCalled();
        expect(result).toBe("docx content");
      }
    );
  });

  describe("spreadsheet routing", () => {
    it.each(["xlsx", "xls", "csv", "tsv", "ods"])(
      "routes .%s to parseSpreadsheetLocal",
      async (ext) => {
        const file = makeFile(`sheet.${ext}`);
        const result = await extractFileContent(file);
        expect(parseSpreadsheetLocal).toHaveBeenCalled();
        expect(result).toBe("spreadsheet content");
      }
    );
  });

  describe("audio routing", () => {
    it.each(["mp3", "wav", "m4a", "webm", "mp4", "mpeg"])(
      "routes .%s to AudioTranscriptionService.transcribeFromFile",
      async (ext) => {
        const file = makeFile(`audio.${ext}`);
        const result = await extractFileContent(file);
        expect(mockTranscribeFromFile).toHaveBeenCalledWith(file);
        expect(result).toBe("audio transcript");
      }
    );
  });

  describe("unknown extensions", () => {
    it("returns bracketed message for unknown extension", async () => {
      const file = makeFile("file.xyz");
      const result = await extractFileContent(file);
      expect(result).toBe("[Cannot extract text from .xyz files]");
    });

    it("returns bracketed message for image extensions (not routed to text extraction)", async () => {
      const file = makeFile("photo.png");
      const result = await extractFileContent(file);
      expect(result).toMatch(/\[Cannot extract text from \.png files\]/);
    });
  });

  describe("error handling", () => {
    it("returns bracketed error message when parsePdfLocal throws", async () => {
      (parsePdfLocal as jest.Mock).mockRejectedValueOnce(new Error("corrupt PDF"));
      const file = makeFile("broken.pdf");
      const result = await extractFileContent(file);
      expect(result).toMatch(/^\[Error extracting content from broken\.pdf:/);
      expect(result).toContain("corrupt PDF");
    });

    it("returns bracketed error message when parseDocxLocal throws", async () => {
      (parseDocxLocal as jest.Mock).mockRejectedValueOnce(new Error("bad DOCX"));
      const file = makeFile("broken.docx");
      const result = await extractFileContent(file);
      expect(result).toMatch(/^\[Error extracting content from broken\.docx:/);
      expect(result).toContain("bad DOCX");
    });

    it("returns bracketed error for non-Error thrown values", async () => {
      (parsePdfLocal as jest.Mock).mockRejectedValueOnce("string error");
      const file = makeFile("file.pdf");
      const result = await extractFileContent(file);
      expect(result).toContain("string error");
    });

    it("returns bracketed error when transcribeFromFile throws", async () => {
      mockTranscribeFromFile.mockRejectedValueOnce(new Error("API error"));
      const file = makeFile("audio.mp3");
      const result = await extractFileContent(file);
      expect(result).toMatch(/^\[Error extracting content from audio\.mp3:/);
      expect(result).toContain("API error");
    });
  });
});
