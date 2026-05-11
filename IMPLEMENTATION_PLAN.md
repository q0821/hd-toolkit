# 實作計畫：hd-toolkit（前端小工具聚合）

## 背景

把現有的 `pdf2jpg` 單一工具專案，改造成「多個前端小工具的聚合站」：
- 首頁 = 工具選單頁
- `pdf2jpg` 成為其中一個工具，並**改套用新的統一風格**
- 新增「圖片切片工具」（上傳圖片 → 選欄數/列數 → 下載 ZIP），**純前端實作**（Canvas + JSZip）
- 全站統一一套設計系統（深色 + 螢光黃綠 accent + 等寬字技術風，依使用者提供的參考稿）
- Repo 改名為 `hd-toolkit`（保留 git 歷史，不開新 repo）

## 目標架構

```
hd-toolkit/
├── main.py                      # FastAPI：掛 router + 靜態目錄 + 工具頁面路由
├── requirements.txt             # 不變（純前端工具不需新增後端依賴）
├── Dockerfile                   # 不變（poppler 仍給 pdf2jpg 用）
├── README.md                    # 改寫成工具箱說明
├── IMPLEMENTATION_PLAN.md       # 本檔（全部階段完成後刪除）
├── app/
│   ├── __init__.py
│   └── tools/
│       ├── __init__.py
│       └── pdf2jpg.py           # APIRouter(prefix="/api/pdf2jpg")，含 /convert
└── static/
    ├── index.html               # 首頁：工具選單卡片牆
    ├── shared/
    │   └── app.css              # 全站設計系統 + 共用元件
    ├── pdf2jpg/
    │   └── index.html           # 既有功能，改套新風格、引用 ../shared/app.css
    └── image-slicer/
        └── index.html           # 新工具，純前端
```

### 路由

```
GET  /                       → static/index.html        （選單）
GET  /pdf2jpg                → static/pdf2jpg/index.html
GET  /image-slicer           → static/image-slicer/index.html
GET  /static/*               → 靜態檔
POST /api/pdf2jpg/convert    → 由 app/tools/pdf2jpg.py 的 router 提供
POST /api/convert            → 保留為相容別名（轉呼叫新 handler），1～2 版後可移除
GET  /api/health
```

---

## 設計系統 — hd-toolkit 統一風格

**完整規格見專案根目錄的 `DESIGN.md`（由 /design-consultation 產生），動任何 UI 之前先讀那份。** 摘要：

- 風格定位：**Quiet Utility** — 精煉的實用主義 / 瑞士平面風（冷靜、留白、髮絲線；無漸層、無 blob、無發光）
- 顏色：**亮色＝溫暖紙質 / 淺木紋**（暖米底 `#f4ecdc` + 暖白卡片 `#fdf9ef` + 暖近黑文字 `#2b241a`）、**暗色＝深木紋 / 胡桃木**（深暖棕底 `#231a11` + 上層木色卡片 `#2e2417` + 暖米白文字 `#ede3cf`）；單一 **暖琥珀 accent**（亮 `#b45309` / 暗 `#f59e0b`）；error 用純紅、warning 用偏橘以和 accent 拉開
- 字體（Google Fonts）：**Space Grotesk**（顯示 / 工具名 / 大標）+ **IBM Plex Sans**（內文 / 介面）+ **IBM Plex Mono**（檔名 / px / kbd / 技術數值）
- **亮 / 暗雙模式**：`:root` 亮、`html[data-theme="dark"]` 覆寫；預設跟 `prefers-color-scheme`，使用者切換後寫 `localStorage('toolbox-theme')`；切換鈕在 header（太陽 / 月亮 SVG）；尊重 `prefers-reduced-motion`
- 共用元件（進 `static/shared/app.css`，三個工具頁 + 首頁共用）：`.app-shell` / `.app-header`（含 `hd-toolkit` 字標、breadcrumb 工具名、`.theme-toggle`）/ `.app-footer` / `.tool-layout` `.tool-controls` `.tool-preview`（左右分割）/ `.section-label` / `.dropzone` / `.stepper` / `.segmented` / `.range` / `.text-field` / `.btn-primary` `.btn-secondary` `.btn-ghost` / `.message`（error / success）/ `.progress` / `.tool-card`（首頁卡片）/ `.chip` / `.preview-empty`
- 圖示：一律 inline SVG 線條圖（`stroke="currentColor"`、`stroke-width="1.5"`、20–24px，Lucide / Feather 風格）
- **不使用 Emoji**；中英文之間留半形空白；無 CSS 框架；不寫 `transition: all`
- 視覺預覽：`/design-consultation` 已產一個 HTML preview 頁（在 `/tmp/hd-toolkit-design-preview-*.html`，可刪），實作 `app.css` 時以它與 `DESIGN.md` 為準

