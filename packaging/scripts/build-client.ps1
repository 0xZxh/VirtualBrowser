#Requires -Version 5.1
<#
.SYNOPSIS
  Build VirtualBrowser client staging and optional NSIS Setup.exe.

.PARAMETER CloudApiBase
  Cloud API base URL written to config/client.json and VUE_APP_BASE_API.

.PARAMETER ProductVersion
  Product version for client.json and NSIS OutFile name.

.PARAMETER SkipUiBuild
  Skip server frontend npm run build.

.PARAMETER SkipNsis
  Staging only; do not invoke makensis.
#>
param(
  [Parameter(Mandatory = $false)]
  [string]$CloudApiBase = "",

  [Parameter(Mandatory = $false)]
  [string]$ProductVersion = "0.1.0",

  [switch]$SkipUiBuild,
  [switch]$SkipNsis
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$packagingRoot = Join-Path $repoRoot "packaging"
$stagingRoot = Join-Path $packagingRoot "staging"
$outputRoot = Join-Path $packagingRoot "output"
$templatePath = Join-Path $packagingRoot "config\client.json.template"
$clientJsonPath = Join-Path $repoRoot "config\client.json"
$serverDir = Join-Path $repoRoot "server"
$shellDir = Join-Path $repoRoot "desktop-shell"
$chromeBinDir = Join-Path $repoRoot "Chrome-bin"

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Ensure-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Command not found: $Name"
  }
}

Write-Step "Read client.json template"
if (-not (Test-Path $templatePath)) {
  throw "Missing template: $templatePath"
}
$template = Get-Content $templatePath -Raw | ConvertFrom-Json
if ($CloudApiBase) {
  $template.cloudApiBase = $CloudApiBase
}
$template.productVersion = $ProductVersion
# UTF-8 without BOM — BOM breaks JSON.parse in Electron / Node
$clientJsonText = ($template | ConvertTo-Json -Depth 5) + "`n"
[System.IO.File]::WriteAllText($clientJsonPath, $clientJsonText, (New-Object System.Text.UTF8Encoding $false))
Write-Host "Wrote $clientJsonPath"
Write-Host "  cloudApiBase = $($template.cloudApiBase)"

if (-not $SkipUiBuild) {
  Write-Step "Build server management UI"
  Ensure-Command npm
  Push-Location $serverDir
  try {
    if (-not (Test-Path (Join-Path $serverDir "node_modules"))) {
      npm install
    }
    $env:VUE_APP_BASE_API = $template.cloudApiBase
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "server npm run build failed" }
  }
  finally {
    Pop-Location
  }
}

$distDir = Join-Path $serverDir "dist\server"
if (-not (Test-Path (Join-Path $distDir "index.html"))) {
  throw "UI build output missing: $distDir\index.html (build server first or use -SkipUiBuild with a prebuilt dist)"
}

Write-Step "Install desktop-shell dependencies"
Push-Location $shellDir
try {
  if (-not (Test-Path (Join-Path $shellDir "node_modules"))) {
    npm install
    if ($LASTEXITCODE -ne 0) { throw "desktop-shell npm install failed" }
  }
  npm run smoke
  if ($LASTEXITCODE -ne 0) { throw "desktop-shell smoke failed" }
}
finally {
  Pop-Location
}

Write-Step "Assemble staging directory"
if (Test-Path $stagingRoot) {
  try {
    Remove-Item $stagingRoot -Recurse -Force -ErrorAction Stop
  } catch {
    $orphan = Join-Path $packagingRoot ("staging.orphan-" + (Get-Date -Format "yyyyMMddHHmmss"))
    Write-Warning "Cannot delete staging (file lock). Renaming to $orphan"
    try {
      Rename-Item -Path $stagingRoot -NewName (Split-Path $orphan -Leaf) -ErrorAction Stop
    } catch {
      $stagingRoot = Join-Path $packagingRoot ("staging-" + (Get-Date -Format "yyyyMMddHHmmss"))
      Write-Warning "Rename also failed; using alternate staging: $stagingRoot"
    }
  }
}
New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null

# Electron runtime (simplified: copy desktop-shell + electron/dist)
$electronDist = Join-Path $shellDir "node_modules\electron\dist"
if (-not (Test-Path $electronDist)) {
  throw "Electron dist missing; run npm install in desktop-shell"
}

Copy-Item -Path (Join-Path $electronDist "*") -Destination $stagingRoot -Recurse -Force
Rename-Item -Path (Join-Path $stagingRoot "electron.exe") -NewName "VirtualBrowser.exe" -ErrorAction SilentlyContinue

$assetsDir = Join-Path $packagingRoot "assets"
$appIco = Join-Path $assetsDir "app.ico"
if (-not (Test-Path $appIco)) {
  throw "Missing $appIco — run: node packaging/scripts/generate-app-icon.js"
}

