$ErrorActionPreference = 'Stop'
$repoPath = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoPath
$appPath = Join-Path $repoPath 'out/Stremio Kai Simkl'
New-Item -ItemType Directory -Path $appPath -Force | Out-Null
Copy-Item -Path 'downloads/runtime/Stremio Kai/*' -Destination $appPath -Recurse -Force
# Apply the repository's Kai configuration and scripts, then the compiled fork.
Copy-Item -Path 'portable_config/*' -Destination (Join-Path $appPath 'portable_config') -Recurse -Force
Copy-Item build/Release/stremio.exe -Destination $appPath -Force
Copy-Item web-ui/build -Destination (Join-Path $appPath 'web-ui') -Recurse
Copy-Item SIMKL.md -Destination $appPath
Copy-Item LICENSE.md -Destination (Join-Path $appPath 'LICENSE-Kai.md')
Copy-Item native/LICENSE.md -Destination (Join-Path $appPath 'LICENSE-native.md')
Copy-Item web-ui/LICENSE.md -Destination (Join-Path $appPath 'LICENSE-web-ui.md')
Copy-Item THIRD-PARTY.md -Destination $appPath
Copy-Item native/deps/discord-rpc-source/LICENSE -Destination (Join-Path $appPath 'LICENSE-discord-rpc.txt')
Copy-Item native/deps/rapidjson/license.txt -Destination (Join-Path $appPath 'LICENSE-rapidjson.txt')
$licensePath = Join-Path $appPath 'licenses/native'
New-Item -ItemType Directory -Path $licensePath -Force | Out-Null
Get-ChildItem build/vcpkg_installed/x64-windows-static/share -Directory | ForEach-Object {
    $copyrightPath = Join-Path $_.FullName 'copyright'
    if (Test-Path -LiteralPath $copyrightPath) { Copy-Item -LiteralPath $copyrightPath -Destination (Join-Path $licensePath ($_.Name + '.txt')) }
}
$buildId = (& git rev-parse HEAD).Trim()
if ($LASTEXITCODE) { throw 'Unable to identify the bundled UI build' }
$launcher = (Get-Content build-scripts/Start-Kai.cmd -Raw).Replace(' %*', ' "--webui-url=https://kai.local/index.html?build=' + $buildId + '" %*')
Set-Content -LiteralPath (Join-Path $appPath 'Start-Kai.cmd') -Value $launcher -Encoding ascii
# Small update for existing installations: preserve user-data and all runtime files.
$updatePath = Join-Path $repoPath 'out/ui-update'
New-Item -ItemType Directory -Path $updatePath -Force | Out-Null
Copy-Item web-ui/build -Destination (Join-Path $updatePath 'web-ui') -Recurse
Copy-Item -LiteralPath (Join-Path $appPath 'Start-Kai.cmd') -Destination $updatePath
& 7z a -tzip out/Stremio-Kai-Simkl-WebUI-Update.zip "$updatePath/*" '-mx=5' | Out-Null
if ($LASTEXITCODE) { throw 'UI update packaging failed' }
Copy-Item build/Release/stremio.exe -Destination $updatePath
& 7z a -tzip out/Stremio-Kai-Simkl-App-Update.zip "$updatePath/*" '-mx=5' | Out-Null
if ($LASTEXITCODE) { throw 'App update packaging failed' }
# No build-machine browser profile, credentials, tests or logs enter the release.
Get-ChildItem -LiteralPath $appPath -Recurse -File -Include *.log,*.dmp | Remove-Item -Force
& 7z a -tzip out/Stremio-Kai-Simkl-Windows-x64.zip $appPath '-mx=5' | Out-Null
if ($LASTEXITCODE) { throw 'Portable packaging failed' }
$compilerPath = Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6/ISCC.exe'
if (!(Test-Path -LiteralPath $compilerPath)) { throw 'Inno Setup is missing from the Windows runner' }
& $compilerPath build-scripts/installer.iss
if ($LASTEXITCODE) { throw 'Installer compilation failed' }
Get-ChildItem out -File | Where-Object Extension -In '.exe','.zip' | ForEach-Object {
    '{0}  {1}' -f (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant(), $_.Name
} | Set-Content out/SHA256SUMS.txt

