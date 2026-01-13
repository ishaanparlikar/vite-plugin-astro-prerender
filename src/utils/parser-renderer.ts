// src/utils/parser-renderer.ts
import { parse } from '@astrojs/compiler';
import { readFile } from 'node:fs/promises';
import { consola } from 'consola';
import type { RootNode, Node, ElementNode, AttributeNode } from '@astrojs/compiler/types';

/**
 * Renders components using Astro's AST parser
 * Simpler approach but doesn't resolve component imports
 */
export class ParserRenderer {
  private logger = consola.withTag('ParserRenderer');

  /**
   * Extract frontmatter variables from AST
   */
  private extractFrontmatter(ast: RootNode): Record<string, string> {
    const frontmatter = (ast as unknown as { frontmatter?: { value?: string } }).frontmatter;
    if (!frontmatter || typeof frontmatter.value !== 'string') return {};

    const vars: Record<string, string> = {};
    const code = frontmatter.value;

    // Safe regex with limits
    const varMatches = code.matchAll(
      /(?:const|let|var)\s+(\w+)\s*=\s*["']([^"']+)["']/g
    );

    for (const match of varMatches) {
      if (match[1] && match[2]) {
        vars[match[1]] = match[2];
      }
    }

    return vars;
  }

  /**
   * Convert AST node to HTML string
   */
  private nodeToHTML(node: Node, indent = ''): string {
    if (node.type === 'text') {
      return (node as { type: 'text'; value: string }).value;
    } else if (node.type === 'element') {
      const elementNode = node as ElementNode;
      const attrs = elementNode.attributes
        .map((attr: AttributeNode) => {
          if (attr.kind === 'quoted' && attr.name && attr.value) {
            return `${attr.name}="${attr.value}"`;
          } else if (attr.kind === 'empty' && attr.name) {
            return attr.name;
          }
          return '';
        })
        .filter(Boolean)
        .join(' ');

      const openTag = attrs ? `<${elementNode.name} ${attrs}>` : `<${elementNode.name}>`;

      if (!elementNode.children || elementNode.children.length === 0) {
        // Self-closing tags
        if (['img', 'br', 'hr', 'input', 'meta', 'link'].includes(elementNode.name)) {
          return `${openTag.replace('>', ' />')}`;
        }
        return `${openTag}</${elementNode.name}>`;
      }

      const children = elementNode.children
        .map((child: Node) => this.nodeToHTML(child, indent + '  '))
        .join('\n');

      return `${openTag}${children}</${elementNode.name}>`;
    } else if (node.type === 'component') {
      const componentNode = node as { type: 'component'; name: string };
      // Warning for unmatched components
      this.logger.warn(
        `Component <${componentNode.name} /> found but won't be resolved (use container renderer for imports)`,
      );

      return `<!-- Component: ${componentNode.name} -->`;
    } else if (node.type === 'expression') {
      return `{${String(node)}}`;
    } else if (node.type === 'frontmatter') {
      // Skip frontmatter nodes
      return '';
    } else if ((node as { type: string }).type === 'style') {
      // Handle style nodes - include them so they get extracted
      const styleNode = node as unknown as { type: 'style'; attributes: AttributeNode[]; children: Node[] };
      const attrs = (styleNode.attributes || [])
        .map((attr: AttributeNode) => {
          if (attr.kind === 'quoted' && attr.name && attr.value) {
            return `${attr.name}="${attr.value}"`;
          } else if (attr.kind === 'empty' && attr.name) {
            return attr.name;
          }
          return '';
        })
        .filter(Boolean)
        .join(' ');

      const openTag = attrs ? `<style ${attrs}>` : '<style>';

      // Try to get content from children
      const content = (styleNode.children || [])
        .map((child: Node) => {
          if (child.type === 'text') {
            return (child as { type: 'text'; value: string }).value;
          }
          return '';
        })
        .join('');

      // If no children, try to get content directly
      const directContent = (node as { content?: string }).content || '';

      return `${openTag}${content || directContent}</style>`;
    }

    return '';
  }

  /**
   * Replace frontmatter variable expressions in HTML
   */
  private replaceFrontmatterVars(html: string, vars: Record<string, string>): string {
    let result = html;
    for (const [key, value] of Object.entries(vars)) {
      // Safe regex replacement
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\{${escapedKey}\\}`, 'g');
      result = result.replace(regex, value);
    }
    return result;
  }

  /**
   * Render a component to HTML
   */
  async render(filePath: string): Promise<string> {
    this.logger.info(`Rendering component: ${filePath}`);

    try {
      // Read and parse component
      const fileContent = await readFile(filePath, 'utf-8');

      // Parse Astro file
      const result = await parse(fileContent);
      const ast = result.ast;

      // Extract and log frontmatter variables
      const vars = this.extractFrontmatter(ast);
      this.logger.debug(`Extracted ${Object.keys(vars).length} frontmatter variables`);

      // Convert AST to HTML
      let html = '';
      if (ast.children) {
        html = ast.children.map((child: Node) => this.nodeToHTML(child)).join('\n');
      }

      // Replace variables
      html = this.replaceFrontmatterVars(html, vars);

      // Success logging
      this.logger.success(`Rendered ${filePath} (${html.length} chars)`);

      return html;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Failed to render ${filePath}: ${err.message}`);
      throw error;
    }
  }
}