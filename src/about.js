(() => {
  "use strict";

  const log = (message, error) => {
    try {
      console.error("[GPTWrap:about]", message, error);
    } catch (_) {
      // Diagnostics must never prevent the about window from being usable.
    }
  };

  const closeWindow = () => {
    try {
      const getCurrentWindow = window.__TAURI__?.window?.getCurrentWindow;
      const currentWindow =
        typeof getCurrentWindow === "function" ? getCurrentWindow() : null;
      if (currentWindow) {
        Promise.resolve(currentWindow.close()).catch((error) =>
          log("could not close the about window", error),
        );
        return;
      }

      window.close();
    } catch (error) {
      log("could not close the about window", error);
    }
  };

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeWindow();
    }
  });

  document.querySelector(".about-github")?.addEventListener("click", (event) => {
    const link = event.currentTarget;
    const openUrl = window.__TAURI__?.opener?.openUrl;
    if (typeof openUrl !== "function" || !(link instanceof HTMLAnchorElement)) {
      return;
    }

    event.preventDefault();
    Promise.resolve(openUrl(link.href)).catch((error) =>
      log("could not open the GitHub URL", error),
    );
  });
})();
