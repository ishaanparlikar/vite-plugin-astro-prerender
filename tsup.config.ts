import { defineConfig } from "tsup";

export default defineConfig([
    {
        entry: ["src/index.ts"],
        format: "esm",
        dts: true,
        sourcemap: true,
        platform: "node",
        clean: false,
        minify: true,
        target: "es2018"
    },
    {
        entry: ["src/client.ts"],
        format: "esm",
        dts: true,
        sourcemap: true,
        platform: "browser",
        clean: false,
        minify: true,
        target: "es2018"
    }
])
