function Get-BCDApps {
    <#
    .SYNOPSIS
        Lists all apps installed in a BC container. Optionally filters by publisher.

    .PARAMETER ContainerName
        Target container. Prompts with picker if omitted.

    .PARAMETER Publisher
        Filter by publisher name (e.g. "Microsoft", "Contoso").

    .PARAMETER GridView
        Show results in Out-GridView instead of console.
    #>
    [CmdletBinding()]
    param(
        [string]$ContainerName,
        [string]$Publisher,
        [switch]$GridView
    )

    if (-not (Assert-BcContainerHelper)) { return }

    if (-not $ContainerName) {
        $ContainerName = Select-BCContainer -Title "Select container to list apps"
        if (-not $ContainerName) { return }
    }

    $apps = Get-BcContainerAppInfo -containerName $ContainerName -tenant default -tenantSpecificProperties

    if ($Publisher) {
        $apps = $apps | Where-Object { $_.Publisher -eq $Publisher }
    }

    $result = foreach ($app in $apps) {
        [PSCustomObject]@{
            Name        = $app.Name
            Publisher   = $app.Publisher
            Version     = $app.Version
            Scope       = $app.Scope
            IsInstalled = $app.IsInstalled
            SyncState   = $app.SyncState
        }
    }

    if ($GridView) {
        $result | Sort-Object Publisher, Name | Out-GridView -Title "Apps in $ContainerName"
    }
    else {
        $result | Sort-Object Publisher, Name | Format-Table -AutoSize
    }
}

function Install-BCDApp {
    <#
    .SYNOPSIS
        Publishes and installs .app file(s) into a BC container.

    .PARAMETER ContainerName
        Target container.

    .PARAMETER AppFile
        Path(s) to .app file(s). Opens file picker if omitted.

    .PARAMETER Credential
        Container credentials.

    .PARAMETER UseDevEndpoint
        Publish via dev endpoint. Default: $true
    #>
    [CmdletBinding()]
    param(
        [string]$ContainerName,
        [string[]]$AppFile,
        [PSCredential]$Credential,
        [bool]$UseDevEndpoint = $true
    )

    if (-not (Assert-BcContainerHelper)) { return }

    if (-not $ContainerName) {
        $ContainerName = Select-BCContainer -Title "Select container to install app"
        if (-not $ContainerName) { return }
    }

    if (-not $AppFile) {
        $AppFile = Select-AppFiles -Title "Select .app file(s) to install"
        if (-not $AppFile) { return }
    }

    if (-not $Credential) {
        $Credential = Get-BCCredential
    }

    Write-BCBanner "Install App(s)"

    foreach ($file in $AppFile) {
        $fileName = Split-Path $file -Leaf
        Write-BCStep "PUB" "Publishing $fileName..."

        $params = @{
            containerName    = $ContainerName
            appFile          = $file
            credential       = $Credential
            install          = $true
            sync             = $true
            syncMode         = "ForceSync"
            skipVerification = $true
        }

        if ($UseDevEndpoint) {
            $params.useDevEndpoint = $true
        }

        Publish-BcContainerApp @params
        Write-BCSuccess "$fileName installed."
    }
}

