# Contributing to vite-plugin-astro-prerender

Thank you for your interest in contributing to `vite-plugin-astro-prerender`! This document will help you understand the project structure and how to set up your development environment.

## 🚀 Getting Started

1. **Clone the repository**:
   ```bash
   git clone https://github.com/ishaanparlikar/vite-plugin-astro-prerender.git
   cd vite-plugin-astro-prerender
   ```

2. **Install dependencies**:
   This project uses `pnpm`.
   ```bash
   pnpm install
   ```

3. **Build the plugin**:
   ```bash
   pnpm build
   ```

4. **Development mode**:
   To watch for changes and rebuild automatically:
   ```bash
   pnpm dev
   ```

## 📂 Project Structure

The project is structured into a main integration entry, a client-side library, and a set of specialized utilities.

### Source Overview

- **`src/index.ts`**: The main entry point. It exports the `astroPrerenderIntegration` for Astro and the `astroPrerenderPlugin` for Vite. It coordinates the build process, including discovery, prerendering, and CSS generation.
- **`src/client.ts`**: The entry point for the client-side library. It exports the `LazyLoader` instance and the `createLazyLoader` factory function.

### Core Utilities (`src/utils/`)

The power of the plugin lies in these modular utilities:

| File | Responsibility |
|------|----------------|
| **`LazyLoader.ts`** | The "brain" of the plugin. It manages the end-to-end lifecycle of a component: reading the source, calling the appropriate renderer, extracting metadata, and tracking assets during client-side hydration. |
| **`container-renderer.ts`** | Implements the **Container API** strategy. It uses Astro's experimental container to render components with full support for imports and complex logic. It bridges the gap between Astro files and Vite's SSR module loader. |
| **`parser-renderer.ts`** | Implements the **Parser** strategy. It uses `@astrojs/compiler` to parse Astro files into an AST and extract HTML. It's fast and doesn't require a Vite server, but it doesn't resolve component imports. |
| **`css-generator.ts`** | Manages style extraction. It pulls `<style>` tags from rendered components and integrates with Tailwind CSS to perform tree-shaking, ensuring only used classes are included in the final `lazy-components.css`. |
| **`cache.ts`** | Handles build-time caching. It uses MD5 hashing to determine if a component has changed, skipping redundant prerendering steps to keep builds fast. |
| **`logger.ts`** | A unified logging utility based on `consola`, providing consistent and beautiful terminal output for the plugin's activities. |

## 🛠 Development Workflow

### Testing Changes
The best way to test the plugin is to use it in a real Astro project. You can use standard `pnpm` linking or point your project's `package.json` to the local path:

```json
"dependencies": {
  "vite-plugin-astro-prerender": "link:../path-to-plugin"
}
```

### Adding New Features
1. **Renderer Improvements**: If you're adding support for a new Astro feature, look at `container-renderer.ts`.
2. **Client-Side Metrics**: To add more tracking capabilities, modify the `PerformanceObserver` logic in `LazyLoader.ts`.
3. **Optimizations**: Build-time speed improvements usually happen in `cache.ts` or `index.ts`.

## 🤝 Submitting Changes

1. Create a branch for your feature or bugfix.
2. Ensure your code follows the existing style and is well-documented.
3. If you add a new utility, update the project structure table in this document.
4. Submit a Pull Request with a clear description of your changes.

## 📜 License
By contributing, you agree that your contributions will be licensed under its MIT License.
