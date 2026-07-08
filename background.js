const DEFAULT_SETTINGS = {
  cps: 30,
  badgeVisible: true,
  badgeSide: "right",
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

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  await chrome.storage.sync.set({
    cps: normalizeCps(current.cps),
    badgeVisible: current.badgeVisible !== false,
    badgeSide: current.badgeSide === "left" ? "left" : "right",
    hotkey: normalizeHotkey(current.hotkey)
  });
  await chrome.action.setBadgeText({ text: "停止" });
  await chrome.action.setBadgeBackgroundColor({ color: "#666666" });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "CLICKER_STATE_CHANGED") return false;

  updateBadge(Boolean(message.active))
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

async function sendToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { ok: false, error: "No active tab" };

  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function updateBadge(active) {
  await chrome.action.setBadgeText({ text: active ? "動作" : "停止" });
  await chrome.action.setBadgeBackgroundColor({
    color: active ? "#111111" : "#666666"
  });
}

function normalizeCps(value) {
  if (value === null || value === undefined || value === "") return DEFAULT_SETTINGS.cps;
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_SETTINGS.cps;
  return Math.min(100, Math.max(1, Math.round(number)));
}

function normalizeHotkey(value) {
  if (!value || typeof value !== "object") return DEFAULT_SETTINGS.hotkey;
  const key = typeof value.key === "string" && value.key ? value.key : DEFAULT_SETTINGS.hotkey.key;
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
