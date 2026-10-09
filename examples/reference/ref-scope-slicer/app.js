/* Scope slicer — renders window.SCOPE (data.js): item list, plan settings,
   live summary with warnings, a lane timeline, and saved proposals
   (state.scope.<person>) plus a discussion thread (comments.scope). */
document.addEventListener("kit:ready", () => {
  "use strict";
  const S = window.SCOPE;
  const { $, $$, esc } = Kit;
  const D = Kit.data;
  const byId = Object.fromEntries(S.items.map((i, n) => [i.id, { ...i, n }]));
  const areaIdx = Object.fromEntries(S.areas.map((a, i) => [a.id, i]));
  const areaColor = (id) => `var(--s${(areaIdx[id] % 5) + 1})`;
  const fmtD = (d) => (Math.round(d * 10) / 10).toLocaleString("en-US") + " d";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- State (shareable through the URL) ---------- */
  const state = { sel: new Set([...S.items.filter((i) => i.must).map((i) => i.id), "dark-mode", "tags"]), people: S.capacity.people, weeks: S.capacity.weeks };
  try {
    const q = new URLSearchParams(location.search);
    if (q.has("sel")) state.sel = new Set(q.get("sel").split(",").filter((id) => byId[id]));
    const p = +q.get("p"), w = +q.get("w");
    if (p >= 1 && p <= S.capacity.maxPeople) state.people = p;
    if (w >= 1 && w <= S.capacity.maxWeeks) state.weeks = w;
  } catch (e) {}
  function writeUrl() {
    try { const u = new URL(location.href); u.searchParams.set("sel", [...state.sel].join(",")); u.searchParams.set("p", state.people); u.searchParams.set("w", state.weeks); history.replaceState(null, "", u); } catch (e) {}
  }

  $("#h-release").textContent = S.meta.release;
  $("#h-intro").textContent = S.meta.intro;

  /* ---------- Planning model ---------- */
  function plan() {
    const focus = S.capacity.focus, windowDays = state.weeks * 5;
    const capacity = state.people * windowDays * focus;
    const chosen = S.items.filter((i) => state.sel.has(i.id))
      .sort((a, b) => (b.must ? 1 : 0) - (a.must ? 1 : 0) || b.value / b.effort - a.value / a.effort || byId[a.id].n - byId[b.id].n);
    const lanes = Array(state.people).fill(0), done = {}, rows = [];
    const pending = chosen.slice();
    while (pending.length) {
      let k = pending.findIndex((it) => it.deps.filter((d) => state.sel.has(d)).every((d) => done[d] !== undefined));
      if (k < 0) k = 0;
      const it = pending.splice(k, 1)[0];
      const ready = Math.max(0, ...it.deps.filter((d) => done[d] !== undefined).map((d) => done[d]));
      let lane = 0;
      lanes.forEach((t, l) => { if (Math.max(t, ready) < Math.max(lanes[lane], ready)) lane = l; });
      const start = Math.max(lanes[lane], ready), dur = it.effort / focus, end = start + dur;
      lanes[lane] = end; done[it.id] = end;
      rows.push({ it, lane, start, end, late: end > windowDays + 1e-9 });
    }
    const missing = chosen.flatMap((it) => it.deps.filter((d) => !state.sel.has(d)).map((d) => ({ item: it, dep: byId[d] })));
    const effort = chosen.reduce((a, i) => a + i.effort, 0);
    const finish = rows.reduce((a, r) => Math.max(a, r.end), 0);
    return { chosen, rows, missing, effort, capacity, windowDays, finish, fits: finish <= windowDays + 1e-9, value: chosen.reduce((a, i) => a + i.value, 0), focus };
  }

  /* ---------- Static parts ---------- */
  $("#area-legend").innerHTML = S.areas.map((a) => `<span><i style="--c:${areaColor(a.id)}"></i>${esc(a.label)}</span>`).join("");
  $("#presets").innerHTML = S.presets.map((p) => `<button class="chip" type="button" data-preset="${p.id}">${esc(p.label)}</button>`).join("");
  $("#presets").addEventListener("click", (e) => {
    const b = e.target.closest("[data-preset]"); if (!b) return;
    state.sel = new Set(S.presets.find((p) => p.id === b.dataset.preset).pick(S.items)); render();
  });
  $$(".stepper").forEach((st) => st.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-d]"); if (!b) return;
    const k = st.dataset.k, max = k === "people" ? S.capacity.maxPeople : S.capacity.maxWeeks;
    state[k] = Math.min(max, Math.max(1, state[k] + +b.dataset.d)); render();
  }));

  const valueDots = (v) => `<span class="dots5" role="img" aria-label="Value ${v} of 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= v ? "on" : ""}"></i>`).join("")}</span>`;
  const RISK = { low: "good", medium: "warn", high: "bad" };
  $("#items").innerHTML = S.areas.map((a) => `<div class="area-group"><h3 class="area-h"><i style="--c:${areaColor(a.id)}"></i>${esc(a.label)}</h3>
      ${S.items.filter((i) => i.area === a.id).map((i) => `
        <label class="item" data-id="${esc(i.id)}" style="--c:${areaColor(i.area)}">
          <input type="checkbox" class="sw-input" value="${esc(i.id)}"><span class="sw" aria-hidden="true"></span>
          <span class="it-main">
            <span class="it-top"><b>${esc(i.title)}</b>${i.must ? '<span class="tag accent">Must-have</span>' : ""}</span>
            <span class="it-why">${esc(i.why)}</span>
            <span class="it-meta"><span class="eff">${fmtD(i.effort)}</span>${valueDots(i.value)}<span class="tag ${RISK[i.risk]} dot">${esc(i.risk)} risk</span>
              ${i.deps.length ? `<span class="deps">Needs ${i.deps.map((d) => esc(byId[d].title)).join(", ")}</span>` : ""}<span class="src">${esc(i.source)}</span></span>
            <span class="it-flag" hidden></span>
          </span>
        </label>`).join("")}</div>`).join("");
  $("#items").addEventListener("change", (e) => {
    const cb = e.target.closest(".sw-input"); if (!cb) return;
    if (cb.checked) state.sel.add(cb.value); else state.sel.delete(cb.value);
    render();
  });

  /* ---------- Render ---------- */
  let current = plan();
  function render() {
    current = plan();
    const p = current;
    $$(".stepper").forEach((st) => (st.querySelector("output").textContent = state[st.dataset.k]));
    $$('.stepper[data-k="people"] [data-d="-1"]')[0].disabled = state.people <= 1;
    $$('.stepper[data-k="people"] [data-d="1"]')[0].disabled = state.people >= S.capacity.maxPeople;
    $$('.stepper[data-k="weeks"] [data-d="-1"]')[0].disabled = state.weeks <= 1;
    $$('.stepper[data-k="weeks"] [data-d="1"]')[0].disabled = state.weeks >= S.capacity.maxWeeks;
    $("#cap-text").innerHTML = `<b>${fmtD(p.capacity)}</b> <span class="muted">= ${state.people} × ${state.weeks} wk × 5 d × ${Math.round(p.focus * 100)}% focus</span>`;

    const late = new Set(p.rows.filter((r) => r.late).map((r) => r.it.id));
    const missingFor = {}; p.missing.forEach((m) => (missingFor[m.item.id] = (missingFor[m.item.id] || []).concat(m.dep)));
    $$(".item").forEach((el) => {
      const id = el.dataset.id, on = state.sel.has(id);
      el.querySelector(".sw-input").checked = on;
      el.classList.toggle("on", on);
      const flag = el.querySelector(".it-flag");
      const msgs = [];
      if (on && missingFor[id]) msgs.push(`Needs “${missingFor[id].map((d) => d.title).join("”, “")}”, which is out`);
      if (on && late.has(id)) msgs.push(`Finishes after week ${state.weeks}`);
      flag.hidden = !msgs.length; flag.textContent = msgs.join(" · ");
      el.classList.toggle("flagged", msgs.length > 0);
    });

    // KPIs
    const used = p.effort / p.capacity;
    const finishWeek = Math.ceil(p.finish / 5 - 1e-9);
    $("#kpis").innerHTML = `
      <div class="stat"><span class="label">Items in scope</span><span class="value">${p.chosen.length}<small>of ${S.items.length}</small></span></div>
      <div class="stat"><span class="label">Planned effort</span><span class="value">${fmtD(p.effort).replace(" d", "")}<small>person-days</small></span><span class="delta ${used > 1 ? "up-bad" : "flat"}">${Math.round(used * 100)}% <span>of capacity</span></span></div>
      <div class="stat"><span class="label">Done by</span><span class="value">${p.chosen.length ? "Week " + finishWeek : "—"}</span><span class="delta ${p.fits ? "down-good" : "up-bad"}">${p.chosen.length ? (p.fits ? "✓ inside the window" : `▲ ${finishWeek - state.weeks} wk past week ${state.weeks}`) : "<span>nothing selected</span>"}</span></div>
      <div class="stat"><span class="label">Value points</span><span class="value">${p.value}</span><span class="delta flat"><span>sum of 1–5 ratings</span></span></div>`;

    // Capacity fill, stacked by area
    const scale = Math.max(p.capacity, p.effort);
    const byArea = S.areas.map((a) => ({ a, d: p.chosen.filter((i) => i.area === a.id).reduce((x, i) => x + i.effort, 0) }));
    $("#fill-bar").innerHTML = byArea.filter((x) => x.d).map((x) => `<span style="--w:${(x.d / scale) * 100}%;--c:${areaColor(x.a.id)}" title="${esc(x.a.label)}: ${fmtD(x.d)}"></span>`).join("")
      + `<em class="cap-mark" style="--x:${(p.capacity / scale) * 100}%" title="Capacity ${fmtD(p.capacity)}"></em>`;
    $("#fill-bar").classList.toggle("over", p.effort > p.capacity);
    $("#fill-legend").innerHTML = `<span>${fmtD(p.effort)} planned</span><span>${p.effort > p.capacity ? `<b class="bad-text">${fmtD(p.effort - p.capacity)} over</b>` : `${fmtD(p.capacity - p.effort)} spare`}</span>`;

    // Flags
    const flags = [];
    p.missing.forEach((m) => flags.push(`<li class="warn"><span><b>${esc(m.item.title)}</b> needs <b>${esc(m.dep.title)}</b>, which is not in scope.</span><button class="btn ghost" type="button" data-add="${esc(m.dep.id)}">Add it</button></li>`));
    if (!p.fits && p.chosen.length) flags.push(`<li class="bad"><span>${late.size} item${late.size === 1 ? " finishes" : "s finish"} after week ${state.weeks}. ${state.people < S.capacity.maxPeople ? "Add a person, add a week, or drop something." : "Add a week or drop something."}</span>${state.weeks < S.capacity.maxWeeks ? `<button class="btn ghost" type="button" data-week="1">Add a week</button>` : ""}</li>`);
    if (p.chosen.length && !S.items.filter((i) => i.must).every((i) => state.sel.has(i.id))) flags.push(`<li class="note"><span>Some must-haves are out: ${S.items.filter((i) => i.must && !state.sel.has(i.id)).map((i) => esc(i.title)).join(", ")}.</span></li>`);
    $("#flags").innerHTML = flags.length ? `<ul>${flags.join("")}</ul>` : (p.chosen.length ? `<p class="ok">✓ No conflicts: every dependency is in scope and everything fits.</p>` : `<p class="muted">Pick items on the left or start from a preset.</p>`);

    renderGantt(p);
    renderSaveSummary(p);
    renderProposals();
    writeUrl();
  }
  $("#flags").addEventListener("click", (e) => {
    const a = e.target.closest("[data-add]"); if (a) { state.sel.add(a.dataset.add); render(); return; }
    const w = e.target.closest("[data-week]"); if (w) { state.weeks = Math.min(S.capacity.maxWeeks, state.weeks + 1); render(); }
  });

  /* ---------- Timeline ---------- */
  function renderGantt(p) {
    const g = $("#gantt");
    if (!p.rows.length) { g.innerHTML = `<p class="empty">Nothing in scope yet. Switch on some items above.</p>`; $("#tl-legend").innerHTML = ""; return; }
    const span = Math.max(p.windowDays, p.finish) * 1.04;
    const weeks = Math.ceil(span / 5);
    const x = (d) => (d / span) * 100;
    const lanes = Array.from({ length: state.people }, (_, l) => p.rows.filter((r) => r.lane === l).sort((a, b) => a.start - b.start));
    g.style.setProperty("--win", x(p.windowDays) + "%");
    g.innerHTML = `<div class="g-head"><span></span><div class="g-axis">${Array.from({ length: weeks }, (_, w) => `<span style="left:${x(w * 5)}%">W${w + 1}</span>`).join("")}<em class="g-win" style="left:${x(p.windowDays)}%">end of week ${state.weeks}</em></div></div>`
      + lanes.map((rows, l) => `<div class="g-lane"><div class="g-lane-h"><span class="kit-avatar">P${l + 1}</span>Person ${l + 1}<span class="muted">${rows.length ? fmtD(rows.reduce((a, r) => a + r.it.effort, 0)) : "free"}</span></div>
        ${rows.map((r) => `<div class="g-row"><span class="g-label" title="${esc(r.it.title)}">${esc(r.it.title)}</span><div class="g-track">
          ${Array.from({ length: weeks }, (_, w) => `<i class="g-grid" style="left:${x(w * 5)}%"></i>`).join("")}<i class="g-winline"></i>
          <span class="g-bar ${r.late ? "late" : ""}" style="left:${x(r.start)}%;width:${x(r.end - r.start)}%;--c:${areaColor(r.it.area)}" role="img" aria-label="${esc(r.it.title)}: day ${Math.round(r.start * 10) / 10} to ${Math.round(r.end * 10) / 10}${r.late ? ", after the window" : ""}"></span>
          <span class="g-dur" style="left:calc(${x(r.end)}% + 6px)">${fmtD(r.it.effort)}</span></div></div>`).join("")}</div>`).join("");
    $("#tl-legend").innerHTML = S.areas.map((a) => `<span><i style="--c:${areaColor(a.id)}"></i>${esc(a.label)}</span>`).join("") + `<span><i class="late-key"></i>After the window</span>`;
  }

  /* ---------- Proposals: state.scope.<person> ---------- */
  const slug = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  function person() {
    const name = slug(D.author()); if (name) return name;
    let id = null; try { id = localStorage.getItem("kit-anon-id"); } catch (e) {}
    if (!id) { id = "reader-" + Math.random().toString(36).slice(2, 8); try { localStorage.setItem("kit-anon-id", id); } catch (e) {} }
    return id;
  }
  function renderSaveSummary(p) {
    $("#save-sum").textContent = p.chosen.length ? `${p.chosen.length} items · ${fmtD(p.effort)} · ${state.people} ${state.people === 1 ? "person" : "people"} × ${state.weeks} weeks · ${p.fits ? "fits" : "does not fit"}` : "Nothing selected yet.";
  }
  $("#save-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const st = $("#save-status"), p = current;
    if (!p.chosen.length) { st.textContent = "Select at least one item first."; st.className = "save-status warn"; return; }
    await D.ensureAuthor();
    const name = $("#prop-name").value.trim() || `${D.author() || "Anonymous"}’s slice`;
    try {
      await D.set("state.scope." + person(), {
        name, author: D.author() || "Anonymous",
        selected: p.chosen.map((i) => ({ id: i.id, title: i.title, effort: i.effort })),
        capacity: { people: state.people, weeks: state.weeks, focus: p.focus, days: Math.round(p.capacity * 10) / 10 },
        totalDays: p.effort, finishWeek: Math.ceil(p.finish / 5 - 1e-9), fits: p.fits, valuePoints: p.value,
        missingDeps: p.missing.map((m) => ({ item: m.item.id, needs: m.dep.id })),
        link: location.href.replace(/\/_versions\/\d+\//, "/"),
      });
      st.textContent = `Saved “${name}”.`; st.className = "save-status ok";
      refresh();
    } catch (err) { st.textContent = "Couldn’t save: " + err.message; st.className = "save-status warn"; }
  });
  let proposals = [];
  function renderProposals() {
    const host = $("#props");
    if (!proposals.length) { host.innerHTML = `<div class="empty-props"><b>No proposals yet</b><span>Save the first one; it will show up here for everyone.</span></div>`; return; }
    const mine = "state.scope." + person();
    host.innerHTML = proposals.slice().sort((a, b) => (a.key === mine ? -1 : b.key === mine ? 1 : b.updatedAt.localeCompare(a.updatedAt))).map((d) => {
      const v = d.value || {}, ids = new Set((v.selected || []).map((x) => x.id));
      const plus = [...ids].filter((id) => !state.sel.has(id)).length, minus = [...state.sel].filter((id) => !ids.has(id)).length;
      const same = !plus && !minus && v.capacity && v.capacity.people === state.people && v.capacity.weeks === state.weeks;
      return `<article class="prop ${d.key === mine ? "mine" : ""}">
        <header><div><h3>${esc(v.name || "Untitled")}</h3><p class="muted">${esc(v.author || "Anonymous")} · ${Kit.ago(d.updatedAt)}${d.key === mine ? ' · <span class="tag accent">Yours</span>' : ""}</p></div>
          <button class="btn ${same ? "" : "primary"}" type="button" data-load="${esc(d.key)}" ${same ? "disabled" : ""}>${same ? "Loaded" : "Load"}</button></header>
        <div class="prop-stats"><span><b>${(v.selected || []).length}</b> items</span><span><b>${fmtD(v.totalDays || 0)}</b></span><span>${v.capacity ? `${v.capacity.people} × ${v.capacity.weeks} wk` : ""}</span><span class="tag ${v.fits ? "good" : "bad"} dot">${v.fits ? "Fits" : "Over"}</span></div>
        <div class="prop-items">${(v.selected || []).map((x) => `<span class="pi" style="--c:${byId[x.id] ? areaColor(byId[x.id].area) : "var(--line)"}">${esc(x.title)}</span>`).join("")}</div>
        <p class="prop-diff">${same ? "Same as what you see now." : `Compared with your current slice: <b>+${plus}</b> item${plus === 1 ? "" : "s"}, <b>−${minus}</b>.`}</p></article>`;
    }).join("");
  }
  $("#props").addEventListener("click", (e) => {
    const b = e.target.closest("[data-load]"); if (!b) return;
    const d = proposals.find((x) => x.key === b.dataset.load); if (!d) return;
    const v = d.value;
    state.sel = new Set((v.selected || []).map((x) => x.id).filter((id) => byId[id]));
    if (v.capacity) { state.people = v.capacity.people; state.weeks = v.capacity.weeks; }
    if (d.key === "state.scope." + person()) $("#prop-name").value = v.name || "";
    render();
    $("#slice").scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  });
  let first = true;
  function apply(docs) {
    proposals = docs;
    if (first) { first = false; const mine = docs.find((d) => d.key === "state.scope." + person()); if (mine && !$("#prop-name").value) $("#prop-name").value = mine.value.name || ""; }
    renderProposals();
  }
  function refresh() { D.list("state.scope.").then(apply).catch(() => {}); }
  D.watch("state.scope.", apply, { interval: 8000 });

  Kit.comments($("#thread"), { key: "scope", placeholder: "Ask about an item or argue for a different slice…" });
  render();
  Kit.refresh();
});
