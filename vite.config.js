import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cpSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
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
  plugins: [react(), tailwindcss(), copyRuntimeAssets()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
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
