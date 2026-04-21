import { execFile, spawn } from "node:child_process";
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

const PS_ARGS = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command"];

// Runs powershell.exe, pipes stdout/stderr to the parent process in real time
// AND captures them for the return value. Used for long-running commands
// (create, publish, test) so the user sees BcContainerHelper's progress lines
// as they arrive instead of waiting for the whole process to exit.
//
// Uses an AbortController for timeout (rather than spawn's built-in `timeout`
// option) so we can distinguish timeout from clean exit and surface it as a
// rejected promise instead of a silent exitCode-0 result.
//
// Uses `pipe()` to the parent streams so Node's built-in backpressure
// (pause/resume on the source stream) prevents unbounded memory buffering
// when the parent's stdout is slow or redirected into a file.
function spawnStreaming(wrappedScript: string, timeoutMs: number): Promise<ExecResult> {
  return new Promise((resolvePromise, reject) => {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const child = spawn(PS_EXE, [...PS_ARGS, wrappedScript], { signal: controller.signal });
    let stdout = "";
    let stderr = "";

    child.stdout.pipe(process.stdout, { end: false });
    child.stderr.pipe(process.stderr, { end: false });
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on("error", (err) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`PowerShell timed out after ${timeoutMs}ms`));
        return;
      }
      // Surface captured output even on spawn error so diagnostic context isn't lost.
      if (stdout.trim() || stderr.trim()) {
        resolvePromise({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 1 });
        return;
      }
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`PowerShell timed out after ${timeoutMs}ms`));
        return;
      }
      resolvePromise({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? 1,
      });
    });
  });
}

function execBuffered(wrappedScript: string, timeoutMs: number): Promise<ExecResult> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      PS_EXE,
      [...PS_ARGS, wrappedScript],
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error && !stdout) {
          reject(new Error(stderr || error.message));
          return;
        }
        resolvePromise({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: error ? 1 : 0,
        });
      }
    );
  });
}

export function runPowerShell(
  script: string,
  timeoutMs = 600_000,
  stream = false
): Promise<ExecResult> {
  // PS single-quoted strings do not require backslash escaping, so the module
  // path goes in verbatim. The only metachar in a single-quoted PS string is
  // the single quote itself, which psEscape would handle if BCD_MODULE_PATH
  // ever contained one.
  const wrappedScript = `
    $ErrorActionPreference = 'Stop'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    # Probe Microsoft.PowerShell.Security autoloader once, in a controlled place,
    # BEFORE BcContainerHelper's permission self-check calls Get-Acl. Works around
    # a flaky PS 5.1 command-autoloader on Windows 11 25H2 (build 26200+).
    #
    # Wrapped in a child scope (&{}) with locally-relaxed ErrorActionPreference
    # because Import-Module internally calls Update-TypeData, which inherits the
    # OUTER Stop preference — per-call -ErrorAction alone doesn't stop Update-
    # TypeData's 'member already present' warnings from becoming terminating.
    # Two-phase: probe first; if autoloader works, skip the explicit import (no
    # type-data noise); else force Import-Module. try/catch on the outside is
    # belt-and-suspenders for any terminating error that still escapes.
    try {
      & {
        $ErrorActionPreference = 'SilentlyContinue'
        $probeErr = $null
        Get-Acl -Path $env:USERPROFILE -ErrorVariable probeErr | Out-Null
        if ($probeErr -and $probeErr[0].FullyQualifiedErrorId -match 'CouldNotAutoloadMatchingModule') {
          Import-Module Microsoft.PowerShell.Security
        }
      } *>$null
    } catch { }
    Import-Module '${psEscape(getModulePath())}' -DisableNameChecking -Force
    ${script}
  `;
  return stream ? spawnStreaming(wrappedScript, timeoutMs) : execBuffered(wrappedScript, timeoutMs);
}

export function runRawPowerShell(
  script: string,
  timeoutMs = 600_000,
  stream = false
): Promise<ExecResult> {
  // Probe-first strategy (see runPowerShell for full rationale). Same pattern:
  // child scope with local SilentlyContinue, outer try/catch for defense.
  const wrappedScript = `
    try {
      & {
        $ErrorActionPreference = 'SilentlyContinue'
        $probeErr = $null
        Get-Acl -Path $env:USERPROFILE -ErrorVariable probeErr | Out-Null
        if ($probeErr -and $probeErr[0].FullyQualifiedErrorId -match 'CouldNotAutoloadMatchingModule') {
          Import-Module Microsoft.PowerShell.Security
        }
      } *>$null
    } catch { }
    ${script}
  `;
  return stream ? spawnStreaming(wrappedScript, timeoutMs) : execBuffered(wrappedScript, timeoutMs);
}