---

## 階段 1：重構骨架 +（順手）建立設計系統雛形
**目標**：拆出新目錄結構、建立 `shared/app.css` 骨幹、把 pdf2jpg 搬進新位置（功能不變，先沿用舊樣式或局部套新樣式皆可，視覺微調留階段 2）
- `app/__init__.py`、`app/tools/__init__.py`、`app/tools/pdf2jpg.py`（APIRouter，把 `/api/convert` 邏輯搬進來 → `/api/pdf2jpg/convert`，並加舊路徑相容別名）
- `main.py`：`include_router`、`app.mount("/static", ...)`、為每個工具加 `GET /<slug>` 回對應 html、保留 `GET /` 與 `/api/health`
- `static/index.html` → 搬到 `static/pdf2jpg/index.html`，fetch 路徑改 `/api/pdf2jpg/convert`
- 新建 `static/shared/app.css`：依 `DESIGN.md` 放 CSS 變數（亮 + `[data-theme="dark"]` 覆寫）、字體 import（Space Grotesk + IBM Plex Sans + IBM Plex Mono）、reset、`.app-shell/.app-header/.app-footer/.theme-toggle` 與基礎 `.btn-*/.message` 等；header 的亮/暗切換 JS 也一起做（夠後續階段引用即可，不必一次到位）
- 首頁 `static/index.html`：暫時最簡版選單（站名 header + 1 張卡片連 `/pdf2jpg`），先套 `app.css`

**成功標準**：
- `uvicorn main:app` 啟動，`/` 顯示選單、`/pdf2jpg` 顯示轉換頁
- 上傳 PDF → 成功下載 ZIP（功能與改造前一致）
- `/api/convert`（舊）與 `/api/pdf2jpg/convert`（新）都可用；`/api/health` 回 `{"status":"ok"}`

**測試**：
- 手動跑服務、開 `/pdf2jpg`、轉一份多頁 PDF、檢查 ZIP 內檔名與張數
- `curl -X POST .../api/pdf2jpg/convert -F file=@test.pdf -o out.zip` 正常下載

**狀態**：完成（已驗證：`/`、`/pdf2jpg`、`/image-slicer`、`/static/shared/*` 皆 200；新舊轉換路徑都回正確 ZIP；`/api/health` ok）

---

## 階段 2：套用統一風格（首頁選單 + pdf2jpg 改皮）
**目標**：把設計系統完整落地，首頁與 pdf2jpg 都長成新風格
- 完成 `static/shared/app.css` 全部共用元件（dropzone、stepper、segmented、range、text-field、section-label、preview-empty…）
- 首頁 `static/index.html`：深色、`.app-header`（站名 hd-toolkit）、工具卡片 grid（每張：SVG icon、工具名（等寬）、一句說明（灰字）、整張可點連 `/<slug>`、hover → `--accent` 邊框 + 微上移），目前 2 張卡：PDF to JPG、圖片切片工具（後者連 `/image-slicer`，頁面階段 3 完成）；響應式（手機單欄）
- `static/pdf2jpg/index.html` 改皮：改用 `.app-header`（含「← 回工具箱」）、編號分節（`01 / 上傳 PDF`、`02 / 解析度 (DPI)`、`03 / JPG 品質`）、滑桿改 `.range`、按鈕改 `.btn-primary`（文案「轉換並下載」）、訊息區改 `.message`、移除原和紙質感樣式與 Playfair Display；功能與 API 呼叫不動
- 移除舊 inline `<style>` 中已被 `app.css` 取代的部分

