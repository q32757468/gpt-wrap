(() => {
  "use strict";

  const ALLOWED_ORIGINS = new Set(["https://chatgpt.com"]);
  const BOOTSTRAP_KEY = Symbol.for("com.gptwrap.titlebar.bootstrap.v1");
  const HOST_TAG = "gptwrap-titlebar-host";
  const TITLEBAR_HEIGHT = "32px";
  const SAFE_AREA_PROPERTY = "padding-top";
  const SAFE_AREA_STYLE_ATTRIBUTE = "data-gptwrap-titlebar-safe-area";
  const DRAG_START_DELAY_MS = 250;
  const DRAG_DOUBLE_CLICK_WINDOW_MS = 500;
  const DRAG_MOVE_THRESHOLD_PX = 4;
  const LOGO_DATA_URL = __GPTWRAP_TITLEBAR_LOGO__;
  const CSS_TEXT = __GPTWRAP_TITLEBAR_CSS__;

  const log = (message, error) => {
    try {
      console.error("[GPTWrap:titlebar]", message, error);
    } catch (_) {
      // Diagnostics must never prevent the page from loading.
    }
  };

  const logOperationError = (operation, error) => {
    log(`${operation} failed`, error);
  };

  const stopEvent = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const stopPropagation = (event) => {
    event.stopPropagation();
  };

  const getExistingHost = () => {
    const root = document.documentElement;
    if (!root) {
      return null;
    }

    for (const child of root.children) {
      if (child.localName === HOST_TAG) {
        return child;
      }
    }

    return null;
  };

  const setHostStyles = (host) => {
    const styles = {
      position: "fixed",
      inset: "0 0 auto 0",
      height: TITLEBAR_HEIGHT,
      width: "100%",
      "z-index": "2147483647",
      display: "block",
      "pointer-events": "none",
      isolation: "isolate",
      contain: "layout style paint",
      margin: "0",
      padding: "0",
      border: "0",
      background: "transparent",
    };

    for (const [property, value] of Object.entries(styles)) {
      host.style.setProperty(property, value, "important");
    }
  };

  // Reserve only the titlebar's top strip on the document root. Do not alter
  // body/main dimensions, overflow, viewport variables, or any page element.
  const applyPageSafeArea = (state) => {
    if (state.safeArea) {
      return true;
    }

    const root = document.documentElement;
    if (!root) {
      return false;
    }

    const saved = {
      root,
      value: root.style.getPropertyValue(SAFE_AREA_PROPERTY),
      priority: root.style.getPropertyPriority(SAFE_AREA_PROPERTY),
      style: null,
    };

    try {
      const existing = getComputedStyle(root).getPropertyValue(SAFE_AREA_PROPERTY);
      const base = existing && existing !== "auto" ? existing : "0px";
      root.style.setProperty(
        SAFE_AREA_PROPERTY,
        `calc(${base} + ${TITLEBAR_HEIGHT})`,
        "important",
      );
      const style = document.createElement("style");
      style.setAttribute(SAFE_AREA_STYLE_ATTRIBUTE, "");
      style.textContent = `
        .h-svh {
          height: calc(100svh - ${TITLEBAR_HEIGHT}) !important;
        }
        .h-screen,
        .h-\\[100vh\\] {
          height: calc(100vh - ${TITLEBAR_HEIGHT}) !important;
        }
      `;
      root.appendChild(style);
      saved.style = style;
      // Initialization scripts run before the page parser has created the
      // head/body. Keep the override at the document end after parsing so it
      // remains the final rule without touching any other page layout.
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          if (style.isConnected && document.documentElement) {
            document.documentElement.appendChild(style);
          }
        },
        { once: true },
      );
      state.safeArea = saved;
      return true;
    } catch (error) {
      if (saved.value) {
        root.style.setProperty(SAFE_AREA_PROPERTY, saved.value, saved.priority);
      } else {
        root.style.removeProperty(SAFE_AREA_PROPERTY);
      }
      saved.style?.remove();
      log("could not apply the document safe area; using overlay mode", error);
      return false;
    }
  };

  const removePageSafeArea = (state) => {
    const saved = state.safeArea;
    if (!saved) {
      return;
    }

    try {
      if (saved.root === document.documentElement) {
        if (saved.value) {
          saved.root.style.setProperty(SAFE_AREA_PROPERTY, saved.value, saved.priority);
        } else {
          saved.root.style.removeProperty(SAFE_AREA_PROPERTY);
        }
      }
      saved.style?.remove();
    } catch (error) {
      log("could not restore the document safe area", error);
    } finally {
      state.safeArea = null;
    }
  };

  const icon = (name) => {
    if (name === "minimize") {
      return `<svg viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d="M3 7h8"></path></svg>`;
    }

    if (name === "restore") {
      return `<svg viewBox="0 0 14 14" aria-hidden="true" focusable="false"><rect x="2" y="4.5" width="7.5" height="7.5" rx="1"></rect><path d="M4.5 4.5V2.5h7v7h-2"></path></svg>`;
    }

    if (name === "maximize") {
      return `<svg viewBox="0 0 14 14" aria-hidden="true" focusable="false"><rect x="2.75" y="2.75" width="8.5" height="8.5" rx="0.8"></rect></svg>`;
    }

    return `<svg viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d="m3 3 8 8m0-8-8 8"></path></svg>`;
  };

  const setMaximizeIcon = (button, maximized) => {
    const iconElement = button.querySelector(".icon");
    if (iconElement) {
      iconElement.innerHTML = icon(maximized ? "restore" : "maximize");
    }
    button.setAttribute("aria-label", maximized ? "还原窗口" : "最大化窗口");
  };

  const createTitlebar = () => {
    const host = document.createElement(HOST_TAG);
    host.setAttribute("aria-label", "GPTWrap window controls");
    setHostStyles(host);

    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = CSS_TEXT;
    shadow.appendChild(style);

    const titlebar = document.createElement("div");
    titlebar.className = "titlebar";
    titlebar.setAttribute("role", "toolbar");
    titlebar.setAttribute("aria-label", "GPTWrap window controls");
    titlebar.innerHTML = `
      <div class="brand" aria-hidden="true">
        <img class="brand-icon" alt="" />
        <span class="brand-name">GPTWrap</span>
      </div>
      <div class="menu-bar">
        <div class="menu">
          <button class="menu-button" type="button" aria-haspopup="true" aria-expanded="false" data-menu="file">文件</button>
          <div class="menu-panel" role="menu" data-menu-panel="file" hidden>
            <button class="menu-item" type="button" role="menuitem" data-action="exit">退出</button>
          </div>
        </div>
        <div class="menu">
          <button class="menu-button" type="button" aria-haspopup="true" aria-expanded="false" data-menu="help">帮助</button>
          <div class="menu-panel" role="menu" data-menu-panel="help" hidden>
            <button class="menu-item" type="button" role="menuitem" data-action="about">关于</button>
            <button class="menu-item" type="button" role="menuitem" data-action="check-update">检查更新</button>
          </div>
        </div>
      </div>
      <div class="drag-region" aria-hidden="true"></div>
      <div class="window-buttons">
        <button class="window-button minimize-button" type="button" aria-label="最小化窗口">
          <span class="icon">${icon("minimize")}</span>
        </button>
        <button class="window-button maximize-button" type="button" aria-label="最大化窗口">
          <span class="icon">${icon("maximize")}</span>
        </button>
        <button class="window-button close-button" type="button" aria-label="隐藏窗口">
          <span class="icon">${icon("close")}</span>
        </button>
      </div>`;
    shadow.appendChild(titlebar);

    const brandIcon = titlebar.querySelector(".brand-icon");
    if (brandIcon) {
      brandIcon.src = LOGO_DATA_URL;
    }

    return {
      host,
      titlebar,
      dragRegion: titlebar.querySelector(".drag-region"),
      buttons: {
        minimize: titlebar.querySelector(".minimize-button"),
        maximize: titlebar.querySelector(".maximize-button"),
        close: titlebar.querySelector(".close-button"),
      },
    };
  };

  const mount = () => {
    if (!document.documentElement) {
      return null;
    }

    const existing = getExistingHost();
    if (existing) {
      return { host: existing, restored: false };
    }

    const controls = createTitlebar();
    document.documentElement.appendChild(controls.host);
    return { ...controls, restored: false };
  };

  const install = (state) => {
    const mounted = mount();
    if (!mounted) {
      return;
    }

    // An existing host may belong to an earlier injected copy. Do not attach
    // another set of handlers or inspect its shadow tree.
    if (!mounted.dragRegion || !mounted.buttons) {
      return;
    }

    applyPageSafeArea(state);

    const tauriWindow = (() => {
      try {
        const getCurrentWindow = window.__TAURI__?.window?.getCurrentWindow;
        return typeof getCurrentWindow === "function" ? getCurrentWindow() : null;
      } catch (error) {
        log("could not access the Tauri window API", error);
        return null;
      }
    })();
    const tauriProcess = (() => {
      try {
        const exit = window.__TAURI__?.process?.exit;
        return typeof exit === "function" ? { exit } : null;
      } catch (error) {
        log("could not access the Tauri process API", error);
        return null;
      }
    })();
    const tauriCore = (() => {
      try {
        const invoke = window.__TAURI__?.core?.invoke;
        return typeof invoke === "function" ? { invoke } : null;
      } catch (error) {
        log("could not access the Tauri core API", error);
        return null;
      }
    })();

    const { titlebar, dragRegion, buttons } = mounted;
    const allButtons = Object.values(buttons);
    const menuEntries = Array.from(titlebar.querySelectorAll(".menu-button"))
      .map((button) => ({
        button,
        panel: titlebar.querySelector(`[data-menu-panel="${button.dataset.menu}"]`),
      }))
      .filter((entry) => entry.panel);
    const exitMenuItem = titlebar.querySelector('[data-action="exit"]');
    const aboutMenuItem = titlebar.querySelector('[data-action="about"]');
    const checkUpdateMenuItem = titlebar.querySelector('[data-action="check-update"]');
    let openMenu = null;
    let pendingDragTimer = null;
    let dragStartPoint = null;
    let dragDoubleClickHandled = false;
    const disableButtons = () => {
      for (const button of allButtons) {
        if (!button) {
          continue;
        }
        button.disabled = true;
        button.setAttribute("aria-disabled", "true");
      }
    };

    const runOperation = (target, name, operation) => {
      if (!target) {
        return;
      }

      try {
        Promise.resolve(operation()).catch((error) => logOperationError(name, error));
      } catch (error) {
        logOperationError(name, error);
      }
    };

    const runWindowOperation = (name, operation) =>
      runOperation(tauriWindow, name, operation);
    const runProcessOperation = (name, operation) =>
      runOperation(tauriProcess, name, operation);
    const runCoreOperation = (name, operation) =>
      runOperation(tauriCore, name, operation);

    const updateMaximizeState = () => {
      if (!tauriWindow || !buttons.maximize) {
        return;
      }

      Promise.resolve()
        .then(() => tauriWindow.isMaximized())
        .then((maximized) => setMaximizeIcon(buttons.maximize, Boolean(maximized)))
        .catch((error) => logOperationError("checking maximize state", error));
    };

    const closeMenus = () => {
      for (const entry of menuEntries) {
        entry.panel.hidden = true;
        entry.button.setAttribute("aria-expanded", "false");
      }
      mounted.host.style.setProperty("height", TITLEBAR_HEIGHT, "important");
      openMenu = null;
    };

    const openMenuEntry = (entry) => {
      closeMenus();
      entry.panel.hidden = false;
      entry.button.setAttribute("aria-expanded", "true");
      openMenu = entry;

      const hostTop = mounted.host.getBoundingClientRect().top;
      const panelBottom = entry.panel.getBoundingClientRect().bottom;
      const menuHeight = Math.max(
        Number.parseFloat(TITLEBAR_HEIGHT),
        Math.ceil(panelBottom - hostTop + 4),
      );
      mounted.host.style.setProperty("height", `${menuHeight}px`, "important");
    };

    const isMenuTarget = (target) =>
      target instanceof Element && Boolean(target.closest(".menu"));

    // A click inside the titlebar but outside a menu should dismiss an open
    // panel before the target's own handler (window buttons or drag region)
    // gets a chance to run. Capture is scoped to this closed shadow tree.
    titlebar.addEventListener(
      "click",
      (event) => {
        if (!isMenuTarget(event.target)) {
          closeMenus();
        }
      },
      true,
    );
    titlebar.addEventListener(
      "mousedown",
      (event) => {
        if (!isMenuTarget(event.target)) {
          closeMenus();
        }
      },
      true,
    );

    // The page may consume a click before it reaches the document listener,
    // so also close menus on a document-level bubble event. Events originating
    // in this host are already isolated by the titlebar's local handlers.
    const closeMenusFromOutside = (event) => {
      if (!openMenu) {
        return;
      }

      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      if (path.includes(mounted.host)) {
        return;
      }
      closeMenus();
    };
    document.addEventListener("mousedown", closeMenusFromOutside);
    document.addEventListener("click", closeMenusFromOutside);

    // Keep all events inside the closed shadow tree. The more specific drag
    // and button handlers below run first, then this local handler prevents
    // retargeted events from reaching ChatGPT's document listeners.
    for (const eventName of [
      "click",
      "dblclick",
      "mousedown",
      "mouseup",
      "pointerdown",
      "pointerup",
      "mousemove",
      "pointermove",
      "contextmenu",
    ]) {
      titlebar.addEventListener(eventName, (event) => {
        event.stopPropagation();
        if (eventName === "contextmenu") {
          event.preventDefault();
        }
      });
    }

    titlebar.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Escape") {
        closeMenus();
      }
    });

    for (const entry of menuEntries) {
      entry.button.addEventListener("click", (event) => {
        stopEvent(event);
        if (entry.panel.hidden) {
          openMenuEntry(entry);
        } else {
          closeMenus();
        }
      });

      entry.button.addEventListener("mouseenter", () => {
        if (openMenu && openMenu !== entry) {
          openMenuEntry(entry);
        }
      });
    }

    exitMenuItem?.addEventListener("click", (event) => {
      stopEvent(event);
      closeMenus();
      runProcessOperation("exiting application", () => tauriProcess?.exit(0));
    });

    aboutMenuItem?.addEventListener("click", (event) => {
      stopEvent(event);
      closeMenus();
      runCoreOperation("opening the about window", () =>
        tauriCore?.invoke("open_about_window", { autoCheck: false }),
      );
    });

    checkUpdateMenuItem?.addEventListener("click", (event) => {
      stopEvent(event);
      closeMenus();
      runCoreOperation("opening the about window for an update check", () =>
        tauriCore?.invoke("open_about_window", { autoCheck: true }),
      );
    });

    const toggleMaximize = () => {
      runWindowOperation("toggling maximize", async () => {
        await tauriWindow?.toggleMaximize();
        updateMaximizeState();
      });
    };

    const clearPendingDrag = () => {
      if (pendingDragTimer !== null) {
        window.clearTimeout(pendingDragTimer);
        pendingDragTimer = null;
      }
    };

    let isDragging = false;

    const startDrag = () => {
      if (isDragging) {
        return;
      }

      clearPendingDrag();
      dragStartPoint = null;
      isDragging = true;

      const finishDrag = () => {
        isDragging = false;
      };

      try {
        if (tauriCore) {
          runCoreOperation("starting window drag", () =>
            tauriCore.invoke("start_drag").finally(finishDrag),
          );
        } else {
          runWindowOperation("starting window drag", () =>
            tauriWindow?.startDragging().finally(finishDrag),
          );
        }
      } catch (error) {
        finishDrag();
        throw error;
      }
    };

    // Delay starting a drag just long enough to let a second click arrive.
    // Calling startDragging() during the first mousedown lets the native
    // window manager consume the second click, which prevents dblclick from
    // toggling maximize. A held click still starts dragging after the delay.
    const scheduleDrag = () => {
      clearPendingDrag();
      pendingDragTimer = window.setTimeout(() => {
        pendingDragTimer = null;
        dragStartPoint = null;
        startDrag();
      }, DRAG_START_DELAY_MS);
    };

    // The drag region is deliberately the only area that starts a drag. The
    // controls and brand are not draggable and cannot forward clicks to the
    // page underneath the overlay.
    dragRegion.addEventListener("mousedown", (event) => {
      if (event.button !== 0 || event.target !== dragRegion) {
        return;
      }
      stopEvent(event);

      if (event.detail >= 2) {
        clearPendingDrag();
        dragStartPoint = null;
        isDragging = false;
        dragDoubleClickHandled = true;
        toggleMaximize();
        window.setTimeout(() => {
          dragDoubleClickHandled = false;
        }, DRAG_DOUBLE_CLICK_WINDOW_MS);
        return;
      }

      dragStartPoint = { x: event.clientX, y: event.clientY };
      scheduleDrag();
    });

    dragRegion.addEventListener("mousemove", (event) => {
      if (!dragStartPoint || (event.buttons & 1) !== 1) {
        return;
      }

      const movedX = event.clientX - dragStartPoint.x;
      const movedY = event.clientY - dragStartPoint.y;
      if (Math.hypot(movedX, movedY) < DRAG_MOVE_THRESHOLD_PX) {
        return;
      }

      stopEvent(event);
      startDrag();
    });

    dragRegion.addEventListener("mouseup", (event) => {
      if (event.button === 0) {
        clearPendingDrag();
        dragStartPoint = null;
        isDragging = false;
      }
    });

    titlebar.addEventListener("dblclick", (event) => {
      const target = event.target;
      const isInMenu = target instanceof Element && target.closest(".menu");
      const isInWindowButtons =
        target instanceof Element && target.closest(".window-buttons");
      const isInBrand = target instanceof Element && target.closest(".brand");
      const isDragRegion = target === dragRegion;

      if (
        event.button !== 0 ||
        isInMenu ||
        isInWindowButtons ||
        (!isInBrand && !isDragRegion && target !== titlebar)
      ) {
        return;
      }

      if (isDragRegion && dragDoubleClickHandled) {
        stopEvent(event);
        dragDoubleClickHandled = false;
        return;
      }

      stopEvent(event);
      toggleMaximize();
    });

    for (const button of allButtons) {
      if (!button) {
        continue;
      }
      for (const eventName of ["mousedown", "pointerdown", "dblclick"]) {
        button.addEventListener(eventName, stopPropagation);
      }
    }

    buttons.minimize?.addEventListener("click", (event) => {
      stopEvent(event);
      runWindowOperation("minimizing window", () => tauriWindow?.minimize());
    });

    buttons.maximize?.addEventListener("click", (event) => {
      stopEvent(event);
      toggleMaximize();
    });

    buttons.close?.addEventListener("click", (event) => {
      stopEvent(event);
      runWindowOperation("hiding window", () => tauriWindow?.hide());
    });

    let unlistenResize = null;

    const listenForWindowChanges = () => {
      if (unlistenResize) {
        return;
      }

      if (tauriWindow && typeof tauriWindow.onResized === "function") {
        tauriWindow
          .onResized(() => updateMaximizeState())
          .then((unlisten) => {
            unlistenResize = unlisten;
          })
          .catch((error) => logOperationError("listening for window resize", error));
      } else if (tauriWindow && typeof tauriWindow.listen === "function") {
        tauriWindow
          .listen("tauri://resize", () => updateMaximizeState())
          .then((unlisten) => {
            unlistenResize = unlisten;
          })
          .catch((error) => logOperationError("listening for window resize", error));
      } else {
        const handler = () => updateMaximizeState();
        window.addEventListener("resize", handler);
        unlistenResize = () => window.removeEventListener("resize", handler);
      }
    };

    if (!tauriWindow) {
      disableButtons();
      if (!state.apiUnavailableLogged) {
        state.apiUnavailableLogged = true;
        log("Tauri window API is unavailable; window buttons are disabled");
      }
    } else {
      updateMaximizeState();
      listenForWindowChanges();
    }

    if (!tauriProcess && exitMenuItem) {
      exitMenuItem.disabled = true;
      exitMenuItem.setAttribute("aria-disabled", "true");
      if (!state.processApiUnavailableLogged) {
        state.processApiUnavailableLogged = true;
        log("Tauri process API is unavailable; exit menu item is disabled");
      }
    }

    // Restore only once if the page removes the host itself. The observer
    // watches the document root's direct children, never ChatGPT's subtree.
    const observer = new MutationObserver(() => {
      if (state.restored || mounted.host.parentNode === document.documentElement) {
        return;
      }

      state.restored = true;
      document.removeEventListener("mousedown", closeMenusFromOutside);
      document.removeEventListener("click", closeMenusFromOutside);
      if (typeof unlistenResize === "function") {
        try {
          unlistenResize();
        } catch (_) {
          // Ignore cleanup errors.
        }
        unlistenResize = null;
      }
      clearPendingDrag();
      dragStartPoint = null;
      isDragging = false;
      try {
        install(state);
      } catch (error) {
        log("could not restore the titlebar host", error);
        removePageSafeArea(state);
      } finally {
        observer.disconnect();
      }
    });
    if (!state.restored) {
      observer.observe(document.documentElement, { childList: true });
    }
  };

  try {
    if (window.top !== window || !ALLOWED_ORIGINS.has(window.location.origin)) {
      return;
    }

    if (window[BOOTSTRAP_KEY]) {
      return;
    }
    const state = {
      restored: false,
      apiUnavailableLogged: false,
      processApiUnavailableLogged: false,
      safeArea: null,
    };
    window[BOOTSTRAP_KEY] = state;
    const safeInstall = () => {
      try {
        install(state);
      } catch (error) {
        log("bootstrap failed; leaving the page untouched", error);
      }
    };

    const waitForDocumentElement = () => {
      if (document.documentElement) {
        safeInstall();
        return;
      }

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", safeInstall, { once: true });
      } else {
        log("documentElement is unavailable; leaving the page untouched");
      }
    };

    waitForDocumentElement();
  } catch (error) {
    log("bootstrap failed; leaving the page untouched", error);
  }
})();
