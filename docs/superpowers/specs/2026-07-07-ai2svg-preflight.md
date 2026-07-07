# ai2svg — Preflight Checklist（feature-specific）

> 開工前 review 一輪，完工後同一份再 review 一輪。
> 對應 spec：`2026-07-07-ai2svg-design.md`

## Feature 屬性定位

| 屬性 | 適用 | 說明 |
|------|------|------|
| 新增 / 修改 DB schema | ✗ | 無資料庫 |
| 寫入使用者填的資料 | △ | 使用者上傳檔案（非個資），走「檔案處理」而非「個資」路徑 |
| 後台 admin 操作 | ✗ | |
| 前台用戶操作（endpoint） | ✓ | `POST /api/ai2svg/convert` 上傳檔案 → E 段 |
| 對外傳遞 mail/webhook | ✗ | |
| 跨 service 副作用 | ✗ | 只呼叫本機 `pdftocairo` |
| 時區 / 日期 | ✗ | |
| SSRF / URL fetch | ✗ | 不拉取任何 user-controlled URL |
| 第三方套件 | ✓ | 前端 JSZip（後端 poppler 已因 pdf2jpg 存在）→ J 段 |
| **執行外部命令（本 feature 核心）** | ✓ | `subprocess` 呼叫 `pdftocairo` → 命令注入 / 資源耗盡 |
| **回傳 user-supplied 內容到前端** | ✓ | SVG 原樣回傳並在瀏覽器呈現 → XSS |

## Non-scope（本 feature 明確不做）

- 不做圖形內容自動辨識 / 自動命名（預設檔名用序號，命名交使用者）。
- 不做單一 artboard 內多圖形的空間拆分。
- 不做 SVG 最佳化 / 壓縮 / 顏色調整（忠實原樣輸出）。
- 不改既有 pdf2jpg / 不重構無關模組。
- 不新增帳號 / rate limit 基礎設施（本站現況全站無 auth，維持一致）。
- 不動 DESIGN.md / 不改設計系統。
- 不 deploy、不 push main（實作完成後由使用者決定收尾）。

## X. 執行外部命令（subprocess → pdftocairo）★ 本 feature 最高風險

- [ ] `subprocess.run([...])` 用**參數陣列**傳遞，**絕不** `shell=True`、絕不字串拼接檔名（命令注入）。
- [ ] 輸入 / 輸出檔路徑用 `tempfile` 產生的隨機路徑，不用使用者提供的檔名當路徑。
- [ ] **subprocess 設 `timeout=`**（例如 30s），逾時殺掉並回 500，防 `pdftocairo` 對惡意檔 hang。〔spec 原本缺，preflight 補〕
- [ ] `pdftocairo` / `pdfinfo` 不存在（環境缺 poppler）時捕捉 `FileNotFoundError`，回明確 500 訊息，不讓 traceback 外洩。〔spec 原本缺，preflight 補〕
- [ ] `check=True` 或檢查 returncode，非零時回 500 並帶簡短 stderr 摘要（不整包 stderr 外洩內部路徑）。

## Y. 檔案上傳資源界限（防 DoS / OOM）

- [ ] 檔案大小上限（20MB），讀入後即檢查，超過回 400。
- [ ] **頁數上限**（例如 200 頁），`pdfinfo` 取頁數後檢查，超過回 400，防惡意超多頁 PDF 把逐頁轉檔炸成記憶體 / 時間爆量。〔spec 原本缺，preflight 補〕
- [ ] 副檔名（`.ai`/`.pdf`）+ magic bytes（開頭 `%PDF`）雙重驗證；非 PDF 相容明確回 400「此 .ai 非 PDF 相容格式」。
- [ ] 暫存檔 / 暫存目錄用 `tempfile`，`finally` 區塊確保清除（即使中途拋例外）。
- [ ] 空檔回 400。

## Z. 回傳 SVG 的 XSS（user-supplied 內容呈現）★

- [ ] 前端預覽 SVG 一律用 **`<img src="blob:…">`（SVG 當圖片載入）**，不用 `innerHTML` 直接內嵌。瀏覽器以 image context 載入 SVG **不會執行**其中的 `<script>` / 事件處理，杜絕惡意 SVG self-XSS。〔spec 原本沒指定呈現方式，preflight 補〕
- [ ] 檔名輸入框的值只用於下載檔名，過濾非法字元（`/ \ : * ? " < > |`），不進 DOM innerHTML。
- [ ] 後端回傳的 SVG 字串以 JSON 傳遞（自動轉義），前端 `JSON.parse` 後只放進 Blob，不 `eval` / 不 innerHTML。

## E. 前台 endpoint

- [ ] server-side validation：不信任 client 的副檔名，後端自行驗 magic bytes。
- [ ] CSRF：此為無狀態 JSON API、無 cookie session（全站無 auth），CSRF 風險不適用。
- [ ] Rate limit：本站現況無此基礎設施，Non-scope；以檔案大小 / 頁數上限作為濫用界限。
- [ ] 錯誤訊息繁中、對一般使用者友善，不洩漏內部路徑 / traceback。

## J. 第三方套件（JSZip）

- [ ] 引入方式**沿用專案慣例**：cdnjs（`https://cdnjs.cloudflare.com/ajax/libs/jszip/...`）+ `crossorigin="anonymous" referrerpolicy="no-referrer"`，與 invoice-stamp 的 pdf.js / pdf-lib 一致。〔修正 spec 原本「vendored」的錯誤假設〕
- [ ] 只在「多檔打包下載」時用；單頁下載不需 JSZip（直接 Blob）。
- [ ] License：JSZip 為 MIT / GPLv3 雙授權，前端 CDN 引用無問題。
- [ ] pin 明確版本號（不是 latest），與專案 pdf.js 3.11.174 的 pin 風格一致。

## 完工自查（實作後同一份再走一遍）

- [ ] 有沒有越界做了 Non-scope 的事？
- [ ] X / Y / Z 三段每一項都有對應程式碼 + 測試證據？
- [ ] 用真實 11 頁 logo.ai 跑過端到端（上傳 → 預覽 → 改名 → ZIP 下載 → 解壓驗證）？
- [ ] 亮 / 暗兩模式都檢查過？
