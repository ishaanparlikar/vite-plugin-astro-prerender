// src/utils/cache.ts
import { FlatCache } from 'flat-cache';

/**
 * Manages cache for rendered components using flat-cache
 * Uses file hashes to skip unchanged components
 */
export class CacheManager {
  private cache: FlatCache;
  private loaded: boolean = false;

  constructor(cacheDir: string) {
    this.cache = new FlatCache({
      cacheDir,
      cacheId: 'prerender-cache',
    });
  }

  /**
   * Load cache from disk
   */
  async load(): Promise<void> {
    if (!this.loaded) {
      this.cache.load();
      this.loaded = true;
    }
  }

  /**
   * Save cache to disk
   */
  async save(): Promise<void> {
    this.cache.save();
  }

  /**
   * Check if component is cached with same hash
   */
  isCached(componentPath: string, hash: string): boolean {
    return this.cache.getKey(componentPath) === hash;
  }

  /**
   * Set component hash in cache
   */
  set(componentPath: string, hash: string): void {
    this.cache.setKey(componentPath, hash);
  }

  /**
   * Delete component from cache
   */
  delete(componentPath: string): void {
    this.cache.delete(componentPath);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }
}