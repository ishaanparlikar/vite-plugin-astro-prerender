// src/index.ts
import { watch } from 'chokidar';
import { join, relative, basename } from 'node:path';
import {
  createLogger,
  findComponents,
  extractClasses,
  extractStyles,
  cleanHTML,
  minifyHTML,
  getFileHash,
  writeFileWithDir,
} from './utils';
import { CacheManager } from './utils/cache';
import { CSSGenerator } from './utils/css-generator';
import { ContainerRenderer } from './utils/container-renderer';
import { ParserRenderer } from './utils/parser-renderer';
import type { AstroIntegration } from 'astro';
import type { Plugin as VitePlugin, ResolvedConfig, ViteDevServer } from 'vite';

// ============================================================================
// Types
// ============================================================================

/**
 * Plugin configuration options
 */
export interface PluginOptions {
  /** Directory containing components to prerender (default: 'src/components/Lazy') */
  componentsDir?: string;
  /** Output directory for prerendered files (default: 'public/prerendered') */
  outputDir?: string;
  /** Generate Tailwind CSS file with tree-shaking (default: true) */
  generateTailwindCSS?: boolean;
  /** Path to Tailwind config file (default: 'tailwind.config.mjs') */
  tailwindConfigPath?: string;
  /** Rendering strategy: 'parser' (simple) or 'container' (full features) */
  renderer?: 'parser' | 'container';
  /** Minify HTML output to reduce file size (default: true) */
  minify?: boolean;
}

// ============================================================================
// Vite Plugin
// ============================================================================

/**
 * Astro Prerender Vite Plugin
 * Prerenders Astro components to static HTML and generates optimized CSS
 */
