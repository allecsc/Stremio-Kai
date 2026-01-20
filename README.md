<img height="0" alt="AIO-logo-allecsc" src="https://github.com/user-attachments/assets/4ff6d062-8b2e-4cfe-9d14-358834142c13" />

<div align="center">
<img width="200" alt="Stremio-Kai-v4.0" src="https://github.com/user-attachments/assets/36bc9425-24bc-4334-ac66-9c5645319afc" />

  <h1>Stremio Kai</h1>

  <p><i>A custom Stremio + MPV build that offers premium features and feels amazing—even on modest hardware.</i></p>

<p align="center">
  <img src="https://img.shields.io/badge/PLATFORM-WINDOWS-0078d4?style=for-the-badge&logo=windows&logoColor=white" alt="Windows Only">
  <a href="https://github.com/allecsc/Stremio-Kai/releases/latest">
    <img src="https://img.shields.io/github/v/release/allecsc/Stremio-Kai?label=DOWNLOAD&style=for-the-badge&color=44cc11&logo=github" alt="Download">
  </a>
  <a href="https://github.com/allecsc/Stremio-Kai/wiki">
    <img src="https://img.shields.io/badge/DOCS-WIKI-007ec6?style=for-the-badge&logo=gitbook&logoColor=white" alt="Wiki">
  </a>
  <a href="https://github.com/allecsc/Stremio-Kai/issues">
    <img src="https://img.shields.io/badge/REPORT-ISSUE-e05d44?style=for-the-badge&logo=github&logoColor=white" alt="Report">
  </a>
  <img src="https://img.shields.io/github/downloads/allecsc/Stremio-Kai/total?style=for-the-badge&color=6a737d&label=Downloads" alt="Total Downloads">
</p>
  
</div>

---


<div align="center">
  
  <img width="1920" alt="Main Page" src="https://github.com/user-attachments/assets/66b40b66-9888-42af-95c7-2c0b25e15788" />

</div>


<div align="center"><h2>✨ What is Stremio Kai?</h2></div>

The heart of Stremio Kai — a refined fork of Stremio Community Edition — is its focus on stunning clarity, smart automation, and smooth motion even on modest hardware. For standard content, it behaves exactly like Community Edition, but adds intelligent automation and *optional* anime‑specific playback profiles when they're relevant. The "Kai" suffix reflects its purpose: a remastered take on Community Edition, enhancing the engine, UI, and automation for a premium experience.

Why bother with manual adjustments? Stremio Kai handles them for you — detecting content type, applying optimal playback settings, choosing the right subtitles and audio tracks, and even skipping intros and outros Netflix‑style, letting you simply relax and watch.

This blend of automation and precision tuning transforms the project from a configuration into a fully intelligent system. Every component was purpose‑built or carefully refined to eliminate real‑world annoyances and deliver a consistently exceptional viewing experience.

### ⭐ Key Features

- **Zero-Config Portability** — A fully self-contained, "extract and play" build. No installation, no registry traces, and zero dependencies—works directly from any folder or USB drive. Now also available as an **optional installer** for streamlined setup.
- **Modernized UI/UX**
  - **Dynamic Discovery** - Feature-rich Hero Banner with daily fresh recommendations for movies and series, now with customizable catalog sources including MDBList integration.
  - **Metadata Panel** - Rich details for quick content insights on hover, featuring **localized metadata** in your preferred language with multiple rating sources (IMDb, TMDB, Trakt, MAL, AniList, Kitsu).
  - **Enhanced Details Pages** - Complete metadata with cast & crew photos, character names, network badges, studio logos, episode descriptions, and all ratings available.
  - **Hidden Navigation** — Sidebar and search bar automatically hide/show on hover for a distraction-free viewing experience.
  - **OLED (Pure Black) Mode** — High-contrast theme optimized for dark rooms and premium displays.
  - **Auto Fullscreen** — Optional setting to start Stremio Kai directly in fullscreen for a seamless living-room experience.
  - **Custom Hero Banner Sources** — Choose from multiple movie and series lists for the hero banner, including support for custom MDBList collections.
  - **Integrated Update System** — Native notifications ensure you are always running the latest features and improvements.


