#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "./cli.js";

const isMainModule =
  process.argv[1] &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isMainModule) {
  runCli(process.argv).catch((err: Error) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}
