/* ==========================================================================
   Deck engine. Works on any number of <section class="slide"> inside #frame.
   You should not need to edit this file to change content.

   Keys   → / Space / PageDown   next        ← / Shift+Space / PageUp  previous
          Home / End             first/last  O or Esc                  overview
          N                      notes       F                         fullscreen
          R                      toggle read / present mode
   Links  #5 opens slide 5. Tap left third = back, right two-thirds = forward.
   ========================================================================== */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} },
  };

  const deck = $("#deck"), frame = $("#frame"), stage = $("#stage");
  const slides = $$(":scope > .slide", frame);
  const N = slides.length;
  const deckName = frame.dataset.name || document.title;
  const pad = (n) => String(n).padStart(2, "0");
  const titleOf = (s, k) => s.dataset.title || (($("h1, h2", s) || {}).textContent || "Slide " + (k + 1)).replace(/\s+/g, " ").trim();
  let cur = 0;

  /* ---------- Decorate slides ---------- */
  slides.forEach((s, k) => {
    s.setAttribute("role", "group");
    s.setAttribute("aria-roledescription", "slide");
    s.setAttribute("aria-label", `${k + 1} of ${N}: ${titleOf(s, k)}`);
    s.dataset.n = k + 1;
    if (!s.classList.contains("no-foot") && !$(".s-foot", s)) {
      const f = document.createElement("div");
      f.className = "s-foot";
      f.innerHTML = `<span></span><b>${pad(k + 1)} / ${pad(N)}</b>`;
      f.firstChild.textContent = deckName;
      s.appendChild(f);
    }
    $$(".build", s).forEach((b) => Array.from(b.children).forEach((c, i) => c.style.setProperty("--k", i)));
    $$(".fan .fc", s).forEach((c, i) => c.style.setProperty("--k", i));
  });

  /* ---------- Progress track ---------- */
  const track = $("#track");
  slides.forEach((s, k) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", `Go to slide ${k + 1}: ${titleOf(s, k)}`);
    b.title = `${k + 1}. ${titleOf(s, k)}`;
    b.addEventListener("click", () => go(k));
    track.appendChild(b);
  });

  /* ---------- Mode: present / read ---------- */
  const narrow = matchMedia("(max-width: 760px)");
  const modeBtn = $("#btn-mode");
  function mode() { return deck.dataset.mode; }
  function setMode(m, remember) {
    if (remember) store.set("deck-mode", m);
    deck.dataset.mode = m;
    modeBtn.setAttribute("aria-pressed", String(m === "read"));
    $(".lbl", modeBtn).textContent = m === "read" ? "Present" : "Read";
    modeBtn.title = m === "read" ? "Switch to presenting one slide at a time (R)" : "Switch to scrolling all slides (R)";
    if (m === "read") requestAnimationFrame(() => slides[cur].scrollIntoView({ block: "start" }));
    else window.scrollTo(0, 0);
    paint();
  }
  narrow.addEventListener("change", () => { if (!store.get("deck-mode")) setMode(narrow.matches ? "read" : "present"); });

  /* ---------- Navigation ---------- */
  function paint() {
    slides.forEach((s, k) => {
      s.classList.toggle("active", k === cur);
      s.classList.toggle("before", k < cur);
      s.setAttribute("aria-hidden", mode() === "present" && k !== cur ? "true" : "false");
      s.inert = mode() === "present" && k !== cur;
    });
    Array.from(track.children).forEach((b, k) => { b.classList.toggle("past", k < cur); b.classList.toggle("cur", k === cur); });
    $("#count").innerHTML = `<b>${pad(cur + 1)}</b> / ${pad(N)}`;
    $("#now").textContent = titleOf(slides[cur], cur);
    $("#btn-prev").disabled = cur === 0;
    $("#btn-next").disabled = cur === N - 1;
    $(".zone.prev").classList.toggle("show", cur > 0);
    $(".zone.next").classList.toggle("show", cur < N - 1);
    paintNotes();
    document.title = `${titleOf(slides[cur], cur)} · ${deckName}`;
  }
  function go(k, opts = {}) {
    k = Math.max(0, Math.min(N - 1, k));
    const changed = k !== cur;
    cur = k;
    if (history.replaceState) history.replaceState(null, "", "#" + (k + 1));
    if (mode() === "read" && opts.scroll !== false) slides[k].scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    if (changed || opts.force) paint();
  }
  const next = () => go(cur + 1), prev = () => go(cur - 1);
  $("#btn-next").addEventListener("click", next);
  $("#btn-prev").addEventListener("click", prev);

  function fromHash() {
    const m = /^#(\d+)$/.exec(location.hash);
    return m ? Math.max(0, Math.min(N - 1, parseInt(m[1], 10) - 1)) : 0;
  }
  window.addEventListener("hashchange", () => go(fromHash()));

  // Read mode: keep the counter/hash in sync with scrolling
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      if (mode() !== "read") return;
      entries.forEach((en) => { if (en.isIntersecting) go(+en.target.dataset.n - 1, { scroll: false }); });
    }, { rootMargin: "-45% 0px -50% 0px" });
    slides.forEach((s) => io.observe(s));
  }

  /* ---------- Tap zones & swipe (present mode) ---------- */
  const zones = document.createElement("div");
  zones.innerHTML = '<div class="zone prev" aria-hidden="true"><svg viewBox="0 0 18 18"><path d="M11 4L6 9l5 5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="zone next" aria-hidden="true"><svg viewBox="0 0 18 18"><path d="M7 4l5 5-5 5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div>';
  Array.from(zones.children).forEach((z) => frame.appendChild(z));
  let swiped = false, tx = 0, ty = 0;
  frame.addEventListener("touchstart", (e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; swiped = false; }, { passive: true });
  frame.addEventListener("touchend", (e) => {
    if (mode() !== "present") return;
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) { swiped = true; dx < 0 ? next() : prev(); }
  });
  frame.addEventListener("click", (e) => {
    if (mode() !== "present" || swiped) { swiped = false; return; }
    if (e.target.closest("a, button, input, select, textarea, summary, pre, table, [data-chart], .no-advance")) return;
    if (String(window.getSelection && window.getSelection()).length) return;
    const r = frame.getBoundingClientRect();
    (e.clientX - r.left) < r.width / 3 ? prev() : next();
  });

  /* ---------- Speaker notes ---------- */
  const notesBtn = $("#btn-notes"), panel = $("#notes-panel");
  function paintNotes() {
    const s = slides[cur], n = $(".notes", s);
    $(".np-num", panel).textContent = `Slide ${cur + 1} of ${N}`;
    $(".np-title", panel).textContent = titleOf(s, cur);
    $(".body", panel).innerHTML = n && n.innerHTML.trim() ? n.innerHTML : '<p class="empty">No notes for this slide.</p>';
    const nx = $(".next", panel);
    if (cur < N - 1) { nx.hidden = false; $("b", nx).textContent = titleOf(slides[cur + 1], cur + 1); } else nx.hidden = true;
  }
  function toggleNotes(on) {
    on = on ?? !deck.classList.contains("show-notes");
    deck.classList.toggle("show-notes", on);
    notesBtn.setAttribute("aria-pressed", String(on));
    store.set("deck-notes", on ? "1" : "0");
  }
  notesBtn.addEventListener("click", () => toggleNotes());

  /* ---------- Overview ---------- */
  const ov = $("#overview"), ovGrid = $("#ov-grid"), ovBtn = $("#btn-overview");
  function openOverview() {
    ovGrid.innerHTML = "";
    slides.forEach((s, k) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "ov-item" + (k === cur ? " cur" : "");
      item.style.setProperty("--k", k);
      item.setAttribute("aria-label", `Slide ${k + 1}: ${titleOf(s, k)}`);
      const thumb = document.createElement("div");
      thumb.className = "thumb";
      const clone = s.cloneNode(true);
      clone.classList.remove("before");
      clone.classList.add("active");
      clone.removeAttribute("aria-label"); clone.removeAttribute("role"); clone.inert = true;
      clone.setAttribute("aria-hidden", "true");
      $$(".notes, .zone, .chart-tip", clone).forEach((x) => x.remove());
      $$("[id]", clone).forEach((x) => x.removeAttribute("id"));
      thumb.appendChild(clone);
      const cap = document.createElement("span");
      cap.className = "cap";
      cap.innerHTML = `<b>${pad(k + 1)}</b><span></span>`;
      cap.lastChild.textContent = titleOf(s, k);
      item.append(thumb, cap);
      item.addEventListener("click", () => { closeOverview(); go(k); });
      ovGrid.appendChild(item);
    });
    ov.hidden = false;
    ovBtn.setAttribute("aria-pressed", "true");
    const c = $(".ov-item.cur", ovGrid);
    if (c) { c.scrollIntoView({ block: "center" }); c.focus({ preventScroll: true }); }
  }
  function closeOverview() {
    ov.hidden = true;
    ovBtn.setAttribute("aria-pressed", "false");
    ovGrid.innerHTML = "";
    ovBtn.focus({ preventScroll: true });
  }
  const toggleOverview = () => (ov.hidden ? openOverview() : closeOverview());
  ovBtn.addEventListener("click", toggleOverview);
  $("#ov-close").addEventListener("click", closeOverview);

  /* ---------- Fullscreen ---------- */
  const fsBtn = $("#btn-fs");
  function toggleFs() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen();
  }
  fsBtn.addEventListener("click", toggleFs);
  document.addEventListener("fullscreenchange", () => {
    const on = !!document.fullscreenElement;
    document.body.classList.toggle("is-fs", on);
    fsBtn.setAttribute("aria-pressed", String(on));
  });
  if (!document.documentElement.requestFullscreen) fsBtn.hidden = true;

  /* ---------- Keyboard ---------- */
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) return;
    const k = e.key;
    if (!ov.hidden) {
      if (k === "Escape" || k === "o" || k === "O") { e.preventDefault(); closeOverview(); }
      return;
    }
    if (k === "Escape" || k === "o" || k === "O") { e.preventDefault(); openOverview(); return; }
    if (k === "n" || k === "N") { toggleNotes(); return; }
    if (k === "f" || k === "F") { toggleFs(); return; }
    if (k === "r" || k === "R") { setMode(mode() === "read" ? "present" : "read", true); return; }
    if (mode() !== "present") return;
    if (["ArrowRight", "PageDown", "ArrowDown"].includes(k) || (k === " " && !e.shiftKey)) { e.preventDefault(); next(); }
    else if (["ArrowLeft", "PageUp", "ArrowUp"].includes(k) || (k === " " && e.shiftKey)) { e.preventDefault(); prev(); }
    else if (k === "Home") { e.preventDefault(); go(0); }
    else if (k === "End") { e.preventDefault(); go(N - 1); }
  });

  modeBtn.addEventListener("click", () => setMode(mode() === "read" ? "present" : "read", true));

  /* ---------- Print in light colours, then restore ---------- */
  let themeBeforePrint = null;
  window.addEventListener("beforeprint", () => {
    themeBeforePrint = document.documentElement.getAttribute("data-theme");
    document.documentElement.setAttribute("data-theme", "light");
  });
  window.addEventListener("afterprint", () => {
    if (themeBeforePrint) document.documentElement.setAttribute("data-theme", themeBeforePrint);
    else document.documentElement.removeAttribute("data-theme");
  });

  /* ---------- Charts (metrics slide) ---------- */
  $$("[data-deck-chart]", frame).forEach((el) => {
    const spec = window.DECK_CHARTS && window.DECK_CHARTS[el.dataset.deckChart];
    if (!spec || !window.Kit) return;
    // Height follows width so the chart keeps its proportions at any slide size.
    Object.defineProperty(spec, "height", { get: () => Math.round(Math.max(el.clientWidth, 240) * (spec.aspect || 0.5)), configurable: true });
    window.Kit.chart[spec.type || "line"](el, spec);
  });

  /* ---------- Artifact server toolbar ----------
     The server injects a fixed toolbar (bottom-right) into served pages.
     Measure it and reserve that much space under the deck bar so it never
     covers navigation. Absent locally and in print. */
  (function watchToolbar(tries) {
    const host = Array.from(document.body.children).find((e) => e.shadowRoot && e.shadowRoot.querySelector(".dock"));
    if (!host) { if (tries > 0) setTimeout(() => watchToolbar(tries - 1), 250); return; }
    const set = () => document.documentElement.style.setProperty("--toolbar-h", Math.ceil(host.getBoundingClientRect().height) + 24 + "px");
    set();
    if ("ResizeObserver" in window) new ResizeObserver(set).observe(host);
  })(12);

  /* ---------- Start ---------- */
  cur = fromHash();
  const saved = store.get("deck-mode");
  setMode(saved || (narrow.matches ? "read" : "present"));
  if (store.get("deck-notes") === "1") toggleNotes(true);
  go(cur, { force: true, scroll: mode() === "read" && cur > 0 });
})();
