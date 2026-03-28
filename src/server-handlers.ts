import { runPowerShell, runRawPowerShell, psEscape } from "./executor.js";

function mcpText(text: string): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text" as const, text }] };
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
  return mcpText(result.stdout || "No containers found.");
}

export async function handleContainerInfo({ containerName }: { containerName: string }) {
  const cn = psEscape(containerName);
  const result = await runPowerShell(`
      Import-Module BcContainerHelper -DisableNameChecking -ErrorAction Stop
      $bcVersion = Get-BcContainerNavVersion -containerOrImageName '${cn}'
      $webUrl = Get-BCDockerWebClientUrl -ContainerName '${cn}' -UseHttps:$false
      $status = docker inspect '${cn}' --format '{{.State.Status}}' 2>$null
      Write-Output "Container  : ${cn}"
      Write-Output "Status     : $status"
      Write-Output "BC Version : $bcVersion"
      Write-Output "Web Client : $webUrl"
      Write-Output "OData/API  : http://${cn}:7048/BC/api"
      Write-Output "Dev Service: http://${cn}:7049/BC"
    `);
  return mcpText(result.stdout);
}

export async function handleCreateContainer({
  containerName,
  version,
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
  version: string;
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
        -Version '${psEscape(version)}' \`
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
  return mcpText(result.stdout || "Container creation complete.");
}

export async function handleRemoveContainer({ containerName }: { containerName: string }) {
  const result = await runPowerShell(`Remove-BCDContainer -ContainerName '${psEscape(containerName)}'`);
  return mcpText(result.stdout || `Container '${psEscape(containerName)}' removed.`);
}

export async function handleStartContainer({ containerName }: { containerName: string }) {
  const result = await runPowerShell(`Start-BCDContainer -ContainerName '${psEscape(containerName)}'`);
  return mcpText(result.stdout || `Container '${psEscape(containerName)}' started.`);
}

export async function handleStopContainer({ containerName }: { containerName: string }) {
  const result = await runPowerShell(`Stop-BCDContainer -ContainerName '${psEscape(containerName)}'`);
  return mcpText(result.stdout || `Container '${psEscape(containerName)}' stopped.`);
}

export async function handleRestartContainer({ containerName }: { containerName: string }) {
  const result = await runPowerShell(`Restart-BCDContainer -ContainerName '${psEscape(containerName)}'`);
  return mcpText(result.stdout || `Container '${psEscape(containerName)}' restarted.`);
}

export async function handleOpenWebclient({ containerName }: { containerName: string }) {
  const result = await runPowerShell(`
      $url = Get-BCDockerWebClientUrl -ContainerName '${psEscape(containerName)}' -UseHttps:$false
      Write-Output $url
    `);
  return mcpText(result.stdout || "Could not resolve URL.");
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
  return mcpText(result.stdout || "No apps found.");
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
  return mcpText(result.stdout || "App installed.");
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
      $allApps = Get-BcContainerAppInfo -containerName '${cn}' -tenant default -tenantSpecificProperties
      $sorted = Get-BcContainerAppInfo -containerName '${cn}' -tenant default -tenantSpecificProperties -sort DependenciesLast
      $target = $allApps | Where-Object { $_.Name -eq '${an}' -and $_.Publisher -eq '${ap}' }
      if (-not $target) { Write-Output "App '${an}' by '${ap}' not found."; exit }
      foreach ($app in $sorted) {
        if ($app.Name -eq '${an}' -and $app.Publisher -eq '${ap}' -and $app.IsInstalled) {
          UnInstall-BcContainerApp -name $app.Name -containerName '${cn}' -publisher $app.Publisher -version $app.Version -force
          Write-Output "Uninstalled: $($app.Name) v$($app.Version)"
        }
      }
    `);
  return mcpText(result.stdout || "Uninstall complete.");
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
  return mcpText(result.stdout || "Project compiled and published.");
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
  return mcpText(result.stdout || "Test toolkit imported.");
}

export async function handleImportLicense({
  containerName,
  licenseFile,
}: {
  containerName: string;
  licenseFile: string;
}) {
  const result = await runPowerShell(`Import-BCDLicense -ContainerName '${psEscape(containerName)}' -LicenseFile '${psEscape(licenseFile)}'`);
  return mcpText(result.stdout || "License imported.");
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
  return mcpText(result.stdout || "Test run complete.");
}
