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
| 2026-05-11 | bg-remover AI 模式：模型由 `isnet_quint8` 改 `isnet_fp16`，並在去背後加「清除孤立碎屑」後處理（alpha mask 做 4-連通元件，只保留最大塊 + 面積 ≥ 0.3% 影像的塊，其餘 alpha 歸零） | quint8（量化、最小）在深色主體配深色雜亂背景會吐一堆碎屑，fp16 明顯乾淨；碎屑後處理再保底（連極端 case 也不會滿天黑點）。代價：模型下載 ~40MB → ~80MB |
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

---

# 追加：LINE 貼圖打包工具（2026-05-11）

獨立工具 `/line-sticker`（純前端），把素材變成符合 LINE Creators Market 規格、可直接上傳的整包。**只做「打包」這層**（切 / 去背 / fit / 偶數化 / 留白 / main / tab / 命名 / ZIP）；「上傳照片 → 選風格 → AI 自動生成多張」是另一層（要串影像生成 API，gpt-image / Gemini「nano-banana」之類；key 走 localStorage、可能再加薄後端 proxy 解 CORS）—— 那層暫不做，等這層上了再規劃。

## 階段 9a：LINE 貼圖打包工具 `/line-sticker`（靜態）
**目標**：上傳多張圖片（或一張拼版大圖自動切）→（可選去綠幕）→ 自動裁透明邊、fit 進 LINE 尺寸、偶數化、補透明留白 → 產出 `01.png…`、`main.png`(240×240)、`tab.png`(96×74)，打包 ZIP
- UI（沿用 `app.css` 元件 + 左控制 / 右預覽，重用 `static/shared/chroma-key.js` + JSZip CDN）：
  - `01 來源` `.segmented`：多張圖片（dropzone multiple）/ 拼版大圖（dropzone single + 欄 / 列 `.stepper` → 切成 欄×列 張）
  - `02 去背` `.segmented`：不去背（已透明）/ 去除綠幕（+ 容差 `.range`，dimmed when 不去背）
  - `03 尺寸與留白` `.segmented`：自動（貼合內容，長 ≤ 370、高 ≤ 320，偶數）/ 正方形 320×320；+ 四周留白 `.range` 0–40 px（預設 10）
  - `04`（提示）：會用第 1 張自動生 `main.png`(240×240) 與 `tab.png`(96×74)
  - 狀態列：目前 N 張 — LINE 一組需 8 / 16 / 24 / 32 / 40 張（不符以 warning 色提示）
  - 「產生貼圖包」按鈕 / `.progress` / `.message`
  - 右：結果縮圖牆（棋盤格底）+ main / tab 預覽 + 「下載 ZIP」+ 空狀態
- 流程 per sticker：來源圖（或切片區域）→（可選 `ChromaKey.process`）→ 掃 alpha 取內容 bbox 並裁掉透明邊（全不透明則整張）→ contain 縮放（縮太多時分段 halving）置中於 偶數尺寸、含留白的透明 canvas → `toBlob('image/png')`；> 1 MB 時提示（不自動最佳化）
- `main.png`：第 1 張的裁切內容 fit 進 240×240 透明 canvas；`tab.png`：同樣 fit 進 96×74
- ZIP：`main.png` + `01.png`…`NN.png`（補零兩位）+ `tab.png`（LINE 是逐檔上傳、不吃 ZIP，但 ZIP 是給使用者的方便包）
- `main.py` 加 `GET /line-sticker`；`static/index.html` 加 `.tool-card`；`README.md` 補；首頁 meta description 補

**成功標準**：丟 8 張綠幕 PNG → 勾去綠幕、留白 10、自動尺寸 → 產出 8 張透明 PNG（長寬偶數、≤ 370×320、四周約 10px 透明邊）+ `main.png` 240×240 + `tab.png` 96×74，ZIP 內檔名 `main.png 01.png … 08.png tab.png`；拼版大圖 4×2 → 切成 8 張同上；張數非 8/16/24/32/40 時有提示；亮 / 暗模式正常；無 JS error

**測試**：8 張個別 PNG（含透明邊多的）、一張 4×2 拼版大圖、JPEG（不透明、不去背）、極端長寬比的圖（確認 fit 不爆框）、產 ZIP 開來檢查尺寸 / 命名 / 透明；桌機 + 手機寬度

**狀態**：完成（無頭瀏覽器實測：多張模式 8 張綠幕圖（含極端長寬比）→ 去綠幕 → 8 張透明 PNG，長寬皆偶數、≤ 370×320、角落 alpha=0、main.png 240×240、tab.png 96×74、命名 01.png…、ZIP 啟用、組數判斷正確；拼版大圖 4×2 模式同樣 OK。修掉一個 async 加檔的 bug：change/drop handler 在 addMultiFiles(async) 還沒讀完 FileList 前就 input.value='' / DataTransfer 失效 → 只進得了第一張；改成先 Array 快照再清。動態 APNG 為階段 9b）

