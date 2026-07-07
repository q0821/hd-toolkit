# AI（Illustrator）轉 SVG 工具 — 設計文件

- 日期：2026-07-07
- 工具代號：`ai2svg`
- 顯示名稱：「AI 轉 SVG」（副標註明「Adobe Illustrator / PDF 逐頁拆成 SVG」，避免與人工智慧混淆）

## 目標

把一個內含多個圖形的 Adobe Illustrator `.ai` 檔（或 `.pdf`），逐 artboard（頁）拆成**個別獨立的向量 SVG**，讓使用者在瀏覽器裡預覽、挑選要哪幾頁、逐頁命名，再單檔或打包下載。

實測前提：現代 `.ai` 為 PDF 相容格式，一個 artboard = 一頁，`poppler` 的 `pdftocairo -svg` 可逐頁精準輸出純向量 SVG（無點陣、無字型依賴）。伺服器已因 pdf2jpg 而具備 poppler。

## 非目標 / Non-scope（YAGNI，明確不做）

- 不做圖形內容自動辨識 / 自動命名（工具無法得知「這頁是印章還是標準字」，預設檔名用序號，命名交給使用者）。
- 不做單一 artboard 內「多圖形」的空間拆分（那需要 group/位置啟發式，屬另一個 class 的問題）。
- 不做 SVG 最佳化 / 壓縮 / 顏色調整（保持原樣輸出，忠實還原）。
- 不做帳號、歷史紀錄、雲端儲存。
- 不改既有 pdf2jpg / 不重構無關模組；不動 DESIGN.md。
- 不新增帳號 / rate limit 基礎設施（全站現況無 auth，維持一致；以檔案大小 / 頁數上限作濫用界限）。
- 不 deploy、不 push main（實作完成後由使用者決定收尾）。

橫向 concern 的完整 checklist 見 `2026-07-07-ai2svg-preflight.md`。

## 架構

沿用 pdf2jpg 的後端骨架，但**回傳 JSON 而非 ZIP**。因為 SVG 是文字，且「預覽圖」與「下載檔」是同一份東西，讓同一份 SVG 一物二用：零重複運算、零二次往返。打包（多檔 ZIP）移到前端，讓後端保持無狀態。

```
[上傳 .ai / .pdf]
      │
      ▼
POST /api/ai2svg/convert   (multipart: file)
  1. 驗證副檔名 (.ai/.pdf) + 檔案大小上限 + magic bytes(%PDF)
  2. 寫入暫存檔（NamedTemporaryFile）
  3. pdfinfo 取頁數
  4. 逐頁 subprocess: pdftocairo -svg -f N -l N tmp.pdf out.svg（固定參數陣列，不經 shell）
  5. 回傳 JSON，暫存檔即刪
      │
      ▼
回傳 { "filename": "原檔名", "page_count": N, "pages": [ { "index": 1, "svg": "<svg…>" }, … ] }
      │
      ▼
前端 static/ai2svg/index.html
  - 每頁用 SVG 字串當預覽（向量、清晰；以 Blob URL 或直接內嵌）
  - 每頁：核取方塊（預設全選）+ 檔名輸入框（預設「原檔名-01」…）
  - 下載：單頁 → 直接存該頁 SVG
           多頁 → 前端 JSZip 即時打包成 ZIP
```

## 後端合約

### `POST /api/ai2svg/convert`

- 請求：`multipart/form-data`，欄位 `file`（`.ai` 或 `.pdf`）。
- 成功：`200`，`application/json`
  ```json
  {
    "filename": "深河出版社-Logo識別",
    "page_count": 11,
    "pages": [ { "index": 1, "svg": "<?xml …><svg …>…</svg>" }, ... ]
  }
  ```
- 錯誤（沿用 pdf2jpg 的 HTTPException 風格）：
  - `400` 未提供檔名 / 副檔名非 .ai|.pdf / 檔案為空 / 非 PDF 相容（magic bytes 不符）/ 超過大小上限 / 無法讀取頁數（損壞）
  - `500` `pdftocairo` 執行失敗

### 實作要點

