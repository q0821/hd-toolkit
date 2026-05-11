/* hd-toolkit — 站台層級設定（目前放各家 AI API key）
 *
 * 每個工具頁都載入這支（跟 theme.js 一樣）。它會：
 *   1. 提供 window.Settings：getKey / setKey / get / set / onChange / openPanel
 *   2. 在 header 注入一顆「設定」齒輪按鈕
 *   3. 建一個設定面板（modal），裡面是 KEY_DEFS 清單渲染的 API key 欄位
 * 未來要再加一家 AI 服務的 key —— 在 KEY_DEFS 加一條就好。
 */
(function () {
  "use strict";
  var PREFIX = "hd-toolkit:";
  var SVG_NS = "http://www.w3.org/2000/svg";

  // 已知的 API key 欄位（加一家就在這加一條）
  var KEY_DEFS = [
    { id: "openai", label: "OpenAI API key", placeholder: "sk-...", url: "https://platform.openai.com/api-keys" },
    { id: "google", label: "Google AI Studio API key", placeholder: "AIza...", url: "https://aistudio.google.com/apikey" },
  ];
  // 舊版（工具自己存的）→ 新 namespace 的 migration 對照
  var LEGACY = { openai: "sticker-ai-openai-key", google: "sticker-ai-google-key" };

  function lsGet(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function lsSet(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} }

  var listeners = [];
  function fire(name) { for (var i = 0; i < listeners.length; i++) { try { listeners[i](name); } catch (e) {} } }

  var Settings = {
    get: function (name, def) { var v = lsGet(PREFIX + name); return v || (def == null ? "" : def); },
    set: function (name, v) { lsSet(PREFIX + name, v == null ? "" : String(v)); fire(name); },
    getKey: function (id) { return Settings.get("apikey:" + id); },
    setKey: function (id, v) { Settings.set("apikey:" + id, v); },
    keyDefs: function () { return KEY_DEFS.slice(); },
    onChange: function (fn) { if (typeof fn === "function") listeners.push(fn); },
    openPanel: function () { openModal(); },
  };
  window.Settings = Settings;

  // ---- migration ----
  KEY_DEFS.forEach(function (def) {
    var legacy = LEGACY[def.id];
    if (legacy && !Settings.getKey(def.id)) { var old = lsGet(legacy); if (old) Settings.setKey(def.id, old); }
  });

  // ---- DOM helpers ----
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function svgIcon(viewBox, paths) {
    var s = document.createElementNS(SVG_NS, "svg");
    s.setAttribute("viewBox", viewBox); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "1.5"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
    s.setAttribute("width", "20"); s.setAttribute("height", "20"); s.setAttribute("aria-hidden", "true");
    paths.forEach(function (p) { var e = document.createElementNS(SVG_NS, p.t); for (var k in p.a) e.setAttribute(k, p.a[k]); s.appendChild(e); });
    return s;
  }
  var gearIcon = function () {
    return svgIcon("0 0 24 24", [
      { t: "circle", a: { cx: 12, cy: 12, r: 3 } },
      { t: "path", a: { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" } },
    ]);
  };
  var closeIcon = function () { return svgIcon("0 0 24 24", [{ t: "path", a: { d: "M18 6 6 18M6 6l12 12" } }]); };

  // ---- modal ----
  var overlay = null, modalEl = null, fieldInputs = {};
  function buildModal() {
    overlay = el("div", "settings-overlay"); overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-modal", "true"); overlay.setAttribute("aria-label", "設定");
    modalEl = el("div", "settings-modal");

    var head = el("div", "settings-modal__head");
    head.appendChild(el("h2", null, "設定"));
    var closeBtn = el("button", "icon-btn settings-modal__close"); closeBtn.type = "button"; closeBtn.setAttribute("aria-label", "關閉設定");
    closeBtn.appendChild(closeIcon()); closeBtn.addEventListener("click", closeModal);
    head.appendChild(closeBtn);
    modalEl.appendChild(head);

    modalEl.appendChild(el("p", "settings-note", "需要 AI 服務的工具（例如「AI 貼圖生成」）會用到這裡的 key。key 只存在你的瀏覽器（localStorage），請求時經本站的薄 proxy 轉給服務、用完即丟、不留存。"));

    KEY_DEFS.forEach(function (def) {
      var row = el("div", "settings-row");
      var lab = el("div", "settings-row__label");
      lab.appendChild(el("span", "field-label", def.label));
      var link = el("a", null, "取得 key →"); link.href = def.url; link.target = "_blank"; link.rel = "noopener";
      lab.appendChild(link);
      row.appendChild(lab);
      var inputWrap = el("div", "row");
      var inp = el("input", "text-field"); inp.type = "password"; inp.autocomplete = "off"; inp.spellcheck = false; inp.placeholder = def.placeholder; inp.value = Settings.getKey(def.id);
      inp.style.flex = "1 1 200px"; inp.style.minWidth = "0";
      inp.addEventListener("input", function () { Settings.setKey(def.id, inp.value.trim()); });
      fieldInputs[def.id] = inp;
      var clr = el("button", "btn btn--ghost", "清除"); clr.type = "button"; clr.style.flex = "0 0 auto"; clr.style.padding = "9px 12px"; clr.style.fontSize = "13px";
      clr.addEventListener("click", function () { inp.value = ""; Settings.setKey(def.id, ""); });
      inputWrap.append(inp, clr);
      row.appendChild(inputWrap);
      modalEl.appendChild(row);
    });

    var foot = el("div", "settings-foot");
    var doneBtn = el("button", "btn btn--secondary", "關閉"); doneBtn.type = "button"; doneBtn.style.marginLeft = "auto"; doneBtn.addEventListener("click", closeModal);
    foot.appendChild(doneBtn);
    modalEl.appendChild(foot);

    overlay.appendChild(modalEl);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeModal(); });
    document.body.appendChild(overlay);
  }
  function onKeydown(e) { if (e.key === "Escape" || e.keyCode === 27) closeModal(); }
  function openModal() {
    if (!overlay) buildModal();
    // 開啟時把欄位值同步成目前 store 的值（可能被別處改過）
    KEY_DEFS.forEach(function (def) { if (fieldInputs[def.id]) fieldInputs[def.id].value = Settings.getKey(def.id); });
    overlay.classList.add("is-open");
    document.addEventListener("keydown", onKeydown);
    var first = fieldInputs[KEY_DEFS[0] && KEY_DEFS[0].id]; if (first) setTimeout(function () { first.focus(); }, 30);
  }
  function closeModal() { if (overlay) overlay.classList.remove("is-open"); document.removeEventListener("keydown", onKeydown); }

  // ---- 注入 header 齒輪 ----
  function injectGear() {
    if (document.getElementById("settingsBtn")) return;
    var row = document.querySelector(".app-header .app-header__row") || document.querySelector(".app-header");
    if (!row) return;
    var btn = el("button", "icon-btn"); btn.type = "button"; btn.id = "settingsBtn"; btn.title = "設定"; btn.setAttribute("aria-label", "設定");
    btn.appendChild(gearIcon());
    btn.addEventListener("click", openModal);
    var themeBtn = document.getElementById("themeToggle") || row.querySelector(".theme-toggle");
    if (themeBtn) row.insertBefore(btn, themeBtn); else row.appendChild(btn);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", injectGear);
  else injectGear();
})();
