function Write-BCBanner {
    param([string]$Title, [string]$Color = "Cyan")

    $line = "=" * 50
    Write-Host ""
    Write-Host "  $line" -ForegroundColor $Color
    Write-Host "    $Title" -ForegroundColor $Color
    Write-Host "  $line" -ForegroundColor $Color
    Write-Host ""
}

function Write-BCStep {
    param([string]$Step, [string]$Message)
    Write-Host "  [$Step] $Message" -ForegroundColor Yellow
}

function Write-BCInfo {
    param([string]$Message)
    Write-Host "    $Message" -ForegroundColor Gray
}

function Write-BCSuccess {
    param([string]$Message)
    Write-Host "    $Message" -ForegroundColor Green
}

function Write-BCError {
    param([string]$Message)
    Write-Host "    $Message" -ForegroundColor Red
}

function Write-BCProperty {
    param([string]$Label, [string]$Value, [string]$ValueColor = "White")
    Write-Host "    $($Label.PadRight(18)): " -ForegroundColor Gray -NoNewline
    Write-Host $Value -ForegroundColor $ValueColor
}

function Assert-DockerReady {
    try {
        $null = docker version --format '{{.Server.Version}}' 2>$null
    }
    catch {
        Write-BCError "Docker is not running or not installed."
        Write-BCError "Install Docker Desktop and switch to Windows containers."
        return $false
    }

    $osType = docker info --format '{{.OSType}}' 2>$null
    if ($osType -ne "windows") {
        Write-BCError "Docker is in Linux containers mode."
        Write-BCInfo "Right-click Docker Desktop tray icon -> 'Switch to Windows containers...'"
        return $false
    }
    return $true
}

function Assert-BcContainerHelper {
    $module = Get-Module -ListAvailable -Name BcContainerHelper |
              Sort-Object Version -Descending |
              Select-Object -First 1

    if (-not $module) {
        Write-BCStep "INIT" "Installing BcContainerHelper..."
        Install-Module BcContainerHelper -Force -AllowClobber -Scope CurrentUser
    }

    Import-Module BcContainerHelper -DisableNameChecking -ErrorAction Stop
    return $true
}

function Get-BCDockerWebClientUrl {
    <#
    .SYNOPSIS
        Resolves Web Client URL for a BC container (BcContainerHelper has no Get-BcContainerUrl in recent versions).
    #>
    param(
        [Parameter(Mandatory)][string]$ContainerName,
        [switch]$UseHttps
    )
    try {
        $cfg = Get-BcContainerServerConfiguration -ContainerName $ContainerName -ErrorAction SilentlyContinue
        if ($null -ne $cfg -and $cfg.PublicWebBaseUrl -and -not [string]::IsNullOrWhiteSpace([string]$cfg.PublicWebBaseUrl)) {
            return ([string]$cfg.PublicWebBaseUrl).TrimEnd('/')
        }
    }
    catch { }
    $scheme = if ($UseHttps) { 'https' } else { 'http' }
    return "$($scheme)://$ContainerName/BC"
}

function Select-BCContainer {
    [CmdletBinding()]
    param(
        [string]$Title = "Select a container",
        [switch]$AllowMultiple
    )

    if (-not (Assert-BcContainerHelper)) { return $null }

    $containers = Get-BcContainers
    if ($containers.Count -eq 0) {
        Write-BCError "No BC containers found."
        return $null
    }

    if ($AllowMultiple) {
        return $containers | Out-GridView -PassThru -Title $Title
    }
    else {
        $selected = $containers | Out-GridView -PassThru -Title $Title
        if ($selected -is [array]) {
            Write-BCError "Please select only one container."
            return $null
        }
        return $selected
    }
}

function Get-BCCredential {
    param(
        [string]$UserName = "admin",
        [string]$Password = "P@ssw0rd!"
    )
    $secure = ConvertTo-SecureString $Password -AsPlainText -Force
    return [PSCredential]::new($UserName, $secure)
}

function Select-AppFiles {
    param([string]$Title = "Select .app file(s)")

    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Filter = "AL App files (*.app)|*.app|All files (*.*)|*.*"
    $dialog.Multiselect = $true
    $dialog.Title = $Title

    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        return $dialog.FileNames
    }
    return $null
}

