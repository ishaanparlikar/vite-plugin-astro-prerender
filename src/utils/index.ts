// src/utils/index.ts
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import fg from 'fast-glob';
import { outputFile, ensureDir as fsEnsureDir } from 'fs-extra';
import * as cheerio from 'cheerio';

// Re-export logger
export { createLogger, type Logger } from './logger';

/**
 * Get MD5 hash of file content
 */
export async function getFileHash(filePath: string): Promise<string> {
  const content = await readFile(filePath, 'utf-8');
  return createHash('md5').update(content).digest('hex');
}

/**
 * Find all .astro files recursively in a directory using fast-glob
 */
export async function findComponents(dir: string): Promise<string[]> {
  try {
    return await fg('**/*.astro', {
      cwd: dir,
      absolute: true,
      ignore: ['**/node_modules/**'],
    });
  } catch {
    // Directory doesn't exist or is not accessible
    return [];
  }
}

/**
 * Extract Tailwind classes from HTML using Cheerio
 */
export function extractClasses(html: string): string[] {
  const $ = cheerio.load(html);
  const classes = new Set<string>();

  $('[class]').each((_, el) => {
    const classList = $(el).attr('class')?.split(/\s+/) || [];
    classList.forEach((cls) => {
      if (cls) classes.add(cls);
    });
  });

  return Array.from(classes);
}

/**
 * Extract style tags from HTML using Cheerio
 */
export function extractStyles(html: string): string[] {
  const $ = cheerio.load(html);
  const styles: string[] = [];

  $('style').each((_, el) => {
    const content = $(el).html();
    if (content?.trim()) {
      styles.push(content);
    }
  });

  return styles;
}

/**
 * Clean HTML output by removing unnecessary elements using Cheerio
 */
export function cleanHTML(html: string): string {
  const $ = cheerio.load(html);

  // Remove script tags
  $('script').remove();

  // Remove style tags (they're externalized)
  $('style').remove();

  // Remove data-astro-* attributes
  $('*').each((_, el) => {
    const $el = $(el);
    const attrs = (el as unknown as { attribs?: Record<string, string> }).attribs || {};

    Object.keys(attrs).forEach((attr) => {
      if (attr.startsWith('data-astro-source-') || attr.startsWith('data-astro-cid-')) {
        $el.removeAttr(attr);
      }
    });
  });

  // Get the body content (Cheerio wraps in html/head/body)
  const body = $('body').html();
  return body?.trim() || $.html().trim();
}

/**
 * Minify HTML using html-minifier-terser
 */
export async function minifyHTML(html: string): Promise<string> {
  try {
    const { minify } = await import('html-minifier-terser');

    return await minify(html, {
      collapseWhitespace: true,
      removeComments: true,
      removeRedundantAttributes: true,
      removeEmptyAttributes: true,
      minifyCSS: true,
      minifyJS: true,
      conservativeCollapse: true,
      preserveLineBreaks: false,
    });
  } catch (error) {
    console.warn('html-minifier-terser not available, skipping minification');
    return html;
  }
}

/**
 * Ensure directory exists (using fs-extra)
 */
export { fsEnsureDir as ensureDir };

/**
 * Write file with directory creation (using fs-extra)
 */
export async function writeFileWithDir(filePath: string, content: string): Promise<void> {
  await outputFile(filePath, content, 'utf-8');
}