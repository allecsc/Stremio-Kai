<div align="center">
<img width="200" alt="Stremio-Kai-v3.0" src="https://github.com/user-attachments/assets/bd873188-cc6b-45c4-bf82-289e17752b00" />

  <h1>Stremio Kai</h1>

  <p><i>A custom Stremio + MPV build that offers premium features and feels amazing—even on modest hardware.</i></p>

  <a href="https://github.com/allecsc/Stremio-Kai/releases/latest">
    <img src="https://img.shields.io/github/v/release/allecsc/Stremio-Kai?label=DOWNLOAD&style=for-the-badge&color=44cc11&logo=github" alt="Download Latest Release">
  </a>
  <a href="https://github.com/allecsc/Stremio-Kai/wiki">
    <img src="https://img.shields.io/badge/DOCS-WIKI-007ec6?style=for-the-badge&logo=gitbook&logoColor=white" alt="Documentation">
  </a>
  <a href="https://github.com/allecsc/Stremio-Kai/issues">
    <img src="https://img.shields.io/badge/REPORT-ISSUE-e05d44?style=for-the-badge&logo=github&logoColor=white" alt="Report an Issue">
  </a>
</div>

---


<div align="center">
  
  <img width="1920" alt="Main Page" src="https://github.com/user-attachments/assets/c185b0da-0c22-4856-a1c1-cd91b67d637c" />

</div>


# ✨What is Stremio Kai?

The heart of Stremio Kai — a refined fork of Stremio Community Edition — is its focus on stunning clarity, smart automation, and smooth motion even on modest hardware. For standard content, it behaves exactly like Community Edition, but adds intelligent automation and *optional* anime‑specific playback profiles when they’re relevant. The “Kai” suffix reflects its purpose: a remastered take on Community Edition, enhancing the engine, UI, and automation for a premium experience.

Why bother with manual adjustments? Stremio Kai handles them for you — detecting content type, applying optimal playback settings, choosing the right subtitles, and even skipping intros and outros Netflix‑style, letting you simply relax and watch.

This blend of automation and precision tuning transforms the project from a configuration into a fully intelligent system. Every component was purpose‑built or carefully refined to eliminate real‑world annoyances and deliver a consistently exceptional viewing experience.

### ⭐ Key Features

- **Zero-Config Portability** — A fully self-contained, "extract and play" build. No installation, no registry traces, and zero dependencies—works directly from any folder or USB drive.
- **Modernized UI/UX**
  - **Dynamic Discovery** - Feature-rich Hero Banner with daily fresh recommendations for movies and series.
  - **Metadata Panel** - Rich details for quick content insights on hover. 
  - **Hidden Navigation** — Sidebar and search bar automatically hide/show on hover for a distraction-free viewing experience.
  - **OLED (Pure Black) Mode** — High-contrast theme optimized for dark rooms and premium displays.
  - **Integrated Update System** — Native notifications ensure you are always running the latest features and improvements.


