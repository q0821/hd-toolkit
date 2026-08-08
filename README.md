# HD 的工具箱（hd-toolkit）

一個前端小工具的聚合站。首頁是工具選單，每個工具一個頁面，陸續增加。
能在瀏覽器裡做完的工具就不上傳檔案；只有需要伺服器的工具（PDF to JPG 的轉換、AI 貼圖生成的薄 proxy）才會送到後端，用完即丟、不留存。

## 目前有的工具

| 工具 | 路徑 | 說明 | 跑在哪 |
|---|---|---|---|
| **PDF to JPG** | `/pdf2jpg` | 把 PDF 每一頁轉成 JPG，可調解析度（DPI 72–600）與品質（1–100），打包成 ZIP 下載。 | 後端（FastAPI + poppler） |
| **圖片切片** | `/image-slicer` | 上傳圖片，選欄數（水平）與列數（垂直），切成等分小圖。最後一欄/列吃餘數、不掉邊緣像素。可選 PNG / JPG / WEBP，打包成 ZIP。**吃得下 iPhone 的 `.heic` 照片**（瀏覽器內解碼，見下方圖片壓縮的說明）。檔名為 `<前綴>列-欄.png`（預設前綴 `split-` → `split-1-1.png`、`split-1-2.png`…；前綴可清空 → `1-1.png`…）。可勾「去除綠幕」，先把整張的綠幕背景去掉再切（此時格式限 PNG / WEBP）。 | 純前端（Canvas + JSZip，檔案不上傳） |
| **圖片去背** | `/bg-remover` | 去掉圖片背景，輸出透明 PNG。**綠幕模式**：純 Canvas 即時去背，自動偵測背景色、可點預覽圖手動取色，容差 / 邊緣羽化 / 去溢色可調。**AI 模式**：用 [`@imgly/background-removal`](https://github.com/imgly/background-removal-js)（`isnet_fp16` 模型）在瀏覽器跑辨識模型去任意背景，去完自動清掉背景的孤立碎屑（連通元件，只留主體 + 夠大的物件）；首次會下載模型（約 80 MB）、之後快取。**去完都能微調**：AI 模式可拉「邊緣收縮 / 羽化」（不重跑模型），兩種模式都能用「擦掉 / 還原」筆刷手動修補（可放大到 400% 精修），再下載。複雜場景（深色主體配深色雜亂背景）自動辨識效果有限，靠邊緣調整 + 筆刷補。 | 純前端（綠幕＝Canvas；AI＝瀏覽器內 WASM/ONNX，檔案都不上傳） |
| **圖片壓縮** | `/image-compressor` | 批次壓縮圖片：JPEG / PNG / WEBP / AVIF 互轉、可調品質（JPEG/WEBP/AVIF；PNG 走 oxipng 無損最佳化）、可縮放（寬度 / 高度 / 長邊 / 短邊 / 比例，皆等比例）。每張顯示原大小 → 壓縮後大小與壓縮率，可個別或全部打包 ZIP 下載。選項與互動參考自 [pic-smaller](https://github.com/joye61/pic-smaller)（MIT）；壓縮由 [jSquash](https://github.com/jamsinclair/jsquash) WASM codec（mozjpeg / oxipng / libwebp / libavif）提供，首次使用會下載 codec、之後快取。**也吃 iPhone 的 `.heic`**：用 [libheif-js](https://github.com/catdad-experiments/libheif-js)（LGPL-3.0）在瀏覽器內解碼，選「原格式」時輸出 JPEG（不做 HEIC 輸出，HEVC 編碼有專利授權疑慮且相容性差）。解碼器約 1.46 MB，丟 HEIC 進來才會下載。單張像素上限 50 MP。 | 純前端（瀏覽器內 WASM codec + JSZip，檔案不上傳） |
| **AI 貼圖生成** | `/sticker-ai` | 提供兩種流程。**快速做一組貼圖**需要一張主要／正面參考圖，也可加入其餘四個角度提高單批一致性。**建立可重用角色**同樣只要求主要／正面照片，其餘角度選填；介面會依一張、二至四張或五張素材顯示基礎、較佳或最佳一致性。先產生並確認角色定稿圖；一般批次只送定稿圖以降低圖片輸入成本，角色明顯漂移時可針對單張使用「嚴格參考重生」，額外附上目前已有的原始角度。角色可匯出為 `.hd-character.zip`，包含 `manifest.json`、定稿圖與實際已上傳的正規化參考圖，不含 API key；之後可匯入繼續生成。貼圖文字可選「讓 AI 畫文字」或「不產生文字」，AI 文字支援整批字體風格與最多兩段內容，排版位置由模型依構圖決定。結果預設以純綠底生成並在瀏覽器去背，也可選模型透明或不處理，再縮到 LINE 尺寸、產生 `main.png` / `tab.png` 並打包 ZIP。串接 **OpenAI**（預設目前最新的 `gpt-image-2`，也可選固定快照）或 **Google**（`gemini-3-pro-image-preview`、`gemini-3.1-flash-image-preview`、`gemini-2.5-flash-image`）；API key 只存在瀏覽器 `localStorage`，請求經本站薄 proxy 轉給 AI 服務後即丟棄。 | 前端 + 薄後端 proxy（`/api/sticker-ai/generate`，httpx）；圖片在瀏覽器正規化與後處理（Canvas + chroma-key + JSZip） |
| **發票章加蓋** | `/invoice-stamp` | 在 PDF 上加蓋發票章。上傳 PDF（pdf.js 渲染各頁、左側縮圖列表可切頁）+ 大 / 小章兩張章圖（PNG 建議去背 / JPG），章屬性區的「使用」segmented 切換放哪一張，點 PDF 頁面以點擊點為中心放章；可拖曳調位置，三條滑桿改大小（30–400 px）/ 旋轉（−180°~+180°）/ 透明度（10–100 %）；選取章顯示虛框 + 刪除鈕。多頁各自蓋章互不影響。**騎縫章模式**：大章 + 小章兩張都上傳後勾啟用，大 / 小章 Y 位置可獨立調整（預設大章上 30% / 小章下 70%）、章高度與透明度共用 → 把兩張章各自切成 N 等分（N = 頁數）、每頁右邊放大 + 小兩片切片，列印後右邊對齊堆疊可拼回完整章；每片預設隨機傾斜 ±2°（模擬手蓋章，可關閉 / 重新隨機），預覽看到什麼就是匯出結果。匯出走 [pdf-lib](https://pdf-lib.js.org/) 把所有章合成回原始 PDF（保留章圖透明通道、座標 / 角度 / 透明度與預覽一致），下載 `stamped_<原檔名>.pdf`。v1.0 限制：不支援加密 PDF / SVG / WebP 章圖、無 Undo / Redo、觸控操作未最佳化。 | 純前端（pdf.js + pdf-lib，檔案不上傳） |

## 技術棧

- **後端**：FastAPI + Uvicorn（提供靜態頁面，以及 pdf2jpg 的轉換 API）
- **PDF 處理**：pdf2image + poppler（系統套件）
- **前端**：純手刻 HTML / CSS / JS，無框架
- **設計系統**：見 [`DESIGN.md`](DESIGN.md)。Quiet Utility 風格、亮（暖紙質）/ 暗（深木紋）雙模式、共用樣式集中在 `static/shared/app.css`、圖示全為 inline SVG（不用 emoji）

## 目錄結構

```
hd-toolkit/
├── main.py                     # FastAPI app：掛 router、掛靜態目錄、工具頁面路由
├── requirements.txt
├── Dockerfile                  # python:3.11-slim + poppler-utils，跑在 8080
├── DESIGN.md                   # 設計系統（顏色 / 字體 / 元件規範）
├── CLAUDE.md                   # 給 AI 助理的專案說明
├── app/
│   └── tools/
│       ├── pdf2jpg.py          # pdf2jpg 後端 router（/api/pdf2jpg/convert）
│       └── sticker_ai.py       # AI 貼圖薄 proxy（/api/sticker-ai/generate）— 轉 key、不存不 log
└── static/
    ├── index.html              # 首頁：工具選單
    ├── shared/
    │   ├── app.css             # 全站設計系統 + 共用元件
    │   ├── theme.js            # 亮 / 暗模式切換
    │   ├── settings.js         # 站台設定面板（API keys）— 每頁載入，header 注入齒輪
    │   ├── chroma-key.js       # 綠幕去背（純前端 Canvas）— image-slicer / bg-remover / sticker-ai 共用
    │   └── heic-decode.js      # HEIC / HEIF 解碼（libheif WASM，用到才載）— image-compressor / image-slicer 共用
    ├── pdf2jpg/index.html
    ├── image-slicer/index.html
    ├── bg-remover/index.html
    ├── image-compressor/index.html
    ├── sticker-ai/index.html
    └── invoice-stamp/index.html
```

> 第三方致謝：圖片壓縮工具的選項 / 互動參考自 [pic-smaller](https://github.com/joye61/pic-smaller)（MIT），壓縮實作改用 [jSquash](https://github.com/jamsinclair/jsquash) WASM codec（CDN 載入）；HEIC / HEIF 解碼用 [libheif-js](https://github.com/catdad-experiments/libheif-js)（LGPL-3.0，CDN 動態載入未修改的發行版）；圖片去背的 AI 模式用 [`@imgly/background-removal`](https://github.com/imgly/background-removal-js)；發票章加蓋的 PDF 渲染用 [pdf.js](https://mozilla.github.io/pdf.js/)、合成輸出用 [pdf-lib](https://pdf-lib.js.org/)；ZIP 打包用 [JSZip](https://stuk.github.io/jszip/)。

## 本機執行

### 1. 安裝 poppler（pdf2jpg 需要）

```bash
# macOS
brew install poppler
# Ubuntu / Debian
sudo apt-get install poppler-utils
```

### 2. 安裝 Python 依賴

```bash
pip install -r requirements.txt
```

### 3. 啟動

```bash
uvicorn main:app --reload
# 或指定 host / port
uvicorn main:app --host 0.0.0.0 --port 8080
```

開 http://localhost:8000 （或你指定的 port）。API 文件在 `/docs`。

## API

### `POST /api/pdf2jpg/convert`

把 PDF 轉成 JPG 並打包成 ZIP。

| 參數 | 類型 | 預設 | 說明 |
|---|---|---|---|
| `file` | File | （必填） | PDF 檔案 |
| `dpi` | int | 150 | 解析度 (72–600) |
| `quality` | int | 85 | JPG 品質 (1–100) |

回應：成功為 `application/zip`；失敗為 JSON 錯誤訊息。

```bash
curl -X POST "http://localhost:8000/api/pdf2jpg/convert" \
  -F "file=@document.pdf" -F "dpi=300" -F "quality=90" -o output.zip
```

> 舊路徑 `POST /api/convert`（pdf2jpg 還是單一工具時用的）仍保留為相容別名，但不顯示在 `/docs`，未來會移除。新程式請用 `/api/pdf2jpg/convert`。

### `GET /api/health`

健康檢查，回 `{"status": "ok"}`。

## 部署（Docker / Zeabur）

`Dockerfile` 已含 poppler，容器跑在 8080：

```bash
docker build -t hd-toolkit .
docker run -p 8080:8080 hd-toolkit
```

Zeabur 直接連這個 repo 即可，會自動用根目錄的 `Dockerfile`。

## 加新工具

1. 純前端工具：在 `static/<工具slug>/index.html` 放頁面（引用 `/static/shared/app.css` 與 `/static/shared/theme.js`，沿用 `.app-header` / `.tool-layout` / `.section` 等共用元件），在 `main.py` 加一條 `GET /<工具slug>` 路由，在 `static/index.html` 加一張 `.tool-card`。
2. 需要後端的工具：在 `app/tools/<工具>.py` 寫一個 `APIRouter`，在 `main.py` `include_router`，其餘同上。
3. 視覺一律照 `DESIGN.md`，不要自己另開風格。

## 授權

MIT License

## 作者

Jackie Yeh
