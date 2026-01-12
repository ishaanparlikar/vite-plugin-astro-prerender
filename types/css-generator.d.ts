// types/css-generator.d.ts
import { PostCSS } from 'postcss';
import { TailwindConfig, tailwindcss } from 'tailwindcss';
import fs from 'fs/promises';
import path from 'path';

export declare class CSSGenerator {
  constructor(tailwindConfigPath: string, logger: Logger);

  addClasses(classes: string[]): void;
  addStyles(styles: string[]): void;
  clear(): void;

  async generate(outputPath: string): Promise<void>;
}

/**
 * @typedef {Object} Logger
 */
interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  success(msg: string): void;
}