function Add-DarkScrollStyle {
    param([System.Windows.Window]$Window)

    $rdXaml = @"
<ResourceDictionary xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
                    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">
    <Style TargetType="{x:Type ScrollBar}">
        <Setter Property="Background" Value="Transparent"/>
        <Setter Property="Width" Value="10"/>
        <Setter Property="MinWidth" Value="10"/>
        <Setter Property="Template">
            <Setter.Value>
                <ControlTemplate TargetType="{x:Type ScrollBar}">
                    <Grid Background="Transparent" Width="10">
                        <Track x:Name="PART_Track" IsDirectionReversed="True">
                            <Track.DecreaseRepeatButton>
                                <RepeatButton Command="ScrollBar.PageUpCommand" Focusable="False">
                                    <RepeatButton.Template>
                                        <ControlTemplate><Border Background="Transparent"/></ControlTemplate>
                                    </RepeatButton.Template>
                                </RepeatButton>
                            </Track.DecreaseRepeatButton>
                            <Track.Thumb>
                                <Thumb x:Name="thumb">
                                    <Thumb.Template>
                                        <ControlTemplate TargetType="{x:Type Thumb}">
                                            <Border x:Name="tb" Background="#404040" CornerRadius="5" Margin="2,0">
                                                <Border.Triggers>
                                                    <EventTrigger RoutedEvent="MouseEnter">
                                                        <BeginStoryboard>
                                                            <Storyboard>
                                                                <ColorAnimation Storyboard.TargetName="tb"
                                                                    Storyboard.TargetProperty="(Border.Background).(SolidColorBrush.Color)"
                                                                    To="#686868" Duration="0:0:0.15"/>
                                                            </Storyboard>
                                                        </BeginStoryboard>
                                                    </EventTrigger>
                                                    <EventTrigger RoutedEvent="MouseLeave">
                                                        <BeginStoryboard>
                                                            <Storyboard>
                                                                <ColorAnimation Storyboard.TargetName="tb"
                                                                    Storyboard.TargetProperty="(Border.Background).(SolidColorBrush.Color)"
                                                                    To="#404040" Duration="0:0:0.3"/>
                                                            </Storyboard>
                                                        </BeginStoryboard>
                                                    </EventTrigger>
                                                </Border.Triggers>
                                            </Border>
                                        </ControlTemplate>
                                    </Thumb.Template>
                                </Thumb>
                            </Track.Thumb>
                            <Track.IncreaseRepeatButton>
                                <RepeatButton Command="ScrollBar.PageDownCommand" Focusable="False">
                                    <RepeatButton.Template>
                                        <ControlTemplate><Border Background="Transparent"/></ControlTemplate>
                                    </RepeatButton.Template>
                                </RepeatButton>
                            </Track.IncreaseRepeatButton>
                        </Track>
                    </Grid>
                </ControlTemplate>
            </Setter.Value>
        </Setter>
    </Style>
</ResourceDictionary>
"@
    $rd = [System.Windows.Markup.XamlReader]::Load(
        [System.Xml.XmlReader]::Create([System.IO.StringReader]::new($rdXaml))
    )
    $Window.Resources.MergedDictionaries.Add($rd)
}

function Select-Folder {
    param([string]$Description = "Select folder")

    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = $Description

    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        return $dialog.SelectedPath
    }
    return $null
}

