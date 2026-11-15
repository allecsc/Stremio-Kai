@echo off
set "WEBVIEW2_USER_DATA_FOLDER=%~dp0user-data\webview"
set "LOCALAPPDATA=%~dp0user-data\local"
set "APPDATA=%~dp0user-data\roaming"
start "" /D "%~dp0" "%~dp0stremio.exe" %*