**成功標準**：
- `/`、`/pdf2jpg` 視覺一致（同底色、同 accent、同等寬字、同元件樣式）
- 點 PDF to JPG 卡片 → `/pdf2jpg`；「← 回工具箱」→ `/`
- pdf2jpg 轉換功能不受改皮影響
- 手機寬度版面不爆

**測試**：
- 桌機 + 手機寬度各看一次（首頁、pdf2jpg）
- 重新轉一份 PDF 確認功能正常
- 點擊所有導覽連結

**狀態**：完成（與階段 1 一起做掉：`static/shared/app.css` + `theme.js` 全套；首頁卡片牆；pdf2jpg 改皮並改打 `/api/pdf2jpg/convert`；移除舊和紙質感 / Playfair Display；`/image-slicer` 先放「建置中」佔位頁，階段 3 取代）— 待使用者實機 / 雙模式視覺確認

---

## 階段 3：圖片切片工具（純前端，依參考稿）
**目標**：`static/image-slicer/index.html` — 上傳圖片 → 設定欄/列 → 選輸出格式 → 下載 ZIP，全部在瀏覽器完成；版面照使用者提供的參考稿（左操作、右預覽）

### 介面（左側 `.tool-controls`）
- `01 / 上傳圖片`：`.dropzone`（拖放或點擊；接受 `image/*`）；選檔後右側預覽即時顯示
- `02 / 切割設定`：兩個 `.stepper` 並排 —「欄（水平數）」（cols）與「列（垂直數）」（rows）；預設各 3；範圍 1–20；任一變動即時更新右側預覽的格線
- `03 / 輸出格式`：`.segmented` 三選一 — PNG / JPG / WEBP；預設 PNG
- `品質（JPG/WEBP）`：`.range` 1–100，預設 90；右側顯示 `90%`（accent 色）；格式為 PNG 時此列淡化/停用（PNG 無損）
- `04 / 檔名前綴（可留空）`：`.text-field`，**不自動帶原檔名**（避免中文檔名）；預設 `split-`。前綴直接接在 `列-欄` 前面：預設 → `split-1-1.png`；留空 → `1-1.png`；輸入 `photo_` → `photo_1-1.png`
- 底部 `.btn-primary`「開始切割」：未選檔時 disabled；切割中顯示處理狀態

### 介面（右側 `.tool-preview`）
- 未上傳：`.preview-empty`（剪刀 SVG icon + 「上傳圖片後預覽將顯示於此」）
- 已上傳：圖片縮放置中顯示，疊上格線（依 cols/rows 畫等分線；最後一欄/列若有餘數，線位置按實際切點）；可標每塊序號（選配）

### 切割與打包邏輯（純前端）
- 引入 JSZip（CDN：`https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js`）
- 讀圖：`const img = new Image(); img.src = URL.createObjectURL(file);` 等 `onload` 取 `naturalWidth/naturalHeight`
- 等分：`baseW = Math.floor(W / cols)`，第 c 欄（0-based）起點 `sx = c * baseW`，寬 `sw = (c === cols - 1) ? W - sx : baseW`；列同理（避免右/下邊緣掉像素）
- 每塊：建 `<canvas>`（尺寸 = `sw × sh`）→ `ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)` → `canvas.toBlob(cb, mime, quality)`（包成 Promise；PNG 不傳 quality）
- `mime`：PNG=`image/png`、JPG=`image/jpeg`、WEBP=`image/webp`；副檔名對應 `png/jpg/webp`
- 逐塊 `await canvasToBlob(...)` → `zip.file(\`${stem}.${ext}\`, blob)`，其中 `stem = prefix ? \`${prefix}_${r+1}-${c+1}\` : \`${r+1}-${c+1}\`` → `zip.generateAsync({type:'blob'})` → 觸發下載 `${prefix ? prefix+'_slices' : 'slices'}.zip`
- 邊界處理：cols/rows 介於 1–20；`cols*rows` 過大（如 > 200）時提示確認；非圖片檔擋掉並用 `.message.error` 顯示；切割中 disable 按鈕避免重複觸發
- 樣式：引用 `/static/shared/app.css`，沿用 `.dropzone/.stepper/.segmented/.range/.text-field/.btn-primary/.section-label/.preview-empty`

