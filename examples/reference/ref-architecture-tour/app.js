/* ref-architecture-tour — renders the page from window.TOUR (data.js).
   Sections: meta · facts · system map (diagram + panel + flow player) ·
   flow lists · models · disk · routes · commands · env · failures · glossary. */
(function () {
  "use strict";
  const T = window.TOUR;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const code = (s) => `<code>${esc(s)}</code>`;
  const byId = Object.fromEntries(T.components.map((c) => [c.id, c]));
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const KIND = { client: "Your machine", server: "Server module", data: "Storage", browser: "Browser", shared: "Shared module" };

  /* ---------- Meta & overview ---------- */
  $$("[data-meta]").forEach((el) => (el.textContent = T.meta[el.dataset.meta]));
  $("#facts").innerHTML = T.facts.map((f) => `<div><dt>${esc(f.k)}</dt><dd>${esc(f.v)}</dd></div>`).join("");

  /* ---------- System map ---------- */
  const NS = "http://www.w3.org/2000/svg";
  const fig = $("#diagram"), panel = $("#panel");
  const state = { mode: "explore", sel: "api", flow: null, step: 0, playing: false, timer: null, layout: null };

  function el(tag, attrs, parent, text) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function port(spec, layout) {
    const [id, side, frac] = spec.split(":");
    const [x, y, w, h] = byId[id].at[layout];
    const f = frac == null ? 0.5 : parseFloat(frac);
    return {
      t: { x: x + w * f, y, nx: 0, ny: -1 },
      b: { x: x + w * f, y: y + h, nx: 0, ny: 1 },
      l: { x, y: y + h * f, nx: -1, ny: 0 },
      r: { x: x + w, y: y + h * f, nx: 1, ny: 0 },
    }[side];
  }
  function wirePath(w, layout) {
    const narrow = layout === "narrow";
    const a = port((narrow && w.narrowFrom) || w.from, layout);
    const b = port((narrow && w.narrowTo) || w.to, layout);
    const same = a.nx === b.nx && a.ny === b.ny;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const k = same ? (narrow ? 26 : 40) : Math.max(18, Math.min(90, dist * 0.42));
    const c1 = { x: a.x + a.nx * k, y: a.y + a.ny * k }, c2 = { x: b.x + b.nx * k, y: b.y + b.ny * k };
    // midpoint of the cubic (t = .5) for the label
    const mid = { x: (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8, y: (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8 };
    return { d: `M${a.x} ${a.y}C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`, mid, end: b };
  }

  function drawDiagram() {
    const layout = fig.clientWidth < 640 ? "narrow" : "wide";
    state.layout = layout;
    const vb = T.viewBox[layout];
    fig.innerHTML = "";
    const svg = el("svg", { viewBox: vb.join(" "), role: "group", "aria-label": "Components of the artifact service" }, fig);
    fig.classList.toggle("narrow", layout === "narrow");
    const defs = el("defs", {}, svg);
    ["arrow", "arrow-lit"].forEach((id) => {
      const mk = el("marker", { id, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs);
      el("path", { d: "M1 1L9 5L1 9", class: "arrow-head" + (id === "arrow-lit" ? " lit" : "") }, mk);
    });

    T.zones[layout].forEach((z) => {
      el("rect", { x: z.x, y: z.y, width: z.w, height: z.h, rx: 18, class: "zone" }, svg);
      el("text", { x: z.x + 14, y: z.y + (layout === "narrow" ? 16 : 22), class: "zone-label" }, svg, z.label.toUpperCase());
    });
    const wires = el("g", { class: "wires" }, svg);
    const labels = el("g", { class: "wire-labels" });
    T.wires.forEach((w) => {
      if (layout === "narrow" && w.narrow === false) return;
      const p = wirePath(w, layout);
      const g = el("g", { class: "wire", "data-id": w.id }, wires);
      el("path", { d: p.d, class: "wire-line", "marker-end": "url(#arrow)" }, g);
      const off = (layout === "narrow" ? w.nlo : w.lo) || [0, 0];
      const lg = el("g", { class: "wire-label", "data-id": w.id, transform: `translate(${p.mid.x + off[0]} ${p.mid.y + off[1]})` }, labels);
      const fs = layout === "narrow" ? 9 : 10.5;
      const tw = w.label.length * fs * 0.62 + 12;
      el("rect", { x: -tw / 2, y: -fs * 0.95, width: tw, height: fs * 1.9, rx: 5 }, lg);
      el("text", { x: 0, y: fs * 0.35, "text-anchor": "middle", style: `font-size:${fs}px` }, lg, w.label);
    });
    const nodes = el("g", { class: "nodes" }, svg);
    T.components.forEach((c) => {
      const [x, y, w, h] = c.at[layout];
      const small = layout === "narrow" && w < 140;
      const g = el("g", { class: `node k-${c.kind}`, "data-id": c.id, tabindex: 0, role: "button", "aria-label": `${c.name}: ${c.summary}` }, nodes);
      el("rect", { x, y, width: w, height: h, rx: 12, class: "box" }, g);
      el("rect", { x: x + 1, y: y + 1, width: 4, height: h - 2, rx: 2, class: "band" }, g);
      el("text", { x: x + (small ? 11 : 16), y: y + (small ? 25 : 29), class: "n-title" }, g, small ? c.short : (layout === "narrow" ? c.short : c.name));
      const sub = small ? c.file.replace(/^src\//, "") : c.file;
      el("text", { x: x + (small ? 11 : 16), y: y + (small ? 42 : 49), class: "n-sub" }, g, sub);
      g.addEventListener("click", () => select(c.id));
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(c.id); } });
    });
    svg.appendChild(labels); // labels above boxes
    paint();
  }

  function paint() {
    const svg = $("svg", fig);
    if (!svg) return;
    let on = [], now = [], lit = [];
    if (state.mode === "explore") {
      now = [state.sel];
      lit = T.wires.filter((w) => w.from.split(":")[0] === state.sel || w.to.split(":")[0] === state.sel).map((w) => w.id);
      on = T.components.map((c) => c.id);
    } else {
      const s = state.flow.steps[state.step];
      now = s.on; on = s.on; lit = s.wires;
    }
    svg.classList.toggle("flowing", state.mode !== "explore");
    $$(".node", svg).forEach((n) => {
      n.classList.toggle("now", now.includes(n.dataset.id));
      n.classList.toggle("dim", !on.includes(n.dataset.id));
      n.setAttribute("aria-pressed", String(state.mode === "explore" && n.dataset.id === state.sel));
    });
    $$(".wire", svg).forEach((w) => {
      const on = lit.includes(w.dataset.id);
      w.classList.toggle("lit", on); w.classList.toggle("dim", !on);
      w.firstChild.setAttribute("marker-end", on ? "url(#arrow-lit)" : "url(#arrow)");
    });
    $$(".wire-label", svg).forEach((w) => w.classList.toggle("show", lit.includes(w.dataset.id)));
    // lit wires on top
    const wires = $(".wires", svg);
    $$(".wire.lit", wires).forEach((w) => wires.appendChild(w));
  }

  function chips(list, cls = "") { return list.length ? `<div class="chip-row">${list.map((f) => `<code class="${cls}">${esc(f)}</code>`).join("")}</div>` : ""; }

  function renderPanel() {
    if (state.mode === "explore") {
      const c = byId[state.sel];
      const uses = [];
      T.flows.forEach((f) => f.steps.forEach((s, i) => { if (s.on.includes(c.id)) uses.push({ f, i, s }); }));
      panel.className = "map-panel explore";
      panel.innerHTML = `
        <div class="pc">
        <div class="eyebrow k-${c.kind}-text">${esc(KIND[c.kind])}</div>
        <h3 class="p-title">${esc(c.name)}</h3>
        <p class="p-sum">${esc(c.summary)}</p>
        <p class="p-hint kbd">Tip: choose a flow above to replay a request step by step.</p>
        </div>
        <div class="pc"><div class="p-block"><h4>What it does</h4><ul class="dots">${c.does.map((d) => `<li><span>${esc(d)}</span></li>`).join("")}</ul></div>
        ${uses.length ? `<div class="p-block"><h4>Appears in</h4><div class="uses">${uses.slice(0, 4).map((u) => `<button type="button" class="use" data-flow="${u.f.id}" data-step="${u.i}"><span>${esc(u.f.name)} · step ${u.i + 1}</span>${esc(u.s.t)}</button>`).join("")}</div></div>` : ""}
        </div>
        <div class="pc"><div class="p-block"><h4>Files</h4>${chips(c.files)}</div>
        ${c.fns.length ? `<div class="p-block"><h4>Key functions</h4>${chips(c.fns, "fn")}</div>` : ""}
        ${c.config.length ? `<div class="p-block"><h4>Configuration</h4>${chips(c.config, "env")}</div>` : ""}
        </div>`;
      $$(".use", panel).forEach((b) => b.addEventListener("click", () => startFlow(b.dataset.flow, +b.dataset.step)));
      return;
    }
    const f = state.flow, s = f.steps[state.step], n = f.steps.length;
    panel.className = "map-panel flow";
    panel.innerHTML = `
      <div class="pc">
      <div class="eyebrow thread">${esc(f.name)} · step ${state.step + 1} of ${n}</div>
      <div class="seg-progress" aria-hidden="true">${f.steps.map((_, i) => `<i class="${i < state.step ? "past" : i === state.step ? "cur" : ""}"></i>`).join("")}</div>
      <h3 class="p-title">${esc(s.t)}</h3>
      <p class="p-body">${esc(s.b)}</p>
      <div class="p-meta"><div class="p-block"><h4>Active</h4><div class="chip-row">${s.on.map((id) => `<button type="button" class="tag accent on-chip" data-id="${id}">${esc(byId[id].short)}</button>`).join("")}</div></div>
      <div class="p-block"><h4>Files</h4>${chips(s.files)}</div></div>
      <div class="player">
        <button class="icon-btn" type="button" data-act="prev" aria-label="Previous step" ${state.step === 0 ? "disabled" : ""}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5L5.5 8l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <button class="btn primary play" type="button" data-act="play" aria-label="${state.playing ? "Pause" : "Play"}">${state.playing
          ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3v10M11 3v10" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>Pause'
          : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3v10l8-5z" fill="currentColor"/></svg>' + (state.step === n - 1 ? "Replay" : "Play")}</button>
        <button class="icon-btn" type="button" data-act="next" aria-label="Next step" ${state.step === n - 1 ? "disabled" : ""}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <span class="kbd hide-sm">← → to step</span>
      </div>
      </div>
      <ol class="pc p-steps">${f.steps.map((st, i) => `<li><button type="button" data-step="${i}" class="${i === state.step ? "cur" : ""}" ${i === state.step ? 'aria-current="step"' : ""}><b>${i + 1}</b>${esc(st.t)}</button></li>`).join("")}</ol>`;
    $$("[data-act]", panel).forEach((b) => b.addEventListener("click", () => act(b.dataset.act)));
    $$(".p-steps button", panel).forEach((b) => b.addEventListener("click", () => { stop(); go(+b.dataset.step); }));
    $$(".on-chip", panel).forEach((b) => b.addEventListener("click", () => select(b.dataset.id)));
  }

  function renderModes() {
    const modes = [{ id: "explore", name: "Explore" }, ...T.flows.map((f) => ({ id: f.id, name: f.name }))];
    $("#modes").innerHTML = modes.map((m) => `<button type="button" role="tab" data-mode="${m.id}" aria-selected="${state.mode === "explore" ? m.id === "explore" : state.flow && state.flow.id === m.id}">${m.id === "explore" ? "" : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3v10l8-5z" fill="currentColor"/></svg>'}${esc(m.name)}</button>`).join("");
    $$("#modes button").forEach((b) => b.addEventListener("click", () => (b.dataset.mode === "explore" ? select(state.sel) : startFlow(b.dataset.mode, 0))));
  }

  function select(id) { stop(); state.mode = "explore"; state.sel = id; state.flow = null; update(); }
  function startFlow(id, step) { stop(); state.mode = "flow"; state.flow = T.flows.find((f) => f.id === id); state.step = step || 0; update(); }
  function go(i) { state.step = Math.max(0, Math.min(state.flow.steps.length - 1, i)); update(); }
  function stop() { state.playing = false; clearInterval(state.timer); }
  function act(a) {
    if (a === "prev") { stop(); go(state.step - 1); }
    if (a === "next") { stop(); go(state.step + 1); }
    if (a === "play") {
      if (state.playing) { stop(); update(); return; }
      if (state.step === state.flow.steps.length - 1) state.step = 0;
      state.playing = true;
      state.timer = setInterval(() => {
        if (state.step >= state.flow.steps.length - 1) { stop(); update(); return; }
        go(state.step + 1);
      }, reduced ? 6000 : 4200);
      update();
    }
  }
  function update() { renderModes(); renderPanel(); paint(); }

  $("#mapwrap").addEventListener("keydown", (e) => {
    if (state.mode !== "flow" || e.target.matches("input,textarea")) return;
    if (e.key === "ArrowRight") { e.preventDefault(); stop(); go(state.step + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); stop(); go(state.step - 1); }
  });
  $("#legend").innerHTML = ["client", "server", "shared", "data", "browser"].map((k) => `<span><i class="lg k-${k}"></i>${esc(KIND[k])}</span>`).join("") + `<span><i class="lg-wire"></i>Active path</span>`;

  drawDiagram();
  update();
  let lastLayout = state.layout;
  if ("ResizeObserver" in window) new ResizeObserver(() => {
    const layout = fig.clientWidth < 640 ? "narrow" : "wide";
    if (layout !== lastLayout) { lastLayout = layout; drawDiagram(); }
  }).observe(fig);

  /* ---------- Flow lists ---------- */
  $("#flowlist").innerHTML = T.flows.map((f) => `
    <article class="flow-card panel" id="flow-${f.id}">
      <header class="flow-head">
        <div><div class="eyebrow thread">${esc(f.name)} · ${f.steps.length} steps</div><h3>${esc(f.title)}</h3></div>
        <button class="btn" type="button" data-play="${f.id}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3v10l8-5z" fill="currentColor"/></svg>Play on the map</button>
      </header>
      <pre data-copy>${esc(f.command)}</pre>
      <ol class="steps">${f.steps.map((s) => `<li><div><h4>${esc(s.t)}</h4><p>${esc(s.b)}</p>${chips(s.files)}</div></li>`).join("")}</ol>
    </article>`).join("");
  $$("[data-play]").forEach((b) => b.addEventListener("click", () => {
    startFlow(b.dataset.play, 0);
    $("#mapwrap").scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }));

  /* ---------- Data model ---------- */
  $("#models").innerHTML = T.models.map((m) => `
    <div class="panel model">
      <div class="panel-head"><h3>${esc(m.name)}</h3><code class="where">${esc(m.src)}</code></div>
      <p class="muted">${esc(m.blurb)}</p>
      <p class="loc mono">${esc(m.where)}</p>
      <div class="table-wrap flat"><table class="table compact"><tbody>${m.fields.map((f) => `<tr><td class="f">${code(f[0])}</td><td class="ty mono">${esc(f[1])}</td><td>${esc(f[2])}</td></tr>`).join("")}</tbody></table></div>
    </div>`).join("");
  $("#history").innerHTML = T.history.map((h, i) => {
    const prev = T.history[i - 1];
    const vNew = !prev || prev.v !== h.v, rNew = !prev || prev.r !== h.r;
    return `<li><span class="h-n">${i + 1}</span><code>${esc(h.act)}</code><div class="h-vals"><span class="${vNew ? "chg v" : ""}">v${h.v}</span><span class="${rNew ? "chg r" : ""}">r${h.r}</span></div><p>${esc(h.note)}</p></li>`;
  }).join("");

  /* ---------- On disk ---------- */
  const tree = (rows) => rows.map(([p, d]) => {
    const depth = (p.match(/^ */)[0].length) / 2;
    return `<li style="--d:${depth}"><code>${esc(p.trim())}</code><span>${esc(d)}</span></li>`;
  }).join("");
  $("#disk-server").innerHTML = tree(T.disk.server);
  $("#disk-client").innerHTML = tree(T.disk.client);

  /* ---------- API ---------- */
  const methods = ["All", "GET", "POST", "PATCH"];
  let method = "All";
  const mClass = { GET: "info", POST: "thread", PATCH: "accent" };
  $("#route-m").innerHTML = methods.map((m) => `<button type="button" aria-pressed="${m === method}" data-m="${m}">${m}</button>`).join("");
  function renderRoutes() {
    const q = $("#route-q").value.trim().toLowerCase();
    const rows = T.routes.filter((r) => (method === "All" || r.m === method) && (!q || `${r.m} ${r.p} ${r.d} ${r.g}`.toLowerCase().includes(q)));
    $("#routes tbody").innerHTML = rows.map((r) => `<tr><td><span class="tag ${mClass[r.m]} method">${r.m}</span></td><td class="path"><code>${esc(r.p).replace(/(:[a-z]+|\*)/g, '<em>$1</em>')}</code></td><td>${esc(r.d)} <span class="grp">${esc(r.g)}</span></td></tr>`).join("") ||
      `<tr><td colspan="3" class="muted empty">No routes match “${esc(q)}”.</td></tr>`;
    $("#route-count").textContent = `${rows.length} of ${T.routes.length} routes`;
  }
  $("#route-q").addEventListener("input", renderRoutes);
  $$("#route-m button").forEach((b) => b.addEventListener("click", () => {
    method = b.dataset.m;
    $$("#route-m button").forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
    renderRoutes();
  }));
  renderRoutes();
  $("#headers tbody").innerHTML = T.headers.map((h) => `<tr><td>${code(h[0])}</td><td>${esc(h[1])}</td></tr>`).join("");

  /* ---------- CLI ---------- */
  $("#commands").innerHTML = T.commands.map((g) => `
    <div class="panel cmd-group">
      <div class="panel-head"><h3>${esc(g.group)}</h3><span class="tag outline">${g.items.length} commands</span></div>
      <dl class="cmds">${g.items.map(([c, d]) => `<div><dt><code>artifact ${esc(c)}</code></dt><dd>${esc(d)}</dd></div>`).join("")}</dl>
      <pre data-copy>${esc(g.example)}</pre>
    </div>`).join("");

  /* ---------- Env ---------- */
  const scopes = ["All", ...new Set(T.env.map((e) => e.scope))];
  let scope = "All";
  $("#env-scope").innerHTML = scopes.map((s) => `<button type="button" class="chip" aria-pressed="${s === scope}" data-s="${s}">${s}</button>`).join("");
  function renderEnv() {
    $("#env tbody").innerHTML = T.env.filter((e) => scope === "All" || e.scope === scope).map((e) => `<tr><td>${code(e.name)}</td><td><span class="tag outline">${esc(e.scope)}</span></td><td class="mono def">${esc(e.def)}</td><td>${esc(e.d)}</td></tr>`).join("");
  }
  $$("#env-scope .chip").forEach((b) => b.addEventListener("click", () => {
    scope = b.dataset.s;
    $$("#env-scope .chip").forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
    renderEnv();
  }));
  renderEnv();

  /* ---------- Failures, limits, glossary ---------- */
  $("#exits").innerHTML = T.exitCodes.map((x) => `<div class="exit"><b>${esc(x.code)}</b><div><h4>${esc(x.t)}</h4><p>${esc(x.d)}</p></div></div>`).join("");
  $("#errors tbody").innerHTML = T.errors.map(([c, s, d]) => `<tr><td>${code(c)}</td><td class="num" data-value="${typeof s === "number" ? s : 999}">${typeof s === "number" ? s : '<span class="tag outline">CLI</span>'}</td><td>${esc(d)}</td></tr>`).join("");
  const dl = (rows) => rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
  $("#limits").innerHTML = dl(T.limits);
  $("#gloss").innerHTML = dl(T.glossary);
})();
