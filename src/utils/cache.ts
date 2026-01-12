//cache.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
 
/**
 * Manages cache for rendered components
 */
export class CacheManager {
  constructor(cacheDir) {
    this.cacheDir = cacheDir;
    this.cacheFile = join(cacheDir, '.prerender-cache.json');
    this.cache = new Map();
  }
 
  /**
   * Load cache from disk
   */
  async load() {
    try {
      const data = await readFile(this.cacheFile, 'utf-8');
      const parsed = JSON.parse(data);
      this.cache = new Map(Object.entries(parsed));
    } catch (error) {
      // Cache file doesn't exist or is invalid
      this.cache = new Map();
    }
  }
 
  /**
   * Save cache to disk
   */
  async save() {
    const data = JSON.stringify(Object.fromEntries(this.cache), null, 2);
    await writeFile(this.cacheFile, data, 'utf-8');
  }
 
  /**
   * Check if component is cached with same hash
   */
  isCached(componentPath, hash) {
    return this.cache.get(componentPath) === hash;
  }
 
  /**
   * Set component hash in cache
   */
  set(componentPath, hash) {
    this.cache.set(componentPath, hash);
  }
 
  /**
   * Delete component from cache
   */
  delete(componentPath) {
    this.cache.delete(componentPath);
  }
 
  /**
   * Clear all cache
   */
  clear() {
    this.cache.clear();
  }
}
 