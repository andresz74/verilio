import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.{ts,js}"],
    exclude: ["tests/**/*.integration.test.ts"],
  },
});

