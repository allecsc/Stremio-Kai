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

// Gallery lightbox functionality
function initGallery() {
  const galleryItems = Array.from(document.querySelectorAll(".gallery-item"));
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightbox-img");
  const closeBtn = document.querySelector(".lightbox-close");
  const prevBtn = document.querySelector(".lightbox-nav.prev");
  const nextBtn = document.querySelector(".lightbox-nav.next");
  const heroImage = document.querySelector(".hero-screenshot");

  let currentIndex = 0;

  // Helper to extract image source
  const getImageSrc = (index) => {
    return galleryItems[index].dataset.img;
  };

  // Show image at specific index
  const showImage = (index) => {
    if (index < 0) index = galleryItems.length - 1;
    if (index >= galleryItems.length) index = 0;

    currentIndex = index;
    lightboxImg.src = getImageSrc(currentIndex);
    lightbox.style.display = "block";
    document.body.style.overflow = "hidden";
  };

  // Open lightbox from gallery item
  galleryItems.forEach((item, index) => {
    item.addEventListener("click", () => {
      showImage(index);
    });
  });

  // Open lightbox from hero image
  if (heroImage) {
    heroImage.addEventListener("click", () => {
      // Find if hero image exists in gallery (match by src)
      const heroSrc = heroImage.src;
      const galleryIndex = galleryItems.findIndex(
        (item) => item.dataset.img === heroSrc,
      );

      if (galleryIndex !== -1) {
        showImage(galleryIndex);
      } else {
        // If not in gallery, just show it but set index to 0 for navigation continuity
        lightboxImg.src = heroSrc;
        lightbox.style.display = "block";
        document.body.style.overflow = "hidden";
        currentIndex = 0;
      }
    });
  }

  // Navigation handlers
  const showNext = () => showImage(currentIndex + 1);
  const showPrev = () => showImage(currentIndex - 1);

  prevBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    showPrev();
  });

  nextBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    showNext();
  });

  closeBtn.addEventListener("click", () => {
    lightbox.style.display = "none";
    document.body.style.overflow = "auto";
  });

  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) {
      lightbox.style.display = "none";
      document.body.style.overflow = "auto";
    }
  });

  // Keyboard navigation
  document.addEventListener("keydown", (e) => {
    if (lightbox.style.display === "block") {
      if (e.key === "Escape") {
        lightbox.style.display = "none";
        document.body.style.overflow = "auto";
      } else if (e.key === "ArrowLeft") {
        showPrev();
      } else if (e.key === "ArrowRight") {
        showNext();
      }
    }
  });
}

// Smooth scroll for navigation
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      const href = this.getAttribute("href");
      if (href !== "#" && href !== "") {
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
  initGallery();
  initSmoothScroll();
  initAnimations();
});
