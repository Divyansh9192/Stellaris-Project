import { resolve } from "node:path";
import { build as esbuildBuild } from "esbuild";
import { defineConfig } from "vitest/config";

export default defineConfig({
  publicDir: "public",
  plugins: [
    {
      name: "bundle-content-scripts",
      async closeBundle() {
        await esbuildBuild({
          entryPoints: [resolve(__dirname, "src/content/index.ts")],
          outfile: resolve(__dirname, "dist/content.js"),
          bundle: true,
          format: "iife",
          target: "chrome116",
          sourcemap: true,
        });
        await esbuildBuild({
          entryPoints: [resolve(__dirname, "src/chatgpt/index.ts")],
          outfile: resolve(__dirname, "dist/chatgpt.js"),
          bundle: true,
          format: "iife",
          target: "chrome116",
          sourcemap: true,
        });
        await esbuildBuild({
          entryPoints: [resolve(__dirname, "src/chatgpt/interceptor-main.ts")],
          outfile: resolve(__dirname, "dist/chatgpt-interceptor.js"),
          bundle: true,
          format: "iife",
          target: "chrome116",
          sourcemap: true,
        });
      },
    },
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        options: resolve(__dirname, "options.html"),
        popup: resolve(__dirname, "popup.html"),
        background: resolve(__dirname, "src/background/index.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name ?? "asset";
          const extension = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
          const baseName = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
          return `assets/${baseName}${extension}`;
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
