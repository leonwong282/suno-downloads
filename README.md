# Suno Batch Downloader (Milestone B)

目前版本已進入 Milestone B：
- 在 `suno.com` 頁面抓取可見歌曲（需頁面存在可讀取 audio/mp3 URL）
- 支援全選/反選後批量下載
- 下載佇列支援並發、重試、節流設定
- 使用 `chrome.storage.local` 記錄 `downloadedSongIds`，避免重複下載

## 本地安裝

1. 打開 Chrome `chrome://extensions/`
2. 開啟「開發人員模式」
3. 點擊「載入未封裝項目」
4. 選擇本專案目錄

## 使用流程

1. 打開 `suno.com` 的歌曲列表頁。
2. 點擴充 popup 的「刷新歌曲」。
3. 使用「全選 / 反選」調整勾選項。
4. 可配置：
   - 並發（concurrency）
   - 重試次數（maxRetries）
   - 節流毫秒（throttleMs）
5. 點「開始批量下載」。
6. 在 popup 觀察隊列統計（queued/success/failed/skipped/active/pending）。

## 文件

- `manifest.json`: MV3 權限與入口
- `content-script.js`: Suno 頁面歌曲擷取
- `background.js`: 下載佇列、重試、去重與 storage 持久化
- `popup.html` / `popup.js`: 批量選擇與任務啟動 UI

## 已知限制

- 目前仍依賴頁面 DOM 與可見 URL，若 Suno 前端變動需調整選擇器。
- 尚未實作「暫停/續跑」按鈕（下一階段可補）。
