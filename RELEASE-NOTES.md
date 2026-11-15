Fixes the brief yellow **Streaming server unavailable** warning during startup.

- Initial discovery and server reloads no longer display a failure warning or shift the account-menu layout.
- Actual failed requests still display the existing warning and recovery actions. Your Later / Don't show again preference is preserved.
- No delay, polling or extra network requests were added. The UI uses the core's existing `Loading`, `Ready` and `Err` states.
- Includes the previous movie/series blank-screen and console-free startup fixes. Kai's layout, MPV engine, core 0.67.1, Simkl and Trakt behavior are retained.

Downloads:

- **Existing installations:** close Kai, extract `Stremio-Kai-Simkl-App-Update.zip` over the application folder, then open `stremio.exe`. It preserves `user-data`, MPV and configuration.
- **Full Windows installation:** use `Stremio-Kai-Simkl-Setup-x64.exe`, or extract the complete `Stremio-Kai-Simkl-Windows-x64.zip`.
- **Already on simkl.3:** the smaller `Stremio-Kai-Simkl-WebUI-Update.zip` is sufficient for this warning fix.
- `SHA256SUMS.txt` contains download checksums.

The regression check uses the actual released WASM core's initial discovery state. Separate checks cover loading/reload, ready, genuine failure, recovery and active/expired dismissals. Packages are unsigned. See [SIMKL.md](https://github.com/helbetmathias/Stremio-Kai/blob/main/SIMKL.md) for setup and playback-validation limits.
