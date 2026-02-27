$ErrorActionPreference = "Stop"

$root = Resolve-Path "$PSScriptRoot\\.."
$publicDir = Join-Path $root "public"
if (!(Test-Path $publicDir)) {
  New-Item -ItemType Directory -Path $publicDir | Out-Null
}

$files = @("index.html", "script.js", "styles.css")
foreach ($file in $files) {
  Copy-Item (Join-Path $root $file) (Join-Path $publicDir $file) -Force
}

Write-Output "Synced static files to ./public"
