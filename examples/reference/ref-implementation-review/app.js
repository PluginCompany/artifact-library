/* Implementation review — renders window.REVIEW (data.js) with window.SHOTS (shots.js).
   Sections: hero/verdict, criteria, walkthrough viewer, compare, viewports,
   findings, files & checks, follow-ups. Each has one render function below. */
(function () {
  "use strict";
  const R = window.REVIEW, M = (window.SHOTS && window.SHOTS.shots) || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const h = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const shot = (id) => M[id];
  const pinOf = (id, name) => (shot(id) && name ? shot(id).pins[name] : null);

  const ICON = {
    met: '<svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    partial: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor"/></svg>',
    missing: '<svg viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    unverified: '<svg viewBox="0 0 16 16"><path d="M6 6a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2v.5M8 12v.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    skip: '<svg viewBox="0 0 16 16"><path d="M4 8h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    fail: '<svg viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    prev: '<svg viewBox="0 0 16 16"><path d="M10 3.5L5.5 8l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    next: '<svg viewBox="0 0 16 16"><path d="M6 3.5L10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    fit: '<svg viewBox="0 0 16 16"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    full: '<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.5 10.5L14 14M5 7h4M7 5v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    close: '<svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  };
  const STATUS_LABEL = { met: "Met", partial: "Partial", missing: "Missing", unverified: "Not verified" };

  /* One source of truth: a walkthrough note may be just { finding: "F4" }.
     Missing title/text/pin are taken from that finding; the link is kept. */
  const FINDING = Object.fromEntries(R.findings.map((f) => [f.id, f]));
  R.walkthrough.forEach((w) => {
    w.notes = w.notes.map((x) => {
      const f = x.finding && FINDING[x.finding];
      if (x.finding && !f) console.warn("Unknown finding", x.finding);
      return f ? { ...x, pin: x.pin ?? (f.evidence === w.shot ? f.pin : undefined), title: x.title ?? f.title, text: x.text ?? f.text, f } : x;
    });
  });
  const SEV_ORDER = ["blocker", "major", "minor", "nit", "positive"];
  const SEV_LABEL = { blocker: "Blocker", major: "Major", minor: "Minor", nit: "Nit", positive: "Works well" };
  const statusTag = (s) => `<span class="status ${s}">${ICON[s]}${STATUS_LABEL[s]}</span>`;

  /* ---------------- Camera: a window onto a screenshot ----------------
     fit() shows the whole shot; focus(rect) zooms to a pin rectangle.
     Coordinates are percentages of the screenshot (from shots.json). */
  // Change an <img> source without a blank frame: decode the next image first.
  function swapImage(img, src) {
    if (!img.getAttribute("src")) { img.src = src; return; }
    if (img.getAttribute("src") === src) return;
    img.dataset.next = src;
    const next = new Image();
    next.src = src;
    (next.decode ? next.decode() : Promise.resolve()).catch(() => {}).then(() => { if (img.dataset.next === src) img.src = src; });
  }

  function Camera(host, opts = {}) {
    const cam = h("div", "cam");
    const layer = h("div", "layer");
    const img = h("img");
    img.alt = ""; img.decoding = "async"; if (opts.lazy) img.loading = "lazy";
    const spot = h("div", "spot");
    const tag = h("span", "tag-n");
    spot.appendChild(tag);
    layer.append(img, spot);
    cam.appendChild(layer);
    host.appendChild(cam);
    let cur = null, rect = null, n = null;
    const api = {
      el: cam,
      set(id, markers) {
        const s = shot(id); cur = s; rect = null;
        if (!s) { cam.innerHTML = '<div class="empty-filter">Screenshot missing. Run capture.py.</div>'; return api; }
        swapImage(img, s.file); img.alt = opts.alt || "";
        $$(".marker", layer).forEach((m) => m.remove());
        (markers || []).forEach((mk, i) => {
          const r = s.pins[mk.pin]; if (!r) return;
          const b = h("button", "marker", String(i + 1));
          b.type = "button"; b.setAttribute("aria-label", `Note ${i + 1}: ${mk.title}`);
          b.style.left = r[0] + r[2] / 2 + "%"; b.style.top = r[1] + r[3] / 2 + "%";
          b.addEventListener("click", (e) => { e.stopPropagation(); mk.onSelect && mk.onSelect(i); });
          layer.appendChild(b);
        });
        layout(); return api;
      },
      fit() { rect = null; n = null; layout(); return api; },
      focus(r, num) { rect = r; n = num; layout(); return api; },
      setMarker(i) { $$(".marker", layer).forEach((m, j) => m.classList.toggle("on", j === i)); },
      relayout: layout,
    };
    function layout() {
      if (!cur) return;
      const W = cam.clientWidth, ar = cur.h / cur.w;
      const H = opts.height ? opts.height(W, ar) : cam.clientHeight || W * 0.625;
      if (opts.height) cam.style.height = H + "px";
      const LW = W, LH = W * ar;
      layer.style.width = LW + "px"; layer.style.height = LH + "px";
      // Dimming shadow only needs to cover the screenshot itself (a huge spread thrashes the GPU)
      layer.style.setProperty("--spread", Math.ceil(Math.max(LW, LH)) + "px");
      const fitS = Math.min(1, H / LH);
      let s = fitS, tx = (W - LW * fitS) / 2, ty = 0;
      if (rect) {
        const rx = (rect[0] / 100) * LW, ry = (rect[1] / 100) * LH, rw = (rect[2] / 100) * LW, rh = (rect[3] / 100) * LH;
        const pad = opts.pad ?? 0.5;
        s = Math.min(W / (rw * (1 + pad) + 40), H / (rh * (1 + pad) + 40), opts.maxZoom || 2.6);
        s = Math.max(s, fitS);
        tx = W / 2 - (rx + rw / 2) * s; ty = H / 2 - (ry + rh / 2) * s;
        tx = LW * s <= W ? (W - LW * s) / 2 : Math.min(0, Math.max(W - LW * s, tx));
        ty = LH * s <= H ? (H - LH * s) / 2 : Math.min(0, Math.max(H - LH * s, ty));
        spot.style.left = rect[0] + "%"; spot.style.top = rect[1] + "%";
        spot.style.width = rect[2] + "%"; spot.style.height = rect[3] + "%";
        tag.textContent = n == null ? "" : n; tag.hidden = n == null;
      } else if (fitS < 1 && !opts.height) { ty = 0; }
      layer.style.setProperty("--s", s.toFixed(4));
      layer.style.transform = `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${s.toFixed(4)})`;
      spot.classList.toggle("on", !!rect);
      cam.classList.toggle("zoomed", !!rect);
    }
    if ("ResizeObserver" in window) { let lw = 0; new ResizeObserver(() => { if (Math.abs(cam.clientWidth - lw) > 2) { lw = cam.clientWidth; layout(); } }).observe(cam); }
    return api;
  }

  // Static evidence thumbnail focused on a pin; clicking opens the walkthrough or zoom.
  function thumb(host, id, pin, label, onOpen) {
    const b = h("button", "thumb-btn");
    b.type = "button"; b.setAttribute("aria-label", `View evidence: ${label || id}`);
    host.appendChild(b);
    const cam = Camera(b, { lazy: true, pad: 0.8, maxZoom: 3.5, alt: label });
    b.appendChild(h("span", "go", "Details"));
    cam.set(id);
    const r = pinOf(id, pin);
    if (r) cam.focus(r);
    b.addEventListener("click", () => (onOpen ? onOpen() : openZoom(id, pin ? [{ pin, n: null }] : [])));
    return b;
  }

  /* ---------------- Zoom dialog ---------------- */
  const zoom = $("#zoom");
  let lastFocus = null;
  function openZoom(id, highlight) {
    const s = shot(id); if (!s) return;
    lastFocus = document.activeElement;
    const rects = (highlight || []).map((x) => ({ r: s.pins[x.pin], n: x.n })).filter((x) => x.r);
    const cssW = s.w / s.scale;
    zoom.innerHTML = `<div class="z-bar"><span>${esc(id)} · ${s.viewport[0]}×${s.viewport[1]} · ${esc(s.scheme)}</span><a class="icon-btn" href="${esc(s.file)}" target="_blank" rel="noopener" aria-label="Open image in new tab">${ICON.full}</a><button class="icon-btn" type="button" aria-label="Close">${ICON.close}</button></div>
      <div class="z-wrap" style="width:${Math.round(cssW)}px"><img src="${esc(s.file)}" alt="Screenshot ${esc(id)}">${rects.map((x) => `<div class="z-rect" style="left:${x.r[0]}%;top:${x.r[1]}%;width:${x.r[2]}%;height:${x.r[3]}%">${x.n != null ? `<i>${x.n}</i>` : ""}</div>`).join("")}</div>`;
    zoom.hidden = false;
    document.body.style.overflow = "hidden";
    zoom.focus();
    $(".z-bar button", zoom).addEventListener("click", closeZoom);
    const first = rects[0];
    if (first) requestAnimationFrame(() => { const wrap = $(".z-wrap", zoom); zoom.scrollTop = Math.max(0, (first.r[1] / 100) * wrap.offsetHeight - zoom.clientHeight / 3); });
  }
  function closeZoom() { zoom.hidden = true; zoom.innerHTML = ""; document.body.style.overflow = ""; if (lastFocus) lastFocus.focus(); }
  zoom.addEventListener("click", (e) => { if (e.target === zoom) closeZoom(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !zoom.hidden) { e.preventDefault(); closeZoom(); } });

  /* ---------------- Hero & verdict ---------------- */
  function renderHero() {
    const m = R.meta;
    $("#h-eyebrow").textContent = `Implementation review · ${m.commit} · ${m.date}`;
    const parts = m.title.split(" & ");
    $("#h-title").innerHTML = parts.length > 1 ? `${esc(parts[0])} &amp; <em>${esc(parts.slice(1).join(" & "))}</em>` : esc(m.title);
    $("#h-task").textContent = m.task;
    $("#h-facts").innerHTML = [
      ["Agent", esc(m.agent)], ["Reviewer", esc(m.reviewer)],
      [m.buildLabel || "Build", `<code>${esc(m.commit)}</code> ${esc(m.commitTitle)} · <span class="muted">${esc(m.branch)}</span>`],
      ["Environment", esc(m.environment)],
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
    $("#h-example").innerHTML = `<b>About this review</b>${esc(m.example)}`;

    const counts = { met: 0, partial: 0, missing: 0, unverified: 0 };
    R.criteria.forEach((c) => counts[c.status]++);
    const colors = { met: "var(--good)", partial: "var(--warn)", missing: "var(--bad)", unverified: "var(--line-strong)" };
    const sev = {}; R.findings.forEach((f) => (sev[f.severity] = (sev[f.severity] || 0) + 1));
    const v = R.verdict;
    const icon = v.tone === "bad" ? ICON.missing : v.tone === "warn" ? ICON.partial : ICON.met;
    const el = $("#verdict");
    el.classList.add(v.tone);
    el.innerHTML = `<div class="eyebrow">Verdict</div>
      <div class="v-label"><span class="v-icon">${icon}</span>${esc(v.label)}</div>
      <p>${esc(v.summary)}</p>
      <div class="stackbar" role="img" aria-label="${Object.entries(counts).map(([k, n]) => `${n} ${STATUS_LABEL[k]}`).join(", ")}">${Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `<i style="--n:${n};--c:${colors[k]}"></i>`).join("")}</div>
      <div class="v-legend">${Object.entries(counts).map(([k, n]) => `<div><b>${n}</b><span><i style="--c:${colors[k]}"></i>${STATUS_LABEL[k]}</span></div>`).join("")}</div>
      <div class="v-sev">${SEV_ORDER.filter((s) => sev[s]).map((s) => `<a class="sev ${s}" href="#findings" data-sev="${s}" style="text-decoration:none">${sev[s]} ${SEV_LABEL[s].toLowerCase()}</a>`).join("")}</div>`;
    $$(".v-sev a", el).forEach((a) => a.addEventListener("click", () => setSeverity(a.dataset.sev)));
    renderDecision(el);
  }

  /* ---------------- Reviewer decision (saved as review.overall) ---------------- */
  const DECISION = { approved: { label: "Approve", word: "Approved", icon: ICON.met }, changes: { label: "Request changes", word: "Changes requested", icon: ICON.missing } };
  let decision = null;
  function renderDecision(card) {
    const box = h("div", "decide");
    box.innerHTML = `<div class="decide-head"><b>Your decision</b><span class="decide-state" aria-live="polite"></span></div>
      <div class="decide-btns" role="group" aria-label="Your decision">${Object.entries(DECISION).map(([k, d]) => `<button type="button" class="decide-btn ${k}" data-v="${k}" aria-pressed="false">${d.icon}${d.label}</button>`).join("")}</div>
      <label class="sr-only" for="decide-note">Note for the agent</label>
      <textarea id="decide-note" rows="2" placeholder="Note for the agent (optional)"></textarea>
      <div class="decide-foot"><span class="muted">Saved for the agent as <code>review.overall</code></span><button class="btn" type="button" data-save>Save note</button></div>`;
    card.appendChild(box);
    const ta = $("textarea", box);
    async function save(v) {
      const verdict = v || (decision && decision.value.verdict);
      if (!verdict) { $(".decide-state", box).textContent = "Pick Approve or Request changes first"; return; }
      await Kit.data.ensureAuthor();
      try { decision = await Kit.data.set("review.overall", { verdict, note: ta.value.trim(), author: Kit.data.author() || undefined, decidedAt: new Date().toISOString(), review: R.meta.title, commit: R.meta.commit }); paintDecision(); }
      catch (e) { $(".decide-state", box).textContent = "Not saved: " + e.message; }
    }
    $$(".decide-btn", box).forEach((b) => b.addEventListener("click", async () => {
      if (decision && decision.value.verdict === b.dataset.v) { try { await Kit.data.remove("review.overall"); decision = null; paintDecision(); } catch (e) {} return; }
      save(b.dataset.v);
    }));
    $("[data-save]", box).addEventListener("click", () => save());
    function paintDecision() {
      const v = decision && decision.value;
      $$(".decide-btn", box).forEach((b) => b.setAttribute("aria-pressed", String(!!v && b.dataset.v === v.verdict)));
      if (document.activeElement !== ta) ta.value = (v && v.note) || "";
      box.dataset.state = v ? v.verdict : "";
      $(".decide-state", box).textContent = v ? `${DECISION[v.verdict].word} by ${decision.author || v.author || "someone"} · ${Kit.ago(decision.updatedAt)}` : "Not decided yet";
    }
    paintDecision();
    Kit.data.watch("review.overall", (docs) => { decision = docs.find((d) => d.key === "review.overall") || null; paintDecision(); }, { interval: 8000 });
  }

  /* ---------------- Criteria ---------------- */
  function renderCriteria() {
    const counts = {}; R.criteria.forEach((c) => (counts[c.status] = (counts[c.status] || 0) + 1));
    $("#crit-sum").innerHTML = ["met", "partial", "missing", "unverified"].filter((s) => counts[s]).map((s) => `<span class="status ${s}">${ICON[s]}${counts[s]} ${STATUS_LABEL[s].toLowerCase()}</span>`).join("");
    const list = $("#crit-list");
    R.criteria.forEach((c) => {
      const li = h("li");
      li.innerHTML = `<div class="st">${statusTag(c.status)}</div><div class="txt"><b>${esc(c.text)}</b>${c.note ? `<span>${esc(c.note)}</span>` : ""}</div>`;
      if (c.evidence && shot(c.evidence)) { const ev = h("div", "ev"); li.appendChild(ev); thumb(ev, c.evidence, c.pin, c.text, () => openDetail(critItems(), critItems().findIndex((x) => x.src === c))); }
      else li.appendChild(h("div", "noev", c.evidence ? "Shot missing" : "Checked by script"));
      list.appendChild(li);
    });
  }

  /* ---------------- Walkthrough viewer ---------------- */
  let viewer = null;
  function renderWalkthrough() {
    const tabs = $("#screens"), host = $("#viewer");
    const stage = h("div", "stage"), notes = h("div", "notes");
    host.append(stage, notes);
    const cam = Camera(stage, { height: (W, ar) => Math.max(300, Math.min(window.innerHeight * 0.66, W * 0.68, W * ar)), pad: 0.9 });
    const bar = h("div", "stage-bar");
    bar.innerHTML = `<span class="cap"></span><span class="btns row" style="--gap:6px"><button class="icon-btn" type="button" data-act="prev" aria-label="Previous note">${ICON.prev}</button><span class="count" aria-live="polite"></span><button class="icon-btn" type="button" data-act="next" aria-label="Next note">${ICON.next}</button><button class="icon-btn" type="button" data-act="fit" aria-label="Show whole screen" title="Show whole screen">${ICON.fit}</button><button class="icon-btn" type="button" data-act="full" aria-label="Open full size" title="Open full size">${ICON.full}</button></span>`;
    stage.appendChild(bar);
    let si = 0, ni = -1;

    R.walkthrough.forEach((w, i) => {
      const s = shot(w.shot);
      const b = h("button", "screen-tab");
      b.type = "button"; b.setAttribute("role", "tab");
      b.innerHTML = `${s ? `<img src="${esc(s.file)}" alt="" loading="lazy">` : ""}<div><b>${esc(w.title)}</b><span>${w.notes.length} notes</span></div>`;
      b.addEventListener("click", () => select(i, -1));
      tabs.appendChild(b);
    });

    function select(i, n, scroll) {
      const changed = i !== si || !cam.el.dataset.ready;
      si = i; ni = n;
      const w = R.walkthrough[si];
      $$(".screen-tab", tabs).forEach((t, j) => t.setAttribute("aria-selected", String(j === si)));
      if (changed) {
        cam.set(w.shot, w.notes.map((x) => ({ pin: x.pin, title: x.title, onSelect: (k) => select(si, k) })));
        cam.el.dataset.ready = "1";
        notes.innerHTML = `<h3>${esc(w.title)}</h3><p class="sub">${esc(w.caption || "")}</p><ol>${w.notes.map((x, k) => `<li><button type="button" data-k="${k}"><span class="n">${k + 1}</span><span><b>${esc(x.title)}</b><span class="t">${esc(x.text)}</span>${x.f ? `<span class="sev ${x.f.severity} f-ref">${esc(x.f.id)} · ${SEV_LABEL[x.f.severity]}</span>` : ""}</span></button></li>`).join("")}</ol>`;
        $$("button[data-k]", notes).forEach((b) => b.addEventListener("click", () => select(si, ni === +b.dataset.k ? -1 : +b.dataset.k)));
        $(".cap", bar).textContent = (shot(w.shot) ? `${shot(w.shot).viewport.join(" × ")} · ${shot(w.shot).scheme} · ` : "") + w.shot;
      }
      $$("button[data-k]", notes).forEach((b) => b.setAttribute("aria-current", String(+b.dataset.k === ni)));
      const note = w.notes[ni];
      const r = note && pinOf(w.shot, note.pin);
      if (r) cam.focus(r, ni + 1); else cam.fit();
      cam.setMarker(ni);
      $(".count", bar).textContent = ni < 0 ? `– / ${w.notes.length}` : `${ni + 1} / ${w.notes.length}`;
      if (scroll) host.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
    function step(d) {
      const w = R.walkthrough[si];
      let n = ni + d;
      if (n >= w.notes.length) { if (si < R.walkthrough.length - 1) return select(si + 1, 0); n = w.notes.length - 1; }
      if (n < 0) { if (d < 0 && ni <= 0 && si > 0) { const p = R.walkthrough[si - 1]; return select(si - 1, p.notes.length - 1); } n = -1; }
      select(si, n);
    }
    bar.addEventListener("click", (e) => {
      const a = e.target.closest("[data-act]"); if (!a) return;
      const act = a.dataset.act;
      if (act === "prev") step(-1);
      else if (act === "next") step(1);
      else if (act === "fit") select(si, -1);
      else if (act === "full") openZoom(R.walkthrough[si].shot, R.walkthrough[si].notes.map((x, k) => ({ pin: x.pin, n: k + 1 })));
    });
    cam.el.addEventListener("click", () => openZoom(R.walkthrough[si].shot, R.walkthrough[si].notes.map((x, k) => ({ pin: x.pin, n: k + 1 }))));
    // Arrow keys while the walkthrough is on screen
    let inView = false;
    if ("IntersectionObserver" in window) new IntersectionObserver((en) => (inView = en[0].isIntersecting), { threshold: 0.3 }).observe(host);
    document.addEventListener("keydown", (e) => {
      if (!inView || !zoom.hidden || !detail.hidden || e.target.closest("input,select,textarea")) return;
      if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
      else if (e.key === "Escape" && ni >= 0) select(si, -1);
    });
    select(0, -1);
    viewer = { show(id, pin) {
      const i = R.walkthrough.findIndex((w) => w.shot === id);
      if (i < 0) return false;
      const k = R.walkthrough[i].notes.findIndex((x) => x.pin === pin);
      select(i, k, true);
      return true;
    } };
  }

  /* ---------------- Details popup ----------------
     One dialog for findings, criteria and finding-linked notes. Items are
     built from the same REVIEW objects the page renders: {src, shot, pin, kind, html}. */
  const findingHtml = (f) => `<div class="head"><span class="id">${esc(f.id)}</span><span class="sev ${f.severity}">${SEV_LABEL[f.severity]}</span></div><h3>${esc(f.title)}</h3><p>${esc(f.text)}</p>${f.where ? `<div class="where">Where: <code>${esc(f.where)}</code></div>` : ""}${f.fix ? `<div class="fix"><b>Suggested fix</b>${esc(f.fix)}</div>` : ""}`;
  const findingItems = () => R.findings.slice().sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity))
    .filter((f) => f.evidence && shot(f.evidence) && (currentSev === "all" || f.severity === currentSev))
    .map((f) => ({ src: f, shot: f.evidence, pin: f.pin, kind: "Finding", html: findingHtml(f) }));
  const critItems = () => R.criteria.filter((c) => c.evidence && shot(c.evidence)).map((c) => {
    const rel = R.findings.filter((f) => c.note && c.note.includes(f.id));
    return { src: c, shot: c.evidence, pin: c.pin, kind: "Acceptance criterion",
      html: `<div class="head">${statusTag(c.status)}</div><h3>${esc(c.text)}</h3>${c.note ? `<p>${esc(c.note)}</p>` : ""}${rel.map((f) => `<div class="fix"><b>${esc(f.id)} · ${SEV_LABEL[f.severity]}</b>${esc(f.title)}</div>`).join("")}` };
  });

  const detail = h("div", "detail");
  detail.hidden = true; detail.tabIndex = -1;
  detail.setAttribute("role", "dialog"); detail.setAttribute("aria-modal", "true"); detail.setAttribute("aria-labelledby", "d-title");
  detail.innerHTML = `<div class="d-card"><header class="d-head"><span class="d-kind" id="d-title"></span><span class="d-pos"></span><span class="spacer"></span>
      <button class="icon-btn" type="button" data-d="prev" aria-label="Previous">${ICON.prev}</button><button class="icon-btn" type="button" data-d="next" aria-label="Next">${ICON.next}</button><button class="icon-btn" type="button" data-d="close" aria-label="Close">${ICON.close}</button></header>
    <div class="d-body"><div class="d-stage"></div><div class="d-side"><div class="d-info"></div><div class="d-actions"><button class="btn" type="button" data-d="full">${ICON.full} Full size</button><button class="btn ghost" type="button" data-d="walk">Show in walkthrough ${ICON.next}</button></div><div class="d-thread"></div></div></div></div>`;
  document.body.appendChild(detail);
  const dcam = Camera($(".d-stage", detail), { height: (W, ar) => Math.max(240, Math.min(window.innerHeight * 0.64, W * ar)), pad: 1.1, maxZoom: 2.2 });
  let dItems = [], dIdx = 0, dLast = null;
  const annotated = (it) => R.walkthrough.some((w) => w.shot === it.shot);
  function openDetail(items, i) {
    if (!items.length) return;
    dItems = items; dLast = document.activeElement;
    detail.hidden = false; document.body.style.overflow = "hidden";
    showDetail(Math.max(0, i)); detail.focus();
  }
  function showDetail(i) {
    dIdx = (i + dItems.length) % dItems.length;
    const it = dItems[dIdx], s = shot(it.shot);
    $(".d-kind", detail).textContent = it.kind;
    $(".d-pos", detail).textContent = dItems.length > 1 ? `${dIdx + 1} / ${dItems.length}` : "";
    $$('[data-d="prev"],[data-d="next"]', detail).forEach((b) => (b.hidden = dItems.length < 2));
    $(".d-info", detail).innerHTML = it.html + `<p class="d-cap">${esc(it.shot)} · ${s.viewport.join(" × ")} · ${esc(s.scheme)}</p>`;
    $('[data-d="walk"]', detail).hidden = !annotated(it);
    // Findings carry a discussion thread; the same key feeds the badge on the card.
    const thread = $(".d-thread", detail);
    thread.replaceChildren();
    thread.hidden = it.kind !== "Finding";
    if (it.kind === "Finding") Kit.comments(thread, { key: `comments.finding-${it.src.id}`, title: "Discussion", compact: true, placeholder: `Comment on ${it.src.id} for the agent…` });
    dcam.set(it.shot);
    requestAnimationFrame(() => { dcam.relayout(); const r = pinOf(it.shot, it.pin); if (r) dcam.focus(r); else dcam.fit(); });
  }
  function closeDetail() { detail.hidden = true; document.body.style.overflow = ""; if (dLast) dLast.focus(); }
  detail.addEventListener("click", (e) => {
    if (e.target === detail) return closeDetail();
    const b = e.target.closest("[data-d]"); if (!b) return;
    const it = dItems[dIdx], act = b.dataset.d;
    if (act === "prev") showDetail(dIdx - 1);
    else if (act === "next") showDetail(dIdx + 1);
    else if (act === "close") closeDetail();
    else if (act === "full") openZoom(it.shot, it.pin ? [{ pin: it.pin, n: null }] : []);
    else if (act === "walk") { closeDetail(); viewer && viewer.show(it.shot, it.pin); }
  });
  dcam.el.addEventListener("click", () => { const it = dItems[dIdx]; openZoom(it.shot, it.pin ? [{ pin: it.pin, n: null }] : []); });
  document.addEventListener("keydown", (e) => {
    if (detail.hidden || !zoom.hidden || e.defaultPrevented) return;
    if (e.key === "Escape") { e.preventDefault(); closeDetail(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); showDetail(dIdx + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); showDetail(dIdx - 1); }
    else if (e.key === "Tab") { // keep focus inside the dialog
      const f = $$("button:not([hidden]),a[href]", detail).filter((x) => x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  /* ---------------- Compare ---------------- */
  function renderCompare() {
    const tabs = $("#cmp-tabs"), host = $("#cmp");
    let cut = 50;
    R.compare.forEach((c, i) => {
      const b = h("button", "", esc(c.title.split(" · ")[1] || c.title));
      b.type = "button"; b.setAttribute("role", "tab"); b.title = c.title;
      b.addEventListener("click", () => show(i));
      tabs.appendChild(b);
    });
    function show(i) {
      const c = R.compare[i], a = shot(c.a), b = shot(c.b);
      $$("button", tabs).forEach((t, j) => t.setAttribute("aria-selected", String(j === i)));
      if (!a || !b) { host.innerHTML = '<p class="empty-filter">Screenshots missing. Run capture.py.</p>'; return; }
      const tmp = document.createElement("div");
      tmp.innerHTML = `<div class="cmp" style="aspect-ratio:${a.w}/${a.h};--cut:${cut}%"><img src="${esc(a.file)}" alt="${esc(c.labels[0])}"><img class="b" src="${esc(b.file)}" alt="${esc(c.labels[1])}"><span class="lbl a">${esc(c.labels[0])}</span><span class="lbl b-l">${esc(c.labels[1])}</span><input type="range" min="0" max="100" step="0.5" value="${cut}" aria-label="Reveal ${esc(c.labels[1])} over ${esc(c.labels[0])}"><span class="handle"></span></div><p class="cmp-note">${esc(c.note || "")}</p>`;
      const box = $(".cmp", tmp), range = $("input", tmp);
      range.addEventListener("input", () => { cut = +range.value; box.style.setProperty("--cut", cut + "%"); });
      const token = (show.token = (show.token || 0) + 1);
      Promise.all($$("img", tmp).map((im) => (im.decode ? im.decode().catch(() => {}) : null))).then(() => {
        if (token !== show.token) return;
        host.replaceChildren(...tmp.childNodes);
      });
    }
    show(0);
  }

  /* ---------------- Viewport matrix ---------------- */
  function renderMatrix() {
    const host = $("#matrix");
    const kinds = ["desktop", "tablet", "phone"];
    R.viewports.forEach((v, i) => {
      const s = shot(v.shot);
      const f = h("figure", "device " + (kinds[i] || "desktop"));
      f.innerHTML = `<div class="frame" role="button" tabindex="0" aria-label="Open ${esc(v.label)} screenshot full size">${s ? `<img src="${esc(s.file)}" alt="${esc(v.label)} at ${esc(v.size)}" loading="lazy" style="aspect-ratio:${s.w}/${s.h}">` : ""}</div><figcaption><b>${esc(v.label)}</b><span>${esc(v.size)}${s && s.horizontalOverflow ? " · overflow!" : " · no overflow"}</span></figcaption>`;
      const fr = $(".frame", f);
      fr.addEventListener("click", () => openZoom(v.shot, []));
      fr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openZoom(v.shot, []); } });
      host.appendChild(f);
    });
  }

  /* ---------------- Findings ---------------- */
  let currentSev = "all";
  function setSeverity(sev) {
    currentSev = sev;
    $$("#sev-filter .chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.sev === sev)));
    let shown = 0;
    $$("#finding-list .finding").forEach((f) => { const on = sev === "all" || f.dataset.sev === sev; f.hidden = !on; if (on) shown++; });
    $("#finding-empty").hidden = shown > 0;
  }
  function renderFindings() {
    const filter = $("#sev-filter"), list = $("#finding-list");
    const counts = {}; R.findings.forEach((f) => (counts[f.severity] = (counts[f.severity] || 0) + 1));
    const opts = [["all", "All", R.findings.length], ...SEV_ORDER.map((s) => [s, SEV_LABEL[s], counts[s] || 0])];
    opts.forEach(([k, label, n]) => {
      if (k !== "all" && k !== "blocker" && !n) return;
      const c = h("button", "chip", `${esc(label)}<span class="c">${n}</span>`);
      c.type = "button"; c.dataset.sev = k;
      c.addEventListener("click", () => setSeverity(k));
      filter.appendChild(c);
    });
    const sorted = R.findings.slice().sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));
    sorted.forEach((f, i) => {
      const el = h("article", "finding " + f.severity);
      el.dataset.sev = f.severity; el.id = "finding-" + f.id;
      el.style.animationDelay = Math.min(i, 8) * 40 + "ms";
      el.innerHTML = `<div><div class="head"><span class="id">${esc(f.id)}</span><span class="sev ${f.severity}">${SEV_LABEL[f.severity]}</span></div><h3>${esc(f.title)}</h3><p>${esc(f.text)}</p>${f.where || f.fix ? `<div class="meta">${f.where ? `<div class="where">Where: <code>${esc(f.where)}</code></div>` : ""}${f.fix ? `<div class="fix"><b>Suggested fix</b>${esc(f.fix)}</div>` : ""}</div>` : ""}</div>`;
      const open = () => { const items = findingItems(); openDetail(items, items.findIndex((x) => x.src === f)); };
      if (f.evidence && shot(f.evidence)) {
        const ev = h("div", "ev"); el.appendChild(ev); thumb(ev, f.evidence, f.pin, f.title, open);
        const row = h("div", "f-actions");
        const more = h("button", "btn ghost f-open", `View evidence ${ICON.next}`); more.type = "button";
        more.addEventListener("click", open);
        const talk = h("button", "btn ghost f-talk", `Discuss<span class="cnt" data-thread="comments.finding-${esc(f.id)}" hidden></span>`); talk.type = "button";
        talk.addEventListener("click", () => { open(); requestAnimationFrame(() => { const ta = $(".d-thread textarea", detail); if (ta) { ta.scrollIntoView({ block: "nearest" }); ta.focus({ preventScroll: true }); } }); });
        row.append(more, talk);
        $("div", el).appendChild(row);
      }
      list.appendChild(el);
    });
    setSeverity("all");
  }

  /* ---------------- Files & checks ---------------- */
  function renderChecks() {
    const max = Math.max(...R.files.map((f) => f.add));
    $("#files").innerHTML = R.files.map((f) => `<div class="file"><div><code>${esc(f.path)}</code><small>${esc(f.scope)}</small></div><div class="bar"><i style="--w:${(100 * f.add / max).toFixed(1)}%"></i>${R.filesTotal.unit === "lines" ? f.add.toLocaleString("en-US") : "+" + f.add}</div></div>`).join("");
    const t = R.filesTotal;
    $("#files-total").textContent = t.label || `${t.files} files · +${t.add.toLocaleString("en-US")} in commit`;
    const cls = (r) => (r === "pass" ? "pass" : r === "fail" ? "fail" : "skip");
    const ic = (r) => (r === "pass" ? ICON.met : r === "fail" ? ICON.fail : ICON.skip);
    $("#check-list").innerHTML = R.checks.map((c) => `<li class="${cls(c.result)}"><span class="ic">${ic(c.result)}</span><div><b>${esc(c.name)}</b><span>${esc(c.detail)}</span></div><em>${esc(c.result)}</em></li>`).join("");
    const pass = R.checks.filter((c) => c.result === "pass").length;
    $("#checks-total").textContent = `${pass} of ${R.checks.length} passed`;
  }

  /* ---------------- Follow-ups ---------------- */
  function renderFollowups() {
    // Shared ticks: state.followups = { tasks: [{ text, ref, owner, done, doneBy, doneAt }] }
    // ("tasks", not "items": items arrays are reserved for comment threads in `artifact feedback`)
    let saved = null;
    const items = () => R.followups.map((f, i) => {
      const s = saved && saved.value && Array.isArray(saved.value.tasks) ? saved.value.tasks.find((x) => x.text === f.text) : null;
      return { text: f.text, ref: f.ref, owner: f.owner, done: !!(s && s.done), doneBy: s && s.doneBy, doneAt: s && s.doneAt, i };
    });
    function paintTodo() {
      $("#todo").innerHTML = items().map((f) => `<li><label><input type="checkbox" data-i="${f.i}" ${f.done ? "checked" : ""}><div><div class="t">${esc(f.text)}</div><div class="m"><span>${esc(f.ref)}</span><span>·</span><span>${esc(f.owner)}</span>${f.done && f.doneBy ? `<span>·</span><span class="by">done by ${esc(f.doneBy)}${f.doneAt ? ", " + Kit.ago(f.doneAt) : ""}</span>` : ""}</div></div></label></li>`).join("");
    }
    $("#todo").addEventListener("change", async (e) => {
      const cb = e.target.closest("input[data-i]"); if (!cb) return;
      await Kit.data.ensureAuthor();
      try { saved = await Kit.data.get("state.followups"); } catch (err) { /* keep last known */ }
      const next = items().map((f) => (f.i === +cb.dataset.i ? { ...f, done: cb.checked, doneBy: cb.checked ? Kit.data.author() || "someone" : undefined, doneAt: cb.checked ? new Date().toISOString() : undefined } : f)).map(({ i, ...rest }) => rest);
      try { saved = await Kit.data.set("state.followups", { tasks: next }); } catch (err) { cb.checked = !cb.checked; }
      paintTodo();
    });
    paintTodo();
    Kit.data.watch("state.followups", (docs) => { saved = docs.find((d) => d.key === "state.followups") || null; paintTodo(); }, { interval: 10000 });
    $("#repro").textContent = R.reproduce.join("\n");
    $("#repro").setAttribute("data-copy", R.reproduce.filter((l) => !l.startsWith("#")).map((l) => l.replace(/\s+#.*$/, "")).join("\n"));
    const cap = window.SHOTS && window.SHOTS.capturedAt;
    $("#foot").innerHTML = `Reference artifact · source <code>examples/reference/ref-implementation-review</code> · screenshots captured ${cap ? esc(cap.slice(0, 16).replace("T", " ")) : "—"} from <code>${esc((window.SHOTS && window.SHOTS.origin) || "")}</code> · built with the reference kit.`;
  }

  /* ---------------- Top nav scroll-spy & print ---------------- */
  function wireNav() {
    const links = $$("#topnav a");
    const secs = links.map((a) => document.getElementById(a.getAttribute("href").slice(1))).filter(Boolean);
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((en) => en.forEach((e) => {
        if (!e.isIntersecting) return;
        links.forEach((a) => { const on = a.getAttribute("href") === "#" + e.target.id; on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"); if (on && a.scrollIntoView && a.parentNode.scrollWidth > a.parentNode.clientWidth) a.parentNode.scrollTo({ left: a.offsetLeft - 40, behavior: "smooth" }); });
      }), { rootMargin: "-30% 0px -60% 0px" });
      secs.forEach((s) => io.observe(s));
    }
    $("#print-btn").addEventListener("click", () => window.print());
  }

  function watchFindingThreads() {
    const paint = (docs) => {
      const by = Object.fromEntries(docs.map((d) => [d.key, d]));
      $$("[data-thread]").forEach((c) => { const d = by[c.dataset.thread], n = (d && d.value && d.value.items && d.value.items.length) || 0; c.hidden = !n; c.textContent = n; });
    };
    Kit.data.watch("comments.finding-", paint, { interval: 10000 });
    document.addEventListener("kit:comments", (e) => { const c = $(`[data-thread="${e.detail.key}"]`); if (c) { const n = e.detail.items.length; c.hidden = !n; c.textContent = n; } }, true);
  }

  if (!R) { document.body.insertAdjacentHTML("afterbegin", '<p class="callout bad" style="margin:20px">data.js did not load.</p>'); return; }
  renderHero(); renderCriteria(); renderWalkthrough(); renderCompare(); renderMatrix(); renderFindings(); renderChecks(); renderFollowups(); watchFindingThreads(); wireNav();
})();
