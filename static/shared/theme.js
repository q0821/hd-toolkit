/* web-toolbox — 亮 / 暗模式切換
 * 放在 <head> 同步執行以避免閃爍：先依 localStorage / 系統偏好設定 data-theme，
 * DOMContentLoaded 後再綁定 header 的切換鈕（id="themeToggle"）。
 */
(function () {
  var KEY = "toolbox-theme";
  var root = document.documentElement;

  function preferred() {
    try {
      var saved = localStorage.getItem(KEY);
      if (saved === "light" || saved === "dark") return saved;
    } catch (e) {}
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function apply(theme) {
    root.setAttribute("data-theme", theme);
    var btn = document.getElementById("themeToggle");
    if (btn) btn.setAttribute("aria-label", theme === "dark" ? "切換為亮色模式" : "切換為暗色模式");
  }

  apply(preferred());

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("themeToggle");
    if (!btn) return;
    apply(root.getAttribute("data-theme")); // 補上 aria-label
    btn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      apply(next);
      try {
        localStorage.setItem(KEY, next);
      } catch (e) {}
    });
  });
})();
