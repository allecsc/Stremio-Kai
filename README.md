<div align="center">
  <img src="https://github.com/user-attachments/assets/f8b5ad4d-bac0-4110-b9ac-7961de312c22" alt="Stremio Kai Logo" width="200"/>
  <h1>Stremio Kai</h1>
  <p><h3>Built for Anime, Engineered for Performance</h3></p>
  <p><i>A custom Stremio + MPV build that makes anime look and feel amazing—even on modest hardware.</i></p>
  </br>
  <img src="https://img.shields.io/badge/🪟%20Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows" />
  <img src="https://img.shields.io/badge/%20Stremio-8B57D3?style=for-the-badge&logo=stremio&logoColor=white" alt="Stremio" />
  <img src="https://img.shields.io/badge/🌐%20WebView2-0078D6?style=for-the-badge&logo=microsoftedge&logoColor=white" alt="WebView2" />
  <img src="https://img.shields.io/badge/%20MPV-663399?style=for-the-badge&logo=mpv&logoColor=white" alt="MPV" />
  <img src="https://img.shields.io/badge/🎨%20Anime4K-2D72D8?style=for-the-badge&logo=&logoColor=white" alt="Anime4K" />
  <img src="https://img.shields.io/badge/⏩%20SVP-4A4A4A?style=for-the-badge&logo=&logoColor=white" alt="SVP" />
  <img src="https://img.shields.io/badge/%20Lua-2C2D72?style=for-the-badge&logo=lua&logoColor=white" alt="Lua" />
</div>

---

