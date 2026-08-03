# Zero Club - push changes to GitHub
# Always operates on this exact project folder, no matter where PowerShell is.
#
# Usage:  .\push.ps1
#         .\push.ps1 "Your commit message here"

param(
    [string]$Message = "Update Zero Club app"
)

$Repo = "C:\Users\user\Downloads\zero-club-builders-main"

Write-Host ""
Write-Host "Repo folder: $Repo" -ForegroundColor Cyan
Write-Host ""

# --- Step 1: what has changed ---
Write-Host "STEP 1 - changed files:" -ForegroundColor Yellow
git -C $Repo status --short

$changes = git -C $Repo status --porcelain
if ([string]::IsNullOrWhiteSpace($changes)) {
    Write-Host ""
    Write-Host "Nothing to commit. Working folder is clean." -ForegroundColor Green
    exit 0
}

# --- Step 2: stage ---
Write-Host ""
Write-Host "STEP 2 - staging..." -ForegroundColor Yellow
git -C $Repo add -A

$staged = git -C $Repo diff --cached --name-only
$stagedCount = ($staged | Measure-Object -Line).Lines
Write-Host "Staged $stagedCount file(s)." -ForegroundColor Green

if ($stagedCount -eq 0) {
    Write-Host "Nothing got staged. Stopping so nothing is lost." -ForegroundColor Red
    exit 1
}

# --- Step 3: commit ---
Write-Host ""
Write-Host "STEP 3 - committing..." -ForegroundColor Yellow
git -C $Repo commit -m $Message
if ($LASTEXITCODE -ne 0) {
    Write-Host "Commit failed. Read the message above." -ForegroundColor Red
    exit 1
}

# --- Step 4: push ---
Write-Host ""
Write-Host "STEP 4 - pushing to GitHub..." -ForegroundColor Yellow
git -C $Repo push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Push was rejected. Trying to sync first..." -ForegroundColor Yellow
    git -C $Repo pull --rebase origin main
    git -C $Repo push origin main
}

Write-Host ""
Write-Host "Local commit:  $(git -C $Repo rev-parse --short HEAD)" -ForegroundColor Cyan
Write-Host "GitHub commit: $(git -C $Repo rev-parse --short origin/main)" -ForegroundColor Cyan
Write-Host ""
Write-Host "If those two match, your changes are on GitHub." -ForegroundColor Green
Write-Host ""
