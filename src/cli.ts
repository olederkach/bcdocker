#!/usr/bin/env node

import { Command } from "commander";
import { runPowerShell, runRawPowerShell, psEscape } from "./executor.js";

/** Builds the CLI (exported for tests). */
export function createCliProgram(): Command {
  const program = new Command();

  program
    .name("bcd")
    .description("CLI for Business Central Docker container management")
    .version("1.0.2");

// ── Containers ───────────────────────────────────────────

program
  .command("list")
  .alias("ls")
  .description("List all BC containers with status")
  .action(async () => {
    const { stdout } = await runRawPowerShell(`
      Import-Module BcContainerHelper -DisableNameChecking -ErrorAction Stop
      $containers = Get-BcContainers
      if ($containers.Count -eq 0) { Write-Output "No BC containers found." }
      else {
        foreach ($name in $containers) {
          $status = docker inspect $name --format '{{.State.Status}}' 2>$null
          Write-Output "$($name.PadRight(25)) $status"
        }
      }
    `);
    console.log(stdout);
  });

program
  .command("info <container>")
  .description("Show container details: version, status, endpoints")
  .action(async (container: string) => {
    const c = psEscape(container);
    const { stdout } = await runPowerShell(`
      Import-Module BcContainerHelper -DisableNameChecking -ErrorAction Stop
      $v = Get-BcContainerNavVersion -containerOrImageName '${c}'
      $u = Get-BCDockerWebClientUrl -ContainerName '${c}' -UseHttps:$false
      $s = docker inspect '${c}' --format '{{.State.Status}}' 2>$null
      Write-Output "Container  : ${c}"
      Write-Output "Status     : $s"
      Write-Output "BC Version : $v"
      Write-Output "Web Client : $u"
      Write-Output "OData/API  : http://${c}:7048/BC/api"
      Write-Output "Dev Service: http://${c}:7049/BC"
    `);
    console.log(stdout);
  });

program
  .command("create")
  .description("Create a new BC container")
  .option("-n, --name <name>", "Container name", "bcsandbox")
  .option("-v, --version <version>", "BC version (sandbox, onprem, 26.0)", "sandbox")
  .option("-c, --country <code>", "Country code (us, w1, gb, nl)", "us")
  .option("-u, --user <username>", "Admin username", "admin")
  .option("-p, --password <password>", "Admin password", "P@ssw0rd!")
  .option("-m, --memory <limit>", "Memory limit", "8G")
  .option("-i, --isolation <mode>", "Isolation: hyperv or process", "hyperv")
  .option("-t, --toolkit <mode>", "Test toolkit: none, libraries, full", "libraries")
  .option("--bypass-cdn", "Skip Azure CDN, use blob storage")
  .option("-l, --license <file>", "Path or URL to .bclicense / .flf license file")
  .action(async (opts) => {
    const includeToolkit = opts.toolkit !== "none" ? "$true" : "$false";
    const libOnly = opts.toolkit === "libraries" ? "$true" : "$false";
    const cdn = opts.bypassCdn ? "-BypassCDN" : "";
    const lic = opts.license ? `-LicenseFile '${psEscape(opts.license)}'` : "";

    console.log(`Creating container '${opts.name}'...`);
    console.log(`  Version: ${opts.version}, Country: ${opts.country}, Toolkit: ${opts.toolkit}`);
    console.log(`  This may take 5-30 minutes.\n`);

    const { stdout, stderr } = await runPowerShell(`
      New-BCDContainer \`
        -ContainerName '${psEscape(opts.name)}' \`
        -Version '${psEscape(opts.version)}' \`
        -Country '${psEscape(opts.country)}' \`
        -UserName '${psEscape(opts.user)}' \`
        -Password '${psEscape(opts.password)}' \`
        -MemoryLimit '${psEscape(opts.memory)}' \`
        -Isolation '${psEscape(opts.isolation)}' \`
        -IncludeTestToolkit ${includeToolkit} \`
        -TestLibrariesOnly ${libOnly} \`
        ${cdn} ${lic}
    `, 1_800_000);

    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
  });

program
  .command("remove <container>")
  .alias("rm")
  .description("Remove a BC container")
  .action(async (container: string) => {
    const { stdout } = await runPowerShell(
      `Remove-BCDContainer -ContainerName '${psEscape(container)}'`
    );
    console.log(stdout || `Container '${container}' removed.`);
  });

program
  .command("start <container>")
  .description("Start a stopped container")
  .action(async (container: string) => {
    const { stdout } = await runPowerShell(
      `Start-BCDContainer -ContainerName '${psEscape(container)}'`
    );
    console.log(stdout || `Container '${container}' started.`);
  });

program
  .command("stop <container>")
  .description("Stop a running container")
  .action(async (container: string) => {
    const { stdout } = await runPowerShell(
      `Stop-BCDContainer -ContainerName '${psEscape(container)}'`
    );
    console.log(stdout || `Container '${container}' stopped.`);
  });

program
  .command("restart <container>")
  .description("Restart a container")
  .action(async (container: string) => {
    const { stdout } = await runPowerShell(
      `Restart-BCDContainer -ContainerName '${psEscape(container)}'`
    );
    console.log(stdout || `Container '${container}' restarted.`);
  });

program
  .command("open <container>")
  .description("Open the BC Web Client in your browser")
  .action(async (container: string) => {
    const { stdout } = await runPowerShell(
      `Open-BCDWebClient -ContainerName '${psEscape(container)}'`
    );
    console.log(stdout || "Opening web client...");
  });

// ── Apps ─────────────────────────────────────────────────

program
  .command("apps <container>")
  .description("List apps in a container")
  .option("--publisher <name>", "Filter by publisher")
  .action(async (container: string, opts) => {
    const c = psEscape(container);
    const filter = opts.publisher
      ? `| Where-Object { $_.Publisher -eq '${psEscape(opts.publisher)}' }`
      : "";

    const { stdout } = await runRawPowerShell(`
      Import-Module BcContainerHelper -DisableNameChecking -ErrorAction Stop
      Get-BcContainerAppInfo -containerName '${c}' -tenant default -tenantSpecificProperties ${filter} |
        Select-Object Name, Publisher, Version, IsInstalled, Scope |
        Sort-Object Publisher, Name |
        Format-Table -AutoSize | Out-String -Width 200
    `);
    console.log(stdout || "No apps found.");
  });

program
  .command("install <container> <appFile>")
  .description("Install a .app file into a container")
  .option("-u, --user <username>", "Admin username", "admin")
  .option("-p, --password <password>", "Admin password", "P@ssw0rd!")
  .action(async (container: string, appFile: string, opts) => {
    const { stdout } = await runPowerShell(`
      $cred = Get-BCCredential -UserName '${psEscape(opts.user)}' -Password '${psEscape(opts.password)}'
      Install-BCDApp -ContainerName '${psEscape(container)}' -AppFile '${psEscape(appFile)}' -Credential $cred
    `);
    console.log(stdout || "App installed.");
  });

program
  .command("uninstall <container> <appName> <publisher>")
  .description("Uninstall an app by name and publisher")
  .action(async (container: string, appName: string, publisher: string) => {
    const c = psEscape(container);
    const an = psEscape(appName);
    const p = psEscape(publisher);
    const { stdout } = await runRawPowerShell(`
      Import-Module BcContainerHelper -DisableNameChecking -ErrorAction Stop
      $sorted = Get-BcContainerAppInfo -containerName '${c}' -tenant default -tenantSpecificProperties -sort DependenciesLast
      $target = $sorted | Where-Object { $_.Name -eq '${an}' -and $_.Publisher -eq '${p}' -and $_.IsInstalled }
      if (-not $target) { Write-Output "App '${an}' by '${p}' not found or not installed."; exit }
      foreach ($app in $target) {
        UnInstall-BcContainerApp -name $app.Name -containerName '${c}' -publisher $app.Publisher -version $app.Version -force
        Write-Output "Uninstalled: $($app.Name) v$($app.Version)"
      }
    `);
    console.log(stdout);
  });

program
  .command("publish <container> <projectFolder>")
  .description("Compile and publish an AL project into a container")
  .option("-u, --user <username>", "Admin username", "admin")
  .option("-p, --password <password>", "Admin password", "P@ssw0rd!")
  .action(async (container: string, folder: string, opts) => {
    const { stdout } = await runPowerShell(`
      $cred = Get-BCCredential -UserName '${psEscape(opts.user)}' -Password '${psEscape(opts.password)}'
      Publish-BCDProject -ContainerName '${psEscape(container)}' -ProjectFolder '${psEscape(folder)}' -Credential $cred
    `, 300_000);
    console.log(stdout || "Project compiled and published.");
  });

// ── Tests & License ──────────────────────────────────────

program
  .command("test [container]")
  .description("Run AL tests in a container")
  .option("-c, --codeunit <id>", "Test codeunit ID")
  .option("-f, --function <name>", "Test function name")
  .option("-a, --app <folder>", "AL test project folder to compile/publish/run")
  .option("-u, --user <username>", "Admin username", "admin")
  .option("-p, --password <password>", "Admin password", "P@ssw0rd!")
  .action(async (container: string = "bcsandbox", opts) => {
    const params: string[] = [`-ContainerName '${psEscape(container)}'`];
    params.push(
      `-Credential (Get-BCCredential -UserName '${psEscape(opts.user)}' -Password '${psEscape(opts.password)}')`
    );
    if (opts.codeunit) params.push(`-TestCodeunitId ${opts.codeunit}`);
    if (opts.function) params.push(`-TestFunctionName '${psEscape(opts.function)}'`);
    if (opts.app) params.push(`-AppProjectFolder '${psEscape(opts.app)}'`);

    const { stdout } = await runPowerShell(
      `Invoke-BCDTests ${params.join(" ")}`,
      600_000
    );
    console.log(stdout || "Test run complete.");
  });

program
  .command("toolkit <container>")
  .description("Import BC Test Toolkit into a container")
  .option("--full", "Import full test framework (default: libraries only)")
  .option("-u, --user <username>", "Admin username", "admin")
  .option("-p, --password <password>", "Admin password", "P@ssw0rd!")
  .action(async (container: string, opts) => {
    const libOnly = opts.full ? "$false" : "$true";
    const { stdout } = await runPowerShell(`
      $cred = Get-BCCredential -UserName '${psEscape(opts.user)}' -Password '${psEscape(opts.password)}'
      Import-BCDTestToolkit -ContainerName '${psEscape(container)}' -Credential $cred -LibrariesOnly ${libOnly}
    `, 300_000);
    console.log(stdout || "Test toolkit imported.");
  });

program
  .command("license <container> <file>")
  .description("Import a license file into a container")
  .action(async (container: string, file: string) => {
    const { stdout } = await runPowerShell(
      `Import-BCDLicense -ContainerName '${psEscape(container)}' -LicenseFile '${psEscape(file)}'`
    );
    console.log(stdout || "License imported.");
  });

  return program;
}

export async function runCli(argv: string[]): Promise<void> {
  const program = createCliProgram();
  await program.parseAsync(argv);
}
