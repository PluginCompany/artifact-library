/* Codebase map — renders window.MAP (data.js, generated) with window.NOTES (notes.js).
   Sections: hero stats, treemap + detail panel, charts, module graph, reading path, hotspots. */
(function () {
  "use strict";
  const D = window.MAP, N = window.NOTES || { purposes: {}, areas: {}, reading: [] };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = (n) => Math.round(n).toLocaleString("en-US");
  const base = (p) => p.split("/").pop();
  const HOTSPOTS = 12;
  const STATUS = { committed: "Committed", modified: "Modified (uncommitted)", new: "New (uncommitted)" };
  const STATUS_TAG = { committed: "", modified: "warn", new: "good" };
  const byPath = Object.fromEntries(D.files.map((f) => [f.path, f]));
  const areaName = (a) => (a === "examples/reference" ? "reference (shared)" : a.replace("examples/reference/", ""));
  const date = (iso) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

  /* ---------- Hero ---------- */
  $("#m-branch").textContent = D.branch;
  $("#m-when").textContent = new Date(D.generatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const areas = [...new Set(D.files.map((f) => f.area))];
  const wip = D.files.filter((f) => f.status !== "committed").length;
  const totalLines = D.files.reduce((a, f) => a + f.lines, 0);
  $("#m-stats").innerHTML = [
    [fmt(D.files.length), "files"], [fmt(totalLines), "lines"], [areas.length, "areas"],
    [D.commits.length, D.commits.length === 1 ? "commit" : "commits"], [wip, "files with uncommitted work"],
  ].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("");

  /* ---------- Colour scales ---------- */
  // Edits = lines added or removed after a file was first written. Fixed bins keep colours stable between runs.
  const cuts = [0, 10, 30, 60, 120];
  const editStep = (c) => { let i = 0; while (i < cuts.length && c > cuts[i]) i++; return i; };
  const BIN_LABELS = ["0", "1–10", "11–30", "31–60", "61–120", "> 120"];
  const typeIndex = (t) => { const i = D.types.indexOf(t); return i < 0 || t === "Other" ? -1 : i; };
  let colorBy = "edits";
  function fill(f) {
    if (colorBy === "type") { const i = typeIndex(f.type); return i < 0 || i > 4 ? "var(--line-strong)" : `var(--s${i + 1})`; }
    if (colorBy === "status") return f.status === "new" ? "var(--good)" : f.status === "modified" ? "var(--warn)" : "var(--line)";
    return `var(--ramp-${editStep(f.edits)})`;
  }
  // Label ink is picked from the fill's luminance so text always clears contrast.
  const probe = document.createElement("i"); probe.style.display = "none"; document.body.appendChild(probe);
  const inkCache = new Map();
  function ink(fillValue) {
    if (inkCache.has(fillValue)) return inkCache.get(fillValue);
    probe.style.color = fillValue;
    const m = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g) || [0, 0, 0];
    const [r, g, b] = m.slice(0, 3).map((x) => { x = +x / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    const out = 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.32 ? "#11161d" : "#ffffff";
    inkCache.set(fillValue, out);
    return out;
  }

  function legend() {
    const el = $("#tm-legend");
    if (colorBy === "edits") {
      el.innerHTML = `<li class="ramp"><span class="lbl">Lines edited after creation</span>${BIN_LABELS.map((l, i) => `<span class="bin"><i style="--c:var(--ramp-${i})"></i><em>${l}</em></span>`).join("")}</li><li class="dotkey"><span class="dot-swatch"></span>has uncommitted changes</li>`;
    } else if (colorBy === "type") {
      const used = new Set(D.files.map((f) => f.type));
      el.innerHTML = D.types.filter((t) => used.has(t)).map((t) => { const i = typeIndex(t); return `<li><i style="--c:${i < 0 || i > 4 ? "var(--line-strong)" : `var(--s${i + 1})`}"></i>${esc(t)}</li>`; }).join("");
    } else {
      const n = (s) => D.files.filter((f) => f.status === s).length;
      el.innerHTML = `<li><i style="--c:var(--line)"></i>Committed · ${n("committed")}</li><li><i style="--c:var(--warn)"></i>Modified · ${n("modified")}</li><li><i style="--c:var(--good)"></i>New · ${n("new")}</li>`;
    }
  }

  /* ---------- Squarified treemap ---------- */
  function squarify(items, rect) {
    const out = [], total = items.reduce((a, i) => a + i.v, 0);
    if (!total || rect.w <= 0 || rect.h <= 0) return out;
    const scale = (rect.w * rect.h) / total;
    const list = items.map((i) => ({ ...i, a: i.v * scale })).sort((a, b) => b.a - a.a);
    let r = { ...rect }, row = [];
    const worst = (row, side) => { const s = row.reduce((a, i) => a + i.a, 0); const mx = Math.max(...row.map((i) => i.a)), mn = Math.min(...row.map((i) => i.a)); return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn)); };
    const lay = (row) => {
      const s = row.reduce((a, i) => a + i.a, 0);
      if (r.w >= r.h) { const w = s / r.h; let y = r.y; row.forEach((i) => { const h = i.a / w; out.push({ ...i, x: r.x, y, w, h }); y += h; }); r.x += w; r.w -= w; }
      else { const h = s / r.w; let x = r.x; row.forEach((i) => { const w = i.a / h; out.push({ ...i, x, y: r.y, w, h }); x += w; }); r.y += h; r.h -= h; }
    };
    for (const item of list) {
      const side = Math.min(r.w, r.h);
      if (!row.length || worst([...row, item], side) <= worst(row, side)) row.push(item);
      else { lay(row); row = [item]; }
    }
    if (row.length) lay(row);
    return out;
  }

  let selected = null, query = "";
  const tm = $("#tm");
  function drawTreemap() {
    const W = tm.clientWidth, H = tm.clientHeight;
    const groups = areas.map((a) => ({ key: a, v: D.files.filter((f) => f.area === a).reduce((s, f) => s + f.lines, 0) }));
    const frag = document.createDocumentFragment();
    for (const g of squarify(groups, { x: 0, y: 0, w: W, h: H })) {
      const gx = g.x + 2, gy = g.y + 2, gw = g.w - 4, gh = g.h - 4;
      const el = document.createElement("div");
      el.className = "grp";
      el.style.cssText = `left:${gx}px;top:${gy}px;width:${gw}px;height:${gh}px`;
      const label = gw > 64 && gh > 46;
      if (label) el.innerHTML = `<b title="${esc(g.key)}">${esc(areaName(g.key))}</b>`;
      frag.appendChild(el);
      const inner = { x: gx + 3, y: gy + (label ? 21 : 3), w: gw - 6, h: gh - (label ? 24 : 6) };
      const files = D.files.filter((f) => f.area === g.key).map((f) => ({ f, v: f.lines }));
      for (const t of squarify(files, inner)) {
        const f = t.f, b = document.createElement("button");
        const w = Math.max(0, t.w - 2), h = Math.max(0, t.h - 2);
        b.type = "button"; b.className = `tile status-${f.status}`; b.dataset.path = f.path;
        b.setAttribute("role", "listitem");
        b.setAttribute("aria-label", `${f.path}, ${fmt(f.lines)} lines, ${f.edits} lines edited after creation, ${STATUS[f.status]}`);
        b.title = `${f.path}\n${fmt(f.lines)} lines · ${fmt(f.edits)} edited after creation`;
        b.style.cssText = `left:${t.x + 1}px;top:${t.y + 1}px;width:${w}px;height:${h}px`;
        if (w > 46 && h > 20) b.innerHTML = `<span class="nm">${esc(base(f.path))}</span>${h > 36 && w > 46 ? `<span class="ln">${fmt(f.lines)}</span>` : ""}`;
        b.addEventListener("click", () => select(f.path));
        frag.appendChild(b);
      }
    }
    tm.replaceChildren(frag);
    paint();
  }
  function paint() {
    $$(".tile", tm).forEach((b) => {
      const f = byPath[b.dataset.path], c = fill(f);
      b.style.setProperty("--fill", c);
      b.style.setProperty("--fg", ink(c));
      b.classList.toggle("sel", f.path === selected);
      b.classList.toggle("dim", !!query && !f.path.toLowerCase().includes(query));
    });
    legend();
  }

  /* ---------- Detail panel ---------- */
  const deps = {}, users = {};
  D.graph.nodes.forEach((n) => { deps[n] = []; users[n] = []; });
  D.graph.edges.forEach((e) => { deps[e.from].push(e.to); users[e.to].push(e.from); });
  const purpose = (p) => N.purposes[p] || D.graph.generated?.[p] && `Generated by ${D.graph.generated[p]}.`;
  function chips(list, cls) {
    return list.length ? `<ul class="chips">${list.map((p) => `<li><button type="button" class="${cls}" data-go="${esc(p)}">${esc(base(p))}</button></li>`).join("")}</ul>` : `<p class="none">None</p>`;
  }
  function detailEmpty() {
    const top = areas.map((a) => [a, D.files.filter((f) => f.area === a).reduce((s, f) => s + f.lines, 0)]).sort((a, b) => b[1] - a[1]).slice(0, 6);
    $("#tm-detail").innerHTML = `<div class="eyebrow thread">Nothing selected</div><h3>Click a tile</h3><p class="empty">Each tile is a file. Click one to see what it is for, how big it is and how much it has changed. Use the search box to find a file by name.</p>
      <h4 class="eyebrow">Largest areas</h4><ul class="area-list">${top.map(([a, l]) => `<li><span>${esc(areaName(a))}</span><b>${fmt(l)}</b></li>`).join("")}</ul>`;
  }
  function detail(f) {
    const p = purpose(f.path) || N.areas[f.area];
    const isNode = D.graph.nodes.includes(f.path);
    $("#tm-detail").innerHTML = `<div class="path">${esc(f.path)}</div>
      <div class="row" style="--gap:8px"><h3>${esc(base(f.path))}</h3>${f.status !== "committed" ? `<span class="tag ${STATUS_TAG[f.status]} dot">${f.status === "new" ? "New" : "Modified"}</span>` : ""}</div>
      ${p ? `<p>${esc(p)}</p>` : `<p class="empty">No note for this file yet. Add one to <code>notes.js</code>.</p>`}
      <dl class="facts">
        <div><dt>Lines</dt><dd>${fmt(f.lines)} · ${esc(f.type)}</dd></div>
        <div><dt>Edits</dt><dd>${f.status === "new" ? "New file, not committed yet" : `${fmt(f.edits)} lines after creation`}${f.wip && f.status !== "new" ? ` <span class="muted">(${fmt(f.wip)} uncommitted)</span>` : ""}</dd></div>
        <div><dt>Churn</dt><dd>${fmt(f.churn)} lines in total</dd></div>
        <div><dt>Commits</dt><dd>${f.commits || "None yet"}</dd></div>
        <div><dt>Last change</dt><dd>${f.last ? esc(date(f.last)) : "Not committed yet"}</dd></div>
        <div><dt>Area</dt><dd>${esc(f.area)}</dd></div>
      </dl>
      ${isNode ? `<div><h4 class="eyebrow">Imports</h4>${chips(deps[f.path], "dep")}</div><div><h4 class="eyebrow">Imported by</h4>${chips(users[f.path], "user")}</div><button class="btn" type="button" data-graph="${esc(f.path)}">Show in module graph</button>` : ""}`;
  }
  $("#tm-detail").addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]"); if (go) return select(go.dataset.go);
    const g = e.target.closest("[data-graph]"); if (g) { pick(g.dataset.graph); $("#modules").scrollIntoView({ behavior: "smooth" }); }
  });
  function select(path, scroll) {
    selected = path;
    const f = byPath[path];
    if (f) detail(f); else detailEmpty();
    paint();
    if (scroll) $("#treemap").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    if (f && matchMedia("(max-width:1000px)").matches && !scroll) $("#tm-detail").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  $$("[data-color]").forEach((b) => b.addEventListener("click", () => {
    colorBy = b.dataset.color;
    $$("[data-color]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    paint();
  }));
  $("#tm-q").addEventListener("input", (e) => { query = e.target.value.trim().toLowerCase(); paint(); });
  $("#tm-q").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !query) return;
    const hit = D.files.find((f) => base(f.path).toLowerCase().includes(query)) || D.files.find((f) => f.path.toLowerCase().includes(query));
    if (hit) { select(hit.path); const t = tm.querySelector(`[data-path="${CSS.escape(hit.path)}"]`); if (t) t.focus(); }
  });
  $("#tm-note").textContent = `Excluded: ${D.excluded}. Tiles under ~46 px wide skip their label; hover or focus shows the name.`;

  /* ---------- Charts ---------- */
  const areaLines = areas.map((a) => [a, D.files.filter((f) => f.area === a).reduce((s, f) => s + f.lines, 0)]).sort((a, b) => b[1] - a[1]);
  const topAreas = areaLines.slice(0, 8), rest = areaLines.slice(8).reduce((s, x) => s + x[1], 0);
  const areaRows = rest ? [...topAreas, ["Everything else", rest]] : topAreas;
  Kit.chart.bar($("#c-area"), { labels: areaRows.map((a) => areaName(a[0])), series: [{ name: "Lines", values: areaRows.map((a) => a[1]) }], labelWidth: 190, title: "Lines by area" });
  const leader = areaLines[0];
  $("#c-area-sub").textContent = `${areaName(leader[0])} is the largest area with ${fmt(leader[1])} of ${fmt(totalLines)} lines.`;
  const typeRows = D.types.map((t) => [t, D.files.filter((f) => f.type === t).reduce((s, f) => s + f.lines, 0)]).filter((r) => r[1]);
  Kit.chart.bar($("#c-type"), { labels: typeRows.map((r) => r[0]), series: [{ name: "Lines", values: typeRows.map((r) => r[1]), colors: typeRows.map((r) => { const i = typeIndex(r[0]); return i < 0 || i > 4 ? "var(--line-strong)" : `var(--s${i + 1})`; }) }], labelWidth: 120, title: "Lines by file type" });
  const ts = typeRows.find((r) => r[0] === "TypeScript");
  if (ts) $("#c-type-sub").textContent = `TypeScript is ${Math.round((100 * ts[1]) / totalLines)}% of lines; most of the rest is the reference artifacts.`;

  /* ---------- Module graph (layered by dependency depth) ---------- */
  const level = {};
  const depth = (n, seen = new Set()) => {
    if (level[n] !== undefined) return level[n];
    if (seen.has(n)) return 0;
    seen.add(n);
    return (level[n] = deps[n].length ? 1 + Math.max(...deps[n].map((d) => depth(d, seen))) : 0);
  };
  D.graph.nodes.forEach((n) => depth(n));
  const maxL = Math.max(...Object.values(level));
  const layers = Array.from({ length: maxL + 1 }, (_, L) => D.graph.nodes.filter((n) => level[n] === L).sort());
  const VW = 1000, NW = 138, NH = 48, ROW = 92, PAD = 34, PER_ROW = 6;
  const pos = {};
  // Layers wider than PER_ROW wrap onto extra rows so boxes never overlap.
  const rowsOf = (layer) => Math.ceil(layer.length / PER_ROW);
  const place = () => {
    let row = 0;
    for (let L = maxL; L >= 0; L--) {
      const layer = layers[L], rows = rowsOf(layer);
      for (let r = 0; r < rows; r++) {
        const chunk = layer.slice(r * PER_ROW, (r + 1) * PER_ROW);
        const gap = Math.min(160, (VW - 2 * PAD) / chunk.length);
        const start = VW / 2 - (gap * (chunk.length - 1)) / 2;
        chunk.forEach((n, i) => { pos[n] = { x: start + i * gap, y: PAD + row * ROW }; });
        row++;
      }
    }
  };
  place();
  for (let it = 0; it < 6; it++) { // barycentre sweeps reduce crossings
    layers.forEach((layer) => {
      const bary = (n) => { const nb = [...deps[n], ...users[n]]; return nb.length ? nb.reduce((s, m) => s + pos[m].x, 0) / nb.length : pos[n].x; };
      layer.sort((a, b) => bary(a) - bary(b));
    });
    place();
  }
  const svg = $("#graph"), NS = "http://www.w3.org/2000/svg";
  const totalRows = layers.reduce((a, l) => a + rowsOf(l), 0);
  const H = PAD * 2 + (totalRows - 1) * ROW + NH;
  svg.setAttribute("viewBox", `0 0 ${VW} ${H}`);
  const el = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); parent.appendChild(n); return n; };
  const top = el("text", { x: 12, y: PAD - 12, class: "layer-label" }, svg); top.textContent = "Entry points";
  const bot = el("text", { x: 12, y: H - 8, class: "layer-label" }, svg); bot.textContent = "Foundations";
  const edgesG = el("g", {}, svg), nodesG = el("g", {}, svg);
  const edgeEls = D.graph.edges.map((e) => {
    const a = pos[e.from], b = pos[e.to];
    const y1 = a.y + NH, y2 = b.y, my = (y1 + y2) / 2;
    const p = el("path", { d: `M${a.x} ${y1}C${a.x} ${my} ${b.x} ${my} ${b.x} ${y2}`, class: "edge" + (e.typeOnly ? " type" : "") }, edgesG);
    p.dataset.from = e.from; p.dataset.to = e.to;
    return p;
  });
  const nodeEls = {};
  D.graph.nodes.forEach((n) => {
    const p = pos[n], f = byPath[n], gen = D.graph.generated && D.graph.generated[n];
    const g = el("g", { class: "node" + (users[n].length === 0 ? " entry" : "") + (gen ? " gen" : ""), transform: `translate(${p.x - NW / 2} ${p.y})`, tabindex: 0, role: "button", "aria-label": `${base(n)}: imports ${deps[n].length}, imported by ${users[n].length}` }, nodesG);
    el("rect", { width: NW, height: NH, rx: 9 }, g);
    const t = el("text", { x: NW / 2, y: 21, "text-anchor": "middle" }, g); t.textContent = base(n).replace(/\.ts$/, "");
    const s = el("text", { x: NW / 2, y: 38, "text-anchor": "middle", class: "sub" }, g); s.textContent = gen ? "generated" : f ? fmt(f.lines) + " lines" : "";
    g.addEventListener("click", () => pick(n));
    g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(n); } });
    nodeEls[n] = g;
  });
  let picked = null;
  function graphDetail(n) {
    if (!n) {
      const entries = D.graph.nodes.filter((m) => !users[m].length);
      $("#g-detail").innerHTML = `<div class="eyebrow thread">${D.graph.nodes.length} modules · ${D.graph.edges.length} imports</div><h3>Pick a module</h3><p class="muted" style="font-size:14px">Blue shows what it imports, orange what imports it. Entry points: ${entries.map((e) => `<code>${esc(base(e))}</code>`).join(", ")}.</p>`;
      return;
    }
    $("#g-detail").innerHTML = `<div class="eyebrow thread">Module</div><h3>${esc(base(n))}</h3><p style="font-size:14px">${esc(purpose(n) || "")}</p>
      <h4>Imports · ${deps[n].length}</h4>${deps[n].length ? `<ul>${deps[n].map((d) => `<li><button type="button" class="dep" data-pick="${esc(d)}">${esc(base(d))}</button></li>`).join("")}</ul>` : `<p class="none">Nothing — a foundation module.</p>`}
      <h4>Imported by · ${users[n].length}</h4>${users[n].length ? `<ul>${users[n].map((d) => `<li><button type="button" class="user" data-pick="${esc(d)}">${esc(base(d))}</button></li>`).join("")}</ul>` : `<p class="none">Nothing — an entry point.</p>`}
      ${byPath[n] ? `<button class="btn" type="button" data-map="${esc(n)}">Show on the treemap</button>` : ""}`;
  }
  function pick(n) {
    picked = picked === n ? null : n;
    svg.classList.toggle("focus", !!picked);
    Object.entries(nodeEls).forEach(([m, g]) => {
      g.classList.toggle("sel", m === picked);
      g.classList.toggle("dep", !!picked && deps[picked].includes(m));
      g.classList.toggle("user", !!picked && users[picked].includes(m));
    });
    edgeEls.forEach((p) => { p.classList.toggle("out", p.dataset.from === picked); p.classList.toggle("in", p.dataset.to === picked); });
    graphDetail(picked);
  }
  $("#g-detail").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pick]"); if (b) { picked = null; pick(b.dataset.pick); return; }
    const m = e.target.closest("[data-map]"); if (m) select(m.dataset.map, true);
  });
  graphDetail(null);

  /* ---------- Reading path ---------- */
  $("#reading-list").innerHTML = N.reading.filter((r) => byPath[r.path]).map((r) => `<li><div><div class="rp"><h4>${esc(base(r.path))}</h4>${r.path.includes("/") ? `<code>${esc(r.path)}</code>` : ""}<button class="btn ghost" type="button" data-read="${esc(r.path)}">Show on map →</button></div><p>${esc(r.why)}</p></div></li>`).join("");
  $("#reading-list").addEventListener("click", (e) => { const b = e.target.closest("[data-read]"); if (b) select(b.dataset.read, true); });

  /* ---------- Hotspots ---------- */
  const hot = D.files.filter((f) => f.edits > 0).sort((a, b) => b.edits - a.edits || b.churn - a.churn).slice(0, HOTSPOTS);
  $("#hot tbody").innerHTML = hot.map((f) => `<tr data-path="${esc(f.path)}" tabindex="0"><td><code>${esc(f.path)}</code></td><td>${esc(areaName(f.area))}</td><td class="num">${fmt(f.lines)}</td><td class="num">${f.commits}</td><td class="num" data-value="${f.edits}">${fmt(f.edits)}</td><td>${f.status === "committed" ? '<span class="tag st-tag">Committed</span>' : `<span class="tag ${STATUS_TAG[f.status]} dot st-tag">${f.status === "new" ? "New" : "Modified"}</span>`}</td></tr>`).join("");
  $("#hot tbody").addEventListener("click", (e) => { const tr = e.target.closest("tr"); if (tr) select(tr.dataset.path, true); });
  $("#hot tbody").addEventListener("keydown", (e) => { const tr = e.target.closest("tr"); if (tr && e.key === "Enter") select(tr.dataset.path, true); });

  $("#foot").innerHTML = `Reference artifact · source <code>examples/reference/ref-codebase-map</code> · data generated ${esc(new Date(D.generatedAt).toLocaleString("en-GB"))} from branch <code>${esc(D.branch)}</code> plus uncommitted work · regenerate with <code>python3 build-data.py</code>.`;

  /* ---------- Layout & theme ---------- */
  detailEmpty();
  drawTreemap();
  let lastW = tm.clientWidth;
  if ("ResizeObserver" in window) new ResizeObserver(() => { if (Math.abs(tm.clientWidth - lastW) > 4) { lastW = tm.clientWidth; drawTreemap(); } }).observe(tm);
  const repaint = () => { inkCache.clear(); paint(); };
  document.addEventListener("kit:theme", repaint);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", repaint);
})();
