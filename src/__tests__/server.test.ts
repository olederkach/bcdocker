import { beforeEach, describe, expect, it, vi } from "vitest";
import { runPowerShell, runRawPowerShell } from "../executor.js";
import * as handlers from "../server-handlers.js";

vi.mock("../executor.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../executor.js")>();
  return {
    ...actual,
    runPowerShell: vi.fn().mockResolvedValue({ stdout: "ps-out", stderr: "", exitCode: 0 }),
    runRawPowerShell: vi.fn().mockResolvedValue({ stdout: "raw-out", stderr: "", exitCode: 0 }),
  };
});

const runPs = vi.mocked(runPowerShell);
const runRaw = vi.mocked(runRawPowerShell);

describe("MCP tool handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runPs.mockResolvedValue({ stdout: "ps-out", stderr: "", exitCode: 0 });
    runRaw.mockResolvedValue({ stdout: "raw-out", stderr: "", exitCode: 0 });
  });

  it("handleListContainers uses Get-BcContainers", async () => {
    const r = await handlers.handleListContainers();
    expect(runRaw).toHaveBeenCalled();
    expect(runRaw.mock.calls[0][0]).toContain("Get-BcContainers");
    expect(r.content[0].text).toContain("raw-out");
  });

  it("handleListContainers falls back when stdout empty", async () => {
    runRaw.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });
    const r = await handlers.handleListContainers();
    expect(r.content[0].text).toBe("No containers found.");
  });

  it("handleContainerInfo uses Get-BCDockerWebClientUrl and containerOrImageName", async () => {
    await handlers.handleContainerInfo({ containerName: "bc1" });
    expect(runPs.mock.calls[0][0]).toContain("Get-BCDockerWebClientUrl");
    expect(runPs.mock.calls[0][0]).toContain("containerOrImageName 'bc1'");
  });

  it("handleCreateContainer passes New-BCDContainer params", async () => {
    await handlers.handleCreateContainer({
      containerName: "n",
      version: "sandbox",
      country: "us",
      userName: "u",
      password: "p",
      memoryLimit: "8G",
      isolation: "hyperv",
      testToolkit: "libraries",
      bypassCDN: true,
      licenseFile: "C:\\a.flf",
    });
    expect(runPs.mock.calls[0][0]).toContain("New-BCDContainer");
    expect(runPs.mock.calls[0][0]).toContain("-BypassCDN");
    expect(runPs.mock.calls[0][0]).toContain("-LicenseFile 'C:\\a.flf'");
    expect(runPs.mock.calls[0][1]).toBe(1_800_000);
  });

  it("handleCreateContainer omits CDN and license when not set", async () => {
    await handlers.handleCreateContainer({
      containerName: "n2",
      version: "onprem",
      country: "w1",
      userName: "u",
      password: "p",
      memoryLimit: "4G",
      isolation: "process",
      testToolkit: "none",
      bypassCDN: false,
    });
    const script = runPs.mock.calls[0][0];
    expect(script).toContain("New-BCDContainer");
    expect(script).not.toContain("-BypassCDN");
    expect(script).not.toContain("-LicenseFile");
    expect(script).toContain("-IncludeTestToolkit $false");
  });

  it("handleCreateContainer full toolkit uses TestLibrariesOnly $false", async () => {
    await handlers.handleCreateContainer({
      containerName: "n3",
      version: "sandbox",
      country: "us",
      userName: "u",
      password: "p",
      memoryLimit: "8G",
      isolation: "hyperv",
      testToolkit: "full",
      bypassCDN: false,
    });
    expect(runPs.mock.calls[0][0]).toContain("-TestLibrariesOnly $false");
  });

  it("handleCreateContainer falls back message when stdout empty", async () => {
    runPs.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });
    const r = await handlers.handleCreateContainer({
      containerName: "n",
      version: "sandbox",
      country: "us",
      userName: "u",
      password: "p",
      memoryLimit: "8G",
      isolation: "hyperv",
      testToolkit: "none",
      bypassCDN: false,
    });
    expect(r.content[0].text).toBe("Container creation complete.");
  });

  it("handleRemoveContainer calls Remove-BCDContainer", async () => {
    await handlers.handleRemoveContainer({ containerName: "x" });
    expect(runPs.mock.calls[0][0]).toContain("Remove-BCDContainer -ContainerName 'x'");
  });

  it("handleStartContainer calls Start-BCDContainer", async () => {
    await handlers.handleStartContainer({ containerName: "x" });
    expect(runPs.mock.calls[0][0]).toContain("Start-BCDContainer");
  });

  it("handleStopContainer calls Stop-BCDContainer", async () => {
    await handlers.handleStopContainer({ containerName: "x" });
    expect(runPs.mock.calls[0][0]).toContain("Stop-BCDContainer");
  });

  it("handleRestartContainer calls Restart-BCDContainer", async () => {
    await handlers.handleRestartContainer({ containerName: "x" });
    expect(runPs.mock.calls[0][0]).toContain("Restart-BCDContainer");
  });

  it("handleOpenWebclient uses Get-BCDockerWebClientUrl", async () => {
    await handlers.handleOpenWebclient({ containerName: "bc" });
    expect(runPs.mock.calls[0][0]).toContain("Get-BCDockerWebClientUrl");
  });

  it("handleListApps uses Get-BcContainerAppInfo", async () => {
    await handlers.handleListApps({ containerName: "c", publisher: "Microsoft" });
    expect(runRaw.mock.calls[0][0]).toContain("Get-BcContainerAppInfo");
    expect(runRaw.mock.calls[0][0]).toContain("Microsoft");
  });

  it("handleListApps without publisher omits filter", async () => {
    await handlers.handleListApps({ containerName: "c" });
    expect(runRaw.mock.calls[0][0]).toContain("Get-BcContainerAppInfo");
    expect(runRaw.mock.calls[0][0]).not.toContain("Where-Object");
  });

  it("handleInstallApp uses Install-BCDApp", async () => {
    await handlers.handleInstallApp({
      containerName: "c",
      appFile: "C:\\a.app",
      userName: "u",
      password: "p",
    });
    expect(runPs.mock.calls[0][0]).toContain("Install-BCDApp");
  });

  it("handleUninstallApp uses UnInstall-BcContainerApp", async () => {
    await handlers.handleUninstallApp({
      containerName: "c",
      appName: "App",
      appPublisher: "Pub",
    });
    expect(runRaw.mock.calls[0][0]).toContain("UnInstall-BcContainerApp");
  });

  it("handlePublishProject uses Publish-BCDProject", async () => {
    await handlers.handlePublishProject({
      containerName: "c",
      projectFolder: "C:\\proj",
      userName: "u",
      password: "p",
    });
    expect(runPs.mock.calls[0][0]).toContain("Publish-BCDProject");
    expect(runPs.mock.calls[0][1]).toBe(300_000);
  });

  it("handleImportTestToolkit uses Import-BCDTestToolkit", async () => {
    await handlers.handleImportTestToolkit({
      containerName: "c",
      librariesOnly: false,
      userName: "u",
      password: "p",
    });
    expect(runPs.mock.calls[0][0]).toContain("Import-BCDTestToolkit");
    expect(runPs.mock.calls[0][0]).toContain("-LibrariesOnly $false");
  });

  it("handleImportTestToolkit librariesOnly true uses $true", async () => {
    await handlers.handleImportTestToolkit({
      containerName: "c",
      librariesOnly: true,
      userName: "u",
      password: "p",
    });
    expect(runPs.mock.calls[0][0]).toContain("-LibrariesOnly $true");
  });

  it("handleImportLicense uses Import-BCDLicense", async () => {
    await handlers.handleImportLicense({ containerName: "c", licenseFile: "C:\\l.flf" });
    expect(runPs.mock.calls[0][0]).toContain("Import-BCDLicense");
  });

  it("handleRunTests builds Invoke-BCDTests with optional params", async () => {
    await handlers.handleRunTests({
      containerName: "c",
      testCodeunitId: 50100,
      testFunctionName: "TestFoo",
      appProjectFolder: "C:\\t",
      userName: "u",
      password: "p",
    });
    expect(runPs.mock.calls[0][0]).toContain("Invoke-BCDTests");
    expect(runPs.mock.calls[0][0]).toContain("-TestCodeunitId 50100");
    expect(runPs.mock.calls[0][0]).toContain("-TestFunctionName 'TestFoo'");
    expect(runPs.mock.calls[0][0]).toContain("-AppProjectFolder 'C:\\t'");
    expect(runPs.mock.calls[0][1]).toBe(600_000);
  });

  it("handleRunTests minimal params only container and credential", async () => {
    await handlers.handleRunTests({ containerName: "c", userName: "u", password: "p" });
    const script = runPs.mock.calls[0][0];
    expect(script).toContain("Invoke-BCDTests");
    expect(script).not.toContain("-TestCodeunitId");
    expect(script).not.toContain("-TestFunctionName");
    expect(script).not.toContain("-AppProjectFolder");
  });

  it("handleRemoveContainer uses fallback when stdout empty", async () => {
    runPs.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });
    const r = await handlers.handleRemoveContainer({ containerName: "x" });
    expect(r.content[0].text).toContain("removed");
  });

  it("handleOpenWebclient uses fallback when stdout empty", async () => {
    runPs.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });
    const r = await handlers.handleOpenWebclient({ containerName: "bc" });
    expect(r.content[0].text).toBe("Could not resolve URL.");
  });

  it("handleListApps empty stdout fallback", async () => {
    runRaw.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });
    const r = await handlers.handleListApps({ containerName: "c" });
    expect(r.content[0].text).toBe("No apps found.");
  });

  it("handleStartContainer empty stdout fallback", async () => {
    runPs.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });
    const r = await handlers.handleStartContainer({ containerName: "x" });
    expect(r.content[0].text).toContain("started");
  });

  it("handleStopContainer empty stdout fallback", async () => {
    runPs.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });
    const r = await handlers.handleStopContainer({ containerName: "x" });
    expect(r.content[0].text).toContain("stopped");
  });

  it("handleRestartContainer empty stdout fallback", async () => {
    runPs.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });
    const r = await handlers.handleRestartContainer({ containerName: "x" });
    expect(r.content[0].text).toContain("restarted");
  });

  it("handleInstallApp empty stdout fallback", async () => {
    runPs.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });
    const r = await handlers.handleInstallApp({
      containerName: "c",
      appFile: "C:\\a.app",
      userName: "u",
      password: "p",
    });
    expect(r.content[0].text).toBe("App installed.");
  });

  it("handlePublishProject empty stdout fallback", async () => {
    runPs.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });
    const r = await handlers.handlePublishProject({
      containerName: "c",
      projectFolder: "C:\\p",
      userName: "u",
      password: "p",
    });
    expect(r.content[0].text).toBe("Project compiled and published.");
  });

  it("handleImportLicense empty stdout fallback", async () => {
    runPs.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });
    const r = await handlers.handleImportLicense({ containerName: "c", licenseFile: "C:\\l.flf" });
    expect(r.content[0].text).toBe("License imported.");
  });

  it("handleImportTestToolkit empty stdout fallback", async () => {
    runPs.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });
    const r = await handlers.handleImportTestToolkit({
      containerName: "c",
      librariesOnly: true,
      userName: "u",
      password: "p",
    });
    expect(r.content[0].text).toBe("Test toolkit imported.");
  });

  it("handleRunTests empty stdout fallback", async () => {
    runPs.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });
    const r = await handlers.handleRunTests({ containerName: "c", userName: "u", password: "p" });
    expect(r.content[0].text).toBe("Test run complete.");
  });

  it("handleUninstallApp empty stdout fallback", async () => {
    runRaw.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });
    const r = await handlers.handleUninstallApp({
      containerName: "c",
      appName: "A",
      appPublisher: "P",
    });
    expect(r.content[0].text).toBe("Uninstall complete.");
  });
});
