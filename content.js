const DEFAULT_CPS = 30;
const MIN_CPS = 1;
const MAX_CPS = 100;
const CLICKER_BADGE_ID = "aki-30cps-clicker-badge";
const TOGGLE_DEBOUNCE_MS = 350;
const DEFAULT_HOTKEY = {
  key: "c",
  code: "KeyC",
  altKey: true,
  ctrlKey: false,
  metaKey: false,
  shiftKey: true,
  label: "Option+Shift+C"
};

let active = false;
let cps = DEFAULT_CPS;
let hotkey = DEFAULT_HOTKEY;
let badgeVisible = true;
let badgeSide = "right";
let timerId = null;
let nextClickAt = 0;
let pointer = {
  x: Math.max(1, Math.round(window.innerWidth / 2)),
  y: Math.max(1, Math.round(window.innerHeight / 2))
};
let clickCountThisSecond = 0;
let measuredCps = 0;
let measureTimerId = null;
let lastToggleAt = 0;

init();

function init() {
  chrome.storage.sync.get({
    cps: DEFAULT_CPS,
    hotkey: DEFAULT_HOTKEY,
    badgeVisible: true,
    badgeSide: "right"
  }, (settings) => {
    cps = normalizeCps(settings.cps);
    hotkey = normalizeHotkey(settings.hotkey);
    badgeVisible = settings.badgeVisible !== false;
    badgeSide = settings.badgeSide === "left" ? "left" : "right";
    renderBadge();
  });

  window.addEventListener("keydown", handleKeydown, true);
  window.addEventListener("pointermove", updatePointer, true);
  window.addEventListener("mousemove", updatePointer, true);
  window.addEventListener("pointerdown", updatePointer, true);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopClicker();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message?.type) return false;

    if (message.type === "TOGGLE_CLICKER") {
      toggleClicker();
      sendResponse(buildStatus());
      return true;
    }

    if (message.type === "START_CLICKER") {
      startClicker();
      sendResponse(buildStatus());
      return true;
    }

    if (message.type === "STOP_CLICKER") {
      stopClicker();
      sendResponse(buildStatus());
      return true;
    }

    if (message.type === "SET_CPS") {
      cps = normalizeCps(message.cps);
      chrome.storage.sync.set({ cps });
      if (active) restartClickLoop();
      renderBadge();
      sendResponse(buildStatus());
      return true;
    }

    if (message.type === "SET_HOTKEY") {
      hotkey = normalizeHotkey(message.hotkey);
      chrome.storage.sync.set({ hotkey });
      renderBadge();
      sendResponse(buildStatus());
      return true;
    }

    if (message.type === "SET_BADGE_VISIBLE") {
      badgeVisible = message.visible !== false;
      chrome.storage.sync.set({ badgeVisible });
      renderBadge();
      sendResponse(buildStatus());
      return true;
    }

    if (message.type === "SET_BADGE_SIDE") {
      badgeSide = message.side === "left" ? "left" : "right";
      chrome.storage.sync.set({ badgeSide });
      renderBadge();
      sendResponse(buildStatus());
      return true;
    }

    if (message.type === "GET_STATUS") {
      sendResponse(buildStatus());
      return true;
    }

    return false;
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") return;
    if (changes.cps) {
      cps = normalizeCps(changes.cps.newValue);
      if (active) restartClickLoop();
    }
    if (changes.hotkey) {
      hotkey = normalizeHotkey(changes.hotkey.newValue);
    }
    if (changes.badgeVisible) {
      badgeVisible = changes.badgeVisible.newValue !== false;
    }
    if (changes.badgeSide) {
      badgeSide = changes.badgeSide.newValue === "left" ? "left" : "right";
    }
    renderBadge();
  });
}

function handleKeydown(event) {
  if (event.key === "Escape") {
    if (active) {
      event.preventDefault();
      event.stopPropagation();
      stopClicker();
    }
    return;
  }
  if (event.repeat || !matchesHotkey(event, hotkey)) return;

  event.preventDefault();
  event.stopPropagation();
  toggleClicker();
}

function updatePointer(event) {
  pointer = {
    x: clamp(Math.round(event.clientX), 0, Math.max(0, window.innerWidth - 1)),
    y: clamp(Math.round(event.clientY), 0, Math.max(0, window.innerHeight - 1))
  };
}

function startClicker() {
  if (active) return;
  active = true;
  nextClickAt = performance.now();
  clickCountThisSecond = 0;
  measuredCps = 0;
  renderBadge();
  notifyStateChanged();
  startMeasureLoop();
  runClickLoop();
}

function stopClicker() {
  if (!active) return;
  active = false;
  clearTimeout(timerId);
  clearInterval(measureTimerId);
  timerId = null;
  nextClickAt = 0;
  measureTimerId = null;
  clickCountThisSecond = 0;
  measuredCps = 0;
  renderBadge();
  notifyStateChanged();
}

function toggleClicker() {
  const now = performance.now();
  if (now - lastToggleAt < TOGGLE_DEBOUNCE_MS) return;
  lastToggleAt = now;
  active ? stopClicker() : startClicker();
}

