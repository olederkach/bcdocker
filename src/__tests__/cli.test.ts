import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runPowerShell, runRawPowerShell } from "../executor.js";
import { createCliProgram, runCli } from "../cli.js";

vi.mock("../executor.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../executor.js")>();
  return {
    ...actual,
    runPowerShell: vi.fn().mockResolvedValue({ stdout: "ok", stderr: "", exitCode: 0 }),
    runRawPowerShell: vi.fn().mockResolvedValue({ stdout: "raw", stderr: "", exitCode: 0 }),
  };
});

const runPs = vi.mocked(runPowerShell);
const runRaw = vi.mocked(runRawPowerShell);

describe("bcd CLI", () => {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
    runPs.mockResolvedValue({ stdout: "ok", stderr: "", exitCode: 0 });
    runRaw.mockResolvedValue({ stdout: "raw", stderr: "", exitCode: 0 });
  });

  afterEach(() => {
    logSpy.mockClear();
    errSpy.mockClear();
  });

  it("runCli delegates to createCliProgram and parseAsync", async () => {
    await runCli(["node", "bcd", "list"]);
    expect(runRaw.mock.calls[0][0]).toContain("Get-BcContainers");
  });

  it("list runs raw PowerShell with Get-BcContainers", async () => {
    const p = createCliProgram();
    await p.parseAsync(["node", "bcd", "list"]);
    expect(runRaw.mock.calls[0][0]).toContain("Get-BcContainers");
  });

  it("info uses Get-BCDockerWebClientUrl", async () => {
    await createCliProgram().parseAsync(["node", "bcd", "info", "bc1"]);
    expect(runPs.mock.calls[0][0]).toContain("Get-BCDockerWebClientUrl");
  });

  it("create passes flags to New-BCDContainer", async () => {
    await createCliProgram().parseAsync([
      "node",
      "bcd",
      "create",
      "-n",
      "mybc",
      "--type",
      "onprem",
      "-v",
      "26.0",
      "--bypass-cdn",
      "-l",
      "C:\\lic.flf",
    ]);
    const script = runPs.mock.calls[0][0];
    expect(script).toContain("New-BCDContainer");
    expect(script).toContain("-Type 'onprem'");
    expect(script).toContain("-BcVersion '26.0'");
    expect(script).toContain("-BypassCDN");
    expect(script).toContain("-LicenseFile 'C:\\lic.flf'");
  });

  it("create omits bypass and license by default", async () => {
    await createCliProgram().parseAsync(["node", "bcd", "create", "-n", "x", "-t", "none"]);
    const script = runPs.mock.calls[0][0];
    expect(script).toContain("New-BCDContainer");
    expect(script).not.toContain("-BypassCDN");
    expect(script).not.toContain("-LicenseFile");
    expect(script).toContain("-IncludeTestToolkit $false");
  });

  it("create logs stderr when present", async () => {
    runPs.mockResolvedValueOnce({ stdout: "out", stderr: "warn", exitCode: 0 });
    await createCliProgram().parseAsync(["node", "bcd", "create"]);
    expect(errSpy).toHaveBeenCalledWith("warn");
    // In streaming mode, stdout is piped directly to process.stdout by the
    // executor, so the CLI action does not re-log it through console.log.
    expect(logSpy).not.toHaveBeenCalledWith("out");
  });

  it("create invokes runPowerShell with stream=true", async () => {
    runPs.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });
    await createCliProgram().parseAsync(["node", "bcd", "create", "-n", "x"]);
    expect(runPs.mock.calls[0][2]).toBe(true);
  });

  it("remove calls Remove-BCDContainer", async () => {
    await createCliProgram().parseAsync(["node", "bcd", "remove", "c1"]);
    expect(runPs.mock.calls[0][0]).toContain("Remove-BCDContainer");
  });

  it("remove prints fallback when stdout empty", async () => {
    runPs.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });
    await createCliProgram().parseAsync(["node", "bcd", "remove", "c1"]);
    expect(logSpy).toHaveBeenCalledWith("Container 'c1' removed.");
  });

  it("start/stop/restart call docker cmdlets", async () => {
    await createCliProgram().parseAsync(["node", "bcd", "start", "c1"]);
    expect(runPs.mock.calls[0][0]).toContain("Start-BCDContainer");
    vi.clearAllMocks();
    runPs.mockResolvedValue({ stdout: "ok", stderr: "", exitCode: 0 });
    await createCliProgram().parseAsync(["node", "bcd", "stop", "c1"]);
    expect(runPs.mock.calls[0][0]).toContain("Stop-BCDContainer");
    vi.clearAllMocks();
    runPs.mockResolvedValue({ stdout: "ok", stderr: "", exitCode: 0 });
    await createCliProgram().parseAsync(["node", "bcd", "restart", "c1"]);
    expect(runPs.mock.calls[0][0]).toContain("Restart-BCDContainer");
  });

  it("start/stop/restart print fallback when stdout empty", async () => {
    runPs.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });
    await createCliProgram().parseAsync(["node", "bcd", "start", "c1"]);
    expect(logSpy).toHaveBeenCalledWith("Container 'c1' started.");
    runPs.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });
    await createCliProgram().parseAsync(["node", "bcd", "stop", "c1"]);
    expect(logSpy).toHaveBeenCalledWith("Container 'c1' stopped.");
    runPs.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });
    await createCliProgram().parseAsync(["node", "bcd", "restart", "c1"]);
    expect(logSpy).toHaveBeenCalledWith("Container 'c1' restarted.");
  });

  it("open uses Open-BCDWebClient", async () => {
    await createCliProgram().parseAsync(["node", "bcd", "open", "c1"]);
    expect(runPs.mock.calls[0][0]).toContain("Open-BCDWebClient");
  });

  it("open prints fallback when stdout empty", async () => {
    runPs.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });
    await createCliProgram().parseAsync(["node", "bcd", "open", "c1"]);
    expect(logSpy).toHaveBeenCalledWith("Opening web client...");
  });

  it("apps lists with optional publisher", async () => {
    await createCliProgram().parseAsync(["node", "bcd", "apps", "c1", "--publisher", "Microsoft"]);
    expect(runRaw.mock.calls[0][0]).toContain("Get-BcContainerAppInfo");
    expect(runRaw.mock.calls[0][0]).toContain("Microsoft");
  });

  it("apps without publisher omits Where-Object", async () => {
    await createCliProgram().parseAsync(["node", "bcd", "apps", "c1"]);
    expect(runRaw.mock.calls[0][0]).toContain("Get-BcContainerAppInfo");
    expect(runRaw.mock.calls[0][0]).not.toContain("Where-Object");
  });

  it("apps prints fallback when stdout empty", async () => {
    runRaw.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });
    await createCliProgram().parseAsync(["node", "bcd", "apps", "c1"]);
    expect(logSpy).toHaveBeenCalledWith("No apps found.");
  });

  it("install passes app path and credentials", async () => {
    await createCliProgram().parseAsync(["node", "bcd", "install", "c1", "C:\\a.app", "-u", "u1", "-p", "p1"]);
    expect(runPs.mock.calls[0][0]).toContain("Install-BCDApp");
    expect(runPs.mock.calls[0][0]).toContain("u1");
  });

  it("install prints fallback when stdout empty", async () => {
    runPs.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });
    await createCliProgram().parseAsync(["node", "bcd", "install", "c1", "C:\\a.app"]);
    expect(logSpy).toHaveBeenCalledWith("App installed.");
  });

  it("uninstall passes three positionals", async () => {
    await createCliProgram().parseAsync(["node", "bcd", "uninstall", "c1", "AppX", "PubY"]);
    expect(runRaw.mock.calls[0][0]).toContain("UnInstall-BcContainerApp");
    expect(runRaw.mock.calls[0][0]).toContain("AppX");
  });

  it("publish passes folder", async () => {
    await createCliProgram().parseAsync(["node", "bcd", "publish", "c1", "C:\\proj"]);
    expect(runPs.mock.calls[0][0]).toContain("Publish-BCDProject");
  });

  it("publish prints fallback when stdout empty", async () => {
    runPs.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });
    await createCliProgram().parseAsync(["node", "bcd", "publish", "c1", "C:\\proj"]);
    expect(logSpy).toHaveBeenCalledWith("Project compiled and published.");
  });

  it("test adds optional flags", async () => {
    await createCliProgram().parseAsync([
      "node",
      "bcd",
      "test",
      "sandbox",
      "-c",
      "50100",
      "-f",
      "MyTest",
      "-a",
      "C:\\tf",
    ]);
    expect(runPs.mock.calls[0][0]).toContain("Invoke-BCDTests");
    expect(runPs.mock.calls[0][0]).toContain("-TestCodeunitId 50100");
    expect(runPs.mock.calls[0][0]).toContain("-TestFunctionName 'MyTest'");
    expect(runPs.mock.calls[0][0]).toContain("-AppProjectFolder 'C:\\tf'");
  });

  it("test uses default container when omitted", async () => {
    await createCliProgram().parseAsync(["node", "bcd", "test"]);
    expect(runPs.mock.calls[0][0]).toContain("-ContainerName 'bcsandbox'");
  });

  it("test prints fallback when stdout empty", async () => {
    runPs.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });
    await createCliProgram().parseAsync(["node", "bcd", "test", "c1"]);
    expect(logSpy).toHaveBeenCalledWith("Test run complete.");
  });

  it("toolkit imports with --full", async () => {
    await createCliProgram().parseAsync(["node", "bcd", "toolkit", "c1", "--full"]);
    expect(runPs.mock.calls[0][0]).toContain("Import-BCDTestToolkit");
    expect(runPs.mock.calls[0][0]).toContain("-LibrariesOnly $false");
  });

  it("toolkit default uses libraries only", async () => {
    await createCliProgram().parseAsync(["node", "bcd", "toolkit", "c1"]);
    expect(runPs.mock.calls[0][0]).toContain("-LibrariesOnly $true");
  });

  it("toolkit prints fallback when stdout empty", async () => {
    runPs.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });
    await createCliProgram().parseAsync(["node", "bcd", "toolkit", "c1"]);
    expect(logSpy).toHaveBeenCalledWith("Test toolkit imported.");
  });

  it("license imports file", async () => {
    await createCliProgram().parseAsync(["node", "bcd", "license", "c1", "C:\\a.flf"]);
    expect(runPs.mock.calls[0][0]).toContain("Import-BCDLicense");
  });

  it("license prints fallback when stdout empty", async () => {
    runPs.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });
    await createCliProgram().parseAsync(["node", "bcd", "license", "c1", "C:\\a.flf"]);
    expect(logSpy).toHaveBeenCalledWith("License imported.");
  });

  it("program exposes name and version", async () => {
    const { VERSION } = await import("../version.js");
    const p = createCliProgram();
    expect(p.name()).toBe("bcd");
    expect(p.version()).toBe(VERSION);
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
