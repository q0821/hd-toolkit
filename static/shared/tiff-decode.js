/* TIFF → 8-bit RGBA，UTIF.js 3.1.0（MIT），僅在需要時載入。
 * 單頁限制避免靜默漏頁；50 MP 上限在解壓縮像素之前檢查。
 */
(function () {
  'use strict';
  const CDN = 'https://esm.sh/utif@3.1.0';
  const MAX_PIXELS = 50 * 1000 * 1000;
  let library, attempt = 0;

  function loadLibrary() {
    if (!library) {
      const url = attempt++ ? CDN + '?retry=' + attempt : CDN;
      library = import(url).then(mod => {
        const lib = mod.default || mod;
        if (typeof lib.decodeImage !== 'function') throw new Error('Invalid decoder');
        return lib;
      }).catch(error => {
        library = null;
        console.error('TIF 解碼器載入失敗：', error);
        throw new Error('TIF 解碼器載入失敗，請確認網路連線後重試。');
      });
    }
    return library;
  }

  function hasHeader(buffer) {
    const b = new Uint8Array(buffer);
    return b.length >= 4 && (
      (b[0] === 73 && b[1] === 73 && b[2] === 42 && b[3] === 0) ||
      (b[0] === 77 && b[1] === 77 && b[2] === 0 && b[3] === 42)
    );
  }

  async function isTiff(file) {
    if (!file) return false;
    if (/^image\/(tiff|x-tiff)$/i.test(file.type || '') || /\.tiff?$/i.test(file.name || '')) return true;
    if (file.type && file.type !== 'application/octet-stream') return false;
    return hasHeader(await file.slice(0, 4).arrayBuffer());
  }

  async function decodeToImageData(buffer) {
    if (!hasHeader(buffer)) throw new Error('不是有效的 TIF 檔案，或此 TIFF 格式尚未支援。');
    const lib = await loadLibrary();
    let pages;
    try { pages = lib.decode(buffer); }
    catch (error) {
      console.error('TIF 檔案讀取失敗：', error);
      throw new Error('TIF 檔案讀取失敗，可能已損毀。');
    }
    if (!pages.length) throw new Error('這個 TIF 檔裡沒有可用的影像。');
    if (pages.length !== 1) throw new Error('目前僅支援單頁 TIF，請先將多頁 TIFF 拆成單頁。');
    const page = pages[0], w = page.t256 && page.t256[0], h = page.t257 && page.t257[0];
    if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w <= 0 || h <= 0) {
      throw new Error('無法取得這張 TIF 的尺寸。');
    }
    if (w * h > MAX_PIXELS) throw new Error('這張 TIF 太大（' + w + ' × ' + h + '），單張上限 50 MP。');
    if (page.t274 && page.t274[0] !== 1) {
      throw new Error('這張 TIF 含旋轉或鏡射資訊，請先將影像方向轉正後再轉檔。');
    }
    if (page.t258 && page.t258.some(bits => ![1, 2, 4, 8].includes(bits))) {
      throw new Error('目前僅支援每色版最高 8 位元的 TIF，請先轉為 8 位元影像。');
    }
    // CMYK 使用 UTIF.js 的基本換算轉為 RGB，不套用內嵌 ICC 色彩描述檔。
    // 支援 RGB、灰階、黑白、索引色與 CMYK；其他色彩格式明確拒絕。
    if (![0, 1, 2, 3, 5].includes(page.t262 && page.t262[0])) {
      throw new Error('這張 TIF 的色彩格式尚未支援，請先轉為 RGB。');
    }
    try {
      lib.decodeImage(buffer, page);
      const rgba = lib.toRGBA8(page);
      if (!page.data || rgba.length !== w * h * 4) throw new Error('Invalid pixel data');
      // JPG 沒有透明度，透明像素合成到白色背景。
      for (let i = 0; i < rgba.length; i += 4) {
        const alpha = rgba[i + 3] / 255;
        for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(rgba[i + c] * alpha + 255 * (1 - alpha));
        rgba[i + 3] = 255;
      }
      return new ImageData(new Uint8ClampedArray(rgba), w, h);
    } catch (error) {
      console.error('TIF 影像解碼失敗：', error);
      throw new Error('TIF 影像解碼失敗，檔案可能已損毀或使用不支援的壓縮方式。');
    }
  }
  window.TiffDecode = { isTiff, decodeToImageData, MAX_PIXELS };
})();
