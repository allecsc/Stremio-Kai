$packageName = 'stremio-desktop-v5'
$toolsDir    = Split-Path $MyInvocation.MyCommand.Definition

$packageArgs = @{
  packageName    = $packageName
  fileType       = 'exe'
  silentArgs     = '/S'
  validExitCodes = @(0)
}



if ([Environment]::Is64BitOperatingSystem) {
    $packageArgs['url']          = 'https://github.com/Zaarrg/stremio-desktop-v5/releases/download/5.0.0-beta.19/Stremio.5.0.19-x64.exe'
    $packageArgs['checksum']     = '31204153329ac4165a58408c32a3d6216800e227c52a6a9c7eeb42ca69b585f1'
    $packageArgs['checksumType'] = 'sha256'
} else {
    $packageArgs['url']          = 'https://github.com/Zaarrg/stremio-desktop-v5/releases/download/5.0.0-beta.19/Stremio.5.0.19-x86.exe'
    $packageArgs['checksum']     = '74a9ce5571aba133b8bb99c02202fd3de00bcd9e851144515d76745350219529'
    $packageArgs['checksumType'] = 'sha256'
}

Install-ChocolateyPackage @packageArgs
