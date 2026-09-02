(() => {
  "use strict";

  const LOGO_DATA_URL = __GPTWRAP_ABOUT_LOGO__;
  const APP_VERSION = __GPTWRAP_ABOUT_VERSION__;
  const GITHUB_URL = __GPTWRAP_ABOUT_GITHUB_URL__;

  // Expose the compile-time values to about.js without making that page
  // depend on a bundler or on duplicated placeholders.
  window.__GPTWRAP_APP_VERSION__ = APP_VERSION;
  window.__GPTWRAP_GITHUB_URL__ = GITHUB_URL;

  const initializeAboutContent = () => {
    const icon = document.querySelector(".about-icon");
    if (icon) {
      icon.src = LOGO_DATA_URL;
    }

    const githubLink = document.querySelector(".about-github");
    if (githubLink) {
      githubLink.href = GITHUB_URL;
      const url = githubLink.querySelector(".about-github-url");
      if (url) {
        url.textContent = GITHUB_URL;
      }
    }

    const version = document.querySelector(".about-version-number");
    if (version) {
      version.textContent = APP_VERSION;
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeAboutContent, { once: true });
  } else {
    initializeAboutContent();
  }
})();
