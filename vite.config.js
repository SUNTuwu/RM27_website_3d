import { defineConfig } from "vite";
import { cpSync } from "node:fs";
import { resolve } from "node:path";

function copyRuntimeAssets() {
  let config;

  return {
    name: "copy-runtime-assets",
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    writeBundle() {
      const source = resolve(config.root, "assets");
      const destination = resolve(config.root, config.build.outDir, "assets");
      cpSync(source, destination, { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [copyRuntimeAssets()],
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    allowedHosts: [".trycloudflare.com"],
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
