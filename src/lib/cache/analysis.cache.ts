import { ProviderAnalysisResult } from '../providers/types';

interface CacheEntry {
  data: ProviderAnalysisResult;
  expiresAt: number;
}

class AnalysisCache {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly defaultTtlMs: number = 10 * 60 * 1000; // 10 minutes
  private readonly maxEntries: number = 200;

  public get(key: string): ProviderAnalysisResult | null {
    if (!key) return null;
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  public set(key: string, data: ProviderAnalysisResult, ttlMs: number = this.defaultTtlMs): void {
    if (!key || !data) return;

    // Prune oldest if capacity reached
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  public has(key: string): boolean {
    return this.get(key) !== null;
  }

  public clear(): void {
    this.cache.clear();
  }

  public size(): number {
    return this.cache.size;
  }
}

export const analysisCache = new AnalysisCache();
