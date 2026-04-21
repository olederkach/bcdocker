#!/usr/bin/env node
import { runCli } from "./cli.js";

runCli(process.argv).catch((err: Error) => {
  console.error("Error:", err.message);
  process.exit(1);
});
