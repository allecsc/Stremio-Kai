// Fetch latest release data from GitHub
async function fetchLatestRelease() {
  try {
    const response = await fetch(
      "https://api.github.com/repos/allecsc/Stremio-Kai/releases/latest",
    );
    const data = await response.json();

    // Update version info
    document.getElementById("version-info").textContent =
      `Latest: ${data.tag_name}`;

    // Find installer and portable assets
    const installerAsset = data.assets.find((asset) =>
      asset.name.toLowerCase().includes(".exe"),
    );
    const portableAsset = data.assets.find(
      (asset) =>
        asset.name.toLowerCase().includes(".7z") ||
        asset.name.toLowerCase().includes(".zip"),
    );

    // Update download buttons
    if (installerAsset) {
      document.getElementById("download-installer").href =
        installerAsset.browser_download_url;
    } else {
      document.getElementById("download-installer").href = data.html_url;
    }

    if (portableAsset) {
      document.getElementById("download-portable").href =
        portableAsset.browser_download_url;
    } else {
      document.getElementById("download-portable").href = data.html_url;
    }
  } catch (error) {
    console.error("Error fetching release data:", error);
    document.getElementById("version-info").textContent =
      "Visit GitHub for latest version";
    document.getElementById("download-installer").href =
      "https://github.com/allecsc/Stremio-Kai/releases/latest";
    document.getElementById("download-portable").href =
      "https://github.com/allecsc/Stremio-Kai/releases/latest";
  }
}

