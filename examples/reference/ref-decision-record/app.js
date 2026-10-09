/* ref-decision-record — renders window.ADR (data.js) and runs the scoring matrix.
   Content lives in data.js; this file holds no copy. Missing containers are skipped. */
(function () {
  "use strict";
  const A = window.ADR;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const put = (sel, html) => { const el = $(sel); if (el) el.innerHTML = html; return el; };
  const fmtDate = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const optById = Object.fromEntries(A.options.map((o) => [o.id, o]));
  const STATUS_TAG = { Draft: "outline", Proposed: "warn", Accepted: "good", Rejected: "bad", Superseded: "info" };
  const statusTag = (s) => `<span class="tag dot ${STATUS_TAG[s] || "outline"}">${esc(s)}</span>`;
  const LEVEL = ["", "Low", "Medium", "High"];

  /* ---------- Static sections ---------- */
  function renderHead() {
    document.title = `${A.id} · ${A.title}`;
    put("#adr-id", esc(A.id));
    put("#adr-title", esc(A.title).replace(A.titleAccent, `<em>${esc(A.titleAccent)}</em>`));
    put("#adr-meta", [
      ["Status", statusTag(A.status)],
      ["Proposed", fmtDate(A.date)],
      ["Review by", fmtDate(A.reviewBy)],
      ["Deciders", A.deciders.map(esc).join(", ")],
      ["Consulted", A.consulted.map(esc).join(", ")],
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join(""));
  }

  function renderTldr(totals) {
    const rec = optById[A.recommended];
    const rank = ranked(totals);
    const pos = rank.findIndex((r) => r.id === rec.id) + 1;
    put("#tldr-card", `
      <div class="letter" aria-hidden="true">${esc(rec.id)}</div>
      <div class="eyebrow">Recommendation · Option ${esc(rec.id)} · ${esc(rec.name)}</div>
      <h2>${esc(A.tldr.headline)}</h2>
      <ul class="dots">${A.tldr.points.map((p) => `<li><span>${p}</span></li>`).join("")}</ul>
      <div class="score-line">
        <span class="tag accent">Weighted score ${Math.round(totals[rec.id])} / 100</span>
        <span class="tag outline">Ranked #${pos} of ${A.options.length} with default weights</span>
        <a class="tag outline" href="#scoring">Adjust the weights ↓</a>
      </div>`);
    put("#side-status", `<span class="k">Status</span>${statusTag(A.status)}<span class="k">Recommends</span><span class="lead-opt">${esc(rec.id)} · ${esc(rec.name)}</span><span class="k">Review by</span><span>${fmtDate(A.reviewBy)}</span>`);
  }

  function renderContext() {
    put("#context-problem", `<p>${A.context.problem}</p>`);
    put("#context-fields", A.context.today.map((f) => `<div><dt>${esc(f.field)}</dt><dd>${f.note}</dd></div>`).join(""));
    put("#context-search", `<b>How search works today</b>${A.context.search}`);
    put("#drivers-list", A.drivers.map((d, i) => `<div class="driver"><span class="n">D${i + 1}</span><h3>${esc(d.title)}</h3><p>${d.text}</p></div>`).join(""));
  }

  function levels(o) {
    const pips = (n) => [1, 2, 3].map((i) => `<i class="${i <= n ? "on" : ""}"></i>`).join("");
    return `<div class="levels">
      <div class="lvl effort" data-level="${o.effort}"><span class="k">Effort <b>${LEVEL[o.effort]}</b></span><span class="pips" aria-hidden="true">${pips(o.effort)}</span></div>
      <div class="lvl risk" data-level="${o.risk}"><span class="k">Risk <b>${LEVEL[o.risk]}</b></span><span class="pips" aria-hidden="true">${pips(o.risk)}</span></div>
    </div>`;
  }

  function renderOptions() {
    put("#options-list", A.options.map((o) => {
      const rec = o.id === A.recommended;
      return `<article class="opt${rec ? " rec" : ""}" id="option-${o.id}" aria-labelledby="opt-${o.id}-h">
        <div class="sketch">${rec ? '<span class="rec-flag">Recommended</span>' : ""}${(SKETCHES[o.sketch] || SKETCHES.none)()}</div>
        <div class="body">
          <div class="title"><span class="badge" aria-hidden="true">${esc(o.id)}</span><h3 id="opt-${o.id}-h"><span class="visually-hidden">Option ${esc(o.id)}: </span>${esc(o.name)}</h3></div>
          <p class="summary">${o.summary}</p>
          <div><h4>Touches</h4><div class="touch">${o.changes.map((c) => `<code>${esc(c)}</code>`).join("")}</div></div>
          <div class="pc-grid">
            <div><h4>For</h4><ul class="pc pro">${o.pros.map((p) => `<li><span>${p}</span></li>`).join("")}</ul></div>
            <div><h4>Against</h4><ul class="pc con">${o.cons.map((p) => `<li><span>${p}</span></li>`).join("")}</ul></div>
          </div>
          ${levels(o)}
        </div>
      </article>`;
    }).join(""));
  }

  function renderRest() {
    const C = A.consequences;
    const col = (cls, title, tag, items) => `<div class="cq ${cls}"><header><span class="tag ${tag} dot">${title}</span></header><ul>${items.map((t) => `<li><span>${t}</span></li>`).join("")}</ul></div>`;
    put("#consequences-list", col("good", "Positive", "good", C.good) + col("bad", "Negative", "bad", C.bad) + col("neutral", "Neutral", "info", C.neutral));
    put("#rollout-list", A.rollout.map((s) => `<li><div>${s.phase ? `<span class="eyebrow thread">${esc(s.phase)}</span>` : ""}<h4>${esc(s.title)}</h4><p>${s.text}</p></div></li>`).join(""));
    put("#questions-list", A.questions.map((q) => `<li><span>${q.q}</span><span class="tag outline owner">${esc(q.owner)}</span></li>`).join(""));
    put("#log-list", A.log.map((e) => `<li class="${e.kind}"><time datetime="${e.date}">${esc(e.date)}</time><span class="pt"></span><div><h4>${esc(e.title)}${e.kind === "next" ? ' <span class="tag outline">Upcoming</span>' : e.kind === "key" ? ' <span class="tag warn">Current</span>' : ""}</h4><p>${e.text}</p></div></li>`).join(""));
    put("#supersede-list", A.supersede.map((s) => `<li>${s}</li>`).join(""));
  }

  /* ---------- Scoring ---------- */
  const defaults = { w: A.criteria.map((c) => c.weight), s: A.criteria.map((c) => ({ ...c.scores })) };
  const state = { w: defaults.w.slice(), s: defaults.s.map((x) => ({ ...x })) };

  function totalsFor(st) {
    const max = st.w.reduce((a, w) => a + w * 5, 0) || 1;
    const out = {};
    A.options.forEach((o) => { out[o.id] = (A.criteria.reduce((a, _, i) => a + st.w[i] * st.s[i][o.id], 0) / max) * 100; });
    return out;
  }
  const ranked = (t) => A.options.map((o) => ({ id: o.id, v: t[o.id] })).sort((a, b) => b.v - a.v || a.id.localeCompare(b.id));
  const leaders = (t) => { const r = ranked(t); return r.filter((x) => Math.round(x.v) === Math.round(r[0].v)).map((x) => x.id); };
  const isDefault = () => state.w.every((w, i) => w === defaults.w[i]) && state.s.every((row, i) => A.options.every((o) => row[o.id] === defaults.s[i][o.id]));

  // URL state: ?w=3443223&s=<scores per option, criteria order, options joined by .>
  function readUrl() {
    try {
      const p = new URLSearchParams(location.search);
      const w = p.get("w"), s = p.get("s");
      if (w && w.length === A.criteria.length && /^[0-5]+$/.test(w)) state.w = w.split("").map(Number);
      if (s) {
        const parts = s.split(".");
        if (parts.length === A.options.length && parts.every((x) => x.length === A.criteria.length && /^[1-5]+$/.test(x)))
          A.options.forEach((o, oi) => parts[oi].split("").forEach((d, ci) => (state.s[ci][o.id] = +d)));
      }
    } catch (e) {}
  }
  function writeUrl() {
    try {
      const url = new URL(location.href);
      if (isDefault()) { url.searchParams.delete("w"); url.searchParams.delete("s"); }
      else {
        url.searchParams.set("w", state.w.join(""));
        url.searchParams.set("s", A.options.map((o) => state.s.map((row) => row[o.id]).join("")).join("."));
      }
      history.replaceState(null, "", url);
    } catch (e) {}
  }

  const WEIGHT_WORD = ["Ignored", "Minor", "Low", "Medium", "High", "Critical"];
  function buildMatrix() {
    const m = $("#matrix");
    if (!m) return;
    m.style.setProperty("--opt-n", A.options.length);
    let html = `<div class="mx-row mx-head" aria-hidden="true"><div>Criterion</div><div>Weight</div>${A.options.map((o) => `<div class="oh" data-opt="${o.id}"><b>${esc(o.id)}</b><span>${esc(o.name)}</span></div>`).join("")}</div>`;
    A.criteria.forEach((c, ci) => {
      html += `<div class="mx-row" role="group" aria-labelledby="crit-${c.id}">
        <div class="mx-crit"><b id="crit-${c.id}">${esc(c.name)}</b><span>${esc(c.hint)}</span></div>
        <div class="mx-weight" data-ci="${ci}"><span class="wl">Weight</span><input type="range" min="0" max="5" step="1" value="${state.w[ci]}" aria-label="Weight for ${esc(c.name)}" data-ci="${ci}"><output aria-hidden="true"></output></div>
        ${A.options.map((o) => `<div class="mx-cell" data-opt="${o.id}"><button type="button" class="score" data-ci="${ci}" data-opt="${o.id}"><span class="ol" aria-hidden="true">${esc(o.id)}</span><span class="p" aria-hidden="true"></span><span class="v"></span></button></div>`).join("")}
      </div>`;
    });
    html += `<div class="mx-row mx-total"><div class="lab">Weighted score<small>out of 100</small></div>${A.options.map((o) => `<div class="tc" data-opt="${o.id}"><span class="on-mobile" aria-hidden="true">${esc(o.id)}</span><span class="v"></span><span class="meter"><i></i></span><span class="crown">Leads</span></div>`).join("")}</div>`;
    m.innerHTML = html;

    m.addEventListener("input", (e) => {
      const r = e.target.closest('input[type="range"]');
      if (!r) return;
      state.w[+r.dataset.ci] = +r.value;
      update();
    });
    const bump = (btn, d) => {
      const ci = +btn.dataset.ci, id = btn.dataset.opt;
      let v = state.s[ci][id] + d;
      if (v > 5) v = 1; if (v < 1) v = 5;
      state.s[ci][id] = v;
      update();
    };
    m.addEventListener("click", (e) => { const b = e.target.closest(".score"); if (b) bump(b, e.shiftKey ? -1 : 1); });
    m.addEventListener("keydown", (e) => {
      const b = e.target.closest(".score");
      if (!b) return;
      const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
      if (d) { e.preventDefault(); bump(b, d); }
      else if (/^[1-5]$/.test(e.key)) { e.preventDefault(); state.s[+b.dataset.ci][b.dataset.opt] = +e.key; update(); }
    });
  }

  let chart = null;
  const defaultTotals = totalsFor(defaults);
  const defaultLead = leaders(defaultTotals);

  function update() {
    const t = totalsFor(state);
    const lead = leaders(t);
    const m = $("#matrix");
    if (m) {
      m.querySelectorAll(".mx-weight").forEach((w) => {
        const ci = +w.dataset.ci, v = state.w[ci];
        w.querySelector("input").value = v;
        w.querySelector("input").setAttribute("aria-valuetext", `${v} of 5, ${WEIGHT_WORD[v]}`);
        w.querySelector("output").textContent = v;
        w.classList.toggle("changed", v !== defaults.w[ci]);
        w.closest(".mx-row").classList.toggle("off", v === 0);
      });
      m.querySelectorAll(".score").forEach((b) => {
        const ci = +b.dataset.ci, id = b.dataset.opt, v = state.s[ci][id];
        b.querySelector(".v").textContent = v;
        b.querySelector(".p").innerHTML = [1, 2, 3, 4, 5].map((i) => `<i class="${i <= v ? "on" : ""}"></i>`).join("");
        const changed = v !== defaults.s[ci][id];
        b.classList.toggle("changed", changed);
        b.setAttribute("aria-label", `Option ${id}, ${optById[id].name}: ${v} of 5 for ${A.criteria[ci].name}${changed ? ", changed from " + defaults.s[ci][id] : ""}. Arrow keys or 1 to 5 to change.`);
      });
      m.querySelectorAll("[data-opt]").forEach((el) => el.classList.toggle("win", lead.length === 1 && lead[0] === el.dataset.opt));
      m.querySelectorAll(".mx-total .tc").forEach((tc) => {
        const v = t[tc.dataset.opt];
        tc.querySelector(".v").textContent = Math.round(v);
        tc.querySelector(".meter i").style.setProperty("--v", v.toFixed(1) + "%");
      });
    }
    renderVerdict(t, lead);
    renderChart(t, lead);
    const reset = $("#reset");
    if (reset) reset.disabled = isDefault();
    writeUrl();
  }

  function renderVerdict(t, lead) {
    const name = (id) => `${id} · ${optById[id].name}`;
    const rec = A.recommended;
    let cls, label, msg;
    if (lead.length > 1) {
      cls = "warn"; label = "Tie";
      msg = `With these weights <strong>${lead.map(name).join("</strong> and <strong>")}</strong> tie at ${Math.round(t[lead[0]])}. Raise the weight of whatever separates them.`;
    } else if (lead[0] !== rec) {
      cls = "warn"; label = "Your weights change the recommendation";
      msg = `<strong>${name(lead[0])}</strong> now leads with ${Math.round(t[lead[0]])}, ahead of the recommended ${name(rec)} at ${Math.round(t[rec])}. Write down why these weights apply before you overrule the record.`;
    } else if (isDefault()) {
      cls = "good"; label = "Default weights";
      const second = ranked(t)[1];
      msg = `<strong>${name(rec)}</strong> leads with ${Math.round(t[rec])}, ${Math.round(t[rec] - second.v)} points ahead of ${name(second.id)}.`;
    } else {
      cls = "note"; label = "Adjusted. The recommendation holds";
      msg = `<strong>${name(rec)}</strong> still leads with ${Math.round(t[rec])} (default ${Math.round(defaultTotals[rec])}).`;
    }
    put("#verdict", `<div class="callout ${cls}"><b>${label}</b><span class="msg">${msg}</span></div>`);
  }

  const narrow = window.matchMedia("(max-width: 640px)");
  function renderChart(t, lead) {
    const el = $("#ranking-chart");
    if (!el || !window.Kit) return;
    const r = ranked(t);
    const label = (id) => `${id} · ${narrow.matches ? optById[id].short || optById[id].name : optById[id].name}`;
    const spec = {
      title: "Weighted score by option",
      labels: r.map((x) => label(x.id)),
      series: [{ name: "Weighted score", values: r.map((x) => Math.round(x.v)), colors: r.map((x) => (lead.length === 1 && x.id === lead[0] ? "var(--accent)" : "var(--faint)")) }],
      max: 100, format: "int", labelWidth: narrow.matches ? 120 : 200, xLabel: "Option",
    };
    if (chart) chart.update(spec); else chart = Kit.chart.bar(el, spec);
  }

  /* ---------- Sketches (inline SVG mocks; colours come from style.css classes) ---------- */
  const SKETCHES = {
    none: () => "",
    tags: () => `<svg viewBox="0 0 320 140" aria-hidden="true">
      <rect class="sk-acc" x="20" y="14" width="96" height="20" rx="10"/><text class="sk-t acc" x="34" y="27.5">tag: reference</text>
      <rect class="sk-panel" x="20" y="44" width="134" height="82" rx="8"/><rect class="sk-soft" x="21" y="45" width="132" height="34" rx="7"/>
      <rect class="sk-bar dark" x="30" y="88" width="88" height="6" rx="3"/><rect class="sk-bar" x="30" y="99" width="62" height="5" rx="2.5"/>
      <rect class="sk-acc" x="30" y="109" width="60" height="12" rx="6"/><text class="sk-t acc" x="36" y="118" style="font-size:7.5px">#reference</text>
      <rect class="sk-thr" x="94" y="109" width="46" height="12" rx="6"/><text class="sk-t thr" x="100" y="118" style="font-size:7.5px">#bikes</text>
      <rect class="sk-panel" x="166" y="44" width="134" height="82" rx="8"/><rect class="sk-soft" x="167" y="45" width="132" height="34" rx="7"/>
      <rect class="sk-bar dark" x="176" y="88" width="96" height="6" rx="3"/><rect class="sk-bar" x="176" y="99" width="70" height="5" rx="2.5"/>
      <rect class="sk-acc" x="176" y="109" width="60" height="12" rx="6"/><text class="sk-t acc" x="182" y="118" style="font-size:7.5px">#reference</text>
      <rect class="sk-thr" x="240" y="109" width="28" height="12" rx="6"/><text class="sk-t thr" x="246" y="118" style="font-size:7.5px">#q3</text>
      <text class="sk-t" x="200" y="28">2 of 8 match</text></svg>`,
    folders: () => `<svg viewBox="0 0 320 140" aria-hidden="true">
      <rect class="sk-panel" x="40" y="12" width="240" height="118" rx="10"/>
      <text class="sk-h" x="56" y="34">Reference collection</text><text class="sk-t" x="214" y="34">4 items</text>
      ${[0, 1, 2, 3].map((i) => `<g transform="translate(0 ${46 + i * 20})"><circle class="sk-thr-fill" cx="62" cy="7" r="7"/><text class="sk-t on" x="59.3" y="10" style="font-size:8px">${i + 1}</text><rect class="sk-bar dark" x="78" y="4" width="${[120, 96, 132, 84][i]}" height="6" rx="3"/><g class="sk-t"><circle class="sk-bar dark" cx="258" cy="4" r="1.4"/><circle class="sk-bar dark" cx="263" cy="4" r="1.4"/><circle class="sk-bar dark" cx="258" cy="10" r="1.4"/><circle class="sk-bar dark" cx="263" cy="10" r="1.4"/></g></g>`).join("")}
    </svg>`,
    search: () => `<svg viewBox="0 0 320 140" aria-hidden="true">
      <rect class="sk-panel" x="30" y="14" width="260" height="24" rx="8"/><circle class="sk-lens" cx="45" cy="25" r="4.5"/><path class="sk-lens" d="M48.4 28.4l3.6 3.6"/>
      <text class="sk-t ink" x="58" y="29.5">q = report · sort = updated</text>
      ${[["Q3 workshop report", 1], ["Reporting style guide", 0], ["Weekly ops report", 1]].map(([t, ok], i) => `<g transform="translate(0 ${50 + i * 27})">
        <rect class="${ok ? "sk-panel" : "sk-badsoft"}" x="30" y="0" width="260" height="21" rx="6"/>
        <circle class="${ok ? "sk-good" : "sk-bad"}" cx="44" cy="10.5" r="5"/>
        <text class="sk-t ink" x="56" y="14">${t}</text>
        <text class="sk-t" x="${ok ? 238 : 214}" y="14">${ok ? "match" : "false hit"}</text></g>`).join("")}
    </svg>`,
    hybrid: () => `<svg viewBox="0 0 320 140" aria-hidden="true">
      <rect class="sk-acc" x="18" y="30" width="70" height="18" rx="9"/><text class="sk-t acc" x="28" y="42.5">#reference</text>
      <rect class="sk-thr" x="18" y="58" width="56" height="18" rx="9"/><text class="sk-t thr" x="28" y="70.5">#bikes</text>
      <rect class="sk-acc" x="18" y="86" width="70" height="18" rx="9"/><text class="sk-t acc" x="28" y="98.5">#reference</text>
      <path class="sk-wire" d="M92 39 C 120 39, 120 70, 146 70 M92 95 C 120 95, 120 92, 146 92"/>
      <rect class="sk-panel" x="150" y="12" width="152" height="118" rx="10"/>
      <text class="sk-h" x="162" y="32">Collection</text>
      <text class="sk-t thr" x="162" y="50" style="font-size:8px">PINNED</text>
      <circle class="sk-thr-fill" cx="168" cy="62" r="5.5"/><rect class="sk-bar dark" x="180" y="59" width="90" height="6" rx="3"/>
      <circle class="sk-thr-fill" cx="168" cy="78" r="5.5"/><rect class="sk-bar dark" x="180" y="75" width="74" height="6" rx="3"/>
      <text class="sk-t acc" x="162" y="99" style="font-size:8px">FROM #REFERENCE</text>
      <circle class="sk-acc" cx="168" cy="111" r="5"/><rect class="sk-bar" x="180" y="108" width="82" height="6" rx="3"/>
    </svg>`,
  };

  /* ---------- Buttons ---------- */
  function wireButtons() {
    const reset = $("#reset");
    if (reset) reset.addEventListener("click", () => { state.w = defaults.w.slice(); state.s = defaults.s.map((x) => ({ ...x })); update(); });
    const copy = $("#copy-link");
    if (copy) copy.addEventListener("click", async () => {
      const span = copy.querySelector("span");
      try { await navigator.clipboard.writeText(location.href); span.textContent = "Link copied"; }
      catch (e) { span.textContent = "Copy from the address bar"; }
      setTimeout(() => (span.textContent = "Copy link"), 1800);
    });
  }

  /* ---------- Recorded positions (answer.weights.<person>) and discussion ----------
     Needs kit-data.js; skipped when it is not loaded or the containers are missing. */
  const slugify = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  function person() {
    const n = slugify(window.Kit.data.author()); if (n) return n;
    let id = null; try { id = localStorage.getItem("kit-anon-id"); } catch (e) {}
    if (!id) { id = "reader-" + Math.random().toString(36).slice(2, 8); try { localStorage.setItem("kit-anon-id", id); } catch (e) {} }
    return id;
  }
  function positionValue(note) {
    const t = totalsFor(state), lead = leaders(t), D = window.Kit.data;
    const changedScores = [];
    A.criteria.forEach((c, ci) => A.options.forEach((o) => { if (state.s[ci][o.id] !== defaults.s[ci][o.id]) changedScores.push({ criterion: c.id, criterionName: c.name, option: o.id, score: state.s[ci][o.id], default: defaults.s[ci][o.id] }); }));
    let link = location.href; try { link = link.replace(/\/_versions\/\d+\//, "/"); } catch (e) {}
    return {
      author: D.author() || "Anonymous",
      weights: A.criteria.map((c, i) => ({ id: c.id, name: c.name, weight: state.w[i], default: defaults.w[i] })),
      changedScores,
      ranking: ranked(t).map((x) => ({ option: x.id, name: optById[x.id].name, score: Math.round(x.v) })),
      leader: lead.length === 1 ? lead[0] : null, leaderName: lead.length === 1 ? optById[lead[0]].name : null, tie: lead.length > 1,
      recommended: A.recommended, matchesRecommendation: lead.length === 1 && lead[0] === A.recommended, usesDefaultWeights: isDefault(),
      note: (note || "").trim(), link,
    };
  }
  let positions = [];
  function renderPositions() {
    const host = $("#positions");
    if (!host || !window.Kit || !window.Kit.data) return;
    const D = window.Kit.data, kesc = window.Kit.esc;
    host.innerHTML = `<div class="pos-form panel"><div><h3>Record your position</h3><p>Saves your current weights, any changed scores and the resulting ranking, so the deciders and the agent can see where you stand.</p></div>
        <label><span>Why these weights? <em>optional</em></span><textarea id="pos-note" rows="3" placeholder="e.g. Agents matter more to us than curation, so I raised “Agent friendly”."></textarea></label>
        <div class="row" style="--gap:10px"><button class="author-chip" type="button" data-author-chip></button><span class="spacer"></span><button class="btn primary" type="button" id="pos-save">Save my position</button></div>
        <p class="pos-status" id="pos-status" aria-live="polite"></p></div>
      <div class="pos-list"><div class="pos-head"><h3>Positions so far</h3><span id="pos-count"></span></div><div id="pos-items"></div></div>`;
    $("#pos-save").addEventListener("click", async () => {
      const st = $("#pos-status");
      await D.ensureAuthor();
      try {
        const v = positionValue($("#pos-note").value);
        await D.set("answer.weights." + person(), v);
        st.className = "pos-status ok";
        st.textContent = v.tie ? "Saved. Your weights produce a tie." : `Saved. With your weights ${v.leader} · ${v.leaderName} leads${v.matchesRecommendation ? ", matching the recommendation." : ", overruling the recommendation."}`;
        D.list("answer.weights.").then(paintPositions);
      } catch (e) { st.className = "pos-status warn"; st.textContent = "Couldn’t save: " + e.message; }
    });
    $("#pos-items").addEventListener("click", (e) => {
      const b = e.target.closest("[data-load]"); if (!b) return;
      const d = positions.find((p) => p.key === b.dataset.load); if (!d) return;
      const v = d.value;
      state.w = defaults.w.slice(); state.s = defaults.s.map((x) => ({ ...x }));
      (v.weights || []).forEach((w) => { const i = A.criteria.findIndex((c) => c.id === w.id); if (i >= 0) state.w[i] = Math.max(0, Math.min(5, w.weight)); });
      (v.changedScores || []).forEach((c) => { const i = A.criteria.findIndex((x) => x.id === c.criterion); if (i >= 0 && optById[c.option]) state.s[i][c.option] = Math.max(1, Math.min(5, c.score)); });
      update();
      const m = $("#scoring"); if (m) m.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
    function paintPositions(docs) {
      positions = docs;
      $("#pos-count").textContent = docs.length ? `${docs.length} ${docs.length === 1 ? "person" : "people"}` : "";
      const mine = "answer.weights." + person();
      $("#pos-items").innerHTML = docs.length ? docs.slice().sort((a, b) => (a.key === mine ? -1 : b.key === mine ? 1 : b.updatedAt.localeCompare(a.updatedAt))).map((d) => {
        const v = d.value || {};
        const verdict = v.tie ? `<span class="tag warn dot">Tie</span>` : v.matchesRecommendation ? `<span class="tag good dot">Agrees: ${kesc(v.leader)}</span>` : `<span class="tag thread dot">Prefers ${kesc(v.leader)} · ${kesc(v.leaderName || "")}</span>`;
        const changed = (v.weights || []).filter((w) => w.weight !== w.default);
        return `<article class="pos ${d.key === mine ? "mine" : ""}"><header><span class="kit-avatar">${kesc((v.author || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase())}</span>
            <div><b>${kesc(v.author || "Anonymous")}</b><span>${window.Kit.ago(d.updatedAt)}${d.key === mine ? " · yours" : ""}</span></div>${verdict}</header>
          <p class="pos-w">${v.usesDefaultWeights ? "Default weights." : changed.length ? changed.map((w) => `${kesc(w.name)} <b>${w.default}→${w.weight}</b>`).join(" · ") : "Default weights, changed scores."}${(v.changedScores || []).length ? ` · ${(v.changedScores || []).length} score${v.changedScores.length === 1 ? "" : "s"} changed` : ""}</p>
          ${v.note ? `<p class="pos-note">“${kesc(v.note)}”</p>` : ""}
          <div class="pos-rank">${(v.ranking || []).map((r) => `<span><b>${kesc(r.option)}</b> ${r.score}</span>`).join("")}<button class="btn ghost" type="button" data-load="${kesc(d.key)}">Load into the matrix</button></div></article>`;
      }).join("") : `<p class="pos-empty">Nobody has recorded a position yet.</p>`;
      const m = docs.find((d) => d.key === mine);
      const ta = $("#pos-note");
      if (m && ta && !ta.value && document.activeElement !== ta) ta.value = m.value.note || "";
    }
    D.watch("answer.weights.", paintPositions, { interval: 9000 });
    const thread = $("#discussion-thread");
    if (thread) window.Kit.comments(thread, { key: "adr", placeholder: "Ask a question or raise an objection to this decision…" });
  }

  function init() {
    readUrl();
    renderHead();
    renderTldr(defaultTotals);
    renderContext();
    renderOptions();
    renderRest();
    buildMatrix();
    wireButtons();
    update();
    renderPositions();
    const relabel = () => { const t = totalsFor(state); renderChart(t, leaders(t)); };
    if (narrow.addEventListener) narrow.addEventListener("change", relabel);
    if (defaultLead.length !== 1 || defaultLead[0] !== A.recommended)
      console.warn(`[ADR] Default weights rank ${defaultLead.join("/")} first but data.js recommends ${A.recommended}.`);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
