import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: {
    emptyOutDir: false,
    outDir: "dist",
    lib: {
      entry: resolve(__dirname, "src/content/content.ts"),
      fileName: () => "assets/content.js",
      formats: ["iife"],
      name: "RGHS1ApplyAssistantContent"
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  }
});
