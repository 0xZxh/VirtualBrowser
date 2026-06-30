$ErrorActionPreference = 'Stop'

$chromeBin = Join-Path $PSScriptRoot '..\..\Chrome-bin'
$innerExe = Join-Path $chromeBin 'VirtualBrowser\146.0.7680.72\VirtualBrowser.exe'

if (-not (Test-Path $innerExe)) {
  Write-Error "Inner kernel missing: $innerExe"
  exit 1
}

Write-Host 'Removing outer shell from Chrome-bin (keep VirtualBrowser\146.x)...'
Get-ChildItem $chromeBin -Force |
  Where-Object { $_.Name -notin @('VirtualBrowser', 'README.md') } |
  ForEach-Object {
    Write-Host "  remove $($_.Name)"
    Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction Continue
  }

$copyDir = Join-Path (Split-Path $chromeBin -Parent) 'Chrome-bin - copy'
$copyDirCn = Join-Path (Split-Path $chromeBin -Parent) 'Chrome-bin - 副本'
foreach ($d in @($copyDirCn, $copyDir)) {
  if (Test-Path -LiteralPath $d) {
    Write-Host "  remove backup $d"
    Remove-Item -LiteralPath $d -Recurse -Force -ErrorAction Continue
  }
}

Write-Host 'Done. Remaining:'
Get-ChildItem $chromeBin | ForEach-Object { $_.Name }
if (Test-Path (Join-Path $chromeBin 'resources\app.asar')) {
  Write-Host ''
  Write-Host 'NOTE: resources\app.asar is locked. Close Virtual Browser, then delete Chrome-bin\resources manually.'
}
