param(
  [string]$Destino = "$PSScriptRoot\..\..\backups",
  [int]$RetencaoDias = 14
)

$ErrorActionPreference = 'Stop'
$pgDump = "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"
if (-not (Test-Path -LiteralPath $pgDump)) { throw "pg_dump nao encontrado em $pgDump" }

$hostBanco = if ($env:DB_HOST) { $env:DB_HOST } else { 'localhost' }
$porta = if ($env:DB_PORT) { $env:DB_PORT } else { '5432' }
$banco = if ($env:DB_NAME) { $env:DB_NAME } else { 'gestor_eleitoral' }
$usuario = if ($env:DB_BACKUP_USER) { $env:DB_BACKUP_USER } else { 'postgres' }

New-Item -ItemType Directory -Path $Destino -Force | Out-Null
$arquivo = Join-Path $Destino ("gestor_eleitoral_{0}.dump" -f (Get-Date -Format 'yyyyMMdd_HHmmss'))

& $pgDump -Fc -h $hostBanco -p $porta -U $usuario -d $banco -f $arquivo
if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar backup.' }

Get-ChildItem -LiteralPath $Destino -Filter 'gestor_eleitoral_*.dump' -File |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetencaoDias) } |
  Remove-Item -Force

Write-Host "Backup concluido: $arquivo"
