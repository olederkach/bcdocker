import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Single-source version from package.json so publishing only requires bumping one line.
// Runs once at module load; ES module caching prevents repeat I/O.
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf-8")) as {
  version: string;
};

export const VERSION: string = pkg.version;