- **poppler 呼叫**：pdf2jpg 用的 `pdf2image` 只包 `pdftoppm`（點陣），本工具需要 `pdftocairo -svg`，故直接 `subprocess.run([...], check=True, timeout=30)`，參數以**陣列**傳遞（絕不 `shell=True`、絕不字串拼接檔名），杜絕命令注入。
- **subprocess timeout**：每次 `pdftocairo` / `pdfinfo` 設 `timeout`（初版 30s），逾時殺掉回 500，防惡意檔讓程序 hang。
- **poppler 缺失**：捕捉 `FileNotFoundError`（環境無 `pdftocairo`/`pdfinfo`）回明確 500 訊息，不外洩 traceback。returncode 非零時回 500 帶簡短 stderr 摘要（不整包外洩內部路徑）。
- **暫存檔**：`tempfile` 產生隨機路徑（不用使用者提供的檔名當路徑）寫入上傳位元組，`pdftocairo` 逐頁輸出到暫存目錄，讀回 SVG 字串後 `finally` 清除整個暫存目錄（即使中途拋例外）。
- **大小上限**：常數（初版 20MB），讀檔後即檢查，超過回 `400`。
- **頁數上限**：`pdfinfo` 取頁數後檢查（初版 200 頁），超過回 `400`，防惡意超多頁 PDF 把逐頁轉檔炸成記憶體 / 時間爆量。
- **`.ai` 副檔名**：`pdftocairo` 靠內容判讀不靠副檔名，但仍需先驗證 magic bytes 開頭為 `%PDF`（.ai 的 PDF 相容檔皆是），非相容的舊版 .ai 明確回 400 並提示「此 .ai 非 PDF 相容格式，無法處理」。

## 前端 UX

- 版面套 `static/shared/app.css`（Quiet Utility）、`theme.js`（亮暗雙模式）、`settings.js`；圖示一律 inline SVG 線條圖，**無 Emoji**。
- 拖放 / 點選上傳區（參考 pdf2jpg、invoice-stamp 既有慣例）。
- 上傳後顯示轉檔中狀態 → 收到 JSON → 網格呈現每頁 SVG 預覽卡片。
- 每張卡片：SVG 預覽縮圖、核取方塊（預設勾選）、檔名輸入框（預設 `原檔名-序號`，`.svg` 副檔名固定不可改）。
- **SVG 預覽用 `<img src="blob:…">`（SVG 當圖片載入）呈現，不用 `innerHTML` 內嵌**。瀏覽器以 image context 載入 SVG 不會執行其中的 `<script>`/事件，杜絕惡意 SVG 的 self-XSS。
- 動作列：全選 / 全不選、「下載選取（ZIP）」、單卡片可個別「下載此頁」。
- 邊界提示：非 PDF 相容 .ai 的錯誤訊息、單頁時直接下載不打包。

## 檔名策略

- 預設：`<原檔名>-<兩位序號>.svg`，例如 `深河出版社-Logo識別-01.svg`。
- 使用者可逐頁改名；空白時 fallback 回預設；前端過濾檔名非法字元（`/ \ : * ? " < > |`）。
- 中文檔名：單檔下載用 `download` 屬性；ZIP 內檔名 UTF-8，JSZip 原生支援。

## 測試計畫

- 後端（pytest，fixture = 真實 11 頁 `深河出版社-Logo識別.ai`）：
  - 回傳 `page_count == 11`，每頁 `svg` 含 `<svg`、不含 `<image`（純向量）、不含 `font-family`。
  - `.pdf` 檔亦可轉。
  - 空檔 / 超大檔 / 非 PDF 內容 → 對應 4xx。
  - 驗證 subprocess 以陣列參數呼叫（不經 shell）。
- 前端手動驗證：上傳 → 預覽 11 頁 → 改名 → 下載 ZIP → 解壓確認檔名與內容；亮暗兩模式；單頁下載。

## 影響檔案

- 新增 `app/tools/ai2svg.py`（router）
- 新增 `static/ai2svg/index.html`（前端頁面）
- 改 `main.py`：`include_router(ai2svg.router)` + `GET /ai2svg` page route
- 改 `static/index.html`：首頁選單新增入口卡片
- 新增 `tests/test_ai2svg.py`（若專案已有測試慣例則沿用）
- 前端 JSZip：**沿用專案慣例從 cdnjs 引入**（`https://cdnjs.cloudflare.com/ajax/libs/jszip/<pin版本>/jszip.min.js` + `crossorigin="anonymous" referrerpolicy="no-referrer"`），與 invoice-stamp 的 pdf.js 3.11.174 / pdf-lib 1.17.1 引入方式一致。只在多檔打包時使用，單頁下載直接用 Blob 不需 JSZip。

## 待實作時確認的細節

- 專案是否已有 pytest 測試目錄與 CI 慣例（pdf2jpg 是否有對應測試可參照）。
- 首頁選單卡片的既有 HTML 結構與圖示慣例（照抄 `static/index.html` 現有卡片）。
