// Fetch and display all releases
async function fetchChangelog() {
  const container = document.getElementById("changelog-list");

  try {
    const response = await fetch(
      "https://api.github.com/repos/allecsc/Stremio-Kai/releases",
    );
    const releases = await response.json();

    if (releases.length === 0) {
      container.innerHTML =
        '<p style="text-align:center; color: var(--text-secondary);">No releases found.</p>';
      return;
    }

    container.innerHTML = "";

    releases.forEach((release, index) => {
      const releaseEl = createReleaseElement(release, index === 0);
      container.appendChild(releaseEl);
    });
  } catch (error) {
    console.error("Error fetching changelog:", error);
    container.innerHTML = `
            <div style="text-align:center; color: var(--text-secondary); padding: 2rem;">
                <p>Failed to load changelog. Please visit the <a href="https://github.com/allecsc/Stremio-Kai/releases" target="_blank" style="color: var(--purple-light);">GitHub releases page</a>.</p>
            </div>
        `;
  }
}

function createReleaseElement(release, isLatest) {
  const div = document.createElement("div");
  div.className = "release";

  // Calculate total downloads for this release
  let totalDownloads = 0;
  release.assets.forEach((asset) => {
    totalDownloads += asset.download_count;
  });

  // Format date
  const date = new Date(release.published_at);
  const formattedDate = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Parse markdown body to HTML
  const bodyHTML = parseMarkdown(release.body || "No release notes provided.");

  // Generate assets HTML
  const assetsHTML = release.assets
    .map((asset) => {
      const sizeInMB = (asset.size / (1024 * 1024)).toFixed(2);
      return `
            <a href="${asset.browser_download_url}" class="asset-download" target="_blank">
                <div class="asset-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                </div>
                <div class="asset-info">
                    <span class="asset-name">${asset.name}</span>
                    <span class="asset-size">${sizeInMB} MB • ${asset.download_count.toLocaleString()} downloads</span>
                </div>
            </a>
        `;
    })
    .join("");

  div.innerHTML = `
        <div class="release-header">
            <div class="release-title">
                <span class="release-version">${release.tag_name}</span>
                ${isLatest ? '<span class="release-badge">LATEST</span>' : ""}
            </div>
            <div class="release-meta">
                <span class="release-date">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    ${formattedDate}
                </span>
                ${
                  totalDownloads > 0
                    ? `
                <span class="release-downloads">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    ${totalDownloads.toLocaleString()}
                </span>
                `
                    : ""
                }
                <svg class="expand-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </div>
        </div>
        <div class="release-body">
            <div class="release-content">
                <div class="release-description">
                    ${bodyHTML}
                </div>
                ${assetsHTML ? `<div class="release-assets">${assetsHTML}</div>` : ""}
            </div>
        </div>
    `;

  // Add click handler for expand/collapse
  const header = div.querySelector(".release-header");
  header.addEventListener("click", () => {
    div.classList.toggle("expanded");
  });

  // Expand latest release by default
  if (isLatest) {
    div.classList.add("expanded");
  }

  return div;
}

// Simple markdown to HTML parser using marked.js
function parseMarkdown(markdown) {
  return marked.parse(markdown, {
    breaks: true,
    mangle: false,
    headerIds: false,
  });
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  fetchChangelog();
});