- **Intelligent Automation Suite**
  - **[Skip Opening Notifications](https://github.com/allecsc/Stremio-Kai/wiki/%F0%9F%94%94-Skip-Intro-%E2%80%90-Technical-Sheet)** — Automatically detects intro and outro sequences and offers the ability to skip it by simply pressing a button. Now with confirmation system for skips outside detection windows.
  - **[Smart Track Selector](https://github.com/allecsc/Stremio-Kai/wiki/%E2%9C%94%EF%B8%8F-Smart-Track-Selector-(Stremio-Integration)-%E2%80%90-Technical-Sheet)** — Intelligently selects the best audio and subtitle tracks based on your preferences. Features **Native Forced Override** for perfect subtitle selection in both native and foreign language content, and rejection lists based on language and keywords.
  - **[Hover-Seek Thumbnails](https://github.com/allecsc/Stremio-Kai/wiki/%F0%9F%94%AC-Under-the-Hood#%EF%B8%8F-timestamp--thumbnails-preview)** — Visual preview while seeking through the timeline.


- **[Advanced Player Presets](https://github.com/allecsc/Stremio-Kai/wiki/%F0%9F%94%AC-Under-the-Hood#-visually-stunning-predefined-profiles)**
  - **Hi-Fi Audio** — Cinematic, bit-perfect lossless audio mixing for high-end sound stages with context-aware presets (Cinema/Anime/Night Mode).
  - **Visual Profiles** — Cycle between Kai (cinematic), Vivid (high contrast), and Original (neutral) color profiles.
  - **Cinematic HDR** — Pure HDR passthrough ensuring a true-to-source, high-dynamic-range experience, with automatic HDR-to-SDR tonemapping for non-HDR displays.

- **For Anime Enthusiasts**
  - **Daily Schedule** - Track today's latest episode releases directly through the hero banner.
  - **[Anime4K Upscaling](https://github.com/allecsc/Stremio-Kai/wiki/%F0%9F%94%AC-Under-the-Hood#-real-time-upscaling-with-anime4k-optional)** — Razor-sharp edges for animated content with multiple quality presets (Optimized/Fast/HQ). `[Optional - Toggleable]`
  - **[SVP Interpolation](https://github.com/allecsc/Stremio-Kai/wiki/%F0%9F%94%AC-Under-the-Hood#iii-the-smooth-motion-suite-optional-find-out-more)** — High-fluidity 48/60fps motion for a smoother experience. `[Optional - Toggleable]`

    > *Note: These enhancements are non-intrusive and automatically bypass standard content. All features are now toggleable via Settings.*

- **Settings Overhaul**
  - **No More Config File Editing** — All player settings, track selection preferences, metadata options, and anime enhancements are now configurable directly in the Settings UI.
  - **First-Time Setup Wizard** — Guided configuration for new installations.
  - **Private API Integration** — Optional TMDB and MDBList API keys for enhanced metadata enrichment.
  - **Instant Changes** — Settings apply immediately to currently playing content.

<br>

---

<div align="center"><h2>🚀 Installation</h2></div>

Stremio Kai is a completely self-contained, portable system. All dependencies—SVP, VapourSynth, MPV, shaders, and scripts—are included and pre-configured. No separate installation is required.  

### Installation Methods

**Option 1: Installer (New!)**
1. Download the **Stremio-Kai-Installer.exe** from the [Releases Page](https://github.com/allecsc/Stremio-Kai/releases/latest)
2. Run the installer and follow the guided setup
3. Launch Stremio Kai from Start Menu or Desktop shortcut

**Option 2: Portable Archive**
1. Download the **Stremio-Kai.7z** archive from the [Releases Page](https://github.com/allecsc/Stremio-Kai/releases/latest)
2. Extract the entire contents of the `.7z` archive
   > [!CAUTION]
   > To avoid Windows permission issues, **do not** extract to `C:\Program Files\`. Use a user-writeable directory such as `C:\Stremio-Kai` or any location on a non-system drive (e.g., `D:\Apps\Stremio-Kai`).
3. Double-click `stremio.exe`. Log in to your account and enjoy the premium experience.

### 🔧 Configuration & Usage:
* **🔌 Plug-and-Play:** Scripts and configurations are custom-tuned to work out of the box. No manual setup is required.
* **⚙️ UI-First Settings:** All customization options are now accessible through the Settings page—no need to edit config files.
* **🔬 Advanced Customization:** While default settings are optimized for 99% of users, advanced users can still modify `.conf` files within the internal folders if needed.
  > **Note:** Only perform manual modifications if you have consulted the [Wiki Documentation](https://github.com/allecsc/Stremio-Kai/wiki/) and understand how to do it. Most settings are now better managed through the UI.

### 📦 Build Information:
Starting with v4.0, **Stremio Kai Zero is no longer distributed as a separate build**. All features are now toggleable within the Settings page, allowing you to customize your experience from minimal to feature-rich without needing separate downloads.
  
### 📣 Support & Contributions:
- 🐛 Bug Reports & Feature Requests: Please [open an issue](https://github.com/allecsc/Stremio-Kai/issues) on GitHub
- 💬 Feedback Welcome: Suggestions that improve usability or performance are appreciated

<br>

---

<div align="center">
  
  <h2>🖼️ Gallery</h2>

<img width="805" height="480" alt="Metadata Panel" src="https://github.com/user-attachments/assets/cf7239d6-7238-4280-8a7a-2b7d60d60d58" />

  > _Metadata Panel - Shows up on hover over a poster_

<br>

![sidebar-hide](https://github.com/user-attachments/assets/ed26d49a-93ad-4b62-b422-7265e1835f75)

  > _Hidden Navigation - Shows up on hover_

<br>
  
![oled-toggle](https://github.com/user-attachments/assets/98925c06-bb27-4df5-8e5c-701eb7c32385)

  > _Theme toggle_

<br>

<img width="805" height="480" alt="Skip-Intro" src="https://github.com/user-attachments/assets/c3b65119-dc74-475f-8659-2201a843bff4" />

  > _Skip Opening Notification_

</div>

<br>

<div align="center">
  
<img width="805" height="480" alt="Movie Details" src="https://github.com/user-attachments/assets/3563832e-a366-402f-83fc-d040d3fbf5d4" />

  > _Details page for movies with complete metadata and cast with photos_

<br>

<img width="805" height="480" alt="Series Details" src="https://github.com/user-attachments/assets/851b2880-827d-44e5-9cde-9a86807598f1" />

  > _Details page for series with complete metadata, cast with photos and episode overviews_

<br>
  
<img width="805" height="480" alt="Localized Main Page" src="https://github.com/user-attachments/assets/786eab85-e839-409c-9d54-4c65f0768efe" />

  > _Main page with localized logo and metadata_

<br>

<img width="805" height="480" alt="Series Details" src="https://github.com/user-attachments/assets/5ae44d55-649c-4f88-afb6-1078cf3ce35f" />

  > _Details page with localized logo and metadata_

</div>

<br>

---

<div align="center"><h2>⚠️ Disclaimer</h2></div>
Stremio Kai is an independent, fan-driven project and is not affiliated with the official Stremio team or any third-party plugin developers.
This software is provided “as is,” without warranties of any kind. The maintainers do not endorse or support illegal streaming or distribution of copyrighted content. Users are solely responsible for ensuring their usage complies with all applicable laws and regulations in their jurisdiction.
Use responsibly and at your own discretion.



<div align="center"><h2>🙏 Acknowledgements</h2></div>

This project stands on the shoulders of giants and wouldn't be possible without their incredible work.

* A massive thank you to **Zaarrg** for creating the original [**stremio-community-v5**](https://github.com/Zaarrg/stremio-community-v5), which provides the essential MPV integration that this entire project is built upon.  
* Credit and thanks to the brilliant team behind [**bloc97/Anime4K**](https://github.com/bloc97/Anime4K) for their amazing upscaling shaders.


<div align="center">
  <h2>💖 Support the Project</h2>
</div>

<p align="center">
  If Stremio Kai made your setup smoother and you’d like to support my work,
  the best way is a direct donation (lowest fees).
</p>

<!-- REVOLUT PRIMARY -->
<p align="center">
  <a href="https://revolut.me/altcelalalt" target="_blank">
    <img
      src="https://img.shields.io/badge/Donate%20via-Revolut-5f05ff?style=for-the-badge&logo=revolut&logoColor=white"
      alt="Donate via Revolut"
    />
  </a>
</p>

<p align="center">
  <small><i>Lowest fees • Instant • Any amount</i></small>
</p>

<br>

<!-- KOFI SECONDARY -->
<p align="center">
  <a href="https://ko-fi.com/allecsc">
    <img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Support me on Ko-fi">
  </a>
</p>

<p align="center">
  <small><i>Ko-fi (card payments, higher fees)</i></small>
</p>

<br>

<!-- CRYPTO -->
<p align="center">
  <img src="https://github.com/user-attachments/assets/a0f2ef09-2932-4f74-89aa-58d949f65e5f" alt="Crypto Address" width="200"/>
</p>

<p align="center">
  <small><i>Crypto (USDT TRC-20):<br>TE4LPfv6tgYbucSxrUsagSN9DiPimBVrwX</i></small>
</p>

<br>

<p align="center">
    <strong>✨ Built with love for the series that keep us up all night. Enjoy the view. ✨</br>- Alt </strong>
</p>
