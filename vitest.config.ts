import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const sharedResolve = {
  alias: [
    {
      find: "@",
      replacement: fileURLToPath(new URL("./src", import.meta.url)),
    },
  ],
};

const unitAliases = [
  ...sharedResolve.alias,
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
];

export default defineConfig({
  resolve: sharedResolve,
  test: {
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
    projects: [
      {
        extends: true,
        resolve: { alias: unitAliases },
        test: {
          name: "unit",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["src/**/*.integration.test.ts"],
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
          fileParallelism: false,
          globals: true,
          isolate: false,
          maxWorkers: 1,
          pool: "forks",
          testTimeout: 15_000,
        },
      },
      {
        extends: true,
        resolve: {
          alias: [
            {
              find: /^@\/db$/,
              replacement: fileURLToPath(
                new URL("./src/test/integration-db-client.ts", import.meta.url),
              ),
            },
            ...sharedResolve.alias,
          ],
        },
        test: {
          name: "integration",
          include: ["src/**/*.integration.test.ts"],
          environment: "node",
          setupFiles: ["./src/test/integration-setup.ts"],
          fileParallelism: false,
          globals: true,
          maxWorkers: 1,
          pool: "forks",
          testTimeout: 30_000,
        },
      },
    ],
  },
});
