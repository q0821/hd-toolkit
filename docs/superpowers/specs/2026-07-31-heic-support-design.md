# HEIC / HEIF 輸入支援 — 設計文件

- 日期：2026-07-31
- 影響工具：`image-compressor`、`image-slicer`
- 新增共用模組：`static/shared/heic-decode.js`

## 目標

讓 iPhone 拍的 `.heic` 照片可以直接丟進圖片壓縮與圖片切片兩個工具，不必先用其他軟體轉檔。

現況：兩個工具都無法處理 HEIC。

- `image-compressor` 的白名單 `SUPPORTED`（`static/image-compressor/index.html:189`）只有 `image/jpeg`、`image/png`、`image/webp`、`image/avif`，HEIC 在加檔階段就被歸入 `rejected`（同檔 `:335-336`），根本進不到壓縮流程。
- `image-slicer` 的 `accept` 雖然寫 `image/*`（`static/image-slicer/index.html:69`），但它靠 `new Image()` 解碼（同檔 `:322-335`），Chrome / Firefox 不支援 HEIC，會走 `img.onerror`。

補充一個容易誤判的現象：從 iOS **照片圖庫**選檔時，因為 `accept` 清單含 `image/jpeg`，iOS 通常會在上傳前自行把 HEIC 轉成 JPEG，所以「有時候好像可以用」。但從**檔案 App**、或 Mac 上拷出來的 `.heic` 就會原樣送進來並失敗。這次要修的是後者。

## 非目標 / Non-scope（YAGNI，明確不做）

- **不做 HEIC 輸出**。HEVC 編碼有專利授權疑慮，且相容性差；同容器家族的 AVIF 已能提供等效壓縮率，輸出端維持現有四種格式。
- **不保留 EXIF metadata**（拍攝時間、鏡頭、GPS）。jSquash 的 encode 本來就不寫入 EXIF，現有的 JPEG → JPEG 壓縮同樣會掉，不是這次引入的新行為。**但影像方向（orientation）必須正確**，見「驗證」第 2 項。
- **不加 SRI**。`integrity` 屬性對動態 `import()` 無效，現有 6 個 jSquash 包也都沒有 SRI。這是既有的全站 gap，不在這個 feature 裡順手改。
- **不動 bg-remover / sticker-ai / invoice-stamp**。這三個工具的 `accept` 同樣不含 HEIC，但流程差異大（imgly WASM、後端 API、pdf-lib），留待這次驗證過後再推。
- 不重構無關程式碼、不動 `DESIGN.md`、不改視覺風格。
- 不 deploy、不 push（實作完成後由使用者決定收尾）。

橫向 concern 的完整 checklist 見 `2026-07-31-heic-support-preflight.md`。

## 解碼器選型

