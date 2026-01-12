//parser-renderer
import { parse } from '@astrojs/compiler';
import { readFile } from 'node:fs/promises';
 
/**
 * Renders components using Astro's AST parser
 * Simpler approach but doesn't resolve component imports
 */
export class ParserRenderer {
  constructor(logger) {
    this.logger = logger;
  }
 
  /**
   * Extract frontmatter variables from AST
   */
  extractFrontmatter(ast) {
    const frontmatter = ast.frontmatter;
    if (!frontmatter) return {};
 
    const vars = {};
    const code = frontmatter.value;
 
    // Simple extraction of const/let/var declarations
    const varMatches = code.matchAll(
      /(?:const|let|var)\s+(\w+)\s*=\s*["']([^"']+)["']/g,
    );
    for (const match of varMatches) {
      vars[match[1]] = match[2];
    }
 
    return vars;
  }
 
  /**
   * Extract template content from AST
   */
  extractTemplate(ast) {
    return ast.html;
  }
 
  /**
   * Convert AST node to HTML string
   */
  nodeToHTML(node, indent = '') {
    if (node.type === 'text') {
      return node.value;
    }
 
    if (node.type === 'element') {
      const attrs = node.attributes
        .map((attr) => {
          if (attr.kind === 'quoted') {
            return `${attr.name}="${attr.value}"`;
          } else if (attr.kind === 'empty') {
            return attr.name;
          }
          return '';
        })
        .filter(Boolean)
        .join(' ');
 
      const openTag = attrs ? `<${node.name} ${attrs}>` : `<${node.name}>`;
 
      if (node.children.length === 0) {
        // Self-closing or empty element
        if (['img', 'br', 'hr', 'input', 'meta', 'link'].includes(node.name)) {
          return openTag.replace('>', ' />');
        }
        return `${openTag}</${node.name}>`;
      }
 
      const children = node.children
        .map((child) => this.nodeToHTML(child, indent + '  '))
        .join('');
      return `${openTag}${children}</${node.name}>`;
    }
 
    if (node.type === 'component') {
      // Components won't be resolved in this renderer
      this.logger.warn(
        `Component <${node.name} /> found but won't be resolved (use container renderer for imports)`,
      );
      return `<!-- Component: ${node.name} -->`;
    }
 
    if (node.type === 'expression') {
      return `{${node.value}}`;
    }
 
    return '';
  }
 
  /**
   * Replace frontmatter variable expressions in HTML
   */
  replaceFrontmatterVars(html, vars) {
    for (const [key, value] of Object.entries(vars)) {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      html = html.replace(regex, value);
    }
    return html;
  }
 
  /**
   * Render a component to HTML
   */
  async render(componentPath) {
    try {
      const fileContent = await readFile(componentPath, 'utf-8');
 
      // Parse the Astro file
      const result = await parse(fileContent);
      const ast = result.ast;
 
      // Extract frontmatter variables
      const vars = this.extractFrontmatter(ast);
 
      // Get the HTML template
      const templateHTML = this.extractTemplate(ast);
 
      // Convert AST to HTML string
      let html = '';
      if (ast.children) {
        html = ast.children.map((child) => this.nodeToHTML(child)).join('');
      }
 
      // Replace variable expressions
      html = this.replaceFrontmatterVars(html, vars);
 
      return html;
    } catch (error) {
      this.logger.error(`Failed to render ${componentPath}: ${error.message}`);
      throw error;
    }
  }
}