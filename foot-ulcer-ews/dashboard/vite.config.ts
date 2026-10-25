import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The Vite app lives in dashboard/, but package.json, .env.local (written by
// `npx convex dev`) and config.json sit one level up.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  envDir: fileURLToPath(new URL("..", import.meta.url)),
  plugins: [react()],
});
