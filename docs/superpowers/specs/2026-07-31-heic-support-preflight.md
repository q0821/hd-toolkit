# HEIC / HEIF 輸入支援 — Preflight Checklist

> 對應 spec：`2026-07-31-heic-support-design.md`
> 開工前 review 一輪，完工後同一份再 review 一輪。
> 本 feature 為**純前端、無後端、無資料庫**，多數後端段落不適用，仍逐段標明原因。

## Non-scope 重申（完工自查第一題：有沒有越界？）

- [ ] 沒有做 HEIC 輸出（僅輸入）
- [ ] 沒有動 bg-remover / sticker-ai / invoice-stamp
- [ ] 沒有順手重構無關程式碼、沒有改 `DESIGN.md`、沒有改視覺風格
- [ ] 沒有為了 HEIC 去改既有 JPEG / PNG / WEBP / AVIF 的處理路徑行為
- [ ] 沒有 deploy、沒有 push

---

## B. 判斷邏輯 enforcement（防「函式存在 ≠ 路徑真的走到」）

- [ ] 格式判斷只有 `isHeic()` 一個入口，兩個工具都呼叫它，沒有各自複製一份判斷邏輯
- [ ] 有正例測試（真 HEIC 被認出）**也有反例測試**（AVIF / JPEG / PNG 不被誤認）
- [ ] `isHeic()` fail-closed：三層都無結論時回 `false`（讓它走既有路徑並由原有錯誤處理接手），不要「不確定就試著用 libheif 解解看」
- [ ] compressor 的 `addFiles()` 改 async 後，連續快速丟檔 / 拖放不會產生 race（`state.items` 的寫入順序、`renderList()` 的呼叫時機）
- [ ] slicer 的 `loadFile()` 改 async 後，快速換檔不會發生「後選的先解完、被先選的覆蓋」（需要一個 request token 或 generation 計數）

## C. 使用者資料處理（前端版）

- [ ] 檔名顯示沿用既有的 `textContent` / DOM 節點建構，**不引入 `innerHTML`**（compressor 的 `buildRow()` 現已如此，不可退步）
- [ ] 輸出檔名沿用既有 `sanitizeStem()` / `sanitizePrefix()`，HEIC 來源不繞過
- [ ] 圖片資料全程留在瀏覽器，不因為這個 feature 產生任何上傳（維持兩個工具的純前端性質）
- [ ] EXIF 中的 GPS / 拍攝資訊不會意外被寫進輸出檔（jSquash 本來就不寫 EXIF，確認 HEIC 路徑也沒有額外帶入）

## G. 跨 service 副作用（CDN 載入 libheif）

- [ ] CDN 失敗（離線 / 被擋 / 404）有明確 `.message--error`，不是靜默失敗或無限轉圈
- [ ] 載入中有可見回饋（1.46 MB 在慢速網路要數秒）
- [ ] 失敗後可重試：promise 快取在失敗時要清掉，否則第二次點擊會拿到同一個 rejected promise 而永遠無法恢復
- [ ] 版本 pin 明確（`libheif-js@1.19.8`），不用 `@latest` / `@1`
- [ ] 沒有 SRI 是已知且**已記錄**的 gap（`integrity` 對動態 `import()` 無效），與現有 jSquash 一致，不是這次新增的疏漏

## J. 第三方套件（libheif-js）

- [ ] 為什麼需要：瀏覽器原生無 HEIC 解碼（Safari 除外），無可替代的內建方案
- [ ] 維護狀態：1.19.8，2025-06 發布，追隨上游 libheif 版號
- [ ] License：**LGPL-3.0**。動態 import 未修改的發行版，符合動態連結條件
- [ ] License 標註寫進 README 與頁尾致謝（與現有 pic-smaller 致謝同一區塊）
- [ ] 相依套件數為 0，無傳遞性風險
- [ ] wasm 供應鏈：libheif 是 C 程式碼編譯而成，歷史上有解析器 CVE。緩解為 wasm sandbox 隔離 + 版本 pin + 檔案不離開瀏覽器。可接受，但**不可用 `@latest` 讓版本浮動**

## K. 前端資源限制（本 feature 特有，最重要的一段）

> 這段是 preflight 抓出來的、設計階段漏掉的風險。

- [ ] **像素數上限**：HEIC 壓縮率遠高於 JPEG，5 MB 的檔案可能是 48 MP，解碼後 RGBA 佔 192 MB。批次幾張即可讓分頁崩潰
- [ ] 上限檢查放在 `get_width()` / `get_height()` 之後、`display()` 之前 —— 也就是**在真正配置那塊記憶體之前**就中止
- [ ] 上限值：單張 **50 MP**（涵蓋 iPhone 48 MP ProRAW，擋掉明顯異常的檔案），超過顯示明確訊息告知實際像素數
- [ ] 這個限制**只套用在 HEIC 路徑**，不改變既有 JPEG / PNG / WEBP / AVIF 的行為（避免 scope creep 與既有行為變更）
- [ ] libheif-js 記憶體由 GC 自動回收，不需手動 `free()`（官方文件確認），但仍要確保 decoder / images 不被長期持有在 module scope
- [ ] 批次處理時逐檔釋放：解完一張、encode 完就不再持有該 `ImageData` 參照
- [ ] 主執行緒阻塞：解碼 12 MP HEIC 約需 1 到 2 秒，UI 會凍結。維持現有「不開 Worker」的架構決策，但進度文字要在解碼**之前**更新，讓使用者知道卡在哪一張
- [ ] `URL.createObjectURL` 生命週期：HEIC 不建立來源 objectURL（改用佔位圖示），壓縮後若為結果 blob 建立縮圖 URL，必須在 `clearAll()` 與重新壓縮時 revoke（compressor 現有 `revokeObjectURL` 邏輯要涵蓋新增的這條路徑）
- [ ] 解碼失敗 / 超限的檔案，在 compressor 只讓該列失敗，**不中斷整批**

## I. SSRF（不適用，但說明原因）

CDN URL 為原始碼中的硬編碼常數，**無任何 user-controlled URL 進入 fetch / import**。使用者輸入僅為本機檔案，不觸發網路請求。

## A. Schema（不適用）

本專案無資料庫，本 feature 不觸及任何持久化儲存。

## D. 後台 Filament Action（不適用）

本專案為 FastAPI + 靜態頁，無 Filament、無後台。

## E. 前台 form submit / endpoint（不適用）

本 feature 不新增任何後端 endpoint，不提交表單，無 CSRF / rate limit 面向。`main.py` 只需維持既有的靜態頁路由。

## F. 對外傳遞 email / webhook（不適用）

本 feature 不寄信、不打 webhook、不對外傳遞任何使用者資料。

## H. 時區 / 日期（不適用）

本 feature 無日期計算。EXIF 拍攝時間不被讀取也不被寫出。

## A05 Security Misconfiguration（超出 feature 範圍，記錄待辦）

全站目前**未設定 Content-Security-Policy**（`main.py` 無任何 security header middleware）。這對本 feature 是有利的（動態 import CDN 不會被擋），但屬全站 infrastructure gap。若日後補上 CSP，`script-src` 需納入 `cdn.jsdelivr.net`、`unpkg.com`、`cdnjs.cloudflare.com`，且 `wasm-unsafe-eval` 為 WASM 所必需。**列為獨立待辦，不在本 feature 處理。**
