param(
  [Parameter(Mandatory = $true)]
  [string]$SecretId,
  [Parameter(Mandatory = $true)]
  [string]$SecretKey,
  [Parameter(Mandatory = $true)]
  [string]$EnvId,
  [string]$ServiceName = "fitforge",
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"
$env:npm_config_registry = "https://registry.npmmirror.com"

Write-Output "Login CloudBase..."
npx -p @cloudbase/cli tcb login -k --apiKeyId $SecretId --apiKey $SecretKey

Write-Output "Deploy CloudRun service..."
npx -p @cloudbase/cli tcb cloudrun deploy -e $EnvId -s $ServiceName --port $Port --source . --force

Write-Output "Done. Check service URL in Tencent CloudBase console."
