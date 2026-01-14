// src/utils/LazyLoader.ts
// Client-side utility for lazy loading prerendered HTML components

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration options for the LazyHTMLLoader
 */
export interface LazyLoaderConfig {
    /** Base URL for prerendered files (default: '/prerendered') */
    baseUrl?: string;
    /** Enable CSS modules mode with per-component CSS (default: false) */
    cssModules?: boolean;
    /** URL to CSS modules manifest (default: '/prerendered/manifest.json') */
    manifestUrl?: string;
    /** URL to base CSS file in CSS modules mode (default: '/prerendered/base.css') */
    baseCssUrl?: string;
    /** URL to legacy single CSS file (default: '/prerendered/lazy-components.css') */
    legacyCssUrl?: string;
    /** Preload CSS files before they're needed (default: false) */
    preloadCSS?: boolean;
    /** Cache loaded HTML in memory (default: true) */
    cacheHTML?: boolean;
    /** Enable retry logic for failed fetches (default: true) */
    enableRetry?: boolean;
    /** Maximum number of retry attempts (default: 3) */
    maxRetries?: number;
    /** Delay between retries in milliseconds (default: 1000) */
    retryDelay?: number;
    /** Enable debug logging (default: false) */
    debug?: boolean;
    /** Callback when a component is loaded */
    onLoad?: (componentName: string, stats: {
        duration: number;
        bytes: number;
        fromCache: boolean;
        secondaryAssets?: Array<{ url: string; bytes: number; duration: number; type: string }>
    }) => void;
    /** Callback when an error occurs */
    onError?: (componentName: string, error: Error) => void;
    /** Callback when CSS is loaded */
    onCSSLoad?: (cssFile: string, duration: number) => void;
}

/**
 * CSS module manifest structure
 */
export interface CSSModuleManifest {
    /** Map of component names to their CSS file paths */
    components: Record<string, string>;
}

/**
 * Load statistics
 */
export interface LoadStats {
    /** Total number of successful loads */
    totalLoads: number;
    /** Number of cache hits */
    cacheHits: number;
    /** Number of cache misses */
    cacheMisses: number;
    /** Number of errors encountered */
    errors: number;
    /** Average load time in milliseconds */
    averageLoadTime: number;
    /** Total bytes transferred across all loads */
    totalBytes: number;
}

// ============================================================================
// LazyHTMLLoader Class
// ============================================================================

/**
 * Client-side utility for lazy loading prerendered HTML components
 * 
 * @example
 * ```ts
 * import { createLazyLoader } from 'vite-plugin-astro-prerender';
 * 
 * const loader = createLazyLoader({ debug: true });
 * 
 * // Load and inject when in viewport
 * loader.observeAndLoad('LazyFooter', '#footer-container');
 * 
 * // Or load manually
 * const html = await loader.load('LazyHeader');
 * document.getElementById('header')!.innerHTML = html;
 * ```
 */
export class LazyHTMLLoader {
    private config: Required<LazyLoaderConfig>;
    private htmlCache = new Map<string, string>();
    private cssCache = new Set<string>();
    private observers = new Map<string, IntersectionObserver>();
    private manifest: CSSModuleManifest | null = null;
    private manifestLoaded = false;
    private baseCssLoaded = false;
    private legacyCssLoaded = false;
    private stats = {
        totalLoads: 0,
        cacheHits: 0,
        cacheMisses: 0,
        errors: 0,
        totalLoadTime: 0,
        totalBytes: 0,
    };
    private detailedStats = new Map<string, {
        duration: number;
        bytes: number;
        fromCache: boolean;
        timestamp: number;
        secondaryAssets?: Array<{ url: string; bytes: number; duration: number; type: string }>
    }>();

    constructor(config: LazyLoaderConfig = {}) {
        const baseUrl = config.baseUrl ?? '/prerendered';
        this.config = {
            baseUrl,
            cssModules: config.cssModules ?? false,
            manifestUrl: config.manifestUrl ?? `${baseUrl}/manifest.json`,
            baseCssUrl: config.baseCssUrl ?? `${baseUrl}/base.css`,
            legacyCssUrl: config.legacyCssUrl ?? `${baseUrl}/lazy-components.css`,
            preloadCSS: config.preloadCSS ?? false,
            cacheHTML: config.cacheHTML ?? true,
            enableRetry: config.enableRetry ?? true,
            maxRetries: config.maxRetries ?? 3,
            retryDelay: config.retryDelay ?? 1000,
            debug: config.debug ?? false,
            onLoad: config.onLoad ?? (() => { }),
            onError: config.onError ?? (() => { }),
            onCSSLoad: config.onCSSLoad ?? (() => { }),
        };

        this.log('LazyHTMLLoader initialized', this.config);
    }

