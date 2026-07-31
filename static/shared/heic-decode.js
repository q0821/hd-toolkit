/* hd-toolkit — 共用：HEIC / HEIF 解碼（純前端 WASM）
 *
 *   if (await HeicDecode.isHeic(file)) {
 *     var imageData = await HeicDecode.decodeToImageData(await file.arrayBuffer());
 *   }
 *
 * 瀏覽器原生不支援 HEIC（Safari 除外），這裡動態載入 libheif 的 WASM 發行版來解。
 * 載入是 lazy 的：沒人丟 HEIC 進來就完全不會下載那 1.46 MB。
 *
 * 設計要點見 docs/superpowers/specs/2026-07-31-heic-support-design.md，兩個關鍵：
 *   1. AVIF 與 HEIC 共用 ISO BMFF 容器，magic bytes 判斷寫鬆會把現有的 AVIF
 *      支援搶走。所以 magic bytes 只當最後一層 fallback，且明確排除 avif brand。
 *   2. HEIC 壓縮率遠高於 JPEG，5 MB 的檔案可能是 48 MP、解碼後 RGBA 佔 192 MB。
 *      像素數檢查放在 display() 之前，也就是配置那塊記憶體之前。
 *
 * libheif-js 1.19.8（LGPL-3.0）— https://github.com/catdad-experiments/libheif-js
 */
(function () {
  "use strict";

  var CDN = 'https://cdn.jsdelivr.net/npm/libheif-js@1.19.8/libheif-wasm/libheif-bundle.mjs';

  // 單張上限 50 MP：涵蓋 iPhone 48 MP ProRAW，擋掉明顯異常的檔案
  var MAX_PIXELS = 50 * 1000 * 1000;

  var HEIC_MIME = {
    'image/heic': true, 'image/heif': true,
    'image/heic-sequence': true, 'image/heif-sequence': true
  };

  // ISO BMFF 的 major brand。mif1 / msf1 是通用 HEIF brand，也收
  var HEIC_BRAND = {
    heic: true, heix: true, hevc: true, hevx: true,
    heim: true, heis: true, hevm: true, hevs: true,
    mif1: true, msf1: true
  };

  // AVIF 同為 ISO BMFF，必須先擋掉，否則會把現有 AVIF 路徑搶走
  var AVIF_BRAND = { avif: true, avis: true };

  var _libheif = null;   // Promise，載入成功後長期快取
  var _attempt = 0;      // 失敗重試次數，用來換掉 module specifier，見下

  function loadLibheif() {
    if (!_libheif) {
      // 只清自己的 promise 快取不足以重試：瀏覽器的 module map 會記住失敗的
      // import，同一個 URL 之後不會再發請求（實測驗證過）。加一個 jsDelivr
      // 會忽略的 query 參數換掉 specifier，才能在斷線恢復後真的重試，
      // 不必叫使用者重新整理、把已選好的檔案清單弄丟。
      var url = _attempt === 0 ? CDN : CDN + '?_r=' + _attempt;
      _attempt++;
      _libheif = import(/* @vite-ignore */ url).then(function (mod) {
        var factory = (mod && mod.default) || mod;
        // libheif-bundle.mjs 的 default export 是 Emscripten factory；
        // 依版本可能同步回傳模組物件或回傳 Promise，兩種都吃
        return Promise.resolve(typeof factory === 'function' ? factory() : factory);
      }).then(function (lib) {
        if (!lib || typeof lib.HeifDecoder !== 'function') {
          throw new Error('shape');
        }
        return lib;
      }).catch(function () {
        // 失敗要清掉快取，否則之後每次都拿到同一個 rejected promise、永遠無法重試
        _libheif = null;
        throw new Error('HEIC 解碼器載入失敗，請確認網路連線後重試。');
      });
    }
    return _libheif;
  }

  function extIsHeic(name) {
    return /\.hei[cf]$/i.test(name || '');
  }

  // 讀前 12 bytes 取 ftyp box 的 major brand；不是 ISO BMFF 就回 null
  function readBrand(file) {
    return file.slice(0, 12).arrayBuffer().then(function (buf) {
      var b = new Uint8Array(buf);
      if (b.length < 12) return null;
      var box = String.fromCharCode(b[4], b[5], b[6], b[7]);
      if (box !== 'ftyp') return null;
      return String.fromCharCode(b[8], b[9], b[10], b[11]).toLowerCase();
    }).catch(function () { return null; });
  }

  /**
   * 判斷是不是 HEIC / HEIF。三層依序，前一層有結論就不進下一層。
   * 三層都無結論時回 false（fail-closed，讓它走各工具原本的錯誤處理）。
   */
  async function isHeic(file) {
    if (!file) return false;

    // 1. MIME。正常的 AVIF 是 image/avif，在這層就分流掉了
    var type = (file.type || '').toLowerCase();
    if (HEIC_MIME[type]) return true;
    if (type && type.indexOf('image/') === 0) return false;

    // 2. 副檔名。Windows 版 Chrome 對 .heic 常回空字串 type，這層是主要救援
    if (extIsHeic(file.name)) return true;

    // 3. magic bytes。只有前兩層都無結論（type 為空且副檔名不明）才走到這
    var brand = await readBrand(file);
    if (!brand) return false;
    if (AVIF_BRAND[brand]) return false;
    return !!HEIC_BRAND[brand];
  }

  /**
   * ArrayBuffer（HEIC）→ ImageData（RGBA）
   * 丟出的 Error 訊息都是可直接顯示給使用者的繁中文案。
   */
  async function decodeToImageData(buf) {
    var libheif = await loadLibheif();

    var images;
    try {
      images = new libheif.HeifDecoder().decode(new Uint8Array(buf));
    } catch (e) {
      throw new Error('HEIC 檔案讀取失敗，可能已損毀。');
    }
    if (!images || !images.length) throw new Error('這個 HEIC 檔裡沒有可用的影像。');

    var image = images[0];
    var w = image.get_width(), h = image.get_height();
    if (!w || !h) throw new Error('無法取得這張 HEIC 的尺寸。');

    // 在 display() 配置 w*h*4 bytes 之前先擋，不然是先吃爆才後悔
    if (w * h > MAX_PIXELS) {
      throw new Error(
        '這張 HEIC 太大（' + w + ' × ' + h + '，約 ' +
        (w * h / 1000000).toFixed(1) + ' MP），單張上限 ' + (MAX_PIXELS / 1000000) + ' MP。'
      );
    }

    var imageData = new ImageData(w, h);
    return new Promise(function (resolve, reject) {
      try {
        image.display(imageData, function (out) {
          if (!out) { reject(new Error('HEIC 影像解碼失敗。')); return; }
          resolve(out);
        });
      } catch (e) {
        reject(new Error('HEIC 影像解碼失敗。'));
      }
    });
  }

  /** 解碼成 canvas（slicer 用；compressor 走 ImageData 直接接 jSquash） */
  async function decodeToCanvas(buf) {
    var imageData = await decodeToImageData(buf);
    var canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    canvas.getContext('2d').putImageData(imageData, 0, 0);
    return canvas;
  }

  window.HeicDecode = {
    isHeic: isHeic,
    decodeToImageData: decodeToImageData,
    decodeToCanvas: decodeToCanvas,
    preload: loadLibheif,
    MAX_PIXELS: MAX_PIXELS
  };
})();
