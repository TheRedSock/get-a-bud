#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseEnvFile(path) {
  const contents = readFileSync(path, "utf8");
  const env = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value.replaceAll("\\n", "\n");
  }

  return env;
}

const separatorIndex = process.argv.indexOf("--");
const envFileArg = process.argv[2];

if (!envFileArg || separatorIndex === -1 || separatorIndex === process.argv.length - 1) {
  console.error(
    "Usage: node scripts/with-env-file.mjs <env-file> -- <command> [...args]",
  );
  process.exit(1);
}

const envPath = resolve(process.cwd(), envFileArg);

if (!existsSync(envPath)) {
  console.error(`Environment file not found: ${envFileArg}`);
  process.exit(1);
}

const [command, ...commandArgs] = process.argv.slice(separatorIndex + 1);
const loadedEnv = parseEnvFile(envPath);
const child = spawn(command, commandArgs, {
  cwd: process.cwd(),
  env: {
    ...process.env,
    ...loadedEnv,
  },
  shell: process.platform === "win32",
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
