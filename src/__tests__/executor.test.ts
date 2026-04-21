import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as cp from "node:child_process";
import {
  __resetModulePathCacheForTests,
  resolveModulePath,
  runPowerShell,
  runRawPowerShell,
  psEscape,
} from "../executor.js";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

const existsSync = vi.mocked(fs.existsSync);
const execFile = vi.mocked(cp.execFile);

describe("resolveModulePath", () => {
  const origEnv = process.env.BCD_MODULE_PATH;

  afterEach(() => {
    __resetModulePathCacheForTests();
    if (origEnv === undefined) {
      delete process.env.BCD_MODULE_PATH;
    } else {
      process.env.BCD_MODULE_PATH = origEnv;
    }
  });

  it("returns BCD_MODULE_PATH when set", () => {
    process.env.BCD_MODULE_PATH = "C:\\mod\\BCDocker.psm1";
    expect(resolveModulePath()).toBe("C:\\mod\\BCDocker.psm1");
  });

  it("throws when no path exists", () => {
    existsSync.mockReturnValue(false);
    expect(() => resolveModulePath()).toThrow(/BCDocker\.psm1 not found/);
  });

  it("returns bundled path when ../ps/BCDocker.psm1 exists", () => {
    existsSync.mockImplementation((p: fs.PathLike) =>
      String(p).replace(/\\/g, "/").includes("/ps/BCDocker.psm1")
    );
    const path = resolveModulePath();
    expect(path).toMatch(/BCDocker\.psm1$/);
    expect(path).toContain("ps");
  });

  it("returns dev path when bundled missing but ../../BCDocker exists", () => {
    existsSync.mockImplementation((p: fs.PathLike) => {
      const s = String(p).replace(/\\/g, "/");
      return s.includes("BCDocker/BCDocker.psm1") && !s.includes("/ps/");
    });
    const path = resolveModulePath();
    expect(path).toMatch(/BCDocker\.psm1$/);
    expect(path).toContain("BCDocker");
  });
});

describe("runPowerShell / runRawPowerShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsSync.mockImplementation((p: fs.PathLike) => String(p).includes("psm1"));
    execFile.mockImplementation((_cmd, _args, _opts, cb) => {
      cb?.(null, "out\n", "");
      return {} as cp.ChildProcess;
    });
  });

  it("runPowerShell wraps script with Import-Module and returns stdout", async () => {
    const r = await runPowerShell("Write-Output 1");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("out");
    expect(execFile).toHaveBeenCalled();
    const [, args] = execFile.mock.calls[0];
    expect(args?.join(" ")).toContain("Import-Module");
    expect(args?.join(" ")).toContain("Write-Output 1");
  });

  it("runRawPowerShell passes script without BCDocker module wrapper", async () => {
    await runRawPowerShell("Get-Date");
    const [, args] = execFile.mock.calls[0];
    const joined = args?.join(" ") ?? "";
    expect(joined).toContain("Get-Date");
    expect(joined).not.toContain("BCDocker.psm1");
  });

  it("rejects when error and no stdout (runPowerShell)", async () => {
    execFile.mockImplementation((_c, _a, _o, cb) => {
      cb?.(new Error("fail"), "", "err");
      return {} as cp.ChildProcess;
    });
    await expect(runPowerShell("x")).rejects.toThrow();
  });

  it("rejects when error and no stdout (runRawPowerShell)", async () => {
    execFile.mockImplementation((_c, _a, _o, cb) => {
      cb?.(new Error("fail"), "", "stderr-msg");
      return {} as cp.ChildProcess;
    });
    await expect(runRawPowerShell("x")).rejects.toThrow("stderr-msg");
  });

  it("rejects using error.message when stderr empty (runPowerShell)", async () => {
    execFile.mockImplementation((_c, _a, _o, cb) => {
      cb?.(new Error("e-msg"), "", "");
      return {} as cp.ChildProcess;
    });
    await expect(runPowerShell("x")).rejects.toThrow("e-msg");
  });

  it("rejects using error.message when stderr empty (runRawPowerShell)", async () => {
    execFile.mockImplementation((_c, _a, _o, cb) => {
      cb?.(new Error("raw-err"), "", "");
      return {} as cp.ChildProcess;
    });
    await expect(runRawPowerShell("x")).rejects.toThrow("raw-err");
  });

  it("resolves with exitCode 1 when error but stdout present", async () => {
    execFile.mockImplementation((_c, _a, _o, cb) => {
      const err = new Error("fail") as NodeJS.ErrnoException;
      err.code = "ERR";
      cb?.(err, "partial", "");
      return {} as cp.ChildProcess;
    });
    const r = await runPowerShell("x");
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toBe("partial");
  });

  it("runRawPowerShell resolves with exitCode 1 when error but stdout present", async () => {
    execFile.mockImplementation((_c, _a, _o, cb) => {
      const err = new Error("fail") as NodeJS.ErrnoException;
      err.code = "ERR";
      cb?.(err, "raw-partial", "");
      return {} as cp.ChildProcess;
    });
    const r = await runRawPowerShell("x");
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toBe("raw-partial");
  });
});

describe("psEscape", () => {
  it("doubles single quotes", () => {
    expect(psEscape("it's")).toBe("it''s");
  });

  it("handles multiple quotes", () => {
    expect(psEscape("a'b'c")).toBe("a''b''c");
  });

  it("leaves clean strings unchanged", () => {
    expect(psEscape("bcsandbox")).toBe("bcsandbox");
  });

  it("handles empty string", () => {
    expect(psEscape("")).toBe("");
  });
});
