function textOf(node) {
  if (!node) {
    return "";
  }
  return (node.textContent || "").trim();
}

function songIdFromHref(href) {
  if (!href) {
    return "";
  }

  const match = href.match(/\/song\/([a-zA-Z0-9-]+)/);
  return match ? match[1] : "";
}

function fallbackAudioUrl(songId) {
  if (!songId) {
    return "";
  }
  return `https://cdn1.suno.ai/${songId}.mp3`;
}

function detectSongCards() {
  const cards = Array.from(document.querySelectorAll("article, [data-song-id], [data-testid*='song'], [class*='track']"));
  const songs = [];
  const seen = new Set();

  cards.forEach((card, index) => {
    const songAnchor = card.querySelector("a[href*='/song/']");
    const hrefSongId = songIdFromHref(songAnchor?.getAttribute("href") || "");
    const attrSongId = card.getAttribute("data-song-id") || card.getAttribute("data-id") || "";
    const id = attrSongId || hrefSongId || `card-${index}`;

    const audioNode = card.querySelector("audio[src], source[src], a[href*='.mp3']");
    const explicitAudioUrl = audioNode?.src || audioNode?.getAttribute("src") || audioNode?.href || "";

    const titleNode =
      card.querySelector("h1, h2, h3, [data-testid*='title'], [class*='title']") ||
      songAnchor;
    const title = textOf(titleNode) || `suno-track-${index + 1}`;

    const url = explicitAudioUrl || fallbackAudioUrl(hrefSongId || attrSongId);
    const key = `${id}::${title}`;

    if (seen.has(key)) {
      return;
    }
    seen.add(key);

    songs.push({
      id,
      title,
      url
    });
  });

  if (songs.length > 0) {
    return songs;
  }

  const anchors = Array.from(document.querySelectorAll("a[href*='/song/']"));
  anchors.forEach((anchor, idx) => {
    const id = songIdFromHref(anchor.getAttribute("href") || "");
    if (!id || seen.has(id)) {
      return;
    }
    seen.add(id);

    songs.push({
      id,
      title: textOf(anchor) || `suno-track-${idx + 1}`,
      url: fallbackAudioUrl(id)
    });
  });

  return songs;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    sendResponse({ ok: false, error: "invalid_message" });
    return false;
  }

  if (message.type === "GET_SONGS") {
    const songs = detectSongCards();
    sendResponse({ ok: true, songs });
    return false;
  }

  sendResponse({ ok: false, error: "unknown_message_type" });
  return false;
});