**成功標準**：
- 上傳一張圖、設 3 欄 3 列、PNG、用預設前綴 `split-`、按開始切割 → 下載 `split-slices.zip`，內含 9 個 PNG：`split-1-1.png split-1-2.png … split-3-3.png`（依列再依欄）；前綴清空時 → `slices.zip` 內 `1-1.png … 3-3.png`
- 9 張依序拼回 = 原圖（右/下邊緣不掉像素）
- 透明 PNG 切完仍透明；切 JPG / WEBP 時 quality 滑桿生效、PNG 時滑桿停用
- 改 cols/rows，右側預覽格線即時跟著變
- 未上傳時按鈕 disabled、右側顯示空狀態

**測試**：
- 不同尺寸圖（含寬高不能整除欄/列數）、透明 PNG、極端值（1×1、1×20、20×1）
- 三種輸出格式各測一次，開 ZIP 檢查副檔名 / 張數 / 命名，看圖軟體確認尺寸與內容
- 桌機 + 手機寬度版面（手機改上下堆疊）

**狀態**：完成（`static/image-slicer/index.html` 純前端 Canvas + JSZip CDN；左控制 / 右預覽分割版面、即時格線；欄/列 1–20 步進器、PNG/JPG/WEBP + 品質滑桿（PNG 時停用）、檔名前綴預設 `split-`、可留空（不自動帶原檔名，避免中文）；最後一欄/列吃餘數；輸出 `<前綴>列-欄.<ext>`（預設 `split-1-1.png`、留空 `1-1.png`）、打包 `<前綴>slices.zip`；切割中 disable 防重複觸發、進度顯示）— 待使用者實機驗證切割正確性與三種格式

---

## 階段 4：收尾與改名
**目標**：文件對齊、Repo 改名
- 改寫 `README.md`：站名 hd-toolkit、工具列表與各工具說明、設計風格說明、本機啟動、技術棧（後端 FastAPI 僅 pdf2jpg 用，其餘純前端）、Docker/Zeabur 部署
- 確認 `Dockerfile`（`COPY . .` 會帶 `app/` 與 `static/` 全子目錄，無需改）
- 確認 `.dockerignore` / `.gitignore` 不漏新目錄
- GitHub repo 改名 `pdf2jpg` → `hd-toolkit`（GitHub Settings 改名，舊網址自動 redirect）
- 本機 `git remote set-url origin <新網址>`；（可選）本機資料夾改名
- Zeabur：服務名與 repo 名無強綁定，重新連結或確認 webhook 仍有效
- 全部驗證通過後刪除本 `IMPLEMENTATION_PLAN.md`

**成功標準**：
- README 與實際結構一致
- `docker build` 成功、容器內 `/`、`/pdf2jpg`、`/image-slicer` 都可存取
- GitHub repo 新名稱生效、本機 `git push` 正常

**測試**：
- `docker build -t hd-toolkit . && docker run -p 8080:8080 hd-toolkit`，瀏覽器測三頁
- `git push` 確認 remote 正常

**狀態**：完成（README 改寫成「HD 的工具箱」；`.dockerignore` 補上 DESIGN.md / CLAUDE.md / IMPLEMENTATION_PLAN.md；GitHub repo 已改名 `q0821/pdf2jpg` → `q0821/hd-toolkit`，`gh` 已自動更新本機 `origin`）。**未做**：本機資料夾改名（可選，會打斷工作目錄，先不動）；`docker build` 實測（本機未跑）。**待辦**：① 使用者實機驗證圖片切片三種格式 ② 確認 Zeabur 部署仍正常（repo 改名後 GitHub 有 redirect，Zeabur 通常會跟著；若沒跟到就在 Zeabur 重新連結 repo）③ 全部 OK 後可刪除本 `IMPLEMENTATION_PLAN.md`