function Uninstall-BCDApp {
    <#
    .SYNOPSIS
        Uninstalls selected apps from a BC container, resolving dependency order.

    .PARAMETER ContainerName
        Target container.

    .PARAMETER IncludeMicrosoft
        Show Microsoft apps in the selection list. Default: $false
    #>
    [CmdletBinding()]
    param(
        [string]$ContainerName,
        [switch]$IncludeMicrosoft
    )

    if (-not (Assert-BcContainerHelper)) { return }

    if (-not $ContainerName) {
        $ContainerName = Select-BCContainer -Title "Select container to uninstall apps from"
        if (-not $ContainerName) { return }
    }

    $allApps = Get-BcContainerAppInfo -containerName $ContainerName -tenant default -tenantSpecificProperties

    $installable = $allApps | Where-Object { $_.IsInstalled }
    if (-not $IncludeMicrosoft) {
        $installable = $installable | Where-Object { $_.Publisher -ne "Microsoft" }
    }

    if ($installable.Count -eq 0) {
        Write-BCInfo "No uninstallable apps found."
        return
    }

    $selected = $installable |
        Select-Object Name, Publisher, Version |
        Sort-Object Name |
        Out-GridView -PassThru -Title "Select app(s) to uninstall"

    if (-not $selected) { return }

    Write-BCBanner "Uninstall Apps"

    $sorted = Get-BcContainerAppInfo -containerName $ContainerName -tenant default -tenantSpecificProperties -sort DependenciesLast

    $toRemove = @{}
    foreach ($app in $selected) {
        $key = "$($app.Name)|$($app.Publisher)"
        $toRemove[$key] = $true
        Add-BCDDependentApps -AppName $app.Name -AppPublisher $app.Publisher -Map $toRemove -AllApps $allApps
    }

    $ordered = $sorted | Where-Object {
        $toRemove.ContainsKey("$($_.Name)|$($_.Publisher)")
    }

    foreach ($app in $ordered) {
        Write-BCStep "DEL" "Uninstalling $($app.Name) v$($app.Version)..."
        try {
            UnInstall-BcContainerApp -name $app.Name -containerName $ContainerName `
                -publisher $app.Publisher -version $app.Version -force -ErrorAction Stop
            Write-BCSuccess "$($app.Name) uninstalled."
        }
        catch {
            Write-BCError "Failed: $_"
        }
    }
}

function Add-BCDDependentApps {
    param(
        [string]$AppName,
        [string]$AppPublisher,
        [hashtable]$Map,
        $AllApps
    )

    $AllApps | Where-Object { $_.IsInstalled -and $_.Dependencies } | ForEach-Object {
        $dependent = $_
        $_.Dependencies | ForEach-Object {
            $parts = $_ -split ','
            if ($parts.Count -ge 2) {
                $depName = $parts[0].Trim()
                $depPub  = $parts[1].Trim()
                if ($depName -eq $AppName -and $depPub -eq $AppPublisher) {
                    $key = "$($dependent.Name)|$($dependent.Publisher)"
                    if (-not $Map.ContainsKey($key)) {
                        $Map[$key] = $true
                        Add-BCDDependentApps -AppName $dependent.Name -AppPublisher $dependent.Publisher -Map $Map -AllApps $AllApps
                    }
                }
            }
        }
    }
}

function Publish-BCDProject {
    <#
    .SYNOPSIS
        Compiles and publishes an AL project into a BC container.

    .PARAMETER ContainerName
        Target container.

    .PARAMETER ProjectFolder
        Path to the AL project folder. Opens folder picker if omitted.

    .PARAMETER Credential
        Container credentials.
    #>
    [CmdletBinding()]
    param(
        [string]$ContainerName,
        [string]$ProjectFolder,
        [PSCredential]$Credential
    )

    if (-not (Assert-BcContainerHelper)) { return }

    if (-not $ContainerName) {
        $ContainerName = Select-BCContainer -Title "Select container to publish to"
        if (-not $ContainerName) { return }
    }

    if (-not $ProjectFolder) {
        $ProjectFolder = Select-Folder -Description "Select AL project folder"
        if (-not $ProjectFolder) { return }
    }

    if (-not $Credential) {
        $Credential = Get-BCCredential
    }

    Write-BCBanner "Compile & Publish"
    Write-BCStep "1/2" "Compiling $ProjectFolder..."

    $appFile = Compile-AppInBcContainer `
        -containerName $ContainerName `
        -appProjectFolder $ProjectFolder `
        -credential $Credential `
        -UpdateSymbols

    Write-BCSuccess "Compiled: $appFile"

    Write-BCStep "2/2" "Publishing..."
    Publish-BcContainerApp `
        -containerName $ContainerName `
        -appFile $appFile `
        -credential $Credential `
        -install -sync `
        -syncMode ForceSync `
        -skipVerification `
        -useDevEndpoint

    Write-BCSuccess "Published and installed."
}

function Import-BCDTestToolkit {
    <#
    .SYNOPSIS
        Imports the BC Test Toolkit into a container.

    .PARAMETER ContainerName
        Target container.

    .PARAMETER Credential
        Container credentials.

    .PARAMETER LibrariesOnly
        Install only test libraries (no Microsoft test codeunits). Default: $true
    #>
    [CmdletBinding()]
    param(
        [string]$ContainerName,
        [PSCredential]$Credential,
        [bool]$LibrariesOnly = $true
    )

    if (-not (Assert-BcContainerHelper)) { return }

    if (-not $ContainerName) {
        $ContainerName = Select-BCContainer -Title "Select container for test toolkit"
        if (-not $ContainerName) { return }
    }

    if (-not $Credential) {
        $Credential = Get-BCCredential
    }

    $mode = if ($LibrariesOnly) { "libraries only" } else { "full framework" }
    Write-BCBanner "Import Test Toolkit ($mode)"

    Import-TestToolkitToBcContainer `
        -containerName $ContainerName `
        -credential $Credential `
        -includeTestLibrariesOnly:$LibrariesOnly

    Write-BCSuccess "Test Toolkit imported."
}

function Import-BCDLicense {
    <#
    .SYNOPSIS
        Imports a license file into a BC container.

    .PARAMETER ContainerName
        Target container.

    .PARAMETER LicenseFile
        Path or URL to the license file. Opens file picker if omitted.
    #>
    [CmdletBinding()]
    param(
        [string]$ContainerName,
        [string]$LicenseFile
    )

    if (-not (Assert-BcContainerHelper)) { return }

    if (-not $ContainerName) {
        $ContainerName = Select-BCContainer -Title "Select container for license"
        if (-not $ContainerName) { return }
    }

    if (-not $LicenseFile) {
        Add-Type -AssemblyName System.Windows.Forms
        $dialog = New-Object System.Windows.Forms.OpenFileDialog
        $dialog.Filter = "BC License files (*.bclicense;*.flf)|*.bclicense;*.flf|All files (*.*)|*.*"
        $dialog.Title = "Select license file"
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
            $LicenseFile = $dialog.FileName
        }
        else { return }
    }

    Write-BCBanner "Import License"
    Import-BcContainerLicense -licenseFile $LicenseFile -containerName $ContainerName -restart
    Write-BCSuccess "License imported and service restarted."
}
