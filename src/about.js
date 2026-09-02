(() => {
  "use strict";

  const APP_VERSION = window.__GPTWRAP_APP_VERSION__ || "unknown";
  const GITHUB_URL =
    window.__GPTWRAP_GITHUB_URL__ || "https://github.com/q32757468/gpt-wrap";

  const log = (message, error) => {
    try {
      console.error("[GPTWrap:about]", message, error);
    } catch (_) {
      // Diagnostics must never prevent the about window from being usable.
    }
  };

  const tauriCore = (() => {
    try {
      const invoke = window.__TAURI__?.core?.invoke;
      return typeof invoke === "function" ? { invoke } : null;
    } catch (error) {
      log("could not access the Tauri core API", error);
      return null;
    }
  })();

  const tauriEvent = (() => {
    try {
      const listen = window.__TAURI__?.event?.listen;
      return typeof listen === "function" ? { listen } : null;
    } catch (error) {
      log("could not access the Tauri event API", error);
      return null;
    }
  })();

  const UPDATE_EVENTS = {
    aboutCheck: "gptwrap://about-check-update",
    downloadStarted: "gptwrap://update-download-started",
    downloadProgress: "gptwrap://update-download-progress",
    downloadFinished: "gptwrap://update-download-finished",
    installing: "gptwrap://update-installing",
  };

  const elements = {
    status: document.querySelector(".about-update-status"),
    detail: document.querySelector(".about-update-detail"),
    progress: document.querySelector(".about-update-progress"),
    progressBar: document.querySelector(".about-update-progress-bar"),
    progressLabel: document.querySelector(".about-update-progress-label"),
    check: document.querySelector(".about-update-check"),
    install: document.querySelector(".about-update-install"),
    release: document.querySelector(".about-update-release"),
    diagnostics: document.querySelector(".about-update-diagnostics"),
    error: document.querySelector(".about-update-error"),
    copy: document.querySelector(".about-update-copy"),
  };

  let pendingUpdate = null;
  let operation = null;
  let contentLength = null;
  let downloaded = 0;
  let lastError = "";

  const normalizeError = (error) => {
    if (typeof error === "string" && error.trim()) {
      return error.trim();
    }

    if (error && typeof error === "object") {
      try {
        const serialized = JSON.stringify(error);
        if (serialized && serialized !== "{}") {
          return serialized;
        }
      } catch (_) {
        // Fall through to the generic message below.
      }
    }

    return "未知错误";
  };

  const versionLabel = (version) => {
    const value = String(version ?? "").trim();
    return value.startsWith("v") ? value : `v${value}`;
  };

  const formatBytes = (value) => {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) {
      return "0 B";
    }

    if (bytes < 1024) {
      return `${Math.round(bytes)} B`;
    }

    const units = ["KB", "MB", "GB"];
    let amount = bytes;
    let unit = "B";
    for (const nextUnit of units) {
      amount /= 1024;
      unit = nextUnit;
      if (amount < 1024 || nextUnit === units.at(-1)) {
        break;
      }
    }

    return `${amount.toFixed(amount >= 10 ? 0 : 1)} ${unit}`;
  };

  const setHidden = (element, hidden) => {
    if (element) {
      element.hidden = hidden;
    }
  };

  const setStatus = (message, detail = "") => {
    if (elements.status) {
      elements.status.textContent = message;
    }
    if (elements.detail) {
      elements.detail.textContent = detail;
      elements.detail.hidden = !detail;
    }
  };

  const setProgress = (visible, label = "") => {
    setHidden(elements.progress, !visible);
    if (elements.progressLabel) {
      elements.progressLabel.textContent = label;
    }
  };

  const resetProgress = () => {
    contentLength = null;
    downloaded = 0;
    if (elements.progressBar) {
      elements.progressBar.removeAttribute("value");
    }
    setProgress(false);
  };

  const clearDiagnostics = () => {
    lastError = "";
    setHidden(elements.diagnostics, true);
    if (elements.error) {
      elements.error.textContent = "";
    }
  };

  const showDiagnostics = (error) => {
    lastError = normalizeError(error);
    setHidden(elements.diagnostics, false);
    if (elements.error) {
      elements.error.textContent = lastError;
    }
  };

  const releaseUrl = (version) => {
    const normalized = String(version ?? "").trim().replace(/^v/, "");
    return `${GITHUB_URL}/releases/tag/v${encodeURIComponent(normalized)}`;
  };

  const refreshButtons = () => {
    const busy = operation !== null;
    if (elements.check) {
      elements.check.disabled = busy;
      elements.check.textContent = busy ? "正在处理…" : "重新检查";
    }
    if (elements.install) {
      elements.install.disabled = busy;
    }
  };

  const showInitialState = () => {
    pendingUpdate = null;
    clearDiagnostics();
    resetProgress();
    setStatus("尚未检查更新", `当前版本 ${versionLabel(APP_VERSION)}`);
    setHidden(elements.install, true);
    setHidden(elements.release, true);
    if (elements.check) {
      elements.check.textContent = "检查更新";
    }
  };

  const showUpToDate = () => {
    pendingUpdate = null;
    resetProgress();
    clearDiagnostics();
    setStatus("当前已是最新版本", `当前版本 ${versionLabel(APP_VERSION)}`);
    setHidden(elements.install, true);
    setHidden(elements.release, true);
    if (elements.check) {
      elements.check.textContent = "重新检查";
    }
  };

  const showAvailable = (update) => {
    pendingUpdate = update;
    clearDiagnostics();
    resetProgress();
    const current = update?.currentVersion || APP_VERSION;
    const version = update?.version || "";
    setStatus(
      `发现新版本 ${versionLabel(version)}`,
      `当前版本 ${versionLabel(current)}，下载完成后应用将自动退出并重启`,
    );
    setHidden(elements.install, false);
    if (elements.install) {
      elements.install.textContent = "立即更新";
    }
    if (elements.release) {
      elements.release.href = releaseUrl(version);
      elements.release.hidden = false;
    }
    if (elements.check) {
      elements.check.textContent = "重新检查";
    }
  };

  const showError = (error) => {
    resetProgress();
    setStatus("更新失败", "请检查网络连接后重试");
    showDiagnostics(error);
    setHidden(elements.release, !pendingUpdate);
    setHidden(elements.install, !pendingUpdate);
    if (elements.install && pendingUpdate) {
      elements.install.textContent = "重试更新";
    }
    if (elements.check) {
      elements.check.textContent = "重新检查";
    }
  };

  const showUnavailable = () => {
    pendingUpdate = null;
    setStatus("更新功能不可用", "请在 GPTWrap 桌面应用中检查更新");
    setHidden(elements.install, true);
    setHidden(elements.release, true);
    if (elements.check) {
      elements.check.disabled = true;
      elements.check.textContent = "检查更新";
    }
  };

  const handleDownloadStarted = (payload) => {
    contentLength = Number.isFinite(Number(payload?.contentLength))
      ? Number(payload.contentLength)
      : null;
    downloaded = 0;
    if (elements.progressBar) {
      if (contentLength && contentLength > 0) {
        elements.progressBar.max = 100;
        elements.progressBar.value = 0;
      } else {
        elements.progressBar.removeAttribute("value");
      }
    }
    setProgress(true, contentLength ? "0%" : "下载中");
    setStatus("正在下载更新", `目标版本 ${versionLabel(pendingUpdate?.version)}`);
  };

  const handleDownloadProgress = (payload) => {
    downloaded = Number(payload?.downloaded) || downloaded;
    if (Number.isFinite(Number(payload?.contentLength)) && Number(payload.contentLength) > 0) {
      contentLength = Number(payload.contentLength);
    }

    if (contentLength && contentLength > 0) {
      const percentage = Math.min(100, Math.round((downloaded / contentLength) * 100));
      if (elements.progressBar) {
        elements.progressBar.max = 100;
        elements.progressBar.value = percentage;
      }
      setProgress(true, `${percentage}%`);
      setStatus("正在下载更新", `${formatBytes(downloaded)} / ${formatBytes(contentLength)}`);
    } else {
      setProgress(true, `已下载 ${formatBytes(downloaded)}`);
    }
  };

  const handleDownloadFinished = () => {
    setProgress(true, "校验中");
    setStatus("正在校验更新包", `目标版本 ${versionLabel(pendingUpdate?.version)}`);
  };

  const handleInstalling = () => {
    setProgress(true, "安装中");
    setStatus("正在安装更新", "安装完成后应用将自动退出并重启");
  };

  const startCheck = () => {
    if (operation) {
      return operation;
    }

    if (!tauriCore) {
      showUnavailable();
      return Promise.resolve();
    }

    pendingUpdate = null;
    resetProgress();
    clearDiagnostics();
    setHidden(elements.install, true);
    setHidden(elements.release, true);
    setStatus("正在检查更新", "正在连接更新服务器…");
    operation = Promise.resolve(tauriCore.invoke("check_for_update"))
      .then((update) => {
        if (update) {
          showAvailable(update);
        } else {
          showUpToDate();
        }
      })
      .catch((error) => {
        showError(error);
      })
      .finally(() => {
        operation = null;
        refreshButtons();
      });
    refreshButtons();
    return operation;
  };

  const startInstall = () => {
    if (!pendingUpdate || operation || !tauriCore) {
      return Promise.resolve();
    }

    clearDiagnostics();
    resetProgress();
    setHidden(elements.install, false);
    setHidden(elements.release, false);
    setStatus("正在准备更新", `目标版本 ${versionLabel(pendingUpdate.version)}`);
    operation = Promise.resolve(tauriCore.invoke("install_update"))
      .then(() => {
        setStatus("更新完成", "应用即将重启");
      })
      .catch((error) => {
        showError(error);
      })
      .finally(() => {
        operation = null;
        refreshButtons();
      });
    refreshButtons();
    return operation;
  };

  const closeWindow = () => {
    try {
      const getCurrentWindow = window.__TAURI__?.window?.getCurrentWindow;
      const currentWindow =
        typeof getCurrentWindow === "function" ? getCurrentWindow() : null;
      if (currentWindow && typeof currentWindow.hide === "function") {
        Promise.resolve(currentWindow.hide()).catch((error) =>
          log("could not hide the about window", error),
        );
        return;
      }

      window.close();
    } catch (error) {
      log("could not hide the about window", error);
    }
  };

  const copyErrorDetails = async () => {
    if (!lastError) {
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(lastError);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = lastError;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      if (elements.copy) {
        elements.copy.textContent = "已复制";
        window.setTimeout(() => {
          elements.copy.textContent = "复制错误详情";
        }, 1600);
      }
    } catch (error) {
      log("could not copy updater diagnostics", error);
    }
  };

  const listenForUpdaterEvents = async () => {
    if (!tauriEvent) {
      return;
    }

    const handlers = [
      [UPDATE_EVENTS.aboutCheck, () => {
        startCheck();
        if (tauriCore) {
          Promise.resolve(tauriCore.invoke("consume_about_check")).catch((error) =>
            log("could not consume the update-check request", error),
          );
        }
      }],
      [UPDATE_EVENTS.downloadStarted, (event) => handleDownloadStarted(event?.payload)],
      [UPDATE_EVENTS.downloadProgress, (event) => handleDownloadProgress(event?.payload)],
      [UPDATE_EVENTS.downloadFinished, () => handleDownloadFinished()],
      [UPDATE_EVENTS.installing, () => handleInstalling()],
    ];

    for (const [event, handler] of handlers) {
      try {
        await tauriEvent.listen(event, handler);
      } catch (error) {
        log(`could not listen for ${event}`, error);
      }
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

  elements.check?.addEventListener("click", () => {
    startCheck();
  });

  elements.install?.addEventListener("click", () => {
    startInstall();
  });

  elements.copy?.addEventListener("click", () => {
    copyErrorDetails();
  });

  showInitialState();

  // Register listeners before consuming the pending request. The Rust side
  // also retains that request, so a newly-created about window cannot miss it
  // while its document is still loading.
  Promise.resolve()
    .then(() => listenForUpdaterEvents())
    .then(() => {
      if (!tauriCore) {
        showUnavailable();
        return false;
      }
      return tauriCore.invoke("consume_about_check");
    })
    .then((shouldCheck) => {
      if (shouldCheck) {
        startCheck();
      }
    })
    .catch((error) => log("could not initialize updater controls", error));
})();