`libheif-js@1.19.8`（[catdad-experiments/libheif-js](https://github.com/catdad-experiments/libheif-js)），libheif 的 Emscripten 發行版。

| 項目 | 值 |
|------|-----|
| 引入 URL | `https://cdn.jsdelivr.net/npm/libheif-js@1.19.8/libheif-wasm/libheif-bundle.mjs` |
| 體積 | 1,461,926 bytes（約 1.46 MB，wasm 已 base64 內嵌，單一檔無 side-loading） |
| 授權 | LGPL-3.0 |
| 相依 | 無 |
| 輸出 | RGBA，可直接組成 `ImageData` |

選它的理由：

1. **輸出格式正好接得上現有管線**。`image.display()` 吐 RGBA，包成 `ImageData` 後可直接餵進 image-compressor 現有的 `maybeResize()` → `encodeImage()`，下游一行都不用改。
2. **單檔 ESM，無 build step**。wasm 內嵌在 mjs 裡，符合本專案「純手刻、無框架、無 build」的原則，也跟 jSquash 的 `?module` 動態 import 同一套路。
3. **體積可接受**。1.46 MB（gzip 後約 7 到 8 百 KB），遠低於 bg-remover 的 80 MB 模型，而且是 lazy load，沒人丟 HEIC 就完全不會下載。

考慮過但未採用的 `heic-to@1.5.2`：API 較高階（直接吐 PNG / JPEG Blob），但那會逼我們多做一次無謂的 PNG 編碼再解碼才能拿到 `ImageData`，慢且耗記憶體。

**LGPL-3.0 合規**：我們透過 CDN 動態 import 未經修改的發行版，未靜態連結、未修改原始碼，使用者可自行替換版本，符合 LGPL 的動態連結條件。README 與頁尾需標註授權與來源。

## 架構

新增 `static/shared/heic-decode.js`，位置與角色比照既有的 `static/shared/chroma-key.js`（同樣是兩個工具共用的影像處理模組），並沿用它的 **IIFE 全域**形式而非 ESM export：image-slicer 是普通 `<script>`（非 module），全域物件讓兩頁用同一種引入方式。動態 `import()` 是表達式，在非 module script 裡一樣能用，所以模組內部照樣能 lazy load libheif 的 ESM。

```
static/shared/heic-decode.js  （IIFE，掛 window.HeicDecode）
├── isHeic(file)              → Promise<boolean>    三層判斷，見下節
├── decodeToImageData(buf)    → Promise<ImageData>  compressor 用（直接接 jSquash）
├── decodeToCanvas(buf)       → Promise<canvas>     slicer 用
├── preload()                 → Promise             載入回饋用的暖機
└── MAX_PIXELS                                       單張像素上限
```

模組內以 module-level promise 快取 libheif 的 import 與 factory 實例，重複呼叫只載入一次，與 image-compressor 現有的 `getCodec()` 快取策略一致。

資料流（兩個工具共用同一段）：

```
File → arrayBuffer() → isHeic? ──否──→ 各工具既有路徑（jSquash decode / new Image()）
                          │
                          是
                          ▼
              lazy import libheif-bundle.mjs（首次約 1.46 MB）
                          ▼
              new libheif.HeifDecoder().decode(uint8)
                          ▼
              image.display(new ImageData(w, h), cb) → ImageData
                          ▼
     compressor: maybeResize → encodeImage → Blob
     slicer:     putImageData 進 canvas → 當作 state.img
```

`decodeFile()` 只多一行分支，`maybeResize` / `encodeImage` / 切片 / ZIP 等下游一律不動 —— 這是選 libheif-js 而非 heic-to 換來的好處。

## `isHeic()` 的三層判斷

依序嘗試，前一層有結論就不進下一層：

1. **MIME**：`image/heic`、`image/heif`、`image/heic-sequence`、`image/heif-sequence`
2. **副檔名**：`.heic`、`.heif`（Windows 版 Chrome 對 HEIC 常回空字串 `f.type`，這層是主要救援）
3. **Magic bytes**（僅在前兩層皆無結論時啟用）：讀前 12 bytes，bytes 4-8 必須是 `ftyp`，再看 bytes 8-12 的 major brand

### AVIF 誤判是本設計最主要的 regression 風險

AVIF 與 HEIC 都是 ISO BMFF 容器，`ftyp` box 的 compatible brands 都可能出現 `mif1`。若第 3 層寫得太鬆，**現有可正常運作的 AVIF 會被判成 HEIC、改走 libheif 解碼**，屬於功能倒退。

防線：

- 第 3 層只在 MIME 為空、副檔名也無結論時才啟用（正常的 AVIF 檔 MIME 是 `image/avif`，走不到這層）
- major brand 為 `avif` / `avis` 時**明確回傳 false**，優先於任何 HEIC brand 判斷
- 接受的 HEIC major brand：`heic`、`heix`、`hevc`、`hevx`、`heim`、`heis`、`hevm`、`hevs`、`mif1`、`msf1`

這條會寫成明確的驗證案例（見「驗證」第 3 項）。

## `image-compressor` 的改動

| 位置 | 改動 |
|------|------|
| `:88` `accept` | 加 `image/heic,image/heif,.heic,.heif` |
| `:189` `SUPPORTED` | **維持不動**。它的語意是「jSquash 可直接解碼的 MIME」，HEIC 走獨立分支，不混進同一張表 |
| `:331` `addFiles()` | 改 async；判斷式變成 `SUPPORTED[f.type] ?? (await isHeic(f) ? 'heic' : null)` |
| `:197` `decodeFile()` | 加 `if (srcCodec === 'heic') return decodeHeicToImageData(buf)` |
| `:268` `targetCodecFor()` | 來源 `heic` 且格式為 `orig` 時回 `'jpeg'` |
| 縮圖 | HEIC 無法用 `URL.createObjectURL` 顯示。加檔時放 inline SVG 佔位圖示，壓縮完成後改用結果 blob 產生縮圖 |
| `:348` 錯誤文案 | 改為「只接受 JPEG / PNG / WEBP / AVIF / HEIC」 |
| dropzone 說明 | 同步加 HEIC |

**「原格式」的落點必須看得見**：來源為 HEIC 時，該列在檔名旁標示 `HEIC → JPG`，不做隱形轉換。

## `image-slicer` 的改動

目前 `state.img` 恆為 `HTMLImageElement`，而 `renderGridOverlay()`（`:293`）、`updateCaption()`（`:307`）、`loadFile()`（`:328`）三處直接讀 `naturalWidth` / `naturalHeight`。HEIC 無法塞進 `<img>`，因此要把「尺寸來源」從元素身上抽離。

- `state` 新增 `imgW` / `imgH`，上述三處改讀 state
- `loadFile()` 改 async：HEIC → `decodeHeicToImageData()` → `putImageData` 進 canvas → `state.img = canvas`
- 預覽：非 HEIC 維持 `previewImg` + objectURL 路徑；HEIC 走既有的 `previewCanvas`（去綠幕模式本來就在用，設施現成）
- `ChromaKey.process()` 與 `drawImage()` 都接受 canvas，切片與 ZIP 流程不需更動
- `accept` **維持 `image/*`**，只補上 `.heic,.heif` 副檔名（部分平台對 HEIC 回空 MIME，只靠 `image/*` 選不到檔）

> 修正：設計初稿寫的是「把 `accept` 收斂成明確白名單」。實作後檢查 diff 時發現那會擋掉原本能用的 SVG / BMP，屬於本 feature 不該造成的行為變更（違反自己訂的 Non-scope），已改回不收窄，並加測試 `test_slicer_did_not_narrow_its_accept` 守住。

## 載入回饋與錯誤處理

1.46 MB 在慢速網路上要數秒，必須有回饋：

- compressor 在按下壓縮、slicer 在選檔時，若偵測到 HEIC 就顯示「正在載入 HEIC 解碼器…」訊息，載完清除
- 載入失敗（CDN 被擋 / 離線）給 `.message--error`，文案比照現有 jSquash、JSZip 失敗的處理
- 解碼失敗（檔案損毀 / 截斷）在 compressor 只讓該列失敗，**不中斷整批**（沿用現有 per-item try/catch）；在 slicer 顯示錯誤並保留前一張圖
- **promise 快取在載入失敗時必須清除**，否則第二次嘗試會拿到同一個 rejected promise，使用者永遠無法重試

## 資源限制（preflight 補入）

HEIC 的壓縮率遠高於 JPEG，一個 5 MB 的檔案可能是 48 MP，解碼成 RGBA 後佔用 192 MB。兩個工具目前**都沒有任何檔案大小或像素數上限**（`IMPLEMENTATION_PLAN.md` 階段 8 寫了「單檔過大提示」但未實作），批次幾張大 HEIC 就足以讓分頁崩潰。

- 單張上限 **50 MP**（涵蓋 iPhone 48 MP ProRAW，擋掉明顯異常的檔案）
- 檢查點放在 `get_width()` / `get_height()` 之後、`display()` 之前，也就是**在真正配置那塊記憶體之前**就中止
- 超限訊息要告知實際像素數，不要只說「太大」
- 這個限制**只套用於 HEIC 路徑**，不改變既有 JPEG / PNG / WEBP / AVIF 的行為

## 非同步競態

兩個工具的檔案處理函式都要改成 async，各自有一個競態要處理：

- compressor 的 `addFiles()`：連續拖放多批檔案時，`state.items` 的寫入順序與 `renderList()` 時機要維持一致
- slicer 的 `loadFile()`：快速換檔時可能「後選的先解完、再被先選的覆蓋」。需要 generation 計數，解碼完成後確認自己仍是最新一次請求才寫入 state

## 驗證

用 `sips` 在本機產生真實 HEIC 素材（已驗證可行：`sips -s format heic --out x.heic src.png`，`file` 確認為 ISO Media / HEIF Image HEVC Main Still Picture）。

1. 一般 HEIC → 壓成 JPEG，尺寸與畫面正確
2. **直式、帶 EXIF orientation 的照片** → 確認 libheif 是否自動套用旋轉；若否須自行補正（最可能踩到的坑）
3. **AVIF 不得被誤判為 HEIC**（regression 守門，含 MIME 被清空的極端情況）
4. `f.type` 為空字串的情境（改副檔名模擬 Windows Chrome）
5. 批次混合 JPEG + PNG + HEIC，各自走對路徑
6. 截斷 / 損毀的 HEIC → 該列顯示錯誤，其餘檔案照常完成
7. image-slicer：HEIC + 去綠幕 + 切割 + ZIP 全流程
8. 亮 / 暗模式、手機寬度無版面 regression
9. 超過 50 MP 的 HEIC → 明確拒絕且不吃爆記憶體
10. slicer 快速連續換檔 → 最後選的那張才是畫面上的那張

後端 `tests/` 僅能守頁面路由不 regress；實際解碼驗證走無頭瀏覽器實測，與本專案前幾個工具的作法一致。

### 實測結果（2026-07-31，Playwright 無頭瀏覽器）

素材以 `sips` 產生：`sample.heic`（1600×900，brand `heic`）、`portrait.heic`（900×1600）、`sample.avif`（brand `avif`）、`broken.heic`（截斷至 3000 bytes）、`huge.heic`（8000×7000＝56 MP，檔案僅 2.06 MB）。

| 項目 | 結果 |
|------|------|
| `isHeic()` 9 個案例（含 AVIF 無副檔名 + 空 MIME 的最嚴苛情境） | 9/9 通過 |
| 解碼正確性（與瀏覽器原生解出的 PNG 逐像素比對） | 平均色差 R 4.19 / G 1.96 / B 2.96；通道對調後為 83.44，證明 RGB 順序正確 |
| 批次混合 JPEG + PNG + AVIF + HEIC + 空 MIME HEIC | 5/5 成功，HEIC → JPG −40%，AVIF 仍走原路徑 |
| 56 MP 超限 | 正確擋下，JS heap 僅 19 → 32 MB（未配置那 224 MB） |
| 截斷壞檔 | 該列報錯，同批其他檔案照常完成 |
| slicer HEIC 切割 + ZIP | 9 塊，首塊 300×533（900×1600 切 3×3）正確 |
| slicer 去綠幕開 / 關切換 | 關閉後 previewCanvas 正確畫回原圖 |
| slicer 快速換檔競態（兩個方向） | generation 計數有效，最終畫面都是最後選的那張 |
| 手機寬度 390px、亮 / 暗模式 | 無橫向捲軸、無溢出，佔位圖示走 design token |
| **`irot` 容器層旋轉**（iPhone 直式照片的機制） | 手工把 `irot` angle byte 由 0 改成 1（90°）產生樣本：實際像素 900×1600、libheif 輸出 **1600×900**，確認有套用 |
| 輸出格式標籤 | 切 WEBP / PNG / AVIF / JPEG / 原格式，標籤都跟著變；壓成 WEBP 後標籤 `HEIC → WEBP`、下載檔名 `chip.webp` 一致 |
| CDN 載入失敗與重試 | 用只改 CDN 常數的副本測：連續三次各自真的重發請求（1→2→3），錯誤訊息為繁中文案 |
| slicer 解碼失敗 | 前一張的檔名、預覽、切割按鈕都保留，只顯示錯誤 |
| pytest | 16 passed（既有 8 + 新增 8） |

### 補測與修正（advisor review 後）

第一輪實測全程都用預設的「原格式」，因此漏掉三件事，補測後修正：

1. **輸出格式標籤會停在 `HEIC → JPG`**（真 bug）。`buildRow()` 只在建列時寫死一次，切到 WEBP 後標籤沒更新，實際輸出卻是 `.webp` —— 標籤反而標出錯的落點，正好違背「不做隱形轉檔」的初衷。改成由 `targetCodecFor()` 推導，並在格式切換時 `refreshConvChips()`。
2. **`irot` 這條原本要標「未驗證」，但其實測得到**。`sips` 不會寫非零 `irot`（它是實際重編碼像素），改成手工修改 angle byte 構造樣本即可，結論是 libheif 有正確套用。
3. **「失敗後清快取可重試」實際上無效**。瀏覽器的 module map 會快取失敗的 import，同一個 URL 之後不會再發請求（實測請求數停在 1），只清自己的 promise 快取沒有用。改成重試時附加 `?_r=N` 換掉 module specifier（已確認 jsDelivr 對此參數照常回 200 且可正常 import），使用者斷線恢復後不必重新整理、不會弄丟已選好的檔案清單。

## 決策紀錄

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-31 | 解碼器選 `libheif-js@1.19.8` ESM bundle，非 `heic-to` | 直接吐 RGBA，接得上現有 `ImageData` 管線；`heic-to` 只吐 PNG/JPEG Blob，會多一次無謂的編解碼 |
| 2026-07-31 | HEIC 來源選「原格式」時落到 JPEG，不落 AVIF | 使用者選定。相容性優先，iPhone 照片的典型去向（上傳 / 寄件）JPEG 不會出錯 |
| 2026-07-31 | 不做 HEIC 輸出 | HEVC 編碼專利授權疑慮 + 相容性差；AVIF 已能替代 |
| 2026-07-31 | 抽 `static/shared/heic-decode.js` 共用模組，非各頁各寫一份 | 兩個消費者，比照 `chroma-key.js` 既有慣例；日後推到其他三個工具時直接引用 |
| 2026-07-31 | magic bytes 判斷僅作為 MIME / 副檔名皆無結論時的 fallback，且明確排除 avif / avis brand | AVIF 與 HEIC 共用 ISO BMFF 容器，判斷寫鬆會讓現有 AVIF 支援倒退 |
| 2026-07-31 | 這次只做 image-compressor + image-slicer，不推到其餘三個工具 | 使用者選定範圍。先在兩個最常吃大量照片的工具驗證真實 iPhone 檔案，過了再擴散 |
| 2026-07-31 | 不加 SRI，維持與 jSquash 動態 import 一致 | `integrity` 屬性對動態 `import()` 無效；屬既有全站 gap，不在此 feature 混改 |
