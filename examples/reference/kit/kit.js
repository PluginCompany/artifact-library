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

  /* ---------- Style: Bold (kit.css) or Clean (themes/clean/clean.css) ----------
     A page that links the Clean stylesheet defaults to Clean, otherwise to Bold. Readers switch
     with the style button; their choice is remembered for every kit page on the server. Clean is
     loaded up front but inactive (media "not all"), so switching is instant. After a switch the
     page gets kit:style and kit:theme events and a resize, so charts and layouts redraw. */
  const STYLE_KEY = "kit-style";
  const CLEAN_CSS = /themes\/(clean\/clean|quiet\/quiet)\.css(\?|#|$)/;
  const kitBase = (() => {
    const s = document.currentScript || $$("script[src]").find((x) => /kit\.js(\?|$)/.test(x.src));
    return s ? s.src.replace(/kit\.js(\?.*)?$/, "") : "kit/";
  })();
  const authored = $$('link[rel~="stylesheet"]').find((l) => CLEAN_CSS.test(l.getAttribute("href") || ""));
  const defaultStyle = authored ? "clean" : "bold";
  let cleanLink = authored;
  if (!cleanLink) {
    cleanLink = document.createElement("link");
    cleanLink.rel = "stylesheet"; cleanLink.href = kitBase + "themes/clean/clean.css"; cleanLink.media = "not all";
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

  function wireBlocks() {
    $$("[data-flow]").forEach((el) => { if (!el.dataset.wired) flow(el, specOf(el, "data-flow")); });
    $$("[data-risks]").forEach((el) => { if (!el.dataset.wired) risks(el, specOf(el, "data-risks")); });
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
