import { defineConfig } from "tsup";

export default defineConfig([
    {
        entry: ["src/index.ts"],
        format: "esm",
        dts: true,
        sourcemap: true,
        platform: "node",
        clean: true,
        minify: true,
        target: "es2018"
    }
])