function restartClickLoop() {
  if (!active) return;
  clearTimeout(timerId);
  timerId = null;
  nextClickAt = performance.now();
  runClickLoop();
}

function runClickLoop() {
  if (!active) return;

  const now = performance.now();
  const interval = 1000 / cps;
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
  if (!target || target.closest?.(`#${CLICKER_BADGE_ID}`)) return;

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
    target.dispatchEvent(new PointerEvent("pointerdown", {
      ...eventOptions,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true
    }));
  }
  target.dispatchEvent(new MouseEvent("mousedown", eventOptions));
  target.dispatchEvent(new MouseEvent("mouseup", { ...eventOptions, buttons: 0 }));
  if (typeof PointerEvent === "function") {
    target.dispatchEvent(new PointerEvent("pointerup", {
      ...eventOptions,
      buttons: 0,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true
    }));
  }
  target.dispatchEvent(new MouseEvent("click", { ...eventOptions, buttons: 0 }));
  clickCountThisSecond += 1;
}

function startMeasureLoop() {
  clearInterval(measureTimerId);
  measureTimerId = window.setInterval(() => {
    measuredCps = clickCountThisSecond;
    clickCountThisSecond = 0;
    renderBadge();
  }, 1000);
}

function renderBadge() {
  if (!badgeVisible) {
    const badge = document.getElementById(CLICKER_BADGE_ID);
    if (badge) badge.hidden = true;
    return;
  }
  const badge = getOrCreateBadge();
  badge.hidden = false;
  badge.style.left = badgeSide === "left" ? "12px" : "auto";
  badge.style.right = badgeSide === "left" ? "auto" : "12px";
  badge.textContent = active ? "動作中" : "停止";
  badge.dataset.active = String(active);
}

function getOrCreateBadge() {
  let badge = document.getElementById(CLICKER_BADGE_ID);
  if (badge) return badge;

  badge = document.createElement("div");
  badge.id = CLICKER_BADGE_ID;
  badge.setAttribute("aria-live", "polite");
  Object.assign(badge.style, {
    position: "fixed",
    right: "12px",
    bottom: "12px",
    zIndex: "2147483647",
    padding: "7px 10px",
    borderRadius: "8px",
    color: "#1d1d1f",
    background: "#ffffff",
    border: "1px solid #d2d2d7",
    boxShadow: "0 8px 18px rgba(0, 0, 0, 0.18)",
    font: "600 12px/1.2 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    letterSpacing: "0",
    pointerEvents: "none",
    userSelect: "none"
  });

  const style = document.createElement("style");
  style.textContent = `
    #${CLICKER_BADGE_ID}[data-active="true"] {
      color: #ffffff !important;
      background: #1d1d1f !important;
      border-color: #1d1d1f !important;
    }
  `;
  document.documentElement.append(style, badge);
  return badge;
}

function buildStatus() {
  return {
    ok: true,
    active,
    cps,
    measuredCps,
    hotkey,
    badgeVisible,
    badgeSide,
    pointer
  };
}

function notifyStateChanged() {
  chrome.runtime.sendMessage({ type: "CLICKER_STATE_CHANGED", active }, () => {
    chrome.runtime.lastError;
  });
}

function normalizeCps(value) {
  if (value === null || value === undefined || value === "") return DEFAULT_CPS;
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_CPS;
  return Math.min(MAX_CPS, Math.max(MIN_CPS, Math.round(number)));
}

function normalizeHotkey(value) {
  if (!value || typeof value !== "object") return DEFAULT_HOTKEY;
  const key = typeof value.key === "string" && value.key ? value.key : DEFAULT_HOTKEY.key;
  const code = typeof value.code === "string" ? value.code : "";
  const next = {
    key,
    code,
    altKey: Boolean(value.altKey),
    ctrlKey: Boolean(value.ctrlKey),
    metaKey: Boolean(value.metaKey),
    shiftKey: Boolean(value.shiftKey),
    label: typeof value.label === "string" && value.label ? value.label : ""
  };
  next.label = next.label || formatHotkey(next);
  return next;
}

function getClickPoint() {
  return {
    x: clamp(Math.round(pointer.x), 0, Math.max(0, window.innerWidth - 1)),
    y: clamp(Math.round(pointer.y), 0, Math.max(0, window.innerHeight - 1))
  };
}

function matchesHotkey(event, shortcut) {
  const normalized = normalizeHotkey(shortcut);
  const sameModifiers = event.altKey === normalized.altKey
    && event.ctrlKey === normalized.ctrlKey
    && event.metaKey === normalized.metaKey
    && event.shiftKey === normalized.shiftKey;
  if (!sameModifiers) return false;

  const eventKey = String(event.key || "").toLowerCase();
  const hotkeyKey = String(normalized.key || "").toLowerCase();
  return event.code === normalized.code || eventKey === hotkeyKey;
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
  if (key.length === 1) return key.toUpperCase();
  return key.replace(/^Arrow/, "");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clickCookieClicker(target, point) {
  let cookie = target.id === "bigCookie"
    ? target
    : target.closest?.("#bigCookie");
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
