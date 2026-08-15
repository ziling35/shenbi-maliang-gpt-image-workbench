$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot "runtime\douyinLive"
$archive = Join-Path $env:TEMP "douyinLive-windows-amd64.zip"

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$release = Invoke-RestMethod "https://api.github.com/repos/jwwsjlm/douyinLive/releases/latest" -Headers @{ "User-Agent" = "LingtuAI" }
$asset = $release.assets | Where-Object { $_.name -like "*-windows-amd64.zip" } | Select-Object -First 1
if (-not $asset) { throw "Windows AMD64 release asset was not found." }

Write-Host "Downloading $($asset.name)..."
try {
  Invoke-WebRequest $asset.browser_download_url -OutFile $archive
} catch {
  Write-Host "PowerShell download failed, retrying with curl.exe..."
  & curl.exe -fL --retry 3 --connect-timeout 20 -o $archive $asset.browser_download_url
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Release download failed. Building from source with local Go..."
    $sourceDir = Join-Path $env:TEMP "lingtu-douyinLive-source"
    if (Test-Path -LiteralPath $sourceDir) {
      $resolved = (Resolve-Path -LiteralPath $sourceDir).Path
      $expected = [IO.Path]::GetFullPath($sourceDir)
      if ($resolved -ne $expected) { throw "Unexpected source directory." }
      Remove-Item -LiteralPath $resolved -Recurse -Force
    }
    & git clone --depth 1 https://github.com/jwwsjlm/douyinLive.git $sourceDir
    if ($LASTEXITCODE -ne 0) { throw "Unable to clone douyinLive source." }
    Push-Location $sourceDir
    try {
      $env:GOTOOLCHAIN = "local"
      $env:GOPROXY = "https://goproxy.cn,direct"
      & go mod edit -go=1.26.0
      & go build -o (Join-Path $runtimeDir "douyinLive.exe") .\cmd\main
      if ($LASTEXITCODE -ne 0) { throw "Unable to build douyinLive from source." }
    } finally { Pop-Location }
    Write-Host "Built from source: $runtimeDir\douyinLive.exe"
    exit 0
  }
}
Expand-Archive -LiteralPath $archive -DestinationPath $runtimeDir -Force
$exe = Get-ChildItem -Path $runtimeDir -Recurse -Filter "douyinLive.exe" | Select-Object -First 1
if (-not $exe) { throw "douyinLive.exe was not found in the downloaded archive." }
if ($exe.DirectoryName -ne $runtimeDir) { Copy-Item -LiteralPath $exe.FullName -Destination (Join-Path $runtimeDir "douyinLive.exe") -Force }
Write-Host "Installed: $runtimeDir\douyinLive.exe"
Write-Host "Next: powershell -ExecutionPolicy Bypass -File .\tools\start-douyin-live.ps1"