# App resources
New-Item -ItemType Directory -Path (Join-Path $stagingRoot "resources\app") -Force | Out-Null
$appDir = Join-Path $stagingRoot "resources\app"
Copy-Item -Path (Join-Path $shellDir "package.json") -Destination $appDir
Copy-Item -Path (Join-Path $shellDir "src") -Destination (Join-Path $appDir "src") -Recurse
# BrowserWindow icon (resolveAppIcon looks under resources/app/assets)
$shellAssetsSrc = Join-Path $shellDir "assets"
if (Test-Path $shellAssetsSrc) {
  Copy-Item -Path $shellAssetsSrc -Destination (Join-Path $appDir "assets") -Recurse -Force
} else {
  New-Item -ItemType Directory -Path (Join-Path $appDir "assets") -Force | Out-Null
  Copy-Item -Path $appIco -Destination (Join-Path $appDir "assets\app.ico") -Force
}
# Installer shortcut + DisplayIcon fallback path
New-Item -ItemType Directory -Path (Join-Path $stagingRoot "assets") -Force | Out-Null
Copy-Item -Path $appIco -Destination (Join-Path $stagingRoot "assets\app.ico") -Force

New-Item -ItemType Directory -Path (Join-Path $stagingRoot "dist\server") -Force | Out-Null
Copy-Item -Path (Join-Path $distDir "*") -Destination (Join-Path $stagingRoot "dist\server") -Recurse -Force

New-Item -ItemType Directory -Path (Join-Path $stagingRoot "config") -Force | Out-Null
Copy-Item -Path $clientJsonPath -Destination (Join-Path $stagingRoot "config\client.json")

if (Test-Path $chromeBinDir) {
  Copy-Item -Path $chromeBinDir -Destination (Join-Path $stagingRoot "Chrome-bin") -Recurse -Force
  Write-Host "Copied Chrome-bin"
} else {
  Write-Warning "Chrome-bin/ not found; installer will lack fingerprint kernel (env launch will fail)"
}

# Replace VisualElements PNGs (FP brand) in staging Chrome-bin if present
$veLogo = Join-Path $assetsDir "Logo.png"
$veSmall = Join-Path $assetsDir "SmallLogo.png"
if ((Test-Path $veLogo) -and (Test-Path $veSmall)) {
  Get-ChildItem -Path (Join-Path $stagingRoot "Chrome-bin") -Recurse -Directory -Filter "VisualElements" -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item -Path $veLogo -Destination (Join-Path $_.FullName "Logo.png") -Force
    Copy-Item -Path $veSmall -Destination (Join-Path $_.FullName "SmallLogo.png") -Force
    Write-Host "Updated VisualElements: $($_.FullName)"
  }
}

function Invoke-RceditIcon {
  param(
    [Parameter(Mandatory = $true)][string]$ExePath,
    [Parameter(Mandatory = $true)][string]$IconPath
  )
  if (-not (Test-Path $ExePath)) {
    Write-Warning "rcedit skip (missing exe): $ExePath"
    return
  }
  if (-not (Test-Path $IconPath)) {
    throw "rcedit icon missing: $IconPath"
  }
  if (-not (Test-Path (Join-Path $shellDir "node_modules\rcedit"))) {
    throw "Missing rcedit — run npm install in desktop-shell (devDependency rcedit@4)"
  }
  Write-Host "rcedit --set-icon => $ExePath"
  # Helper must live under desktop-shell so require('rcedit') resolves (node ignores cwd for require).
  $helperDir = Join-Path $shellDir "scripts"
  New-Item -ItemType Directory -Path $helperDir -Force | Out-Null
  $helper = Join-Path $helperDir ("_rcedit-tmp-" + [guid]::NewGuid().ToString("n") + ".js")
  $helperBody = @(
    'const path = require("path");'
    'const rcedit = require("rcedit");'
    'const exe = process.env.VB_RCEDIT_EXE;'
    'const icon = process.env.VB_RCEDIT_ICON;'
    '(async () => {'
    '  await rcedit(exe, { icon });'
    '  console.log("ok:", path.basename(exe));'
    '})().catch((err) => { console.error(err); process.exit(1); });'
  ) -join "`n"
  [System.IO.File]::WriteAllText($helper, $helperBody)
  try {
    $env:VB_RCEDIT_EXE = $ExePath
    $env:VB_RCEDIT_ICON = $IconPath
    node $helper
    if ($LASTEXITCODE -ne 0) { throw "rcedit failed for $ExePath" }
  }
  finally {
    Remove-Item Env:VB_RCEDIT_EXE -ErrorAction SilentlyContinue
    Remove-Item Env:VB_RCEDIT_ICON -ErrorAction SilentlyContinue
    Remove-Item $helper -Force -ErrorAction SilentlyContinue
  }
}

Write-Step "Apply FP icon via rcedit (shell + kernel)"
$shellExe = Join-Path $stagingRoot "VirtualBrowser.exe"
Invoke-RceditIcon -ExePath $shellExe -IconPath $appIco