function Show-BCDContainerForm {
    Add-Type -AssemblyName PresentationFramework

    $bc = [System.Windows.Media.BrushConverter]::new()
    $bgWindow = $bc.ConvertFrom("#252526")
    $bgField  = $bc.ConvertFrom("#3c3c3c")
    $fgText   = $bc.ConvertFrom("#cccccc")
    $fgValue  = $bc.ConvertFrom("#e0e0e0")
    $fgDim    = $bc.ConvertFrom("#5a5a5a")
    $fgHint   = $bc.ConvertFrom("#666666")
    $brField  = $bc.ConvertFrom("#4a4a4a")
    $brFocus  = $bc.ConvertFrom("#0078d4")

    $window = New-Object System.Windows.Window
    $window.Title = "BCDocker"
    $window.Width = 580
    $window.Height = 680
    $window.WindowStartupLocation = "CenterScreen"
    $window.ResizeMode = "NoResize"
    $window.Background = $bgWindow
    $window.FontFamily = New-Object System.Windows.Media.FontFamily("Segoe UI")
    $window.FontSize = 13

    $root = New-Object System.Windows.Controls.DockPanel
    $root.Margin = [System.Windows.Thickness]::new(32, 24, 32, 24)

    # Title
    $titlePanel = New-Object System.Windows.Controls.StackPanel
    [System.Windows.Controls.DockPanel]::SetDock($titlePanel, "Top")
    $titlePanel.Margin = [System.Windows.Thickness]::new(0, 0, 0, 8)
    $t1 = New-Object System.Windows.Controls.TextBlock; $t1.Text = "Create Container"; $t1.FontSize = 20; $t1.FontWeight = "SemiBold"; $t1.Foreground = $fgValue
    $t2 = New-Object System.Windows.Controls.TextBlock; $t2.Text = "Configure a new Business Central Docker sandbox"; $t2.FontSize = 11.5; $t2.Foreground = $fgDim; $t2.Margin = [System.Windows.Thickness]::new(0,3,0,0)
    $titlePanel.Children.Add($t1) | Out-Null
    $titlePanel.Children.Add($t2) | Out-Null
    $root.Children.Add($titlePanel) | Out-Null

    # Buttons
    $btnPanel = New-Object System.Windows.Controls.StackPanel
    $btnPanel.Orientation = "Horizontal"
    $btnPanel.HorizontalAlignment = "Right"
    $btnPanel.Margin = [System.Windows.Thickness]::new(0, 16, 0, 0)
    [System.Windows.Controls.DockPanel]::SetDock($btnPanel, "Bottom")
    $btnCancel = New-Object System.Windows.Controls.Button; $btnCancel.Content = "Cancel"; $btnCancel.Padding = [System.Windows.Thickness]::new(22,7,22,7)
    $btnCancel.Background = $bc.ConvertFrom("#333333"); $btnCancel.Foreground = $fgText; $btnCancel.BorderBrush = $bc.ConvertFrom("#505050"); $btnCancel.Margin = [System.Windows.Thickness]::new(0,0,10,0)
    $btnCreate = New-Object System.Windows.Controls.Button; $btnCreate.Content = "Create Container"; $btnCreate.Padding = [System.Windows.Thickness]::new(22,7,22,7)
    $btnCreate.Background = $brFocus; $btnCreate.Foreground = [System.Windows.Media.Brushes]::White; $btnCreate.BorderThickness = [System.Windows.Thickness]::new(0); $btnCreate.FontWeight = "SemiBold"; $btnCreate.IsDefault = $true
    $btnPanel.Children.Add($btnCancel) | Out-Null; $btnPanel.Children.Add($btnCreate) | Out-Null
    $root.Children.Add($btnPanel) | Out-Null

    # Form body
    $scroll = New-Object System.Windows.Controls.ScrollViewer; $scroll.VerticalScrollBarVisibility = "Auto"
    $formBody = New-Object System.Windows.Controls.StackPanel

    $addSection = {
        param($text, $topMargin)
        $tb = New-Object System.Windows.Controls.TextBlock; $tb.Text = $text; $tb.FontSize = 10.5; $tb.FontWeight = "SemiBold"; $tb.Foreground = $fgDim
        $tb.Margin = [System.Windows.Thickness]::new(0, $topMargin, 0, 8)
        $formBody.Children.Add($tb) | Out-Null
    }

    $fields = @{}
    $addField = {
        param($label, $key, $default, $hint)
        $row = New-Object System.Windows.Controls.DockPanel; $row.Margin = [System.Windows.Thickness]::new(0,0,0,2)
        $lbl = New-Object System.Windows.Controls.TextBlock; $lbl.Text = $label; $lbl.Width = 120; $lbl.Foreground = $fgText; $lbl.VerticalAlignment = "Center"
        $tb = New-Object System.Windows.Controls.TextBox; $tb.Text = $default; $tb.Background = $bgField; $tb.Foreground = $fgValue
        $tb.BorderBrush = $brField; $tb.Padding = [System.Windows.Thickness]::new(8,6,8,6); $tb.CaretBrush = $fgValue
        $tb.Add_GotFocus({ $this.BorderBrush = [System.Windows.Media.BrushConverter]::new().ConvertFrom("#0078d4") })
        $tb.Add_LostFocus({ $this.BorderBrush = [System.Windows.Media.BrushConverter]::new().ConvertFrom("#4a4a4a") })
        [System.Windows.Controls.DockPanel]::SetDock($lbl, "Left")
        $row.Children.Add($lbl) | Out-Null; $row.Children.Add($tb) | Out-Null
        $formBody.Children.Add($row) | Out-Null
        if ($hint) {
            $h = New-Object System.Windows.Controls.TextBlock; $h.Text = $hint; $h.FontSize = 11; $h.Foreground = $fgHint
            $h.Margin = [System.Windows.Thickness]::new(120, 0, 0, 6)
            $formBody.Children.Add($h) | Out-Null
        } else {
            $sp = New-Object System.Windows.Controls.Border; $sp.Height = 4
            $formBody.Children.Add($sp) | Out-Null
        }
        $fields[$key] = $tb
    }

    # --- Build form ---
    & $addSection "CONTAINER" 0
    & $addField "Name" "ContainerName" "bcsandbox" $null
    & $addField "Version" "Version" "sandbox" "sandbox, onprem, or specific version (e.g. 26.0)"
    & $addField "Country" "Country" "us" "us, w1, gb, nl, de, dk, fr, it, es, ca, au"

    & $addSection "CREDENTIALS" 12
    & $addField "Username" "UserName" "admin" $null
    & $addField "Password" "Password" "P@ssw0rd!" $null

    & $addSection "CONFIGURATION" 12
    & $addField "Memory" "MemoryLimit" "8G" "4G, 8G, 12G, or 16G"
    & $addField "Isolation" "Isolation" "hyperv" "hyperv (Win10/11) or process (Server)"
    & $addField "Test Toolkit" "TestToolkit" "Libraries" "None, Libraries (faster), or Full (all MS tests)"

    & $addSection "OPTIONS" 12

    $chkCDN = New-Object System.Windows.Controls.CheckBox; $chkCDN.Foreground = $fgText
    $chkCDN.Content = "  Bypass CDN (blob storage - fixes Win11 25H2 failures)"; $chkCDN.Margin = [System.Windows.Thickness]::new(0,0,0,10)
    $formBody.Children.Add($chkCDN) | Out-Null

    $licRow = New-Object System.Windows.Controls.DockPanel; $licRow.Margin = [System.Windows.Thickness]::new(0,0,0,6)
    $licLbl = New-Object System.Windows.Controls.TextBlock; $licLbl.Text = "License File"; $licLbl.Width = 120; $licLbl.Foreground = $fgText; $licLbl.VerticalAlignment = "Center"
    $licBrowse = New-Object System.Windows.Controls.Button; $licBrowse.Content = "Browse"; $licBrowse.Padding = [System.Windows.Thickness]::new(10,4,10,4)
    $licBrowse.Background = $bc.ConvertFrom("#333333"); $licBrowse.Foreground = $fgText; $licBrowse.BorderBrush = $bc.ConvertFrom("#505050"); $licBrowse.Width = 70
    $licTb = New-Object System.Windows.Controls.TextBox; $licTb.Background = $bgField; $licTb.Foreground = $fgValue; $licTb.BorderBrush = $brField
    $licTb.Padding = [System.Windows.Thickness]::new(8,6,8,6); $licTb.CaretBrush = $fgValue; $licTb.Margin = [System.Windows.Thickness]::new(0,0,6,0)
    [System.Windows.Controls.DockPanel]::SetDock($licLbl, "Left")
    [System.Windows.Controls.DockPanel]::SetDock($licBrowse, "Right")
    $licRow.Children.Add($licLbl) | Out-Null; $licRow.Children.Add($licBrowse) | Out-Null; $licRow.Children.Add($licTb) | Out-Null
    $formBody.Children.Add($licRow) | Out-Null
    $licHint = New-Object System.Windows.Controls.TextBlock; $licHint.Text = "Optional - path or URL to .bclicense / .flf"; $licHint.FontSize = 11; $licHint.Foreground = $fgHint
    $licHint.Margin = [System.Windows.Thickness]::new(120, 0, 0, 0)
    $formBody.Children.Add($licHint) | Out-Null

    $scroll.Content = $formBody
    $root.Children.Add($scroll) | Out-Null
    $window.Content = $root
    Add-DarkScrollStyle -Window $window

    $script:formResult = $null

    $licBrowse.Add_Click({
        Add-Type -AssemblyName System.Windows.Forms
        $dlg = New-Object System.Windows.Forms.OpenFileDialog
        $dlg.Filter = "BC License (*.bclicense;*.flf)|*.bclicense;*.flf|All files (*.*)|*.*"
        if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $licTb.Text = $dlg.FileName }
    })

    $btnCreate.Add_Click({
        if ([string]::IsNullOrWhiteSpace($fields["ContainerName"].Text)) {
            [System.Windows.MessageBox]::Show("Container name is required.", "Validation", "OK", "Warning"); return
        }
        $script:formResult = @{
            ContainerName = $fields["ContainerName"].Text.Trim()
            Version       = $fields["Version"].Text.Trim()
            Country       = $fields["Country"].Text.Trim()
            UserName      = $fields["UserName"].Text.Trim()
            Password      = $fields["Password"].Text
            MemoryLimit   = $fields["MemoryLimit"].Text.Trim()
            Isolation     = $fields["Isolation"].Text.Trim()
            TestToolkit   = $fields["TestToolkit"].Text.Trim()
            BypassCDN     = $chkCDN.IsChecked
            LicenseFile   = $licTb.Text.Trim()
        }
        $window.Close()
    })
    $btnCancel.Add_Click({ $window.Close() })

    $null = $window.ShowDialog()
    return $script:formResult
}

