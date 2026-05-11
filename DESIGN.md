# Design System — hd-toolkit

> 全站唯一的設計依據。動任何視覺 / UI 之前先讀這份。字體、顏色、間距、版面、動態都定義在這裡。沒有使用者明確同意不要偏離。

## Product Context
- **What this is:** 前端小工具聚合站。首頁是工具選單，每個工具一個頁面。目前有 PDF to JPG、圖片切片工具，未來持續新增。
- **顯示名稱:** 「HD 的工具箱」（header 字標、頁面 `<title>`、footer、首頁 hero 均使用）；`hd-toolkit` 僅作 repo / 資料夾代號。
- **Who it's for:** 需要快速完成單一檔案 / 圖片處理的人；偏技術但也給一般使用者。
- **Space/industry:** 開發者 / 通用線上工具（同類：it-tools、10015.io、transform.tools、omatsuri）。
- **Project type:** 多工具靜態網站（FastAPI 提供靜態頁；圖片切片等工具純前端，pdf2jpg 走後端 API）。
- **技術限制:** 純 HTML/CSS，無前端框架；Google Fonts 可用；圖示一律 inline SVG，**不使用 Emoji**。

## Aesthetic Direction
- **Direction:** Quiet Utility — 精煉的實用主義 / 瑞士平面風。
- **Decoration level:** minimal → intentional（髮絲線分隔、留白、可選極淡點陣背景；無漸層、無 blob、無發光）。
- **Mood:** 冷靜、俐落、值得信任的工具。工具本身是主角，介面退到背後。
- **刻意的差異化（vs 同類站的「Inter + 藍 + 卡片」預設）:** ① 暖琥珀 accent（極少 dev-tool 站用）；② Space Grotesk 顯示字體給工具名個性；③ 收斂的版面 + 髮絲線取代厚重卡片陰影。
- **刻意維持的同類慣例:** 卡片牆首頁、左控制 / 右預覽的工具版面、亮/暗模式切換。

## Light / Dark Mode
- 兩種模式皆為一等公民。`:root` 放亮色變數，`html[data-theme="dark"]` 覆寫。
- 預設跟隨 `prefers-color-scheme`；使用者點 header 的切換鈕（太陽 / 月亮 SVG）後寫入 `localStorage('toolbox-theme')` 並覆蓋系統設定。
- **刻意走「暖紙 ↔ 暖木」的雙態調性**（使用者偏好）：亮色＝溫暖紙質 / 淺木紋（暖米底、暖白卡片、暖近黑文字，不要冷灰）；暗色＝深木紋 / 胡桃木（飽和暖棕底，不要冷藍黑或純灰黑）。雖然是工具站，但要有手感、不冷冰冰。暖琥珀 accent 在兩種模式都同屬暖色家族 — 紙上像印泥、深木上像黃銅。
- 暗色模式原則：底色用**深木紋 / 胡桃木褐**（飽和的暖棕，非純黑、非冷藍黑、也非純灰）；層次靠「同色相、不同明度的木色」堆疊（bg → surface → surface-2 各差約 10–14 明度），邊框用更亮的木色而非半透明白；accent（暖琥珀）在深木上像黃銅 / 木頭刻字，提高明度、略降飽和；陰影幾乎不可見，靠邊框與表面層次表現。
- 尊重 `prefers-reduced-motion: reduce` → 關閉非必要動畫。

## Typography
- **Display / 工具名 / 大標:** Space Grotesk（500 / 600 / 700）— 幾何感、有個性，避開被用爛的字體。
- **Body / 介面 / 內文:** IBM Plex Sans（400 / 500 / 600）。
- **技術數值 / 檔名 / px / kbd / 程式碼:** IBM Plex Mono（400 / 500）。
- **載入:** Google Fonts —
  `https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap`
  （搭配 `<link rel="preconnect" href="https://fonts.googleapis.com">` 與 `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`）
- **字級 scale（px / line-height）:**
  | token | size | line-height | 典型用途 |
  |---|---|---|---|
  | `--text-xs` | 12 | 16 | 標籤、輔助說明、slider 兩端提示 |
  | `--text-sm` | 14 | 20 | 介面文字、卡片說明、表單 label |
  | `--text-base` | 16 | 24 | 內文 |
  | `--text-lg` | 18 | 28 | 區塊小標 |
  | `--text-xl` | 20 | 28 | 卡片標題（工具名，Space Grotesk 600）|
  | `--text-2xl` | 24 | 32 | 工具頁標題（Space Grotesk 600）|
  | `--text-3xl` | 30 | 36 | 次要 hero |
  | `--text-4xl` | 36 | 40 | 首頁 hero（Space Grotesk 700）|
- **字距:** Space Grotesk 大標 `letter-spacing: -0.02em`；IBM Plex Mono 當標籤時可 `+0.01em`；其餘預設。
- **中英之間留半形空白**（內容撰寫規範，非 CSS）。

## Color

