# iRacing GTP Engineer — Plugin + Skill Installer
# Run from the directory containing this script

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$claudeDir = "$env:USERPROFILE\.claude"

Write-Host "`n=== iRacing GTP Engineer Installer ===" -ForegroundColor Cyan

# --- Install Skill ---
$skillDest = "$claudeDir\skills\iracing-gtp-engineer"
Write-Host "`nInstalling skill to: $skillDest" -ForegroundColor Yellow

if (Test-Path $skillDest) {
    Write-Host "  Backing up existing skill..." -ForegroundColor DarkYellow
    $backup = "$skillDest.backup.$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Move-Item $skillDest $backup
    Write-Host "  Backed up to: $backup"
}

New-Item -ItemType Directory -Path "$skillDest\references" -Force | Out-Null

Copy-Item "$scriptDir\skills\iracing-gtp-engineer\SKILL.md" "$skillDest\SKILL.md" -Force
Copy-Item "$scriptDir\skills\iracing-gtp-engineer\references\*" "$skillDest\references\" -Force

$refCount = (Get-ChildItem "$skillDest\references\*.md").Count
Write-Host "  SKILL.md + $refCount reference files installed" -ForegroundColor Green

# --- Install Plugin ---
$pluginDest = "$claudeDir\plugins\iracing-gtp-engineer"
Write-Host "`nInstalling plugin to: $pluginDest" -ForegroundColor Yellow

if (Test-Path $pluginDest) {
    Write-Host "  Backing up existing plugin..." -ForegroundColor DarkYellow
    $backup = "$pluginDest.backup.$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Move-Item $pluginDest $backup
}

New-Item -ItemType Directory -Path "$pluginDest\commands" -Force | Out-Null
New-Item -ItemType Directory -Path "$pluginDest\scripts" -Force | Out-Null
New-Item -ItemType Directory -Path "$pluginDest\skills\iracing-gtp-engineer\references" -Force | Out-Null

Copy-Item "$scriptDir\plugin.json" "$pluginDest\plugin.json" -Force
Copy-Item "$scriptDir\commands\*" "$pluginDest\commands\" -Force
Copy-Item "$scriptDir\scripts\*" "$pluginDest\scripts\" -Force
Copy-Item "$scriptDir\skills\iracing-gtp-engineer\SKILL.md" "$pluginDest\skills\iracing-gtp-engineer\SKILL.md" -Force
Copy-Item "$scriptDir\skills\iracing-gtp-engineer\references\*" "$pluginDest\skills\iracing-gtp-engineer\references\" -Force

Write-Host "  Plugin installed with commands: analyze-ibt, diagnose, setup-compare" -ForegroundColor Green

# --- Verify ---
Write-Host "`n=== Verification ===" -ForegroundColor Cyan

$checks = @(
    @{ Path = "$skillDest\SKILL.md"; Label = "Skill SKILL.md" },
    @{ Path = "$skillDest\references\per-car-quirks.md"; Label = "per-car-quirks.md" },
    @{ Path = "$skillDest\references\telemetry-channels.md"; Label = "telemetry-channels.md" },
    @{ Path = "$skillDest\references\ibt-parsing-guide.md"; Label = "ibt-parsing-guide.md" },
    @{ Path = "$pluginDest\plugin.json"; Label = "Plugin manifest" },
    @{ Path = "$pluginDest\commands\analyze-ibt.md"; Label = "analyze-ibt command" },
    @{ Path = "$pluginDest\scripts\parse_ibt.py"; Label = "IBT parser script" }
)

$allGood = $true
foreach ($check in $checks) {
    if (Test-Path $check.Path) {
        Write-Host "  [OK] $($check.Label)" -ForegroundColor Green
    } else {
        Write-Host "  [MISSING] $($check.Label)" -ForegroundColor Red
        $allGood = $false
    }
}

if ($allGood) {
    Write-Host "`nInstallation complete! Restart Claude to pick up the new skill + plugin." -ForegroundColor Green
    Write-Host "Commands available: /analyze-ibt, /diagnose, /setup-compare" -ForegroundColor Cyan
    Write-Host "Standalone parser: python `"$pluginDest\scripts\parse_ibt.py`" <file.ibt> --laps --setup`n" -ForegroundColor DarkCyan
} else {
    Write-Host "`nSome files are missing. Check the output above." -ForegroundColor Red
}
