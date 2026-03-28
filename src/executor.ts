import { execFile } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Resolves path to BCDocker.psm1 (exported for tests). */
export function resolveModulePath(): string {
  // 1. Environment variable override
  if (process.env.BCD_MODULE_PATH) return process.env.BCD_MODULE_PATH;

  // 2. Bundled inside npm package (dist/../ps/BCDocker.psm1)
  const bundled = resolve(__dirname, "../ps/BCDocker.psm1");
  if (existsSync(bundled)) return bundled;

  // 3. Development layout (dist/../../BCDocker/BCDocker.psm1)
  const dev = resolve(__dirname, "../../BCDocker/BCDocker.psm1");
  if (existsSync(dev)) return dev;

  throw new Error(
    "BCDocker.psm1 not found. Set BCD_MODULE_PATH or ensure the ps/ folder exists."
  );
}

let cachedModulePath: string | null = null;

function getModulePath(): string {
  if (!cachedModulePath) {
    cachedModulePath = resolveModulePath();
  }
  return cachedModulePath;
}

/** Clears cached module path (tests only). */
export function __resetModulePathCacheForTests(): void {
  cachedModulePath = null;
}

/** Escapes single quotes for safe interpolation into PowerShell single-quoted strings. */
export function psEscape(value: string): string {
  return value.replace(/'/g, "''");
}

// BC management cmdlets require Windows PowerShell 5.1, not pwsh 7.x
const PS_EXE = "powershell.exe";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function runPowerShell(
  script: string,
  timeoutMs = 600_000
): Promise<ExecResult> {
  const wrappedScript = `
    $ErrorActionPreference = 'Stop'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Import-Module '${getModulePath().replace(/\\/g, "\\\\")}' -DisableNameChecking -Force
    ${script}
  `;

  return new Promise((resolve, reject) => {
    const child = execFile(
      PS_EXE,
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        wrappedScript,
      ],
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error && !stdout) {
          reject(new Error(stderr || error.message));
          return;
        }
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: error ? 1 : 0,
        });
      }
    );
  });
}

export function runRawPowerShell(
  script: string,
  timeoutMs = 600_000
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile(
      PS_EXE,
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ],
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error && !stdout) {
          reject(new Error(stderr || error.message));
          return;
        }
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: error ? 1 : 0,
        });
      }
    );
  });
}
