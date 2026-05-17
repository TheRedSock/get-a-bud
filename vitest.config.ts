import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@",
        replacement: fileURLToPath(new URL("./src", import.meta.url)),
      },
      {
        find: "next/navigation",
        replacement: fileURLToPath(
          new URL("./src/test/mocks/next-navigation.ts", import.meta.url),
        ),
      },
      {
        find: "next-auth/react",
        replacement: fileURLToPath(
          new URL("./src/test/mocks/next-auth-react.ts", import.meta.url),
        ),
      },
      {
        find: "sonner",
        replacement: fileURLToPath(
          new URL("./src/test/mocks/sonner.ts", import.meta.url),
        ),
      },
    ],
  },
  test: {
    environment: "jsdom",
    fileParallelism: false,
    globals: true,
    isolate: false,
    maxWorkers: 1,
    pool: "forks",
    setupFiles: ["./src/test/setup.ts"],
    testTimeout: 15_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      exclude: [
        ".next/**",
        "src/test/**",
        "**/*.config.*",
        "next-env.d.ts",
      ],
    },
  },
});
