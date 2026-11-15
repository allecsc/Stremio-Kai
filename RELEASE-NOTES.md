Fixes the blank screen when opening a movie or series in the first Simkl release.

Core 0.67.1 removed the legacy `metaExtensions` field. The retained Kai title-details screen tried to iterate it and crashed. Missing extension tabs now render as an empty list; legacy tabs still work when provided. The core, Kai layout and MPV engine remain unchanged.

The regression test exercises the real core's movie and series detail states through the actual React extension-tab hook, and also checks legacy extension rendering. Bundled UI navigation now includes its build identifier to avoid loading a stale cached page after an update.

Downloads:

- **Existing installations:** extract `Stremio-Kai-Simkl-WebUI-Update.zip` over the application folder and use `Start-Kai.cmd`. This updates the web UI and launcher; it does not contain or replace `user-data`.
- **Full Windows installation:** use `Stremio-Kai-Simkl-Setup-x64.exe`, or extract the complete `Stremio-Kai-Simkl-Windows-x64.zip`.
- `SHA256SUMS.txt` contains download checksums.

The setup EXE and portable ZIP include the native Simkl integration, original Kai runtime and configuration, updated core 0.67.1 and the retained Kai UI layout. Packages are unsigned. See [SIMKL.md](https://github.com/helbetmathias/Stremio-Kai/blob/main/SIMKL.md) for setup and validation limits.
