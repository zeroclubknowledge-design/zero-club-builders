# Zero Club - git diagnosis. Run this, then paste the whole output back.

$Repo = "C:\Users\user\Downloads\zero-club-builders-main"

Write-Host "=============================================="
Write-Host "1. Where PowerShell currently is:"
Get-Location

Write-Host ""
Write-Host "2. Which git is being used:"
Get-Command git | Select-Object -ExpandProperty Source
git --version

Write-Host ""
Write-Host "3. Does the repo folder exist?"
Test-Path $Repo

Write-Host ""
Write-Host "4. Git says the repo root is:"
git -C $Repo rev-parse --show-toplevel

Write-Host ""
Write-Host "5. Commits - local vs GitHub:"
Write-Host ("local : " + (git -C $Repo rev-parse --short HEAD))
Write-Host ("github: " + (git -C $Repo rev-parse --short origin/main))

Write-Host ""
Write-Host "6. Changed files BEFORE staging:"
$before = git -C $Repo status --porcelain
Write-Host ("count = " + ($before | Measure-Object -Line).Lines)

Write-Host ""
Write-Host "7. Running: git add -A"
git -C $Repo add -A
Write-Host ("add exit code = " + $LASTEXITCODE)

Write-Host ""
Write-Host "8. Staged files AFTER staging:"
$staged = git -C $Repo diff --cached --name-only
Write-Host ("count = " + ($staged | Measure-Object -Line).Lines)
$staged | Select-Object -First 5

Write-Host ""
Write-Host "=============================================="
Write-Host "Paste everything above back to Claude."
