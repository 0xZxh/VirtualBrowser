$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$pathsFile = Join-Path $root 'config\chrome-bin.paths.json'
$paths = Get-Content $pathsFile -Raw | ConvertFrom-Json

$buildOut = Join-Path $root 'worker\dist\worker'
$target = Join-Path $root ($paths.innerWorkerDir -replace '/', '\')

if (-not (Test-Path $target)) {
  Write-Error "Worker target missing: $target"
  exit 1
}

Write-Host '>>> npm run build (worker)'
Push-Location (Join-Path $root 'worker')
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
Pop-Location

if (-not (Test-Path (Join-Path $buildOut 'index.html'))) {
  Write-Error "Build output missing: $buildOut"
  exit 1
}

$bak = "$target.bak"
if (-not (Test-Path $bak)) {
  Copy-Item $target $bak -Recurse -Force
  Write-Host "Backup: $bak"
}

Write-Host ">>> deploy to $target"
Get-ChildItem $target -Exclude '*.bak' | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item -Path "$buildOut\*" -Destination $target -Recurse -Force

Write-Host 'Done. Restart a fingerprint browser window to see changes.'
