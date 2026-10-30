$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$env:JMART_LOCAL_JWT_SECRET = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))

try {
  Set-Location -LiteralPath $projectRoot
  docker compose -f compose.local.yml up -d --build
  if ($LASTEXITCODE -ne 0) { throw "Local Docker startup failed." }
  Write-Host "Local J-Mart: http://127.0.0.1:3001"
  Write-Host "Test database: $(Join-Path $projectRoot 'data\local-sample\jmart.sqlite')"
} finally {
  Remove-Item Env:JMART_LOCAL_JWT_SECRET -ErrorAction SilentlyContinue
}
