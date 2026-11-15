[Setup]
AppId=StremioKaiSimklPreview
AppName=Stremio Kai Simkl
AppVersion=4.8.1
AppPublisher=helbetmathias / Stremio Kai contributors
AppPublisherURL=https://github.com/helbetmathias/Stremio-Kai
DefaultDirName={localappdata}\Programs\Stremio Kai Simkl
DefaultGroupName=Stremio Kai Simkl
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\out
OutputBaseFilename=Stremio-Kai-Simkl-Setup-x64
Compression=lzma2
SolidCompression=yes
UninstallDisplayIcon={app}\stremio.exe
[Files]
Source: "..\out\Stremio Kai Simkl\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{group}\Stremio Kai Simkl"; Filename: "{app}\stremio.exe"; IconFilename: "{app}\stremio.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\Stremio Kai Simkl"; Filename: "{app}\stremio.exe"; IconFilename: "{app}\stremio.exe"; WorkingDir: "{app}"