- **Intelligent Automation Suite**
  - **[Skip Opening Notifications](https://github.com/allecsc/Stremio-Kai/wiki/%F0%9F%94%AC-Under-the-Hood#-skip-intro-w-notification-find-out-more)** — Automatically detects intro and outro sequences and offers the ability to skip it by simply pressing a button.
  - **[Smart Subtitle Selector](https://github.com/allecsc/Stremio-Kai/wiki/%F0%9F%94%AC-Under-the-Hood#%EF%B8%8F-smart-subtitle-selector-find-out-more)** — Remembers your preferred language and subtitle track settings.
  - **[Hover-Seek Thumbnails](https://github.com/allecsc/Stremio-Kai/wiki/%F0%9F%94%AC-Under-the-Hood#%EF%B8%8F-timestamp--thumbnails-preview)** — Visual preview while seeking through the timeline.


- **[Advanced Player Presets](https://github.com/allecsc/Stremio-Kai/wiki/%F0%9F%94%AC-Under-the-Hood#-visually-stunning-predefined-profiles)**
  - **Hi-Fi Audio** — Cinematic, bit-perfect lossless audio mixing for high-end sound stages.
  - **Cinematic HDR** — Pure HDR passthrough ensuring a true-to-source, high-dynamic-range experience.

- **For Anime Enthusiasts**
  - **Daily Schedule** - Track today's latest episode releases directly through the hero banner.
  - **[Anime4K Upscaling](https://github.com/allecsc/Stremio-Kai/wiki/%F0%9F%94%AC-Under-the-Hood#-real-time-upscaling-with-anime4k-optional)** — Razor-sharp edges for animated content. `[Optional - Full Build Only]`
  - **[SVP Interpolation](https://github.com/allecsc/Stremio-Kai/wiki/%F0%9F%94%AC-Under-the-Hood#iii-the-smooth-motion-suite-optional-find-out-more)** — High-fluidity 48/60fps motion for a smoother experience. `[Optional - Full Build Only]`

> *Note: These enhancements are non-intrusive and automatically bypass standard content.*

    
### 🔜 Coming Soon in v3.1:

- **Expanded details view** — Richer movie and series pages with additional ratings, detailed genres, episode overviews, and full cast listings with photos.
- **Auto fullscreen launch** — Optional setting to start Stremio Kai directly in fullscreen for a seamless living-room experience.
- **Custom hero banner sources** — Choose from multiple movie and series lists for the hero banner, including support for custom MDBList collections.
- **TMDB & MDBList API integration** — Use personal API keys for improved metadata accuracy.
- **More quality-of-life improvements** — Ongoing refinements across UI, automation, and playback.


# 🚀 Installation

Stremio Kai is a completely self-contained, portable system. All dependencies—SVP, VapourSynth, MPV, shaders, and scripts—are included and pre-configured. No separate installation is required.  

### 📦 Choose Your Build

| Feature | Stremio Kai (Full) | Stremio Kai Zero |
| --- | --- | --- |
| **Modern UI & OLED Mode** | ✅ | ✅ |
| **Automation & Smart Subs** | ✅ | ✅ |
| **Skip Intro & Seek Thumbnails** | ✅ | ✅ |
| **Anime4K Upscaling** | ✅ | ❌ |
| **SVP Motion Interpolation** | ✅ | ❌ |

> [!NOTE]
> The **Full Build** is recommended for the absolute best visual fidelity. The enhancements are intelligently triggered and will not interfere with or degrade your experience when watching standard movies or TV shows. _**Stremio Kai Zero** offers the same core experience without the anime-specific ones: SVP and Anime4K._

### 1. Download  
Grab the latest Stremio-Kai_vX.X.7z **OR** Stremio-Kai_vX.X-Zero from [releases](https://github.com/allecsc/Stremio-Kai/releases).
### 2. Extract  
* Unzip the entire contents of the 7z archive to a location of your choice on your computer (e.g., C:\\Program Files\\Stremio Kai or D:\\PortableApps\\Stremio Kai).  
### 3. Run  
* Double-click stremio.exe. That's it. Log in to your Stremio account and enjoy.

### 🔧 Configuration & Usage:
  * **🔌 This is a "Plug-and-Play" Build:**
    The scripts and configurations have been custom-built to work together out of the box. The goal is to provide a seamless experience with minimal user tinkering.
  * **🔬 For Advanced Users:**
    While most default settings are optimal, power users can adjust `.conf` files for each script. Only modify these settings if you understand what they do. This is a personalized setup, and while it's designed to be universal, unique hardware or software combinations may lead to unpredictable issues. Please consult the wiki for more details about [how Stremio Kai works](https://github.com/allecsc/Stremio-Kai/wiki/%F0%9F%94%AC-Under-the-Hood).
  
### 📣 Support & Contributions:
- 🐛 Bug Reports & Feature Requests: Please [open an issue](https://github.com/allecsc/Stremio-Kai/issues) on GitHub
- 💬 Feedback Welcome: Suggestions that improve usability or performance are appreciated

# 🖼️ Gallery

<div align="center">

<img height="500" alt="Metadata Panel" src="https://github.com/user-attachments/assets/00a6333b-41b1-4323-98b0-e9851f28b7fd" />

> _Metadata Panel - Shows up on hover over a poster_

<br>

![sidebar-hide](https://github.com/user-attachments/assets/ed26d49a-93ad-4b62-b422-7265e1835f75)

> _Hidden Navigation - Shows up on hover_

<br>
  
![oled-toggle](https://github.com/user-attachments/assets/98925c06-bb27-4df5-8e5c-701eb7c32385)

> _Theme toggle_

<br>

<img height="450" alt="Skip-Intro" src="https://github.com/user-attachments/assets/c3b65119-dc74-475f-8659-2201a843bff4" />

> _Skip Opening Notification_

</div>

<br>

### v3.1 Early Preview:

<div align="center">
  
<img height="450" alt="Movie Details" src="https://github.com/user-attachments/assets/c9f0b086-3b80-4b59-9150-b178411dfaf7" />

> _Details page for movies will include cast with photos_

<br>

<img height="450" alt="Series Details" src="https://github.com/user-attachments/assets/5718fb1e-faf9-4be0-b24d-c6d73e13a579" />

> _Details page for series will include cast with photos and episode overviews_

</div>

<br>

---

## ⚠️ Disclaimer
Stremio Kai is an independent, fan-driven project and is not affiliated with the official Stremio team or any third-party plugin developers.
This software is provided “as is,” without warranties of any kind. The maintainers do not endorse or support illegal streaming or distribution of copyrighted content. Users are solely responsible for ensuring their usage complies with all applicable laws and regulations in their jurisdiction.
Use responsibly and at your own discretion.

---

## 🙏 Acknowledgements

This project stands on the shoulders of giants and wouldn't be possible without their incredible work.

* A massive thank you to **Zaarrg** for creating the original [**stremio-community-v5**](https://github.com/Zaarrg/stremio-community-v5), which provides the essential MPV integration that this entire project is built upon.  
* Credit and thanks to the brilliant team behind [**bloc97/Anime4K**](https://github.com/bloc97/Anime4K) for their amazing upscaling shaders.

<br><br>

<div align="center"><h2>💖 Support the Project</h2></p></div>
<p align="center">If Stremio Kai made your setup smoother and you’d like to support my work, you can <a href="https://ko-fi.com/allecsc">buy me a coffee</a>.</br><strong>Thanks for the kind gesture!</strong></p>

<p align="center">
  <a href="https://ko-fi.com/allecsc">
    <img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Support me on Ko-fi">
  </a>
</p>
<p align="center">
  <img src="https://github.com/user-attachments/assets/a0f2ef09-2932-4f74-89aa-58d949f65e5f" alt="Crypto Address" width="200"/>
</p>
<p align="center">
  <small><i>Crypto (USDT TRC-20):</br> TE4LPfv6tgYbucSxrUsagSN9DiPimBVrwX</i></small>
</p>
<br>

<p align="center">
    <strong>✨ Built with love for the series that keep us up all night. Enjoy the view. ✨</br>- Alt </strong>
</p>
