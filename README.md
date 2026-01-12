# Astro Prerender Plugin
 
A Vite plugin for Astro that prerenders components to static HTML and generates optimized CSS. Perfect for lazy-loading below-the-fold content to improve initial page load times.
 
## Features
 
- 🚀 **Prerender Astro components** to static HTML at build time
- 🎨 **Generate optimized CSS** with Tailwind tree-shaking (only used classes)
- 📦 **Two rendering modes**: Parser-based (simple) and Container API (full features)
- 🔄 **Hot reload support** in dev mode with file watching
- 💾 **Smart caching** to skip unchanged components
- 🎯 **Component styles externalization** - extracts and includes `<style>` tags
- 🧹 **Clean HTML output** - removes scripts, dev attributes, and inline styles
 
## Installation
 
```bash
npm install @astrojs/compiler postcss tailwindcss autoprefixer
```
 
## Usage
 
### Basic Setup
 
Add the plugin to your `astro.config.mjs`:
 
```javascript
import { defineConfig } from 'astro/config';
import { astroPrerenderPlugin } from './plugins/astro-prerender/index.mjs';
 
export default defineConfig({
  vite: {
    plugins: [
      astroPrerenderPlugin({
        componentsDir: 'src/components/Lazy',
        outputDir: 'public/prerendered',
        generateTailwindCSS: true,
        tailwindConfigPath: 'tailwind.config.mjs',
        renderer: 'parser', // or 'container'
      }),
    ],
  },
});
```
 
### Configuration Options
 
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `componentsDir` | `string` | `'src/components/Lazy'` | Directory containing components to prerender |
| `outputDir` | `string` | `'public/prerendered'` | Output directory for prerendered files |
| `generateTailwindCSS` | `boolean` | `true` | Generate Tailwind CSS file with tree-shaking |
| `tailwindConfigPath` | `string` | `'tailwind.config.mjs'` | Path to Tailwind config file |
| `renderer` | `'parser' \| 'container'` | `'parser'` | Rendering strategy to use |
 
## Rendering Modes
 
### Parser Renderer (Default)
 
Uses `@astrojs/compiler` to parse and render components via AST.
 
**Pros:**
- ✅ Simpler and faster
- ✅ No Vite dependency
- ✅ Works for self-contained components
 
**Cons:**
- ❌ Doesn't resolve component imports (e.g., `<Footer />`)
- ❌ Limited to basic Astro features
 
**Best for:** Simple components without imports
 
```javascript
astroPrerenderPlugin({
  renderer: 'parser',
})
```
 
### Container Renderer
 
Uses Astro's Container API with Vite SSR module loading.
 
**Pros:**
- ✅ Full Astro feature support
- ✅ Resolves component imports
- ✅ Handles complex component trees
 
**Cons:**
- ❌ Requires Vite server in dev mode
- ❌ Slightly slower
 
**Best for:** Components with imports and complex logic
 
```javascript
astroPrerenderPlugin({
  renderer: 'container',
})
```
 
## Example Component
 
Create a component in `src/components/Lazy/LazyFooter.astro`:
 
```astro
---
const year = '2024';
const company = 'ACME Inc';
---
 
<footer class="bg-gray-800 text-white p-6">
  <div class="container mx-auto">
    <p class="text-center">© {year} {company}. All rights reserved.</p>
  </div>
</footer>
 
<style>
footer {
  margin-top: 2rem;
}
</style>
```
 
## Lazy Loading at Runtime
 
Use the LazyHTMLLoader utility to load prerendered components:
 
```typescript
import { lazyLoader } from '@/utils/lazyLoader';
 
// Load and inject a component
const html = await lazyLoader.load('LazyFooter');
document.getElementById('footer-container').innerHTML = html;
 
// Or use IntersectionObserver for viewport-based loading
lazyLoader.observeAndLoad('footer-container', 'LazyFooter');
```
 
The CSS is automatically loaded on first component load.
 
## Output Structure
 
```
public/prerendered/
├── LazyFooter.html          # Clean HTML output
├── LazyHeader.html
└── lazy-components.css      # Tree-shaken Tailwind + component styles
```
 
Astro automatically copies `public/` to your output directory during build.
 
## How It Works
 
1. **Discovery**: Finds all `.astro` files in `componentsDir`
2. **Caching**: Checks MD5 hash to skip unchanged components
3. **Rendering**: Uses selected renderer (parser or container) to generate HTML
4. **Style Extraction**: Extracts `<style>` tags from components
5. **Class Extraction**: Finds all Tailwind classes in rendered HTML
6. **CSS Generation**: Creates optimized CSS with only used classes + component styles
7. **HTML Cleaning**: Removes scripts, dev attributes, and inline styles
8. **Output**: Writes clean HTML and CSS to `outputDir`
 
## Development
 
The plugin includes hot reload support. Changes to components in `componentsDir` trigger automatic reprocessing.
 
## Publishing
 
To publish as an npm package:
 
1. Add `package.json`:
```json
{
  "name": "astro-prerender-plugin",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": "./index.mjs"
  },
  "peerDependencies": {
    "astro": "^5.0.0",
    "@astrojs/compiler": "^2.0.0",
    "postcss": "^8.0.0",
    "tailwindcss": "^3.0.0"
  }
}
```
 
2. Publish:
```bash
npm publish
```
 
## License
 
MIT