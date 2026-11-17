# Restores a dump from .\backups into a MySQL database of the local
# server (RNF11, issue #81). Windows version of restore.sh; same steps
# and options. Step by step and RTO in
# docs\AtelierBureau_Backup_Restauracao.md.
#
#   powershell -ExecutionPolicy Bypass -File deploy\backup\restore.ps1
#     → lists the dumps
#   ... -File deploy\backup\restore.ps1 latest
#   ... -File deploy\backup\restore.ps1 backups\<file>.sql.gz
#   ... -File deploy\backup\restore.ps1 latest -Target atelier_bureau_restore_test
#
# Options: -Target <db> (default atelier_bureau), -Yes (no confirmation)
# and -NoSafetyBackup (skips the dump of the current data).
param(
  [Parameter(Position = 0)] [string] $File = "",
  [string] $Target = "atelier_bureau",
  [switch] $Yes,
  [switch] $NoSafetyBackup
)
$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..\..")

# Runs a native command and stops on a non-zero exit code.
function Invoke-Step([scriptblock] $Command) {
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "step failed (exit $LASTEXITCODE)" }
}

if ($Target -notmatch "^[A-Za-z0-9_]+$") {
  Write-Error "invalid database name: $Target"
}

$dumps = @(Get-ChildItem -Path "backups" -Filter "atelier_bureau-*.sql.gz" `
    -ErrorAction SilentlyContinue | Sort-Object Name)

if ($File -eq "") {
  Write-Output "Available dumps (oldest first):"
  if ($dumps.Count -eq 0) { Write-Output "  none in .\backups" }
  $dumps | ForEach-Object { Write-Output "  backups\$($_.Name)" }
  Write-Output "Usage: restore.ps1 [-Target <db>] latest|<file>"
  exit 2
}
if ($File -eq "latest") {
  if ($dumps.Count -eq 0) { Write-Error "no dump in .\backups" }
  $File = $dumps[-1].FullName
}
if (-not (Test-Path -PathType Leaf $File)) { Write-Error "file not found: $File" }

Write-Output "Dump:     $File"
Write-Output "Target:   $Target (will be DROPPED and recreated)"
if ($Target -eq "atelier_bureau") {
  Write-Output "The app is stopped during the restore. Orders placed after this"
  Write-Output "dump are lost unless they are in the safety dump."
}

if (-not $Yes) {
  $answer = Read-Host "Type the target database name to confirm"
  if ($answer -ne $Target) {
    Write-Output "Cancelled: nothing was changed."
    exit 1
  }
}

$timer = [System.Diagnostics.Stopwatch]::StartNew()
$appStopped = $false

try {
  Write-Output "[restore] copying the dump into the db container"
  Invoke-Step { docker compose cp deploy/backup/restore-in-container.sh db:/tmp/restore-in-container.sh }
  Invoke-Step { docker compose cp $File db:/tmp/restore.sql.gz }
  Invoke-Step { docker compose exec -T -e "TARGET_DB=$Target" db sh /tmp/restore-in-container.sh check }

  if ($Target -eq "atelier_bureau") {
    if (-not $NoSafetyBackup) {
      Write-Output "[restore] safety dump of the current data"
      Invoke-Step { docker compose exec -T backup sh /usr/local/bin/backup.sh }
    }
    Write-Output "[restore] stopping the app"
    Invoke-Step { docker compose stop app }
    $appStopped = $true
  }

  Write-Output "[restore] importing into $Target"
  Invoke-Step { docker compose exec -T -e "TARGET_DB=$Target" db sh /tmp/restore-in-container.sh restore }
  Invoke-Step { docker compose exec -T -e "TARGET_DB=$Target" db sh /tmp/restore-in-container.sh summary }

  $timer.Stop()
  $minutes = [math]::Floor($timer.Elapsed.TotalMinutes)
  Write-Output ("[restore] done in {0} min {1} s; write it down in the restore log (RTO 4 h)" -f $minutes, $timer.Elapsed.Seconds)
}
finally {
  docker compose exec -T db rm -f /tmp/restore.sql.gz /tmp/restore-in-container.sh | Out-Null
  if ($appStopped) {
    Write-Output "[restore] starting the app"
    docker compose start app
  }
}
