Removes the Command Prompt flash on normal startup and fixes streaming-server launch from other working directories.

- Open **`stremio.exe` directly**. The native app now configures the same existing `user-data/webview`, `user-data/local` and `user-data/roaming` folders that the old batch launcher used. No profile migration or new sign-in is required.
- New and refreshed installer shortcuts point to the EXE. The compatibility `Start-Kai.cmd` is still included, but running a batch file can show a console.
- The streaming server now uses absolute executable/script paths and an explicit working directory. It continues to use `CREATE_NO_WINDOW`.
- Windows startup integration tests check an existing profile marker, paths containing spaces/Unicode, launching from another directory, inherited profile folders and a real child process with no console.
- Includes the previous movie/series blank-screen fix and build-specific UI URLs. Core 0.67.1, Kai's layout, MPV engine and native Simkl tracking remain unchanged.

Downloads:

- **Existing installations:** close Kai, extract `Stremio-Kai-Simkl-App-Update.zip` over the application folder, then open `stremio.exe`. It updates the EXE and UI without replacing `user-data`, MPV or configuration. Rerun the setup EXE to refresh old installed shortcuts, or point them to `stremio.exe` yourself.
- **Full Windows installation:** use `Stremio-Kai-Simkl-Setup-x64.exe`, or extract the complete `Stremio-Kai-Simkl-Windows-x64.zip`.
- The smaller UI-only ZIP updates the UI, but cannot fix native startup by itself.
- `SHA256SUMS.txt` contains download checksums.

The setup EXE and portable ZIP include the native Simkl integration, original Kai runtime and configuration, updated core 0.67.1 and the retained Kai UI layout. Packages are unsigned. See [SIMKL.md](https://github.com/helbetmathias/Stremio-Kai/blob/main/SIMKL.md) for setup and validation limits.
