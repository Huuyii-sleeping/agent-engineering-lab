import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const bffTarget = process.env.VITE_BFF_URL || "http://127.0.0.1:3182";

export default defineConfig({
  resolve: {
    alias: {
      "@orbit/workflow-core": fileURLToPath(
        new URL("../../packages/workflow-core/src/index.ts", import.meta.url),
      ),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: bffTarget,
        changeOrigin: true,
      },
    },
  },
  plugins: [tailwindcss(), react()],
});
