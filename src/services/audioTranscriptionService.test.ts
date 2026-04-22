import { ChatModelProviders } from "@/constants";

// ----- mock setup -----
// jest.mock calls are hoisted above const declarations, so factories must not reference
// outer const variables. Instead we define mocks inline and retrieve them via jest.mocked().

jest.mock("@/logger", () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
}));

jest.mock("@/cache/audioTranscriptionCache", () => ({
  AudioTranscriptionCache: {
    getInstance: jest.fn(() => ({
      get: jest.fn(),
      set: jest.fn(),
    })),
  },
}));

jest.mock("@/settings/model", () => ({
  getSettings: jest.fn(),
  getModelKeyFromModel: jest.fn((m: any) => `${m.name}|${m.provider}`),
}));

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

// ----- imports (after mocks) -----
import { getSettings } from "@/settings/model";
import { AudioTranscriptionCache } from "@/cache/audioTranscriptionCache";
import { AudioTranscriptionService } from "./audioTranscriptionService";

// Typed references to auto-mocked functions
const mockGetSettings = getSettings as jest.Mock;
const mockCacheInstance = {
  get: jest.fn(),
  set: jest.fn(),
};
(AudioTranscriptionCache.getInstance as jest.Mock).mockReturnValue(mockCacheInstance);

// ----- helpers -----

function makeTFile(
  name: string,
  extension: string,
  sizeBytes = 1000
): { path: string; name: string; extension: string; stat: { size: number; mtime: number } } {
  return {
    path: `notes/${name}`,
    name,
    extension,
    stat: { size: sizeBytes, mtime: 1700000000000 },
  };
}

const mockVault = {
  readBinary: jest.fn(() => new ArrayBuffer(8)),
};

const baseModel = {
  name: "whisper-large-v3",
  provider: ChatModelProviders.GROQ,
  enabled: true,
  apiKey: "sk-test-key",
};

function makeSettings(overrides: Record<string, any> = {}) {
  return {
    audioSTTModelKey: `${baseModel.name}|${baseModel.provider}`,
    activeAudioSTTModels: [baseModel],
    groqApiKey: "sk-groq-key",
    ...overrides,
  };
}

// ----- tests -----