### 🚀 Core Architecture
- 🧱 **[Stremio Community v5](https://github.com/Zaarrg/stremio-community-v5) Base**: Fast, open-source, and actively maintained
- 🖥️ **Windows Desktop App**: Portable, self-contained, and install-free
- 🌐 **WebView2 Engine**: Always up-to-date with the latest Stremio Web UI
- 🔄 **Built-in Autoupdate**: No manual updates—just launch and go

### 🎬 MPV Playback Engine
- 🧠 **Full MPV Integration**: Native playback with full config access
- 🖥️ **Hardware Decoding**: Supports Vulkan, OpenGL, D3D, and HDR
- 🔊 **Bit-Perfect Audio**: Dolby Atmos, DTS-HD, and lossless passthrough
- 🎨 **Anime4K Shader Presets**: Custom chains for upscaling, line thinning, and denoise
- ⏩ **SVP Motion Interpolation**: Smooth playback with fallback logic and cleanup

### 🧠 Smart Automation
- 🔄 **Auto Profile Switching**: Detects resolution, language, and HDR
- 🔡 **Smart Subtitle Selector**: Filters out karaoke, signs, and junk tracks
- ⏭️ **Smart Skip**: Detects and skips intros, outros, and previews
- ⚡ **Reactive VF Bypass**: Prevents lag during seeks by temporarily disabling filters
- 🧹 **SVP Cleanup**: Clears filters between episodes to prevent crashes

### 📁 Local & Torrent Support
- 📦 **Drag-and-Drop Playback**: Supports any file MPV can handle
- 🔠 **Local Subtitles**: Add external subs (.srt, .ass) with drag and drop
- 🎨 **Subtitle Styling**: Customize fonts, colors, and positioning via MPV
- 🌀 **Torrent Support**: Play `.torrent` files and magnet links directly

### 🌐 Addons & Integration
- ➕ **One-Click Addon Install**: No copy-pasting URLs
- 📦 **AIOstreams Template**: Helps pick the best source for your setup
- 💬 **Discord Rich Presence**: Show what you're watching in real-time

### 🖥️ Desktop Experience
- 📺 **Picture-in-Picture Mode**: Multitask while watching
- 🖼️ **Thumbnail Preview**: Thumbfast support (partially functional)
- ⚙️ **App Settings**: Customize behavior like PauseOnMinimize, CloseOnExit, etc.

---

# **⭐ Features**

Why fuss with manual tweaks? Stremio Kai's scripts think for you, detecting content type and applying perfect settings automatically. It knows if you're binging anime or a movie, picks the right subtitles, and skips intros like Netflix—freeing you to relax.

This is what elevates the project from a simple configuration to a complete, intelligent system. Each component was custom-built or meticulously tuned to solve real-world frustrations and deliver the ultimate anime viewing experience.

The core of Stremio Kai is a visual pipeline engineered for anime, delivering breathtaking clarity and fluid motion without requiring a high-end PC.

</br>

## 🎨 I: The Visual Enhancement Suite

This is the heart of the project's visual philosophy. It's a curated collection of advanced shaders and carefully tuned profiles that work together to upscale, sharpen, and denoise content in real-time. Forget blurry, low-resolution anime; this suite ensures every frame is clean, sharp, and perfectly optimized for your display, from vintage 480p classics to modern 1080p releases.

</br>

### 🤩 Visually Stunning Predefined Profiles

| Profile Name | Content Type | Core Function |
| :---- | :---- | :---- |
| **[anime-sdr]** | Standard Definition (SD) &</br>High Definition (HD)</br>Anime | Enables the  full suite of enhancements: SVP motion</br>smoothing, Anime4K upscaling, and the custom anime</br>audio mix. |
| **[anime-hdr]** | High Dynamic Range (HDR)</br>Anime | Builds on the anime profile but adds true HDR</br>passthrough for vibrant colors an brightness on</br>compatible displays. |
| **[anime-old]** | Legacy & Interlaced</br>Anime (480i, 576i) | A special profile for older shows. It enables a high-quality</br>deinterlacer (bwdif) to fix visual combing artifacts</br>before sending it to the SVP engine. |
| **[hdr]** | HDR Movies & TV Shows | A minimalist profile designed for cinematic HDR content.</br>It disables anime-specific shaders and enables pure HDR</br>passthrough for a true-to-source experience. |
| **[sdr]** | SDR Movies & TV Shows | The default for all non-anime, non-HDR content. Uses</br>high-quality scaling algorithms and a cinematic audio mix. |

> *You never need to touch these, but it helps to know how Stremio Kai selects and defines its view. Advanced users can fine-tune the specific settings for each of these profiles directly in the mpv.conf file.*

</br>

### 🪄 Real-time Upscaling with Anime4K
> _A collection of advanced, real-time shaders designed to upscale, clean, and refine anime for high-resolution displays._

Bring your favorite anime into the 4K era with the powerful [Anime4K](https://github.com/bloc97/Anime4K) shader suite pre-installed and expertly configured. 

* **Pre-Tuned Presets:** No need to mess with individual shader files. Several high-quality shader chains have been curated into easy-to-use presets, accessible via simple hotkeys.  
* **Optional Denoise:** A gentle denoise shader (denoise3.glsl) is enabled by default on anime profiles. It's a subjective touch that softens shadows and adds a subtle sense of depth. If you prefer a sharper image, it can be disabled with a single key press (see the cheatsheet below) or permanently through the mpv.conf file.

#### 😤 The Annoying Problem This Fixes

- Much of the anime we love wasn't created for modern 4K screens. When stretched to fit these displays, older or lower-resolution content can look soft, blurry, or washed out. You also see distracting artifacts like color banding in gradients and compression noise (mosquito noise) in dark areas, which pull you out of the experience.

### 🎭 Comparison
> _A quick look at how Anime4K transforms the source frame using one of Stremio Kai’s custom presets._

</br>

<p align="center">
  <img src="https://github.com/user-attachments/assets/3fe98a39-a125-4556-991d-88bdca8d6f69" alt="Original Frame" width="400"/>
  <img src="https://github.com/user-attachments/assets/9bb0875d-6352-4f4b-aee2-8d0e7e0e84da" alt="Eye Candy HQ + Denoise" width="400"/>
</p>
<p align="center">
  <small><i>No Filters vs Anime4K Eye Candy (HQ) + Denoise</i></small>
</p>
<p align="center">
  <strong>🔍 Want to see all presets side-by-side? Check out the <a href="https://imgsli.com/NDE0Mjgx/1/4">interactive comparison slider</a>.</strong>
</p>
</br>

---

## ⏩ II: The Smooth Motion Suite

This system delivers a stable and natural viewing experience through a custom-engineered VapourSynth pipeline. Instead of crudely forcing all content to 60fps, it employs smart frame doubling to enhance motion authentically, transforming 24fps anime into a silky-smooth 48fps and boosting 30fps sources to 60fps. This advanced performance is built on a foundation of rock-solid stability. This custom pipeline has been painstakingly debugged to eliminate memory leaks and crashes, ensuring you can binge-watch an entire series without a single hiccup because high-quality visuals mean nothing if the player is unstable or unresponsive. These utilities ensure the experience is always smooth, stable, and under your control.

</br>

### 🏍️ The Engine

Forget choppy 24fps pans. This build integrates a heavily customized SVP (SmoothVideo Project) setup that provides an intelligent and stable frame interpolation experience. **Designed for anime.** _Should work for other forms of content as well, but results can vary._

<details>
<summary><strong>SVP Frame Interpolation</strong></summary>

> *The core script that transforms standard video into a high-framerate, ultra-smooth visual experience.*

#### 😤 The Annoying Problem This Solves

Standard animation and film are shot at 24 frames per second (fps). While cinematic, this can cause noticeable judder and motion blur, especially in high-action scenes or smooth panning shots. The motion isn't as fluid as the eye can perceive, breaking immersion.

#### ✨ The Smart Solution

This script integrates the powerful **SVP (SmoothVideo Project)** engine directly into the player's video pipeline. It uses advanced algorithms to generate new, intermediate frames in real-time, targeting a fluid 48fps.

The result is exceptionally smooth, clear motion that removes distracting judder and allows you to see every detail, even during the most intense sequences.

#### Why 48fps? The "Integer Scaling" Advantage

Pushing video to an arbitrary 60fps from a 24fps source is a common mistake that can introduce motion artifacts. The ideal approach is to use an integer multiple of the original framerate.

By doubling 24fps to exactly 48fps (a 2x multiple), each original frame is given one perfectly timed, computer-generated frame in between. This maintains the original cadence and timing of the source material, resulting in a cleaner, more natural-looking smoothness. It's the technically correct choice for preserving motion integrity.

#### Key Capabilities:

  - **🧠 Intelligent Interpolation:** Converts 24fps video to a pristine 48fps for superior motion clarity.
  - **🎯 Anime-Tuned:** The processing algorithm is specifically optimized for the visual characteristics of animation.
  - **🤖 Smart Fallback Logic:** Automatically detects if a video is already high-framerate (e.g., 60fps) and intelligently bypasses processing to prevent artifacts.
  - **⚡ Performance Optimized:** Tuned to deliver maximum smoothness without overburdening system resources on typical hardware.

### 🚀 Quick Setup

#### Required Dependencies:

  - **VapourSynth R72**: The video processing framework used to apply the SVP filters.

#### File Placement:

```
📁 portable_config/
├── 📁 script-opts/
│   └── 📄 svp.conf          ← For custom settings
└── 📄 svp_main.vpy          ← The core motion engine script
```

### 🎛️ Advanced Configuration (For Power Users)

This script is tuned for a "set it and forget it" experience. However, for those who wish to fine-tune performance, the optional `svp.conf` file can be adjusted. **Do not modify these settings unless you understand their purpose.**

#### 🔧 **Power Settings (`svp.conf`)**

```ini
num_threads = auto      # Recommended. Allows the script to detect your CPU's capabilities.
```

**Translation**: More threads can increase processing speed, but performance gains diminish significantly after 6 threads. The `auto` setting is almost always optimal.

#### 🧠 **Memory Allocation (`svp.conf`)**

```ini
max_cache_size = 2048   # Optimal for systems with 16GB of RAM or more.
```

**Translation**: A larger cache can lead to smoother seeking in video files, but it consumes more system RAM.

#### 🐛 **Debug Mode (`svp.conf`)**

```ini
DEBUG_OVERLAY = false   # Keep this disabled for normal viewing.
```

**Translation**: When enabled, this displays a real-time overlay with processing statistics. It is only useful for troubleshooting performance issues.

### ⚠️ A Note on Performance

#### Heavy Resource Consumption

Be advised: real-time frame interpolation is one of the most demanding tasks you can ask of a CPU. While this script is highly optimized, it is still resource-intensive.

  - **Laptops**: It is normal for your cooling fans to spin up significantly. This indicates the script is working as intended.
  - **Temperatures**: Expect your CPU temperatures to rise. Ensure your system has adequate cooling.

#### "Worst-Case" Benchmark

This configuration was successfully tested on a modest laptop (i5-9300H CPU, GTX 1650 GPU, 16GB RAM) outputting to a 4K HDR display. This is a demanding scenario, and the script performed well. On standard 1080p displays, performance is excellent.

### 🎉 The Bottom Line
Drop these files in MPV, watch anime, enjoy buttery smooth animation that'll make you question why you ever watched anime any other way.
</details></br>


### 🧹 The Janitor

The perfect companion for binge-watching. This tiny, zero-configuration script prevents hangs and crashes between episodes by ensuring SVP is completely shut down and cleaned up before the next file loads.

<details>
<summary><strong>SVP Cleanup Utility</strong></summary>

  > *Because playlists shouldn't crash between episodes.*

#### 😤 The Annoying Problem This Fixes

You're binge-watching a series. An episode finishes, the screen goes black, and the next file is supposed to load. Instead... nothing. MPV hangs, becomes unresponsive, or flat-out crashes. You have to kill the process and restart, completely breaking your flow.

This often happens because SVP doesn't shut down cleanly, leaving leftover processes that interfere with loading the next video.

#### ✨ The Smart Solution

This is a tiny, zero-configuration "cleanup crew" script. Its only job is to run between files and make sure SVP has been completely torn down before the next video loads.

It's a fire-and-forget utility that dramatically improves the stability of watching sequential files (like in a playlist) with SVP active.

### 🚀 Quick Setup

#### Drop The File:
```

📁 portable_config/
└── 📁 scripts/
    └── 📄 svp_cleanup.lua        ← The Janitor

```
That's it. There is no configuration. It just works.

#### 🤔 How It Actually Works

The script is brutally simple and effective:

1.  **Detects End-of-File**: It patiently waits for a video to finish playing.
2.  **Checks for SVP**: The moment the file ends, it checks if an SVP or VapourSynth filter was active.
3.  **Takes Out the Trash**: If SVP was running, the script forcibly clears the entire video filter chain.
4.  **Waits a Beat**: It imposes a 1-second delay, giving all the SVP processes enough time to fully terminate before mpv proceeds to load the next file.

This ensures that every new video starts with a perfectly clean slate, eliminating a major cause of instability.

### 🎉 The Bottom Line
If you ever watch multiple videos in a row with SVP enabled, drop this script into your folder. It's a tiny insurance policy against hangs and crashes.
</details>

</br>

### ⚡ The Clutch

Heavy filters like SVP can cause debilitating lag when seeking. This script acts like a performance clutch, instantly and temporarily disengaging the filter chain the moment you seek, allowing for instantaneous rewinds and fast-forwards.  

<details>
<summary><strong>Instant Seeker - Reactive Filter Bypass</strong></summary>

  > *Because seeking shouldn't require a coffee break.*

#### 😤 The Annoying Problem This Fixes

You're watching a buttery-smooth, 60fps interpolated video thanks to SVP and other heavy filters. You miss a line of dialogue and tap the left arrow key to jump back 5 seconds.

**...and the video freezes.**

The audio skips back instantly, but the video stutters and hangs for what feels like an eternity as the CPU screams, trying to re-process everything. That "quick rewind" just shattered your immersion. Seeking is supposed to be instant, not a punishment for using high-quality filters.

#### ✨ The Smart Solution

This script is like a performance clutch for your video player. It's smart enough to know that seeking doesn't require complex video processing. The moment you seek, it temporarily disengages the heavy filters, letting you zip around the timeline instantly. Once you stop seeking, it seamlessly re-engages them.

The result? You get instant, lag-free seeking *and* the full quality of your video filters during normal playback. It’s the best of both worlds.

#### Why It's Better Than Other Scripts:
- **🧠 Reactive, Not Dumb**: It doesn't just turn filters off and on. It validates its own actions against yours, so it never fights you if you manually toggle SVP.
- **💪 Rock Solid**: Handles rapid-fire seeks (like holding down the arrow key) and seeking while paused without breaking a sweat.
- **🎯 Surgical Precision**: It only targets the heavy filters you specify (like SVP) and leaves everything else alone.

### 🚀 Quick Setup

#### Drop These Files:
```

📁 portable_config/
├── 📁 scripts/
│   └── 📄 reactive_vf_bypass.lua    ← The Clutch
└── 📁 script-opts/
    └── 📄 vf_bypass.conf            ← The Target List

```

#### ⚙️ Configuration Magic

Edit `vf_bypass.conf` to tell the script which filters are "heavy" enough to be disabled during seeks.

```ini
# Keywords that identify your heavy filters (comma-separated)
# If a video filter contains any of these words, the script will manage it.
svp_keywords=SVP,vapoursynth
```

Most users will never need to change this. The default `SVP,vapoursynth` covers 99% of motion interpolation setups.

*Note: The 1.5-second restore delay is hardcoded in the script for maximum stability and to prevent race conditions. It's the sweet spot between responsiveness and reliability.*

#### 🤔 How It Actually Works (The Clutch Analogy)

Think of playing a video with SVP like driving a car in first gear—lots of power, but not nimble.

1.  **Pressure Detected**: The moment you press a seek key, the script detects it.
2.  **Clutch In**: It instantly disengages the heavy video filters. The player is now in "neutral"—lightweight and incredibly responsive.
3.  **Shift Gears**: You can now seek backwards and forwards instantly, with zero lag or stuttering. If you keep seeking, the "clutch" stays in.
4.  **Clutch Out**: A moment after your *last* seek, the script smoothly re-engages the exact same filter chain. You're back in gear, enjoying buttery-smooth playback as if nothing happened.

The entire process is so fast, it's almost imperceptible. All you notice is that seeking finally works the way it's supposed to.

### 🔧 Troubleshooting

#### 😵‍💫 **"It's not doing anything\!"**

  - Make sure your active video filter actually contains one of the keywords from `vf_bypass.conf` (e.g., "SVP"). If it doesn't, the script will correctly ignore it.
  - Check the mpv console (`~` key) for logs. The script is very talkative and will tell you if it's loading and what it's doing.

#### 😡 **"The filters aren't coming back\!"**

  - This is extremely unlikely due to the script's validation logic. However, if it happens, it means another script or manual command is interfering. The logs will reveal the culprit. The script is designed to be defensive and will reset itself if it detects external changes.

### 🎉 The Bottom Line
This is a fire-and-forget script that fixes one of the most significant performance bottlenecks when using heavy video filters. Install it and enjoy a snappy, responsive player without sacrificing visual quality.
</details>
</br>

### ▶️ See it in Action

> _A short clip that showcases SVP’s frame interpolation in a fast-paced anime fight. See how motion transforms from choppy to fluid—especially during camera pans and impact frames._
> **Click the thumbnail below to watch the full demo.**

</br>

<p align="center">
<a href="https://streamable.com/ck3853">
<img src="https://github.com/user-attachments/assets/71e2dd57-a2a6-40e3-8353-c9cd569508d8" alt="Watch the demo video">
</a>
</p>

</br>


---

## 🤖 III: Intelligent Automation Suite

This is where Stremio Kai truly shines. A suite of custom-built scripts work silently in the background to automate the tedious parts of media playback, letting you focus on watching.

### 🧠 The Brain

This script is the central nervous system of the entire configuration. It completely eliminates the need for manual profile switching by intelligently analyzing every file you play and applying the perfect profile for the content.  

<details>
<summary><strong>Automatic Profile Manager</strong></summary>

  > *Because your 4K HDR movies shouldn't look like 20-year-old anime (and vice-versa)*

#### 😤 The Annoying Problem This Fixes

You've spent hours crafting the perfect mpv profiles: one for crisp, vibrant anime; another for cinematic, tone-mapped HDR movies; and a third with deinterlacing for that old show you downloaded.

But every time you open a file, you have to manually switch between them. Or worse, you try to build a complex `profile-cond` system that constantly breaks, gets into fights with itself, and picks the wrong profile half the time because of weird race conditions. It's a fragile, frustrating mess.

#### ✨ The Smart Solution

This script is the central brain your mpv config has been missing. It completely takes over the job of profile selection, analyzing every file on load, thinking like a human, and applying the **one, correct profile** for what you're watching. No conditions, no fighting, no mistakes.

It's the set-it-and-forget-it system that finally makes your carefully tuned profiles work automatically.

#### 🤔 How It Thinks (The Decision Tree)

This script's sole purpose is to analyze the video file and apply the appropriate profile from the [**Visually Stunning Predefined Profiles**](#-visually-stunning-predefined-profiles) table. It runs a lightning-fast check on every file, asking a series of questions to determine its exact nature and apply the perfect profile:

1.  **Is it Anime?** (Checks for Japanese, Chinese, or Korean audio tracks).
2.  **If YES, is it HDR?** (Checks for HDR10, HLG, or Dolby Vision metadata).
    * If also HDR, it's `anime-hdr`.
    * **If not HDR, is it Old?** (Checks for low resolution or interlaced video).
        * If old, it's `anime-old`.
        * Otherwise, it's modern `anime`.
3.  **If NO, is it HDR?**
    * If it's non-anime HDR, it's `hdr`.
    * Otherwise, it's `general`.

### 🚀 Quick Setup

#### **1. Drop The File**

```

📁 portable_config/
└── 📁 scripts/
    └── 📄 profile-manager.lua        ← The Brain

```
#### **2. Prepare Your `mpv.conf`**

This script is smart, but it's not a mind reader. It needs profiles to apply. Make sure your `mpv.conf` contains the profiles it will look for:

* `[anime]`
* `[anime-hdr]`
* `[anime-old]`
* `[hdr]`
* `[general]`

#### **3. Clean Your `mpv.conf`**

This is critical. The script is now in charge. **Delete every `profile-cond=...` line** from your `mpv.conf`. If you don't, the old system will fight with the new script and cause chaos.

#### ⚙️ Configuration Magic

This script has no `.conf` file. **You configure it by editing your profiles in `mpv.conf`**.

Want your `[anime]` profile to be brighter? Edit `[anime]` in `mpv.conf`. Want your `[hdr]` profile to use different tone-mapping? Edit `[hdr]`. The script simply acts as the intelligent switch for the settings you've already defined.

Power users can also edit the logic directly in the `.lua` file (e.g., add new languages, change the resolution cutoff).

#### 🤔 How It Actually Works

When a video starts loading, the script patiently waits in the background.

1.  **🔍 Waits for Clues**: It observes mpv's properties, waiting for **all** the necessary data (`track-list` and `video-params`) to be fully populated. This crushes the race conditions that plague other methods.
2.  **🧠 Runs Once**: As soon as the data is ready, the script runs its decision tree logic exactly one time.
3.  **⚡ Takes Action**: It applies the single best profile (e.g., `apply-profile anime-hdr`) and then goes to sleep until the next file is loaded.

#### 😯 Real Examples

| If the file is...                               | The script will apply... |
| ----------------------------------------------- | ------------------------ |
| 1080p, Japanese audio, SDR                      | `[anime]`                |
| 2160p, English audio, Dolby Vision              | `[hdr]`                  |
| 480i, Japanese audio, SDR                       | `[anime-old]`            |
| 1080p, Korean audio, HDR10                      | `[anime-hdr]`            |
| 720p, English audio, SDR                        | `[general]`              |


### 🔧 Troubleshooting

#### 🤔 **"It's not working!"**

* Make sure the `profile-manager.lua` file is in the correct `scripts` folder.
* Check that you **deleted all `profile-cond=` lines** from `mpv.conf`. This is the #1 cause of problems.
* Open the mpv console (`~` key) and look for logs prefixed with `[profile-manager]`. They will tell you exactly what the script is doing.

#### 😡 **"It picked the wrong profile!"**

* Look at the log! The script logs every piece of data it uses to make its decision.
    * `HDR Detected: false` means your file lacks the right metadata.
    * `No Asian language audio track found` means the audio track isn't tagged correctly.
* The log tells you *why* it made its choice, allowing you to see if the file's metadata is the problem.

### 🎉 The Bottom Line
Install it, clean your `mpv.conf`, and enjoy a player that is finally smart enough to use your profiles correctly. This is the robust, centralized logic that ends the profile wars for good.
</details>
</br>

### 🍷 The Sommelier

Ends the nightmare of manually cycling through subtitle tracks. This script intelligently scans and selects the best subtitle track based on your preferences, automatically rejecting "Forced" or "Commentary" tracks.  

<details>
<summary><strong>Smart Subtitle Selector</strong></summary>

  > *An intelligent script to automatically select the correct subtitle track.*

#### 😤 The Problem This Solves

When playing media with multiple subtitle tracks, MPV's default behavior often selects an undesirable track, such as "Signs & Songs" or "Forced," leading to a frustrating user experience. The user must then manually cycle through all available tracks on every single file to find the main dialogue track.

#### ✨ The Solution

This script replaces MPV's default logic with an intelligent, priority-based system. It analyzes the titles of all available subtitle tracks and automatically selects the one that best matches the user's configured preferences, ignoring commentary or utility tracks.

This provides a "set it and forget it" solution that ensures the correct dialogue track is selected automatically, every time.

#### 🤔 How It Works:

The script ranks subtitle tracks based on a tiered priority system:

1.  **Priority Tier:** First, it searches for tracks containing keywords that indicate a primary dialogue track (e.g., "dialogue," "full").
2.  **Normal Tier:** If no priority tracks are found, it falls back to any standard subtitle track that isn't explicitly rejected.
3.  **Rejected Tier:** It actively ignores any track containing keywords that mark it as a utility track (e.g., "signs," "songs," "commentary").

#### 😯 Real Example:
```
Available tracks:
❌ English [Forced] 
❌ English [Signs/Songs]
✅ English [Full Dialogue] ← This one gets picked!
❌ Commentary Track
```

### 🚀 Quick Setup

#### 1\. File Placement

```
📁 portable_config/
├── 📁 scripts/
│   └── 📄 smart_subs.lua
└── 📁 script-opts/
    └── 📄 smart_subs.conf
```

#### 2\. MPV Configuration

For the script to take control, you must disable MPV's default subtitle selection logic. In your `mpv.conf` file, comment out or delete the following line:

```ini
# sid=auto
```

#### ⚙️ Configuration

The script's behavior is controlled via `smart_subs.conf`.

```ini
# Languages to select, in order of preference.
preferred_langs = en,eng

# Keywords that identify a high-priority dialogue track.
priority_keywords = dialogue,full,complete

# Keywords that identify tracks to be ignored.
reject_keywords = signs,songs,commentary
```

#### Example Configurations:

  * **For Multi-Language Users:** `preferred_langs = en,eng,jp,jpn`
  * **For Anime Fans:** `reject_keywords = signs,songs,commentary,forced,karaoke`
  * **For Movie Fans (with accessibility):** `priority_keywords = dialogue,full,complete,sdh`

### 🔧 Troubleshooting

  * **If the script isn't working:**
    1.  Ensure the `.lua` and `.conf` files are in the correct folders.
    2.  Confirm that `sid=auto` has been removed from `mpv.conf`.
  * **If the wrong track is selected:**
    1.  Check the track titles in your media file.
    2.  Add any unwanted keywords (e.g., "Forced") to `reject_keywords`.
    3.  Add any desired keywords to `priority_keywords`.
  * **To see the script's decision-making process:**
    1.  Enable the MPV console (press `~`). The script will log its actions, such as `Subtitle Selector: Found a PRIORITY track. Activating subtitle track #2`.

### 🎉 The Bottom Line
Install once, configure to your taste, then never think about subtitles again. The script just quietly does the right thing while you focus on actually watching your content.
</details>
</br>

### 🔎 The Detective

Binge-watch like a pro. This script provides a configurable, Netflix-style system for skipping intros, outros, and previews, with a multi-layered detection system that uses chapter titles, positions, and even silence to know when to offer a skip.  

<details>
<summary><strong>Smart Skip</strong></summary>

  > *An automated system for skipping intros, outros, and previews.*

#### 😤 The Problem This Solves

During a binge-watching session, the flow between episodes is constantly interrupted by opening credits, ending credits, and previews. This forces you to manually skip forward, which is tedious, imprecise, and breaks immersion.

#### ✨ The Solution

This script provides a seamless, Netflix-style viewing experience by intelligently detecting and skipping unwanted sections of a video file. It uses a multi-layered detection system that prioritizes a chapter's position and uses its title to determine confidence, ensuring high accuracy and safety. This allows you to move from one episode to the next without interruption.

#### 🤔 How It Works: The Position-First Logic

The script analyzes each file using a precise, multi-step process to identify skippable content.

1.  **Step 1: Identify Positional Candidates**
    The script first examines the chapter list, identifying the first two and last two chapters as potential candidates for being an intro or outro. It assumes content at the absolute beginning or end of a file is likely skippable.

2.  **Step 2: Assign Confidence Using Titles**
    Next, it inspects the titles of these positional candidates to determine a confidence level:

      * **High Confidence:** If a candidate has a descriptive title matching known patterns (e.g., "Opening," "ED," "Preview"), it is marked as a high-confidence skip.
      * **Medium Confidence:** If a candidate has a generic or no title (e.g., "Chapter 1"), it is marked as a medium-confidence skip. It will still be prompted, but never skipped automatically.

3.  **Step 3: Fallback to Silence Detection**
    If the video file contains no chapters at all, the script switches to its fallback mode. It will listen for periods of silence and fast-forward through them upon command.

#### **😯 Real Example (Anime with Chapters):**

Chapters found:  
✅ "Opening"        → Skippable\! Notification appears.  
❌ "Part A"         → Not skippable.  
❌ "Part B"         → Not skippable.  
✅ "Ending"         → Skippable\! Notification appears.  
✅ "Next Preview"   → Skippable\! Notification appears.

### 🚀 Quick Setup

#### File Placement:

```
📁 portable_config/
├── 📁 scripts/
│   └── 📄 smart_skip.lua
└── 📁 script-opts/
    └── 📄 smart_skip.conf
```

#### ⚙️ Configuration

The script's behavior is controlled via `smart_skip.conf`. These settings are read directly from the script's code:

```ini
# Automatically skip high-confidence chapters without a prompt.
# For safety, this only applies to chapters identified by title.
auto_skip=false

# Categories to be considered skippable, separated by semicolons.
# To prevent skipping previews, for example, remove "preview" from the list.
skip_categories=opening;ending;preview

# Display the "Skip Intro" style notification.
show_notification=true

# The duration the notification remains on screen, in seconds.
notification_duration=15

# Maximum duration in seconds a chapter can be to be considered skippable.
# This is a safety feature to prevent skipping the whole file.
max_skip_duration=200
```

### 🔧 Troubleshooting

  * **If it's not skipping anything:**
      * Ensure the `.lua` and `.conf` files are in the correct folders. 
      * Check the MPV console (`~` key) for any error messages.
      * The video file may not contain any chapters or silent periods for the script to detect.
  * **If it tries to skip the whole episode:**
      * This is prevented by the `max_skip_duration=200` safety feature in the script, which stops it from ever skipping more than approximately 3 minutes.

#### 🙏 Credits & Origins

This script merges and modernizes concepts from two foundational scripts. Full credit goes to the original authors:

  * [po5/chapterskip](https://github.com/po5/chapterskip)
  * [rui-ddc/skip-intro](https://github.com/rui-ddc/skip-intro)

### **🎉 The Bottom Line**
Go right to your favorite part! This script replaces imprecise, repetitive skipping with a clean, single-press command. It gives you the power to navigate content exactly as you want, making the experience seamless without taking control away from you.
</details>
</br>

### 🖼️ The Preview

[ThumbFast](https://github.com/po5/thumbfast) is an additional script that is included to provide video preview thumbnails when you hover over the seek bar.  
> *Note: There is a known visual bug where the thumbnails may not align perfectly with the timeline. This is a limitation of the script and currently has no fix.*

</br>

---

# 💻 Is Your PC Ready?
> **⚠️ System Requirements & User Advisory**

This project is engineered to deliver the best visual quality possible on modest hardware, but "optimized" does not mean "zero-impact." High-quality, real-time video processing is demanding. Please read the following before you begin.

### **⚙️ Performance & Hardware**
  * **✅ Minimum Specs:** i5/Ryzen 5 (4+ cores), 8GB RAM, and a dedicated GPU (GTX 1050 / RX 560 or better) are recommended for a smooth 1080p experience.
  * **🌡️ Expect Heavy CPU Usage:** The motion smoothing (SVP) feature is extremely CPU-intensive. It is normal for your CPU temperatures to rise and for your cooling fans to spin up significantly (💨). **This is the sound of the system working as intended.** Ensure your PC or laptop has adequate cooling.
  * **🎯 Benchmark:** This build was developed and tested on a laptop with an i5-9300H CPU, GTX 1650 GPU, and 16GB of RAM outputting to a 4K display. This proves the system can run well even on modest hardware, but your mileage may vary.

<p align="center">
  <img src="https://github.com/user-attachments/assets/5c9e252f-43dd-4f19-8906-91be6516cf8d" alt="Resources Usage"/>
</p>
<p align="center">
<small><i>Typical resource consumption during 4K playback with all features active.</i></small>
</p>

### **🖥️ Display & Visuals**
  * **🛑 CRITICAL: HDR Content is for HDR Displays Only.**
    The HDR profiles are configured for true HDR passthrough. If you play an HDR video on a standard (SDR) monitor, the colors will look grey, washed-out, and incorrect. This is by design. **You must choose video sources that match your display's capabilities.** The AIOstreams add-on can help you filter content correctly.
  * **🎨 A Note on Color Calibration:**
    All visual profiles were tuned on a calibrated display. If your monitor is not calibrated, the final image may look different from the intended result. Visuals are subjective and will vary based on your screen.

### **🛡️ Antivirus & False Positives**
  * **You may receive a warning from Windows Defender**, flagging the application with a generic name like `Wacatac`.
  * **This is a FALSE POSITIVE.** The detection is triggered simply because the app's original icon was modified, a change that heuristic-based security software can view as suspicious. The application is completely safe to use.
  * **A submission has been made to Microsoft to have the application whitelisted.** In the meantime, you can safely resolve this by adding an exclusion for the Stremio Kai folder in your antivirus settings.

<p align="center">
  <img src="https://github.com/user-attachments/assets/f855d5b7-a3e3-42a5-bb8a-634e5f1c4a1e" alt="VirusTotal Results"/>
</p>

### **🔧 Configuration & Usage**
  * **🔌 This is a "Plug-and-Play" Build:**
    The scripts and configurations have been custom-built to work together out of the box. The goal is to provide a seamless experience with minimal user tinkering.
  * **🔬 For Advanced Users:**
    While most default settings are optimal, power users can adjust `.conf` files for each script. Only modify these settings if you understand what they do. This is a personalized setup, and while it's designed to be universal, unique hardware or software combinations may lead to unpredictable issues.

</br>

## **🚀 Installation**

Stremio Kai is a completely self-contained, portable system. All dependencies—SVP, VapourSynth, MPV, shaders, and scripts—are included and pre-configured. No separate installation is required.  
### 1. Download  
Grab the latest Stremio.Kai.vX.X.7z file from [releases](https://github.com/allecsc/Stremio-Kai/releases).  
### 2. Extract  
* Unzip the entire contents of the 7z archive to a location of your choice on your computer (e.g., C:\\Program Files\\Stremio Kai or D:\\PortableApps\\Stremio Kai).  
### 3. Run  
* Double-click stremio.exe. That's it. Log in to your Stremio account and enjoy.
### 4. (Optional) Use the provided [AIOstreams Template](https://github.com/allecsc/Stremio-Kai/releases/download/stremio-kai-v2.0/aiostreams-config-TEMPLATE.json)
* To help you identify the right video source, this package includes a pre-configured template for the **AIOstreams** addon. This template formats the search results to clearly display critical information like resolution, HDR format (HDR10+, DV), audio type (Atmos), and file size, so you can pick the best source for your display with confidence. It would look like this:

<p align="center">
  <img src="https://github.com/user-attachments/assets/51474bf4-5b92-4594-a489-f8737b28bc42" alt="AIOstreams Format" width="300"/>
</p>

<details>
<summary><strong>How to set up AIOstreams and use the template</strong></summary></br>
  
> *The template file is included in the Stremio Kai package. To use it, you'll need to configure one of the AIOstreams addons. Below are two of the most popular ones.*

#### Setup Instructions:

1. Navigate to one of the AIOstreams configuration pages:  
   * https://aiostreams.elfhosted.com/stremio/configure  
   * https://aiostreamsfortheweak.nhyira.dev/stremio/configure  
2. Click the **Import** button and select the template file provided with Stremio Kai.  
3. Click **Install to Stremio** if you don't have it installed, or **Save** to apply the template, if you're already using the addon.
</details>

<details> 
<summary><strong>AIOstreams Custom Formatter Settings</strong></summary>

<h4>Name Template</h4>
<pre>
{service.cached::istrue["⚡"||"🐢"]}{stream.resolution::exists["{stream.resolution}"||""]}
</pre>

<h4>Description Template</h4>
<pre>
{stream.filename::exists["🎬 {stream.filename}"||"{stream.title::title}"]}
{stream.folderName::exists["📁 {stream.folderName}"||""]}
{stream.visualTags::exists["📺 {stream.visualTags::join(' • ')}"||""]}{stream.quality::exists[" • {stream.quality}"||""]}
{stream.audioTags::exists["🎧 {stream.audioTags::join(' • ')}"||""]}{stream.languages::exists["📣 {stream.languageEmojis::join(' · ')}"||""]}
{stream.size::>0["📦 {stream.size::bytes}"||""]} {stream.seeders::>=0["🌱 {stream.seeders}"||""]}
{addon.name::exists["📡 {addon.name}"||""]}
</pre>

</details>  
</br>

### **⌨️ Power-User Control: The Cheatsheet**

> Stremio Kai is designed to work perfectly out of the box, but power users have full control. Use these hotkeys to adjust the visuals on the fly.

| Key | Action | Description |
| :---: | :---: | :---: |
| Tab | **Smart Skip** | Skips the current intro/outro when prompted. |
| F12 | Toggle **SVP Motion Smoothing** | Manually enables or disables frame interpolation. |
| Ctrl+F1 | **Anime4K: Optimized** | A balanced preset for great quality and performance. |
| Ctrl+F2 | **Anime4K: Eye Candy (Fast)** | A higher-quality preset with a minor performance cost. |
| Ctrl+F3 | **Anime4K: Eye Candy (HQ)** | The highest-quality preset for powerful machines. |
| Ctrl+F4 | **Clear All Shaders** | Instantly removes all active GLSL shaders. |
| Ctrl+F10 | Toggle **High Denoise** | Toggles the default subjective denoise filter. |
| F9 | Cycle **Denoise Filters** | Cycles through other, weaker denoise filters. |
| F8 | Toggle **ICC Profile** | Toggles automatic ICC color profile correction. |

> *For a full list of all custom shortcuts, please consult the `input.conf` file. For even more, check the [mpv manual](https://mpv.io/manual/master/).*

</br>


## 🛠️ Project Status

### ⚙️ **Current State**
- 🧪 Actively Tested: Stability and performance validated across long viewing sessions
- 🧼 uBlock Extension Removed: Prevented infinite loading loop during app startup
- 🔧 Project is feature-complete and stable—no major development planned.
    - Future updates will focus on bug fixes or meaningful feature requests that align with the project’s vision.

### 🐞 **Known Issues**
- 🖼️ ThumbFast Timeline Misalignment: Thumbnail previews may not align properly; no current fix available
- ⚠️ 10-Bit Video Incompatibility: Processing 10-bit video files can cause visual artifacts (e.g., black dots) or interpolation failures.
    - ❌ This is a core limitation of the underlying 8-bit SVP engine; no script-level fix is available.
    - ℹ️ This is a harmless visual-only issue and poses no risk to computer hardware.
- 🧠 SVP Memory Leaks: Previously caused stutters after extended playback
    - ✅ Mitigations and fallback logic have been implemented   
    - 🔍 Issue appears resolved in latest tests, but will be monitored and documented if it resurfaces

### 📣 **Support & Contributions**
- 🐛 Bug Reports & Feature Requests: Please open an issue on GitHub
- 💬 Feedback Welcome: Suggestions that improve usability or performance are appreciated

### ❓ Frequently Asked Questions

**1. Is there a version for Linux or macOS?**
  - Currently, Stremio Kai is **Windows-only**. The project is built upon the **[Stremio Community v5](https://github.com/Zaarrg/stremio-community-v5)**, and I am dependent on its developer for cross-platform support. While a **Linux/macOS** version **has been announced, there is no ETA**. Once that foundation is available, I can begin the work of porting Stremio Kai.

**2. What if I don't like the upscaling or motion smoothing?**
  - This project is designed to be a highly opinionated "_it just works_" setup, but it is not a locked box. **Every visual and performance enhancement**—from Anime4K upscaling to SVP motion smoothing—is fully configurable and **can be disabled**.
  - If you are a purist who prefers the original, unaltered look of an anime, you can easily achieve that. The settings are controlled in the mpv.conf file. If you're not comfortable editing it yourself, please **[open a discussion](https://github.com/allecsc/Stremio-Kai/discussions)**. I will personally guide you on how to tailor the experience to your exact preferences.

**3. How does the "anime detection" work? Will this affect other content?**
  - The system detects anime by checking the audio tracks of the video file. If it finds a Japanese (or other asian languages) audio track, it applies the appropriate anime profile.
  - This has two important consequences:
    - **Dubbed Anime:** If you primarily watch anime with English (or other non-Japanese) dubs, the anime-specific profiles will not activate by default. You will need to make a small adjustment to the configuration to include your preferred language.
    - **Live-Action Content:** If you watch other Asian-language content (like K-dramas with Korean audio), the system will incorrectly identify it as anime and apply the wrong visual profile.
  - For users who watch dubbed anime or other Asian content, please **[open a discussion](https://github.com/allecsc/Stremio-Kai/discussions)** for assistance in adjusting the detection settings for a better experience.

</br>

---

## ⚠️ **Disclaimer**
Stremio Kai is an independent, fan-driven project and is not affiliated with the official Stremio team or any third-party plugin developers.
This software is provided “as is,” without warranties of any kind. The maintainers do not endorse or support illegal streaming or distribution of copyrighted content. Users are solely responsible for ensuring their usage complies with all applicable laws and regulations in their jurisdiction.
Use responsibly and at your own discretion.

---

</br>

## **🙏 Acknowledgements**

This project stands on the shoulders of giants and wouldn't be possible without their incredible work.

* A massive thank you to **Zaarrg** for creating the original [**stremio-community-v5**](https://github.com/Zaarrg/stremio-community-v5), which provides the essential MPV integration that this entire project is built upon.  
* Credit and thanks to the brilliant team behind [**bloc97/Anime4K**](https://github.com/bloc97/Anime4K) for their amazing upscaling shaders.

</br>

## 🧑‍💻 About This Project
Stremio Kai is a personal project developed over the years, born from a simple frustration: nothing out there offered the anime viewing experience I wanted. So I built it myself.
This latest version—with full Stremio integration and upgraded plugins—is the most extensive work I’ve done on it. While I don’t consider myself a developer, I’ve learned to shape existing tools into something I genuinely love using.

</br>

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
<p align="center">
    <strong>✨ Built with love for the series that keep us up all night. Enjoy the view. ✨</br>- Alt </strong>
</p>
