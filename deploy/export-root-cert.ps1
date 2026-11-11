# Copies Caddy's local root certificate to deploy\certs\root.crt so it can
# be installed on the devices of the network (issue #11). Windows version
# of export-root-cert.sh; run after the first `docker compose up -d`:
#
#   powershell -ExecutionPolicy Bypass -File deploy\export-root-cert.ps1
#
# To trust it on this Windows machine (asks for confirmation):
#
#   Import-Certificate -FilePath deploy\certs\root.crt `
#     -CertStoreLocation Cert:\CurrentUser\Root
$ErrorActionPreference = "Stop"

$certs = Join-Path $PSScriptRoot "certs"
New-Item -ItemType Directory -Force $certs | Out-Null
docker compose cp proxy:/data/caddy/pki/authorities/local/root.crt `
  (Join-Path $certs "root.crt")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output "Certificado salvo em deploy\certs\root.crt"