export function astroPrerenderPlugin({
  componentsDir = 'src/components/Lazy',
  outputDir = 'public/prerendered',
  generateTailwindCSS = true,
  tailwindConfigPath = 'tailwind.config.mjs',
  renderer = 'parser',
  minify = true,
}: PluginOptions = {}): VitePlugin {
  const logger = createLogger('astro-prerender');
  let config: ResolvedConfig | null = null;
  let cacheManager: CacheManager | null = null;
  let cssGenerator: CSSGenerator | null = null;
  let componentRenderer: ContainerRenderer | ParserRenderer | null = null;
  let parserFallback: ParserRenderer | null = null;

  /**
   * Process all components
   */
  async function processAll(): Promise<void> {
    if (!config?.root) return;

    const root = config.root;
    const componentsPath = join(root, componentsDir);
    const outputPath = join(root, outputDir);

    logger.info(`Processing components from ${componentsDir}...`);

    // Load cache
    if (cacheManager) {
      await cacheManager.load();
    }

    // Clear CSS generator
    if (cssGenerator) {
      cssGenerator.clear();
    }

    // Find all components
    const componentFiles = await findComponents(componentsPath);

    if (componentFiles.length === 0) {
      logger.warn(`No .astro files found in ${componentsDir}`);
      return;
    }

    // Process each component
    for (const componentPath of componentFiles) {
      await processComponent(componentPath);
    }

    // Generate CSS
    await generateCSS();

    // Save cache
    if (cacheManager) {
      await cacheManager.save();
    }

    logger.success(`Processed ${componentFiles.length} component(s)`);
  }

  /**
   * Process a single component
   */
  async function processComponent(componentPath: string): Promise<void> {
    if (!config?.root) return;

    const root = config.root;
    const outputPath = join(root, outputDir);

    try {
      // Check cache
      if (cacheManager) {
        const hash = await getFileHash(componentPath);
        if (cacheManager.isCached(componentPath, hash)) {
          logger.info(`Skipping cached: ${relative(root, componentPath)}`);
          return;
        }
      }

      // Render component
      if (componentRenderer) {
        let html = await componentRenderer.render(componentPath);

        // If container renderer returned null, fall back to parser
        if (!html && parserFallback) {
          logger.info(`Falling back to parser for: ${relative(root, componentPath)}`);
          html = await parserFallback.render(componentPath);
        }

        if (html) {
          // Extract styles before cleaning HTML
          const styles = extractStyles(html);

          if (cssGenerator && styles.length > 0) {
            cssGenerator.addStyles(styles);
          }

          // Clean HTML
          let cleanedHTML = cleanHTML(html);

          // Extract Tailwind classes
          if (cssGenerator) {
            const classes = extractClasses(cleanedHTML);
            cssGenerator.addClasses(classes);
          }

          // Minify HTML if enabled
          if (minify) {
            const originalSize = cleanedHTML.length;
            cleanedHTML = await minifyHTML(cleanedHTML);
            const minifiedSize = cleanedHTML.length;
            const savings = Math.round((1 - minifiedSize / originalSize) * 100);
            logger.info(`Minified: ${originalSize} → ${minifiedSize} bytes (${savings}% smaller)`);
          }

          // Write HTML file
          const componentName = basename(componentPath, '.astro');
          const htmlOutputPath = join(outputPath, `${componentName}.html`);

          await writeFileWithDir(htmlOutputPath, cleanedHTML);

          // Update cache
          if (cacheManager) {
            const hash = await getFileHash(componentPath);
            cacheManager.set(componentPath, hash);
          }

          logger.success(`${componentName}.html (${cleanedHTML.length} chars)`);
        }
      }
    } catch (error) {
      logger.error(
        `Failed to process ${relative(root, componentPath)}: ${error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Generate CSS file
   */
  async function generateCSS(): Promise<void> {
    if (!cssGenerator || !config?.root) return;

    const root = config.root;
    const outputPath = join(root, outputDir);
    const cssOutputPath = join(outputPath, 'lazy-components.css');

    await cssGenerator.generate(cssOutputPath);
  }

  return {
    name: 'astro-prerender-plugin',

    configResolved(resolvedConfig: ResolvedConfig) {
      config = resolvedConfig;
      const root = config.root;

      // Initialize cache manager
      cacheManager = new CacheManager(join(root, outputDir));

      // Always initialize CSS generator (it will handle component styles even without Tailwind)
      cssGenerator = new CSSGenerator(
        join(root, tailwindConfigPath),
        logger,
        generateTailwindCSS
      );

      // Initialize renderer based on config
      if (renderer === 'container') {
        componentRenderer = new ContainerRenderer(logger);
        parserFallback = new ParserRenderer(); // Fallback for when container fails
        logger.info('Using Container API renderer (supports imports)');
      } else {
        componentRenderer = new ParserRenderer();
        logger.info('Using Parser renderer (simpler, no imports)');
      }
    },

    async buildStart() {
      if (config?.command === 'build') {
        await processAll();
      }
    },

    async configureServer(server: ViteDevServer) {
      // Set Vite server for Container renderer
      if (componentRenderer instanceof ContainerRenderer) {
        componentRenderer.setViteServer(server);
      }

      // Initial processing
      await processAll();

      // Watch for changes in components directory
      const componentsPath = join(config?.root || '', componentsDir);
      const watcher = watch(componentsPath, {
        ignored: /node_modules/,
        persistent: true,
      });

      watcher.on('change', async (filePath: string) => {
        if (!config?.root) return;

        logger.info(`Component changed: ${relative(config.root, filePath)}`);
        await processComponent(filePath);
        await generateCSS();
      });

      watcher.on('add', async (filePath: string) => {
        if (!config?.root) return;

        logger.info(`Component added: ${relative(config.root, filePath)}`);
        await processComponent(filePath);
        await generateCSS();
      });

      watcher.on('unlink', (filePath: string) => {
        if (!config?.root) return;

        logger.info(`Component removed: ${relative(config.root, filePath)}`);
        cacheManager?.delete(filePath);
      });
    },
  };
}

// ============================================================================
// Astro Integration
// ============================================================================

/**
 * Astro Integration wrapper for the prerender plugin
 * Use this in your astro.config.mjs integrations array
 * 
 * @example
 * ```js
 * import { astroPrerenderIntegration } from 'astro-prerender-plugin';
 * 
 * export default defineConfig({
 *   integrations: [
 *     astroPrerenderIntegration({
 *       componentsDir: 'src/components/Lazy',
 *     }),
 *   ],
 * });
 * ```
 */
export function astroPrerenderIntegration(options: PluginOptions = {}): AstroIntegration {
  return {
    name: 'astro-prerender-integration',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => {
        updateConfig({
          vite: {
            plugins: [astroPrerenderPlugin(options)],
          },
        });
      },
    },
  };
}

// ============================================================================
// Re-exports
// ============================================================================

// Core utilities
export { CacheManager } from './utils/cache';
export { CSSGenerator } from './utils/css-generator';
export { ContainerRenderer } from './utils/container-renderer';
export { ParserRenderer } from './utils/parser-renderer';
export type { Logger } from './utils/logger';

// Lazy loader (client-side utility)
export {
  LazyHTMLLoader,
  createLazyLoader,
  lazyLoader,
  type LazyLoaderConfig,
  type CSSModuleManifest,
  type LoadStats,
} from './utils/LazyLoader';