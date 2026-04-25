import { logError, logInfo } from "@/logger";
import { MD5 } from "crypto-js";
import { TFile } from "obsidian";

export interface AudioTranscriptionCacheEntry {
  transcript: string;
  elapsed_time_ms: number;
  modelKey: string;
}

export class AudioTranscriptionCache {
  private static instance: AudioTranscriptionCache;
  private cacheDir: string = ".Cortex/audio-transcription-cache";

  private constructor() {}

  static getInstance(): AudioTranscriptionCache {
    if (!AudioTranscriptionCache.instance) {
      AudioTranscriptionCache.instance = new AudioTranscriptionCache();
    }
    return AudioTranscriptionCache.instance;
  }

  private async ensureCacheDir() {
    if (!(await app.vault.adapter.exists(this.cacheDir))) {
      logInfo("Creating audio transcription cache directory:", this.cacheDir);
      await app.vault.adapter.mkdir(this.cacheDir);
    }
  }

  private getCacheKey(file: TFile, modelKey: string, provider: string): string {
    const metadata = `${file.path}:${file.stat.size}:${file.stat.mtime}:${modelKey}:${provider}`;
    const key = MD5(metadata).toString();
    logInfo("Generated cache key for audio:", { path: file.path, key });
    return key;
  }

  private getCachePath(cacheKey: string): string {
    return `${this.cacheDir}/${cacheKey}.json`;
  }

  async get(
    file: TFile,
    modelKey: string,
    provider: string
  ): Promise<AudioTranscriptionCacheEntry | null> {
    try {
      const cacheKey = this.getCacheKey(file, modelKey, provider);
      const cachePath = this.getCachePath(cacheKey);

      if (await app.vault.adapter.exists(cachePath)) {
        logInfo("Cache hit for audio:", file.path);
        const content = await app.vault.adapter.read(cachePath);
        return JSON.parse(content);
      }
      logInfo("Cache miss for audio:", file.path);
      return null;
    } catch (error) {
      logError("Error reading from audio transcription cache:", error);
      return null;
    }
  }

  async set(
    file: TFile,
    modelKey: string,
    provider: string,
    entry: AudioTranscriptionCacheEntry
  ): Promise<void> {
    try {
      await this.ensureCacheDir();
      const cacheKey = this.getCacheKey(file, modelKey, provider);
      const cachePath = this.getCachePath(cacheKey);
      logInfo("Caching audio transcription for:", file.path);
      await app.vault.adapter.write(cachePath, JSON.stringify(entry));
    } catch (error) {
      logError("Error writing to audio transcription cache:", error);
    }
  }

  async clear(): Promise<void> {
    try {
      if (await app.vault.adapter.exists(this.cacheDir)) {
        const files = await app.vault.adapter.list(this.cacheDir);
        logInfo("Clearing audio transcription cache, removing files:", files.files.length);
        for (const file of files.files) {
          await app.vault.adapter.remove(file);
        }
      }
    } catch (error) {
      logError("Error clearing audio transcription cache:", error);
    }
  }
}