### 中性（Neutrals — 亮色＝暖紙 / 淺木紋，暗色＝深木紋 / 胡桃木）
| token | Light（暖紙質） | Dark（深木紋） | 用途 |
|---|---|---|---|
| `--bg` | `#f4ecdc` | `#231a11` | 頁面底色（亮：暖米色 / 淺木 ｜ 暗：深胡桃木） |
| `--surface` | `#fdf9ef` | `#2e2417` | 卡片 / 面板 / header（亮：暖白 ｜ 暗：上層木色） |
| `--surface-2` | `#efe5d0` | `#392e1d` | 輸入框底、hover、步進器格 |
| `--surface-3` | `#e5d8bd` | `#453823` | active / pressed |
| `--border` | `#e2d6bd` | `#493a26` | 一般邊框、髮絲線分隔 |
| `--border-strong` | `#cdbf9f` | `#5c4a31` | 拖放區虛線框、強調分隔 |
| `--text` | `#2b241a` | `#ede3cf` | 主要文字（亮：暖近黑帶褐 ｜ 暗：暖米白，像深木上的紙） |
| `--text-muted` | `#7c705c` | `#b3a586` | 次要文字、label、說明 |
| `--text-dim` | `#a89a7e` | `#8a7a5b` | placeholder、提示、disabled 文字 |

### Accent（暖琥珀 / 赭黃 — 全站唯一彩色，用得很省）
| token | Light | Dark | 用途 |
|---|---|---|---|
| `--accent` | `#b45309` | `#f59e0b` | 主要按鈕底、active 狀態、連結、slider 填充、focus 來源色 |
| `--accent-hover` | `#92400e` | `#fbbf24` | 上述元素 hover |
| `--accent-fg` | `#fdf9ef` | `#231a11` | 疊在 accent 填充上的文字 / 圖示色（亮：暖白 ｜ 暗：深木底色，琥珀上的深褐字像木頭上的黃銅刻字） |
| `--accent-subtle` | `#f7ecd2` | `rgba(245,158,11,0.12)` | accent 染色的淡背景（hover 卡片、selected chip 底） |
| `--accent-border` | `#e3c277` | `rgba(245,158,11,0.35)` | accent 染色的邊框 |
| `--focus-ring` | `rgba(180,83,9,0.35)` | `rgba(245,158,11,0.40)` | `:focus-visible` 外環（3px） |

### 語意色（Semantic）
| token | Light | Dark | 淡背景 Light / Dark |
|---|---|---|---|
| `--success` | `#15803d` | `#22c55e` | `#eef4e4` / `rgba(34,197,94,0.12)` |
| `--warning` | `#c2410c` | `#fb923c` | `#f9ecdc` / `rgba(251,146,60,0.12)` |
| `--error` | `#b91c1c` | `#ef4444` | `#f6e6df` / `rgba(239,68,68,0.12)` |
| `--info` | `#1d4ed8` | `#3b82f6` | `#e6ecdf` / `rgba(59,130,246,0.12)` |
（error 故意挑純紅，跟暖琥珀 accent 拉開；warning 挑偏橘的 orange，避免和 accent 混淆；亮色模式的語意色與淡背景都往暖紙底微調，不要冷色塊。）

### 陰影
- Light：用暖褐色而非純黑當陰影色。`--shadow-sm: 0 1px 2px rgba(60,46,24,.08)`；`--shadow-md: 0 2px 8px rgba(60,46,24,.07), 0 12px 28px rgba(60,46,24,.06)`
- Dark：陰影幾乎不可見，改用 `--border` 提亮表現層次；若需要 `--shadow-md: 0 2px 16px rgba(0,0,0,.4)`（很淡）

## Spacing
- **Base unit:** 4px
- **Density:** comfortable（不擁擠也不空曠）
- **Scale:** `--space-1:4` `--space-2:8` `--space-3:12` `--space-4:16` `--space-6:24` `--space-8:32` `--space-12:48` `--space-16:64`（px）

## Layout
- **Approach:** grid-disciplined（嚴格欄、可預期對齊）；只有預覽區允許自由比例。
- **Max content width:** 首頁卡片牆 `1040px`；單欄工具頁卡片 `560px`；左右分割工具頁不設總寬上限，但控制欄固定 `clamp(380px, 32vw, 480px)`。
- **首頁卡片牆:** 1 欄（< 640px）/ 2 欄（640–959px）/ 3 欄（≥ 960px），`gap: var(--space-4)`。
- **工具頁 header:** sticky、底部 `1px var(--border)`；左：「HD 的工具箱」字標（Space Grotesk 600，連回 `/`）+ `/` + 目前工具名（`--text-muted`）；右：亮/暗切換鈕。
- **左右分割工具頁:** `display:flex`；左 `.tool-controls`（固定寬，內距 `--space-6`）；中 `1px var(--border)` 直線；右 `.tool-preview`（flex:1，置中內容）。`< 880px` 改 `flex-direction:column`，分隔線改水平。
- **Border radius（階層化，禁止全部一樣的 bubbly）:** `--radius-sm:8px`（按鈕、輸入框、步進器、方形 chip）/ `--radius-md:12px`（卡片、面板、拖放區）/ `--radius-lg:16px`（大容器）/ `--radius-full:9999px`（pill、avatar、圓 chip）

