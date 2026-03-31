# Suno 批量下載 Chrome 擴充調研（2026-03-31）

## 1. 目標與結論（TL;DR）

你要做的產品**技術上可行**，推薦走「**Content Script 抓取當前頁可見曲目 + Background 下載佇列**」的 Manifest V3 架構。

不建議一開始就做逆向私有 API；優先使用 Suno 網頁端已呈現的可下載連結（或頁面內可獲得的音訊 URL），以降低維護與合規風險。

---

## 2. 官方規則與合規邊界

### 2.1 Chrome 擴充規範（必看）

- `chrome.downloads` 可用於程式化發起下載，但必須在 `manifest.json` 聲明 `"downloads"` 權限。
- Content Script 可直接存取部分 API，其他能力需透過 message 傳給 background/service worker。
- MV3 的 background 是 service worker，不能用遠端託管程式碼繞過上架審查。
- Chrome Web Store 對權限最小化、隱私披露與用途一致性要求很嚴格（Single purpose / Limited Use / Disclosure）。

### 2.2 Suno 條款與內容權利（高風險點）

- Suno ToS 明確提到不可對服務內容進行未授權的 copy/scrape 等行為。
- Suno 幫助中心（2026-01-07 更新）說明：
  - Pro / Premier 在訂閱期間創建的歌曲，通常由用戶擁有；
  - Basic（免費）歌曲由 Suno 持有，僅限非商業用途。

> 產品策略建議：
> - 僅提供「下載我自己的作品」路徑，UI 內加明確提示。
> - 初版不做任何繞過 UI 權限、批量抓他人作品的功能。

---

## 3. 可行技術方案對比

## 方案 A（推薦）：DOM / 事件驅動 + `chrome.downloads`

**思路**
1. 在 `suno.com` 相關頁面注入 content script。
2. 掃描歌單卡片（Library / Profile / Likes 等），抽取 song id、標題、可能的音訊 URL。
3. 點擊擴充 popup 的「批量下載」後，傳送任務到 background。
4. background 用 `chrome.downloads.download()` 逐個下載，實作節流、重試、命名規則。

**優點**
- 開發速度快、依賴少。
- 不需要管理 Cookie + 私有 API 認證流程。

**缺點**
- Suno 前端 DOM 改版時容易壞。

## 方案 B：觀察網路請求，封裝私有 API

**思路**
- 從頁面請求中抽象出列表/音訊地址 API，直接拉取 JSON 批量下載。

**優點**
- 若 API 穩定，功能更強。

**缺點**
- 高維護、高合規風險；API/簽名機制一變就失效。
- 若被視為未授權抓取，封禁風險更高。

**結論**
- MVP 選 A，必要時才逐步引入 B 的一小部分能力（且只對你本人可見歌曲）。

---

## 4. MVP 功能範圍（2 週版）

1. **頁面識別**：僅在 `https://suno.com/*` 啟用。
2. **曲目擷取**：讀取當前列表中的歌曲（id/名稱/作者/時長/可下載 URL）。
3. **批量下載**：
   - 全選 / 反選 / 按條件（日期、是否已下載）
   - 並發 2~3
   - 失敗重試 2 次
4. **命名模板**：`{date}_{title}_{id}.mp3`。
5. **下載狀態**：成功/失敗/跳過統計。
6. **本地記錄**：`chrome.storage.local` 存下載歷史，避免重複。

---

## 5. 建議技術架構（MV3）

- `manifest.json`
  - permissions: `downloads`, `storage`, `activeTab`, `scripting`
  - host_permissions: `https://suno.com/*`
  - background: service worker
  - action: popup
- `content-script.js`
  - 掃描可見歌曲資料
  - 監聽 SPA 路由變化（history pushState / mutation）重新收集
- `background.js`
  - 下載佇列管理（併發、重試、節流）
  - 下載事件監聽（`chrome.downloads.onChanged`）
- `popup.html/js`
  - 列表、選擇器、進度、錯誤提示
- `storage`
  - `downloadedSongIds`, `settings`, `lastRunSummary`

---

## 6. 風險清單與緩解

1. **DOM 改版風險**
   - 緩解：選擇器分層 + fallback；加「檢測失敗診斷」面板。
2. **音訊 URL 有效期短**
   - 緩解：下載前即時刷新列表，不長期快取 URL。
3. **權限過大導致上架被拒**
   - 緩解：只申請必要權限；在商店頁與 popup 清楚說明用途。
4. **合規/版權爭議**
   - 緩解：只支援用戶自己帳號可見且有權下載內容；提供用途聲明與免責提示。

---

## 7. 研發路線圖

### Phase 0（1~2 天）
- 做原型：抓到當前頁歌曲數據 + 單曲下載。

### Phase 1（3~5 天）
- 完成批量任務佇列、重試、檔名模板、進度 UI。

### Phase 2（2~4 天）
- 穩定性：SPA 路由切換、錯誤提示、重複下載去重。

### Phase 3（1~2 天）
- 打包上架材料：隱私政策、權限說明、商店文案。

---

## 8. 我對你的具體建議

1. 先做「**本地開發自用版**」，驗證 Suno 當前頁 DOM 是否能穩定提取。
2. 若你要公開上架，必做：
   - 隱私政策頁
   - 最小權限申請
   - 明確標註只處理使用者主動選取下載任務
3. 避免一開始就做「全站爬取」或「自動掃庫」，這會顯著提高風險。

---

## 9. 後續可立即執行

如果你願意，我下一步可以直接給你：
1. 一份可跑的 MV3 專案骨架（manifest + popup + background + content script）；
2. 一版可配置的下載佇列實作（並發/重試/命名模板）；
3. 一份上架前合規檢查清單（中英雙語）。
