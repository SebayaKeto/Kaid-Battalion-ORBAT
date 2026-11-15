import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `npm run build` writes the site into PocketBase's public folder, so
// PocketBase serves the site and the API from one address (port 8090).
export default defineConfig({
  plugins: [react()],
  build: { outDir: process.env.OUT_DIR || "../pocketbase/pb_public", emptyOutDir: true },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:8090", "/_": "http://127.0.0.1:8090" },
  },
});
