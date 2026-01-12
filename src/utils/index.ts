import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
 
/**
 * Create a logger with colored output
 */
export function createLogger(name) {
  return {
    info: (msg) => console.log(`\x1b[36m[${name}]\x1b[0m ${msg}`),
    success: (msg) => console.log(`\x1b[32m[${name}]\x1b[0m ${msg}`),
    warn: (msg) => console.warn(`\x1b[33m[${name}]\x1b[0m ${msg}`),
    error: (msg) => console.error(`\x1b[31m[${name}]\x1b[0m ${msg}`),
  };
}
 
/**
 * Get MD5 hash of file content
 */
export async function getFileHash(filePath) {
  const content = await readFile(filePath, 'utf-8');
  return createHash('md5').update(content).digest('hex');
}
 
/**
 * Find all .astro files recursively in a directory
 */
export async function findComponents(dir) {
  const components = [];
  const entries = await readdir(dir, { withFileTypes: true });
 
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      components.push(...(await findComponents(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.astro')) {
      components.push(fullPath);
    }
  }
 
  return components;
}
 
/**
 * Extract Tailwind classes from HTML
 */
export function extractClasses(html) {
  const classMatches = html.matchAll(/class="([^"]*)"/g);
  const classes = new Set();
 
  for (const match of classMatches) {
    const classList = match[1].split(/\s+/);
    classList.forEach((cls) => {
      if (cls) classes.add(cls);
    });
  }
 
  return Array.from(classes);
}
 
/**
 * Extract style tags from HTML
 */
export function extractStyles(html) {
  const styleMatches = html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi);
  const styles = [];
 
  for (const match of styleMatches) {
    styles.push(match[1]);
  }
 
  return styles;
}
 
/**
 * Clean HTML output by removing unnecessary elements
 */
export function cleanHTML(html) {
  // Remove script tags
  html = html.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    '',
  );
  // Remove data-astro-source-file and data-astro-source-loc attributes
  html = html.replace(/\s*data-astro-source-[^=]*="[^"]*"/g, '');
  // Remove style tags (they're externalized)
  html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  return html.trim();
}
 
/**
 * Ensure directory exists
 */
export async function ensureDir(dir) {
  try {
    await mkdir(dir, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
}
 
/**
 * Write file with directory creation
 */
export async function writeFileWithDir(filePath, content) {
  const dir = join(filePath, '..');
  await ensureDir(dir);
  await writeFile(filePath, content, 'utf-8');
}
 