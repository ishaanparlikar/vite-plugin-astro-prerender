import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { pathToFileURL } from 'node:url';
 
/**
 * Generates CSS from Tailwind classes and component styles
 */
export class CSSGenerator {
  private tailwindConfigPath: string;
  private logger: any;
  private classes: Set<string>;
  private componentStyles: string[];

  constructor(tailwindConfigPath: string, logger: any) {
    this.tailwindConfigPath = tailwindConfigPath;
    this.logger = logger;
    this.classes = new Set();
    this.componentStyles = [];
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
 
    if (classArray.length === 0 && this.componentStyles.length === 0) {
      this.logger.warn('No classes or styles to generate CSS for');
      return;
    }
 
    this.logger.info(
      `🎨 Generating CSS for ${classArray.length} classes and ${this.componentStyles.length} component styles...`,
    );
 
    try {
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
        tailwindcss(modifiedConfig),
        autoprefixer,
      ]).process(cssContent, {
        from: undefined,
      });
 
      // Write the generated CSS
      const { writeFileWithDir } = await import('./index');
      await writeFileWithDir(outputPath, result.css);
 
      this.logger.success(`✅ CSS generated: ${outputPath}`);
    } catch (error) {
      this.logger.error(`Failed to generate CSS: ${error}`);
      throw error;
    }
  }
}