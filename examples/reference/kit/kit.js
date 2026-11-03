/* ==========================================================================
   Reference kit — behaviour shared by every artifact in the collection.
   No dependencies. Load with <script src="kit/kit.js" defer></script>.

   Auto-wired on DOMContentLoaded (just add the attribute):
     [data-theme-toggle]   button that cycles system → light → dark
                           (kit.js puts a Bold / Clean style button next to it)
     [data-style-toggle]   place the style button yourself instead
     [data-side-toggle]    button that opens the .side nav on small screens
     .side a[href^="#"]    scroll-spy: marks the current section link
     pre[data-copy]        adds a Copy button
     table[data-sortable]  click a th[data-sort] to sort (data-sort="num" for numbers)
     .reveal               fades in when scrolled into view
     [data-chart]          renders a chart from JSON in the attribute or from
                           window[data-chart-src] — see Kit.chart below
     [data-toc]            chapter menu built from every top-level section[id] / [data-chapter][id]
                           (sections inside a chapter are its items; data-toc-skip leaves one out)
                           (a nav.topnav[data-toc] outside the top bar is moved into .topbar)
                           with an h2 (data-toc-label overrides the text). In .topnav: top links
                           plus a Contents button on phones; in .side: numbered list with h3[id]
                           sub-items; elsewhere: a numbered contents block. Kit.toc(el) re-renders.
     [data-flow]           flow diagram from JSON in the attribute or window[data-flow-src]:
                           {steps:[{title, text, tag, files:[...]}], caption, direction:"row"|"column"}
                           or {rows:[{label, steps:[...]}]} — Kit.flow(el, spec)
     [data-risks]          risk table from JSON in the attribute or window[data-risks-src]:
                           [{risk, likelihood:"low"|"medium"|"high", impact, plan}] — Kit.risks(el, list)
     table.compare         comparison table; tr.rec is the recommended row (gets a Recommended tag)
     img[data-src]         lazy image: fetched when it nears the screen (data-srcset/data-sizes too),
                           placeholder while loading, a labelled box when the file is missing.
                           Give width/height so the page does not jump. img[loading=lazy] gets the
                           same placeholder and fade. Printing loads every image first.
     img[data-lightbox]    opens full size on click; images with the same data-lightbox="group"
                           page through together — Kit.lightbox.open(items, index)
     [data-gallery]        image gallery: a layout name with <figure>/<img> children, or JSON
                           {layout, items:[{src, thumb, title, caption, alt, w, h, tag, notes}], min, ratio, frame}
                           layouts: grid · masonry · strip · sidebar · annotated · compare
                           notes: [{x, y, w, h, title, text}] in percent of the image — Kit.gallery(el, spec)
     [data-diff]           code diff from JSON {file, lang, before, after | patch | hunks, start, range,
                           mode:"unified"|"split"|"final", notes:[{line, side, text}], highlight:[[a,b]],
                           context, caption} or <script type="text/plain" data-before|data-after|data-patch>
                           children. Readers switch modes; the choice holds for every diff — Kit.diff(el, spec)
     pre[data-lang]        syntax colouring for a code block (js, ts, py, sh, css, html, json, sql, …)
                           — Kit.highlight(text, lang) returns the HTML

   Charts (all theme-aware, hover tooltips, legend for ≥2 series,
   and a table view when wrapped in .chart-card with a .as-table button):
     Kit.chart.line(el, {labels, series:[{name, values}], format, yMin, refs})
     Kit.chart.column(el, {labels, series:[...], stacked, format})
     Kit.chart.bar(el, {labels, series:[{name, values}], format})   horizontal
     Kit.chart.donut(el, {labels, values, format, center})
     Kit.chart.spark(el, {values})
   Series colours follow slot order --s1…--s5 (fixed, never cycled); pin one with
   {name, values, slot: 2}. Pass tickFormat to format axis ticks differently from values.
   Rendered content late? Call Kit.refresh() to wire tables, copy buttons, reveals, charts.
   ========================================================================== */
