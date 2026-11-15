# Stremio Kai with native Simkl

This fork adds optional native Simkl tracking beside the existing Trakt controls. It contains the Windows shell, web UI and video bridge source, not just configuration changes. The playback engine, Kai theme, MPV configuration, shaders, Lua scripts and webmods are retained.

## Download and use

Download the Windows x64 installer or portable ZIP from [Releases](https://github.com/helbetmathias/Stremio-Kai/releases). These preview binaries are unsigned. The installer uses a separate per-user application directory and does not replace an existing Kai installation. The portable ZIP includes `stremio.exe`; use `Start-Kai.cmd` to keep the browser profile with the portable copy. Both packages include the runtime, configuration and bundled web UI; downloading only an executable is insufficient.

In Settings, find **Simkl Scrobbling** immediately after Trakt Scrobbling. Connect through the system browser, then enable tracking. Disconnect revokes this application's refresh token and removes its Windows credential. The toggle is independent of Trakt. Disable other Simkl scrobblers (including any Trakt-to-Simkl bridge) before enabling this one to avoid account-level duplicates. There are no Simkl catalogs or metadata substitutions.

This public desktop client's redirect registration is `http://127.0.0.1/auth/simkl`. OAuth uses a random loopback port, PKCE S256, state/issuer validation, and `media:read media:write`. No client secret is embedded. Access/refresh tokens stay in Windows Credential Manager; pending offline pause/stop events are encrypted with Windows DPAPI. Tokens never enter web UI state or release packages.

## Components and updates

The second Simkl release fixes a title-details crash caused by core 0.67.1 omitting the legacy `metaExtensions` field. Movie/series detail state is now checked through the actual React extension-tab hook in CI. Bundled navigation uses a build-specific URL so updates do not reopen an old cached page. Existing installations can use the small WebUI update ZIP without replacing their profile or runtime.

| Component | Version / source |
| --- | --- |
| Kai configuration/theme/runtime | upstream Kai 4.8.0, pinned archive SHA-256 |
| Native shell | parent 5.0.22 fixes, plus native Simkl |
| Web UI layout | Zaarrg beta.29 shell UI, retained at the user's request |
| Rust/WASM core | **0.67.1**, from official web UI 5.1.0 |
| Compatible web UI backports | core client-info and stream encoding; live-playback duration fix |
| Video bridge | Kai's 0.0.68 shell bridge plus metadata-bound native load |
| MPV engine | original Kai DLL, hash checked during packaging |

This deliberately does **not** claim to include the entire official web UI 5.1.0: its new Settings/router architecture would change Kai's layout. The core upgrade includes tracking-resource support; addon behavior in this retained UI must be validated separately. The Simkl implementation uses MPV events directly and needs no tracking addon.

The stock signed updater is disabled to prevent it replacing the fork with stock Kai. Updates currently come from this fork's GitHub releases. The public source and Windows CI are included so future dependency updates are reviewable.

## Playback behavior

Media identity comes from Stremio's selected metadata/video IDs. IMDb movies and IMDb show season/episode IDs are supported, including season zero specials. Anime supports IMDb show mappings and unambiguous Kitsu/MAL/AniList/AniDB absolute episode IDs. Unknown or mismatched IDs are skipped rather than guessed from filenames.

Start, pause and stop follow real MPV lifecycle events. Position/duration observations calculate percentages but send no periodic heartbeats. Seeking updates local progress. Closing or switching playback stops the previous session; natural completion sends 100%. Simkl decides whether a stop is a watched scrobble or saved partial progress. Duplicate session events are coalesced. Rate limits defer work to a later real event or restart, without polling. Offline pause/stop events persist encrypted and retry on subsequent activity/startup.

Local Stremio resume continues to work. Importing Simkl's cross-device resume positions, watchlists or full watched history is outside this change.

## Validation and remaining limits

The initial native implementation was tested in the actual Kai MPV application with real Simkl OAuth and API receipts: a movie's start/pause/seek/resume/early close/completion; two TV episodes and switching; IMDb-based anime; disabling and persistence; disconnect/reconnect; actual refresh after forcing an expired local timestamp; and encrypted offline queue recovery. Authenticated Trakt player events continued. Remote Trakt history was not independently audited. Native anime-provider parsing has automated coverage; live anime used IMDb mapping.

Those live results predate the core 0.67.1 upgrade. Build/test status for the updated package is tracked by Windows CI and the release notes. Do not treat the earlier playback tests as proof that every feature still works after a core upgrade. HDR/SVP/upscaling combinations, live 401/revocation/rate-limit responses, and all addons are not exhaustively tested.

## Build

The [Windows build workflow](.github/workflows/windows.yml) uses GitHub's Windows runner; no local C++ installation is required. It builds the web UI with Node 22/pnpm 9.15.9, runs metadata tests, builds C++20 using MSVC and pinned vcpkg dependencies, runs CTest, verifies the original Kai runtime/MPV hashes, then creates an Inno Setup installer and portable ZIP with SHA-256 checksums. A `v*-simkl*` tag publishes a prerelease. Fork PRs use read-only workflow permissions and require no account credentials.

For a manual Windows build: install MSVC/Windows SDK, CMake, Git, Node 22, pnpm 9.15.9, 7-Zip, Inno Setup 6 and vcpkg. Run `pnpm --dir web-ui install --frozen-lockfile --ignore-scripts`, `pnpm --dir web-ui build`, `build-scripts/prepare.ps1`, and the CMake commands shown in the workflow. `GH_TOKEN` is only needed by the GitHub CLI to download the public upstream release. Never commit personal browser profiles or tokens.