$kernelExeCandidates = @(
  (Join-Path $stagingRoot "Chrome-bin\VirtualBrowser\146.0.7680.72\VirtualBrowser.exe"),
  (Join-Path $stagingRoot "Chrome-bin\VirtualBrowser.exe")
)
$kernelExe = $kernelExeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($kernelExe) {
  Invoke-RceditIcon -ExePath $kernelExe -IconPath $appIco
} else {
  $found = Get-ChildItem -Path (Join-Path $stagingRoot "Chrome-bin") -Recurse -Filter "VirtualBrowser.exe" -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\chrome_proxy' } |
    Select-Object -First 1
  if ($found) {
    Invoke-RceditIcon -ExePath $found.FullName -IconPath $appIco
  } else {
    Write-Warning "Kernel VirtualBrowser.exe not found under staging Chrome-bin; skipped rcedit"
  }
}

# native-runtime server/lib (+ config); not the whole server source tree
$serverLibDest = Join-Path $stagingRoot "server\lib"
New-Item -ItemType Directory -Path $serverLibDest -Force | Out-Null
Copy-Item -Path (Join-Path $repoRoot "server\lib\*") -Destination $serverLibDest -Recurse -Force
Copy-Item -Path (Join-Path $repoRoot "config\chrome-bin.paths.json") -Destination (Join-Path $stagingRoot "config\chrome-bin.paths.json") -Force
# cross-platform-prep: native-runtime / profile-sync / crx-store require ../../config/vb-paths
$vbPathsSrc = Join-Path $repoRoot "config\vb-paths.js"
if (-not (Test-Path $vbPathsSrc)) {
  throw "Missing config/vb-paths.js (required by server/lib)"
}
Copy-Item -Path $vbPathsSrc -Destination (Join-Path $stagingRoot "config\vb-paths.js") -Force
Write-Host "Copied config/vb-paths.js"

# native-runtime chain (profile-sync / crx-store) npm runtime deps.
# Node resolves from server/lib/*.js -> staging/server/node_modules/<pkg>
# Scan result: only third-party package is adm-zip (no nested npm deps).
$runtimeNpmPackages = @("adm-zip")
$serverNmSrc = Join-Path $serverDir "node_modules"
$serverNmDest = Join-Path $stagingRoot "server\node_modules"
New-Item -ItemType Directory -Path $serverNmDest -Force | Out-Null

foreach ($pkg in $runtimeNpmPackages) {
  $pkgSrc = Join-Path $serverNmSrc $pkg
  if (-not (Test-Path $pkgSrc)) {
    Write-Step "Install missing server runtime dependency: $pkg"
    Ensure-Command npm
    Push-Location $serverDir
    try {
      npm install --no-audit --no-fund $pkg
      if ($LASTEXITCODE -ne 0) { throw "npm install $pkg failed" }
    }
    finally {
      Pop-Location
    }
  }
  if (-not (Test-Path $pkgSrc)) {
    throw "Missing runtime package: $pkgSrc"
  }
  Copy-Item -Path $pkgSrc -Destination (Join-Path $serverNmDest $pkg) -Recurse -Force
  Write-Host "Copied runtime dep: server/node_modules/$pkg"
}

Write-Step "Verify staging can resolve native-runtime deps"
# Absolute-path require of staging native-runtime loads profile-sync/crx-store -> adm-zip
$verifyFile = Join-Path $env:TEMP ("vb-staging-require-" + [guid]::NewGuid().ToString("n") + ".js")
$verifyBody = @(
  'const path = require("path");'
  'const root = process.env.VB_STAGING_ROOT;'
  'const nr = require(path.join(root, "server", "lib", "native-runtime.js"));'
  'if (typeof nr.handleNativeCall !== "function") throw new Error("handleNativeCall missing");'
  'console.log("ok: staging resolve native-runtime + adm-zip");'
) -join "`n"
[System.IO.File]::WriteAllText($verifyFile, $verifyBody)
try {
  $env:VB_STAGING_ROOT = $stagingRoot
  node $verifyFile
  if ($LASTEXITCODE -ne 0) { throw "staging require check failed (native-runtime / adm-zip)" }
}
finally {
  Remove-Item Env:VB_STAGING_ROOT -ErrorAction SilentlyContinue
  Remove-Item $verifyFile -Force -ErrorAction SilentlyContinue
}

Write-Host "staging ready: $stagingRoot"

if (-not $SkipNsis) {
  Write-Step "Build NSIS installer"
  Ensure-Command makensis
  $nsiPath = Join-Path $packagingRoot "nsis\installer.nsi"
  $stagingForNsis = (Resolve-Path $stagingRoot).Path
  Push-Location (Join-Path $packagingRoot "nsis")
  try {
    & makensis "/INPUTCHARSET" "UTF8" "/DPRODUCT_VERSION=$ProductVersion" "/DSTAGING_DIR=$stagingForNsis" $nsiPath
    if ($LASTEXITCODE -ne 0) { throw "makensis failed" }
  }
  finally {
    Pop-Location
  }
  $setupExe = Join-Path $outputRoot "VirtualBrowser-Setup-$ProductVersion.exe"
  if (Test-Path $setupExe) {
    Write-Host "Installer: $setupExe" -ForegroundColor Green
  }
} else {
  Write-Host "Skipped NSIS (-SkipNsis)"
}

Write-Step "Done"
Write-Host "Next: run staging\VirtualBrowser.exe or install output\VirtualBrowser-Setup-*.exe"