function New-BCDContainer {
    <#
    .SYNOPSIS
        Creates a new Business Central Docker container.

    .PARAMETER ContainerName
        Name for the Docker container. Default: "bcsandbox"

    .PARAMETER Version
        BC artifact type: "sandbox", "onprem", or a specific version like "26.0". Default: "sandbox"

    .PARAMETER Country
        Localization code (us, w1, gb, nl, dk, etc.). Default: "us"

    .PARAMETER UserName
        Container admin username. Default: "admin"

    .PARAMETER Password
        Container admin password. Default: "P@ssw0rd!"

    .PARAMETER Credential
        PSCredential object. Overrides UserName/Password if supplied.

    .PARAMETER IncludeTestToolkit
        Include the BC Test Toolkit. Default: $true

    .PARAMETER TestLibrariesOnly
        Install only test libraries (faster). Default: $false

    .PARAMETER MemoryLimit
        Container memory limit. Default: "8G"

    .PARAMETER Isolation
        Isolation mode: hyperv or process. Default: "hyperv"

    .PARAMETER LicenseFile
        Path or URL to a .bclicense / .flf file.

    .PARAMETER BypassCDN
        Skip Azure CDN and use blob storage directly.
    #>
    [CmdletBinding()]
    param(
        [string]$ContainerName           = "bcsandbox",
        [string]$Version                 = "sandbox",
        [string]$Country                 = "us",
        [string]$UserName                = "admin",
        [string]$Password                = "P@ssw0rd!",
        [PSCredential]$Credential,
        [bool]$IncludeTestToolkit        = $true,
        [bool]$TestLibrariesOnly         = $false,
        [bool]$IncludePerformanceToolkit = $false,
        [string]$MemoryLimit             = "8G",
        [ValidateSet("hyperv","process")]
        [string]$Isolation               = "hyperv",
        [string]$LicenseFile             = "",
        [switch]$BypassCDN
    )

    Write-BCBanner "Create BC Container"

    # Step 1 — TLS & Docker
    Write-BCStep "1/8" "Enforcing TLS 1.2..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    if (-not (Assert-DockerReady)) { return }

    $osBuild = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion").CurrentBuild
    Write-BCInfo "Host OS Build: $osBuild"
    if ([int]$osBuild -ge 26200) {
        Write-Host "    Windows 11 25H2+ detected - CDN workarounds active." -ForegroundColor Yellow
        if (-not $BypassCDN) {
            Write-BCInfo "Tip: If downloads fail, re-run with -BypassCDN"
        }
    }

    # Step 2 — BcContainerHelper
    Write-BCStep "2/8" "Checking BcContainerHelper..."
    if (-not (Assert-BcContainerHelper)) { return }
    $helperVersion = (Get-Module BcContainerHelper).Version
    Write-BCSuccess "BcContainerHelper v$helperVersion"

    # Step 3 — Credentials
    Write-BCStep "3/8" "Preparing credentials..."
    if (-not $Credential) {
        $Credential = Get-BCCredential -UserName $UserName -Password $Password
    }
    Write-BCInfo "User: $($Credential.UserName)"

    # Step 4 — Resolve artifact URL
    Write-BCStep "4/8" "Resolving artifacts (type=$Version, country=$Country)..."
    $artifactUrl = Get-BcArtifactUrl -type $Version -country $Country -select Latest
    if (-not $artifactUrl) {
        Write-BCError "Failed to resolve artifact URL for version='$Version', country='$Country'."
        return
    }
    Write-BCSuccess "Resolved: $artifactUrl"

    if ($BypassCDN) {
        $cdnReplacements = @{
            'bcartifacts.azureedge.net'                            = 'bcartifacts.blob.core.windows.net'
            'bcartifacts-exdbf9fwegejdqak.b02.azurefd.net'        = 'bcartifacts.blob.core.windows.net'
            'bcinsider.azureedge.net'                              = 'bcinsider.blob.core.windows.net'
            'bcinsider-fvh2ekdjecfjd6gk.b02.azurefd.net'          = 'bcinsider.blob.core.windows.net'
            'bcpublicpreview.azureedge.net'                        = 'bcpublicpreview.blob.core.windows.net'
            'bcpublicpreview-f2ajahg0e2cudpgh.b02.azurefd.net'    = 'bcpublicpreview.blob.core.windows.net'
            'businesscentralapps.azureedge.net'                    = 'businesscentralapps.blob.core.windows.net'
            'businesscentralapps-hkdrdkaeangzfydv.b02.azurefd.net'= 'businesscentralapps.blob.core.windows.net'
        }
        foreach ($cdn in $cdnReplacements.Keys) {
            if ($artifactUrl -match [regex]::Escape($cdn)) {
                $artifactUrl = $artifactUrl.Replace($cdn, $cdnReplacements[$cdn])
                Write-BCInfo "CDN bypass: $cdn -> $($cdnReplacements[$cdn])"
                break
            }
        }
    }

    # Step 5 — Connectivity test
    Write-BCStep "5/8" "Testing connectivity..."
    $artifactHost = ([uri]$artifactUrl).Host
    foreach ($endpoint in @($artifactHost, "bcartifacts.blob.core.windows.net")) {
        try {
            $tcp = Test-NetConnection -ComputerName $endpoint -Port 443 `
                   -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
            $status = if ($tcp.TcpTestSucceeded) { "OK" } else { "BLOCKED" }
            $color  = if ($tcp.TcpTestSucceeded) { "Green" } else { "Red" }
            Write-Host "    ${endpoint}:443 => $status" -ForegroundColor $color
        }
        catch {
            Write-Host "    ${endpoint}:443 => UNREACHABLE" -ForegroundColor Red
        }
    }

    # Step 6 — Cache cleanup
    Write-BCStep "6/8" "Preparing cache..."
    $versionMatch = [regex]::Match($artifactUrl, '/(sandbox|onprem)/([\d.]+)/')
    if ($versionMatch.Success) {
        $artifactType  = $versionMatch.Groups[1].Value
        $majorVersion  = $versionMatch.Groups[2].Value.Split('.')[0]
        $cachePath     = "C:\bcartifacts.cache\$artifactType"

        if (Test-Path $cachePath) {
            $staleEntries = Get-ChildItem $cachePath -Directory -ErrorAction SilentlyContinue |
                            Where-Object { $_.Name -like "$majorVersion*" }
            if ($staleEntries) {
                Write-BCInfo "Clearing $($staleEntries.Count) cached v$majorVersion artifact(s)..."
                $staleEntries | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    }

    $tempCleared = 0
    Get-ChildItem "$env:LOCALAPPDATA\Temp" -Filter "*.zip" -ErrorAction SilentlyContinue |
        Where-Object { $_.Length -eq 0 -or $_.Name -like "bcContainerHelper*" } |
        ForEach-Object {
            Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
            $tempCleared++
        }
    if ($tempCleared -gt 0) {
        Write-BCInfo "Cleared $tempCleared stale temp file(s)."
    }
    Write-BCSuccess "Cache ready."

    # Step 7 — Download artifacts
    Write-BCStep "7/8" "Downloading artifacts (may take 5-15 min on first run)..."
    try {
        Download-Artifacts -artifactUrl $artifactUrl -includePlatform
        Write-BCSuccess "Artifacts cached."
    }
    catch {
        if (-not $BypassCDN) {
            Write-BCInfo "Retrying with blob storage fallback..."
            $artifactUrl = $artifactUrl.Replace("bcartifacts.azureedge.net", "bcartifacts.blob.core.windows.net")
            try {
                Download-Artifacts -artifactUrl $artifactUrl -includePlatform
                Write-BCSuccess "Artifacts downloaded via blob storage."
            }
            catch {
                Write-BCError "Download failed from both CDN and blob storage."
                Write-BCError $_.Exception.Message
                return
            }
        }
        else {
            Write-BCError "Download failed: $($_.Exception.Message)"
            return
        }
    }

    # Step 8 — Create container
    $existing = docker ps -a --filter "name=^/${ContainerName}$" --format '{{.Names}}' 2>$null
    if ($existing -eq $ContainerName) {
        Write-BCInfo "Removing existing container '$ContainerName'..."
        Remove-BcContainer -containerName $ContainerName
    }

    Write-BCStep "8/8" "Creating container '$ContainerName'..."
    if ($IncludeTestToolkit) {
        if ($TestLibrariesOnly) {
            Write-BCInfo "Test Toolkit: Libraries only (Assert, Library-Sales, etc.)"
        } else {
            Write-BCInfo "Test Toolkit: FULL - all Microsoft test framework apps + test codeunits"
        }
    }
    $params = @{
        containerName             = $ContainerName
        artifactUrl               = $artifactUrl
        auth                      = "UserPassword"
        credential                = $Credential
        memoryLimit               = $MemoryLimit
        accept_eula               = $true
        accept_insiderEula        = $true
        updateHosts               = $true
        includeTestToolkit        = $IncludeTestToolkit
        includeTestLibrariesOnly  = $TestLibrariesOnly
        includePerformanceToolkit = $IncludePerformanceToolkit
        dns                       = "8.8.8.8"
        isolation                 = $Isolation
        enableTaskScheduler       = $false
    }

    if ($LicenseFile -and ((Test-Path $LicenseFile -ErrorAction SilentlyContinue) -or ($LicenseFile -match "^https?://"))) {
        $params.licenseFile = $LicenseFile
    }

    New-BcContainer @params

    Write-BCBanner "Container Created Successfully" "Green"

    $bcVersion   = Get-BcContainerNavVersion -containerOrImageName $ContainerName
    $webclientUrl = Get-BCDockerWebClientUrl -ContainerName $ContainerName -UseHttps:$false
    $testMode = if (-not $IncludeTestToolkit) { "None" }
                elseif ($TestLibrariesOnly) { "Libraries only" }
                else { "Full test framework apps" }

    Write-BCProperty "Container"    $ContainerName
    Write-BCProperty "BC Version"   $bcVersion
    Write-BCProperty "Isolation"    $Isolation
    Write-BCProperty "Credentials"  "$($Credential.UserName) / ********"
    Write-BCProperty "Test Toolkit" $testMode
    Write-Host ""
    Write-BCProperty "Web Client"   $webclientUrl "Cyan"
    Write-BCProperty "SOAP"         "http://${ContainerName}:7047/BC/WS" "Cyan"
    Write-BCProperty "OData/API"    "http://${ContainerName}:7048/BC/api" "Cyan"
    Write-BCProperty "Dev Service"  "http://${ContainerName}:7049/BC" "Cyan"
    Write-Host ""
    Write-Host "    Quick commands:" -ForegroundColor Gray
    Write-Host "      Open browser     :  Start-Process `"$webclientUrl`"" -ForegroundColor White
    Write-Host "      Run tests        :  Invoke-BCDTests -ContainerName `"$ContainerName`"" -ForegroundColor White
    Write-Host "      Remove container :  Remove-BCDContainer -ContainerName `"$ContainerName`"" -ForegroundColor White
    Write-Host ""
}

function Remove-BCDContainer {
    <#
    .SYNOPSIS
        Removes one or more BC Docker containers via interactive selection.
    #>
    [CmdletBinding()]
    param([string]$ContainerName)

    if (-not (Assert-BcContainerHelper)) { return }

    if ($ContainerName) {
        Write-BCBanner "Remove Container"
        Remove-BcContainer -containerName $ContainerName
        Write-BCSuccess "Container '$ContainerName' removed."
        return
    }

    $selected = Select-BCContainer -Title "Select container(s) to remove" -AllowMultiple
    if (-not $selected) { return }

    Write-BCBanner "Remove Containers"
    foreach ($name in $selected) {
        Write-BCStep "DEL" "Removing '$name'..."
        Remove-BcContainer -containerName $name
        Write-BCSuccess "'$name' removed."
    }
}

function Start-BCDContainer {
    <#
    .SYNOPSIS
        Starts a stopped BC Docker container.
    #>
    [CmdletBinding()]
    param([string]$ContainerName)

    if (-not $ContainerName) {
        $ContainerName = Select-BCContainer -Title "Select container to start"
        if (-not $ContainerName) { return }
    }

    Write-BCStep "START" "Starting '$ContainerName'..."
    $prevEAP = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    $null = docker start $ContainerName 2>&1
    $ErrorActionPreference = $prevEAP
    if ($LASTEXITCODE -ne 0) {
        $msg = "Failed to start '$ContainerName'. Container may not exist."
        Write-BCError $msg
        return
    }
    Write-BCSuccess "Container '$ContainerName' started."
}

function Stop-BCDContainer {
    <#
    .SYNOPSIS
        Stops a running BC Docker container.
    #>
    [CmdletBinding()]
    param([string]$ContainerName)

    if (-not $ContainerName) {
        $ContainerName = Select-BCContainer -Title "Select container to stop"
        if (-not $ContainerName) { return }
    }

    Write-BCStep "STOP" "Stopping '$ContainerName'..."
    $prevEAP = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    $null = docker stop $ContainerName 2>&1
    $ErrorActionPreference = $prevEAP
    if ($LASTEXITCODE -ne 0) {
        $msg = "Failed to stop '$ContainerName'. Container may not exist or is not running."
        Write-BCError $msg
        return
    }
    Write-BCSuccess "Container '$ContainerName' stopped."
}

function Restart-BCDContainer {
    <#
    .SYNOPSIS
        Restarts a BC Docker container.
    #>
    [CmdletBinding()]
    param([string]$ContainerName)

    if (-not $ContainerName) {
        $ContainerName = Select-BCContainer -Title "Select container to restart"
        if (-not $ContainerName) { return }
    }

    Write-BCStep "RESTART" "Restarting '$ContainerName'..."
    $prevEAP = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    $null = docker restart $ContainerName 2>&1
    $ErrorActionPreference = $prevEAP
    if ($LASTEXITCODE -ne 0) {
        $msg = "Failed to restart '$ContainerName'. Container may not exist."
        Write-BCError $msg
        return
    }
    Write-BCSuccess "Container '$ContainerName' restarted."
}

function Get-BCDContainers {
    <#
    .SYNOPSIS
        Lists all BC Docker containers with their status.
    #>
    [CmdletBinding()]
    param()

    if (-not (Assert-BcContainerHelper)) { return }

    Write-BCBanner "BC Containers"

    $containers = Get-BcContainers
    if ($containers.Count -eq 0) {
        Write-BCInfo "No BC containers found."
        return
    }

    foreach ($name in $containers) {
        $inspect = docker inspect $name --format '{{.State.Status}}' 2>$null
        $statusColor = if ($inspect -eq "running") { "Green" } else { "DarkGray" }

        Write-Host "    " -NoNewline
        Write-Host $name.PadRight(25) -ForegroundColor White -NoNewline
        Write-Host $inspect -ForegroundColor $statusColor
    }
    Write-Host ""
}

function Get-BCDContainerInfo {
    <#
    .SYNOPSIS
        Shows detailed info about a BC container: version, endpoints, credentials.
    #>
    [CmdletBinding()]
    param([string]$ContainerName)

    if (-not (Assert-BcContainerHelper)) { return }

    if (-not $ContainerName) {
        $ContainerName = Select-BCContainer -Title "Select container for info"
        if (-not $ContainerName) { return }
    }

    $bcVersion   = Get-BcContainerNavVersion -containerOrImageName $ContainerName
    $webUrl      = Get-BCDockerWebClientUrl -ContainerName $ContainerName -UseHttps:$false
    $inspect     = docker inspect $ContainerName --format '{{.State.Status}}' 2>$null
    $statusColor = if ($inspect -eq "running") { "Green" } else { "Red" }

    Write-BCProperty "Container"    $ContainerName
    Write-BCProperty "Status"       $inspect $statusColor
    Write-BCProperty "BC Version"   $bcVersion
    Write-BCProperty "Web Client"   $webUrl "Cyan"
    Write-BCProperty "OData/API"    "http://${ContainerName}:7048/BC/api" "Cyan"
    Write-BCProperty "Dev Service"  "http://${ContainerName}:7049/BC" "Cyan"
    Write-Host ""
}

function Open-BCDWebClient {
    <#
    .SYNOPSIS
        Opens the BC Web Client in the default browser.
    #>
    [CmdletBinding()]
    param([string]$ContainerName)

    if (-not (Assert-BcContainerHelper)) { return }

    if (-not $ContainerName) {
        $ContainerName = Select-BCContainer -Title "Select container to open"
        if (-not $ContainerName) { return }
    }

    $url = Get-BCDockerWebClientUrl -ContainerName $ContainerName -UseHttps:$false
    Write-BCInfo "Opening $url"
    Start-Process $url
}