---

## 注意事項 / 決策紀錄
- **統一風格 = Quiet Utility（中性灰 + 暖琥珀 accent + Space Grotesk/IBM Plex，亮暗雙模式）**，完整規格在 `DESIGN.md`；首頁、pdf2jpg、image-slicer 全套同一份 `shared/app.css`；移除原本的和紙質感 / Playfair Display；參考稿（霓虹終端機風）已否決不採用
- **不開新 repo**：技術棧相同、同一部署、加法式擴充，改名即可，保留 git 歷史
- **圖片切片走純前端**：零伺服器負載、檔案不上傳（隱私）、即時；未來若要 API 化再加 `app/tools/image_slicer.py`（Pillow `img.crop`）
- **欄 = 水平數 (cols)、列 = 垂直數 (rows)**；3 欄 3 列 = 9 塊；輸出命名 `<前綴>列-欄.{ext}`，前綴預設 `split-`（→ `split-1-1.png`、`split-1-2.png` …），可清空（→ `1-1.png` …）；刻意不帶原檔名，避免中文檔名
- **工具清單先寫死**：工具數量少，不做動態註冊機制（避免過早抽象）；超過 5～6 個再考慮抽 config
- **舊 API 路徑相容**：`/api/convert` 保留為別名（`include_in_schema=False`），註記預計移除版本
- **不使用 Emoji**：UI 一律 inline SVG icon（含參考稿裡的 🖼️ / ✂️）
- **網站顯示名稱 = 「HD 的工具箱」**（header 字標、`<title>`、footer、首頁 hero 都用這個）；`hd-toolkit` 只當 repo / 資料夾代號
- **JSZip 走 CDN**（cdnjs `jszip@3.10.1`，`crossorigin` 無 SRI）；圖片切片若 JSZip 載入失敗會用 `.message--error` 提示。日後若想離線可用，可改 vendor 到 `static/shared/vendor/jszip.min.js`

---

# 追加：去背功能（2026-05-11）

新增「圖片去背」工具（綠幕 + AI 兩模式），並讓圖片切片工具順便能在切之前去綠幕。決策見最下方紀錄。

## 階段 5：共用綠幕去背模組
**目標**：`static/shared/chroma-key.js` — 純前端 Canvas 單色背景去背，給 bg-remover 與 image-slicer 共用
- 匯出 `window.ChromaKey.process(imgOrCanvas, {keyColor?, tolerance, smoothness, spill}) → {canvas, keyColor, lowSaturation}`
- `keyColor` 不給時自動從四角取樣（取最飽和的角落）
- 演算法：HSV 色相距離分內外閾值（內＝全透明、內外間＝線性羽化），近灰 / 近黑不視為背景；去溢色＝把 key 的主通道（綠幕→G）往另兩通道平均壓，依色相接近度與強度加權
- 回傳的 canvas 背景像素 alpha 已歸零（匯出 PNG/WEBP 即透明）

**成功標準**：以一張綠幕圖呼叫 `process()`，回傳 canvas 匯出 PNG 後背景透明、主體邊緣無明顯綠邊；非單色背景圖 `lowSaturation` 為 true

**狀態**：完成

