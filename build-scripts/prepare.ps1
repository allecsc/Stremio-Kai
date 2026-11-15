$ErrorActionPreference = 'Stop'
$repoPath = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoPath
New-Item downloads -ItemType Directory -Force | Out-Null
$archivePath = Join-Path $repoPath 'downloads/Stremio-Kai_v4.8.0.7z'
gh release download v4.8.0 --repo allecsc/Stremio-Kai --pattern Stremio-Kai_v4.8.0.7z --dir downloads --clobber
if ($LASTEXITCODE) { throw 'Unable to download the pinned upstream runtime' }
if ((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne '12781dcc0d6a0f8d937cef17adc81400e501f29b1a29fb8e3dfc6335d6c927c9') { throw 'Kai archive checksum mismatch' }
& 7z x $archivePath '-odownloads/runtime' -y | Out-Null
if ($LASTEXITCODE) { throw 'Runtime extraction failed' }
# This SDK supplies only headers/import library. The runtime DLL is always Kai's original.
git clone --no-checkout https://github.com/Zaarrg/libmpv.git native/deps/libmpv
if ($LASTEXITCODE) { throw 'MPV SDK clone failed' }
git -C native/deps/libmpv checkout d57999b78b2d7b22f32f3a827a44903fdaa59e62
if ($LASTEXITCODE) { throw 'Pinned MPV SDK checkout failed' }
$runtimePath = Join-Path $repoPath 'downloads/runtime/Stremio Kai'
$mpvPath = Join-Path $runtimePath 'libmpv-2.dll'
if ((Get-FileHash -LiteralPath $mpvPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne '0823b0bad6db5a7b23485fae697aa64df07d48ea5e1f6c043e31628ca64d0f61') { throw 'Kai playback engine checksum mismatch' }
Copy-Item -LiteralPath $mpvPath -Destination native/deps/libmpv/x86_64/libmpv-2.dll -Force

