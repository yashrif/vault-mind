import { AUDIO_EXTENSIONS } from "@/constants";

// ----- mocks (factories must not reference outer const/let before initialization) -----

jest.mock("@/logger", () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

jest.mock("@/settings/model", () => ({
  getSettings: jest.fn(() => ({ convertedDocOutputFolder: "" })),
}));

jest.mock("@/utils/convertedDocOutput", () => ({
  saveConvertedDocOutput: jest.fn(),
}));

jest.mock("@/cache/pdfCache", () => ({
  PDFCache: { getInstance: jest.fn(() => ({ get: jest.fn(() => null), set: jest.fn() })) },
}));

jest.mock("@/cache/projectContextCache", () => ({
  ProjectContextCache: {
    getInstance: jest.fn(() => ({
      getOrReuseFileContext: jest.fn(() => null),
      setFileContext: jest.fn(),
    })),
  },
}));

jest.mock("@/services/audioTranscriptionService", () => ({
  AudioTranscriptionService: {
    getInstance: jest.fn(() => ({ transcribe: jest.fn() })),
  },
}));

jest.mock("@/cache/audioTranscriptionCache", () => ({
  AudioTranscriptionCache: {
    getInstance: jest.fn(() => ({
      get: jest.fn(() => null),
      set: jest.fn(),
    })),
  },
}));

jest.mock("./CanvasLoader", () => ({
  CanvasLoader: jest.fn().mockImplementation(() => ({
    load: jest.fn(),
    buildPrompt: jest.fn(() => "canvas content"),
  })),
}));

jest.mock("obsidian", () => ({
  TFile: class MockTFile {
    path: string;
    name: string;
    basename: string;
    extension: string;
    stat: { size: number; mtime: number };
    constructor(path: string, extension: string, sizeBytes = 1000) {
      this.path = path;
      this.extension = extension;
      this.name = `file.${extension}`;
      this.basename = "file";
      this.stat = { size: sizeBytes, mtime: Date.now() };
    }
  },
}));

// ----- imports (after mocks) -----
import { AudioTranscriptionService } from "@/services/audioTranscriptionService";
import { FileParserManager, AudioParser } from "./FileParserManager";

// Helper to create a mock TFile-like object
function makeTFile(path: string, extension: string, sizeBytes = 1000) {
  return {
    path,
    extension,
    name: `file.${extension}`,
    basename: "file",
    stat: { size: sizeBytes, mtime: Date.now() },
  };
}

const mockVault = {
  read: jest.fn(),
  readBinary: jest.fn(() => new ArrayBuffer(8)),
};

// ----- tests -----

describe("FileParserManager - audio dispatch (chat mode)", () => {
  let manager: FileParserManager;
  let mockTranscribe: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTranscribe = jest.fn();
    (AudioTranscriptionService.getInstance as jest.Mock).mockReturnValue({
      transcribe: mockTranscribe,
    });
    manager = new FileParserManager(mockVault as any, false);
  });

  it("supports all audio extensions", () => {
    for (const ext of AUDIO_EXTENSIONS) {
      expect(manager.supportsExtension(ext)).toBe(true);
    }
  });

  it("dispatches .mp3 to AudioTranscriptionService and returns transcript", async () => {
    mockTranscribe.mockResolvedValue("hello world");
    const file = makeTFile("voice.mp3", "mp3");

    const result = await manager.parseFile(file as any, mockVault as any);

    expect(mockTranscribe).toHaveBeenCalledWith(file, mockVault);
    expect(result).toBe("hello world");
  });

  it("dispatches .m4a to AudioTranscriptionService", async () => {
    mockTranscribe.mockResolvedValue("transcription");
    const file = makeTFile("note.m4a", "m4a");

    await manager.parseFile(file as any, mockVault as any);

    expect(mockTranscribe).toHaveBeenCalledTimes(1);
  });

  it("returns error string from service without throwing", async () => {
    const errorMsg = "[Error: Could not transcribe audio: HTTP 401]";
    mockTranscribe.mockResolvedValue(errorMsg);
    const file = makeTFile("note.wav", "wav");

    const result = await manager.parseFile(file as any, mockVault as any);

    expect(result).toBe(errorMsg);
  });

  it("returns unsupported message for unregistered extension", async () => {
    const file = makeTFile("pres.pptx", "pptx");

    const result = await manager.parseFile(file as any, mockVault as any);

    expect(result).toContain("not supported");
  });
});

describe("AudioParser", () => {
  let mockTranscribe: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTranscribe = jest.fn();
    (AudioTranscriptionService.getInstance as jest.Mock).mockReturnValue({
      transcribe: mockTranscribe,
    });
  });

  it("includes all AUDIO_EXTENSIONS in supportedExtensions", () => {
    const parser = new AudioParser();
    for (const ext of AUDIO_EXTENSIONS) {
      expect(parser.supportedExtensions).toContain(ext);
    }
  });

  it("delegates to AudioTranscriptionService.transcribe", async () => {
    const parser = new AudioParser();
    mockTranscribe.mockResolvedValue("transcript text");
    const file = makeTFile("audio.mp3", "mp3");

    const result = await parser.parseFile(file as any, mockVault as any);

    expect(mockTranscribe).toHaveBeenCalledWith(file, mockVault);
    expect(result).toBe("transcript text");
  });
});
