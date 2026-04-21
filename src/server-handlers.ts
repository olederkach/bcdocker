import { runPowerShell, runRawPowerShell, psEscape, type ExecResult } from "./executor.js";

function mcpText(text: string): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text" as const, text }] };
}

// Surfaces stderr or non-zero exit codes to the MCP client so a call that
// silently failed in PowerShell doesn't return a confident success message.
function mcpResult(result: ExecResult, success: string) {
  if (result.exitCode !== 0 || (!result.stdout && result.stderr)) {
    const parts = [];
    if (result.stdout) parts.push(result.stdout);
    if (result.stderr) parts.push(`[stderr] ${result.stderr}`);
    parts.push(`[exit code ${result.exitCode}]`);
    return mcpText(`Failed:\n${parts.join("\n")}`);
  }
  return mcpText(result.stdout || success);
}

export async function handleListContainers() {
  const result = await runRawPowerShell(`
      Import-Module BcContainerHelper -DisableNameChecking -ErrorAction Stop
      $containers = Get-BcContainers
      if ($containers.Count -eq 0) {
        Write-Output "No BC containers found."
      } else {
        foreach ($name in $containers) {
          $status = docker inspect $name --format '{{.State.Status}}' 2>$null
          Write-Output "$name  [$status]"
        }
      }
    `);
  return mcpResult(result, "No containers found.");
}

export async function handleContainerInfo({ containerName }: { containerName: string }) {
  const cn = psEscape(containerName);
  const result = await runPowerShell(`
      Import-Module BcContainerHelper -DisableNameChecking -ErrorAction Stop
      $name = '${cn}'
      $bcVersion = Get-BcContainerNavVersion -containerOrImageName $name
      $webUrl = Get-BCDockerWebClientUrl -ContainerName $name -UseHttps:$false
      $status = docker inspect $name --format '{{.State.Status}}' 2>$null
      Write-Output "Container  : $name"
      Write-Output "Status     : $status"
      Write-Output "BC Version : $bcVersion"
      Write-Output "Web Client : $webUrl"
      Write-Output ("OData/API  : http://" + $name + ":7048/BC/api")
      Write-Output ("Dev Service: http://" + $name + ":7049/BC")
    `);
  return mcpResult(result, "");
}

export async function handleCreateContainer({
  containerName,
  type,
  bcVersion,
  country,
  userName,
  password,
  memoryLimit,
  isolation,
  testToolkit,
  bypassCDN,
  licenseFile,
}: {
  containerName: string;
  type: "sandbox" | "onprem";
  bcVersion: string;
  country: string;
  userName: string;
  password: string;
  memoryLimit: string;
  isolation: "hyperv" | "process";
  testToolkit: "none" | "libraries" | "full";
  bypassCDN: boolean;
  licenseFile?: string;
}) {
  const includeToolkit = testToolkit !== "none" ? "$true" : "$false";
  const libOnly = testToolkit === "libraries" ? "$true" : "$false";
  const cdn = bypassCDN ? "-BypassCDN" : "";
  const lic = licenseFile ? `-LicenseFile '${psEscape(licenseFile)}'` : "";

  const result = await runPowerShell(
    `
      New-BCDContainer \`
        -ContainerName '${psEscape(containerName)}' \`
        -Type '${psEscape(type)}' \`
        -BcVersion '${psEscape(bcVersion)}' \`
        -Country '${psEscape(country)}' \`
        -UserName '${psEscape(userName)}' \`
        -Password '${psEscape(password)}' \`
        -MemoryLimit '${psEscape(memoryLimit)}' \`
        -Isolation '${psEscape(isolation)}' \`
        -IncludeTestToolkit ${includeToolkit} \`
        -TestLibrariesOnly ${libOnly} \`
        ${cdn} ${lic}
    `,
    1_800_000
  );
  return mcpResult(result, "Container creation complete.");
}

export async function handleRemoveContainer({ containerName }: { containerName: string }) {
  const result = await runPowerShell(`Remove-BCDContainer -ContainerName '${psEscape(containerName)}'`);
  return mcpResult(result, `Container '${containerName}' removed.`);
}

export async function handleStartContainer({ containerName }: { containerName: string }) {
  const result = await runPowerShell(`Start-BCDContainer -ContainerName '${psEscape(containerName)}'`);
  return mcpResult(result, `Container '${containerName}' started.`);
}

export async function handleStopContainer({ containerName }: { containerName: string }) {
  const result = await runPowerShell(`Stop-BCDContainer -ContainerName '${psEscape(containerName)}'`);
  return mcpResult(result, `Container '${containerName}' stopped.`);
}

export async function handleRestartContainer({ containerName }: { containerName: string }) {
  const result = await runPowerShell(`Restart-BCDContainer -ContainerName '${psEscape(containerName)}'`);
  return mcpResult(result, `Container '${containerName}' restarted.`);
}

export async function handleOpenWebclient({ containerName }: { containerName: string }) {
  const result = await runPowerShell(`
      $url = Get-BCDockerWebClientUrl -ContainerName '${psEscape(containerName)}' -UseHttps:$false
      Write-Output $url
    `);
  return mcpResult(result, "Could not resolve URL.");
}

