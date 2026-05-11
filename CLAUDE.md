# web-toolbox

前端小工具聚合站。首頁是工具選單，每個工具一個頁面。FastAPI 提供靜態頁；圖片切片等工具純前端，pdf2jpg 走後端 API。

目前進行中的改造計畫見 `IMPLEMENTATION_PLAN.md`。

## Design System

動任何視覺 / UI 之前，先讀 `DESIGN.md`。字體、顏色、間距、版面、動態、元件慣例都定義在那裡。沒有使用者明確同意不要偏離。重點：

- 風格：Quiet Utility（亮色＝溫暖紙質 / 淺木紋，暗色＝深木紋 / 胡桃木；單一暖琥珀 accent）
- 字體：Space Grotesk（顯示）+ IBM Plex Sans（內文）+ IBM Plex Mono（技術數值）
- 亮 / 暗雙模式（`html[data-theme="dark"]`，預設跟 `prefers-color-scheme`，使用者切換後存 `localStorage`）
- 圖示一律 inline SVG 線條圖，**不使用 Emoji**
- 共用元件集中在 `static/shared/app.css`，所有頁面共用
