(function () {
  "use strict";

  /* ---------- light / dark switch ---------- */
  var root = document.documentElement;
  var btn = document.getElementById("theme-toggle");
  var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  var SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>';
  var MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/></svg>';

  function current() {
    var t = root.getAttribute("data-theme");
    if (t === "dark" || t === "light") return t;
    return mq && mq.matches ? "dark" : "light";
  }
  function paint() {
    if (!btn) return;
    var dark = current() === "dark";
    btn.innerHTML = (dark ? SUN : MOON) + "<span>" + (dark ? "Light" : "Dark") + "</span>";
    btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  }
  function announce() { window.dispatchEvent(new Event("themechange")); }

  if (btn) {
    btn.addEventListener("click", function () {
      var next = current() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) { /* storage unavailable: switch still works for this visit */ }
      paint(); announce();
    });
  }
  if (mq) {
    var onSystem = function () { if (!root.getAttribute("data-theme")) { paint(); announce(); } };
    if (mq.addEventListener) mq.addEventListener("change", onSystem); else if (mq.addListener) mq.addListener(onSystem);
  }
  paint();

  /* ---------- copy buttons ---------- */
  document.querySelectorAll("[data-copy]").forEach(function (b) {
    b.addEventListener("click", function () {
      var text = b.getAttribute("data-copy");
      var reset = function (label) { b.textContent = label; setTimeout(function () { b.textContent = "Copy"; }, 1600); };
      var select = function () {
        var el = document.getElementById(b.getAttribute("data-target"));
        if (!el) return;
        var range = document.createRange(); range.selectNodeContents(el);
        var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
        reset("Selected");
      };
      try { navigator.clipboard.writeText(text).then(function () { reset("Copied"); }, select); }
      catch (e) { select(); }
    });
  });
})();