export async function handleListApps({
  containerName,
  publisher,
}: {
  containerName: string;
  publisher?: string;
}) {
  const cn = psEscape(containerName);
  const filter = publisher ? `| Where-Object { $_.Publisher -eq '${psEscape(publisher)}' }` : "";

  const result = await runRawPowerShell(`
      Import-Module BcContainerHelper -DisableNameChecking -ErrorAction Stop
      $apps = Get-BcContainerAppInfo -containerName '${cn}' -tenant default -tenantSpecificProperties ${filter}
      $apps | Select-Object Name, Publisher, Version, IsInstalled, Scope |
        Sort-Object Publisher, Name |
        Format-Table -AutoSize | Out-String -Width 200
    `);
  return mcpResult(result, "No apps found.");
}

export async function handleInstallApp({
  containerName,
  appFile,
  userName,
  password,
}: {
  containerName: string;
  appFile: string;
  userName: string;
  password: string;
}) {
  const result = await runPowerShell(`
      $cred = Get-BCCredential -UserName '${psEscape(userName)}' -Password '${psEscape(password)}'
      Install-BCDApp -ContainerName '${psEscape(containerName)}' -AppFile '${psEscape(appFile)}' -Credential $cred
    `);
  return mcpResult(result, "App installed.");
}

export async function handleUninstallApp({
  containerName,
  appName,
  appPublisher,
}: {
  containerName: string;
  appName: string;
  appPublisher: string;
}) {
  const cn = psEscape(containerName);
  const an = psEscape(appName);
  const ap = psEscape(appPublisher);
  const result = await runRawPowerShell(`
      Import-Module BcContainerHelper -DisableNameChecking -ErrorAction Stop
      $containerName = '${cn}'
      $appName = '${an}'
      $appPublisher = '${ap}'
      $allApps = Get-BcContainerAppInfo -containerName $containerName -tenant default -tenantSpecificProperties
      $sorted = Get-BcContainerAppInfo -containerName $containerName -tenant default -tenantSpecificProperties -sort DependenciesLast
      $target = $allApps | Where-Object { $_.Name -eq $appName -and $_.Publisher -eq $appPublisher }
      if (-not $target) { Write-Output "App '$appName' by '$appPublisher' not found."; exit }
      foreach ($app in $sorted) {
        if ($app.Name -eq $appName -and $app.Publisher -eq $appPublisher -and $app.IsInstalled) {
          UnInstall-BcContainerApp -name $app.Name -containerName $containerName -publisher $app.Publisher -version $app.Version -force
          Write-Output "Uninstalled: $($app.Name) v$($app.Version)"
        }
      }
    `);
  return mcpResult(result, "Uninstall complete.");
}

export async function handlePublishProject({
  containerName,
  projectFolder,
  userName,
  password,
}: {
  containerName: string;
  projectFolder: string;
  userName: string;
  password: string;
}) {
  const result = await runPowerShell(
    `
      $cred = Get-BCCredential -UserName '${psEscape(userName)}' -Password '${psEscape(password)}'
      Publish-BCDProject -ContainerName '${psEscape(containerName)}' -ProjectFolder '${psEscape(projectFolder)}' -Credential $cred
    `,
    300_000
  );
  return mcpResult(result, "Project compiled and published.");
}

export async function handleImportTestToolkit({
  containerName,
  librariesOnly,
  userName,
  password,
}: {
  containerName: string;
  librariesOnly: boolean;
  userName: string;
  password: string;
}) {
  const libPs = librariesOnly ? "$true" : "$false";
  const result = await runPowerShell(
    `
      $cred = Get-BCCredential -UserName '${psEscape(userName)}' -Password '${psEscape(password)}'
      Import-BCDTestToolkit -ContainerName '${psEscape(containerName)}' -Credential $cred -LibrariesOnly ${libPs}
    `,
    300_000
  );
  return mcpResult(result, "Test toolkit imported.");
}

export async function handleImportLicense({
  containerName,
  licenseFile,
}: {
  containerName: string;
  licenseFile: string;
}) {
  const result = await runPowerShell(`Import-BCDLicense -ContainerName '${psEscape(containerName)}' -LicenseFile '${psEscape(licenseFile)}'`);
  return mcpResult(result, "License imported.");
}

export async function handleRunTests({
  containerName,
  testCodeunitId,
  testFunctionName,
  appProjectFolder,
  userName,
  password,
}: {
  containerName: string;
  testCodeunitId?: number;
  testFunctionName?: string;
  appProjectFolder?: string;
  userName: string;
  password: string;
}) {
  const params: string[] = [`-ContainerName '${psEscape(containerName)}'`];
  params.push(`-Credential (Get-BCCredential -UserName '${psEscape(userName)}' -Password '${psEscape(password)}')`);

  if (testCodeunitId) params.push(`-TestCodeunitId ${testCodeunitId}`);
  if (testFunctionName) params.push(`-TestFunctionName '${psEscape(testFunctionName)}'`);
  if (appProjectFolder) params.push(`-AppProjectFolder '${psEscape(appProjectFolder)}'`);

  const result = await runPowerShell(`Invoke-BCDTests ${params.join(" ")}`, 600_000);
  return mcpResult(result, "Test run complete.");
}
