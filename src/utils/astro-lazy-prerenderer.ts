// src/utils/astro-lazy-prerenderer.ts
import { promises as fs } from 'fs';
import { join, resolve, dirname, relative } from 'path';
import { createHash } from 'crypto';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';

/**
 * @typedef {Object} AstroPrerenderPluginOptions
 * @property {string} componentsDir - Directory containing Astro components to prerender
 * @property {string} outputDir - Output directory for HTML fragments (in public folder)
 * @property {string} [name] - Plugin name for logging
 * @property {boolean} [verbose=false] - Enable verbose logging
 * @property {boolean} [cache=true] - Enable caching to skip unchanged files
 * @property {string} [cacheDir='.cache'] - Directory to store cache files
 * @property {string[]} [exclude=[]] - Patterns to exclude
 * @property {boolean} [generateTailwindCSS=true] - Generate Tailwind CSS for prerendered components
 * @property {string} [tailwindConfigPath='tailwind.config.mjs'] - Path to Tailwind config
 */

/**
 * Astro Component Prerender Plugin
 * Prerenders Astro components to static HTML in public folder
 * Public folder contents are automatically copied to output during build
 *
 * @param {AstroPrerenderPluginOptions} options
 * @returns {import('vite').Plugin}
 */
export function astroPrerenderPlugin(options: Partial<AstroPrerenderPluginOptions> = {}): Plugin {
    const {
        componentsDir,
        outputDir = 'public/prerendered',
        name = 'astro-prerender',
        verbose = true,
        cache = true,
        cacheDir = '.cache',
        exclude = [],
        generateTailwindCSS: shouldGenerateTailwindCSS = true,
        tailwindConfigPath = 'tailwind.config.mjs',
    } = options;

    if (!componentsDir) {
        throw new Error(`[${name}] componentsDir is required`);
    }

    let rootDir;
    let cacheFilePath;
    let fileCache = new Map();
    let allTailwindClasses = new Set();
    let allComponentStyles = [];
    let container = null;
    let viteServer = null;

    const log = (msg: string, emoji = '🔧') => {
        if (verbose) {
            console.log(
                `${emoji} ${new Date().toLocaleTimeString()} [${name}] ${msg}`,
            );
        }
    };

    const getFileHash = async (path: string): Promise<string | null> => {
        try {
            const content = await fs.readFile(path, 'utf-8');
            return createHash('md5').update(content).digest('hex');
        } catch {
            return null;
        }
    };

    const loadCache = async (): Promise<void> => {
        if (!cache) return;
        try {
            const data = await fs.readFile(cacheFilePath, 'utf-8');
            fileCache = new Map(JSON.parse(data));
            log(`Loaded cache (${fileCache.size} entries)`, '💾');
        } catch {
            log('Starting fresh cache', '🆕');
        }
    };

    const saveCache = async (): Promise<void> => {
        if (!cache) return;
        try {
            await fs.mkdir(dirname(cacheFilePath), { recursive: true });
            await fs.writeFile(
                cacheFilePath,
                JSON.stringify([...fileCache], null, 2),
            );
        } catch (err) {
            log(`Cache save failed: ${err.message}`, '⚠️');
        }
    };

    const findComponents = async (dir: string): Promise<string[]> => {
        const components: string[] = [];
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = join(dir, entry.name);
                if (entry.isDirectory()) {
                    components.push(...(await findComponents(fullPath)));
                } else if (entry.name.endsWith('.astro')) {
                    const relPath = relative(rootDir, fullPath);
                    if (!exclude.some((p: string) => relPath.includes(p))) {
                        components.push(fullPath);
                    }
                }
            }
        } catch (err) {
            log(`Error reading ${dir}: ${err.message}`, '❌');
        }
        return components;
    };

    /**
     * Generate Tailwind CSS for all collected classes
     */
    const generateTailwindCSS = async (): Promise<void> => {
        if (!shouldGenerateTailwindCSS || allTailwindClasses.size === 0) return;

        log(
            `Generating Tailwind CSS for ${allTailwindClasses.size} classes...`,
            '🎨',
        );

        // Create a temporary HTML with all classes
        const classesArray = Array.from(allTailwindClasses);
        const tempHTML = `<div class="${classesArray.join(' ')}"></div>`;

        // Generate CSS using Tailwind - only for the specific classes
        const css = `@tailwind base;\n@tailwind components;\n@tailwind utilities;`;

        try {
            const resolvedConfigPath = resolve(rootDir, tailwindConfigPath);

            // Load the Tailwind config
            const { default: tailwindConfig } = await import(
                `file://${resolvedConfigPath.replace(/\\/g, '/')}`
            );

            // Override content to ONLY process our extracted classes
            const customConfig = {
                ...tailwindConfig,
                content: [{ raw: tempHTML, extension: 'html' }],
                safelist: classesArray, // Ensure all classes are included
            };

            const result = await postcss([
                tailwindcss(customConfig),
                autoprefixer(),
            ]).process(css, { from: undefined });

            // Combine Tailwind CSS with extracted component styles
            let finalCSS = result.css;
            if (allComponentStyles.length > 0) {
                finalCSS +=
                    '\n\n/* Component Styles */\n' + allComponentStyles.join('\n\n');
                log(`Including ${allComponentStyles.length} component style(s)`, '🎨');
            }

            const cssOutputPath = join(rootDir, outputDir, 'lazy-components.css');
            await fs.writeFile(cssOutputPath, finalCSS);
            log(`Tailwind CSS generated: ${relative(rootDir, cssOutputPath)}`, '✅');
        } catch (err) {
            log(`Failed to generate Tailwind CSS: ${err.message}`, '❌');
            if (verbose) {
                console.error('Stack:', err.stack);
            }
        }
    };

    /**
     * Render a single Astro component to HTML
     * Uses Astro Container API to properly render components with imports
     */
    const renderComponent = async (componentPath: string): Promise<boolean> => {
        const relPath = relative(join(rootDir, componentsDir), componentPath);
        const outputPath = join(
            rootDir,
            outputDir,
            relPath.replace('.astro', '.html'),
        );

        try {
            // Initialize container if not already created
            if (!container) {
                container = await AstroContainer.create();
            }

            // Dynamically import the component
            let componentModule;
            if (viteServer) {
                componentModule = await viteServer.ssrLoadModule(componentPath);
            } else {
                // Fallback: try direct import during build
                componentModule = await import(
                    `file://${componentPath.replace(/\\/g, '/')}`
                );
            }
            const Component = componentModule.default;

            // Render the component to HTML
            const result = await container.renderToString(Component);
            let html = result;

            // Clean up the HTML for lazy loading:
            // Extract and collect style tags before removing them
            const styleMatches = html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi);
            for (const match of styleMatches) {
                const styleContent = match[1].trim();
                if (styleContent) {
                    // Add component identifier comment
                    allComponentStyles.push(
                        `/* Styles from ${relPath} */\n${styleContent}`,
                    );
                }
            }

            // Remove style tags from HTML (styles are externalized to CSS file)
            html = html.replace(/<style[^>]*>[\s\S]*?<\/style>\s*/gi, '');

            // Remove script tags with absolute file paths
            html = html.replace(
                /<script[^>]*src="[^"]*\?astro&type=script[^"]*"[^>]*><\/script>\s*/gi,
                '',
            );

            // Remove Astro development attributes
            html = html.replace(/\s*data-astro-source-file="[^"]*"/gi, '');
            html = html.replace(/\s*data-astro-source-loc="[^"]*"/gi, '');
            html = html.replace(/\s*data-astro-cid-[^=]*="[^"]*"/gi, '');

            // Extract all class names from the rendered HTML
            const classMatches = html.matchAll(/class[:]?=["']([^"']+)["']/g);
            for (const match of classMatches) {
                const classes = match[1].split(/\s+/).filter((c) => c);
                classes.forEach((cls) => allTailwindClasses.add(cls));
            }

            await fs.mkdir(dirname(outputPath), { recursive: true });
            await fs.writeFile(outputPath, html);

            log(`Rendered: ${relPath} → ${relative(rootDir, outputPath)}`, '✅');
            return true;
        } catch (err) {
            log(`Failed ${relPath}: ${err.message}`, '❌');
            if (verbose) {
                console.error('Stack:', err.stack);
            }
            return false;
        }
    };

    /**
     * Process all components in the source directory
     */
    const processAll = async (): Promise<void> => {
        const components = await findComponents(join(rootDir, componentsDir));
        log(`Found ${components.length} components`, '📋');

        let rendered = 0,
            skipped = 0,
            failed = 0;

        for (const path of components) {
            const hash = await getFileHash(path);
            if (cache && hash === fileCache.get(path)) {
                log(`Skipped (cached): ${relative(rootDir, path)}`, '⏭️');
                skipped++;
                continue;
            }

            if (await renderComponent(path)) {
                fileCache.set(path, hash);
                rendered++;
            } else {
                failed++;
            }
        }

        log(
            `Complete: ${rendered} rendered, ${skipped} skipped, ${failed} failed`,
            '🎉',
        );
        await saveCache();
        await generateTailwindCSS();
    };

    // Return a Vite plugin
    return {
        name,

        configResolved(config) {
            rootDir = config.root || process.cwd();
            cacheFilePath = resolve(rootDir, cacheDir, `${name}-cache.json`);
            log('Initialized', '🚀');
            log(`Components: ${componentsDir}`, '📁');
            log(`Output: ${outputDir}`, '📁');
        },

        async buildStart() {
            await loadCache();
            await processAll();
        },

        async configureServer(server) {
            viteServer = server;

            // Process all on server start
            await loadCache();
            await processAll();

            // Watch for changes
            const watchPath = resolve(rootDir, componentsDir);
            server.watcher.add(watchPath);

            server.watcher.on('change', async (path: string) => {
                if (path.endsWith('.astro') && path.startsWith(watchPath)) {
                    log(`Changed: ${relative(rootDir, path)}`, '🔄');
                    fileCache.delete(path); // Clear cache for this file
                    allTailwindClasses.clear(); // Clear classes to regenerate
                    allComponentStyles = []; // Clear styles to regenerate
                    await processAll(); // Reprocess all to collect all classes
                    server.ws.send({ type: 'full-reload' });
                }
            });

            server.watcher.on('add', async (path: string) => {
                if (path.endsWith('.astro') && path.startsWith(watchPath)) {
                    log(`Added: ${relative(rootDir, path)}`, '➕');
                    await renderComponent(path);
                    await saveCache();
                    await generateTailwindCSS();
                }
            });

            log('Watching for changes', '👀');
        },
    };
}