# Zero Club - push changes to GitHub
#
# Usage:
#   .\push.ps1                      commit + push (uses saved credentials)
#   .\push.ps1 "My message"         with your own commit message
#   .\push.ps1 -UseToken            paste a personal access token when asked
#
# The token is read as a secure prompt, used for this one push, and never
# written to disk or into the git config.

param(
    [string]$Message = "Add Zero Form and latest Zero Club updates",
    [switch]$UseToken
)

$Repo   = "C:\Users\user\Downloads\zero-club-builders-main"
$Owner  = "zeroclubknowledge-design"
$RepoNm = "zero-club-builders"

Write-Host ""
Write-Host "Zero Club -> GitHub" -ForegroundColor Cyan
Write-Host "Folder: $Repo"
Write-Host ""

# --- Clear a stale lock left behind by a crashed git process ---------------
$lock = Join-Path $Repo ".git\index.lock"
if (Test-Path $lock) {
    Write-Host "Clearing a stale git lock file..." -ForegroundColor Yellow
    Remove-Item $lock -Force
}

# --- Step 1: what changed --------------------------------------------------
Write-Host "STEP 1 - changed files:" -ForegroundColor Yellow
git -C $Repo status --short

$changes = git -C $Repo status --porcelain
if ([string]::IsNullOrWhiteSpace($changes)) {
    Write-Host ""
    Write-Host "Nothing to commit. Working folder is clean." -ForegroundColor Green
    exit 0
}

# --- Step 2: stage ---------------------------------------------------------
Write-Host ""
Write-Host "STEP 2 - staging..." -ForegroundColor Yellow
git -C $Repo add -A
if ($LASTEXITCODE -ne 0) {
    Write-Host "Staging failed. Read the message above." -ForegroundColor Red
    exit 1
}

$stagedCount = (git -C $Repo diff --cached --name-only | Measure-Object -Line).Lines
Write-Host "Staged $stagedCount file(s)." -ForegroundColor Green
if ($stagedCount -eq 0) {
    Write-Host "Nothing got staged. Stopping so nothing is lost." -ForegroundColor Red
    exit 1
}

# --- Step 3: commit --------------------------------------------------------
Write-Host ""
Write-Host "STEP 3 - committing..." -ForegroundColor Yellow
git -C $Repo commit -m $Message
if ($LASTEXITCODE -ne 0) {
    Write-Host "Commit failed. Read the message above." -ForegroundColor Red
    exit 1
}

# --- Step 4: push ----------------------------------------------------------
Write-Host ""
Write-Host "STEP 4 - pushing..." -ForegroundColor Yellow

if ($UseToken) {
    $secure = Read-Host "Paste your GitHub personal access token" -AsSecureString
    $token  = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
                 [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))

    # Used only for this single push. Not saved anywhere.
    $remote = "https://$($Owner):$token@github.com/$Owner/$RepoNm.git"
    git -C $Repo push $remote main
    $pushResult = $LASTEXITCODE

    $token  = $null
    $remote = $null
    [System.GC]::Collect()
} else {
    git -C $Repo push origin main
    $pushResult = $LASTEXITCODE
}

if ($pushResult -ne 0) {
    Write-Host ""
    Write-Host "Push was rejected. Syncing with GitHub, then retrying..." -ForegroundColor Yellow
    git -C $Repo pull --rebase origin main
    git -C $Repo push origin main
}

# --- Result ----------------------------------------------------------------
Write-Host ""
Write-Host ("Local commit:  " + (git -C $Repo rev-parse --short HEAD)) -ForegroundColor Cyan
git -C $Repo fetch origin main --quiet 2>$null
Write-Host ("GitHub commit: " + (git -C $Repo rev-parse --short origin/main)) -ForegroundColor Cyan
Write-Host ""
Write-Host "If those two match, your changes are on GitHub." -ForegroundColor Green
Write-Host ""
