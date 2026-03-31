function textOf(node) {
  if (!node) {
    return "";
  }
  return (node.textContent || "").trim();
}

function detectSongCards() {
  const cards = Array.from(document.querySelectorAll("article, [data-song-id], [data-testid*='song']"));
  const songs = [];
  const seen = new Set();

  cards.forEach((card, index) => {
    const id = card.getAttribute("data-song-id") || card.getAttribute("data-id") || `card-${index}`;
    const audioNode = card.querySelector("audio[src], source[src], a[href*='.mp3']");
    const audioUrl = audioNode?.src || audioNode?.getAttribute("src") || audioNode?.href || "";
    if (!audioUrl) {
      return;
    }

    const titleNode =
      card.querySelector("h1, h2, h3, [data-testid*='title'], [class*='title']") ||
      card.querySelector("a[href*='/song/']");
    const title = textOf(titleNode) || `suno-track-${index + 1}`;
    const key = `${id}::${audioUrl}`;

    if (seen.has(key)) {
      return;
    }
    seen.add(key);

    songs.push({
      id,
      title,
      url: audioUrl
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
