$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot

Write-Host 'Verificando backend...'
Push-Location (Join-Path $raiz 'Backend')
npm run check
if ($LASTEXITCODE -ne 0) { throw 'Falha na verificacao do backend.' }
Pop-Location

Write-Host 'Verificando frontend...'
Push-Location (Join-Path $raiz 'frontend')
npm run check
if ($LASTEXITCODE -ne 0) { throw 'Falha na verificacao do frontend.' }
Pop-Location

Write-Host 'Projeto aprovado nos testes locais.'
