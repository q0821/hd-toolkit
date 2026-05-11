# HD 的工具箱（hd-toolkit）

一個前端小工具的聚合站。首頁是工具選單，每個工具一個頁面，陸續增加。
能在瀏覽器裡做完的工具就不上傳檔案；只有需要伺服器的工具（目前是 PDF to JPG）才會送到後端，轉完即丟、不留存。

## 目前有的工具

| 工具 | 路徑 | 說明 | 跑在哪 |
|---|---|---|---|
| **PDF to JPG** | `/pdf2jpg` | 把 PDF 每一頁轉成 JPG，可調解析度（DPI 72–600）與品質（1–100），打包成 ZIP 下載。 | 後端（FastAPI + poppler） |
| **圖片切片** | `/image-slicer` | 上傳圖片，選欄數（水平）與列數（垂直），切成等分小圖。最後一欄/列吃餘數、不掉邊緣像素。可選 PNG / JPG / WEBP，打包成 ZIP。檔名為 `<前綴>列-欄.png`（預設前綴 `split-` → `split-1-1.png`、`split-1-2.png`…；前綴可清空 → `1-1.png`…）。 | 純前端（Canvas + JSZip，檔案不上傳） |

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
│       └── pdf2jpg.py          # pdf2jpg 後端 router（/api/pdf2jpg/convert）
└── static/
    ├── index.html              # 首頁：工具選單
    ├── shared/
    │   ├── app.css             # 全站設計系統 + 共用元件
    │   └── theme.js            # 亮 / 暗模式切換
    ├── pdf2jpg/index.html
    └── image-slicer/index.html
```

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
