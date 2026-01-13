// src/utils/css-generator.ts
import { pathToFileURL } from 'node:url';
import { writeFileWithDir } from './index';
import type { Logger } from './logger';
import type { AcceptedPlugin } from 'postcss';

/**
 * Generates CSS from Tailwind classes and component styles
 * Tree-shakes Tailwind to only include used classes
 */
export class CSSGenerator {
  private tailwindConfigPath: string;
  private logger: Logger;
  private classes: Set<string>;
  private componentStyles: string[];
  private generateTailwind: boolean;

  constructor(tailwindConfigPath: string, logger: Logger, generateTailwind: boolean = true) {
    this.tailwindConfigPath = tailwindConfigPath;
    this.logger = logger;
    this.classes = new Set();
    this.componentStyles = [];
    this.generateTailwind = generateTailwind;
  }

  /**
   * Add Tailwind classes to generate CSS for
   */
  addClasses(classes: string[]): void {
    classes.forEach((cls) => this.classes.add(cls));
  }

  /**
   * Add component styles to include in CSS
   */
  addStyles(styles: string[]): void {
    this.componentStyles.push(...styles);
  }

  /**
   * Clear all classes and styles
   */
  clear(): void {
    this.classes.clear();
    this.componentStyles = [];
  }

  /**
   * Generate CSS file with Tailwind and component styles
   */
  async generate(outputPath: string): Promise<void> {
    const classArray = Array.from(this.classes);

    this.logger.info(
      `CSS Generator state: ${classArray.length} classes, ${this.componentStyles.length} component styles`,
    );

    if (classArray.length === 0 && this.componentStyles.length === 0) {
      this.logger.warn('No classes or styles to generate CSS for');
      return;
    }

    this.logger.info(
      `Generating CSS for ${classArray.length} classes and ${this.componentStyles.length} component styles...`,
    );

    try {
      // If Tailwind is disabled and we only have component styles, just write them directly
      if (!this.generateTailwind && this.componentStyles.length > 0) {
        const cssContent = '/* Component Styles */\n' + this.componentStyles.join('\n\n');
        await writeFileWithDir(outputPath, cssContent);
        this.logger.success(`CSS generated (component styles only): ${outputPath}`);
        return;
      }

      // If Tailwind is disabled but we have classes, warn the user
      if (!this.generateTailwind && classArray.length > 0) {
        this.logger.warn(
          `Found ${classArray.length} Tailwind classes but generateTailwindCSS is disabled. Enable it to include Tailwind styles.`,
        );
        // Still output component styles if we have them
        if (this.componentStyles.length > 0) {
          const cssContent = '/* Component Styles */\n' + this.componentStyles.join('\n\n');
          await writeFileWithDir(outputPath, cssContent);
          this.logger.success(`CSS generated (component styles only): ${outputPath}`);
        }
        return;
      }

      // Full Tailwind + component styles processing
      // Dynamically import dependencies (they're optional peer deps)
      const [postcssModule, tailwindModule, autoprefixerModule] = await Promise.all([
        import('postcss'),
        import('tailwindcss'),
        import('autoprefixer'),
      ]);

      const postcss = postcssModule.default;
      const tailwindcss = tailwindModule.default;
      const autoprefixer = autoprefixerModule.default;

      // Load the Tailwind config
      const configUrl = pathToFileURL(this.tailwindConfigPath).href;
      const configModule = await import(configUrl);
      const tailwindConfig = configModule.default;

      // Override the content to only process the extracted classes
      const modifiedConfig = {
        ...tailwindConfig,
        content: [
          {
            raw: classArray
              .map((cls) => `<div class="${cls}"></div>`)
              .join('\n'),
          },
        ],
        safelist: classArray,
      };

      // Create CSS content with Tailwind directives
      let cssContent = `
@tailwind base;
@tailwind components;
@tailwind utilities;
`;

      // Add component styles if any
      if (this.componentStyles.length > 0) {
        cssContent += '\n/* Component Styles */\n';
        cssContent += this.componentStyles.join('\n\n');
      }

      // Process with PostCSS
      const result = await postcss([
        tailwindcss(modifiedConfig) as AcceptedPlugin,
        autoprefixer as AcceptedPlugin,
      ]).process(cssContent, {
        from: undefined,
      });

      // Write the generated CSS
      await writeFileWithDir(outputPath, result.css);

      this.logger.success(`CSS generated: ${outputPath}`);
    } catch (error) {
      this.logger.error(`Failed to generate CSS: ${error}`);
      throw error;
    }
  }
}