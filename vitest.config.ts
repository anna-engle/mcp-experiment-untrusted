import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.ts", "tests/**/*test.ts"],
    root: import.meta.dirname,
  },
});
