const statusNode = document.getElementById("status");
const queueStatusNode = document.getElementById("queueStatus");
const songsNode = document.getElementById("songs");

const refreshBtn = document.getElementById("refresh");
const selectAllBtn = document.getElementById("selectAll");
const invertBtn = document.getElementById("invert");
const startBatchBtn = document.getElementById("startBatch");
const downloadFirstBtn = document.getElementById("downloadFirst");

const concurrencyInput = document.getElementById("concurrency");
const maxRetriesInput = document.getElementById("maxRetries");
const throttleMsInput = document.getElementById("throttleMs");

let cachedSongs = [];
let downloadedSet = new Set();
let statusTimer = null;

function setStatus(text) {
  statusNode.textContent = text;
}

function escapeText(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return map[char];
  });
}

function renderSongs(songs) {
  songsNode.innerHTML = "";

  songs.forEach((song, idx) => {
    const li = document.createElement("li");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "song-check";
    checkbox.dataset.index = String(idx);
    checkbox.checked = !downloadedSet.has(String(song.id));

    const info = document.createElement("div");
    const safeTitle = escapeText(song.title || `suno-track-${idx + 1}`);
    const safeId = escapeText(song.id || "unknown");
    info.innerHTML = `<div class=\"title\">${safeTitle}</div><div class=\"meta\">ID: ${safeId}</div>`;

    const action = document.createElement("button");
    action.textContent = "下載";
    action.addEventListener("click", async () => {
      await downloadSong(song);
    });

    li.appendChild(checkbox);
    li.appendChild(info);
    li.appendChild(action);
    songsNode.appendChild(li);
  });

  downloadFirstBtn.disabled = songs.length === 0;
  startBatchBtn.disabled = songs.length === 0;
}

async function getActiveTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id;
}

async function loadDownloadedIds() {
  const response = await chrome.runtime.sendMessage({ type: "GET_DOWNLOADED_IDS" });
  downloadedSet = new Set(response?.downloadedSongIds || []);
}

async function ensureContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content-script.js"]
  });
}

async function loadSongs() {
  const tabId = await getActiveTabId();
  if (!tabId) {
    setStatus("找不到當前分頁");
    return;
  }

  await loadDownloadedIds();

  let response = null;
  try {
    response = await chrome.tabs.sendMessage(tabId, { type: "GET_SONGS" });
  } catch (_error) {
    try {
      await ensureContentScript(tabId);
      response = await chrome.tabs.sendMessage(tabId, { type: "GET_SONGS" });
    } catch (injectError) {
      setStatus(`抓取失敗：無法連接頁面腳本（${injectError?.message || "unknown"}）`);
      return;
    }
  }

  if (!response?.ok) {
    setStatus(`抓取失敗：${response?.error || "unknown"}`);
    return;
  }

  cachedSongs = response.songs || [];
  setStatus(`已抓取 ${cachedSongs.length} 首（已下載 ${downloadedSet.size} 首）`);
  renderSongs(cachedSongs);
}

function selectedSongs() {
  const checks = Array.from(document.querySelectorAll(".song-check"));
  return checks
    .filter((node) => node.checked)
    .map((node) => cachedSongs[Number(node.dataset.index)])
    .filter(Boolean);
}

function readSettings() {
  return {
    concurrency: Number(concurrencyInput.value) || 2,
    maxRetries: Number(maxRetriesInput.value) || 2,
    throttleMs: Number(throttleMsInput.value) || 300
  };
}

async function downloadSong(song) {
  setStatus(`下載中：${song.title}`);
  const response = await chrome.runtime.sendMessage({
    type: "DOWNLOAD_ONE",
    payload: song
  });

  if (!response?.ok) {
    setStatus(`下載失敗：${response?.error || "unknown"}`);
    return;
  }

  setStatus(`已建立下載任務 #${response.downloadId}`);
}

async function startBatchDownload() {
  const songs = selectedSongs();
  if (songs.length === 0) {
    setStatus("請先選擇至少一首歌曲");
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: "ENQUEUE_DOWNLOADS",
    payload: {
      songs,
      settings: readSettings()
    }
  });

  if (!response?.ok) {
    setStatus(`批量下載啟動失敗：${response?.error || "unknown"}`);
    return;
  }

  setStatus(`已送出 ${songs.length} 首到下載佇列`);
  await refreshQueueStatus();
}

async function refreshQueueStatus() {
  const response = await chrome.runtime.sendMessage({ type: "GET_QUEUE_STATUS" });
  if (!response?.ok) {
    queueStatusNode.textContent = "隊列狀態：讀取失敗";
    return;
  }

  const s = response.status;
  queueStatusNode.textContent = `隊列狀態：queued=${s.queued}, success=${s.success}, failed=${s.failed}, skipped=${s.skipped}, active=${s.active}, pending=${s.pending}`;
}

refreshBtn.addEventListener("click", loadSongs);

selectAllBtn.addEventListener("click", () => {
  document.querySelectorAll(".song-check").forEach((node) => {
    node.checked = true;
  });
});

invertBtn.addEventListener("click", () => {
  document.querySelectorAll(".song-check").forEach((node) => {
    node.checked = !node.checked;
  });
});

startBatchBtn.addEventListener("click", startBatchDownload);

downloadFirstBtn.addEventListener("click", async () => {
  if (cachedSongs.length === 0) {
    setStatus("沒有可下載歌曲，請先刷新");
    return;
  }
  await downloadSong(cachedSongs[0]);
});

async function init() {
  await loadSongs();
  await refreshQueueStatus();

  statusTimer = setInterval(refreshQueueStatus, 1000);
}

window.addEventListener("unload", () => {
  if (statusTimer) {
    clearInterval(statusTimer);
  }
});

init();
