import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  // NOTE: jsdom@29 is broken under the installed Node (ESM require of @exodus/bytes).
  // All our unit tests are pure logic (no React rendering); UI is verified via dev-server/Playwright.
  test: { environment: "node", setupFiles: ["./vitest.setup.ts"], globals: true, passWithNoTests: true },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