// Fetch total downloads count
async function fetchDownloads() {
  try {
    const response = await fetch(
      "https://api.github.com/repos/allecsc/Stremio-Kai/releases",
    );
    const releases = await response.json();

    let totalDownloads = 0;
    releases.forEach((release) => {
      release.assets.forEach((asset) => {
        totalDownloads += asset.download_count;
      });
    });

    document.getElementById("download-count").innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            ${totalDownloads.toLocaleString()} Downloads
        `;
  } catch (error) {
    console.error("Error fetching downloads:", error);
  }
}

// Carousel & Gallery System
function initCarousel() {
  const carouselItems = Array.from(document.querySelectorAll(".carousel-item"));

  const navPrev = document.querySelector(".carousel-nav.prev");
  const navNext = document.querySelector(".carousel-nav.next");
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightbox-img");
  const closeBtn = document.querySelector(".lightbox-close");
  const lbPrevBtn = document.querySelector(".lightbox-nav.prev");
  const lbNextBtn = document.querySelector(".lightbox-nav.next");

  // NOTE: Elements are matched by index.
  // We assume the Carousel and Gallery have the same items in the same order.

  let currentIndex = 0; // Tracks the unified state (Carousel + Lightbox)

  // --- Carousel Logic ---

  const updateCarousel = () => {
    carouselItems.forEach((item) => {
      item.classList.remove(
        "active",
        "prev",
        "next",
        "hidden-left",
        "hidden-right",
      );
    });

    const total = carouselItems.length;
    // Safety check if carousel is missing
    if (total === 0) return;

    const prevIndex = (currentIndex - 1 + total) % total;
    const nextIndex = (currentIndex + 1) % total;

    // Set Active
    carouselItems[currentIndex].classList.add("active");

    // Set Neighbors
    carouselItems[prevIndex].classList.add("prev");
    carouselItems[nextIndex].classList.add("next");

    // Hide others
    carouselItems.forEach((item, index) => {
      if (
        index !== currentIndex &&
        index !== prevIndex &&
        index !== nextIndex
      ) {
        if (index < currentIndex) item.classList.add("hidden-left");
        else item.classList.add("hidden-right");
      }
    });
  };

  const setIndex = (index) => {
    if (carouselItems.length === 0) return;
    currentIndex = (index + carouselItems.length) % carouselItems.length;
    updateCarousel();
  };

  const rotateNext = () => setIndex(currentIndex + 1);
  const rotatePrev = () => setIndex(currentIndex - 1);

  // --- Interactions ---

  if (navNext) navNext.addEventListener("click", rotateNext);
  if (navPrev) navPrev.addEventListener("click", rotatePrev);

  // Carousel Item Clicks
  carouselItems.forEach((item, index) => {
    item.addEventListener("click", () => {
      if (index === currentIndex) {
        openLightbox(currentIndex);
      } else if (index === (currentIndex + 1) % carouselItems.length) {
        rotateNext();
      } else if (
        index ===
        (currentIndex - 1 + carouselItems.length) % carouselItems.length
      ) {
        rotatePrev();
      } else {
        setIndex(index);
      }
    });
  });

  // --- Lightbox Logic ---

  const lightboxCaption = document.getElementById("lightbox-caption");
  const lightboxVideo = document.getElementById("lightbox-video");

  const openLightbox = (index) => {
    const sourceItem = carouselItems[index];
    if (!sourceItem) return;

    const mediaSrc = sourceItem.dataset.img;
    const hasVideo = sourceItem.querySelector("video");

    // Determine if this is a video (check for video element or common video extensions)
    const isVideo = hasVideo || /\.(mp4|webm|ogg|mov)$/i.test(mediaSrc);

    if (isVideo && lightboxVideo) {
      // Show video, hide image
      lightboxVideo.src = mediaSrc;
      lightboxVideo.style.display = "block";
      lightboxImg.style.display = "none";
    } else {
      // Show image, hide video
      lightboxImg.src = mediaSrc;
      lightboxImg.style.display = "block";
      if (lightboxVideo) {
        lightboxVideo.style.display = "none";
        lightboxVideo.src = ""; // Stop any playing video
      }
    }

    // Get caption from the overlay text or img alt
    const overlayEl = sourceItem.querySelector(".carousel-overlay");
    const captionText = overlayEl
      ? overlayEl.textContent
      : sourceItem.querySelector("img")?.alt || "";
    if (lightboxCaption) lightboxCaption.textContent = captionText;

    lightbox.style.display = "block";
    document.body.style.overflow = "hidden";
  };

  const lbShowNext = () => {
    if (carouselItems.length > 0) {
      rotateNext(); // Rotate the background carousel
      openLightbox(currentIndex);
    }
  };

  const lbShowPrev = () => {
    if (carouselItems.length > 0) {
      rotatePrev(); // Rotate the background carousel
      openLightbox(currentIndex);
    }
  };

  // Lightbox Controls
  const closeLightbox = () => {
    lightbox.style.display = "none";
    document.body.style.overflow = "auto";
    // Stop video playback when closing
    if (lightboxVideo) {
      lightboxVideo.pause();
      lightboxVideo.src = "";
    }
  };

  if (lbNextBtn) {
    lbNextBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      lbShowNext();
    });
  }

  if (lbPrevBtn) {
    lbPrevBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      lbShowPrev();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", closeLightbox);
  }

  if (lightbox) {
    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox) {
        closeLightbox();
      }
    });
  }

  // Keyboard Navigation
  document.addEventListener("keydown", (e) => {
    const isLbOpen = lightbox && lightbox.style.display === "block";

    if (e.key === "ArrowLeft") {
      if (isLbOpen) lbShowPrev();
      else rotatePrev();
    } else if (e.key === "ArrowRight") {
      if (isLbOpen) lbShowNext();
      else rotateNext();
    } else if (e.key === "Escape") {
      if (isLbOpen) closeLightbox();
    }
  });

  // Initial Render
  updateCarousel();
}

// Smooth scroll for navigation
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      const href = this.getAttribute("href");
      // Only smooth scroll if it's an anchor link and not just "#"
      if (href && href.startsWith("#") && href !== "#") {
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
          target.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      }
    });
  });
}

// Intersection Observer for fade-in animations
function initAnimations() {
  const observerOptions = {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px",
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = "1";
        entry.target.style.transform = "translateY(0)";
      }
    });
  }, observerOptions);

  // Observe feature cards
  document
    .querySelectorAll(".feature-card, .faq-item, .gallery-item")
    .forEach((el) => {
      el.style.opacity = "0";
      el.style.transform = "translateY(20px)";
      el.style.transition = "opacity 0.6s ease, transform 0.6s ease";
      observer.observe(el);
    });
}

// Initialize everything on page load
document.addEventListener("DOMContentLoaded", () => {
  fetchLatestRelease();
  fetchDownloads();
  initCarousel();
  initSmoothScroll();
  initAnimations();
});