(function () {
  "use strict";
  const Kit = (window.Kit = window.Kit || {});
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} },
  };
  Kit.$ = $; Kit.$$ = $$; Kit.store = store;

  /* ---------- Theme ---------- */
  const THEME_KEY = "kit-theme";
  const icons = {
    system: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor"/></svg>',
    light: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    dark: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  };
  function applyTheme(t) {
    const root = document.documentElement;
    if (t === "light" || t === "dark") root.setAttribute("data-theme", t);
    else root.removeAttribute("data-theme");
    $$("[data-theme-toggle]").forEach((b) => {
      const mode = t || "system";
      b.innerHTML = icons[mode];
      b.setAttribute("aria-label", "Theme: " + mode + " (click to change)");
      b.title = "Theme: " + mode;
    });
    document.dispatchEvent(new CustomEvent("kit:theme"));
  }
  Kit.theme = {
    get: () => store.get(THEME_KEY),
    set(t) { store.set(THEME_KEY, t); applyTheme(t); },
    cycle() { const order = [null, "light", "dark"]; const i = order.indexOf(this.get()); this.set(order[(i + 1) % 3]); },
  };

  /* ---------- Style: Clean (themes/clean/clean.css, the default) or Bold (kit.css alone) ----------
     Pages default to Clean. A page that should open in Bold says so on its root element:
     <html data-kit-style="bold">. Readers switch with the style button; their choice is remembered
     for every kit page on the server. Link Clean after the page's other stylesheets so it is there on
     the first paint (kit.js adds it otherwise, which can flash Bold for a moment); while Bold is
     shown it stays loaded but inactive (media "not all"), so switching is instant. After a switch the
     page gets kit:style and kit:theme events and a resize, so charts and layouts redraw. */
  const STYLE_KEY = "kit-style";
  const CLEAN_CSS = /themes\/(clean\/clean|quiet\/quiet)\.css(\?|#|$)/;
  const kitBase = (() => {
    const s = document.currentScript || $$("script[src]").find((x) => /kit\.js(\?|$)/.test(x.src));
    return s ? s.src.replace(/kit\.js(\?.*)?$/, "") : "kit/";
  })();
  const authored = $$('link[rel~="stylesheet"]').find((l) => CLEAN_CSS.test(l.getAttribute("href") || ""));
  const defaultStyle = document.documentElement.getAttribute("data-kit-style") === "bold" ? "bold" : "clean";
  let cleanLink = authored;
  if (!cleanLink) {
    cleanLink = document.createElement("link");
    cleanLink.rel = "stylesheet"; cleanLink.href = kitBase + "themes/clean/clean.css"; cleanLink.media = defaultStyle === "clean" ? "all" : "not all";
    document.head.appendChild(cleanLink);
  }
  const styleName = (s) => (s === "clean" ? "Clean" : "Bold");
  function applyStyle(s, announce) {
    s = s === "clean" ? "clean" : "bold";
    const root = document.documentElement, before = root.getAttribute("data-kit-style");
    root.setAttribute("data-kit-style", s);
    cleanLink.media = s === "clean" ? "all" : "not all";
    $$("[data-style-toggle]").forEach((b) => {
      const other = s === "clean" ? "bold" : "clean";
      b.innerHTML = '<b aria-hidden="true">Aa</b><span>' + styleName(s) + "</span>";
      b.setAttribute("aria-label", "Style: " + styleName(s) + " (click for " + styleName(other) + ")");
      b.title = "Style: " + styleName(s) + " · switch to " + styleName(other);
    });
    if (!announce || before === s) return;
    const done = () => {
      document.dispatchEvent(new CustomEvent("kit:style", { detail: { style: s } }));
      document.dispatchEvent(new CustomEvent("kit:theme"));
      window.dispatchEvent(new Event("resize"));
    };
    if (s === "clean" && !cleanLink.sheet) cleanLink.addEventListener("load", done, { once: true });
    else requestAnimationFrame(() => requestAnimationFrame(done));
  }
  Kit.style = {
    default: defaultStyle,
    get: () => document.documentElement.getAttribute("data-kit-style") || defaultStyle,
    set(s) { store.set(STYLE_KEY, s); applyStyle(s, true); },
    toggle() { this.set(this.get() === "clean" ? "bold" : "clean"); },
  };
  applyStyle(store.get(STYLE_KEY) || defaultStyle, false);
  function wireStyleToggle() {
    $$("[data-theme-toggle]").forEach((t) => {
      if (t.previousElementSibling && t.previousElementSibling.matches("[data-style-toggle]")) return;
      if (document.querySelector("[data-style-toggle]:not([data-kit-made])") ) return;
      const b = document.createElement("button");
      b.type = "button"; b.className = "icon-btn kit-style-toggle"; b.setAttribute("data-style-toggle", ""); b.setAttribute("data-kit-made", "");
      t.parentNode.insertBefore(b, t);
    });
    $$("[data-style-toggle]").forEach((b) => {
      if (b.dataset.kitWired) return;
      b.dataset.kitWired = "1"; b.classList.add("kit-style-toggle");
      b.addEventListener("click", () => Kit.style.toggle());
    });
    applyStyle(Kit.style.get(), false);
  }
  applyTheme(store.get(THEME_KEY)); // run early to avoid a flash

  /* ---------- Small helpers ---------- */
  Kit.fmt = {
    int: (v) => Math.round(v).toLocaleString("en-US"),
    dec1: (v) => v.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 }),
    pct: (v) => v.toLocaleString("en-US", { maximumFractionDigits: 1 }) + "%",
    compact: (v) => Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v),
    hours: (v) => v.toLocaleString("en-US", { maximumFractionDigits: 1 }) + " h",
  };
  function fmtFn(f) { return typeof f === "function" ? f : Kit.fmt[f] || Kit.fmt.int; }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  Kit.esc = esc;

  // Side nav: opens on small screens, and highlights the section being read.
  // Links are read fresh each time, so links rendered later by the page work too.
  let sideWired = false;
  function wireSide() {
    const side = $(".side");
    if (!sideWired) $$("[data-side-toggle]").forEach((b) => b.addEventListener("click", () => side && side.classList.toggle("open")));
    if (!side || sideWired) return;
    sideWired = true;
    let pinned = null, pinTimer = null, frame = 0;
    const links = () => $$('a[href^="#"]', side).filter((a) => a.getAttribute("href").length > 1);
    const target = (a) => document.getElementById(decodeURIComponent(a.getAttribute("href").slice(1)));
    const mark = (current) => links().forEach((a) => {
      const on = a === current;
      a.classList.toggle("cur", on);
      if (on) { a.setAttribute("aria-current", "location"); if (side.scrollHeight > side.clientHeight) { const r = a.getBoundingClientRect(), sr = side.getBoundingClientRect(); if (r.top < sr.top || r.bottom > sr.bottom) a.scrollIntoView({ block: "nearest" }); } }
      else a.removeAttribute("aria-current");
    });
    const update = () => {
      frame = 0;
      if (pinned) return mark(pinned);
      const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bar")) || 60;
      const line = bar + Math.min(innerHeight * 0.25, 220); // the reading line just below the top bar
      const items = links().map((a) => ({ a, t: target(a) })).filter((x) => x.t && x.t.getClientRects().length);
      if (!items.length) return;
      let current = null;
      for (const x of items) if (x.t.getBoundingClientRect().top <= line) current = x.a;
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) { // bottom of the page: the last section that is visible
        const visible = items.filter((x) => x.t.getBoundingClientRect().top < innerHeight);
        if (visible.length) current = visible[visible.length - 1].a;
      }
      mark(current || items[0].a);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    side.addEventListener("click", (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      side.classList.remove("open");
      pinned = a; mark(a); clearTimeout(pinTimer);
      // Keep the clicked item highlighted until the smooth scroll settles.
      pinTimer = setTimeout(() => { pinned = null; schedule(); }, 900);
    });
    if ("MutationObserver" in window) new MutationObserver(schedule).observe(side, { childList: true, subtree: true });
    schedule();
  }

  function wireCopy() {
    $$("pre[data-copy]").forEach((pre) => {
      if ($(".copy", pre)) return;
      const b = document.createElement("button");
      b.type = "button"; b.className = "copy"; b.textContent = "Copy";
      b.addEventListener("click", async () => {
        const text = pre.getAttribute("data-copy") || pre.innerText.replace(/\nCopy$/, "");
        try { await navigator.clipboard.writeText(text.trim()); b.textContent = "Copied"; }
        catch (e) { b.textContent = "Select & copy"; }
        setTimeout(() => (b.textContent = "Copy"), 1600);
      });
      pre.appendChild(b);
    });
  }

  function wireSort() {
    $$("table[data-sortable]").forEach((table) => {
      if (table.dataset.sortWired) return;
      table.dataset.sortWired = "1";
      $$("th[data-sort]", table).forEach((th, _, all) => {
        th.tabIndex = 0;
        const go = () => {
          const idx = Array.from(th.parentNode.children).indexOf(th);
          const dir = th.getAttribute("aria-sort") === "ascending" ? "descending" : "ascending";
          all.forEach((o) => o.removeAttribute("aria-sort"));
          th.setAttribute("aria-sort", dir);
          const num = th.dataset.sort === "num";
          const body = table.tBodies[0];
          const rows = Array.from(body.rows);
          const val = (r) => { const c = r.cells[idx]; const v = c.dataset.value ?? c.textContent.trim(); return num ? parseFloat(String(v).replace(/[^0-9.\-]/g, "")) || 0 : v.toLowerCase(); };
          rows.sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * (dir === "ascending" ? 1 : -1));
          rows.forEach((r) => body.appendChild(r));
        };
        th.addEventListener("click", go);
        th.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
      });
    });
  }

  let revealIO = null;
  function wireReveal() {
    const els = $$(".reveal:not(.in)").filter((e) => !e.dataset.revealWired);
    els.forEach((e) => (e.dataset.revealWired = "1"));
    if (!els.length) return;
    if (!("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("in")); return; }
    revealIO = revealIO || new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); revealIO.unobserve(en.target); } }), { rootMargin: "0px 0px -8% 0px" });
    els.forEach((e) => revealIO.observe(e));
  }

  /* ---------- Charts ---------- */
  const NS = "http://www.w3.org/2000/svg";
  const seriesVar = (i) => `var(--s${(i % 5) + 1})`;
  // A series may pin its colour with {slot: 0-4} so filtering never repaints survivors.
  const colorOf = (s, i) => seriesVar(s && s.slot != null ? s.slot : i);
  function svgEl(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  // Domain top that lands on a clean tick: 1123 → 1250, 4305 → 5000
  function niceTop(v, count = 5) {
    if (v <= 0) return 1;
    const step = niceMax(v / count);
    return Math.ceil(v / step - 1e-9) * step;
  }
  function ticks(min, max, count = 5) {
    const step = niceMax((max - min) / count);
    const out = [];
    for (let v = Math.floor(min / step) * step; v <= max + step * 0.001; v += step) out.push(+v.toFixed(10));
    return out;
  }
  function legend(host, series, kind) {
    if (series.length < 2) return;
    const ul = document.createElement("ul");
    ul.className = "legend";
    ul.innerHTML = series.map((s, i) => `<li><i class="${kind === "line" ? "ln" : ""}" style="--c:${colorOf(s, i)}"></i>${esc(s.name)}</li>`).join("");
    host.appendChild(ul);
  }
  function tipLayer(host) {
    const tip = document.createElement("div");
    tip.className = "chart-tip"; tip.hidden = true; tip.setAttribute("role", "status");
    host.appendChild(tip);
    return {
      show(x, y, title, rows) {
        tip.innerHTML = `<b>${esc(title)}</b>` + rows.map((r) => `<div><span>${r.c ? `<i style="--c:${r.c}"></i>` : ""}${esc(r.k)}</span><strong>${esc(r.v)}</strong></div>`).join("");
        tip.hidden = false;
        const w = host.clientWidth, tw = tip.offsetWidth;
        tip.style.left = Math.min(Math.max(x, tw / 2), w - tw / 2) + "px";
        tip.style.top = y + "px";
      },
      hide() { tip.hidden = true; },
    };
  }
  // Table view for a chart (accessibility relief + copyable numbers)
  function tableFor(spec, kind) {
    const f = fmtFn(spec.format);
    let head, rows;
    if (kind === "donut") {
      head = ["", spec.valueLabel || "Value"];
      rows = spec.labels.map((l, i) => [l, f(spec.values[i])]);
    } else {
      head = [spec.xLabel || "", ...spec.series.map((s) => s.name)];
      rows = spec.labels.map((l, i) => [l, ...spec.series.map((s) => (s.values[i] == null ? "—" : f(s.values[i])))]);
    }
    return `<div class="table-wrap"><table class="table compact"><thead><tr>${head.map((h, i) => `<th class="${i ? "num" : ""}">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i ? "num" : ""}">${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  function mount(el, spec, kind, draw) {
    el.classList.add("chart");
    const card = el.closest(".chart-card");
    const btn = card && $(".as-table", card);
    let asTable = false;
    const render = () => {
      el.innerHTML = "";
      if (asTable) { el.innerHTML = tableFor(spec, kind); return; }
      if (kind !== "donut" && kind !== "spark") legend(el, spec.series, kind);
      const w = Math.max(el.clientWidth, 240);
      draw(el, w);
    };
    if (btn && !btn.dataset.wired) {
      btn.dataset.wired = "1";
      btn.setAttribute("aria-pressed", "false");
      btn.addEventListener("click", () => { asTable = !asTable; btn.setAttribute("aria-pressed", String(asTable)); render(); });
    }
    render();
    let lastW = el.clientWidth;
    if ("ResizeObserver" in window) new ResizeObserver(() => { if (Math.abs(el.clientWidth - lastW) > 4) { lastW = el.clientWidth; render(); } }).observe(el);
    return { update(next) { Object.assign(spec, next); render(); } };
  }

  function axesY(svg, m, w, h, yMin, yMax, f) { // f = tick formatter (spec.tickFormat || spec.format)
    const sy = (v) => m.t + (h - m.t - m.b) * (1 - (v - yMin) / (yMax - yMin || 1));
    ticks(yMin, yMax).forEach((t) => {
      if (t < yMin - 1e-9 || t > yMax + 1e-9) return;
      svgEl("line", { x1: m.l, x2: w - m.r, y1: sy(t), y2: sy(t), class: t === yMin ? "baseline" : "gridline" }, svg);
      const tx = svgEl("text", { x: m.l - 8, y: sy(t) + 4, "text-anchor": "end", class: "tick" }, svg);
      tx.textContent = f(t);
    });
    return sy;
  }
  function xLabels(svg, labels, xs, y, maxLabels) {
    const every = Math.max(1, Math.ceil(labels.length / maxLabels));
    const last = labels.length - 1;
    labels.forEach((l, i) => {
      const onStep = i % every === 0;
      if (!onStep && i !== last) return;
      if (onStep && i !== last && last - i < every && last % every) return; // keep the last label clear

      const t = svgEl("text", { x: xs(i), y, "text-anchor": "middle", class: "tick" }, svg);
      t.textContent = l;
    });
  }

  Kit.chart = {
    /* Line: {labels, series:[{name, values}], format, yMin, height, refs:[{value,label}], endLabels:true} */
    line(el, spec) {
      return mount(el, spec, "line", (host, w) => {
        const f = fmtFn(spec.format), h = spec.height || 260;
        const m = { t: 12, r: spec.endLabels === false ? 16 : 64, b: 28, l: 52 };
        const all = spec.series.flatMap((s) => s.values).filter((v) => v != null);
        const yMin = spec.yMin ?? Math.min(0, ...all);
        const yMax = spec.yMax ?? niceTop(Math.max(...all, ...(spec.refs || []).map((r) => r.value)) * 1.02);
        const svg = svgEl("svg", { viewBox: `0 0 ${w} ${h}`, role: "img", "aria-label": spec.title || "Line chart" }, host);
        const n = spec.labels.length;
        const sx = (i) => m.l + ((w - m.l - m.r) * i) / Math.max(n - 1, 1);
        const sy = axesY(svg, m, w, h, yMin, yMax, spec.tickFormat ? fmtFn(spec.tickFormat) : f);
        xLabels(svg, spec.labels, sx, h - 8, Math.floor((w - m.l - m.r) / 64));
        (spec.refs || []).forEach((r) => {
          svgEl("line", { x1: m.l, x2: w - m.r, y1: sy(r.value), y2: sy(r.value), class: "ref" }, svg);
          const t = svgEl("text", { x: w - m.r + 6, y: sy(r.value) + 4, class: "tick" }, svg); t.textContent = r.label;
        });
        spec.series.forEach((s, si) => {
          const pts = s.values.map((v, i) => (v == null ? null : [sx(i), sy(v)]));
          const d = pts.reduce((acc, p, i) => (p ? acc + (acc && pts[i - 1] ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1) : acc), "");
          const g = svgEl("g", { "data-i": si }, svg);
          if (spec.series.length === 1 && spec.area !== false) {
            const valid = pts.filter(Boolean);
            svgEl("path", { d: d + `L${valid[valid.length - 1][0]} ${sy(yMin)}L${valid[0][0]} ${sy(yMin)}Z`, class: "area", fill: colorOf(s, si) }, g);
          }
          svgEl("path", { d, class: "line", stroke: colorOf(s, si) }, g);
          const last = pts.map((p, i) => [p, i]).filter((x) => x[0]).pop();
          if (last) {
            svgEl("circle", { cx: last[0][0], cy: last[0][1], r: 4, class: "dot", fill: colorOf(s, si) }, g);
            if (spec.endLabels !== false) {
              const t = svgEl("text", { x: last[0][0] + 8, y: last[0][1] + 4, class: "lbl" }, g);
              t.textContent = f(s.values[last[1]]);
            }
          }
        });
        // crosshair + tooltip
        const tip = tipLayer(host);
        const cross = svgEl("line", { y1: m.t, y2: h - m.b, class: "cross", visibility: "hidden" }, svg);
        const marks = spec.series.map((s, si) => svgEl("circle", { r: 4.5, class: "dot", fill: colorOf(s, si), visibility: "hidden" }, svg));
        const hit = svgEl("rect", { x: m.l, y: m.t, width: w - m.l - m.r, height: h - m.t - m.b, class: "hit" }, svg);
        const move = (e) => {
          const r = svg.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * w;
          const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / (w - m.l - m.r)) * (n - 1))));
          cross.setAttribute("x1", sx(i)); cross.setAttribute("x2", sx(i)); cross.setAttribute("visibility", "visible");
          spec.series.forEach((s, si) => {
            const v = s.values[i];
            marks[si].setAttribute("visibility", v == null ? "hidden" : "visible");
            if (v != null) { marks[si].setAttribute("cx", sx(i)); marks[si].setAttribute("cy", sy(v)); }
          });
          const top = Math.min(...spec.series.map((s) => (s.values[i] == null ? h : sy(s.values[i]))));
          tip.show((sx(i) / w) * r.width + (r.left - host.getBoundingClientRect().left), (top / h) * r.height + (r.top - host.getBoundingClientRect().top),
            spec.labels[i], spec.series.map((s, si) => ({ k: s.name, v: s.values[i] == null ? "—" : f(s.values[i]), c: colorOf(s, si) })));
        };
        hit.addEventListener("pointermove", move);
        hit.addEventListener("pointerleave", () => { tip.hide(); cross.setAttribute("visibility", "hidden"); marks.forEach((mk) => mk.setAttribute("visibility", "hidden")); });
      });
    },

    /* Column (vertical): {labels, series:[{name, values}], stacked, format, height} */
    column(el, spec) {
      return mount(el, spec, "column", (host, w) => {
        const f = fmtFn(spec.format), h = spec.height || 260;
        const m = { t: 18, r: 8, b: 28, l: 52 };
        const n = spec.labels.length, k = spec.series.length;
        const totals = spec.labels.map((_, i) => spec.series.reduce((a, s) => a + (s.values[i] || 0), 0));
        const yMax = spec.yMax ?? niceTop((spec.stacked ? Math.max(...totals) : Math.max(...spec.series.flatMap((s) => s.values))) * 1.02);
        const svg = svgEl("svg", { viewBox: `0 0 ${w} ${h}`, role: "img", "aria-label": spec.title || "Column chart" }, host);
        const sy = axesY(svg, m, w, h, 0, yMax, spec.tickFormat ? fmtFn(spec.tickFormat) : f);
        const band = (w - m.l - m.r) / n;
        const groupW = Math.min(band * 0.72, spec.stacked ? 28 : 24 * k + 2 * (k - 1));
        const barW = spec.stacked ? groupW : Math.min(24, (groupW - 2 * (k - 1)) / k);
        const cx = (i) => m.l + band * i + band / 2;
        xLabels(svg, spec.labels, cx, h - 8, Math.floor((w - m.l - m.r) / 48));
        const tip = tipLayer(host);
        const R = 4;
        const colPath = (x, y0, y1, bw, round) => {
          const top = Math.min(y0, y1), hgt = Math.abs(y0 - y1);
          if (hgt < 0.5) return "";
          const r = round ? Math.min(R, hgt, bw / 2) : 0;
          return `M${x} ${top + hgt}V${top + r}${r ? `Q${x} ${top} ${x + r} ${top}` : ""}H${x + bw - r}${r ? `Q${x + bw} ${top} ${x + bw} ${top + r}` : ""}V${top + hgt}Z`;
        };
        spec.labels.forEach((lab, i) => {
          const g = svgEl("g", { "data-i": i }, svg);
          let acc = 0;
          spec.series.forEach((s, si) => {
            const v = s.values[i] || 0;
            let x, y0, y1;
            if (spec.stacked) {
              x = cx(i) - barW / 2; y0 = sy(acc) - (acc ? 1 : 0); acc += v; y1 = sy(acc) + (si < k - 1 ? 1 : 0);
            } else {
              x = cx(i) - groupW / 2 + si * (barW + 2); y0 = sy(0); y1 = sy(v);
            }
            const isTop = !spec.stacked || si === k - 1 || spec.series.slice(si + 1).every((o) => !o.values[i]);
            svgEl("path", { d: colPath(x, y0, y1, barW, isTop), fill: colorOf(s, si) }, g);
          });
          if (spec.valueLabels) {
            const t = svgEl("text", { x: cx(i), y: sy(spec.stacked ? totals[i] : Math.max(...spec.series.map((s) => s.values[i]))) - 6, "text-anchor": "middle", class: "lbl muted" }, g);
            t.textContent = f(spec.stacked ? totals[i] : spec.series[0].values[i]);
          }
          const hit = svgEl("rect", { x: m.l + band * i, y: m.t, width: band, height: h - m.t - m.b, class: "hit" }, g);
          hit.addEventListener("pointerenter", () => {
            host.classList.add("focus"); g.classList.add("on");
            const r = svg.getBoundingClientRect(), hr = host.getBoundingClientRect();
            const rows = spec.series.map((s, si) => ({ k: s.name, v: f(s.values[i] || 0), c: colorOf(s, si) }));
            if (spec.stacked && k > 1) rows.push({ k: "Total", v: f(totals[i]) });
            tip.show((cx(i) / w) * r.width + r.left - hr.left, (sy(spec.stacked ? totals[i] : Math.max(...spec.series.map((s) => s.values[i] || 0))) / h) * r.height + r.top - hr.top, lab, rows);
          });
          hit.addEventListener("pointerleave", () => { host.classList.remove("focus"); g.classList.remove("on"); tip.hide(); });
        });
      });
    },

    /* Bar (horizontal, ranked): {labels, series:[{name, values}], format, max} */
    bar(el, spec) {
      return mount(el, spec, "bar", (host, w) => {
        const f = fmtFn(spec.format);
        const s = spec.series[0];
        const row = 30, lw = Math.min(spec.labelWidth || 150, w * 0.38), m = { t: 4, r: 56, l: lw + 10 };
        const h = m.t + row * spec.labels.length + 4;
        const max = spec.max || niceTop(Math.max(...s.values));
        const svg = svgEl("svg", { viewBox: `0 0 ${w} ${h}`, role: "img", "aria-label": spec.title || "Bar chart" }, host);
        const sx = (v) => ((w - m.l - m.r) * v) / max;
        const tip = tipLayer(host);
        spec.labels.forEach((lab, i) => {
          const y = m.t + i * row, bh = Math.min(18, row - 10), v = s.values[i];
          const g = svgEl("g", { "data-i": i }, svg);
          const t = svgEl("text", { x: m.l - 10, y: y + row / 2 + 4, "text-anchor": "end", class: "lbl muted" }, g); t.textContent = lab;
          // Truncate labels wider than the label column (full text stays in the tooltip and table)
          if (t.getComputedTextLength && t.getComputedTextLength() > lw) {
            let txt = lab;
            while (txt.length > 1 && t.getComputedTextLength() > lw) { txt = txt.slice(0, -1); t.textContent = txt.trimEnd() + "…"; }
            const title = svgEl("title", {}, t); title.textContent = lab;
          }
          const bw = Math.max(sx(v), 1), r = Math.min(4, bw);
          svgEl("path", { d: `M${m.l} ${y + (row - bh) / 2}H${m.l + bw - r}Q${m.l + bw} ${y + (row - bh) / 2} ${m.l + bw} ${y + (row - bh) / 2 + r}V${y + (row + bh) / 2 - r}Q${m.l + bw} ${y + (row + bh) / 2} ${m.l + bw - r} ${y + (row + bh) / 2}H${m.l}Z`, fill: s.colors ? s.colors[i] : spec.color || colorOf(s, 0) }, g);
          const vt = svgEl("text", { x: m.l + bw + 6, y: y + row / 2 + 4, class: "lbl" }, g); vt.textContent = f(v);
          const hit = svgEl("rect", { x: 0, y, width: w, height: row, class: "hit" }, g);
          hit.addEventListener("pointerenter", () => {
            host.classList.add("focus"); g.classList.add("on");
            const rr = svg.getBoundingClientRect(), hr = host.getBoundingClientRect();
            tip.show(((m.l + bw / 2) / w) * rr.width + rr.left - hr.left, (y / h) * rr.height + rr.top - hr.top + 4, lab, [{ k: s.name, v: f(v), c: seriesVar(0) }]);
          });
          hit.addEventListener("pointerleave", () => { host.classList.remove("focus"); g.classList.remove("on"); tip.hide(); });
        });
        svgEl("line", { x1: m.l, x2: m.l, y1: 0, y2: h, class: "baseline" }, svg);
      });
    },

    /* Donut: {labels, values, format, center:{value,label}} — keep to ≤5 slices */
    donut(el, spec) {
      return mount(el, spec, "donut", (host, w) => {
        const f = fmtFn(spec.format);
        const size = Math.min(w, spec.size || 220), r = size / 2, ir = r * 0.64;
        const total = spec.values.reduce((a, b) => a + b, 0);
        const wrapper = document.createElement("div");
        wrapper.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:20px";
        host.appendChild(wrapper);
        const svg = svgEl("svg", { viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: "img", "aria-label": spec.title || "Donut chart", style: `width:${size}px;flex:none` }, wrapper);
        let a0 = -Math.PI / 2;
        const gap = 2 / r; // 2px surface gap
        const tip = tipLayer(host);
        spec.values.forEach((v, i) => {
          const a1 = a0 + (v / total) * Math.PI * 2;
          const s0 = a0 + gap / 2, s1 = Math.max(a1 - gap / 2, s0 + 0.001);
          const large = s1 - s0 > Math.PI ? 1 : 0;
          const p = (rad, a) => `${r + rad * Math.cos(a)} ${r + rad * Math.sin(a)}`;
          const g = svgEl("g", { "data-i": i }, svg);
          const path = svgEl("path", { d: `M${p(r, s0)}A${r} ${r} 0 ${large} 1 ${p(r, s1)}L${p(ir, s1)}A${ir} ${ir} 0 ${large} 0 ${p(ir, s0)}Z`, fill: seriesVar(i) }, g);
          path.style.cursor = "pointer";
          path.addEventListener("pointerenter", () => {
            host.classList.add("focus"); g.classList.add("on");
            const sr = svg.getBoundingClientRect(), hr = host.getBoundingClientRect();
            tip.show(sr.left - hr.left + (r + r * 0.82 * Math.cos((s0 + s1) / 2)) * (sr.width / size), sr.top - hr.top + (r + r * 0.82 * Math.sin((s0 + s1) / 2)) * (sr.height / size),
              spec.labels[i], spec.format === "pct" ? [{ k: spec.valueLabel || "Share", v: f(v), c: seriesVar(i) }] : [{ k: spec.valueLabel || "Value", v: f(v), c: seriesVar(i) }, { k: "Share", v: Kit.fmt.pct((v / total) * 100) }]);
          });
          path.addEventListener("pointerleave", () => { host.classList.remove("focus"); g.classList.remove("on"); tip.hide(); });
          a0 = a1;
        });
        if (spec.center) {
          const t1 = svgEl("text", { x: r, y: r + 2, "text-anchor": "middle", style: "font:800 " + Math.round(size / 7) + "px var(--display);fill:var(--ink)" }, svg); t1.textContent = spec.center.value;
          const t2 = svgEl("text", { x: r, y: r + size / 9, "text-anchor": "middle", class: "tick" }, svg); t2.textContent = spec.center.label || "";
        }
        const ul = document.createElement("ul");
        ul.className = "legend"; ul.style.cssText = "flex-direction:column;gap:8px;margin:0";
        ul.innerHTML = spec.labels.map((l, i) => `<li><i style="--c:${seriesVar(i)}"></i><span style="color:var(--ink);min-width:9ch">${esc(l)}</span><span class="num">${esc(f(spec.values[i]))}${spec.format === "pct" ? "" : " · " + Kit.fmt.pct((spec.values[i] / total) * 100)}</span></li>`).join("");
        wrapper.appendChild(ul);
      });
    },

    /* Sparkline for stat tiles: {values, height} — de-emphasised line, accent end dot */
    spark(el, spec) {
      return mount(el, spec, "spark", (host, w) => {
        const h = spec.height || 34, v = spec.values, min = Math.min(...v), max = Math.max(...v);
        const sx = (i) => 3 + ((w - 6) * i) / (v.length - 1), sy = (x) => 3 + (h - 6) * (1 - (x - min) / (max - min || 1));
        const svg = svgEl("svg", { viewBox: `0 0 ${w} ${h}`, "aria-hidden": "true" }, host);
        svgEl("path", { d: v.map((x, i) => (i ? "L" : "M") + sx(i).toFixed(1) + " " + sy(x).toFixed(1)).join(""), class: "line", stroke: "var(--faint)", "stroke-width": 1.5 }, svg);
        svgEl("circle", { cx: sx(v.length - 1), cy: sy(v[v.length - 1]), r: 3.5, fill: "var(--accent)", class: "dot" }, svg);
      });
    },
  };

  // Declarative charts: <div data-chart="line" data-src="REPORT.throughput"></div>
  function wireCharts() {
    $$("[data-chart]").forEach((el) => {
      if (el.dataset.wired) return;
      const kind = el.dataset.chart;
      let spec = null;
      if (el.dataset.src) spec = el.dataset.src.split(".").reduce((o, k) => (o ? o[k] : undefined), window);
      else if (el.dataset.spec) { try { spec = JSON.parse(el.dataset.spec); } catch (e) { console.warn("Bad data-spec", el); } }
      if (!spec || !Kit.chart[kind]) return;
      el.dataset.wired = "1";
      Kit.chart[kind](el, spec);
    });
  }
  Kit.wireCharts = wireCharts;

  /* ---------- Blocks: chapter menu, flow, risks, compare ---------- */
  const ex = (v) => esc(v == null ? "" : v);
  const specOf = (el, attr) => {
    const src = el.getAttribute(attr + "-src");
    if (src) return src.split(".").reduce((o, k) => (o ? o[k] : undefined), window);
    const raw = el.getAttribute(attr);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { console.warn("Bad " + attr + " JSON", el); return null; }
  };
  const pad = (n) => String(n).padStart(2, "0");

  // Chapters: section[id] or [data-chapter][id] with its own h2, in document order.
  function chapters() {
    const sel = "section[id], [data-chapter][id]";
    // Only top-level chapters: a section inside another chapter (a question inside "Decisions", a finding
    // inside "Findings") is an item of that chapter, and data-toc-skip leaves a section out entirely.
    const nested = (s) => { const outer = s.parentElement && s.parentElement.closest(sel); return Boolean(outer && (outer.hasAttribute("data-chapter") || $$("h2", outer).some((x) => x.closest(sel) === outer))); };
    return $$(sel).filter((s) => !s.closest("[data-toc], .side, .topnav, .demo, .kit-toc-sheet, [data-toc-skip]") && !nested(s)).map((s) => {
      const h = $$("h2", s).find((x) => x.closest(sel) === s);
      if (!h && !s.dataset.tocLabel) return null;
      const label = (s.dataset.tocLabel || h.textContent).replace(/\s+/g, " ").trim();
      // Items of this chapter: its h3[id] headings and the sections nested in it (questions, findings).
      // The side menu shows them as a sub-menu that folds open in the current chapter; the top bar leaves them out.
      const items = $$("h3[id], section[id], [data-chapter][id]", s).filter((x) => x !== s && !x.closest("[data-toc-skip]") &&
        (x.matches("h3") ? x.closest(sel) === s : x.parentElement.closest(sel) === s));
      const subs = items.map((x) => {
        const heading = x.matches("h3") ? x : $$("h2, h3", x).find((y) => y.closest(sel) === x);
        const text = x.dataset.tocLabel || (heading && heading.textContent) || "";
        return text.trim() ? { id: x.id, label: text.replace(/\s+/g, " ").trim() } : null;
      }).filter(Boolean);
      return { id: s.id, label, subs };
    }).filter(Boolean);
  }
  Kit.chapters = chapters;
  function toc(el) {
    const list = chapters();
    const top = el.closest(".topnav") || el.classList.contains("topnav");
    const side = el.closest(".side") || el.classList.contains("side");
    const title = el.dataset.tocTitle;
    if (top) {
      el.innerHTML = list.map((c) => `<a href="#${ex(c.id)}" title="${ex(c.label)}">${ex(c.label)}</a>`).join("");
    } else if (side) {
      el.innerHTML = (title ? `<h5>${ex(title)}</h5>` : "") + list.map((c, i) => `<div class="toc-group"><a href="#${ex(c.id)}"><b>${pad(i + 1)}</b>${ex(c.label)}</a>` +
        c.subs.map((x) => `<a class="toc-sub" href="#${ex(x.id)}">${ex(x.label)}</a>`).join("") + "</div>").join("");
    } else {
      el.classList.add("kit-toc");
      el.innerHTML = `<p class="kit-toc-title">${ex(title || "Contents")}</p><ol>` + list.map((c, i) => `<li><a href="#${ex(c.id)}"><b>${pad(i + 1)}</b><span>${ex(c.label)}</span></a></li>`).join("") + "</ol>";
    }
    el.dataset.tocWired = "1";
    wireTopSpy(); wirePhoneToc();
  }
  Kit.toc = toc;

  // Scroll-spy for top-nav chapter links the kit generated ([data-toc] inside .topnav).
  let topSpy = false, spyNow = null;
  function wireTopSpy() {
    if (topSpy || !$(".topnav [data-toc], .topnav[data-toc], .kit-toc")) return;
    topSpy = true;
    let frame = 0, pinned = null, pinTimer = null;
    const links = () => $$(".topnav [data-toc] a, .topnav[data-toc] a, .kit-toc a, .kit-toc-sheet a");
    const update = () => {
      frame = 0;
      const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bar")) || 60;
      const line = bar + Math.min(innerHeight * 0.25, 220);
      const ids = chapters().map((c) => c.id);
      let current = pinned;
      if (!current) {
        for (const id of ids) { const t = document.getElementById(id); if (t && t.getClientRects().length && t.getBoundingClientRect().top <= line) current = id; }
        if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) {
          const vis = ids.filter((id) => { const t = document.getElementById(id); return t && t.getBoundingClientRect().top < innerHeight; });
          if (vis.length) current = vis[vis.length - 1];
        }
        if (!current) current = ids[0];
      }
      links().forEach((a) => {
        const on = a.getAttribute("href") === "#" + current;
        a.classList.toggle("cur", on);
        if (on) { a.setAttribute("aria-current", "location"); const nav = a.closest(".topnav"); if (nav && nav.scrollWidth > nav.clientWidth) { const r = a.getBoundingClientRect(), nr = nav.getBoundingClientRect(); if (r.left < nr.left || r.right > nr.right) nav.scrollLeft += r.left - nr.left - 24; } }
        else if (a.getAttribute("aria-current") === "location") a.removeAttribute("aria-current");
      });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    spyNow = update;
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    document.addEventListener("click", (e) => {
      const a = e.target.closest('.topnav a[href^="#"], .kit-toc a[href^="#"], .kit-toc-sheet a[href^="#"]');
      if (!a) return;
      pinned = a.getAttribute("href").slice(1); schedule(); clearTimeout(pinTimer);
      pinTimer = setTimeout(() => { pinned = null; schedule(); }, 900);
    });
    schedule();
  }

  // Phones hide .topnav; a Contents button in the top bar opens the same chapter links.
  function wirePhoneToc() {
    const bar = $(".topbar"), nav = bar && $(".topnav", bar);
    if (!nav || $(".kit-toc-btn", bar)) return;
    const inPage = () => $$('a[href^="#"]', nav).filter((a) => a.getAttribute("href").length > 1);
    if (!inPage().length) {
      // Links to other pages: keep them, but fade the edge when they overflow so readers know to scroll.
      const mark = () => nav.classList.toggle("kit-scrolls", nav.scrollWidth > nav.clientWidth + 2 && nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 2);
      mark(); addEventListener("resize", mark); nav.addEventListener("scroll", mark, { passive: true });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(mark);
      return;
    }
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "icon-btn kit-toc-btn"; btn.setAttribute("data-kit-made", "");
    btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-controls", "kit-toc-sheet");
    btn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4h11M2.5 8h11M2.5 12h7" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/></svg><span>Contents</span>';
    nav.insertAdjacentElement("afterend", btn);
    const sheet = document.createElement("nav");
    sheet.className = "kit-toc-sheet"; sheet.id = "kit-toc-sheet"; sheet.hidden = true; sheet.setAttribute("aria-label", "Contents"); sheet.setAttribute("data-kit-made", "");
    document.body.appendChild(sheet);
    const close = () => { sheet.hidden = true; btn.setAttribute("aria-expanded", "false"); };
    btn.addEventListener("click", () => {
      if (!sheet.hidden) return close();
      const cur = $('a[aria-current]', nav) ;
      sheet.innerHTML = '<p class="kit-toc-title">Contents</p><ol>' + inPage().map((a, i) => `<li><a href="${ex(a.getAttribute("href"))}"${a === cur || a.classList.contains("cur") ? ' aria-current="location" class="cur"' : ""}><b>${pad(i + 1)}</b><span>${ex(a.getAttribute("title") || a.textContent.trim())}</span></a></li>`).join("") + "</ol>";
      sheet.hidden = false; btn.setAttribute("aria-expanded", "true");
      if (spyNow && $("[data-toc]", bar)) spyNow();
      const first = $(".cur", sheet) || $("a", sheet); if (first) first.focus({ preventScroll: true });
    });
    sheet.addEventListener("click", (e) => { if (e.target.closest("a")) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !sheet.hidden) { close(); btn.focus(); } });
    document.addEventListener("click", (e) => { if (!sheet.hidden && !sheet.contains(e.target) && !btn.contains(e.target)) close(); });
    // When the chapter links do not fit the bar (many or long chapters), use the Contents button on
    // wide screens too, instead of cutting links off.
    const fit = () => {
      bar.classList.remove("kit-nav-overflow");
      if (innerWidth > 760 && nav.scrollWidth > nav.clientWidth + 2) bar.classList.add("kit-nav-overflow");
      if (!sheet.hidden && innerWidth > 760 && !bar.classList.contains("kit-nav-overflow")) close();
    };
    fit(); addEventListener("resize", fit);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    document.addEventListener("kit:style", fit);
  }
  // A chapter menu belongs in the sticky top bar. A nav.topnav[data-toc] placed in the page body is
  // moved into the page's .topbar (after the brand) when the bar has no chapter menu of its own.
  function placeTopToc() {
    const bar = $(".topbar"); if (!bar) return;
    $$(".topnav[data-toc], .topnav:has([data-toc])").forEach((nav) => {
      if (nav.closest(".topbar") || $(".topnav", bar)) return;
      const brand = $(".brand", bar);
      if (brand && brand.parentNode === bar) brand.after(nav); else bar.prepend(nav);
    });
  }
  function wireTocs() { placeTopToc(); $$("[data-toc]").forEach((el) => { if (!el.dataset.tocWired) toc(el); }); wirePhoneToc(); }

  // Flow diagram: boxes with arrows; a column on phones or with direction:"column".
  const arrow = '<li class="flow-arrow" aria-hidden="true"><svg viewBox="0 0 24 12"><path d="M1 6h20m-5-4.5L21 6l-5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></li>';
  function flow(el, spec) {
    if (!spec) return;
    const rows = spec.rows || [{ label: spec.label, steps: spec.steps || [] }];
    const step = (st, i) => `<li class="flow-step${st.highlight ? " on" : ""}"><span class="flow-n">${pad(i + 1)}</span>` +
      `<b>${ex(st.title)}</b>${st.text ? `<p>${ex(st.text)}</p>` : ""}` +
      (st.tag ? `<span class="tag ${ex(st.tagTone || "outline")}">${ex(st.tag)}</span>` : "") +
      (st.files && st.files.length ? `<p class="files">${st.files.map((f) => `<code>${ex(f)}</code>`).join(" ")}</p>` : "") + "</li>";
    el.classList.add("kit-flow");
    el.classList.toggle("col", spec.direction === "column");
    el.innerHTML = rows.map((r) => `<div class="flow-row">${r.label ? `<p class="flow-label">${ex(r.label)}</p>` : ""}` +
      `<ol class="flow-steps"${r.label ? ` aria-label="${ex(r.label)}"` : ""}>${r.steps.map((st, i) => (i ? arrow : "") + step(st, i)).join("")}</ol></div>`).join("") +
      (spec.caption ? `<p class="flow-caption">${ex(spec.caption)}</p>` : "");
    el.dataset.wired = "1";
  }
  Kit.flow = flow;

  // Risk table with worded likelihood (and impact) tags.
  const LEVEL = { low: ["good", "Low"], medium: ["warn", "Medium"], high: ["bad", "High"] };
  const level = (v) => { const k = String(v || "").toLowerCase(); return LEVEL[k] ? `<span class="tag ${LEVEL[k][0]} dot">${LEVEL[k][1]}</span>` : ex(v); };
  function risks(el, list) {
    if (!Array.isArray(list)) return;
    const impact = list.some((r) => r.impact);
    el.innerHTML = `<div class="table-wrap"><table class="table kit-risks"><thead><tr><th>Risk</th><th>Likelihood</th>${impact ? "<th>Impact</th>" : ""}<th>How the plan handles it</th></tr></thead><tbody>` +
      list.map((r) => `<tr><td>${ex(r.risk)}</td><td>${level(r.likelihood)}</td>${impact ? `<td>${level(r.impact)}</td>` : ""}<td>${ex(r.plan)}</td></tr>`).join("") + "</tbody></table></div>";
    el.dataset.wired = "1";
  }
  Kit.risks = risks;

  /* ---------- Images: lazy loading, missing files, full-size viewer ---------- */
  const svgIcon = (d, extra = "") => `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"${extra}/></svg>`;
  const ICON = {
    prev: svgIcon("M10 3L5 8l5 5"), next: svgIcon("M6 3l5 5-5 5"), close: svgIcon("M3.5 3.5l9 9M12.5 3.5l-9 9"),
    zoom: svgIcon("M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM10.3 10.3L14 14M5 7h4M7 5v4"),
    open: svgIcon("M9 2.5h4.5V7M13.5 2.5L7.5 8.5M12 9.5v3.5H3V4h3.5"),
    pins: svgIcon("M8 14s4.5-4 4.5-7.5a4.5 4.5 0 0 0-9 0C3.5 10 8 14 8 14zM8 5v3"),
    expand: svgIcon("M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"),
  };
  const num = (v) => (v == null || v === "" ? undefined : +v);
  let lazyIO = null;
  function loadImage(img) {
    if (img.dataset.srcset) { img.srcset = img.dataset.srcset; delete img.dataset.srcset; }
    if (img.dataset.sizes) { img.sizes = img.dataset.sizes; delete img.dataset.sizes; }
    if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
  }
  function watchImage(img) {
    if (img.dataset.kitImg) return;
    img.dataset.kitImg = "1";
    const done = () => { img.dataset.state = "loaded"; };
    const fail = () => {
      img.dataset.state = "error";
      if (img.nextElementSibling && img.nextElementSibling.classList.contains("kit-img-missing")) return;
      const box = document.createElement("span");
      box.className = "kit-img-missing"; box.setAttribute("role", "img"); box.setAttribute("aria-label", img.alt || "Missing image");
      box.innerHTML = `<b>Image not found</b><code>${esc(img.getAttribute("src") || "")}</code>`;
      const w = img.getAttribute("width"), h = img.getAttribute("height");
      if (w && h) box.style.aspectRatio = w + " / " + h;
      img.after(box);
    };
    img.addEventListener("load", done);
    img.addEventListener("error", fail);
    if ((img.getAttribute("src") || img.getAttribute("srcset")) && img.complete) { if (img.naturalWidth) img.dataset.state = "ready"; else img.decode().then(done, fail); }
    else img.dataset.state = "loading";
    if (img.hasAttribute("data-lightbox") && !img.closest("a, button")) {
      img.tabIndex = 0; img.setAttribute("role", "button");
      if (!img.getAttribute("aria-label")) img.setAttribute("aria-label", "Open " + (img.alt || "image") + " full size");
    }
  }
  function wireImages(root = document) {
    $$("img[data-src], img[data-srcset], img[loading='lazy'], img[data-lightbox], .kit-gallery img", root).forEach(watchImage);
    const lazy = $$("img[data-src], img[data-srcset]", root);
    if (!lazy.length) return;
    if (!("IntersectionObserver" in window)) return lazy.forEach(loadImage);
    lazyIO = lazyIO || new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { lazyIO.unobserve(en.target); loadImage(en.target); }
    }), { rootMargin: "600px 400px" });
    lazy.forEach((img) => lazyIO.observe(img));
  }
  Kit.images = {
    wire: wireImages,
    loadAll() { $$("img[data-src], img[data-srcset]").forEach(loadImage); $$("img[loading='lazy']").forEach((i) => (i.loading = "eager")); },
  };
  addEventListener("beforeprint", () => Kit.images.loadAll());

  // Image items: {src, full, thumb, alt, title, caption, w, h, notes:[{x, y, w, h, title, text}]} (x/y/w/h in % of the image).
  const itemFromImg = (img) => {
    const fig = img.closest("figure"), cap = fig && $("figcaption", fig);
    let notes; try { notes = img.dataset.notes ? JSON.parse(img.dataset.notes) : undefined; } catch (e) { console.warn("Bad data-notes JSON", img); }
    return { src: img.dataset.full || img.dataset.src || img.getAttribute("src"), alt: img.alt, title: img.title || "",
      caption: cap ? cap.textContent.trim() : "", w: num(img.getAttribute("width")), h: num(img.getAttribute("height")), notes };
  };
  const fullOf = (it) => it.full || it.src;
  // Pins (x, y) and boxes (x, y, w, h) over an image, numbered in note order.
  const pinsHtml = (notes, opts = {}) => (notes || []).map((n, k) => {
    const box = n.w != null && n.h != null;
    const style = `left:${+n.x || 0}%;top:${+n.y || 0}%` + (box ? `;width:${+n.w || 0}%;height:${+n.h || 0}%` : "");
    const label = (n.title ? n.title + ": " : "") + (n.text || "");
    return `<${opts.buttons ? 'button type="button"' : "span"} class="kit-pin${box ? " box" : ""}" data-note="${k}" style="${style}" ${opts.buttons ? `aria-label="Note ${k + 1}: ${ex(label)}"` : 'aria-hidden="true"'} title="${ex(label)}"><i>${k + 1}</i></${opts.buttons ? "button" : "span"}>`;
  }).join("");
  const notesListHtml = (notes, cls) => notes && notes.length ? `<ol class="${cls}">${notes.map((n, k) => `<li data-note="${k}"><span class="kit-pin-n">${k + 1}</span><span>${n.title ? `<b>${ex(n.title)}</b> ` : ""}${ex(n.text)}</span></li>`).join("")}</ol>` : "";

  let lb = null;
  function lightbox() {
    if (lb) return lb;
    const el = document.createElement("div");
    el.className = "kit-lb"; el.hidden = true; el.tabIndex = -1; el.setAttribute("data-kit-made", "");
    el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Image viewer");
    el.innerHTML = `<div class="kit-lb-bar"><span class="kit-lb-count"></span><b class="kit-lb-title"></b><span class="spacer"></span>
      <button type="button" class="icon-btn" data-lb="pins" aria-pressed="true" title="Show notes on the image">${ICON.pins}<span>Notes</span></button>
      <button type="button" class="icon-btn" data-lb="zoom" aria-pressed="false" title="Actual size (Z)">${ICON.zoom}<span>Actual size</span></button>
      <a class="icon-btn" data-lb="open" target="_blank" rel="noopener" title="Open the image in a new tab" aria-label="Open the image in a new tab">${ICON.open}</a>
      <button type="button" class="icon-btn" data-lb="close" aria-label="Close (Esc)" title="Close (Esc)">${ICON.close}</button></div>
      <div class="kit-lb-stage"><figure class="kit-lb-fig"><img alt=""><div class="kit-lb-pins"></div></figure></div>
      <button type="button" class="kit-lb-nav prev" data-lb="prev" aria-label="Previous image">${ICON.prev}</button>
      <button type="button" class="kit-lb-nav next" data-lb="next" aria-label="Next image">${ICON.next}</button>
      <div class="kit-lb-cap" aria-live="polite"></div>`;
    document.body.appendChild(el);
    const img = $(".kit-lb-fig img", el), stage = $(".kit-lb-stage", el), btn = (k) => $(`[data-lb="${k}"]`, el);
    img.addEventListener("error", () => { if (img.getAttribute("src")) el.classList.add("missing"); });
    $(".kit-lb-fig", el).insertAdjacentHTML("beforeend", '<span class="kit-img-missing kit-lb-missing">Image not found</span>');
    const s = { items: [], i: 0, zoom: false, pins: true, last: null };
    const paint = () => {
      const it = s.items[s.i], many = s.items.length > 1, notes = (it.notes || []).length;
      img.src = fullOf(it); img.alt = it.alt || it.title || "";
      if (it.w && it.h) { img.width = it.w; img.height = it.h; } else { img.removeAttribute("width"); img.removeAttribute("height"); }
      $(".kit-lb-count", el).textContent = many ? `${s.i + 1} / ${s.items.length}` : "";
      $(".kit-lb-title", el).textContent = it.title || it.alt || "";
      $(".kit-lb-pins", el).innerHTML = pinsHtml(it.notes);
      $(".kit-lb-cap", el).innerHTML = (it.caption ? `<p>${ex(it.caption)}</p>` : "") + (s.pins ? notesListHtml(it.notes, "kit-lb-notes") : "");
      $(".kit-lb-cap", el).hidden = !it.caption && !(s.pins && notes);
      btn("pins").hidden = !notes; btn("pins").setAttribute("aria-pressed", String(s.pins));
      btn("open").href = /^\s*javascript:/i.test(fullOf(it)) ? "#" : fullOf(it);
      el.classList.remove("missing");
      btn("prev").hidden = btn("next").hidden = !many;
      el.classList.toggle("zoomed", s.zoom); el.classList.toggle("no-pins", !s.pins);
      btn("zoom").setAttribute("aria-pressed", String(s.zoom));
    };
    const go = (d) => { if (s.items.length < 2) return; s.i = (s.i + d + s.items.length) % s.items.length; s.zoom = false; paint(); stage.scrollTo(0, 0); };
    const close = () => {
      el.hidden = true; img.removeAttribute("src"); document.documentElement.classList.remove("kit-lb-open");
      if (window.artifactToolbar) window.artifactToolbar.hide(false);
      if (s.last && s.last.focus) s.last.focus({ preventScroll: true });
    };
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-lb]"), k = b && b.dataset.lb;
      if (k === "close") close(); else if (k === "prev") go(-1); else if (k === "next") go(1);
      else if (k === "zoom") { s.zoom = !s.zoom; paint(); }
      else if (k === "pins") { s.pins = !s.pins; paint(); }
      else if (e.target === img) { s.zoom = !s.zoom; paint(); }
      else if (e.target === stage) close();
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "ArrowLeft" && !s.zoom) { e.preventDefault(); go(-1); }
      else if (e.key === "ArrowRight" && !s.zoom) { e.preventDefault(); go(1); }
      else if ((e.key === "z" || e.key === "Z") && !e.ctrlKey && !e.metaKey) { s.zoom = !s.zoom; paint(); }
      else if (e.key === "Tab") { // keep focus inside the viewer
        const f = $$("button:not([hidden]), a[href]:not([hidden])", el), first = f[0], last = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    let sx = null; // swipe between images when not zoomed
    stage.addEventListener("pointerdown", (e) => { sx = s.zoom || e.pointerType === "mouse" ? null : e.clientX; });
    stage.addEventListener("pointerup", (e) => { if (sx != null && Math.abs(e.clientX - sx) > 50) go(e.clientX < sx ? 1 : -1); sx = null; });
    stage.addEventListener("pointercancel", () => { sx = null; });
    lb = {
      open(items, index = 0) {
        if (!items || !items.length) return;
        if (el.hidden) s.last = document.activeElement;
        s.items = items; s.i = Math.max(0, Math.min(items.length - 1, index)); s.zoom = false;
        paint(); el.hidden = false; document.documentElement.classList.add("kit-lb-open");
        if (window.artifactToolbar) window.artifactToolbar.hide(true);
        btn("close").focus({ preventScroll: true });
      },
      close,
    };
    return lb;
  }
  Kit.lightbox = { open: (items, index) => lightbox().open(items, index), close: () => lb && lb.close() };
  function openFromImg(img) {
    const group = img.dataset.lightbox;
    const imgs = group ? $$("img[data-lightbox]").filter((x) => x.dataset.lightbox === group) : [img];
    Kit.lightbox.open(imgs.map(itemFromImg), imgs.indexOf(img));
  }
  document.addEventListener("click", (e) => {
    const img = e.target.closest && e.target.closest("img[data-lightbox]");
    if (img && !img.closest(".kit-lb, a")) { e.preventDefault(); openFromImg(img); }
  });
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("img[data-lightbox][role=button]")) { e.preventDefault(); openFromImg(e.target); }
  });

  /* ---------- Gallery ([data-gallery]) ---------- */
  // Arrow keys move between tabs of a tab list (thumbnails, the sidebar list).
  function roving(list, select) {
    list.addEventListener("keydown", (e) => {
      const tabs = $$("[role=tab]", list), i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key], j = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : d ? (i + d + tabs.length) % tabs.length : -1;
      if (j < 0) return;
      e.preventDefault(); tabs[j].focus(); select(j);
    });
  }
  function gallerySpec(el) {
    const src = el.getAttribute("data-gallery-src"), raw = (el.getAttribute("data-gallery") || "").trim();
    let spec = {};
    if (src) spec = src.split(".").reduce((o, k) => (o ? o[k] : undefined), window) || {};
    else if (raw[0] === "{" || raw[0] === "[") { try { spec = JSON.parse(raw); } catch (e) { console.warn("Bad data-gallery JSON", el); } }
    else if (raw) spec = { layout: raw };
    if (Array.isArray(spec)) spec = { items: spec };
    if (!spec.items) spec.items = $$(":scope > figure, :scope > img", el).map((n) => {
      const img = n.matches("img") ? n : $("img", n);
      if (!img) return null;
      const it = itemFromImg(img), cap = n.matches("figure") && $("figcaption", n), head = cap && $("b, strong", cap);
      if (head) { it.title = it.title || head.textContent.trim(); it.caption = cap.textContent.replace(head.textContent, "").trim().replace(/^[·:—–-]\s*/, ""); }
      return it;
    }).filter(Boolean);
    return spec;
  }
  const dims = (it) => (+it.w > 0 && +it.h > 0 ? ` width="${Math.round(+it.w)}" height="${Math.round(+it.h)}"` : ""); // numbers only
  const thumbImg = (it, cls = "") => `<img class="${cls}" data-src="${ex(it.thumb || it.src)}" alt="${ex(it.alt || "")}"${dims(it)} decoding="async">`;
  const shotHtml = (it, frame) => {
    const img = `<span class="kit-g-shot"><img src="${ex(it.src)}" alt="${ex(it.alt || it.title || "")}"${dims(it)} decoding="async">${pinsHtml(it.notes, { buttons: true })}</span>`;
    return frame ? `<div class="kit-g-frame"><div class="bar"><i></i><i></i><i></i><span>${ex(it.url || it.title || "")}</span></div>${img}</div>` : img;
  };
  const capHtml = (it, i, n, notes) => `<div class="kit-g-cap">${n > 1 ? `<span class="kit-g-n">${pad(i + 1)} / ${pad(n)}</span>` : ""}${it.title ? `<b>${ex(it.title)}</b>` : ""}${it.caption ? `<p>${ex(it.caption)}</p>` : ""}${notes ? notesListHtml(it.notes, "kit-g-notes") : ""}</div>`;
  const expandBtn = `<button type="button" class="icon-btn kit-g-expand" data-open aria-label="Open full size" title="Open full size">${ICON.expand}</button>`;

  function gallery(el, spec) {
    spec = spec || gallerySpec(el);
    const items = (spec.items || []).filter((it) => it && it.src);
    const layout = ["grid", "masonry", "strip", "sidebar", "annotated", "compare"].includes(spec.layout) ? spec.layout : "grid";
    el.className = el.className.replace(/\bkit-g-\S+/g, "").trim();
    el.classList.add("kit-gallery", "kit-g-" + layout);
    if (spec.min) el.style.setProperty("--min", typeof spec.min === "number" ? spec.min + "px" : spec.min);
    if (spec.ratio) el.style.setProperty("--ratio", spec.ratio);
    el.dataset.wired = "1";
    if (!items.length) { el.innerHTML = '<p class="muted">No images.</p>'; return {}; }
    const open = (i) => Kit.lightbox.open(items, i);
    let api = {};

    if (layout === "grid" || layout === "masonry") {
      el.innerHTML = `<ul class="kit-g-tiles">${items.map((it, i) => `<li><figure>
        <button type="button" class="kit-g-tile" data-i="${i}" aria-label="Open ${ex(it.title || it.alt || "image " + (i + 1))} full size">${thumbImg(it)}${it.tag ? `<span class="kit-g-tag">${ex(it.tag)}</span>` : ""}${it.notes && it.notes.length ? `<span class="kit-g-count">${it.notes.length} note${it.notes.length === 1 ? "" : "s"}</span>` : ""}</button>
        ${it.title || it.caption ? `<figcaption>${it.title ? `<b>${ex(it.title)}</b>` : ""}${it.caption ? `<span>${ex(it.caption)}</span>` : ""}</figcaption>` : ""}</figure></li>`).join("")}</ul>`;
      el.addEventListener("click", (e) => { const t = e.target.closest(".kit-g-tile"); if (t) open(+t.dataset.i); });
    }

    else if (layout === "compare") {
      const [a, b] = items;
      el.innerHTML = `<div class="kit-g-cmp" style="--pos:50%">
        <span class="kit-g-shot after"><img src="${ex((b || a).src)}" alt="${ex((b || a).alt || (b || a).title || "After")}"${dims(b || a)}></span>
        <span class="kit-g-shot before" aria-hidden="true"><img src="${ex(a.src)}" alt=""></span>
        <span class="kit-g-cmp-line" aria-hidden="true"><i></i></span>
        <span class="kit-g-cmp-lbl l">${ex(a.title || "Before")}</span><span class="kit-g-cmp-lbl r">${ex((b && b.title) || "After")}</span>
        <input type="range" min="0" max="100" value="50" step="0.5" aria-label="Divider: drag left for ${ex((b && b.title) || "after")}, right for ${ex(a.title || "before")}">
      </div>${a.caption || (b && b.caption) ? `<div class="kit-g-cap">${a.caption ? `<p><b>${ex(a.title || "Before")}</b> ${ex(a.caption)}</p>` : ""}${b && b.caption ? `<p><b>${ex(b.title || "After")}</b> ${ex(b.caption)}</p>` : ""}</div>` : ""}`;
      const box = $(".kit-g-cmp", el), range = $("input", el);
      range.addEventListener("input", () => box.style.setProperty("--pos", range.value + "%"));
      api.set = (p) => { range.value = p; box.style.setProperty("--pos", p + "%"); };
    }

    else { // strip, sidebar, annotated: one image at a time
      const notes = layout !== "strip" || items.some((it) => it.notes && it.notes.length);
      const tabs = layout === "sidebar"
        ? `<ol class="kit-g-list" role="tablist" aria-orientation="vertical" aria-label="Images">${items.map((it, i) => `<li><button type="button" role="tab" data-i="${i}"><span class="n">${pad(i + 1)}</span><span class="t"><b>${ex(it.title || it.alt || "Image " + (i + 1))}</b>${it.caption ? `<small>${ex(it.caption)}</small>` : ""}</span></button></li>`).join("")}</ol>`
        : items.length > 1 ? `<div class="kit-g-thumbs" role="tablist" aria-label="Images">${items.map((it, i) => `<button type="button" role="tab" data-i="${i}" aria-label="${ex(it.title || it.alt || "Image " + (i + 1))}" title="${ex(it.title || "")}">${thumbImg(it)}</button>`).join("")}</div>` : "";
      el.innerHTML = (layout === "annotated" ? tabs : "") +
        `<div class="kit-g-body"><div class="kit-g-view" role="tabpanel"><div class="kit-g-stage"></div>${items.length > 1 && layout === "strip" ? `<button type="button" class="kit-g-arrow prev" data-step="-1" aria-label="Previous image">${ICON.prev}</button><button type="button" class="kit-g-arrow next" data-step="1" aria-label="Next image">${ICON.next}</button>` : ""}${expandBtn}</div><div class="kit-g-text"></div></div>` +
        (layout === "strip" ? tabs : "");
      if (layout === "sidebar") el.insertAdjacentHTML("afterbegin", tabs);
      const stage = $(".kit-g-stage", el), text = $(".kit-g-text", el), list = $("[role=tablist]", el);
      let cur = -1;
      const select = (i, focus) => {
        i = ((i % items.length) + items.length) % items.length;
        if (i === cur) return;
        cur = i;
        const it = items[i];
        stage.innerHTML = shotHtml(it, spec.frame);
        text.innerHTML = capHtml(it, i, items.length, notes);
        wireImages(stage);
        $$("[role=tab]", el).forEach((t, k) => { t.setAttribute("aria-selected", String(k === i)); t.tabIndex = k === i ? 0 : -1; });
        const tab = $$("[role=tab]", el)[i];
        if (tab && list && list.scrollWidth > list.clientWidth + 2) list.scrollTo({ left: tab.offsetLeft - list.clientWidth / 2 + tab.offsetWidth / 2, behavior: "smooth" });
        if (focus && tab) tab.focus();
        el.dispatchEvent(new CustomEvent("kit:gallery", { detail: { index: i, item: it } }));
      };
      const mark = (k) => { $$("[data-note]", el).forEach((n) => n.classList.toggle("on", n.dataset.note === k)); };
      el.addEventListener("click", (e) => {
        const t = e.target.closest("[role=tab]"), step = e.target.closest("[data-step]"), pin = e.target.closest(".kit-pin");
        if (t) select(+t.dataset.i);
        else if (step) select(cur + +step.dataset.step);
        else if (pin) { mark(pin.dataset.note); const li = $(`.kit-g-notes [data-note="${pin.dataset.note}"]`, el); if (li && li.getBoundingClientRect().top > innerHeight) li.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
        else if (e.target.closest("[data-open]") || e.target.closest(".kit-g-shot img")) open(cur);
      });
      el.addEventListener("pointerover", (e) => { const n = e.target.closest("[data-note]"); if (n) mark(n.dataset.note); });
      el.addEventListener("pointerout", (e) => { if (e.target.closest("[data-note]")) mark(null); });
      if (list) roving(list, select);
      $(".kit-g-view", el).addEventListener("keydown", (e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") { if (e.target.closest("[role=tab]")) return; e.preventDefault(); select(cur + (e.key === "ArrowRight" ? 1 : -1)); }
      });
      select(Math.min(items.length - 1, Math.max(0, Math.round(+spec.start) || 0)));
      api.select = select;
    }
    wireImages(el);
    return api;
  }
  Kit.gallery = gallery;

  /* ---------- Code: syntax colouring ---------- */
  // Line-based and display-only: comments, strings, keywords, numbers, function names, keys/attributes.
  const LANGS = (() => {
    const kw = (words, flags = "") => [`\\b(?:${words.trim().split(/\s+/).join("|")})\\b`, flags];
    const STR = `"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'`, NUM = "\\b(?:0x[\\da-fA-F]+|\\d[\\d_]*(?:\\.\\d+)?(?:e[+-]?\\d+)?)\\b";
    const C_KW = "abstract as async await break case catch class const continue debugger default defer delete do else enum export extends false final finally fn for func from function go if impl implements import in instanceof interface let match mod mut namespace new nil null of override package private protected pub public readonly return satisfies self static struct super switch this throw trait true try type typeof undefined use var void where while with yield";
    const make = (parts, block) => {
      const re = new RegExp(parts.map(([, s]) => `(${s})`).join("|"), "g" + (parts.some(([, , f]) => f === "i") ? "i" : ""));
      return { re, classes: parts.map(([c]) => c), block };
    };
    const c = make([["c", "\\/\\/.*$"], ["c", "\\/\\*.*?\\*\\/"], ["open", "\\/\\*.*$"], ["s", STR + "|`(?:[^`\\\\]|\\\\.)*`"], ["k", ...kw(C_KW)], ["n", NUM], ["f", "\\b[A-Za-z_$][\\w$]*(?=\\s*\\()"]], "*/");
    const py = make([["c", "#.*$"], ["s", '"""[^]*?"""|' + STR + "|`[^`]*`"], ["k", ...kw("and as assert async await begin break class continue def del do elif else end ensure except False finally for from global if import in is lambda module None nonlocal not or pass raise require rescue return self True try unless until while with yield")], ["n", NUM], ["f", "\\b[A-Za-z_]\\w*(?=\\()"]]);
    const sh = make([["c", "(?:^|\\s)#.*$"], ["s", STR], ["a", "^\\s*-?\\s*[\\w.-]+(?=\\s*[:=](?:\\s|$))"], ["v", "\\$\\{?[\\w@#?*]+\\}?"], ["k", ...kw("case do done elif else esac export fi for function if in local return then until while true false null")], ["n", NUM]]);
    const css = make([["c", "\\/\\*.*?\\*\\/"], ["open", "\\/\\*.*$"], ["s", STR], ["k", "@[\\w-]+|!important"], ["a", "(?<![\\w-])(?:--?[\\w-]+(?=\\s*:)|[\\w-]+(?=\\s*:[^:{;]*(?:;|$)))"], ["n", "#[\\da-fA-F]{3,8}\\b|-?\\b\\d*\\.?\\d+(?:px|r?em|%|vh|vw|dvh|ch|ms|s|deg|fr)?\\b"], ["f", "(?<![\\w-])[\\w-]+(?=\\()"]], "*/");
    const html = make([["c", "<!--.*?-->"], ["open", "<!--.*$"], ["k", "<\\/?[\\w-]+|\\/?>"], ["a", "\\b[\\w:@.-]+(?==)"], ["s", STR]], "-->");
    const json = make([["a", '"(?:[^"\\\\]|\\\\.)*"(?=\\s*:)'], ["s", '"(?:[^"\\\\]|\\\\.)*"'], ["k", ...kw("true false null")], ["n", "-?\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b"]]);
    const sql = make([["c", "--.*$"], ["s", STR], ["k", ...kw("add all alter and as asc begin between by case commit create default delete desc distinct drop else end exists from group having if in index inner insert into is join key left like limit not null offset on or order outer primary references returning right select set table then union unique update values when where with", "i")], ["n", NUM]]);
    const map = { c, py, sh, css, html, json, sql };
    const alias = { js: "c", mjs: "c", cjs: "c", jsx: "c", ts: "c", tsx: "c", javascript: "c", typescript: "c", java: "c", kt: "c", kotlin: "c", go: "c", rs: "c", rust: "c", swift: "c", cs: "c", csharp: "c", cpp: "c", cc: "c", h: "c", hpp: "c", php: "c", scala: "c", dart: "c",
      python: "py", rb: "py", ruby: "py", bash: "sh", shell: "sh", zsh: "sh", console: "sh", yml: "sh", yaml: "sh", toml: "sh", ini: "sh", env: "sh", dockerfile: "sh", makefile: "sh", conf: "sh",
      scss: "css", less: "css", htm: "html", xml: "html", svg: "html", vue: "html", svelte: "html", jsonc: "json", json5: "json", psql: "sql" };
    return (name) => { name = String(name || "").toLowerCase(); return map[name] || map[alias[name]] || null; };
  })();
  const langOf = (spec) => spec.lang || (/\.([\w]+)$/.exec(spec.file || "") || [])[1] || (/(Dockerfile|Makefile)$/i.exec(spec.file || "") || [])[1];
  // Tokens of one line: [{c, t}]; st carries an open block comment between lines.
  function tokenize(text, g, st) {
    const out = [];
    if (!g) return [{ c: "", t: text }];
    let i = 0;
    if (st.open) {
      const end = text.indexOf(g.block);
      if (end < 0) return [{ c: "c", t: text }];
      out.push({ c: "c", t: text.slice(0, end + g.block.length) }); i = end + g.block.length; st.open = false;
    }
    g.re.lastIndex = i;
    let last = i, m;
    while ((m = g.re.exec(text))) {
      if (!m[0]) { g.re.lastIndex++; continue; }
      if (m.index > last) out.push({ c: "", t: text.slice(last, m.index) });
      let cls = g.classes[m.slice(1).findIndex((x) => x !== undefined)];
      if (cls === "open") { cls = "c"; st.open = true; }
      out.push({ c: cls, t: m[0] });
      last = g.re.lastIndex;
    }
    if (last < text.length) out.push({ c: "", t: text.slice(last) });
    return out;
  }
  // HTML for tokens, with optional [from, to) character ranges marked as changed words.
  function tokensHtml(tokens, marks) {
    let pos = 0, html = "";
    const inMark = (p) => marks && marks.some(([a, b]) => p >= a && p < b);
    for (const tk of tokens) {
      let start = 0;
      while (start < tk.t.length) { // split the token where a mark starts or ends
        const on = inMark(pos + start);
        let end = start + 1;
        while (end < tk.t.length && inMark(pos + end) === on) end++;
        const piece = esc(tk.t.slice(start, end)), inner = tk.c ? `<span class="tk-${tk.c}">${piece}</span>` : piece;
        html += on ? `<mark class="kd-w">${inner}</mark>` : inner;
        start = end;
      }
      pos += tk.t.length;
    }
    return html;
  }
  Kit.highlight = (text, lang) => {
    const g = LANGS(lang), st = {};
    return String(text).split("\n").map((l) => tokensHtml(tokenize(l, g, st))).join("\n");
  };
  function wireCode(root = document) {
    $$("pre[data-lang]", root).forEach((pre) => {
      if (pre.dataset.hl) return;
      pre.dataset.hl = "1";
      const copy = $(".copy", pre); if (copy) copy.remove();
      pre.innerHTML = Kit.highlight(pre.textContent.replace(/^\n/, ""), pre.dataset.lang);
      if (copy) pre.appendChild(copy);
    });
  }

  /* ---------- Code diff ([data-diff]) ---------- */
  // Longest common subsequence between two arrays: returns ops "ctx" | "del" | "add" in order.
  function lcsOps(A, B, eq = (x, y) => x === y) {
    let s = 0, e = 0;
    while (s < A.length && s < B.length && eq(A[s], B[s])) s++;
    while (e < A.length - s && e < B.length - s && eq(A[A.length - 1 - e], B[B.length - 1 - e])) e++;
    const a = A.slice(s, A.length - e), b = B.slice(s, B.length - e), n = a.length, m = b.length, ops = Array(s).fill("ctx");
    if (n * m > 4e6) { a.forEach(() => ops.push("del")); b.forEach(() => ops.push("add")); }
    else {
      const L = new Uint32Array((n + 1) * (m + 1)), at = (i, j) => i * (m + 1) + j;
      for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[at(i, j)] = eq(a[i], b[j]) ? L[at(i + 1, j + 1)] + 1 : Math.max(L[at(i + 1, j)], L[at(i, j + 1)]);
      let i = 0, j = 0;
      while (i < n || j < m) {
        if (i < n && j < m && eq(a[i], b[j])) { ops.push("ctx"); i++; j++; }
        else if (j >= m || (i < n && L[at(i + 1, j)] >= L[at(i, j + 1)])) { ops.push("del"); i++; }
        else { ops.push("add"); j++; }
      }
    }
    for (let k = 0; k < e; k++) ops.push("ctx");
    return ops;
  }
  // Changed words between two lines, as character ranges on each side; none when most of the line changed.
  function wordMarks(a, b) {
    const ta = a.match(/\w+|\s+|[^\w\s]/g) || [], tb = b.match(/\w+|\s+|[^\w\s]/g) || [];
    if (ta.length * tb.length > 40000) return null;
    const ops = lcsOps(ta, tb), ma = [], mb = [];
    let pa = 0, pb = 0, ia = 0, ib = 0, same = 0;
    const push = (list, from, to) => { const lastR = list[list.length - 1]; if (lastR && lastR[1] === from) lastR[1] = to; else list.push([from, to]); };
    for (const op of ops) {
      if (op === "ctx") { same += ta[ia].trim() ? ta[ia].length : 0; pa += ta[ia++].length; pb += tb[ib++].length; }
      else if (op === "del") { push(ma, pa, pa + ta[ia].length); pa += ta[ia++].length; }
      else { push(mb, pb, pb + tb[ib].length); pb += tb[ib++].length; }
    }
    const solid = Math.max(a.replace(/\s/g, "").length, b.replace(/\s/g, "").length);
    return solid && same / solid >= 0.4 ? [ma, mb] : null;
  }
  // Lines without the blank lines around them and the indentation they all share (code pasted into HTML).
  // Several texts share one indent, so before and after stay aligned with each other.
  const dedentAll = (...texts) => {
    const all = texts.map((text) => {
      if (text == null) return null;
      const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
      while (lines.length && !lines[0].trim()) lines.shift();
      while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
      return lines;
    });
    let common = null;
    for (const l of all.flat()) {
      if (l == null || !l.trim()) continue;
      const lead = l.match(/^[ \t]*/)[0];
      if (common == null) common = lead;
      else { let k = 0; while (k < common.length && common[k] === lead[k]) k++; common = common.slice(0, k); }
    }
    return all.map((lines) => lines && (common ? lines.map((l) => (l.startsWith(common) ? l.slice(common.length) : l.trimStart())) : lines));
  };
  const dedent = (text) => dedentAll(text)[0];
  // Rows: {kind, text, old, new}; old/new are line numbers (null on the side the line is not on).
  function rowsFromTexts(before, after, startOld = 1, startNew = 1) {
    const [A = [], B = []] = dedentAll(before, after).map((x) => x || undefined);
    let i = 0, j = 0, o = startOld, n = startNew;
    return lcsOps(A, B).map((op) => op === "ctx" ? { kind: "ctx", text: B[j++], old: (i++, o++), new: n++ }
      : op === "del" ? { kind: "del", text: A[i++], old: o++, new: null } : { kind: "add", text: B[j++], old: null, new: n++ });
  }
  // A unified diff (git diff output, or bare -/+/space lines) → [{file, status, hunks:[{header, rows}]}].
  function parsePatch(text) {
    const files = [], lines = dedent(text);
    // With headers (git diff, git show, format-patch), lines outside hunks are commit text and are skipped;
    // without any, the text is one bare hunk of -/+/space lines.
    const headed = lines.some((l) => /^(diff --git |@@|--- )/.test(l));
    let f = null, h = null, o = 1, n = 1, oldLeft = 0, newLeft = 0;
    const file = () => { if (!f) { f = { file: "", status: "modified", hunks: [] }; files.push(f); } return f; };
    const path = (p) => p.split("\t")[0].replace(/^"(.*)"$/, "$1");
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      // A body line starts with space, + or -, so "diff --git" and "@@" always start something new, and
      // "--- " followed by "+++ " and "@@" is the next file even when a hunk's counts ran over.
      const fileHead = line.startsWith("--- ") && (lines[li + 1] || "").startsWith("+++ ") && (lines[li + 2] || "").startsWith("@@");
      if (line.startsWith("diff --git ") || line.startsWith("@@") || fileHead) oldLeft = newLeft = 0;
      const inHunk = h && (oldLeft > 0 || newLeft > 0);
      let m;
      if (!inHunk && line.startsWith("diff --git ")) { m = / b\/(.+)$/.exec(line); f = { file: m ? m[1] : "", status: "modified", hunks: [] }; files.push(f); h = null; }
      else if (!inHunk && /^(new|deleted) file mode/.test(line)) file().status = line.startsWith("new") ? "added" : "deleted";
      else if (!inHunk && line.startsWith("rename from ")) { file().status = "renamed"; file().from = line.slice(12); }
      else if (!inHunk && /^(index |similarity |rename to |old mode|new mode|Binary )/.test(line)) continue;
      else if (!inHunk && line.startsWith("--- ")) { if (f && f.hunks.length) f = null; file(); if (line !== "--- /dev/null") f.from = f.from || path(line.slice(4)).replace(/^a\//, ""); else f.status = "added"; }
      else if (!inHunk && line.startsWith("+++ ")) { const p = path(line.slice(4)); if (p === "/dev/null") { file().status = "deleted"; f.file = f.file || f.from || ""; delete f.from; } else file().file = p.replace(/^b\//, ""); if (f.from === f.file) delete f.from; }
      else if ((m = /^@@(?: -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))?)? @@ ?(.*)$/.exec(line)) || /^@@\s*$/.test(line)) {
        if (m && m[1] != null) { o = +m[1]; n = +m[3]; oldLeft = m[2] == null ? 1 : +m[2]; newLeft = m[4] == null ? 1 : +m[4]; }
        else oldLeft = newLeft = Infinity; // "@@" without numbers: carry on counting, until the next header
        h = { header: (m && m[5]) || "", rows: [] }; file().hunks.push(h);
      }
      else if (line.startsWith("\\")) continue; // "\ No newline at end of file"
      else if (!inHunk && headed) continue; // commit message, signature, other text between files
      else {
        if (!h) { h = { header: "", rows: [] }; file().hunks.push(h); o = n = 1; oldLeft = newLeft = Infinity; }
        const k = line[0], t = line.slice(1);
        if (k === "+") { h.rows.push({ kind: "add", text: t, old: null, new: n++ }); newLeft--; }
        else if (k === "-") { h.rows.push({ kind: "del", text: t, old: o++, new: null }); oldLeft--; }
        else { h.rows.push({ kind: "ctx", text: k === " " ? t : line, old: o++, new: n++ }); oldLeft--; newLeft--; }
      }
    }
    return files.filter((x) => x.hunks.length);
  }
  // The files a [data-diff] element describes, from its JSON and its <script type="text/plain"> children.
  function diffFiles(el, spec) {
    const part = (k) => { const s = $(`script[data-${k}]`, el); return s ? s.textContent : undefined; };
    const before = spec.before ?? part("before"), after = spec.after ?? part("after"), patch = spec.patch ?? part("patch");
    let files;
    if (spec.hunks) files = [{ file: spec.file || "", status: spec.status || "modified", hunks: spec.hunks.map((h) => {
      let o = h.old != null ? Math.round(+h.old) || 0 : 1, n = h.new != null ? Math.round(+h.new) || 0 : 1;
      return { header: h.context || h.header || "", rows: (h.rows || h.lines || []).map((r) => { const kind = r.kind || r[0], text = String(r.text ?? r[1] ?? "");
        const row = { kind, text, old: kind !== "add" ? o : null, new: kind !== "del" ? n : null }; if (kind !== "add") o++; if (kind !== "del") n++; return row; }) };
    }) }];
    else if (patch != null) { files = parsePatch(patch); if (spec.file && files.length > 1) files = files.filter((x) => x.file === spec.file || x.file.endsWith("/" + spec.file)); }
    else {
      const start = spec.start || 1;
      files = [{ file: spec.file || "", status: spec.status || (before == null ? "added" : after == null ? "deleted" : "modified"),
        hunks: [{ header: "", rows: rowsFromTexts(before, after, spec.startBefore || start, spec.startAfter || start) }] }];
    }
    files.forEach((f) => {
      if (files.length === 1 && spec.file) f.file = spec.file;
      if (spec.range) { // keep only these line numbers (new side; old side for removed lines)
        const [a, b] = spec.range;
        f.hunks = f.hunks.map((h) => ({ ...h, rows: h.rows.filter((r) => { const p = r.new ?? r.old; return p >= a && p <= b; }) })).filter((h) => h.rows.length);
      }
    });
    return files;
  }
  const DIFF_MODES = { unified: "Unified", split: "Split", final: "Result" };
  const DIFF_MODE_KEY = "kit-diff-mode", DIFF_WRAP_KEY = "kit-diff-wrap";
  let diffSeq = 0;
  function diff(el, spec) {
    spec = spec || {};
    const files = diffFiles(el, spec);
    el.classList.add("kit-diff-set");
    el.dataset.wired = "1";
    if (!files.length) { el.innerHTML = '<p class="muted">No changes.</p>'; return {}; }
    const blocks = files.map((f) => diffBlock(f, spec));
    el.innerHTML = "";
    blocks.forEach((b) => el.appendChild(b.node));
    if (spec.caption) el.insertAdjacentHTML("beforeend", `<p class="kd-caption">${ex(spec.caption)}</p>`);
    return { setMode: (m) => blocks.forEach((b) => b.setMode(m)) };
  }
  function diffBlock(f, spec) {
    const id = ++diffSeq, g = LANGS(langOf({ lang: spec.lang, file: f.file }));
    const rows = f.hunks.flatMap((h) => h.rows);
    const adds = rows.filter((r) => r.kind === "add").length, dels = rows.filter((r) => r.kind === "del").length;
    // Only added (a new file, or new code shown alone) or only removed lines: plain code, no modes.
    const oneSided = rows.every((r) => r.kind === "add") ? "add" : rows.every((r) => r.kind === "del") ? "del" : null;
    const modes = (spec.modes || Object.keys(DIFF_MODES)).filter((m) => Object.prototype.hasOwnProperty.call(DIFF_MODES, m));
    const notes = (spec.notes || []).filter((n) => !n.file || n.file === f.file);
    const hl = (spec.highlight || []).map((r) => (Array.isArray(r) ? r : [r, r]));
    // Syntax tokens per side (block comments carry over within a side), and word marks for paired lines.
    const stO = {}, stN = {};
    rows.forEach((r) => {
      if (r.kind !== "add") r.tokO = tokenize(r.text, g, stO);
      if (r.kind !== "del") r.tokN = tokenize(r.text, g, stN);
    });
    f.hunks.forEach((h) => {
      for (let i = 0; i < h.rows.length;) { // pair a run of removed lines with the run of added lines after it
        if (h.rows[i].kind !== "del") { i++; continue; }
        let j = i; while (j < h.rows.length && h.rows[j].kind === "del") j++;
        let k = j; while (k < h.rows.length && h.rows[k].kind === "add") k++;
        for (let p = 0; p < Math.min(j - i, k - j); p++) {
          const d = h.rows[i + p], a = h.rows[j + p];
          d.pair = a; a.pair = d;
          const w = wordMarks(d.text, a.text);
          if (w) { d.marks = w[0]; a.marks = w[1]; }
        }
        i = k;
      }
    });
    const ctxN = spec.context ?? 3;
    const keep = (r) => notes.some((n) => (n.side === "old" || n.side === "before" ? r.old : r.new) === n.line) || hl.some(([a, b]) => r.new >= a && r.new <= b);
    const expanded = new Set();
    let mode = (() => { const saved = store.get(DIFF_MODE_KEY); return modes.includes(saved) ? saved : modes.includes(spec.mode) ? spec.mode : modes[0]; })();
    let wrap = store.get(DIFF_WRAP_KEY) === "1";
    const node = document.createElement("figure");
    node.className = "kit-diff";
    const statusTag = { added: '<span class="tag good">New file</span>', deleted: '<span class="tag bad">Deleted</span>', renamed: '<span class="tag info">Renamed</span>' }[f.status] || "";
    node.innerHTML = `<figcaption class="kd-head">${f.file ? `<code class="kd-file" title="${ex(f.file)}">${f.from ? `${ex(f.from)} → ` : ""}${ex(f.file)}</code>` : ""}${statusTag}
      <span class="kd-stat"><span class="add">+${adds}</span><span class="del">−${dels}</span></span><span class="spacer"></span>
      ${!oneSided && modes.length > 1 ? `<span class="seg kd-modes" role="group" aria-label="Diff view">${modes.map((m) => `<button type="button" data-mode="${m}">${DIFF_MODES[m]}</button>`).join("")}</span>` : ""}
      <button type="button" class="kd-btn" data-wrap aria-pressed="false" title="Wrap long lines">Wrap</button>
      <button type="button" class="kd-btn" data-copy-code title="Copy the ${oneSided === "del" ? "removed" : "resulting"} code">Copy</button></figcaption>
      <div class="kd-body" tabindex="0" role="region" aria-label="Changes in ${ex(f.file || "this snippet")}"></div>`;
    const body = $(".kd-body", node);
    const narrow = () => body.clientWidth > 0 && body.clientWidth < 640;
    const code = (r, side, plain) => tokensHtml(side === "old" ? r.tokO : r.tokN, plain ? null : r.marks) || " ";
    const noteRow = (r, cols) => notes.filter((n) => (n.side === "old" || n.side === "before" ? r.old : r.new) === n.line && (n.side === "old" || n.side === "before" ? r.kind !== "add" : r.kind !== "del"))
      .map((n) => `<tr class="kd-note"><td colspan="${cols}"><div class="kd-note-box ${ex(n.tone || "")}">${n.title ? `<b>${ex(n.title)}</b>` : ""}<span>${ex(n.text)}</span>${n.author ? `<small>${ex(n.author)}</small>` : ""}</div></td></tr>`).join("");
    const isHl = (r) => r.new != null && hl.some(([a, b]) => r.new >= a && r.new <= b);
    // Fold long unchanged runs, keeping ctxN lines next to changes (and lines with notes or highlights).
    const segments = (list) => {
      const out = [];
      for (let i = 0; i < list.length;) {
        if (list[i].kind !== "ctx" || keep(list[i])) { out.push(list[i++]); continue; }
        let j = i; while (j < list.length && list[j].kind === "ctx" && !keep(list[j])) j++;
        const head = i === 0 ? 0 : ctxN, tail = j === list.length ? 0 : ctxN, key = list[i].old + ":" + list[i].new;
        if (spec.collapse === false || j - i - head - tail < 4 || expanded.has(key)) { for (let k = i; k < j; k++) out.push(list[k]); }
        else { for (let k = i; k < i + head; k++) out.push(list[k]); out.push({ fold: key, n: j - i - head - tail }); for (let k = j - tail; k < j; k++) out.push(list[k]); }
        i = j;
      }
      return out;
    };
    const foldRow = (x, cols) => `<tr class="kd-fold"><td colspan="${cols}"><button type="button" data-fold="${ex(x.fold)}">${ICON.expand}Show ${x.n} unchanged line${x.n === 1 ? "" : "s"}</button></td></tr>`;
    const hunkRow = (h, cols, i) => (f.hunks.length > 1 || h.header) && (i > 0 || h.header) ? `<tr class="kd-hunk"><td colspan="${cols}">${h.rows[0] ? `<span>line ${h.rows[0].new ?? h.rows[0].old}</span>` : ""}${h.header ? `<code>${ex(h.header)}</code>` : ""}</td></tr>` : "";
    function render() {
      const m = oneSided ? (oneSided === "del" ? "before" : "final") : mode === "split" && narrow() ? "unified" : mode;
      let html = "";
      if (m === "split") {
        f.hunks.forEach((h, hi) => {
          html += hunkRow(h, 4, hi);
          segments(h.rows).forEach((r) => {
            if (r.fold) { html += foldRow(r, 4); return; }
            if (r.kind === "ctx") html += `<tr class="ctx${isHl(r) ? " hl" : ""}"><td class="ln">${r.old}</td><td class="code">${code(r, "new")}</td><td class="ln">${r.new}</td><td class="code">${code(r, "new")}</td></tr>`;
            else if (r.kind === "del") html += `<tr class="chg"><td class="ln del">${r.old}</td><td class="code del">${code(r, "old")}</td>${r.pair ? `<td class="ln add">${r.pair.new}</td><td class="code add${isHl(r.pair) ? " hl" : ""}">${code(r.pair, "new")}</td>` : '<td class="ln none"></td><td class="code none"></td>'}</tr>`;
            else if (!r.pair) html += `<tr class="chg"><td class="ln none"></td><td class="code none"></td><td class="ln add">${r.new}</td><td class="code add${isHl(r) ? " hl" : ""}">${code(r, "new")}</td></tr>`;
            if (r.kind === "add" && r.pair) return; // drawn (with its notes) next to the removed line it replaces
            html += noteRow(r, 4) + (r.pair && r.kind === "del" ? noteRow(r.pair, 4) : "");
          });
        });
      } else if (m === "final" || m === "before") {
        const side = m === "before" ? "old" : "new";
        f.hunks.forEach((h, hi) => {
          html += hunkRow(h, 2, hi);
          let cut = 0, cutNotes = "";
          // Removed lines leave a dashed cut on the next line shown, or a row of their own before a fold or at the end.
          const flush = () => { if (cut) html += `<tr class="cut gone"><td class="ln"></td><td class="code">${cut} line${cut === 1 ? "" : "s"} removed</td></tr>` + cutNotes; cut = 0; cutNotes = ""; };
          segments(h.rows).forEach((r) => {
            if (r.fold) { flush(); html += foldRow(r, 2); return; }
            if (side === "new" && r.kind === "del") { cut++; cutNotes += noteRow(r, 2); return; }
            if (side === "old" && r.kind === "add") return;
            html += cutNotes; cutNotes = "";
            const cls = (oneSided ? "" : r.kind === "add" ? "add" : "") + (isHl(r) ? " hl" : "") + (cut ? " cut" : "");
            html += `<tr class="${cls.trim()}"${cut ? ` title="${cut} line${cut === 1 ? "" : "s"} removed above"` : ""}><td class="ln">${side === "old" ? r.old : r.new}</td><td class="code">${code(r, side, true)}</td></tr>` + noteRow(r, 2);
            cut = 0;
          });
          flush();
        });
      } else {
        f.hunks.forEach((h, hi) => {
          html += hunkRow(h, 4, hi);
          segments(h.rows).forEach((r) => {
            if (r.fold) { html += foldRow(r, 4); return; }
            const side = r.kind === "del" ? "old" : "new";
            html += `<tr class="${r.kind}${isHl(r) ? " hl" : ""}"><td class="ln">${r.old ?? ""}</td><td class="ln">${r.new ?? ""}</td><td class="sg">${r.kind === "add" ? "+" : r.kind === "del" ? "−" : ""}</td><td class="code">${code(r, side)}</td></tr>` + noteRow(r, 4);
          });
        });
      }
      body.innerHTML = `<table class="kd-t ${m}${oneSided ? " one" : ""}"><tbody>${html}</tbody></table>`;
      node.dataset.mode = m;
      $$("[data-mode]", node).forEach((b) => {
        b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
        if (b.dataset.mode === "split") { b.disabled = narrow(); b.title = narrow() ? "Too narrow for side by side" : "Side by side"; }
      });
      node.classList.toggle("wrap", wrap);
      const wrapBtn = $("[data-wrap]", node);
      wrapBtn.setAttribute("aria-pressed", String(wrap || m === "split")); wrapBtn.disabled = m === "split";
      wrapBtn.title = m === "split" ? "Side by side always wraps" : "Wrap long lines";
    }
    node.addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.mode) { store.set(DIFF_MODE_KEY, b.dataset.mode); document.dispatchEvent(new CustomEvent("kit:diff-mode", { detail: { mode: b.dataset.mode, from: id } })); mode = b.dataset.mode; render(); }
      else if (b.hasAttribute("data-wrap")) { wrap = !wrap; store.set(DIFF_WRAP_KEY, wrap ? "1" : null); document.dispatchEvent(new CustomEvent("kit:diff-wrap", { detail: { wrap, from: id } })); render(); }
      else if (b.dataset.fold) { expanded.add(b.dataset.fold); render(); }
      else if (b.hasAttribute("data-copy-code")) {
        const text = rows.filter((r) => (oneSided === "del" ? r.kind !== "add" : r.kind !== "del")).map((r) => r.text).join("\n");
        try { await navigator.clipboard.writeText(text); b.textContent = "Copied"; } catch (err) { b.textContent = "Select & copy"; }
        setTimeout(() => (b.textContent = "Copy"), 1600);
      }
    });
    document.addEventListener("kit:diff-mode", (e) => { if (e.detail.from !== id && modes.includes(e.detail.mode) && mode !== e.detail.mode) { mode = e.detail.mode; render(); } });
    document.addEventListener("kit:diff-wrap", (e) => { if (e.detail.from !== id && wrap !== e.detail.wrap) { wrap = e.detail.wrap; render(); } });
    let wasNarrow = null;
    if ("ResizeObserver" in window) new ResizeObserver(() => { const nw = narrow(); if (nw !== wasNarrow) { wasNarrow = nw; render(); } }).observe(body);
    render();
    return { node, setMode(m) { if (modes.includes(m)) { mode = m; render(); } } };
  }
  Kit.diff = diff;
  Kit.diff.parse = parsePatch;
  Kit.diff.lines = (before, after) => rowsFromTexts(before, after);

  function wireBlocks() {
    $$("[data-flow]").forEach((el) => { if (!el.dataset.wired) flow(el, specOf(el, "data-flow")); });
    $$("[data-risks]").forEach((el) => { if (!el.dataset.wired) risks(el, specOf(el, "data-risks")); });
    // A bad spec breaks only its own block: it says so in place and the rest of the page still renders.
    const safe = (el, name, fn) => { if (el.dataset.wired) return; try { fn(); } catch (e) { el.dataset.wired = "1"; el.innerHTML = `<p class="kit-block-error">This ${name} could not be shown: ${esc(e.message)}</p>`; console.error(`Kit: ${name} failed`, el, e); } };
    $$("[data-gallery], [data-gallery-src]").forEach((el) => safe(el, "gallery", () => gallery(el)));
    $$("[data-diff], [data-diff-src]").forEach((el) => safe(el, "diff", () => diff(el, specOf(el, "data-diff") || {})));
    try { wireCode(); } catch (e) { console.error("Kit: code colouring failed", e); }
    wireImages();
    $$("table.compare tr.rec").forEach((tr) => {
      const cell = tr.querySelector("th, td");
      if (cell && !cell.querySelector(".tag.rec")) cell.insertAdjacentHTML("beforeend", ' <span class="tag accent rec">Recommended</span>');
    });
  }
  Kit.wireBlocks = wireBlocks;

  // Call after rendering content late (from data.js etc.) to wire menus, blocks, sort, copy, reveal and charts.
  Kit.refresh = () => { $$("[data-toc]").forEach((el) => toc(el)); wirePhoneToc(); wireBlocks(); wireSide(); wireCopy(); wireSort(); wireReveal(); wireCharts(); };

  let started = false;
  function init() {
    if (started) return;
    started = true;
    applyTheme(store.get(THEME_KEY));
    $$("[data-theme-toggle]").forEach((b) => b.addEventListener("click", () => Kit.theme.cycle()));
    wireStyleToggle();
    wireTocs(); wireBlocks();
    wireSide(); wireCopy(); wireSort(); wireReveal(); wireCharts();
    document.dispatchEvent(new CustomEvent("kit:ready"));
  }
  // Wait for DOMContentLoaded even when readyState is "interactive": deferred scripts
  // loaded after kit.js (data.js etc.) run in that phase and must exist before kit:ready.
  if (document.readyState === "complete") init();
  else { document.addEventListener("DOMContentLoaded", init); window.addEventListener("load", init); }
})();
