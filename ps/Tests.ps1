function Invoke-BCDTests {
    <#
    .SYNOPSIS
        Runs AL tests inside a BC Docker container.

    .PARAMETER ContainerName
        Target container. Default: "bcsandbox"

    .PARAMETER TestCodeunitId
        Run a single test codeunit by ID. Omit to run all.

    .PARAMETER TestFunctionName
        Run a single test function. Requires -TestCodeunitId.

    .PARAMETER AppProjectFolder
        Path to an AL test app project. Compiles, publishes, and runs tests.

    .PARAMETER Credential
        Container credentials.

    .PARAMETER TestResultsFile
        Path for XUnit results XML. Default: ".\TestResults.xml"

    .PARAMETER ExtensionId
        Run tests from a specific extension only.

    .PARAMETER DisabledTests
        Array of hashtables to skip: @(@{ codeunitId = 134000; method = "TestToSkip" })
    #>
    [CmdletBinding()]
    param(
        [string]$ContainerName    = "bcsandbox",
        [int]$TestCodeunitId      = 0,
        [string]$TestFunctionName = "",
        [string]$AppProjectFolder = "",
        [PSCredential]$Credential,
        [string]$TestResultsFile  = ".\TestResults.xml",
        [string]$ExtensionId      = "",
        [hashtable[]]$DisabledTests = @()
    )

    if (-not (Assert-BcContainerHelper)) { return }

    if (-not $Credential) {
        $Credential = Get-BCCredential
    }

    Write-BCBanner "BC Test Runner"
    Write-BCProperty "Container" $ContainerName
    Write-BCProperty "Results"   $TestResultsFile

    if ($AppProjectFolder -and (Test-Path $AppProjectFolder)) {
        Write-BCStep "1/3" "Compiling test app from: $AppProjectFolder"
        $appFile = Compile-AppInBcContainer `
            -containerName $ContainerName `
            -appProjectFolder $AppProjectFolder `
            -credential $Credential `
            -UpdateSymbols

        Write-BCSuccess "Compiled: $appFile"

        Write-BCStep "2/3" "Publishing..."
        Publish-BcContainerApp `
            -containerName $ContainerName `
            -appFile $appFile `
            -credential $Credential `
            -install -sync `
            -syncMode ForceSync `
            -skipVerification `
            -useDevEndpoint

        Write-BCSuccess "Test app installed."

        if (-not $ExtensionId) {
            $appJson = Get-Content (Join-Path $AppProjectFolder "app.json") | ConvertFrom-Json
            $ExtensionId = $appJson.id
        }
    }
    else {
        Write-BCStep "1/3" "No test app folder — running installed tests."
    }

    Write-BCStep "3/3" "Running tests..."
    $runParams = @{
        containerName         = $ContainerName
        credential            = $Credential
        detailed              = $true
        returnTrueIfAllPassed = $true
    }

    if ($TestCodeunitId -gt 0)   { $runParams.testCodeunit = $TestCodeunitId }
    if ($TestFunctionName)       { $runParams.testFunction = $TestFunctionName }
    if ($ExtensionId)            { $runParams.extensionId = $ExtensionId }
    if ($DisabledTests.Count -gt 0) { $runParams.disabledTests = $DisabledTests }
    if ($TestResultsFile)        { $runParams.XUnitResultFileName = $TestResultsFile }

    $startTime  = Get-Date
    $allPassed  = Run-TestsInBcContainer @runParams
    $elapsed    = (Get-Date) - $startTime
    $elapsedStr = "{0:mm\:ss}" -f $elapsed

    if ($allPassed) {
        Write-BCBanner "ALL TESTS PASSED  ($elapsedStr)" "Green"
    }
    else {
        Write-BCBanner "SOME TESTS FAILED  ($elapsedStr)" "Red"
    }

    if ($TestResultsFile -and (Test-Path $TestResultsFile)) {
        [xml]$results = Get-Content $TestResultsFile
        $total = $passed = $failed = $skipped = 0

        foreach ($assembly in $results.assemblies.assembly) {
            $total   += [int]$assembly.total
            $passed  += [int]$assembly.passed
            $failed  += [int]$assembly.failed
            $skipped += [int]$assembly.skipped
        }

        Write-BCProperty "Total"   $total
        Write-BCProperty "Passed"  $passed "Green"
        Write-BCProperty "Failed"  $failed $(if ($failed -gt 0) { "Red" } else { "White" })
        Write-BCProperty "Skipped" $skipped "Yellow"

        if ($failed -gt 0) {
            Write-Host ""
            Write-BCError "Failed tests:"
            foreach ($assembly in $results.assemblies.assembly) {
                foreach ($collection in $assembly.collection) {
                    foreach ($test in $collection.test) {
                        if ($test.result -eq "Fail") {
                            Write-Host "      - $($test.name)" -ForegroundColor Red
                            if ($test.failure.message) {
                                Write-Host "        $($test.failure.message.'#text')" -ForegroundColor DarkRed
                            }
                        }
                    }
                }
            }
        }
    }

    return $allPassed
}