## 階段 9b：LINE 貼圖打包工具 — 動態（APNG）
**目標**：同工具加「動態貼圖」模式 —— 上傳一串 frame（多張、依序）或一張 frame 拼版大圖（會切）或現成 APNG（會解）→ 組成符合 LINE 規格的 APNG（≤ 320×270 偶數、5–20 幀、1–4 秒、迴圈、≤ 300 KB）+ `main.png`(240×240，靜態) + `tab.png`
- 用 [`UPNG.js`](https://github.com/photopea/UPNG.js)（MIT，CDN）編碼 APNG；解現成 APNG 可用 `apng-js` 或 UPNG 解碼
- UI 加一個頂層 `.segmented`：靜態貼圖 / 動態貼圖；動態模式露出 幀來源 / 幀率（或每幀毫秒）/ 迴圈次數 等控制；每幀也走「去背 → 裁 → fit 進 320×270」
- 邊界：幀數 5–20、總時長 1–4 秒、檔案 ≤ 300 KB（超過提示降幀 / 降色 / 縮尺寸）

**狀態**：完成（UPNG.js + pako CDN；同工具加「貼圖類型」靜態 / 動態切換；動態：每幀去背 → 算各幀內容 bbox 的聯集 → 全幀裁同一框、同一比例縮放 → 同尺寸；UPNG.encode 先無損、>300KB 逐步降色 256→128→64；輸入兩種：多張影格（每 N 張一組）/ 影格拼版（欄=影格、列=貼圖）。無頭瀏覽器實測：多張 12 影格/每 6 → 2 張 APNG（UPNG.decode 驗證 6 幀、320×230、偶數、≤300KB）；拼版 6×3 → 3 張 APNG（驗證 6 幀、320×208）；main.png 240×240、tab.png 96×74 皆正確）

## 追加決策紀錄
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-11 | LINE 貼圖做成獨立工具 `/line-sticker`，不是切圖工具的一個模式 | 切片只是其中一步；LINE 還要 fit 進固定框、偶數化、補留白、生 main/tab、`01.png` 命名、整包 —— 專屬邏輯太多，塞進切圖會變肥；但內部重用切片 + `chroma-key.js` + 縮放積木 |
| 2026-05-11 | 先做靜態（9a），動態 APNG（9b）接著做；AI 生成（上傳照片選風格自動生圖）獨立成第三層、暫不做 | 漸進式：靜態涵蓋最常見情境且零外部依賴；APNG 加 UPNG.js；AI 那層要串 gpt-image / Gemini「nano-banana」之類，涉及 API key（localStorage）/ CORS / 一致性（InstantID 類）/ 成本，規模與調性都不同，等前面上了再規劃 |
| 2026-05-11 | 每張貼圖先「自動裁掉透明邊」再 fit + 補留白 | 不裁的話內容周圍的透明 padding 會害 fit 把角色縮小；全不透明（如 JPEG）時 bbox = 整張，等於沒裁，無害 |
| 2026-05-11 | 自動尺寸＝輸出 canvas 貼合內容（長 ≤ 370、高 ≤ 320、偶數），不是一律 370×320 | LINE 只要求「不超過」且不喜歡大片空白；貼合內容 + 統一留白是常見做法。另給「正方形 320×320」選項給想要整齊一致的人 |

---

# 追加：bg-remover 品質強化 — 手動修補 + 邊緣調整（2026-05-11）

AI 自動去背已「堪用」（imgly fp16 + 碎屑清理）；再往上：① 手動修補筆刷（AI 給 90%、人刷掉剩下的，最可靠）② 邊緣收縮 / 羽化（消 halo、平滑）。都改在 `static/bg-remover/index.html` 裡，預覽改成 canvas 為主的可編輯介面。

## 階段 10：bg-remover 加手動修補 + 邊緣調整
**目標**：去完背景（綠幕或 AI）後能在預覽上用筆刷擦掉 / 還原修瑕疵；AI 結果可調邊緣收縮 / 羽化（不重跑模型）
- **預覽重構**：`previewCanvas` 成為唯一顯示 + 編輯面；`state.origCanvas`（原圖全尺寸，給「還原」筆刷）、`state.resultCanvas`（目前結果，透明底）；綠幕 / AI 結果都畫進 `previewCanvas`；下載匯出 `previewCanvas`（含筆刷編輯）
- **邊緣調整（AI 模式）**：模型 → `blobToCanvas` → `cleanAlphaMask` → 存成 `aiCleanCanvas`；再 `applyAiEdge()` = 複製 aiCleanCanvas → `erodeAlpha`（按收縮 px）→ `featherAlpha`（按羽化 px，用 `ctx.filter='blur()'` 對「alpha 轉灰階」的暫存 canvas 模糊再寫回）→ `resultCanvas` → 顯示。兩條 `.range`：邊緣收縮 0–3px（預設 1）、羽化 0–4px（預設 1），改動 → debounce 重跑 `applyAiEdge`（快、不碰模型）
- **手動修補（兩模式皆可）**：有結果時預覽下方出現工具列 — `.segmented` 擦掉 / 還原 ｜ `.range` 筆刷大小（8–120px）｜「復原」按鈕。canvas 上 pointer / touch 事件畫圓形軟筆刷：擦掉＝`globalCompositeOperation='destination-out'` + 徑向漸層；還原＝把 `origCanvas` 對應區域用徑向漸層 alpha 混回 `previewCanvas`。每一筆 down 時把 `getImageData` 推進復原堆疊（上限 ~8）；復原 = pop + putImageData。client 座標 → canvas 像素座標要換算 CSS 縮放
- **下載**：一律匯出目前 `previewCanvas`（透明 PNG）；綠幕模式調滑桿 / 重新取色會重畫 `previewCanvas`（會清掉未存的筆刷編輯 — 在重畫前若有編輯先提示？v1 先直接重畫，之後再說）

**成功標準**：
- 綠幕去背 → 預覽是 canvas → 點圖取色 / 調容差仍正常 → 拿「擦掉」筆刷塗背景殘留 → 那塊變透明 → 下載 PNG 含編輯
- AI 去背 → 結果出來 → 調「邊緣收縮 2」→ 主體邊緣往內縮（halo 消）、不重跑模型 → 調「羽化 2」→ 邊緣變柔 → 用「還原」筆刷把被誤刪的補回 → 下載含編輯
- 「復原」能一步步退回筆刷；換圖 / 換模式會重置
- 手機（touch）能用筆刷；亮 / 暗模式正常；無 JS error

**測試**：合成綠幕圖（測點取色 + 擦筆刷 + 下載）、unsplash 人像跑 AI（測收縮 / 羽化 slider 不重跑模型、還原筆刷、復原堆疊、下載）、極端：超大圖跳過 cleanup 仍能筆刷；桌機 + 觸控

**狀態**：完成。bg-remover 全面改寫：預覽改 canvas 為主、`origCanvas` 供「還原」筆刷；AI pipeline 加 `aiCleanCanvas` 快取 + `applyAiEdge`（erode + canvas-blur feather，從快取重套用、不重跑模型）+ 邊緣收縮 / 羽化滑桿；手動筆刷 擦掉（`destination-out` 徑向漸層）/ 還原（原圖區域 `destination-in` 遮罩疊回）+ 大小滑桿 + 復原堆疊（ImageData 上限 6）+ pointer / touch；**追加** 預覽縮放 100–400%（CSS fit 寬 × zoom、`overflow:auto` 捲軸、座標映射靠 `getBoundingClientRect` 自動跟縮放、可放大精修）；主按鈕情境化（AI 無結果→「開始 AI 去背」、其餘→「下載透明 PNG」）；AI pane 加「重跑 AI 辨識」。無頭瀏覽器實測：綠幕（點取色 / 擦掉筆刷 → 中央透明 / 復原回復）；AI（開始 → 邊緣區段出現 → 收縮 1→3 那點 alpha 60→20、不重跑模型 → 羽化 4 無誤 → 還原筆刷 → 不透明 → 下載）；縮放（100%→200% 顯示寬 ×2、200% 下擦筆刷座標正確、回 100% inline 樣式清空）；皆無 JS error。（image-slicer 那邊本來就只有「去除綠幕」、沒有 AI 去背，無需改動。）

## 追加決策紀錄
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-11 | bg-remover 預覽改成 canvas 為主、可直接畫筆刷；下載匯出該 canvas | 自動去背不會 100% 完美，手動修補是「堪用 → 完美」最可靠的一步、且不挑模型、不增加下載量 |
| 2026-05-11 | 「二」先做邊緣收縮（erode）+ 羽化（canvas blur on alpha），不做 guided filter | erode 消 halo 是最常見的需求、便宜又穩；guided filter（用原圖細化遮罩、找回髮絲）較重、有 halo 風險，留待之後 |
| 2026-05-11 | 邊緣收縮 / 羽化從「模型輸出後清理過的 aiCleanCanvas」重新套用，不重跑模型 | 調滑桿要即時，重跑 80MB 模型不可接受；erode/feather 都是毫秒級 |

---

# 追加：移除 LINE 貼圖打包工具（2026-05-11）

使用者評估後覺得 LINE 貼圖工具處理得不夠好，先移除（之後再看有沒有更合適的做法 / 現成工具）。階段 9a / 9b 視為**已撤銷**。動作：刪 `static/line-sticker/`、移除 `main.py` 的 `/line-sticker` 路由、首頁卡片與 meta、README 工具表 / 目錄結構那一條。`static/shared/chroma-key.js` 保留（image-slicer 與 bg-remover 還在用）；UPNG.js / pako 只在那頁用、隨檔移除。

---

# 追加：AI 貼圖生成工具 `/sticker-ai`（2026-05-11）

走「上傳照片 + 選風格 + 結構化表情清單 → AI 逐張生圖 → 去背 + fit 進 LINE 尺寸 + 疊標題 → main/tab → ZIP」。Key 存瀏覽器 `localStorage`；OpenAI 與 Google（Nano Banana / Nano Banana Pro）兩家，都走一支薄 FastAPI proxy（轉 key、用完即丟、不存不 log）。

## 階段 11：AI 貼圖生成工具
**目標**：`/sticker-ai` — 兩家 AI 圖像服務（key 瀏覽器端）、結構化表情清單、生完接 LINE 打包，ZIP 下載
- **後端** `app/tools/sticker_ai.py`（`POST /api/sticker-ai/generate`，`httpx` 轉呼叫）：
  - 收 `provider/api_key/model/prompt/size/quality/transparent` + 可選 `reference`（multipart）；回 `image/png` bytes
  - OpenAI：有參考圖 → `POST /v1/images/edits`（multipart，`image[]`）；無 → `/v1/images/generations`（JSON）。`Authorization: Bearer`。`background:transparent` 視 transparent 旗標。回 `data[0].b64_json` → decode
  - Google：`POST generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`，`x-goog-api-key`，body `contents:[{parts:[{text:prompt},(可選){inline_data:{mime_type,data:base64}}]}], generationConfig:{responseModalities:["TEXT","IMAGE"]}` → 從 `candidates[].content.parts[]` 取 `inlineData.data` → decode；沒圖（拒絕 / 純文字）→ 502 + 訊息片段
  - 錯誤：把上游 status + sanitized message 轉回（不含 key）；不 log body
  - `httpx` 加進 `requirements.txt`；`main.py` `include_router` + `GET /sticker-ai`
- **前端** `static/sticker-ai/index.html`（沿用 app.css、重用 `chroma-key.js` + JSZip CDN；fit 邏輯重寫一份小的）：
  - `01 參考圖（可選）` dropzone（上傳後自動縮到 ≤1024px 存著，每次請求帶這份省流量）
  - `02 風格` `.segmented`（貼紙白邊 / 手繪 / Q版 / 水彩 / 線稿 / 卡通）+ 額外描述 text-field
  - `03 表情 / 動作` 可編輯清單（預設 8 條：開心揮手/嗨、大笑/哈哈哈、哭哭/嗚嗚、生氣/氣氣、比OK/OK、鞠躬道謝/謝謝、雙手合十拜託/拜託、戴睡帽打哈欠/晚安），每條 = 描述 + 標題 + 移除；「+新增」；狀態列「目前 N 張 — LINE 一組需 8/16/24」
  - `04 標題文字` `.segmented` 不疊 / 疊在貼圖上（Canvas 白邊黑字、底部）
  - `05 AI 服務` `.segmented` OpenAI / Google；各自：模型 `<select>`（OpenAI: `gpt-image-1`/`gpt-image-1.5`/自訂；Google: `gemini-2.5-flash-image`(Nano Banana)/`gemini-3-pro-image-preview`(Nano Banana Pro)/自訂）+ 自訂 ID text-field、OpenAI 多一個品質 select(low/medium/high，預設 medium)、API key text-field、清除 key、費用提示。Key 存 `localStorage`（`sticker-ai-openai-key` / `sticker-ai-google-key`），載入時還原
  - `06 背景 / 尺寸` `.segmented` 背景（綠幕去背[prompt 加「純綠 #00B140 背景、無陰影」+ chroma-key]／模型透明[OpenAI `background:transparent`；Google prompt 加「透明背景」]／不處理）+ 容差 range；fit `.segmented`（自動 ≤370×320 / 正方形 320）+ 留白 range
  - 「開始生成（N 張）」：逐條 → 組 prompt（風格 + 描述 + 背景指示 + 不要它畫文字若要疊標題）→ POST proxy → 取 PNG → 載 canvas →（綠幕模式：chroma 去背）→（疊標題模式：Canvas 寫標題）→ 裁透明邊 + fit 進 LINE 尺寸（偶數、留白）→ 存。進度條（N 張）。第 1 張 → main.png(240×240) / tab.png(96×74)。打包 ZIP（`main.png` + `01.png…` + `tab.png`）
  - 右：結果牆（縮圖 + `NN.png · WxH` + 「重生這張」）+ main/tab + 「下載貼圖包 ZIP」+ 空狀態；生成前顯示參考圖 + 計畫張數
  - `static/index.html` 加卡片；`README.md` 補
- 邊界：選的 provider 沒 key → 按鈕禁用 + 提示；某張失敗（API 錯 / 沒回圖）→ 那格標錯、其餘繼續；費用警告（一組 8~24 張可能 US$0.3~5，用你自己的 key）

**成功標準**：填 key → 上傳照片 / 選風格 / 8 條表情 → 開始生成 → 逐張出圖、去背、疊標題、fit 進 ≤370×320 偶數 → 8 張透明 PNG + main 240×240 + tab 96×74 → ZIP；無 key 時按鈕禁用；某張 API 失敗不中斷其餘；可「重生這張」；key 重新整理後還在 localStorage。**API 整合需使用者自己的 key 實測**（我這邊只能驗到 proxy 結構 + 非 API 的 UI / 打包流程）

**測試**：proxy 用假 key → 上游 401 正確轉回；前端非 API 部分（清單增刪、key 存取、背景 / fit 模式切換、用一張本機合成 PNG 模擬「生成結果」走完去背 + fit + ZIP）；桌機 + 手機寬

**狀態**：完成（後端 `app/tools/sticker_ai.py` proxy + `httpx` 進 requirements + `main.py` 掛 router & `/sticker-ai` 路由；前端 `static/sticker-ai/index.html`：參考圖（自動縮 ≤1024px）/ 6 種風格 + 額外描述 / 可增刪改的表情清單（預設 8 條）/ 標題疊不疊 / OpenAI ⇄ Google 切換（各自模型 select + 自訂 ID + key 存 localStorage + 清除）/ 背景（綠幕去背 prompt 加純綠底 + chroma-key｜模型透明｜不處理）+ 容差 / fit（自動 ≤370×320 ｜正方形 320）+ 留白 / 逐張生成 + 進度 + 結果牆 + 每張「重生這張」+ main/tab + ZIP；首頁卡片 + README。實測：proxy 用真實假 key → Google 回「API key not valid」、OpenAI 回「Incorrect API key」皆乾淨轉回（uvicorn log 只記 request line、不含 key）；前端 mock fetch 回合成綠幕 PNG → 走完 chroma 去背（角落 alpha=0）+ 裁 + fit（320×320 偶數 ≤370×320）+ 疊標題（「讚」「哈哈哈」可見）+ main 240×240 / tab 96×74 + ZIP 可下載；清單增刪、key 存 localStorage、按鈕情境化（無 key→禁用）皆正常；無 JS error。**真 AI 生成需使用者自己的 key 才能實測**（無頭環境沒 key）。本機需 `pip install httpx` 才能跑（已加進 requirements；部署時 Docker 會裝）

## 追加決策紀錄
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-11 | AI 貼圖走獨立工具 `/sticker-ai`、key 存 localStorage、OpenAI + Google 兩家都經一支薄 FastAPI proxy | 使用者選；proxy 解 OpenAI 瀏覽器 CORS、key 不進 DevTools network，且專案已有「transient relay」模式（pdf2jpg）；proxy 不存不 log key |
| 2026-05-11 | 結構化表情清單（預設 8 條可增刪改）而非自由 prompt；標題傾向 Canvas 疊不讓模型畫 | 使用者選；可預期、好控制張數、好重生單張；模型畫文字易糊 / 易錯字 |
| 2026-05-11 | 透明背景預設走「prompt 要求純綠底 + chroma-key 去綠」而非依賴模型透明輸出 | 跨兩家最穩；模型透明輸出品質 / 支援度不一（OpenAI 的 `background:transparent` 還行，Google 較看運氣）；另留「模型透明」「不處理」選項 |
| 2026-05-11 | 參考圖上傳後縮到 ≤1024px 再每次帶給 proxy | 一組 N 張 = N 次上傳，原圖太大會浪費流量；API 對 ~1024px 輸入也夠用 |

---

# 追加：站台層級設定（API keys）（2026-05-12）

把 AI key 的輸入從 `/sticker-ai` 那頁搬成「整個工具站的設定」—— 每頁 header 一顆齒輪、開設定面板統一管；用「清單」渲染，未來新工具要 key 加一行就好。

## 階段 12：共用設定 `static/shared/settings.js`
**目標**：站台層級的設定面板（目前放各家 API key），每頁可開、可擴充
- `static/shared/settings.js`（每頁載，跟 `theme.js` 同模式）：
  - `KEY_DEFS` 清單：`[{id:'openai', label, placeholder, url}, {id:'google', ...}]` —— 加一家就在這加一條
  - `window.Settings`：`getKey(id)` / `setKey(id, v)` / `get(name, def)` / `set(name, v)`（存 `localStorage` 前綴 `hd-toolkit:`，key 存 `hd-toolkit:apikey:<id>`）/ `onChange(fn)` / `openPanel()`
  - migration：把舊的 `sticker-ai-openai-key` / `sticker-ai-google-key` 搬進新 namespace
  - `DOMContentLoaded` → 在 `.app-header` 的 `.theme-toggle` 前注入「設定」齒輪 `.icon-btn`（SVG 用 `createElementNS` 建，不用 innerHTML）；建設定面板（overlay + modal，append 到 body，預設隱藏）：標題 + 每個 KEY_DEF 一列（label + 取得 key 連結 + `type=password` 的 `.text-field` + 「清除」）+ 說明 + 「關閉」；輸入即存（`input` → `setKey` → 觸發 `onChange`）；Esc / 點 backdrop / ✕ / 關閉 都能關
- `static/shared/app.css`：加 `.icon-btn`（header 圖示按鈕，跟 `.theme-toggle` 同外觀）+ `.settings-overlay` / `.settings-modal` / `.settings-row` / `.settings-foot` 等 modal 樣式
- 6 個 HTML（index / pdf2jpg / image-slicer / bg-remover / image-compressor / sticker-ai）`<head>` 加 `<script src="/static/shared/settings.js"></script>`（在 theme.js 後）
- `static/sticker-ai/index.html`：拿掉自己的 OpenAI / Google key 欄位與相關 localStorage 邏輯；改成顯示「目前選的 provider — API key 已設定 ✓ / 未設定 ⚠」+ 「開啟設定」按鈕（`Settings.openPanel()`）；`currentKey()` → `Settings.getKey(state.provider)`；`Settings.onChange` → 重新 `syncControls()` + 更新狀態文字；模型選單 / 自訂 ID / 品質留在頁上（那是工具專屬，不是站台設定）
- README 補：站台設定面板 + 共用 `settings.js` + sticker-ai 的 key 改在站台設定

**成功標準**：任一頁右上出現齒輪 → 點開設定面板有 OpenAI / Google 兩個 key 欄 → 填進去存進 `localStorage`（`hd-toolkit:apikey:*`）→ 到 `/sticker-ai` 顯示「已設定 ✓」、按鈕可按；舊的 `sticker-ai-*-key` 自動遷移；Esc / 點外面能關面板；亮 / 暗模式正常；無 JS error

**測試**：開任一頁 → 齒輪 → 面板開關（Esc / backdrop）→ 填 key → reload 後還在 → `/sticker-ai` 讀到 → 在面板清除 → sticker-ai 狀態變「未設定」、按鈕禁用；先在舊 `localStorage` 塞 `sticker-ai-openai-key` 再 reload → 出現在面板裡（migration）

**狀態**：完成。新增 `static/shared/settings.js`（`window.Settings`：`getKey/setKey/get/set/onChange/openPanel`，存 `hd-toolkit:` 前綴、key 在 `hd-toolkit:apikey:<id>`；`KEY_DEFS` 清單 [openai, google]；migration 舊 `sticker-ai-*-key`；`DOMContentLoaded` 在 `.theme-toggle` 前注入 `.icon-btn` 齒輪 + 建 overlay/modal，輸入即存、Esc/backdrop/✕/關閉 都能關，SVG 用 `createElementNS`）；`app.css` 加 `.icon-btn` + `.settings-overlay/.settings-modal/.settings-row/.settings-foot`；6 個 HTML `<head>` 加 `<script src="/static/shared/settings.js">`；`/sticker-ai` 拿掉自家 key 欄位與 localStorage 邏輯，改顯示「<provider> API key：已設定 ✓ / 未設定」+「到設定填」按鈕（`Settings.openPanel()`），`currentKey()` → `Settings.getKey(provider)`，`Settings.onChange` → `syncControls()`（含 `updateKeyStatus`），模型/品質留在頁上；README 補。無頭瀏覽器實測：齒輪出現在非 AI 頁（pdf2jpg / image-compressor）的 header 且在 theme 鈕前；開面板 → 2 個 key 列、label 正確；面板填 OpenAI key → `localStorage['hd-toolkit:apikey:openai']` 寫入、`Settings.getKey` 讀到、`Settings.onChange` 觸發 sticker-ai 重 sync（狀態「已設定 ✓」、按鈕可按）；清除按鈕 → 移除；Esc 關面板；migration：reload 前塞 `sticker-ai-google-key` → reload 後 `hd-toolkit:apikey:google` 有值；`Settings.set/get('foo')` 一般用途也通；無 JS error

## 追加決策紀錄
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-12 | AI key 從工具頁搬成「站台設定」：共用 `settings.js` + header 齒輪 + modal，key 用 `KEY_DEFS` 清單渲染 | 使用者要求；未來其他工具也會需要 key，用清單擴充比每個工具各做一套輸入界面好；跟 `theme.js` 同一個「每頁載的共用小模組」模式 |
| 2026-05-12 | 齒輪由 `settings.js` 注入到 header（不改各頁 HTML 的 header），SVG 用 `createElementNS` 而非 innerHTML | DRY（圖示一份）；innerHTML 被 pre-write hook 擋 |
| 2026-05-12 | sticker-ai 的 key 欄位拿掉、只留狀態 + 「開啟設定」連結；模型 / 品質留在頁上 | key 是站台層級、模型是工具層級；避免兩處重複輸入造成混淆 |

---

# 追加：發票章加蓋工具 `/invoice-stamp`（2026-05-26）

依使用者提供的 `PRD_發票章加蓋工具_v1.0.md`（HD-TOOL-004）做。純前端，pdf.js 渲染 / pdf-lib 合成輸出；不需要動到 `app/tools/`。

## 階段 13：發票章加蓋工具 `/invoice-stamp`
**目標**：上傳 PDF → 上傳章圖（PNG 去背 / JPG）→ 點 PDF 任意位置放章（以點為中心）→ 拖曳調位置、滑桿調大小 / 旋轉 / 透明度 → 多頁分別處理 → 用 pdf-lib 合成輸出 `stamped_<原檔名>.pdf`，全程瀏覽器內完成
- **CDN**：pdf.js v3.11.174（cdnjs，含 worker）+ pdf-lib v1.17.1（cdnjs），沿用既有 CDN 慣例
- **版面**（沿用 `.tool-layout` 左右分割 + 既有 `app.css` 元件）：
  - 左 `.tool-layout__controls`：`01` 上傳 PDF dropzone（accept=application/pdf）｜ `02` 上傳發票章 dropzone（accept=image/png,image/jpeg）+ 棋盤格底縮圖預覽（看得出透明）+ 移除鈕 ｜ `03` 章屬性三條 `.range`（大小 30–400px / 旋轉 −180°~+180° / 透明度 10–100 %，未上傳章 + 沒章時 dimmed）｜ `04` 頁面縮圖列表（PDF 未上傳前 hidden；vertical scroll；當前頁 `--accent` 框 + 已蓋章頁右上 chip 顯示章數）｜ `.btn-primary` 「匯出含章 PDF」+ `.progress` / `.message`
  - 右 `.tool-layout__preview`：空狀態 → 已上傳 PDF 後是 canvas + 絕對定位 `.stamp-layer` overlay；點 layer 空白以點為中心放章；章為 `<div>` 含 `<img>`，`transform: translate(-50%,-50%) rotate(Xdeg)` + `opacity`；選取顯示虛框 + 右上 ✕ 刪除鈕；底部 caption「第 X / N 頁 · K 個章」
- **State**：`{pdfDoc, pdfBytes, pdfName, totalPages, currentPage, pageDims{}, stampImage, stampMime, stampBytes, stamps{}, selectedId, draft{size,rotation,opacity}, busy, nextId}`，stamp = `{id, cx, cy, size, rotation, opacity}` — `cx/cy/size` 用 canvas pixel 直接存（不做 resize 重渲染）
- **滑桿行為**：選取章時 = 即時改該章 + 同步到 draft；未選取 = 只改 draft（下次新放章用的預設）
- **座標換算**（對齊 PRD §3.2）：`ratio = pdfW / canvasW`；章中心在 PDF 座標 `(cxPdf = cx*ratio, cyPdf = pdfH - cy*ratio)`；pdf-lib `drawImage` 的旋轉中心是 image 左下角，所以為了讓「旋轉後 image 中心對到 (cxPdf, cyPdf)」要算 `x = cxPdf - (W/2*cosT - H/2*sinT)`、`y = cyPdf - (W/2*sinT + H/2*cosT)`，θ = `-rotation*π/180`（CSS 順時針正、pdf-lib 逆時針正 → 角度反向，pdf-lib 的 rotate 同樣傳 `-rotation`）
- **章長寬**：保留章圖原始長寬比，size = 較長邊（寬比高長 → 寬=size、高=size/AR；反之亦然）
- **匯出**：`PDFDocument.load(pdfBytes, {ignoreEncryption:false})`（加密 PDF catch 顯示錯誤）→ `embedPng/Jpg(stampBytes)` 一次 → 走訪 stamps 各頁 `page.drawImage()` → `pdfDoc.save()` → Blob → 下載 `stamped_<原檔名>.pdf`
- **邊界**：非 PDF / 非 PNG/JPG → `.message--error`；> 50 MB → warning 但繼續；加密 PDF → 提示「無法在加密 PDF 上加蓋章」；pdf-lib / pdf.js CDN 載入失敗 → 提示
- **不做（PRD §6.1 明列）**：觸控優化、Undo/Redo、多章圖同檔切換批次調整、加密 PDF
- `main.py` 加 `GET /invoice-stamp`；`static/index.html` 加 `.tool-card`（PDF + 章 icon）+ meta description 補一條；`README.md` 工具表 + 目錄結構補一條 + 第三方致謝補 pdf.js / pdf-lib

**成功標準**（對齊 PRD §7）：
- 多頁 PDF 上傳，縮圖列表正確；點縮圖切頁
- PNG 去背章預覽和匯出後皆透明
- 點 PDF 放章 → 中心對齊點擊點；拖曳後切頁 / 回來位置保留
- 三個滑桿即時更新預覽；選取 → 出現刪除鈕 → 刪除後章移除
- 多頁各自蓋章後匯出，章座標 / 角度 / 透明度與預覽一致
- 匯出 PDF 用瀏覽器與 Acrobat 開啟皆無損
- DevTools network 確認 PDF 完全沒上傳（除了 CDN）

**狀態**：實作完成（單檔 `static/invoice-stamp/index.html` ~750 行，pdf.js v3.11.174 渲染 + pdf-lib v1.17.1 合成；左控制右預覽、章拖曳 / 選取 / 刪除、縮圖列表 + chip 章數、3 滑桿即時同步、加密 PDF 偵測、亮 / 暗模式繼承 app.css）— **待使用者實機驗證**（多頁 PDF + 透明 PNG 章、座標精準度、Acrobat 開啟）

## 追加決策紀錄
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-26 | 沿用 `.tool-layout` 左右兩欄、頁面縮圖塞進左欄 section 04（不開第三欄） | 維持與其他工具一致的響應式行為與心智模型；縮圖牆做成 vertical scroll 配 max-height，左欄夠用 |
| 2026-05-26 | 章位置 / 大小用 canvas pixel 直接存，不做視窗 resize 重渲染 | 跟 image-slicer / bg-remover 同處理方式，預覽尺寸在 PDF 載入當下定下來，避免 resize 連動 stamps 漂移的複雜度 |
| 2026-05-26 | 章保留原始長寬比，size = 較長邊（PRD 公式以「正方形 size」描述但實務上章常非完全正方形） | 大多數公司章 / 發票章是圓形或方形（接近 1:1），少數橫式章圖（如品名章）非正方；保留長寬比比強制拉成正方形實用 |
| 2026-05-26 | pdf-lib 旋轉中心是 image 左下角而非 stamp center，匯出時用三角函式反推左下角座標 | 文件實測；直接傳 `cxPdf - W/2, cyPdf - H/2` 在 rotation = 0 時對，但旋轉後 stamp 中心會偏移；補上 cos / sin 修正 |
| 2026-05-26 | 滑桿同時編輯「選取的章」和「下次新章預設值」 | 直觀：拉到喜歡的大小 → 點下一個位置會用同樣大小；不用每次重設 |

## 階段 13b：雙章（大 / 小章）+ 騎縫章模式（2026-05-26）
- **state 拆分**：`stampImage/stampBytes/...` 改為 `stampsLib: {big, small}` 各自存 `{image, bytes, mime, file, url}`；placed stamp 多帶 `kind: 'big'|'small'`
- **UI**：02 章圖庫變兩個 slot（大章 / 小章 各自獨立 dropzone + 預覽 + 移除鈕）；03 模式 segmented（一般 / 騎縫）切換 panel；04 章屬性分兩個 panel（hidden 屬性切換）
  - 一般 panel：使用 segmented（大 / 小）+ 三條滑桿（沿用既有），未上傳的 kind 對應按鈕 disabled
  - 騎縫 panel：使用 segmented + 啟用 checkbox + Y / 章高度 / 透明度 三條滑桿
- **騎縫預覽**：`stamp-figure` 內加一個 `#perfPreview` div（pointer-events:none，CSS background-image + background-size 切片），切頁時 `background-position` 改成 `-(i-1)*sliceW`；同時顯示在「一般模式」上，讓使用者隨時知道騎縫切片位置
- **騎縫匯出**：對每頁用 offscreen canvas 切 stampW/N × stampH 的 slice → toBlob('image/png') → embedPng → drawImage 到頁面右邊緣，Y 用 `cyRatio × pdfH` 中心、高度 `heightRatio × pdfH`、寬度按等比例縮放
- **多章嵌入優化**：只 `embedPng/Jpg` 用到的 kind（最多 2 張）；騎縫切片每頁單獨 embed（N 次）— 對 5–30 頁文件可接受
- **kind 清除**：清掉大章時，自動移除已放置的大章、若騎縫用大章則自動切到小章或關閉；activeKind 同理
- **首頁 card + README + 本檔**：tool-card 文案加「大 / 小章 + 騎縫章」；README 工具表那一條更新
- **狀態**：完成（無頭瀏覽器 4 頁 PDF + 大章紅 + 小章藍 端到端：在 page 1 放大 + 小、page 3 放大、啟用大章騎縫 Y=70%/H=20% → 匯出成功 successText「3 個一般章 + 騎縫章（4 頁）」；解析後 page1 紅左 3254 + 藍左 3340 + 紅右切片 2764、page2/4 只紅右切片、page3 紅左大章 + 紅右切片；切頁時 perfPreview backgroundPosition 從 -68.45 (slice 2) 改成對應的切片）

## 追加決策紀錄
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-26 | 大 / 小章 兩個獨立 slot，不做「+新增更多 stamp」可擴充清單 | 中小企業日常用印就是「大章＋小章」兩個固定角色；做成可擴充清單會讓 state 與 UI 變複雜，YAGNI |
| 2026-05-26 | 騎縫章與一般章 panel 分開（mode segmented 切換），兩者狀態獨立、可同時匯出 | 兩種行為差很多（一般是「點擊放置」、騎縫是「自動套全頁」）；放同一個 panel 會讓控制爆炸 |
| 2026-05-26 | 騎縫章用 offscreen canvas 切 N 等分後逐張 embedPng，不用 pdf-lib 的 clipping path 操作子 | 簡單可控；pdf-lib 沒公開 clipping API 要走 `pushOperators` 寫低階 PDF 操作子（風險高、易出錯）；N 張 embedPng 對 5–30 頁文件效能可接受 |
| 2026-05-26 | 騎縫章座標用比例（cyRatio / heightRatio）不用絕對 canvas px | 不同頁可能尺寸不同；用比例可以一致套用到所有頁 |
| 2026-05-26 | 騎縫章每頁切片繪在 PDF 右邊緣（x = pdfW - sliceW），不允許移動 | 傳統騎縫章就是貼右邊緣；做成「自由位置」會讓 UX 變複雜，且實務上沒需求 |
| 2026-05-26 | 騎縫預覽在「一般模式」也顯示（pointer-events:none） | 讓使用者隨時看到「這頁切片會出現在哪」，不必跳到騎縫 panel 才能確認；不會干擾點擊放置 |

## 階段 13c：騎縫章 = 大 + 小章兩片 + 隨機傾斜（2026-05-27）
- **拿掉 `perforation.kind`** — 騎縫章現在強制大 + 小章都要上傳才能啟用；checkbox 在缺一張時 disabled + 顯示「需要大章 + 小章」提示
- **大 / 小章 Y 獨立**：兩條 slider（預設 30% / 70%）；章高度 + 透明度共用
- **隨機傾斜**：state 加 `tiltEnabled` + `tiltRange = 2`（度）+ `tilts: {big: [N], small: [N]}`；大 / 小章獨立 roll（不共用同一組角度）
  - `rollTilts()` 在 PDF 載入時呼叫、使用者按「重新隨機角度」按鈕呼叫
  - `ensureTilts()` 在啟用 / 預覽 / 匯出時保底（如果 tilts 陣列長度 ≠ N 就重 roll）
  - 關 tilt 不重 roll：「關 → 開」會回到之前的角度（穩定）
- **預覽**：拆成 `#perfPreviewBig` + `#perfPreviewSmall` 兩個 overlay，各自 CSS `transform: rotate(Xdeg)` + `transform-origin: center`
- **匯出**：對 big / small 各跑一輪 N 切片 → embedPng N×2 次 → drawImage 帶 `rotate: degrees(-tilt)`；中心固定（右邊緣往內 W/2、Y 由 cyRatio）、用三角函數反推 image 左下角座標（pdf-lib 的 drawImage 旋轉中心是左下角）
- **副帶 bugfix**：`renderCurrentPage` 在切頁太快時會撞 pdf.js「Cannot use the same canvas during multiple render() operations」錯誤；加 `_renderTask` 全域變數 + 新 render 開始前先 `.cancel()` 舊的、catch `RenderingCancelledException` 不冒泡
- **狀態**：完成。無頭驗證：①大章 only checkbox disabled、上傳小章後 enabled ②啟用後第 1 頁 tilt（big -0.22°, small -1.70°）皆在 ±2° 內且互相獨立 ③ successText「騎縫章 ×2（大 + 小 各 4 切片）」④ 匯出 4 頁解析：每頁紅色像素都集中在右邊 + 上半部（大章在 Y=30%）、藍色集中在右邊 + 下半部（小章 Y=70%），各頁切片像素數 1300/2800/2800/1300 對應大章 / 小章切到「弧端 / 圓心粗條」的對稱分布 ⑤快速連點 thumb 不再觸發 canvas race condition

## 追加決策紀錄
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-27 | 騎縫章強制「大 + 小章都要」，不再選擇單張 | 使用者要求；實務上騎縫章 = 大小章一起蓋，原先「擇一」的設計是過度抽象 |
| 2026-05-27 | 大 / 小章 Y 獨立、章高度共用 | Y 位置常見「大上小下」或「大下小上」，獨立才能各自調；高度共用因為通常兩張章大小一致 |
| 2026-05-27 | tilts 一次 roll、給「重新隨機」按鈕；不每次匯出 re-roll | 預覽 = 匯出（WYSIWYG）；要再洗就按按鈕；避免「預覽看到的不是匯出結果」 |
| 2026-05-27 | 大 / 小章 tilt 各自獨立 roll | 真實蓋章手不會兩張同步斜，獨立看起來更自然；技術成本一樣 |
| 2026-05-27 | 預設 tilt enabled（checkbox 預先打勾） | 使用者要求「都隨機傾斜」，預設打開符合預期；想關掉再關 |
| 2026-05-27 | tilt 範圍固定 ±2°，不出 slider | 多一條 slider 沒太大價值；±2° 是常見的微微歪斜程度，要更大會看起來「故意做歪」 |
| 2026-05-27 | renderCurrentPage 加 `_renderTask.cancel()` 取消競態 | 切頁太快時 pdf.js 會丟 race error；加 cancel + catch RenderingCancelledException 是 pdf.js 官方建議做法 |

---

# 追加：HEIC / HEIF 輸入支援（2026-07-31）

讓 iPhone 的 `.heic` 照片可以直接丟進 `/image-compressor` 與 `/image-slicer`，不必先轉檔。設計與 preflight 見 `docs/superpowers/specs/2026-07-31-heic-support-design.md`、`-preflight.md`。

## 階段 14：HEIC 輸入 `image-compressor` + `image-slicer`
- 新增共用模組 `static/shared/heic-decode.js`（IIFE 全域 `HeicDecode`，比照 `chroma-key.js`）：`isHeic()` / `decodeToImageData()` / `decodeToCanvas()` / `preload()`
- 解碼器 `libheif-js@1.19.8`（jsDelivr ESM bundle，1.46 MB，wasm 內嵌單一檔）；lazy import + promise 快取，**失敗時清快取讓使用者能重試**
- `isHeic()` 三層判斷：MIME → 副檔名 → magic bytes（僅前兩層無結論才用，且明確排除 `avif` / `avis` brand）
- image-compressor：`accept` 加 HEIC、`addFiles()` 改 async 並用 queue 保序、`decodeFile()` 加分支、選「原格式」時落 JPEG 並在列上標 `HEIC → JPG`、HEIC 縮圖先放 SVG 佔位壓完再用結果補、per-item 錯誤訊息不再截斷成 40 字（改列內截斷 + `title` 完整）
- image-slicer：`state` 加 `imgW` / `imgH` 取代四處 `naturalWidth`、`loadFile()` 拆成 `loadHeic` / `loadBitmap` 並加 `loadSeq` 換檔序號防競態、HEIC 走 `previewCanvas`、`accept` 維持 `image/*` 只補 `.heic` / `.heif` 副檔名（收斂成白名單會擋掉原本能用的 SVG / BMP，屬不該有的行為變更）
- 資源限制：單張 **50 MP** 上限，檢查點在 `get_width/get_height` 之後、`display()` 之前（配置記憶體之前）
- 測試：`tests/test_heic_support.py` 守前端資產接線（模組可取得、兩頁有引用、accept 含 HEIC、AVIF 防線還在、其餘三個工具沒被順手改）

**成功標準**：iPhone `.heic` 丟進壓縮工具能壓成 JPEG 並顯示壓縮率；丟進切片工具能預覽、切割、打包 ZIP；AVIF 不被誤判；超大檔與壞檔不會拖垮整批

**狀態**：完成（Playwright 無頭實測：`isHeic` 9/9、解碼與原圖平均色差 < 5、批次 5 檔全過、56 MP 正確擋下且 heap 只漲 13 MB、切片 9 塊尺寸正確、快速換檔競態兩方向皆正確、手機 390px 與亮 / 暗模式無 regression、pytest 16 passed）

**advisor review 後補測 3 項**（第一輪全程用預設「原格式」，漏掉這些）：
1. 輸出格式標籤原本寫死 `HEIC → JPG`，切到 WEBP 後標籤沒更新、實際卻輸出 `.webp` —— 標出錯的落點，違背「不做隱形轉檔」初衷。改由 `targetCodecFor()` 推導 + 格式切換時刷新
2. `irot` 方向原本要標「未驗證」，改用手工修改 angle byte（0 → 1，即 90°）構造樣本後測得：實際像素 900×1600、libheif 輸出 1600×900，**確認有套用容器層旋轉**（iPhone 直式照片就是這個機制）
3. 「載入失敗清快取可重試」實際無效：瀏覽器 module map 會快取失敗的 import，同一 URL 不再發請求（實測請求數停在 1）。改成重試附加 `?_r=N` 換掉 specifier，實測連續三次都真的重發

## 追加決策紀錄
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-31 | 解碼器選 `libheif-js@1.19.8`，非 `heic-to` | 直接吐 RGBA 可組 `ImageData`，接上現有 `maybeResize` → `encodeImage` 管線、下游零改動；`heic-to` 只吐 PNG/JPEG Blob，會多一次無謂的編解碼 |
| 2026-07-31 | HEIC 只做輸入不做輸出；選「原格式」落 JPEG | HEVC 編碼有專利授權疑慮且相容性差，AVIF 已能替代；JPEG 是 iPhone 照片典型去向（上傳 / 寄件）最不會出錯的落點 |
| 2026-07-31 | `heic-decode.js` 用 IIFE 全域而非 ESM export | image-slicer 是普通 `<script>` 非 module；全域形式讓兩頁用同一種引入方式，且動態 `import()` 在非 module script 裡照樣可用 |
| 2026-07-31 | magic bytes 只當第三層 fallback，且先排除 avif / avis brand | AVIF 與 HEIC 共用 ISO BMFF 容器、compatible brands 都可能有 `mif1`；判斷寫鬆會把既有 AVIF 支援搶走（功能倒退） |
| 2026-07-31 | 加 50 MP 單張上限，且只套用在 HEIC 路徑 | HEIC 壓縮率遠高於 JPEG，2 MB 的檔案就可能是 56 MP、解碼後佔 224 MB；兩個工具原本都沒有任何上限。只限 HEIC 是為了不改變既有格式的行為 |
| 2026-07-31 | 範圍只做 compressor + slicer，不推 bg-remover / sticker-ai / invoice-stamp | 使用者選定；先在兩個最常吃大量照片的工具驗證真實 iPhone 檔，過了再擴散（共用模組已抽好，之後只要引用） |
| 2026-07-31 | 不加 SRI，與既有 jSquash 動態 import 一致 | `integrity` 屬性對動態 `import()` 無效；屬全站既有 gap（6 個 jSquash 包也都沒有），不在此 feature 混改 |