describe("AudioTranscriptionService", () => {
  let service: AudioTranscriptionService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset singleton so each test gets a clean instance
    (AudioTranscriptionService as any)._instance = undefined;
    (AudioTranscriptionCache.getInstance as jest.Mock).mockReturnValue(mockCacheInstance);
    service = AudioTranscriptionService.getInstance();
  });

  describe("transcribe - success path", () => {
    it("returns transcript text on 200 response", async () => {
      mockGetSettings.mockReturnValue(makeSettings());
      mockCacheInstance.get.mockResolvedValue(null);
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => "  hello world  ",
      });

      const file = makeTFile("recording.mp3", "mp3");
      const result = await service.transcribe(file as any, mockVault as any);

      expect(result).toBe("hello world");
    });

    it("calls Groq endpoint with correct method and auth header", async () => {
      mockGetSettings.mockReturnValue(makeSettings());
      mockCacheInstance.get.mockResolvedValue(null);
      mockFetch.mockResolvedValue({ ok: true, text: async () => "transcript" });

      const file = makeTFile("audio.wav", "wav");
      await service.transcribe(file as any, mockVault as any);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.groq.com/openai/v1/audio/transcriptions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ Authorization: "Bearer sk-test-key" }),
        })
      );
    });

    it("writes transcript to cache after successful transcription", async () => {
      mockGetSettings.mockReturnValue(makeSettings());
      mockCacheInstance.get.mockResolvedValue(null);
      mockFetch.mockResolvedValue({ ok: true, text: async () => "cached transcript" });

      const file = makeTFile("note.m4a", "m4a");
      await service.transcribe(file as any, mockVault as any);

      expect(mockCacheInstance.set).toHaveBeenCalled();
    });

    it("returns cached transcript without calling fetch", async () => {
      mockGetSettings.mockReturnValue(makeSettings());
      mockCacheInstance.get.mockResolvedValue({
        transcript: "cached result",
        elapsed_time_ms: 500,
        modelKey: "k",
      });

      const file = makeTFile("note.mp3", "mp3");
      const result = await service.transcribe(file as any, mockVault as any);

      expect(result).toBe("cached result");
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("transcribe - error paths", () => {
    it("returns bracketed error on HTTP 401", async () => {
      mockGetSettings.mockReturnValue(makeSettings());
      mockCacheInstance.get.mockResolvedValue(null);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: "Invalid API Key" } }),
      });

      const file = makeTFile("audio.mp3", "mp3");
      const result = await service.transcribe(file as any, mockVault as any);

      expect(result).toMatch(/^\[Error:/);
      expect(result).toContain("Invalid API Key");
    });

    it("returns bracketed error when no STT model configured", async () => {
      mockGetSettings.mockReturnValue(makeSettings({ activeAudioSTTModels: [] }));

      const file = makeTFile("note.mp3", "mp3");
      const result = await service.transcribe(file as any, mockVault as any);

      expect(result).toMatch(/^\[Error:/);
      expect(result).toContain("no active STT model");
    });

    it("returns bracketed error when API key is missing", async () => {
      mockGetSettings.mockReturnValue(
        makeSettings({
          activeAudioSTTModels: [{ ...baseModel, apiKey: "" }],
          groqApiKey: "",
        })
      );
      mockCacheInstance.get.mockResolvedValue(null);

      const file = makeTFile("note.mp3", "mp3");
      const result = await service.transcribe(file as any, mockVault as any);

      expect(result).toMatch(/^\[Error:/);
      expect(result).toContain("API key");
    });

    it("returns bracketed error when file exceeds 25 MB limit", async () => {
      const oversizeBytes = 26 * 1024 * 1024;
      mockGetSettings.mockReturnValue(makeSettings());
      mockCacheInstance.get.mockResolvedValue(null);

      const file = makeTFile("large.wav", "wav", oversizeBytes);
      const result = await service.transcribe(file as any, mockVault as any);

      expect(result).toMatch(/^\[Error:/);
      expect(result).toContain("25 MB");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("does not write error result to cache", async () => {
      mockGetSettings.mockReturnValue(makeSettings());
      mockCacheInstance.get.mockResolvedValue(null);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: "Server error" } }),
      });

      const file = makeTFile("note.mp3", "mp3");
      await service.transcribe(file as any, mockVault as any);

      expect(mockCacheInstance.set).not.toHaveBeenCalled();
    });
  });

  describe("transcribeFromFile", () => {
    function makeSystemFile(name: string, sizeBytes = 1000): File {
      return {
        name,
        size: sizeBytes,
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
      } as unknown as File;
    }

    it("returns transcript on 200 response", async () => {
      mockGetSettings.mockReturnValue(makeSettings());
      mockFetch.mockResolvedValue({ ok: true, text: async () => "  hello from file  " });

      const file = makeSystemFile("recording.mp3");
      const result = await service.transcribeFromFile(file);

      expect(result).toBe("hello from file");
    });

    it("calls Groq endpoint with correct method and auth header", async () => {
      mockGetSettings.mockReturnValue(makeSettings());
      mockFetch.mockResolvedValue({ ok: true, text: async () => "transcript" });

      const file = makeSystemFile("audio.wav");
      await service.transcribeFromFile(file);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.groq.com/openai/v1/audio/transcriptions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ Authorization: "Bearer sk-test-key" }),
        })
      );
    });

    it("returns bracketed error when no STT model configured", async () => {
      mockGetSettings.mockReturnValue(makeSettings({ activeAudioSTTModels: [] }));

      const file = makeSystemFile("audio.mp3");
      const result = await service.transcribeFromFile(file);

      expect(result).toMatch(/^\[Error:/);
      expect(result).toContain("no active STT model");
    });

    it("returns bracketed error when API key is missing", async () => {
      mockGetSettings.mockReturnValue(
        makeSettings({ activeAudioSTTModels: [{ ...baseModel, apiKey: "" }], groqApiKey: "" })
      );

      const file = makeSystemFile("audio.mp3");
      const result = await service.transcribeFromFile(file);

      expect(result).toMatch(/^\[Error:/);
      expect(result).toContain("API key");
    });

    it("returns bracketed error when file exceeds 25 MB", async () => {
      mockGetSettings.mockReturnValue(makeSettings());
      const oversizeBytes = 26 * 1024 * 1024;

      const file = makeSystemFile("large.wav", oversizeBytes);
      const result = await service.transcribeFromFile(file);

      expect(result).toMatch(/^\[Error:/);
      expect(result).toContain("25 MB");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns bracketed error on HTTP 401", async () => {
      mockGetSettings.mockReturnValue(makeSettings());
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: "Invalid API Key" } }),
      });

      const file = makeSystemFile("audio.mp3");
      const result = await service.transcribeFromFile(file);

      expect(result).toMatch(/^\[Error:/);
      expect(result).toContain("Invalid API Key");
    });

    it("does not check or update cache", async () => {
      mockGetSettings.mockReturnValue(makeSettings());
      mockFetch.mockResolvedValue({ ok: true, text: async () => "transcript" });

      const file = makeSystemFile("audio.mp3");
      await service.transcribeFromFile(file);

      expect(mockCacheInstance.get).not.toHaveBeenCalled();
      expect(mockCacheInstance.set).not.toHaveBeenCalled();
    });
  });
});