## 階段 6：新工具「圖片去背」`/bg-remover`
**目標**：`static/bg-remover/index.html` — 上傳圖片 → 選去背方式 → 下載透明 PNG
- `.segmented` 切換「綠幕去背 / AI 智慧去背」
- 綠幕模式：顯示偵測到的背景色（可點預覽圖手動取色、可重設為自動）＋容差 / 邊緣羽化 / 去溢色三條 `.range`；改任一參數即時重算右側預覽（debounce）
- AI 模式：`@imgly/background-removal`（jsDelivr ESM，瀏覽器跑 ONNX，預設 `publicPath` 自動抓 staticimgly CDN 的 wasm/模型），`progress` 回呼接到 `.progress` 條；提示「首次下載模型、之後快取、圖片不上傳」
- 預覽區：棋盤格底（顯示透明）＋ `preview-empty` 空狀態
- 「處理並下載 PNG」：綠幕＝拿目前已處理的 canvas → toBlob → 下載；AI＝呼叫 removeBackground → 顯示結果 + 下載
- `main.py` 加 `GET /bg-remover`；`static/index.html` 加 `.tool-card`（並順手移除 image-slicer 卡上過時的「即將推出」tag）；`README.md` 補工具表 + 目錄結構

**成功標準**：`/bg-remover` 200；綠幕模式上傳綠幕圖 → 即時看到去背預覽、調參數有反應、點圖可改取色、按鈕下載到透明 PNG；AI 模式上傳任意背景圖 → 進度條跑、處理完預覽顯示去背結果、下載到透明 PNG；亮 / 暗模式都正常

**狀態**：完成

## 階段 7：圖片切片加「去綠幕」選項
**目標**：`static/image-slicer/index.html` — 在切割設定附近加一組「背景」`.segmented`：保留原背景 / 去除綠幕（含容差 `.range`）
- 勾「去除綠幕」→ 輸出格式鎖 PNG / WEBP（停用 JPG 按鈕，若當下選 JPG 自動切回 PNG）；先用 `ChromaKey.process()` 對整張原圖去背 → 再從處理後 canvas 切片
- 右側預覽：去綠幕開啟時改棋盤格底並顯示去背後的圖（格線照舊疊上）

**成功標準**：開「去除綠幕」→ 預覽變透明背景、JPG 鈕停用；切割後 ZIP 內每塊 PNG 背景透明且邊緣無綠邊；關掉回到原行為

**狀態**：完成

## 追加決策紀錄
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-11 | 去背做成「一個工具兩模式」（綠幕 Canvas + AI `@imgly/background-removal`），不拆兩個工具 | 使用者指定；同一個「去背」心智模型，模式切換即可 |
| 2026-05-11 | AI 模式跑在瀏覽器（jsDelivr ESM + staticimgly CDN 的 wasm/模型），不走後端 rembg | 使用者選；維持「能在瀏覽器做就不上傳」，Docker / 伺服器零負擔；代價＝首次載入要下載模型（會快取） |
| 2026-05-11 | 去背輸出先只做「透明 PNG」，不做換純色底 / 換背景圖 | 使用者選；涵蓋大多數需求，UI 最單純，之後要再加 |
| 2026-05-11 | 綠幕去背抽成 `static/shared/chroma-key.js` 共用模組 | bg-remover 與 image-slicer 兩個消費者，值得抽；演算法只有一份 |
| 2026-05-11 | image-slicer 的去綠幕：先整張去背再切（不是切完逐塊去背） | 結果完全一樣（逐像素處理與切割順序無關），先去再切實作最單純；切完格式自動限 PNG/WEBP |

---

# 追加：縮圖 / 圖片壓縮工具（2026-05-11）