## Motion
- **Approach:** minimal-functional + 一點 intentional（hover/focus 回饋、面板與訊息進場）。不做 scroll 視差、不做裝飾性循環動畫。
- **Easing:** enter `cubic-bezier(0.16,1,0.3,1)`；exit `cubic-bezier(0.4,0,1,1)`；move `cubic-bezier(0.4,0,0.2,1)`
- **Duration:** micro `100ms`（顏色/邊框）；short `150ms`（hover、按鈕）；base `200ms`（卡片 hover lift、theme 切換）；medium `300ms`（面板/訊息進場、進度條）
- **Transition 屬性白名單:** `color, background-color, border-color, box-shadow, transform, opacity`（不要 `transition: all`）
- `@media (prefers-reduced-motion: reduce)` → 動畫時間設 `0.01ms`、移除 transform 位移。

## Iconography
- 一律 inline SVG 線條圖：`stroke="currentColor"`、`stroke-width="1.5"`、`fill="none"`、`stroke-linecap="round"`、`stroke-linejoin="round"`、預設 `width/height: 20px`（卡片用 24px）。風格參照 Lucide / Feather。
- 需要的圖示：`file-text`（pdf2jpg）、`grid` 或 `scissors`（圖片切片）、`upload`、`download`、`sun`、`moon`、`x-circle`（error）、`check-circle`（success）、`arrow-left`（回首頁）、`plus`（更多工具）、`minus`（步進器 −）。
- **絕對不用 Emoji。**

## Component Conventions（給 static/shared/app.css 實作）
- `.app-shell` 整頁外框；`.app-header` / `.app-footer`；`.theme-toggle`（圖示按鈕）
- `.tool-layout` / `.tool-controls` / `.tool-preview`（左右分割）
- `.section` + `.section-label`（區塊小標，可選編號）
- `.dropzone`（虛線 `--border-strong`，含 SVG + 主/次文；dragover → 實線 `--accent` + `--accent-subtle` 底）
- `.stepper`（`[ − 值 + ]`，外框 `--surface-2`，達上下限對應鈕 disabled）
- `.segmented`（一排按鈕；未選 `--surface-2` + `--text-muted` + `--border`；選中 `--accent` 底 + `--accent-fg` 字）
- `.range`（細軌 `--surface-2`，已填與 thumb 用 `--accent`；數值用 `--accent` + IBM Plex Mono）
- `.text-field`（`--surface-2` 底、`--border` 框、focus → `--accent` 框 + `--focus-ring`）
- `.btn-primary`（滿寬，`--accent` 底、`--accent-fg` 字；hover → `--accent-hover`；disabled → `--surface-2` 底 + `--text-dim` 字）
- `.btn-secondary`（`--surface` 底、`--border` 框、`--text` 字；hover → `--surface-2`）
- `.btn-ghost`（透明底、無邊框、`--text-muted` 字；hover → `--surface-2`）
- `.message.error` / `.message.success`（對應語意色 + 淡背景 + 左側 SVG）
- `.progress`（細軌 + `--accent` 進度條，pdf2jpg 用）
- `.tool-card`（首頁卡片：`--surface` 底、`--border` 框、`--radius-md`；hover → `--accent-border` 框 + `translateY(-2px)` + 圖示轉 `--accent`；整張 `<a>` 可點）
- `.chip`（檔名 / 標籤；`--radius-full` 或 `--radius-sm`）
- `.preview-empty`（預覽空狀態：置中 SVG + `--text-dim` 提示文）
- 所有互動元素都要有 `:hover` / `:focus-visible` / `[disabled]` 狀態；`:focus-visible` 用 `box-shadow: 0 0 0 3px var(--focus-ring)`。

## AI Slop 黑名單（本專案禁止）
紫色漸層 accent、三欄彩色圓圈圖示牆、全部置中且間距一致、所有元素同一個 bubbly 圓角、漸層按鈕當主 CTA、Emoji 當圖示、`transition: all`、Inter / Roboto / Open Sans 當主字體。

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-11 | 建立 hd-toolkit 設計系統（Quiet Utility，暖琥珀 accent，Space Grotesk + IBM Plex Sans + IBM Plex Mono，亮/暗雙模式，無 Emoji） | 由 /design-consultation 產出；定位為「安靜的工具感」，刻意避開同類站的 Inter+藍+卡片預設長相 |
| 2026-05-11 | 沿用並收斂 pdf2jpg 既有的暖色調傾向，但改用暖琥珀而非原本的 vermillion | 暖琥珀和 error 紅完全不撞色、亮暗模式都穩；vermillion 與 error 紅太接近 |
| 2026-05-11 | 亮色＝溫暖紙質 / 淺木紋（暖米底 `#f4ecdc` + 暖白卡片 `#fdf9ef` + 暖近黑文字 `#2b241a`），暗色＝深木紋 / 胡桃木（深暖棕底 `#231a11` + 上層木色卡片 `#2e2417` + 暖米白文字 `#ede3cf`），都不用冷白 / 冷灰 / 冷藍黑 | 使用者個人偏好；雖是工具站但希望有手感、溫暖。暖琥珀 accent 在紙上像印泥、在深木上像黃銅刻字，兩態都相襯 |
