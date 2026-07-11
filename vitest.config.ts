import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.{test,spec}.{js,ts,tsx}"],
    globals: false,
    environment: "jsdom",
    coverage: {
      // opt-in via 'npm run test:coverage' (vitest --coverage)
      provider: "v8",
      reporter: ["text", "lcov"],
    },
  },
  resolve: {
    extensions: [".ts", ".js", ".json"],
  },
});
