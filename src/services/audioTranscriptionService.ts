import { AudioTranscriptionCache } from "@/cache/audioTranscriptionCache";
import { ChatModelProviders } from "@/constants";
import { logError, logInfo } from "@/logger";
import { getModelKeyFromModel } from "@/settings/model";
import { getSettings } from "@/settings/model";
import { TFile, Vault } from "obsidian";

const GROQ_TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

interface STTProviderAdapter {
  maxFileSizeBytes: number;
  transcribe(
    binary: ArrayBuffer,
    fileName: string,
    modelName: string,
    apiKey: string
  ): Promise<string>;
}

const groqSTTAdapter: STTProviderAdapter = {
  maxFileSizeBytes: GROQ_MAX_FILE_SIZE_BYTES,

  async transcribe(
    binary: ArrayBuffer,
    fileName: string,
    modelName: string,
    apiKey: string
  ): Promise<string> {
    const form = new FormData();
    form.append("file", new Blob([binary]), fileName);
    form.append("model", modelName);
    form.append("response_format", "text");

    const response = await fetch(GROQ_TRANSCRIPTION_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const body = await response.json();
        errorMessage = body?.error?.message ?? errorMessage;
      } catch {
        // ignore JSON parse failure
      }
      return `[Error: Could not transcribe audio: ${errorMessage}]`;
    }

    return (await response.text()).trim();
  },
};

const PROVIDER_ADAPTERS: Partial<Record<ChatModelProviders, STTProviderAdapter>> = {
  [ChatModelProviders.GROQ]: groqSTTAdapter,
};

export class AudioTranscriptionService {
  private static _instance: AudioTranscriptionService;

  private constructor() {}

  static getInstance(): AudioTranscriptionService {
    if (!AudioTranscriptionService._instance) {
      AudioTranscriptionService._instance = new AudioTranscriptionService();
    }
    return AudioTranscriptionService._instance;
  }

  /**
   * Transcribes an audio file using the active STT model from settings.
   * Returns the transcript string. On error, returns a bracketed error message
   * so the caller's context pipeline stays intact.
   */
  async transcribe(file: TFile, vault: Vault): Promise<string> {
    const settings = getSettings();
    const { audioSTTModelKey, activeAudioSTTModels, groqApiKey } = settings;

    const activeModel = activeAudioSTTModels?.find(
      (m) => getModelKeyFromModel(m) === audioSTTModelKey
    );
    if (!activeModel) {
      return `[Error: Could not transcribe audio: no active STT model configured. Please add an Audio STT model in Settings.]`;
    }

    const provider = activeModel.provider as ChatModelProviders;
    const adapter = PROVIDER_ADAPTERS[provider];
    if (!adapter) {
      return `[Error: Could not transcribe audio: provider "${provider}" does not support transcription yet.]`;
    }

    // Size guard
    const fileSize = file.stat.size;
    if (fileSize > adapter.maxFileSizeBytes) {
      const limitMB = Math.round(adapter.maxFileSizeBytes / 1024 / 1024);
      return `[Error: Audio file exceeds ${limitMB} MB limit supported by ${provider}. Compress or split the file.]`;
    }

    // Cache check
    const modelKey = getModelKeyFromModel(activeModel);
    const cache = AudioTranscriptionCache.getInstance();
    const cached = await cache.get(file, modelKey, provider);
    if (cached) {
      logInfo("Audio transcription cache hit:", file.path);
      return cached.transcript;
    }

    // Resolve API key: prefer model-level key, fall back to settings groqApiKey for Groq
    const apiKey =
      activeModel.apiKey?.trim() || (provider === ChatModelProviders.GROQ ? groqApiKey : "");
    if (!apiKey) {
      return `[Error: Could not transcribe audio: API key for "${provider}" is not set.]`;
    }

    logInfo("Transcribing audio file:", file.path);
    const start = Date.now();

    try {
      const binary = await vault.readBinary(file);
      const transcript = await adapter.transcribe(binary, file.name, activeModel.name, apiKey);
      const elapsed = Date.now() - start;

      if (!transcript.startsWith("[Error:")) {
        await cache.set(file, modelKey, provider, {
          transcript,
          elapsed_time_ms: elapsed,
          modelKey,
        });
      }

      return transcript;
    } catch (err) {
      logError("Audio transcription failed:", err);
      return `[Error: Could not transcribe audio: ${err instanceof Error ? err.message : String(err)}]`;
    }
  }

  /**
   * Transcribes an audio File object (from the system file picker) without requiring a vault TFile.
   */
  async transcribeFromFile(file: File): Promise<string> {
    const settings = getSettings();
    const { audioSTTModelKey, activeAudioSTTModels, groqApiKey } = settings;

    const activeModel = activeAudioSTTModels?.find(
      (m) => getModelKeyFromModel(m) === audioSTTModelKey
    );
    if (!activeModel) {
      return `[Error: Could not transcribe audio: no active STT model configured. Please add an Audio STT model in Settings.]`;
    }

    const provider = activeModel.provider as ChatModelProviders;
    const adapter = PROVIDER_ADAPTERS[provider];
    if (!adapter) {
      return `[Error: Could not transcribe audio: provider "${provider}" does not support transcription yet.]`;
    }

    if (file.size > adapter.maxFileSizeBytes) {
      const limitMB = Math.round(adapter.maxFileSizeBytes / 1024 / 1024);
      return `[Error: Audio file exceeds ${limitMB} MB limit supported by ${provider}. Compress or split the file.]`;
    }

    const apiKey =
      activeModel.apiKey?.trim() || (provider === ChatModelProviders.GROQ ? groqApiKey : "");
    if (!apiKey) {
      return `[Error: Could not transcribe audio: API key for "${provider}" is not set.]`;
    }

    try {
      const binary = await file.arrayBuffer();
      return await adapter.transcribe(binary, file.name, activeModel.name, apiKey);
    } catch (err) {
      logError("Audio transcription failed:", err);
      return `[Error: Could not transcribe audio: ${err instanceof Error ? err.message : String(err)}]`;
    }
  }
}
