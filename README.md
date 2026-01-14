# vite-plugin-astro-prerender

A Vite plugin for Astro that prerenders components to static HTML and generates optimized CSS. Perfect for lazy-loading below-the-fold content to improve initial page load times.

> [!WARNING]
> **Alpha Release**: This plugin is currently in alpha. APIs are subject to change and features may be unstable. Please report any issues on GitHub.


## Features

- 🚀 **Prerender Astro components** to static HTML at build time
- 🎨 **Generate optimized CSS** with Tailwind tree-shaking (only used classes)
- 📦 **Two rendering modes**: Parser-based (simple) and Container API (full features)
- 🔄 **Hot reload support** in dev mode with file watching
- 💾 **Smart caching** to skip unchanged components
- 🎯 **Component styles externalization** - extracts and includes `<style>` tags
- 🧹 **Clean HTML output** - removes scripts, dev attributes, and inline styles
- 📱 **Client-side LazyLoader** - fetch and inject HTML when needed

## Installation

```bash
npm install vite-plugin-astro-prerender
# or
pnpm add vite-plugin-astro-prerender
```

### Peer Dependencies

```bash
npm install @astrojs/compiler astro
# Optional for Tailwind CSS support:
npm install tailwindcss postcss autoprefixer
```

## Usage

### As Astro Integration (Recommended)

```javascript
// astro.config.mjs
import { defineConfig } from 'astro/config';
import { astroPrerenderIntegration } from 'vite-plugin-astro-prerender';

export default defineConfig({
  integrations: [
    astroPrerenderIntegration({
      componentsDir: 'src/components/Lazy',
      outputDir: 'public/prerendered',
      generateTailwindCSS: true,
      renderer: 'parser',
    }),
  ],
});
```

### As Vite Plugin

```javascript
// astro.config.mjs
import { defineConfig } from 'astro/config';
import { astroPrerenderPlugin } from 'vite-plugin-astro-prerender';

export default defineConfig({
  vite: {
    plugins: [
      astroPrerenderPlugin({
        componentsDir: 'src/components/Lazy',
        outputDir: 'public/prerendered',
      }),
    ],
  },
});
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `componentsDir` | `string` | `'src/components/Lazy'` | Directory containing components to prerender |
| `outputDir` | `string` | `'public/prerendered'` | Output directory for prerendered files |
| `generateTailwindCSS` | `boolean` | `true` | Generate Tailwind CSS file with tree-shaking |
| `tailwindConfigPath` | `string` | `'tailwind.config.mjs'` | Path to Tailwind config file |
| `renderer` | `'parser' \| 'container'` | `'parser'` | Rendering strategy to use |
| `minify` | `boolean` | `true` | Minify HTML output to reduce file size |


## Rendering Modes

### Parser Renderer (Default)

Uses `@astrojs/compiler` to parse and render components via AST.

**Best for:** Simple, self-contained components without imports

```javascript
astroPrerenderIntegration({ renderer: 'parser' })
```

| Pros | Cons |
|------|------|
| ✅ Simpler and faster | ❌ Doesn't resolve component imports |
| ✅ No Vite dependency | ❌ Limited to basic Astro features |
| ✅ Works for self-contained components | |

### Container Renderer

Uses Astro's Container API with Vite SSR module loading.

**Best for:** Components with imports and complex logic

```javascript
astroPrerenderIntegration({ renderer: 'container' })
```

| Pros | Cons |
|------|------|
| ✅ Full Astro feature support | ❌ Requires Vite server in dev mode |
| ✅ Resolves component imports | ❌ Slightly slower |
| ✅ Handles complex component trees | |

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

## Client-Side Lazy Loading

Use the `LazyHTMLLoader` to load prerendered components at runtime:

### Basic Usage

```typescript
import { createLazyLoader } from 'vite-plugin-astro-prerender';

// Create a loader instance
const loader = createLazyLoader({
  baseUrl: '/prerendered',
  debug: true,
});

