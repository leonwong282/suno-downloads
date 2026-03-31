const DEFAULT_FILENAME = "suno-track.mp3";
const DEFAULT_SETTINGS = {
  concurrency: 2,
  maxRetries: 2,
  throttleMs: 300
};

const STORAGE_KEYS = {
  downloadedSongIds: "downloadedSongIds",
  settings: "settings"
};

const state = {
  queue: [],
  activeCount: 0,
  stats: {
    queued: 0,
    success: 0,
    failed: 0,
    skipped: 0
  },
  settings: { ...DEFAULT_SETTINGS },
  downloadedSongIds: new Set()
};

function sanitizeFilename(value) {
  return value
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFilename(payload) {
  const rawTitle = payload?.title || DEFAULT_FILENAME;
  const title = sanitizeFilename(rawTitle);
  const id = payload?.id ? sanitizeFilename(String(payload.id)) : "unknown";
  return `${title}_${id}.mp3`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getQueueStatus() {
  return {
    queued: state.stats.queued,
    success: state.stats.success,
    failed: state.stats.failed,
    skipped: state.stats.skipped,
    active: state.activeCount,
    pending: state.queue.length,
    settings: state.settings
  };
}

async function loadState() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.downloadedSongIds, STORAGE_KEYS.settings]);

  const downloaded = data[STORAGE_KEYS.downloadedSongIds] || [];
  state.downloadedSongIds = new Set(downloaded);

  const settings = data[STORAGE_KEYS.settings] || {};
  state.settings = {
    ...DEFAULT_SETTINGS,
    ...settings
  };
}

async function persistDownloadedIds() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.downloadedSongIds]: Array.from(state.downloadedSongIds)
  });
}

async function persistSettings() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: state.settings
  });
}

function resetStatsForNewTask(totalQueued) {
  state.stats = {
    queued: totalQueued,
    success: 0,
    failed: 0,
    skipped: 0
  };
}

function startDownload(song) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url: song.url,
        filename: buildFilename(song),
        saveAs: false,
        conflictAction: "uniquify"
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(downloadId);
      }
    );
  });
}

function enqueueSongs(songs) {
  const queueItems = [];

  songs.forEach((song) => {
    const songId = String(song.id || "");
    if (!song.url || !songId) {
      state.stats.skipped += 1;
      return;
    }

    if (state.downloadedSongIds.has(songId)) {
      state.stats.skipped += 1;
      return;
    }

    queueItems.push({
      song: {
        id: songId,
        title: song.title || DEFAULT_FILENAME,
        url: song.url
      },
      attempts: 0
    });
  });

  state.queue.push(...queueItems);
  state.stats.queued += queueItems.length;
}

async function runQueue() {
  while (state.activeCount < state.settings.concurrency && state.queue.length > 0) {
    const item = state.queue.shift();
    state.activeCount += 1;

    (async () => {
      try {
        await startDownload(item.song);
        state.stats.success += 1;
        state.downloadedSongIds.add(item.song.id);
        await persistDownloadedIds();
      } catch (_error) {
        item.attempts += 1;
        if (item.attempts <= state.settings.maxRetries) {
          state.queue.push(item);
        } else {
          state.stats.failed += 1;
        }
      } finally {
        state.activeCount -= 1;
        await sleep(state.settings.throttleMs);
        runQueue();
      }
    })();
  }
}

chrome.runtime.onInstalled.addListener(() => {
  loadState();
});

chrome.runtime.onStartup.addListener(() => {
  loadState();
});

loadState();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    sendResponse({ ok: false, error: "invalid_message" });
    return false;
  }

  if (message.type === "PING") {
    sendResponse({ ok: true, service: "background" });
    return false;
  }

  if (message.type === "DOWNLOAD_ONE") {
    const { url, title, id } = message.payload || {};
    if (!url) {
      sendResponse({ ok: false, error: "missing_url" });
      return false;
    }

    chrome.downloads.download(
      {
        url,
        filename: buildFilename({ title, id }),
        saveAs: false,
        conflictAction: "uniquify"
      },
      async (downloadId) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }

        if (id) {
          state.downloadedSongIds.add(String(id));
          await persistDownloadedIds();
        }
        sendResponse({ ok: true, downloadId });
      }
    );
    return true;
  }

  if (message.type === "ENQUEUE_DOWNLOADS") {
    const songs = message.payload?.songs || [];
    const settings = message.payload?.settings || {};

    state.settings = {
      concurrency: Number(settings.concurrency) || state.settings.concurrency,
      maxRetries: Number(settings.maxRetries) || state.settings.maxRetries,
      throttleMs: Number(settings.throttleMs) || state.settings.throttleMs
    };

    persistSettings();
    resetStatsForNewTask(0);
    enqueueSongs(songs);
    runQueue();

    sendResponse({ ok: true, status: getQueueStatus() });
    return false;
  }

  if (message.type === "GET_QUEUE_STATUS") {
    sendResponse({ ok: true, status: getQueueStatus() });
    return false;
  }

  if (message.type === "GET_DOWNLOADED_IDS") {
    sendResponse({ ok: true, downloadedSongIds: Array.from(state.downloadedSongIds) });
    return false;
  }

  sendResponse({ ok: false, error: "unknown_message_type" });
  return false;
});
