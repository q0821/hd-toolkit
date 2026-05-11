/* hd-toolkit — 共用：綠幕 / 單色背景去背（純前端 Canvas）
 *
 *   var out = ChromaKey.process(imgOrCanvas, { tolerance: 0.4 });
 *   // out.canvas  — 背景像素 alpha 已歸零的 <canvas>（匯出 PNG/WEBP 即透明）
 *   // out.keyColor      — 實際使用的背景色 [r,g,b]
 *   // out.lowSaturation — true 表示沒偵測到明顯的單色背景（自動模式時用來提醒使用者改手動取色）
 *
 * 核心：用 HSV「色相距離」判斷背景（受光不均時 RGB 會飄、色相相對穩），
 * 內閾值內全透明、內外閾值間線性羽化；對留下來但帶 key 色調的邊緣像素做去溢色。
 */
(function () {
  "use strict";

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d !== 0) {
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return [h, mx === 0 ? 0 : d / mx, mx];
  }

  function hueDist(a, b) { var d = Math.abs(a - b); return d > 180 ? 360 - d : d; }

  function saturationOf(c) {
    var mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]);
    return mx === 0 ? 0 : (mx - mn) / mx;
  }

  // 從四角各取一小塊平均色，回傳最飽和的那塊（通常就是綠幕；陰影角落飽和度低會被排掉）
  function detectFromData(data, w, h) {
    var s = Math.max(2, Math.min(10, Math.floor(Math.min(w, h) * 0.02)));
    function patch(x0, y0) {
      x0 = Math.max(0, Math.min(w - s, x0));
      y0 = Math.max(0, Math.min(h - s, y0));
      var rr = 0, gg = 0, bb = 0, n = 0;
      for (var y = y0; y < y0 + s; y++) {
        for (var x = x0; x < x0 + s; x++) {
          var i = (y * w + x) * 4;
          rr += data[i]; gg += data[i + 1]; bb += data[i + 2]; n++;
        }
      }
      return [rr / n, gg / n, bb / n];
    }
    var corners = [patch(0, 0), patch(w - s, 0), patch(0, h - s), patch(w - s, h - s)];
    corners.sort(function (a, b) { return saturationOf(b) - saturationOf(a); });
    return corners[0];
  }

  function toContext(source) {
    var w = source.naturalWidth || source.width;
    var h = source.naturalHeight || source.height;
    var canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, w, h);
    return { canvas: canvas, ctx: ctx, w: w, h: h };
  }

  /**
   * @param {HTMLImageElement|HTMLCanvasElement} source
   * @param {Object}   [opts]
   * @param {number[]} [opts.keyColor]   背景色 [r,g,b]；省略則自動偵測
   * @param {number}   [opts.tolerance]  0..1，色相容差，預設 0.4
   * @param {number}   [opts.smoothness] 0..1，邊緣羽化，預設 0.25
   * @param {number}   [opts.spill]      0..1，去溢色強度，預設 0.5
   * @returns {{canvas: HTMLCanvasElement, keyColor: number[], lowSaturation: boolean}}
   */
  function process(source, opts) {
    opts = opts || {};
    var g = toContext(source);
    var img = g.ctx.getImageData(0, 0, g.w, g.h);
    var d = img.data;

    var key = opts.keyColor ? opts.keyColor.slice(0, 3) : detectFromData(d, g.w, g.h);
    var keyHsv = rgbToHsv(key[0], key[1], key[2]);
    var lowSaturation = keyHsv[1] < 0.12;

    if (lowSaturation) {
      // 背景不是夠飽和的單色 — 不亂動像素，原樣回傳，由 UI 提醒使用者手動取色
      return { canvas: g.canvas, keyColor: key, lowSaturation: true };
    }

    var keyHue = keyHsv[0];
    var tol = opts.tolerance != null ? opts.tolerance : 0.4;
    var smooth = opts.smoothness != null ? opts.smoothness : 0.25;
    var spill = opts.spill != null ? opts.spill : 0.5;

    var innerDeg = 12 + tol * 78;                 // 完全透明的色相半徑：12°..90°
    var outerDeg = innerDeg + 6 + smooth * 54;    // 漸層外緣
    var SAT_MIN = 0.12, VAL_MIN = 0.10;           // 近灰、近黑不視為背景

    // key 的主通道（綠幕→G、藍幕→B）；去溢色時把主通道往另兩通道平均壓
    var keyCh = 1;
    if (key[0] >= key[1] && key[0] >= key[2]) keyCh = 0;
    else if (key[2] >= key[0] && key[2] >= key[1]) keyCh = 2;
    var o1 = (keyCh + 1) % 3, o2 = (keyCh + 2) % 3;

    var ch = [0, 0, 0];
    for (var p = 0; p < d.length; p += 4) {
      ch[0] = d[p]; ch[1] = d[p + 1]; ch[2] = d[p + 2];
      var hsv = rgbToHsv(ch[0], ch[1], ch[2]);
      var dh = hueDist(hsv[0], keyHue);
      var alpha = 1;
      if (hsv[1] >= SAT_MIN && hsv[2] >= VAL_MIN) {
        if (dh <= innerDeg) alpha = 0;
        else if (dh < outerDeg) alpha = (dh - innerDeg) / (outerDeg - innerDeg);
      }
      if (alpha > 0 && spill > 0 && dh < outerDeg) {
        var cap = (ch[o1] + ch[o2]) / 2;
        if (ch[keyCh] > cap) {
          var prox = 1 - dh / outerDeg;           // 越接近 key 色，壓越多
          d[p + keyCh] = ch[keyCh] + (cap - ch[keyCh]) * prox * spill;
        }
      }
      d[p + 3] = Math.round(d[p + 3] * alpha);
    }
    g.ctx.putImageData(img, 0, 0);
    return { canvas: g.canvas, keyColor: key, lowSaturation: false };
  }

  // 自動偵測一張圖的背景色（給 UI 顯示色塊用）
  function detectKeyColor(source) {
    var g = toContext(source);
    var data = g.ctx.getImageData(0, 0, g.w, g.h).data;
    return detectFromData(data, g.w, g.h);
  }

  // 取某個座標（原圖像素座標）的顏色 — 給「點預覽圖取背景色」用
  function colorAt(source, x, y) {
    var g = toContext(source);
    x = Math.max(0, Math.min(g.w - 1, Math.round(x)));
    y = Math.max(0, Math.min(g.h - 1, Math.round(y)));
    var px = g.ctx.getImageData(x, y, 1, 1).data;
    return [px[0], px[1], px[2]];
  }

  function rgbToCss(c) { return "rgb(" + Math.round(c[0]) + ", " + Math.round(c[1]) + ", " + Math.round(c[2]) + ")"; }

  window.ChromaKey = {
    process: process,
    detectKeyColor: detectKeyColor,
    colorAt: colorAt,
    rgbToCss: rgbToCss
  };
})();