function Show-BCDMainMenu {
    Add-Type -AssemblyName PresentationFramework

    $menuItems = @(
        @{ Tag = "create";    Icon = [char]0xE710; Label = "Create new container" }
        @{ Tag = "list";      Icon = [char]0xE8FD; Label = "List containers" }
        @{ Tag = "info";      Icon = [char]0xE946; Label = "Container info" }
        @{ Tag = "start";     Icon = [char]0xE768; Label = "Start container" }
        @{ Tag = "stop";      Icon = [char]0xE71A; Label = "Stop container" }
        @{ Tag = "restart";   Icon = [char]0xE72C; Label = "Restart container" }
        @{ Tag = "remove";    Icon = [char]0xE74D; Label = "Remove container" }
        @{ Tag = "webclient"; Icon = [char]0xE774; Label = "Open Web Client" }
        @{ Tag = "_sep1" }
        @{ Tag = "apps";      Icon = [char]0xE8F1; Label = "List apps" }
        @{ Tag = "install";   Icon = [char]0xE8E5; Label = "Install .app file" }
        @{ Tag = "uninstall"; Icon = [char]0xE738; Label = "Uninstall app" }
        @{ Tag = "publish";   Icon = [char]0xE74E; Label = "Compile and publish" }
        @{ Tag = "_sep2" }
        @{ Tag = "toolkit";   Icon = [char]0xE9D5; Label = "Import Test Toolkit" }
        @{ Tag = "license";   Icon = [char]0xEB95; Label = "Import license" }
        @{ Tag = "tests";     Icon = [char]0xE9D9; Label = "Run tests" }
    )

    $xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="BCDocker" Width="400" Height="580"
        WindowStartupLocation="CenterScreen" ResizeMode="NoResize"
        Background="#252526" FontFamily="Segoe UI">
    <DockPanel Margin="24,22,24,22">
        <StackPanel DockPanel.Dock="Top" Margin="0,0,0,16">
            <TextBlock Text="BCDocker" FontSize="20" FontWeight="SemiBold" Foreground="#cccccc"/>
            <TextBlock Text="Business Central Container Management" FontSize="11.5" Foreground="#555555" Margin="0,3,0,0"/>
        </StackPanel>
        <ScrollViewer VerticalScrollBarVisibility="Auto" Focusable="False">
            <StackPanel x:Name="spMenu"/>
        </ScrollViewer>
    </DockPanel>
</Window>
"@

    $reader = [System.Xml.XmlReader]::Create([System.IO.StringReader]::new($xaml))
    $window = [System.Windows.Markup.XamlReader]::Load($reader)
    $spMenu = $window.FindName("spMenu")
    Add-DarkScrollStyle -Window $window

    $bc = [System.Windows.Media.BrushConverter]::new()

    # Custom button template that removes all default Windows chrome
    $templateXaml = @"
<ControlTemplate xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
                 TargetType="Button">
    <Border Background="{TemplateBinding Background}"
            BorderBrush="{TemplateBinding BorderBrush}"
            BorderThickness="{TemplateBinding BorderThickness}"
            Padding="{TemplateBinding Padding}"
            SnapsToDevicePixels="True">
        <ContentPresenter HorizontalAlignment="{TemplateBinding HorizontalContentAlignment}"
                          VerticalAlignment="{TemplateBinding VerticalContentAlignment}"/>
    </Border>
</ControlTemplate>
"@
    $templateReader = [System.Xml.XmlReader]::Create([System.IO.StringReader]::new($templateXaml))
    $btnTemplate = [System.Windows.Markup.XamlReader]::Load($templateReader)

    $script:menuChoice = $null

    $sections = @("CONTAINERS", "APPS", "TESTS AND LICENSE")
    $sectionIdx = 0

    foreach ($item in $menuItems) {
        if ($item.Tag.StartsWith("_sep")) {
            $sectionIdx++
            continue
        }

        if (($sectionIdx -eq 0 -and $item.Tag -eq "create") -or
            ($sectionIdx -eq 1 -and $item.Tag -eq "apps") -or
            ($sectionIdx -eq 2 -and $item.Tag -eq "toolkit")) {

            $header = New-Object System.Windows.Controls.TextBlock
            $header.Text = $sections[$sectionIdx]
            $header.FontSize = 10.5
            $header.FontWeight = "SemiBold"
            $header.Foreground = $bc.ConvertFrom("#5a5a5a")
            $header.Margin = [System.Windows.Thickness]::new(2, $(if ($sectionIdx -eq 0) { 0 } else { 16 }), 0, 6)
            $spMenu.Children.Add($header) | Out-Null
        }

        $btn = New-Object System.Windows.Controls.Button
        $btn.Tag = $item.Tag
        $btn.Template = $btnTemplate
        $btn.Background = $bc.ConvertFrom("#2d2d2d")
        $btn.BorderBrush = $bc.ConvertFrom("#2d2d2d")
        $btn.BorderThickness = [System.Windows.Thickness]::new(1)
        $btn.HorizontalContentAlignment = "Left"
        $btn.Padding = [System.Windows.Thickness]::new(10, 8, 10, 8)
        $btn.Margin = [System.Windows.Thickness]::new(0, 1, 0, 1)
        $btn.Cursor = [System.Windows.Input.Cursors]::Hand
        $btn.Focusable = $false

        $sp = New-Object System.Windows.Controls.StackPanel
        $sp.Orientation = "Horizontal"

        $iconBlock = New-Object System.Windows.Controls.TextBlock
        $iconBlock.Text = [string]$item.Icon
        $iconBlock.FontFamily = New-Object System.Windows.Media.FontFamily("Segoe MDL2 Assets")
        $iconBlock.FontSize = 14
        $iconBlock.Foreground = $bc.ConvertFrom("#858585")
        $iconBlock.VerticalAlignment = "Center"
        $iconBlock.Width = 24

        $labelBlock = New-Object System.Windows.Controls.TextBlock
        $labelBlock.Text = $item.Label
        $labelBlock.FontSize = 13
        $labelBlock.Foreground = $bc.ConvertFrom("#cccccc")
        $labelBlock.VerticalAlignment = "Center"

        $sp.Children.Add($iconBlock) | Out-Null
        $sp.Children.Add($labelBlock) | Out-Null
        $btn.Content = $sp

        $btn.Add_MouseEnter({
            $this.Background = [System.Windows.Media.BrushConverter]::new().ConvertFrom("#37373d")
            $this.BorderBrush = [System.Windows.Media.BrushConverter]::new().ConvertFrom("#37373d")
        })
        $btn.Add_MouseLeave({
            $this.Background = [System.Windows.Media.BrushConverter]::new().ConvertFrom("#2d2d2d")
            $this.BorderBrush = [System.Windows.Media.BrushConverter]::new().ConvertFrom("#2d2d2d")
        })
        $btn.Add_Click({
            $script:menuChoice = $this.Tag
            $window.Close()
        })

        $spMenu.Children.Add($btn) | Out-Null
    }

    $null = $window.ShowDialog()
    return $script:menuChoice
}
