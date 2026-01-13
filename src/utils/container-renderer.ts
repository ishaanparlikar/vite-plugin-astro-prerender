// src/utils/container-renderer.ts
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import type { Logger } from './logger';

interface ViteDevServer {
  ssrLoadModule(url: string): Promise<Record<string, unknown>>;
}

/**
 * Renders components using Astro Container API
 * Supports component imports and full Astro features
 */
export class ContainerRenderer {
  private logger: Logger;
  private container: Awaited<ReturnType<typeof AstroContainer.create>> | null;
  private viteServer: ViteDevServer | null;

  constructor(logger: Logger) {
    this.logger = logger;
    this.container = null;
    this.viteServer = null;
  }

  /**
   * Set Vite server instance (required for dev mode)
   */
  setViteServer(server: ViteDevServer): void {
    this.viteServer = server;
  }

  /**
   * Initialize the container
   */
  private async init(): Promise<void> {
    if (!this.container) {
      this.container = await AstroContainer.create();
    }
  }

  /**
   * Render a component to HTML
   */
  async render(componentPath: string): Promise<string> {
    await this.init();

    try {
      const fileContent = await readFile(componentPath, 'utf-8');

      // Extract frontmatter to get variable values
      const frontmatterMatch = fileContent.match(/^---\s*\n([\s\S]*?)\n---/);
      const frontmatterVars: Record<string, string> = {};

      if (frontmatterMatch) {
        const frontmatterCode = frontmatterMatch[1];
        // Simple extraction of const/let/var declarations
        const varMatches = frontmatterCode.matchAll(
          /(?:const|let|var)\s+(\w+)\s*=\s*["']([^"']+)["']/g,
        );
        for (const match of varMatches) {
          frontmatterVars[match[1]] = match[2];
        }
      }

      let ComponentModule: Record<string, unknown>;

      // Container renderer requires Vite SSR to work with .astro files
      if (!this.viteServer) {
        this.logger.warn('Container renderer requires Vite dev server - use Parser renderer for builds');
        return null as unknown as string;
      }

      try {
        // Ensure the server has the ssrLoadModule method
        if (typeof this.viteServer.ssrLoadModule !== 'function') {
          this.logger.warn('Vite server does not support SSR module loading');
          return null as unknown as string;
        }

        ComponentModule = await this.viteServer.ssrLoadModule(componentPath);
      } catch (error: unknown) {
        const err = error as Error;
        this.logger.warn(`Failed to load via Vite SSR: ${err.message}`);
        // Return null to signal fallback to parser renderer
        return null as unknown as string;
      }

      // Render the component with props from frontmatter
      const result = await this.container!.renderToString(
        ComponentModule.default as Awaited<ReturnType<typeof AstroContainer.create>> extends { renderToString: (c: infer T, ...args: unknown[]) => unknown } ? T : never,
        {
          props: frontmatterVars,
        },
      );

      // Replace {varName} expressions with actual values
      let html = result;
      for (const [key, value] of Object.entries(frontmatterVars)) {
        const regex = new RegExp(`\\{${key}\\}`, 'g');
        html = html.replace(regex, value);
      }

      return html;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Failed to render ${componentPath}: ${err.message}`);
      throw error;
    }
  }
}