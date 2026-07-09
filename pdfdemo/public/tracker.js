/**
 * AddVantage Document Intelligence tracker (demo build).
 * Vanilla JS port of PropOS src/lib/useDocTracker.ts.
 *
 * Captures: open, section enter/exit dwell, scroll depth, cursor samples
 * (throttled, % coordinates within section), text selections, tab blur/focus,
 * print, session end. Batches flush every 5s and via sendBeacon on tab hide.
 */
(function () {
  "use strict";

  var PITCH_ID = document.body.getAttribute("data-pitch-id") || "demo";
  var PITCH_TYPE = document.body.getAttribute("data-pitch-type") || "price_update";
  var SESSION_ID = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());

  var events = [];
  var activeSections = new Map(); // sectionId -> start ms
  var sectionEls = new Map();
  var maxScroll = 0;
  var lastMouse = 0;

  function push(type, sectionId, data) {
    events.push({ type: type, sectionId: sectionId || undefined, data: data || undefined, ts: Date.now() });
  }

  function flush(asBeacon) {
    if (events.length === 0) return;
    var batch = JSON.stringify({
      pitchId: PITCH_ID,
      pitchType: PITCH_TYPE,
      sessionId: SESSION_ID,
      events: events.splice(0, events.length),
    });
    if (asBeacon && navigator.sendBeacon) {
      navigator.sendBeacon("/api/doc-track/flush", batch);
    } else {
      fetch("/api/doc-track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: batch,
      }).catch(function () { /* non-fatal */ });
    }
  }

  function recordSectionExit(sectionId) {
    var start = activeSections.get(sectionId);
    if (start == null) return;
    activeSections.delete(sectionId);
    push("section_exit", sectionId, { duration_ms: Date.now() - start });
  }

  // Sections: every element with data-section
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var sectionId = entry.target.getAttribute("data-section");
      if (!sectionId) return;
      if (entry.isIntersecting && !activeSections.has(sectionId)) {
        activeSections.set(sectionId, Date.now());
        push("section_enter", sectionId);
      } else if (!entry.isIntersecting && activeSections.has(sectionId)) {
        recordSectionExit(sectionId);
      }
    });
  }, { threshold: 0.3 });

  document.querySelectorAll("[data-section]").forEach(function (el) {
    var id = el.getAttribute("data-section");
    sectionEls.set(id, el);
    observer.observe(el);

    // Cursor sampling within section, throttled to one per 200ms
    el.addEventListener("mousemove", function (e) {
      var now = performance.now();
      if (now - lastMouse < 200) return;
      lastMouse = now;
      var rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      push("cursor_sample", id, {
        x: Math.round(((e.clientX - rect.left) / rect.width) * 100),
        y: Math.round(((e.clientY - rect.top) / rect.height) * 100),
      });
    }, { passive: true });
  });

  // Scroll depth high-water mark
  window.addEventListener("scroll", function () {
    var pct = Math.min(100, Math.round(
      ((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight) * 100
    ));
    if (pct > maxScroll) maxScroll = pct;
  }, { passive: true });

  // Text selection (debounced)
  var selDebounce;
  document.addEventListener("selectionchange", function () {
    clearTimeout(selDebounce);
    selDebounce = setTimeout(function () {
      var sel = window.getSelection ? String(window.getSelection()).trim() : "";
      if (sel && sel.length > 2) push("text_select", null, { text: sel.slice(0, 200) });
    }, 500);
  });

  // Tab visibility: pause sections, beacon-flush on hide
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      activeSections.forEach(function (_start, sectionId) { recordSectionExit(sectionId); });
      if (maxScroll > 0) push("scroll_depth", null, { pct: maxScroll });
      push("tab_blur");
      flush(true);
    } else {
      push("tab_focus");
      sectionEls.forEach(function (el, sectionId) {
        var rect = el.getBoundingClientRect();
        var inView = rect.top < window.innerHeight * 0.7 && rect.bottom > 0;
        if (inView && !activeSections.has(sectionId)) {
          activeSections.set(sectionId, Date.now());
          push("section_enter", sectionId);
        }
      });
    }
  });

  // Print / Save PDF: the strongest single intent signal on the page
  window.addEventListener("beforeprint", function () {
    push("print");
    flush();
  });

  // Session end
  window.addEventListener("pagehide", function () {
    activeSections.forEach(function (_start, sectionId) { recordSectionExit(sectionId); });
    push("session_end");
    flush(true);
  });

  // Auto-flush every 5 seconds, carrying the current scroll high-water mark
  setInterval(function () {
    if (maxScroll > 0) push("scroll_depth", null, { pct: maxScroll });
    flush();
  }, 5000);

  // Open event, sent immediately
  push("open");
  flush();
})();