    /**
     * Internal logging method
     */
    private log(message: string, ...args: unknown[]): void {
        if (this.config.debug) {
            console.log(`[LazyHTMLLoader] ${message}`, ...args);
        }
    }

    /**
     * Fetch with retry logic
     */
    private async fetchWithRetry(
        url: string,
        retries = this.config.maxRetries,
    ): Promise<Response> {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                this.log(`Fetching ${url} (attempt ${attempt}/${retries})`);
                const response = await fetch(url);

                if (response.ok) {
                    return response;
                }

                if (attempt === retries) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                // Don't retry on 404
                if (response.status === 404) {
                    throw new Error(`Not found: ${url}`);
                }

                this.log(`Fetch failed with status ${response.status}, retrying...`);
            } catch (error) {
                if (attempt === retries) {
                    throw error;
                }
                this.log(`Fetch error: ${error}, retrying...`);
            }

            // Wait before retrying
            if (attempt < retries) {
                await new Promise((resolve) =>
                    setTimeout(resolve, this.config.retryDelay * attempt),
                );
            }
        }

        throw new Error(`Failed to fetch ${url} after ${retries} attempts`);
    }

    /**
     * Load CSS manifest for CSS modules mode
     */
    private async loadManifest(): Promise<void> {
        if (this.manifestLoaded) {
            return;
        }

        const startTime = performance.now();

        try {
            const response = await (this.config.enableRetry
                ? this.fetchWithRetry(this.config.manifestUrl)
                : fetch(this.config.manifestUrl));

            if (!response.ok) {
                throw new Error(`Failed to load manifest: ${response.statusText}`);
            }

            this.manifest = await response.json();
            this.manifestLoaded = true;

            const duration = performance.now() - startTime;
            this.log(`Manifest loaded in ${duration.toFixed(2)}ms`, this.manifest);
            this.config.onCSSLoad(this.config.manifestUrl, duration);
        } catch (error) {
            console.error('Failed to load CSS manifest:', error);
            // Fallback to legacy mode
            this.config.cssModules = false;
            this.manifestLoaded = true;
        }
    }

    /**
     * Load base CSS file (CSS modules mode)
     */
    private async loadBaseCSS(): Promise<void> {
        if (this.baseCssLoaded) {
            return;
        }

        await this.loadManifest();

        if (!this.manifest) {
            return;
        }

        const startTime = performance.now();

        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = this.config.baseCssUrl;

            link.onload = () => {
                this.baseCssLoaded = true;
                const duration = performance.now() - startTime;
                this.log(`Base CSS loaded in ${duration.toFixed(2)}ms`);
                this.config.onCSSLoad(this.config.baseCssUrl, duration);
                resolve();
            };

            link.onerror = () => {
                console.error('Failed to load base CSS');
                reject(new Error('Failed to load base CSS'));
            };

            if (this.config.preloadCSS) {
                const preload = document.createElement('link');
                preload.rel = 'preload';
                preload.as = 'style';
                preload.href = this.config.baseCssUrl;
                document.head.appendChild(preload);
            }

            document.head.appendChild(link);
        });
    }

    /**
     * Load component-specific CSS file (CSS modules mode)
     */
    private async loadComponentCSS(componentName: string): Promise<void> {
        if (!this.config.cssModules || !this.manifest) {
            return;
        }

        const cssFile = this.manifest.components[componentName];
        if (!cssFile) {
            this.log(`No CSS file for component: ${componentName}`);
            return;
        }

        if (this.cssCache.has(cssFile)) {
            this.log(`CSS already loaded: ${cssFile}`);
            return;
        }

        const startTime = performance.now();
        const cssUrl = `${this.config.baseUrl}/${cssFile}`;

        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = cssUrl;

            link.onload = () => {
                this.cssCache.add(cssFile);
                const duration = performance.now() - startTime;
                this.log(
                    `Component CSS loaded in ${duration.toFixed(2)}ms: ${cssFile}`,
                );
                this.config.onCSSLoad(cssFile, duration);
                resolve();
            };

            link.onerror = () => {
                console.error(`Failed to load component CSS: ${cssFile}`);
                reject(new Error(`Failed to load CSS: ${cssFile}`));
            };

            if (this.config.preloadCSS) {
                const preload = document.createElement('link');
                preload.rel = 'preload';
                preload.as = 'style';
                preload.href = cssUrl;
                document.head.appendChild(preload);
            }

            document.head.appendChild(link);
        });
    }

    /**
     * Load legacy single CSS file
     */
    private async loadLegacyCSS(): Promise<void> {
        if (this.legacyCssLoaded) {
            return;
        }

        const startTime = performance.now();

        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = this.config.legacyCssUrl;

            link.onload = () => {
                this.legacyCssLoaded = true;
                const duration = performance.now() - startTime;
                this.log(`Legacy CSS loaded in ${duration.toFixed(2)}ms`);
                this.config.onCSSLoad(this.config.legacyCssUrl, duration);
                resolve();
            };

            link.onerror = () => {
                console.error('Failed to load legacy CSS');
                reject(new Error('Failed to load lazy components CSS'));
            };

            if (this.config.preloadCSS) {
                const preload = document.createElement('link');
                preload.rel = 'preload';
                preload.as = 'style';
                preload.href = this.config.legacyCssUrl;
                document.head.appendChild(preload);
            }

            document.head.appendChild(link);
        });
    }

    /**
     * Load HTML fragment from server
     */
    async load(componentName: string): Promise<string> {
        const startTime = performance.now();

        try {
            // Check cache
            if (this.config.cacheHTML && this.htmlCache.has(componentName)) {
                this.stats.cacheHits++;
                this.log(`Cache hit: ${componentName}`);
                const html = this.htmlCache.get(componentName)!;
                const bytes = new Blob([html]).size;
                const duration = performance.now() - startTime;

                this.stats.totalLoads++;
                this.stats.totalLoadTime += duration;

                const loadInfo = { duration, bytes, fromCache: true, timestamp: Date.now() };
                this.detailedStats.set(componentName, loadInfo);
                this.config.onLoad(componentName, { duration, bytes, fromCache: true });

                return html;
            }

            this.stats.cacheMisses++;

            // Load CSS
            if (this.config.cssModules) {
                await this.loadBaseCSS().catch((err) => {
                    console.warn('Failed to load base CSS:', err);
                });
                await this.loadComponentCSS(componentName).catch((err) => {
                    console.warn(`Failed to load CSS for ${componentName}:`, err);
                });
            } else {
                await this.loadLegacyCSS().catch((err) => {
                    console.warn('Failed to load legacy CSS:', err);
                });
            }

            // Fetch HTML
            const url = `${this.config.baseUrl}/${componentName}.html`;
            const response = await (this.config.enableRetry
                ? this.fetchWithRetry(url)
                : fetch(url));

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const html = await response.text();
            const bytes = new Blob([html]).size;

            // Cache HTML
            if (this.config.cacheHTML) {
                this.htmlCache.set(componentName, html);
            }

            // Update stats
            const duration = performance.now() - startTime;
            this.stats.totalLoads++;
            this.stats.totalLoadTime += duration;
            this.stats.totalBytes += bytes;

            this.log(`Loaded ${componentName} in ${duration.toFixed(2)}ms (${bytes} bytes)`);

            // Start tracking secondary assets (images, etc.) that might be triggered by this injection
            const secondaryAssets: Array<{ url: string; bytes: number; duration: number; type: string }> = [];

            const resourceObserver = new PerformanceObserver((list) => {
                list.getEntries().forEach((entry) => {
                    const res = entry as PerformanceResourceTiming;
                    // Filter for assets likely triggered by this component
                    if (res.startTime >= (startTime - 50)) {
                        const assetBytes = res.transferSize || res.decodedBodySize || res.encodedBodySize || 0;

                        secondaryAssets.push({
                            url: res.name,
                            bytes: assetBytes,
                            duration: res.duration,
                            type: res.initiatorType
                        });

                        // Update total bytes and global stats with secondary assets
                        this.stats.totalBytes += assetBytes;
                    }
                });
            });

            try {
                // Use buffered: true to catch resources that might have started 
                // between performance.now() and observe() call
                resourceObserver.observe({ entryTypes: ['resource'], buffered: true });

                // Stop observing after a reasonable time (longer for assets)
                setTimeout(() => resourceObserver.disconnect(), 6000);
            } catch (e) {
                this.log('PerformanceObserver failed');
                // Fallback attempt without buffering if that was the cause
                try { resourceObserver.observe({ entryTypes: ['resource'] }); } catch (err) { }
            }

            const loadInfo = {
                duration,
                bytes,
                fromCache: false,
                timestamp: Date.now(),
                secondaryAssets
            };
            this.detailedStats.set(componentName, loadInfo);
            this.config.onLoad(componentName, { duration, bytes, fromCache: false, secondaryAssets });

            return html;
        } catch (error) {
            this.stats.errors++;
            const err = error instanceof Error ? error : new Error(String(error));
            this.log(`Error loading ${componentName}:`, err);
            this.config.onError(componentName, err);
            throw err;
        }
    }

    /**
     * Inject HTML fragment into target element
     */
    async inject(componentName: string, targetSelector: string): Promise<void> {
        const html = await this.load(componentName);
        const target = document.querySelector(targetSelector);

        if (target) {
            target.innerHTML = html;
            this.log(`Injected ${componentName} into ${targetSelector}`);
        } else {
            const error = new Error(`Target element not found: ${targetSelector}`);
            this.config.onError(componentName, error);
            throw error;
        }
    }

    /**
     * Load HTML fragment when target element enters viewport
     */
    observeAndLoad(
        componentName: string,
        targetSelector: string,
        options?: IntersectionObserverInit,
    ): void {
        const target = document.querySelector(targetSelector);
        if (!target) {
            console.warn(`Target element not found: ${targetSelector}`);
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        this.log(`Component ${componentName} entered viewport`);
                        this.inject(componentName, targetSelector).catch((err) => {
                            console.error(`Failed to inject ${componentName}:`, err);
                        });
                        observer.disconnect();
                        this.observers.delete(componentName);
                    }
                });
            },
            options || { rootMargin: '100px' },
        );

        observer.observe(target);
        this.observers.set(componentName, observer);
        this.log(`Observing ${componentName} at ${targetSelector}`);
    }

    /**
     * Preload HTML fragment without injecting
     */
    async preload(componentName: string): Promise<void> {
        await this.load(componentName);
    }

    /**
     * Batch preload multiple components
     */
    async preloadBatch(componentNames: string[]): Promise<void> {
        this.log(`Preloading ${componentNames.length} components:`, componentNames);
        await Promise.all(componentNames.map((name) => this.preload(name)));
    }

    /**
     * Get load statistics
     */
    getStats(): LoadStats {
        return {
            totalLoads: this.stats.totalLoads,
            cacheHits: this.stats.cacheHits,
            cacheMisses: this.stats.cacheMisses,
            errors: this.stats.errors,
            averageLoadTime:
                this.stats.totalLoads > 0
                    ? this.stats.totalLoadTime / this.stats.totalLoads
                    : 0,
            totalBytes: this.stats.totalBytes,
        };
    }

    /**
     * Get detailed history of all loads in this session
     */
    getDetailedHistory(): Array<{ componentName: string; duration: number; bytes: number; fromCache: boolean; timestamp: number }> {
        return Array.from(this.detailedStats.entries()).map(([name, info]) => ({
            componentName: name,
            ...info,
        })).sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Clear HTML cache
     */
    clearCache(): void {
        this.htmlCache.clear();
        this.log('HTML cache cleared');
    }

    /**
     * Clear CSS cache (forces reload of CSS files)
     */
    clearCSSCache(): void {
        this.cssCache.clear();
        this.baseCssLoaded = false;
        this.legacyCssLoaded = false;
        this.manifestLoaded = false;
        this.manifest = null;
        this.log('CSS cache cleared');
    }

    /**
     * Disconnect all observers
     */
    disconnectAll(): void {
        this.observers.forEach((observer) => observer.disconnect());
        this.observers.clear();
        this.log('All observers disconnected');
    }

    /**
     * Reset all state (cache, observers, stats)
     */
    reset(): void {
        this.clearCache();
        this.clearCSSCache();
        this.disconnectAll();
        this.stats = {
            totalLoads: 0,
            cacheHits: 0,
            cacheMisses: 0,
            errors: 0,
            totalLoadTime: 0,
            totalBytes: 0,
        };
        this.detailedStats.clear();
        this.log('LazyHTMLLoader reset');
    }
}

/**
 * Factory function to create a lazy loader instance
 */
export function createLazyLoader(config?: LazyLoaderConfig): LazyHTMLLoader {
    return new LazyHTMLLoader(config);
}

/**
 * Default lazy loader instance with default configuration
 */
export const lazyLoader = new LazyHTMLLoader();