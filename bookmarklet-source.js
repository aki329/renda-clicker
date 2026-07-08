(function () {
  const ID = "aki-bookmarklet-clicker";
  const STORE_KEY = "akiBookmarkletClickerSettings";
  const LAUNCHER_ID = "aki-bookmarklet-clicker-launcher";
  const VERSION = "2026-07-08-simple-100cps";
  const TOGGLE_DEBOUNCE_MS = 350;
  const DEFAULTS = {
    cps: 30,
    panelHidden: false,
    panelSide: "right",
    hotkey: {
      key: "c",
      code: "KeyC",
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: true,
      label: "Option+Shift+C"
    }
  };

  const existing = window.__akiBookmarkletClicker;
  if (existing && existing.version === VERSION && typeof existing.show === "function") {
    existing.show();
    return;
  }
  if (existing) {
    try {
      if (typeof existing.stop === "function") existing.stop();
    } catch (_error) {
      // Continue replacing an older panel.
    }
    const oldRoot = document.getElementById(ID);
    const oldLauncher = document.getElementById(LAUNCHER_ID);
    if (oldRoot) oldRoot.remove();
    if (oldLauncher) oldLauncher.remove();
  }

  let settings = loadSettings();
  let active = false;
  let timerId = null;
  let nextClickAt = 0;
  let measureTimerId = null;
  let clickCountThisSecond = 0;
  let measuredCps = 0;
  let recordingHotkey = false;
  let lastToggleAt = 0;
  let pointer = {
    x: Math.max(1, Math.round(window.innerWidth / 2)),
    y: Math.max(1, Math.round(window.innerHeight / 2))
  };

  const root = document.createElement("div");
  root.id = ID;
  root.innerHTML = `
    <style>
      #${ID} {
        position: fixed;
        right: 12px;
        bottom: 12px;
        z-index: 2147483647;
        width: 252px;
        color: #1d1d1f;
        background: #ffffff;
        border: 1px solid #d2d2d7;
        border-radius: 6px;
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.42);
        font: 12px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
      }
      #${ID}[data-minimized="true"] .aki-clicker-body {
        display: none;
      }
      #${ID}[data-side="left"] {
        left: 12px;
        right: auto;
      }
      #${LAUNCHER_ID} {
        position: fixed;
        right: 12px;
        bottom: 12px;
        z-index: 2147483647;
        min-height: 34px;
        border: 1px solid #d2d2d7;
        border-radius: 6px;
        padding: 0 10px;
        color: #1d1d1f;
        background: #ffffff;
        box-shadow: 0 8px 18px rgba(0, 0, 0, 0.35);
        font: 700 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: pointer;
      }
      #${LAUNCHER_ID}[data-active="true"] {
        color: #ffffff;
        border-color: #1d1d1f;
        background: #1d1d1f;
      }
      #${LAUNCHER_ID}[data-side="left"] {
        left: 12px;
        right: auto;
      }
      #${ID} * {
        box-sizing: border-box;
        font: inherit;
      }
      #${ID} .aki-clicker-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px 9px;
        color: #1d1d1f;
        background: #f5f5f7;
        border-bottom: 1px solid #d2d2d7;
        border-radius: 6px 6px 0 0;
        font-weight: 900;
      }
      #${ID}[data-active="true"] .aki-clicker-head {
        color: #ffffff;
        background: #1d1d1f;
      }
      #${ID} .aki-clicker-head button {
        width: 24px;
        min-width: 24px;
        height: 24px;
        border: 1px solid #c7c7cc;
        border-radius: 5px;
        color: #1d1d1f;
        background: #ffffff;
        cursor: pointer;
      }
      #${ID} .aki-clicker-body {
        display: grid;
        gap: 8px;
        padding: 9px;
      }
      #${ID} button {
        min-height: 32px;
        border: 1px solid #c7c7cc;
        border-radius: 6px;
        color: #1d1d1f;
        background: #ffffff;
        font-weight: 900;
        cursor: pointer;
      }
      #${ID} .aki-toggle {
        color: #ffffff;
        border-color: #1d1d1f;
        background: #1d1d1f;
      }
      #${ID} .aki-secondary {
        color: #1d1d1f;
        background: #ffffff;
      }
      #${ID} .aki-remove {
        color: #1d1d1f;
        border-color: #1d1d1f;
        background: #ffffff;
      }
      #${ID} label {
        display: grid;
        grid-template-columns: 1fr 68px;
        align-items: center;
        gap: 8px;
        color: #1d1d1f;
        font-weight: 900;
      }
      #${ID} input[type="number"] {
        width: 68px;
        min-height: 30px;
        border: 1px solid #c7c7cc;
        border-radius: 6px;
        padding: 4px 7px;
        color: #1d1d1f;
        background: #ffffff;
        font-weight: 800;
      }
      #${ID} input[type="range"] {
        width: 100%;
        accent-color: #1d1d1f;
      }
      #${ID} .aki-presets,
      #${ID} .aki-split {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 6px;
      }
      #${ID} .aki-split {
        grid-template-columns: 1fr 1fr;
      }
      #${ID} .aki-presets button,
      #${ID} .aki-split button {
        min-height: 30px;
        padding: 0 6px;
        font-size: 12px;
      }
      #${ID} .aki-hotkey {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: 8px;
      }
      #${ID} .aki-muted {
        color: #6e6e73;
        font-size: 11px;
        font-weight: 800;
      }
      #${ID} .aki-note {
        color: #1d1d1f;
        background: #f5f5f7;
        border-radius: 6px;
        padding: 8px;
        font-size: 11px;
      }
      #${ID} .aki-check {
        display: flex;
        align-items: center;
        justify-content: space-between;
        grid-template-columns: none;
        border: 1px solid #d2d2d7;
        border-radius: 6px;
        padding: 8px;
        background: #ffffff;
      }
      #${ID} .aki-check input {
        width: 18px;
        height: 18px;
        accent-color: #1d1d1f;
      }
    </style>
    <div class="aki-clicker-head">
      <span class="aki-title">停止</span>
      <span>
        <button class="aki-hide" type="button" title="非表示">×</button>
        <button class="aki-minimize" type="button" title="小さくする">-</button>
      </span>
    </div>
    <div class="aki-clicker-body">
      <button class="aki-toggle" type="button">開始 / 停止</button>
      <label>
        <span>CPS</span>
        <input class="aki-cps-input" type="number" min="1" max="100" step="1">
      </label>
      <input class="aki-cps-range" type="range" min="1" max="100" step="1">
      <div class="aki-presets">
        <button class="aki-secondary" type="button" data-cps="10">10</button>
        <button class="aki-secondary" type="button" data-cps="30">30</button>
        <button class="aki-secondary" type="button" data-cps="60">60</button>
        <button class="aki-secondary" type="button" data-cps="100">100</button>
      </div>
      <div class="aki-hotkey">
        <div>
          <div class="aki-muted">キー</div>
          <strong class="aki-hotkey-text">Option+Shift+C</strong>
        </div>
        <button class="aki-record aki-secondary" type="button">変更</button>
      </div>
      <div class="aki-record-note aki-muted" hidden></div>
      <div class="aki-split">
        <button class="aki-side-left aki-secondary" type="button">左下</button>
        <button class="aki-side-right aki-secondary" type="button">右下</button>
      </div>
      <div class="aki-muted">Escで停止</div>
      <button class="aki-remove aki-secondary" type="button">削除</button>
      <div class="aki-note">危険な画面では停止</div>
    </div>
  `;
  document.documentElement.append(root);
  const launcher = document.createElement("button");
  launcher.id = LAUNCHER_ID;
  launcher.type = "button";
  launcher.textContent = "表示";
  document.documentElement.append(launcher);

  const title = root.querySelector(".aki-title");
  const hideButton = root.querySelector(".aki-hide");
  const minimizeButton = root.querySelector(".aki-minimize");
  const toggleButton = root.querySelector(".aki-toggle");
  const cpsInput = root.querySelector(".aki-cps-input");
  const cpsRange = root.querySelector(".aki-cps-range");
  const presetButtons = root.querySelectorAll("[data-cps]");
  const hotkeyText = root.querySelector(".aki-hotkey-text");
  const recordButton = root.querySelector(".aki-record");
  const recordNote = root.querySelector(".aki-record-note");
  const sideLeftButton = root.querySelector(".aki-side-left");
  const sideRightButton = root.querySelector(".aki-side-right");
  const removeButton = root.querySelector(".aki-remove");

  window.addEventListener("mousemove", updatePointer, true);
  window.addEventListener("pointermove", updatePointer, true);
  window.addEventListener("pointerdown", updatePointer, true);
  window.addEventListener("keydown", handleKeydown, true);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  toggleButton.addEventListener("click", function () {
    toggle();
  });
  hideButton.addEventListener("click", hidePanel);
  launcher.addEventListener("click", showPanel);
  minimizeButton.addEventListener("click", function () {
    const minimized = root.dataset.minimized !== "true";
    root.dataset.minimized = String(minimized);
    minimizeButton.textContent = minimized ? "+" : "-";
  });
  cpsInput.addEventListener("change", function () {
    setCps(cpsInput.value);
  });
  cpsRange.addEventListener("input", function () {
    setCps(cpsRange.value);
  });
  presetButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      setCps(button.dataset.cps);
    });
  });
  recordButton.addEventListener("click", function () {
    recordingHotkey = true;
    recordButton.textContent = "入力中";
    recordNote.hidden = false;
    recordNote.textContent = "キー入力";
  });
  sideLeftButton.addEventListener("click", function () {
    setPanelSide("left");
  });
  sideRightButton.addEventListener("click", function () {
    setPanelSide("right");
  });
  removeButton.addEventListener("click", destroy);

  window.__akiBookmarkletClicker = {
    version: VERSION,
    show: function () {
      showPanel();
    },
    stop: stop,
    destroy: destroy
  };

  if (settings.panelHidden) {
    hidePanel(false);
  } else {
    showPanel(false);
  }
  render();

  function start() {
    if (active) return;
    active = true;
    nextClickAt = performance.now();
    clickCountThisSecond = 0;
    measuredCps = 0;
    startMeasureLoop();
    render();
    runClickLoop();
  }

  function stop() {
    if (!active) return;
    active = false;
    clearTimeout(timerId);
    clearInterval(measureTimerId);
    timerId = null;
    nextClickAt = 0;
    measureTimerId = null;
    measuredCps = 0;
    render();
  }

  function toggle() {
    const now = performance.now();
    if (now - lastToggleAt < TOGGLE_DEBOUNCE_MS) return;
    lastToggleAt = now;
    active ? stop() : start();
  }

  function handleVisibilityChange() {
    if (document.hidden) stop();
  }

  function destroy() {
    stop();
    window.removeEventListener("mousemove", updatePointer, true);
    window.removeEventListener("pointermove", updatePointer, true);
    window.removeEventListener("pointerdown", updatePointer, true);
    window.removeEventListener("keydown", handleKeydown, true);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    try {
      localStorage.removeItem(STORE_KEY);
    } catch (_error) {
      // Storage may be blocked. Removing the visible tool still works.
    }
    root.remove();
    launcher.remove();
    try {
      delete window.__akiBookmarkletClicker;
    } catch (_error) {
      window.__akiBookmarkletClicker = null;
    }
  }

  function runClickLoop() {
    if (!active) return;

    const now = performance.now();
    const interval = 1000 / settings.cps;
    let fired = 0;
    if (!nextClickAt) nextClickAt = now;

    while (now >= nextClickAt && fired < 10) {
      clickAtPointer();
      nextClickAt += interval;
      fired += 1;
    }

    const delay = fired > 0 ? 1 : Math.max(1, nextClickAt - performance.now());
    timerId = window.setTimeout(runClickLoop, delay);
  }

  function clickAtPointer() {
    if (!active) return;
    const point = getClickPoint();
    const target = document.elementFromPoint(point.x, point.y);
    if (!target || target.closest("#" + ID) || target.closest("#" + LAUNCHER_ID)) return;

    if (clickCookieClicker(target, point)) {
      clickCountThisSecond += 1;
      return;
    }

    const eventOptions = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: point.x,
      clientY: point.y,
      screenX: window.screenX + point.x,
      screenY: window.screenY + point.y,
      button: 0,
      buttons: 1
    };

    if (typeof PointerEvent === "function") {
      target.dispatchEvent(new PointerEvent("pointerdown", Object.assign({}, eventOptions, {
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true
      })));
    }
    target.dispatchEvent(new MouseEvent("mousedown", eventOptions));
    target.dispatchEvent(new MouseEvent("mouseup", Object.assign({}, eventOptions, { buttons: 0 })));
    if (typeof PointerEvent === "function") {
      target.dispatchEvent(new PointerEvent("pointerup", Object.assign({}, eventOptions, {
        buttons: 0,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true
      })));
    }
    target.dispatchEvent(new MouseEvent("click", Object.assign({}, eventOptions, { buttons: 0 })));
    clickCountThisSecond += 1;
  }

  function handleKeydown(event) {
    if (event.key === "Escape") {
      if (active) {
        event.preventDefault();
        event.stopPropagation();
        stop();
      }
      if (recordingHotkey) {
        recordingHotkey = false;
        recordButton.textContent = "変更";
        recordNote.hidden = true;
      }
      return;
    }
    if (recordingHotkey) {
      captureHotkey(event);
      return;
    }
    if (event.repeat || !matchesHotkey(event, settings.hotkey)) return;
    event.preventDefault();
    event.stopPropagation();
    toggle();
  }

  function captureHotkey(event) {
    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
      recordNote.textContent = "Escは停止専用";
      return;
    }

    if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) {
      recordNote.textContent = "文字キーも押す";
      return;
    }

    const next = normalizeHotkey({
      key: event.key,
      code: event.code,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey
    });

    if (!isSafeHotkey(next)) {
      recordNote.textContent = "Option/Shiftも必要";
      return;
    }

    recordingHotkey = false;
    settings.hotkey = next;
    saveSettings();
    recordButton.textContent = "変更";
    recordNote.hidden = true;
    render();
  }

  function setPanelSide(side) {
    settings.panelSide = side === "left" ? "left" : "right";
    saveSettings();
    render();
  }

  function getClickPoint() {
    return {
      x: clamp(Math.round(pointer.x), 0, Math.max(0, window.innerWidth - 1)),
      y: clamp(Math.round(pointer.y), 0, Math.max(0, window.innerHeight - 1))
    };
  }

  function setCps(value) {
    settings.cps = normalizeCps(value);
    saveSettings();
    if (active) {
      clearTimeout(timerId);
      timerId = null;
      nextClickAt = performance.now();
      runClickLoop();
    }
    render();
  }

  function hidePanel(shouldSave) {
    root.hidden = true;
    launcher.hidden = false;
    settings.panelHidden = true;
    if (shouldSave !== false) saveSettings();
    render();
  }

  function showPanel(shouldSave) {
    root.hidden = false;
    launcher.hidden = true;
    root.dataset.minimized = "false";
    minimizeButton.textContent = "-";
    settings.panelHidden = false;
    if (shouldSave !== false) saveSettings();
    render();
  }

  function startMeasureLoop() {
    clearInterval(measureTimerId);
    measureTimerId = window.setInterval(function () {
      measuredCps = clickCountThisSecond;
      clickCountThisSecond = 0;
      render();
    }, 1000);
  }

  function updatePointer(event) {
    pointer = {
      x: clamp(Math.round(event.clientX), 0, Math.max(0, window.innerWidth - 1)),
      y: clamp(Math.round(event.clientY), 0, Math.max(0, window.innerHeight - 1))
    };
  }

  function render() {
    root.dataset.active = String(active);
    root.dataset.side = settings.panelSide;
    launcher.dataset.side = settings.panelSide;
    title.textContent = active ? "動作中" : "停止";
    cpsInput.value = String(settings.cps);
    cpsRange.value = String(settings.cps);
    hotkeyText.textContent = settings.hotkey.label;
    launcher.textContent = active ? "動作中" : "表示";
    launcher.dataset.active = String(active);
  }

  function loadSettings() {
    try {
      return normalizeSettings(JSON.parse(localStorage.getItem(STORE_KEY)));
    } catch (_error) {
      return normalizeSettings(null);
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(settings));
    } catch (_error) {
      // Private browsing or blocked storage: keep the setting for this page only.
    }
  }

  function normalizeSettings(value) {
    return {
      cps: normalizeCps(value && value.cps),
      panelHidden: Boolean(value && value.panelHidden),
      panelSide: value && value.panelSide === "left" ? "left" : DEFAULTS.panelSide,
      hotkey: normalizeHotkey(value && value.hotkey)
    };
  }

  function normalizeCps(value) {
    if (value === null || value === undefined || value === "") return DEFAULTS.cps;
    const number = Number(value);
    if (!Number.isFinite(number)) return DEFAULTS.cps;
    return Math.min(100, Math.max(1, Math.round(number)));
  }

  function normalizeHotkey(value) {
    if (!value || typeof value !== "object") return DEFAULTS.hotkey;
    const key = typeof value.key === "string" && value.key ? value.key : DEFAULTS.hotkey.key;
    const next = {
      key: key,
      code: typeof value.code === "string" ? value.code : "",
      altKey: Boolean(value.altKey),
      ctrlKey: Boolean(value.ctrlKey),
      metaKey: Boolean(value.metaKey),
      shiftKey: Boolean(value.shiftKey),
      label: ""
    };
    next.label = formatHotkey(next);
    return next;
  }

  function matchesHotkey(event, hotkey) {
    return event.altKey === hotkey.altKey
      && event.ctrlKey === hotkey.ctrlKey
      && event.metaKey === hotkey.metaKey
      && event.shiftKey === hotkey.shiftKey
      && (event.code === hotkey.code || String(event.key || "").toLowerCase() === String(hotkey.key || "").toLowerCase());
  }

  function isSafeHotkey(value) {
    const hasModifier = value.altKey || value.ctrlKey || value.metaKey || value.shiftKey;
    const isSingleTextKey = value.key.length === 1 && /^[a-z0-9]$/i.test(value.key);
    return hasModifier || !isSingleTextKey;
  }

  function formatHotkey(value) {
    const parts = [];
    if (value.ctrlKey) parts.push("Control");
    if (value.altKey) parts.push("Option");
    if (value.metaKey) parts.push("Command");
    if (value.shiftKey) parts.push("Shift");
    parts.push(formatKeyName(value.key || value.code));
    return parts.join("+");
  }

  function formatKeyName(key) {
    if (!key) return "Key";
    if (key === " ") return "Space";
    if (key.length === 1) return key.toUpperCase();
    return key.replace(/^Arrow/, "");
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function clickCookieClicker(target, point) {
    let cookie = target.id === "bigCookie"
      ? target
      : target.closest && target.closest("#bigCookie");
    if (!cookie) {
      const candidate = document.getElementById("bigCookie");
      if (candidate) {
        const rect = candidate.getBoundingClientRect();
        const inside = point.x >= rect.left
          && point.x <= rect.right
          && point.y >= rect.top
          && point.y <= rect.bottom;
        if (inside) cookie = candidate;
      }
    }
    if (!cookie || !window.Game || typeof window.Game.ClickCookie !== "function") {
      return false;
    }

    try {
      window.Game.ClickCookie({
        target: cookie,
        currentTarget: cookie,
        clientX: point.x,
        clientY: point.y,
        pageX: point.x + window.scrollX,
        pageY: point.y + window.scrollY,
        preventDefault: function () {},
        stopPropagation: function () {}
      });
      return true;
    } catch (_error) {
      return false;
    }
  }
})();
