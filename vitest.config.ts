// Test runner for the page-level tests in tests/ui (jsdom, no network). The pure-rule tests run with node --test.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  envDir: fileURLToPath(new URL("./tests/env", import.meta.url)),
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  oxc: { jsx: { runtime: "automatic" } },
  cacheDir: "/tmp/vitest-cache",
  test: { environment: "jsdom", include: ["tests/ui/**/*.spec.tsx"], restoreMocks: true },
});
