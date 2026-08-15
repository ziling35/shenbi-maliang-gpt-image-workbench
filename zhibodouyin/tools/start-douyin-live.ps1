$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $projectRoot "runtime\douyinLive\douyinLive.exe"
if (-not (Test-Path -LiteralPath $exe)) { throw "Collector is not installed. Run tools\install-douyin-live.ps1 first." }
Write-Host "Starting douyinLive at ws://127.0.0.1:1088"
Write-Host "Keep this window open. Press Ctrl+C to stop the collector."
& $exe --port 1088
