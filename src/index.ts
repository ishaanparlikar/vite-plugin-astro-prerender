import { watch } from 'chokidar';
import { join, relative, basename } from 'node:path';
import {
  createLogger,
  findComponents,
  extractClasses,
  extractStyles,
  cleanHTML,
  getFileHash,
} from './utils';
import { CacheManager } from './utils/cache';
import { CSSGenerator } from './utils/css-generator';
import { ContainerRenderer } from './utils/container-renderer';
import { ParserRenderer } from './utils/parser-renderer';
 
// TypeScript Types
interface PluginOptions {
  componentsDir?: string;
  outputDir?: string;
  generateTailwindCSS?: boolean;
  tailwindConfigPath?: string;
  renderer?: 'parser' | 'container';
}

interface AstroPlugin {
  name: string;
  configResolved?(config: any): void;
  buildStart?(): Promise<void>;
  configureServer?(server: any): Promise<void>;
}

interface ComponentFile {
  path: string;
  hash: string;
  content: string;
}

/**
 * Astro Prerender Plugin
 * Prerenders Astro components to static HTML and generates optimized CSS
 */
export function astroPrerenderPlugin({
  componentsDir = 'src/components/Lazy',
  outputDir = 'public/prerendered',
  generateTailwindCSS = true,
  tailwindConfigPath = 'tailwind.config.mjs',
  renderer = 'parser' as const,
}: PluginOptions = {}): AstroPlugin {
  const logger = createLogger('astro-prerender');
  let config: any;
  let cacheManager: CacheManager | null = null;
  let cssGenerator: CSSGenerator | null = null;
  let componentRenderer: ContainerRenderer | ParserRenderer | null = null;
 
  return {
    name: 'astro-prerender-plugin',
 
    async configResolved(resolvedConfig: any) {
      config = resolvedConfig;
      const root = config.root;
 
      // Initialize cache manager
      cacheManager = new CacheManager(join(root, outputDir));
 
      // Initialize CSS generator
      if (generateTailwindCSS) {
        cssGenerator = new CSSGenerator(
          join(root, tailwindConfigPath),
          logger
        );
      }
 
      // Initialize renderer based on config
      if (renderer === 'container') {
        componentRenderer = new ContainerRenderer(logger);
        logger.info('Using Container API renderer (supports imports)');
      } else {
        componentRenderer = new ParserRenderer(logger);
        logger.info('Using Parser renderer (simpler, no imports)');
      }
    },
 
    async buildStart() {
      if (config?.command === 'build') {
        await processAll();
      }
    },
 
    async configureServer(server: any) {
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
 
  /**
   * Process all components
   */
  async function processAll() {
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
  async function processComponent(componentPath: string) {
    if (!config?.root) return;
    
    const root = config.root;
    const outputPath = join(root, outputDir);
 
    try {
      // Check cache
      if (cacheManager && typeof getFileHash === 'function') {
        const hash = await getFileHash(componentPath);
        if (cacheManager.isCached(componentPath, hash)) {
          logger.info(`Skipping cached: ${relative(root, componentPath)}`);
          return;
        }
      }
 
      // Render component
      if (componentRenderer && typeof componentRenderer.render === 'function') {
        const html = await componentRenderer.render(componentPath);
 
        // Extract styles before cleaning HTML
        if (html) {
          const styles = extractStyles(html);
          
          if (cssGenerator && styles.length > 0) {
            cssGenerator.addStyles(styles);
          }
 
          // Clean HTML
          const cleanedHTML = cleanHTML(html);
 
          // Extract Tailwind classes
          if (cssGenerator) {
            const classes = extractClasses(cleanedHTML);
            cssGenerator.addClasses(classes);
          }
 
          // Write HTML file
          const componentName = basename(componentPath, '.astro');
          const htmlOutputPath = join(
            outputPath, 
            `${componentName}.html`
          );
 
          // Type-safe dynamic import
          let { writeFileWithDir } = await import('./utils.mjs');
          
          if (typeof writeFileWithDir === 'function') {
            await writeFileWithDir(htmlOutputPath, cleanedHTML);
          }
 
          // Update cache
          if (cacheManager && typeof getFileHash === 'function') {
            const hash = await getFileHash(componentPath);
            cacheManager.set(componentPath, hash);
          }
 
          logger.success(`✅ ${componentName}.html (${cleanedHTML?.length || 0} chars)`);
        }
      }
    } catch (error) {
      logger.error(
        `Failed to process ${relative(root, componentPath)}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }
 
  /**
   * Generate CSS file
   */
  async function generateCSS() {
    if (!cssGenerator || !config?.root) return;
    
    const root = config.root;
    const outputPath = join(root, outputDir);
    const cssOutputPath = join(outputPath, 'lazy-components.css');
 
    if (typeof cssGenerator.generate === 'function') {
      await cssGenerator.generate(cssOutputPath);
    }
  }
}