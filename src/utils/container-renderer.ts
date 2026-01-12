/* Renders components using Astro Container API
 * Supports component imports and full Astro features
 */
export class ContainerRenderer {
  constructor(logger) {
    this.logger = logger;
    this.container = null;
    this.viteServer = null;
  }
 
  /**
   * Set Vite server instance (required for dev mode)
   */
  setViteServer(server) {
    this.viteServer = server;
  }
 
  /**
   * Initialize the container
   */
  async init() {
    if (!this.container) {
      this.container = await AstroContainer.create();
    }
  }
 
  /**
   * Render a component to HTML
   */
  async render(componentPath) {
    await this.init();
 
    try {
      const fileContent = await readFile(componentPath, 'utf-8');
 
      // Extract frontmatter to get variable values
      const frontmatterMatch = fileContent.match(/^---\s*\n([\s\S]*?)\n---/);
      let frontmatterVars = {};
 
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
 
      let ComponentModule;
 
      // Try to load the component using Vite SSR in dev mode
      if (this.viteServer) {
        try {
          ComponentModule = await this.viteServer.ssrLoadModule(componentPath);
        } catch (error) {
          this.logger.warn(`Failed to load via Vite SSR: ${error.message}`);
          // Fallback to direct import
          const { pathToFileURL } = await import('node:url');
          ComponentModule = await import(pathToFileURL(componentPath).href);
        }
      } else {
        // In build mode, use direct import
        const { pathToFileURL } = await import('node:url');
        ComponentModule = await import(pathToFileURL(componentPath).href);
      }
 
      // Render the component with props from frontmatter
      const result = await this.container.renderToString(
        ComponentModule.default,
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
    } catch (error) {
      this.logger.error(`Failed to render ${componentPath}: ${error.message}`);
      throw error;
    }
  }
}