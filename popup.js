const DEFAULT_CPS = 30;
const MIN_CPS = 1;
const MAX_CPS = 100;
const DEFAULT_HOTKEY = {
  key: "c",
  code: "KeyC",
  altKey: true,
  ctrlKey: false,
  metaKey: false,
  shiftKey: true,
  label: "Option+Shift+C"
};

const toggleButton = document.getElementById("toggleButton");
const cpsInput = document.getElementById("cpsInput");
const cpsRange = document.getElementById("cpsRange");
const statusText = document.getElementById("statusText");
const statePill = document.getElementById("statePill");
const pageNote = document.getElementById("pageNote");
const hotkeyText = document.getElementById("hotkeyText");
const hotkeyNote = document.getElementById("hotkeyNote");
const recordHotkeyButton = document.getElementById("recordHotkeyButton");
const badgeVisibleInput = document.getElementById("badgeVisibleInput");
const presetButtons = document.querySelectorAll("[data-cps]");
const badgeLeftButton = document.getElementById("badgeLeftButton");
const badgeRightButton = document.getElementById("badgeRightButton");

let activeTabId = null;
let pageAvailable = false;
let recordingHotkey = false;
let currentHotkey = DEFAULT_HOTKEY;

document.addEventListener("DOMContentLoaded", init);
document.addEventListener("keydown", captureHotkey, true);
toggleButton.addEventListener("click", toggleClicker);
cpsInput.addEventListener("change", () => setCps(cpsInput.value));
cpsRange.addEventListener("input", () => setCps(cpsRange.value));
recordHotkeyButton.addEventListener("click", startHotkeyRecording);
badgeVisibleInput.addEventListener("change", () => setBadgeVisible(badgeVisibleInput.checked));
presetButtons.forEach((button) => {
  button.addEventListener("click", () => setCps(button.dataset.cps));
});
badgeLeftButton.addEventListener("click", () => setBadgeSide("left"));
badgeRightButton.addEventListener("click", () => setBadgeSide("right"));

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id ?? null;

  const settings = await chrome.storage.sync.get({
    cps: DEFAULT_CPS,
    hotkey: DEFAULT_HOTKEY,
    badgeVisible: true,
    badgeSide: "right"
  });
  setCpsControls(normalizeCps(settings.cps));
  setHotkeyControls(normalizeHotkey(settings.hotkey));
  badgeVisibleInput.checked = settings.badgeVisible !== false;

  const status = await sendToPage({ type: "GET_STATUS" });
  if (status?.ok) {
    pageAvailable = true;
    renderStatus(status);
  } else {
    pageAvailable = false;
    renderUnavailable(tab?.url);
  }
}

async function toggleClicker() {
  const status = await sendToPage({ type: "TOGGLE_CLICKER" });
  if (status?.ok) {
    renderStatus(status);
  } else {
    renderUnavailable();
  }
}

async function setCps(value) {
  const cps = normalizeCps(value);
  setCpsControls(cps);
  await chrome.storage.sync.set({ cps });

  if (!pageAvailable) return;

  const status = await sendToPage({ type: "SET_CPS", cps });
  if (status?.ok) {
    renderStatus(status);
  }
}

async function setBadgeVisible(visible) {
  await chrome.storage.sync.set({ badgeVisible: Boolean(visible) });

  if (!pageAvailable) return;

  const status = await sendToPage({ type: "SET_BADGE_VISIBLE", visible: Boolean(visible) });
  if (status?.ok) {
    renderStatus(status);
  }
}

async function setBadgeSide(side) {
  const normalized = side === "left" ? "left" : "right";
  await chrome.storage.sync.set({ badgeSide: normalized });
  if (!pageAvailable) return;
  const status = await sendToPage({ type: "SET_BADGE_SIDE", side: normalized });
  if (status?.ok) renderStatus(status);
}

function startHotkeyRecording() {
  recordingHotkey = true;
  recordHotkeyButton.textContent = "入力中";
  hotkeyNote.hidden = false;
  hotkeyNote.textContent = "キー入力";
}

async function captureHotkey(event) {
  if (!recordingHotkey) return;

  event.preventDefault();
  event.stopPropagation();

  if (event.key === "Escape") {
    recordingHotkey = false;
    recordHotkeyButton.textContent = "変更";
    hotkeyNote.hidden = true;
    return;
  }

  if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) {
    hotkeyNote.textContent = "文字キーも押す";
    return;
  }

  const hotkey = normalizeHotkey({
    key: event.key,
    code: event.code,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey
  });

  if (!isSafeHotkey(hotkey)) {
    hotkeyNote.textContent = "Option/Shiftも必要";
    return;
  }

  recordingHotkey = false;
  recordHotkeyButton.textContent = "変更";
  hotkeyNote.hidden = true;
  setHotkeyControls(hotkey);
  await chrome.storage.sync.set({ hotkey });

  if (!pageAvailable) return;

  const status = await sendToPage({ type: "SET_HOTKEY", hotkey });
  if (status?.ok) {
    renderStatus(status);
  }
}

async function sendToPage(message) {
  if (!activeTabId) return { ok: false, error: "No active tab" };

  try {
    return await chrome.tabs.sendMessage(activeTabId, message);
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function renderStatus(status) {
  const isActive = Boolean(status.active);
  pageAvailable = true;
  toggleButton.disabled = false;
  statePill.textContent = isActive ? "動作" : "停止";
  statePill.classList.toggle("is-active", isActive);
  statusText.textContent = isActive ? `${status.cps} CPS 動作中` : "停止中";
  pageNote.hidden = true;
  setCpsControls(status.cps);
  setHotkeyControls(status.hotkey || currentHotkey);
  badgeVisibleInput.checked = status.badgeVisible !== false;
}

function renderUnavailable(url = "") {
  toggleButton.disabled = true;
  statePill.textContent = "不可";
  statePill.classList.remove("is-active");
  statusText.textContent = "使用不可";
  pageNote.hidden = false;
  pageNote.textContent = url?.startsWith("chrome://") || url?.startsWith("edge://")
    ? "通常ページのみ"
    : "ページ再読み込み";
}

function setCpsControls(value) {
  const cps = normalizeCps(value);
  cpsInput.value = String(cps);
  cpsRange.value = String(cps);
}

function setHotkeyControls(value) {
  currentHotkey = normalizeHotkey(value);
  hotkeyText.textContent = currentHotkey.label;
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
  const next = {
    key,
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
