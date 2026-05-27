#!/usr/bin/env node

/**
 * Starts the Inngest Dev Server for local development.
 *
 * The app's serve handler skips signature validation when INNGEST_DEV=1
 * is set in .env.local, so the dev server doesn't need any special keys.
 *
 * Uses 127.0.0.1 explicitly to avoid IPv4/IPv6 resolution issues on Windows
 * where "localhost" may resolve to ::1 (IPv6) while Next.js binds to 127.0.0.1.
 */

import { spawn } from "node:child_process";

const child = spawn(
  "npx",
  ["inngest-cli@latest", "dev", "-u", "http://127.0.0.1:3000/api/inngest"],
  {
    cwd: process.cwd(),
    shell: process.platform === "win32",
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
