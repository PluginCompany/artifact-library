/* Toolbar variants prototype — renders window.PROTO (data.js).
   Parts: controls (variant/device/scheme), the mock page, three interactive
   toolbar mock-ups (TOOLBARS), the info panel with per-variant comments,
   the comparison table, and saved picks (answer.pick.<person>). */
document.addEventListener("kit:ready", () => {
  "use strict";
  const P = window.PROTO;
  const { $, $$, esc } = Kit;
  const D = Kit.data;
  const V = Object.fromEntries(P.variants.map((v) => [v.id, v]));
  const latest = P.versions.find((v) => v.latest) || P.versions[0];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- State (shareable through the URL) ---------- */
  const state = { variant: P.variants[0].id, device: "desktop", scheme: "light", version: latest.n };
  try {
    const q = new URLSearchParams(location.search);
    if (V[q.get("v")]) state.variant = q.get("v");
    if (["desktop", "phone"].includes(q.get("d"))) state.device = q.get("d");
    if (["light", "dark"].includes(q.get("s"))) state.scheme = q.get("s");
  } catch (e) {}
  function writeUrl() {
    try { const u = new URL(location.href); u.searchParams.set("v", state.variant); u.searchParams.set("d", state.device); u.searchParams.set("s", state.scheme); history.replaceState(null, "", u); } catch (e) {}
  }

  /* ---------- Hero ---------- */
  $("#intro").textContent = P.meta.intro;
  $("#findings").innerHTML = P.meta.findings.map((f) => `<span class="tag warn dot">${esc(f.id)} · ${esc(f.text)}</span>`).join("");

  /* ---------- Mock page ---------- */
  const ICON = `<svg viewBox="0 0 20 20" class="mk-icon" aria-hidden="true"><rect width="20" height="20" rx="5" class="i-bg"/><rect x="4.5" y="5" width="7" height="10" rx="1.2" class="i-a"/><rect x="6.8" y="4" width="7" height="11" rx="1.2" class="i-b"/><rect x="9" y="3.2" width="7" height="12" rx="1.3" class="i-c"/></svg>`;
  const pg = P.page;
  $("#mock").innerHTML = `<div class="m-scroll" id="m-scroll"><article class="m-page">
      <div class="m-banner" id="m-banner" hidden></div>
      <div class="m-eyebrow">${esc(pg.eyebrow)}</div><h1>${esc(pg.title)}</h1><p class="m-lead">${esc(pg.lead)}</p>
      <div class="m-stats">${pg.stats.map(([v, l]) => `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join("")}</div>
      <div class="m-chart" aria-hidden="true">${Array.from({ length: 13 }, (_, i) => `<i style="--h:${42 + Math.round(30 * Math.sin(i / 2.2) + i * 3)}%"></i>`).join("")}</div>
      ${pg.sections.map((s) => `<h2>${esc(s.h)}</h2><p>${esc(s.p)}</p>`).join("")}
      <p class="m-foot">End of report · scroll back up</p></article></div>`;

  // The mock has its own scheme: same as the site uses kit tokens directly,
  // the opposite one is built by inverting --ink / --ground (still tokens only).
  const siteDark = () => { const t = document.documentElement.getAttribute("data-theme"); return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; };
  function paintScheme() {
    const wantDark = state.scheme === "dark";
    $("#device").classList.toggle("inverted", wantDark !== siteDark());
    $("#device").dataset.scheme = state.scheme;
  }
  document.addEventListener("kit:theme", paintScheme);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paintScheme);

  /* ---------- Toolbar mock-ups ---------- */
  const host = $("#tb-host"), vp = $("#vp");
  const versionLabel = (n) => `v${n}${n === latest.n ? " · Latest" : ""}`;
  const versionItems = (cls) => P.versions.map((v) => `<button type="button" role="option" class="${cls}" data-ver="${v.n}" aria-selected="${v.n === state.version}">
      <b>Version ${v.n}${v.latest ? ' <span class="m-tag">Latest</span>' : ""}</b><span>${esc(v.date)} · ${esc(v.message)}</span></button>`).join("");
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("on");
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2200);
  }
  function setVersion(n) {
    state.version = n;
    $$("[data-ver]", host).forEach((b) => b.setAttribute("aria-selected", String(+b.dataset.ver === n)));
    $$("[data-ver-label]", host).forEach((el) => (el.textContent = el.dataset.verLabel === "short" ? "v" + n : versionLabel(n)));
    const banner = $("#m-banner");
    banner.hidden = n === latest.n;
    banner.innerHTML = `You are viewing version ${n}. <a href="#" data-act="latest">Open latest (v${latest.n})</a>`;
    toast(`Now showing version ${n}`);
  }
  function act(name) {
    if (name === "copy") toast("Link to this version copied (prototype: nothing was copied)");
    else if (name === "copy-latest") toast("Stable latest link copied (prototype)");
    else if (name === "download") toast(`Would download q3-report-v${state.version}.tar.gz`);
    else if (name === "library") toast("Would open the artifact library");
  }
  const actions = (cls) => `<button type="button" class="${cls}" data-act="copy">Copy link</button><button type="button" class="${cls}" data-act="copy-latest">Copy latest link</button><button type="button" class="${cls}" data-act="download">Download</button>`;

  const TOOLBARS = {
    // A — compact pill that expands into a card (bottom sheet on phones)
    a() {
      host.innerHTML = `<div class="tb-a" id="tb">
        <button type="button" class="pill" aria-expanded="false" aria-controls="tb-a-card" aria-label="Artifact toolbar, version ${state.version}">${ICON}<span data-ver-label="short">v${state.version}</span><svg viewBox="0 0 12 12" class="chev" aria-hidden="true"><path d="M3 7.5l3-3 3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <div class="card" id="tb-a-card" role="dialog" aria-label="Artifact toolbar" hidden>
          <div class="card-head"><button type="button" class="lib" data-act="library">${ICON}<span>Library</span></button><span class="title">${esc(pg.title)}</span><button type="button" class="x" aria-label="Collapse toolbar" data-close>×</button></div>
          <div class="list" role="listbox" aria-label="Versions">${versionItems("vitem")}</div>
          <div class="card-actions">${actions("abtn")}</div>
        </div></div>`;
      const pill = $(".pill", host), card = $(".card", host);
      const open = (on) => { card.hidden = !on; pill.setAttribute("aria-expanded", String(on)); $("#tb").classList.toggle("open", on); if (on) $(".vitem[aria-selected=true]", card)?.focus(); else pill.focus({ preventScroll: true }); };
      pill.addEventListener("click", () => open(card.hidden));
      $("[data-close]", host).addEventListener("click", () => open(false));
      return { close: () => !card.hidden && open(false) };
    },
    // B — slim top bar that pushes the page down; can be hidden to a tab
    b() {
      host.innerHTML = `<div class="tb-b" id="tb">
          <button type="button" class="lib" data-act="library">${ICON}<span>Library</span></button><span class="sep" aria-hidden="true"></span><span class="title">${esc(pg.title)}</span><span class="grow"></span>
          <div class="dd"><button type="button" class="bbtn ver" aria-haspopup="listbox" aria-expanded="false" data-menu="ver"><span data-ver-label="long">${versionLabel(state.version)}</span><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            <div class="menu" data-for="ver" role="listbox" aria-label="Versions" hidden>${versionItems("vitem")}</div></div>
          <button type="button" class="bbtn wide-only" data-act="copy">Copy link</button>
          <div class="dd"><button type="button" class="bbtn more" aria-haspopup="menu" aria-expanded="false" data-menu="more" aria-label="More actions">⋯</button>
            <div class="menu right" data-for="more" role="menu" hidden>${actions("mitem")}<button type="button" class="mitem" data-hide>Hide this bar</button></div></div>
        </div><button type="button" class="tb-b-restore" hidden aria-label="Show the artifact bar">${ICON}<span data-ver-label="short">v${state.version}</span></button>`;
      vp.classList.add("push-top");
      const menus = $$(".menu", host);
      const closeAll = () => { let had = false; menus.forEach((m) => { if (!m.hidden) had = true; m.hidden = true; }); $$("[data-menu]", host).forEach((b) => b.setAttribute("aria-expanded", "false")); return had; };
      $$("[data-menu]", host).forEach((b) => b.addEventListener("click", (e) => {
        e.stopPropagation();
        const m = $(`.menu[data-for="${b.dataset.menu}"]`, host), was = !m.hidden;
        closeAll(); m.hidden = was; b.setAttribute("aria-expanded", String(!was));
        if (!was) $("button", m)?.focus();
      }));
      const bar = $(".tb-b", host), restore = $(".tb-b-restore", host);
      $("[data-hide]", host).addEventListener("click", () => { closeAll(); bar.hidden = true; restore.hidden = false; vp.classList.remove("push-top"); restore.focus(); toast("Bar hidden; the tab brings it back"); });
      restore.addEventListener("click", () => { bar.hidden = false; restore.hidden = true; vp.classList.add("push-top"); });
      return { close: closeAll, after: closeAll };
    },
    // C — edge tab that slides out a panel (bottom sheet on phones)
    c() {
      host.innerHTML = `<button type="button" class="tb-c-tab" aria-expanded="false" aria-controls="tb-c-panel" aria-label="Open artifact panel">${ICON}<span data-ver-label="short">v${state.version}</span></button>
        <div class="tb-c-scrim" hidden></div>
        <div class="tb-c-panel" id="tb-c-panel" role="dialog" aria-label="Artifact panel" hidden>
          <div class="p-head"><button type="button" class="lib" data-act="library">${ICON}<span>Library</span></button><span class="grow"></span><button type="button" class="x" aria-label="Close panel" data-close>×</button></div>
          <div class="p-title"><b>${esc(pg.title)}</b><span>${esc(pg.eyebrow)}</span></div>
          <div class="p-label">Versions</div><div class="list" role="listbox" aria-label="Versions">${versionItems("vitem")}</div>
          <div class="p-actions">${actions("abtn")}</div></div>`;
      const tab = $(".tb-c-tab", host), panel = $(".tb-c-panel", host), scrim = $(".tb-c-scrim", host);
      const open = (on) => {
        panel.hidden = !on; scrim.hidden = !on; tab.setAttribute("aria-expanded", String(on)); host.classList.toggle("c-open", on);
        if (on) requestAnimationFrame(() => panel.classList.add("in")); else panel.classList.remove("in");
        if (on) $(".vitem[aria-selected=true]", panel)?.focus(); else tab.focus({ preventScroll: true });
      };
      tab.addEventListener("click", () => open(panel.hidden));
      scrim.addEventListener("click", () => open(false));
      $("[data-close]", host).addEventListener("click", () => open(false));
      return { close: () => !panel.hidden && open(false) };
    },
  };
  let toolbar = null;
  host.addEventListener("click", (e) => {
    const v = e.target.closest("[data-ver]");
    if (v) { setVersion(+v.dataset.ver); toolbar && toolbar.after && toolbar.after(); return; }
    const a = e.target.closest("[data-act]");
    if (a) { act(a.dataset.act); toolbar && toolbar.after && toolbar.after(); }
  });
  $("#mock").addEventListener("click", (e) => { const a = e.target.closest("[data-act=latest]"); if (a) { e.preventDefault(); setVersion(latest.n); } });
  document.addEventListener("click", (e) => { if (toolbar && toolbar.after && !host.contains(e.target)) toolbar.after(); });
  vp.addEventListener("keydown", (e) => { if (e.key === "Escape" && toolbar && toolbar.close()) { e.stopPropagation(); } });

  function buildToolbar() {
    vp.classList.remove("push-top");
    host.className = "tb-host";
    toolbar = TOOLBARS[state.variant]();
    $("#m-scroll").scrollTop = 0;
  }

  /* ---------- Controls ---------- */
  const vseg = $("#variant-seg");
  vseg.innerHTML = P.variants.map((v) => `<button type="button" data-v="${v.id}" aria-pressed="false"><b>${esc(v.letter)}</b> ${esc(v.name)}<span class="cnt" data-cnt="${v.id}"></span></button>`).join("");
  function seg(el, value) { $$("button", el).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === value))); }
  function apply(changed) {
    seg(vseg, state.variant); seg($("#device-seg"), state.device); seg($("#scheme-seg"), state.scheme);
    const dev = $("#device");
    dev.classList.toggle("phone", state.device === "phone");
    dev.classList.toggle("desktop", state.device === "desktop");
    paintScheme();
    if (changed !== "scheme") buildToolbar();
    const v = V[state.variant];
    $("#stage-note").innerHTML = `<b>${esc(v.letter)} · ${esc(v.name)}</b> on a ${state.device === "phone" ? "phone (360 px wide)" : "desktop window"} with a ${state.scheme} page. ${esc(state.device === "phone" ? v.f2 : v.tagline + ".")}`;
    paintInfo();
    writeUrl();
  }
  vseg.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b && b.dataset.v !== state.variant) { state.variant = b.dataset.v; apply("variant"); } });
  $("#device-seg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { state.device = b.dataset.v; apply("device"); } });
  $("#scheme-seg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { state.scheme = b.dataset.v; apply("scheme"); } });
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input,textarea,select,[contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
    const idx = ["1", "2", "3", "4"].indexOf(e.key);
    if (idx >= 0 && P.variants[idx]) { state.variant = P.variants[idx].id; apply("variant"); }
    else if (e.key === "d" || e.key === "D") { state.device = state.device === "phone" ? "desktop" : "phone"; apply("device"); }
    else if (e.key === "s" || e.key === "S") { state.scheme = state.scheme === "dark" ? "light" : "dark"; apply("scheme"); }
  });

  /* ---------- Info panel with a comment thread per variant ---------- */
  const info = $("#info");
  info.innerHTML = P.variants.map((v) => `<div class="vinfo" data-v="${v.id}" hidden>
      <div class="vi-head"><span class="vi-letter">${esc(v.letter)}</span><div><h2>${esc(v.name)}</h2><p>${esc(v.tagline)}</p></div></div>
      <p class="vi-why">${esc(v.rationale)}</p>
      <div class="vi-effects"><div><span class="tag warn">F2 · phones</span><p>${esc(v.f2)}</p></div><div><span class="tag warn">F3 · dark mode</span><p>${esc(v.f3)}</p></div></div>
      <div class="vi-pc"><ul class="pros">${v.pros.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><ul class="cons">${v.cons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <dl class="facts"><div><dt>Effort</dt><dd>${esc(v.effort)}</dd></div><div><dt>Touches</dt><dd><code>${esc(v.touches)}</code></dd></div></dl>
      <div class="row vi-actions"><button class="btn primary" type="button" data-pick="${v.id}">Pick ${esc(v.letter)}</button><span class="vi-picks" data-picks="${v.id}"></span></div>
      <div class="vi-thread" id="thread-${v.id}"></div></div>`).join("");
  P.variants.forEach((v) => Kit.comments($("#thread-" + v.id), { key: "variant-" + v.id, title: `Comments on ${v.letter}`, placeholder: `What works or doesn’t in variant ${v.letter}?`, compact: true }));
  info.addEventListener("click", (e) => { const b = e.target.closest("[data-pick]"); if (b) { selectPick(b.dataset.pick); $("#pick").scrollIntoView({ behavior: reduce ? "auto" : "smooth" }); } });
  function paintInfo() { $$(".vinfo", info).forEach((el) => (el.hidden = el.dataset.v !== state.variant)); }

  /* ---------- Comparison table ---------- */
  const rows = [["Visible footprint", (v) => esc(v.f2)], ["Dark pages", (v) => esc(v.f3)], ["Strengths", (v) => `<ul class="tl pros">${v.pros.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`],
    ["Weaknesses", (v) => `<ul class="tl cons">${v.cons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`], ["Effort", (v) => `<span class="tag outline">${esc(v.effort)}</span>`], ["Code", (v) => `<code>${esc(v.touches)}</code>`]];
  $("#cmp-table").innerHTML = `<thead><tr><th></th>${P.variants.map((v) => `<th><button type="button" class="try" data-try="${v.id}"><b>${esc(v.letter)}</b> ${esc(v.name)} <span>Try ↑</span></button></th>`).join("")}</tr></thead>
    <tbody>${rows.map(([label, fn]) => `<tr><th scope="row">${label}</th>${P.variants.map((v) => `<td>${fn(v)}</td>`).join("")}</tr>`).join("")}</tbody>`;
  $("#cmp-table").addEventListener("click", (e) => { const b = e.target.closest("[data-try]"); if (b) { state.variant = b.dataset.try; apply("variant"); $("#try").scrollIntoView({ behavior: reduce ? "auto" : "smooth" }); } });

  /* ---------- Picks: answer.pick.<person> ---------- */
  const slug = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  function person() {
    const name = slug(D.author());
    if (name) return name;
    let id = null; try { id = localStorage.getItem("kit-anon-id"); } catch (e) {}
    if (!id) { id = "reader-" + Math.random().toString(36).slice(2, 8); try { localStorage.setItem("kit-anon-id", id); } catch (e) {} }
    return id;
  }
  let picks = [];  // documents under answer.pick.
  let chosen = null;
  $("#pick-cards").innerHTML = P.variants.map((v) => `<button type="button" class="pcard" role="radio" aria-checked="false" data-p="${v.id}"><span class="pl">${esc(v.letter)}</span><span><b>${esc(v.name)}</b><span>${esc(v.tagline)}</span></span><span class="radio" aria-hidden="true"></span></button>`).join("");
  function selectPick(id) { chosen = id; $$(".pcard").forEach((c) => { const on = c.dataset.p === id; c.setAttribute("aria-checked", String(on)); c.classList.toggle("on", on); }); }
  $("#pick-cards").addEventListener("click", (e) => { const c = e.target.closest(".pcard"); if (c) selectPick(c.dataset.p); });
  $("#pick-cards").addEventListener("keydown", (e) => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!d) return;
    e.preventDefault(); const ids = P.variants.map((v) => v.id), i = Math.max(0, ids.indexOf(chosen));
    const next = ids[(i + d + ids.length) % ids.length]; selectPick(next); $(`.pcard[data-p="${next}"]`).focus();
  });
  $("#pick-save").addEventListener("click", async () => {
    const st = $("#pick-status");
    if (!chosen) { st.textContent = "Choose a variant first."; st.className = "pick-status warn"; return; }
    await D.ensureAuthor();
    const v = V[chosen];
    try {
      await D.set("answer.pick." + person(), { choice: v.id, choiceLabel: `${v.letter} · ${v.name}`, note: $("#pick-note").value.trim(), author: D.author() || "Anonymous", device: state.device, scheme: state.scheme });
      st.textContent = `Saved. Your pick: ${v.letter} · ${v.name}.`; st.className = "pick-status ok";
      refreshPicks();
    } catch (e) { st.textContent = "Couldn’t save: " + e.message; st.className = "pick-status warn"; }
  });
  $("#pick-clear").addEventListener("click", async () => {
    try { await D.remove("answer.pick." + person()); selectPick(null); $("#pick-note").value = ""; $("#pick-status").textContent = "Your pick was removed."; $("#pick-status").className = "pick-status"; refreshPicks(); }
    catch (e) { $("#pick-status").textContent = "Couldn’t remove: " + e.message; }
  });
  function paintPicks(loadMine) {
    const counts = Object.fromEntries(P.variants.map((v) => [v.id, []]));
    picks.forEach((d) => { if (d.value && counts[d.value.choice]) counts[d.value.choice].push(d); });
    const total = picks.length, max = Math.max(1, ...Object.values(counts).map((x) => x.length));
    $("#tally-total").textContent = total ? `${total} ${total === 1 ? "person" : "people"}` : "";
    $("#tally").innerHTML = total ? P.variants.map((v) => `<div class="tl-row"><div class="tl-top"><b>${esc(v.letter)} · ${esc(v.name)}</b><span class="num">${counts[v.id].length}</span></div>
        <div class="tl-bar"><i style="--w:${(counts[v.id].length / max) * 100}%"></i></div>
        ${counts[v.id].map((d) => `<div class="tl-who"><span class="kit-avatar">${esc((d.value.author || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase())}</span><div><b>${esc(d.value.author || "Anonymous")}</b>${d.value.note ? `<p>“${esc(d.value.note)}”</p>` : ""}</div></div>`).join("")}</div>`).join("")
      : `<p class="empty">No picks yet. Be the first: choose a variant on the left.</p>`;
    $$("[data-cnt]").forEach((el) => { const n = counts[el.dataset.cnt].length; el.textContent = n ? String(n) : ""; el.title = n ? `${n} pick${n === 1 ? "" : "s"}` : ""; });
    $$("[data-picks]").forEach((el) => { const n = counts[el.dataset.picks].length; el.textContent = n ? `${n} pick${n === 1 ? "" : "s"} so far` : "No picks yet"; });
    const mine = picks.find((d) => d.key === "answer.pick." + person());
    $("#pick-clear").hidden = !mine;
    if (loadMine && mine) {
      selectPick(mine.value.choice);
      if (document.activeElement !== $("#pick-note")) $("#pick-note").value = mine.value.note || "";
      $("#pick-status").textContent = `Your saved pick: ${mine.value.choiceLabel} · ${Kit.ago(mine.updatedAt)}.`;
    }
  }
  let firstLoad = true;
  function refreshPicks() { D.list("answer.pick.").then((docs) => { picks = docs; paintPicks(firstLoad); firstLoad = false; }).catch(() => {}); }
  D.watch("answer.pick.", (docs) => { picks = docs; paintPicks(firstLoad); firstLoad = false; }, { interval: 8000 });

  apply();
  Kit.refresh();
});