新增「圖片壓縮」工具 `/image-compressor`，純前端，選項參考 [pic-smaller](https://github.com/joye61/pic-smaller)（MIT）。**不 fork 它的 codebase**（React + Vite + Ant Design 跟本專案 vanilla 無框架不合），改用同類的 jSquash WASM codec + vanilla 重寫 UI，並在頁尾 / README 致謝。

## 階段 8：圖片壓縮工具 `/image-compressor`
**目標**：批次上傳圖片 → 設輸出格式 / 品質 / 縮放 → 壓縮 → 看壓縮率、個別 / 全部（ZIP）下載，全部在瀏覽器完成
- codec：jSquash（unpkg `?module` ESM，瀏覽器跑 WASM）—— `@jsquash/jpeg`、`@jsquash/png`、`@jsquash/webp`、`@jsquash/avif`、`@jsquash/resize`、`@jsquash/oxipng`（PNG 無損最佳化）
- 流程 per file：`file.arrayBuffer()` → 依來源 MIME `decode()` → `ImageData` →（可選）`resize()` → 依目標格式 `encode({quality})`（PNG 走 `png.encode` 再 `oxipng.optimise`）→ `Blob`
- UI（沿用 `app.css` 元件 + 左控制 / 右預覽版面）：
  - 左：`01` dropzone（`multiple`，接受 jpg/png/webp/avif）｜ `02` 輸出格式 `.segmented`（原格式 / JPEG / PNG / WEBP / AVIF）｜ `03` 品質 `.range` 1–100（PNG 或「原格式且來源為 PNG」時停用，提示走 oxipng 無損）｜ `04` 縮放 `.segmented`（不縮放 / 寬度 / 高度 / 長邊 / 短邊 / 比例，皆等比例）+ `.text-field` 數值 ｜「壓縮全部」按鈕（無檔時 disabled，壓縮中顯示進度）｜ `.progress` ｜ `.message`
  - 右：檔案清單（每列：縮圖 + 檔名 + 原大小 → 壓縮後大小（−XX%）+ 個別下載鈕；尚未壓縮顯示原大小與「待壓縮」）+ 頂部「全部下載 ZIP」（JSZip，沿用 image-slicer 那顆 CDN）+ `.preview-empty` 空狀態；改任何選項後可重新壓縮
- 邊界：非支援格式擋掉並用 `.message--error`；單檔過大（如 > 30 MB）提示；壓縮中 disable 按鈕；codec 載入失敗（CDN 擋）提示重試
- `main.py` 加 `GET /image-compressor`；`static/index.html` 加 `.tool-card`；`README.md` 補工具表 + 目錄結構 + 致謝；頁尾「參考自 pic-smaller」連結
- v1 不含 GIF / SVG（gifsicle-wasm / svgo 較重，列後續）；壓縮跑主執行緒（逐檔 await + 之間 `setTimeout(0)` yield），不開 Web Worker（先求簡單、與現有工具一致）

**成功標準**：上傳數張 jpg/png → 品質 75、輸出原格式 → 壓縮後明顯變小、清單顯示壓縮率、可個別 / 全部下載；改 WEBP 重壓 → 輸出 `.webp`；勾「依寬 800」→ 輸出寬 800 等比；亮 / 暗模式正常；無 JS error

**測試**：jpg / png / webp 各一張、含一張本來就很小的（壓不太動）、改格式重壓、改縮放重壓、批次 5 張、全部下載 ZIP 開來檢查；桌機 + 手機寬度

**狀態**：完成（無頭瀏覽器實測：6 張真實 JPEG/PNG 批次壓縮，jpg→jpg 約 −53~61%、png→png oxipng −66%；切 WEBP + 縮放 重壓 −84~97%；超小 PNG 轉 WEBP 反而變大、UI 以 warning 色顯示 +%；jSquash CDN + mozjpeg/oxipng/libwebp/resize 都正常）— 待使用者實機驗證 AVIF 輸出與手機版面

## 追加決策紀錄
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-11 | 不 fork pic-smaller，改用 jSquash codec + vanilla 重寫 UI、致謝 pic-smaller | pic-smaller 是 React/Vite/Ant Design + build pipeline，跟本專案「純手刻 HTML/CSS/JS、無框架、無 build」原則衝突；真正可重用的是底層 WASM codec |
| 2026-05-11 | codec 選 jSquash（mozjpeg/oxipng/libwebp/libavif 的模組化 WASM port），非 pic-smaller 原本那組 | jSquash 模組化、unpkg `?module` CDN 直接用、無 build、維護活躍；pic-smaller 那組（wasm-image-compressor / wasm_avif / gifsicle-wasm / svgo）來源較雜 |
| 2026-05-11 | v1 不做 GIF / SVG，壓縮跑主執行緒不開 Worker | 先求能用且簡單；GIF/SVG 的 lib 較重、Worker 增加複雜度，列為後續優化 |
