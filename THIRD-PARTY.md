# Source provenance and licenses

The original Kai repository and its GPL-3.0 license remain intact. Native shell source is from [Zaarrg/stremio-community-v5](https://github.com/Zaarrg/stremio-community-v5), baseline `f6b08f62679a780510f5cf9b853726ec26a939bd`, with 5.0.22 security fixes from `3e96a6f6468dc87016869b1df6d516f92f6ed8cd`; see `native/LICENSE.md`.

Web UI source is [Zaarrg/stremio-web-shell-fixes](https://github.com/Zaarrg/stremio-web-shell-fixes) at `6f6b0558dbb064bca18a8dcc22cb1f3f4c455b22` with local Simkl changes and compatible fixes based on official Stremio web `v5.1.0` (`991c0dedad545f212844522f170027455cd31954`). Its GPL-2.0 license is preserved at `web-ui/LICENSE.md`. The upstream package declares GPL-2.0; these components are distributed separately with their own licenses.

The video bridge is [Zaarrg/stremio-video](https://github.com/Zaarrg/stremio-video) at `6fa06beb5710e5772960361c0d31cc1707939e27` plus the native metadata handoff, under the MIT license declared by its package. Original copyright headers remain. Official core 0.67.1 is an npm dependency with its own MIT license. See `web-ui/pnpm-lock.yaml` for exact JavaScript dependencies and upstream license metadata.

Discord RPC 3.4.0 (MIT) is vendored as source under `native/deps/discord-rpc-source`, with additional rich-presence fields required by the parent shell. The SDK's missing modified binary is replaced by a source build. RapidJSON 1.1.0 headers and license are under `native/deps/rapidjson`. Source modifications are described in `KAI-NOTES.txt`.

The Windows build downloads the unmodified Kai 4.8.0 runtime archive and preserves its bundled third-party runtime files and notices. The MPV SDK is pinned to Zaarrg/libmpv `d57999b78b2d7b22f32f3a827a44903fdaa59e62`; the playback DLL is Kai's original. OpenSSL, curl, WebView2 and other native dependencies come from the vcpkg baseline in `native/vcpkg.json`.
