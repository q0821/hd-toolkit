# HD 的工具箱（hd-toolkit）

一個前端小工具的聚合站。首頁是工具選單，每個工具一個頁面，陸續增加。
能在瀏覽器裡做完的工具就不上傳檔案；只有需要伺服器的工具（PDF to JPG 的轉換、AI 貼圖生成的薄 proxy）才會送到後端，用完即丟、不留存。

## 目前有的工具

| 工具 | 路徑 | 說明 | 跑在哪 |
|---|---|---|---|
| **PDF to JPG** | `/pdf2jpg` | 把 PDF 每一頁轉成 JPG，可調解析度（DPI 72–600）與品質（1–100），打包成 ZIP 下載。 | 後端（FastAPI + poppler） |
| **圖片切片** | `/image-slicer` | 上傳圖片，選欄數（水平）與列數（垂直），切成等分小圖。最後一欄/列吃餘數、不掉邊緣像素。可選 PNG / JPG / WEBP，打包成 ZIP。檔名為 `<前綴>列-欄.png`（預設前綴 `split-` → `split-1-1.png`、`split-1-2.png`…；前綴可清空 → `1-1.png`…）。可勾「去除綠幕」，先把整張的綠幕背景去掉再切（此時格式限 PNG / WEBP）。 | 純前端（Canvas + JSZip，檔案不上傳） |
| **圖片去背** | `/bg-remover` | 去掉圖片背景，輸出透明 PNG。**綠幕模式**：純 Canvas 即時去背，自動偵測背景色、可點預覽圖手動取色，容差 / 邊緣羽化 / 去溢色可調。**AI 模式**：用 [`@imgly/background-removal`](https://github.com/imgly/background-removal-js)（`isnet_fp16` 模型）在瀏覽器跑辨識模型去任意背景，去完自動清掉背景的孤立碎屑（連通元件，只留主體 + 夠大的物件）；首次會下載模型（約 80 MB）、之後快取。**去完都能微調**：AI 模式可拉「邊緣收縮 / 羽化」（不重跑模型），兩種模式都能用「擦掉 / 還原」筆刷手動修補（可放大到 400% 精修），再下載。複雜場景（深色主體配深色雜亂背景）自動辨識效果有限，靠邊緣調整 + 筆刷補。 | 純前端（綠幕＝Canvas；AI＝瀏覽器內 WASM/ONNX，檔案都不上傳） |
| **圖片壓縮** | `/image-compressor` | 批次壓縮圖片：JPEG / PNG / WEBP / AVIF 互轉、可調品質（JPEG/WEBP/AVIF；PNG 走 oxipng 無損最佳化）、可縮放（寬度 / 高度 / 長邊 / 短邊 / 比例，皆等比例）。每張顯示原大小 → 壓縮後大小與壓縮率，可個別或全部打包 ZIP 下載。選項與互動參考自 [pic-smaller](https://github.com/joye61/pic-smaller)（MIT）；壓縮由 [jSquash](https://github.com/jamsinclair/jsquash) WASM codec（mozjpeg / oxipng / libwebp / libavif）提供，首次使用會下載 codec、之後快取。 | 純前端（瀏覽器內 WASM codec + JSZip，檔案不上傳） |
| **AI 貼圖生成** | `/sticker-ai` | 上傳一張參考照（可選）→ 選風格 → 列好「表情 / 動作」清單（一條 = 一張貼圖）→ AI 逐張生圖 → 自動去背（預設「請 AI 畫純綠底 + 內建去綠」最穩，也可選模型透明 / 不處理）→ 縮到 LINE 尺寸（≤ 370×320 偶數 / 或正方形 320、可設留白、可用 Canvas 疊標題）→ 用第 1 張生 `main.png` / `tab.png` → 打包 ZIP。串 **OpenAI**（`gpt-image-2` 最新 / `gpt-image-1` 系，`/v1/images/generations` 或 `/v1/images/edits`）或 **Google**（`gemini-2.5-flash-image` Nano Banana / `gemini-3-pro-image-preview` Nano Banana Pro）；API key 只存在你的瀏覽器 `localStorage`，請求經本站薄 proxy 轉給 AI 服務、用完即丟、不留存。生圖要錢、用你自己的 key。 | 前端 + 薄後端 proxy（`/api/sticker-ai/generate`，httpx）；圖片在瀏覽器後處理（chroma-key + JSZip） |

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
    │   └── chroma-key.js       # 綠幕去背（純前端 Canvas）— image-slicer / bg-remover / sticker-ai 共用
    ├── pdf2jpg/index.html
    ├── image-slicer/index.html
    ├── bg-remover/index.html
    ├── image-compressor/index.html
    └── sticker-ai/index.html
```

> 第三方致謝：圖片壓縮工具的選項 / 互動參考自 [pic-smaller](https://github.com/joye61/pic-smaller)（MIT），壓縮實作改用 [jSquash](https://github.com/jamsinclair/jsquash) WASM codec（CDN 載入）；圖片去背的 AI 模式用 [`@imgly/background-removal`](https://github.com/imgly/background-removal-js)；ZIP 打包用 [JSZip](https://stuk.github.io/jszip/)。

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
