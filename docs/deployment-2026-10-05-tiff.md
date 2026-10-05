# 2026-10-05：TIF 轉 JPG 正式部署

- 授權：使用者明確要求「請部署」。只更新圖片壓縮頁面與 TIFF 解碼器，不推送 GitHub、不更動 Tunnel、DNS、Hermes 或開機設定。
- 主機：Mac mini，agent 帳號；部署目錄 `/Users/agent/WORK/case/hd-toolkit-container`。
- 來源：既有 `ebc2971682b4dd745af086fecb61b44fbcef3331` 基礎加兩個本機未提交檔案。不是新的 Git commit；README、測試與 preflight 文件沒有進入本次容器更新。
- 新映像檔：`mini-hd-toolkit:tiff-20261005`，ID `sha256:49c1a10bc3b1f953a5ed7924ebf85e5d90e3379d098732af5bf42a1837ae7540`。
- 舊映像檔保留：`mini-hd-toolkit:ebc2971682b4`，ID `sha256:420766cc45fe959f27cf9399b7afdf9889be1dd9945acfc7e2d83c72465cc6c9`。
- 【已驗證】修改前備份及還原副本位於 `releases/tiff-20261005/backup/`、`restore-check/`；Compose 與舊壓縮頁面位元組一致，還原 Compose 的 `config -q` 通過。舊映像檔存在。未執行正式流量的完整回滾演練。
- 【已驗證】新映像檔建置成功，僅 toolkit 以 `up -d --no-deps --no-build --pull never --wait` 切換。toolkit 與既有 Tunnel 都 healthy；Tunnel 建立時間仍為兩天前。
- 【已驗證】容器內、mini loopback HTTP、正式 HTTPS 瀏覽器的兩個新檔 SHA-256 一致。
- 壓縮頁面 SHA-256：`e411e8b4b3f713658fa65d92c04a9077f53fe04d8cc6265f6ab772ccc069afc0`。
- 解碼器 SHA-256：`e0c8a00187d8497db60b55fad5f867cd22c22734cda56782d2715532d4117cfd`。
- 【已驗證】正式網址 `https://toolkit.jackie-yeh.com/image-compressor?release=tiff-20261005`，Playwright 由檔案選擇器加入未壓縮、LZW、Deflate、PackBits 四張 TIF，再按壓縮，均輸出 JPG；個別下載及 ZIP 下載成功。
- 【已驗證】Pillow 讀回正式站下載的個別 JPG 與 ZIP 中四張影像，均為 JPEG、320 × 240，中心 RGB 與來源（180, 80, 30）誤差不超過 3。
- 【已驗證】正式站多頁、損毀 TIFF 明確顯示錯誤，既有 PNG 壓縮成功；瀏覽器 GET `/api/health` 為 HTTP 200、`status: ok`。四項 Node 格式辨識測試通過。
- 查核限制：Python urllib 的正式 HTTPS 請求回 403，改以已成功開啟正式頁面的瀏覽器同源 fetch 查核，未據此判定服務故障。瀏覽器既有 favicon.ico 404 不影響轉檔。初次備份 Compose 驗證因重複合併設定失敗，當時尚未修改應用；修正為單一備份設定驗證後通過。
- 未驗證：本次沒有重跑全站 53 項 API 驗收，沒有付費圖片生成、整機冷啟動或斷電恢復驗收；原待辦保留。部署當下尚未提交或推送本機變更。後續使用者要求「收尾」，授權將本次功能、測試及文件提交並推送至 `q0821/hd-toolkit`；容器仍以本紀錄的映像檔及檔案 SHA 為版本證據。