// Load HTML manually
const html = await loader.load('LazyFooter');
document.getElementById('footer')!.innerHTML = html;
```

### Viewport-Based Loading (IntersectionObserver)

```typescript
import { lazyLoader } from 'vite-plugin-astro-prerender';

// Automatically load when element enters viewport
lazyLoader.observeAndLoad('LazyFooter', '#footer-container');
```

### Advanced Configuration

```typescript
import { createLazyLoader } from 'vite-plugin-astro-prerender';

const loader = createLazyLoader({
  baseUrl: '/prerendered',
  cacheHTML: true,
  enableRetry: true,
  maxRetries: 3,
  retryDelay: 1000,
  debug: false,
  
  // Callbacks
  onLoad: (name, duration) => {
    console.log(`Loaded ${name} in ${duration}ms`);
  },
  onError: (name, error) => {
    console.error(`Failed to load ${name}:`, error);
  },
  onCSSLoad: (file, duration) => {
    console.log(`CSS loaded: ${file}`);
  },
});

// Preload multiple components
await loader.preloadBatch(['LazyHeader', 'LazyFooter', 'LazySidebar']);

// Get statistics
console.log(loader.getStats());
// { totalLoads: 3, cacheHits: 0, cacheMisses: 3, errors: 0, averageLoadTime: 45.2 }
```

### LazyLoader API

| Method | Description |
|--------|-------------|
| `load(name)` | Load a component's HTML (returns Promise<string>) |
| `inject(name, selector)` | Load and inject into a DOM element |
| `observeAndLoad(name, selector, options?)` | Load when element enters viewport |
| `preload(name)` | Preload without injecting |
| `preloadBatch(names)` | Preload multiple components |
| `getStats()` | Get load statistics |
| `clearCache()` | Clear HTML cache |
| `clearCSSCache()` | Clear CSS cache |
| `disconnectAll()` | Disconnect all observers |
| `reset()` | Reset all state |

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
3. **Rendering**: Uses selected renderer to generate HTML
4. **Style Extraction**: Extracts `<style>` tags from components
5. **Class Extraction**: Finds all Tailwind classes in rendered HTML
6. **CSS Generation**: Creates optimized CSS with only used classes
7. **HTML Cleaning**: Removes scripts, dev attributes, and inline styles
8. **Output**: Writes clean HTML and CSS to `outputDir`

## Development

The plugin includes hot reload support. Changes to components in `componentsDir` trigger automatic reprocessing.

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import type {
  PluginOptions,
  LazyLoaderConfig,
  LoadStats,
  CSSModuleManifest,
  Logger,
} from 'vite-plugin-astro-prerender';
```

## Limitations

While powerful, this plugin has some limitations to keep in mind:

- **JavaScript Expressions (Parser Renderer)**: The `parser` renderer does not evaluate JavaScript expressions like `{items.map(...)}` or `{variable}` (except simple frontmatter string variables). If you use dynamic expressions, they will render as `[object Object]`. Use static HTML in your lazy components, or ensure the `container` renderer is working properly.
- **Client Interaction**: Components are prerendered as static HTML. While you can include scripts, complex Astro client-side state (like `base` or shared Nanostores) might require careful manual setup in the target page.
- **Component Imports**: The default `parser` renderer cannot resolve component imports (e.g., `<Button />`). Use the `container` renderer for components with nested dependencies.
- **Vite Dependency**: The `container` renderer requires a running Vite dev server to perform SSR module loading.
- **Relative Assets**: Assets like local images or fonts within lazy components should use absolute paths or be placed in the `public/` directory for reliable loading.
- **Hydration**: This plugin does not perform full "selective hydration" of interactive React/Vue/Svelte components within the lazy-loaded fragment. It is best for static-majority content.

## Contributing

Contributions are welcome! If you're interested in helping improve the plugin, please check out our [Contributing Guidelines](CONTRIBUTING.md) for a detailed breakdown of the codebase and instructions on how to get started.

## License

MIT