/* Runbook — renders window.RUNBOOK and keeps shared progress in state.checklist.
   The page is built once; saved progress only patches step states, so a note
   being typed is never wiped by a live update. Writes merge into the latest
   saved document with expectedRevision and retry on conflict. */
document.addEventListener("kit:ready", () => {
  "use strict";
  const RB = window.RUNBOOK, { $, $$, esc } = Kit, D = Kit.data;
  const KEY = "state.checklist";
  const steps = RB.phases.flatMap((p) => p.steps.map((s) => ({ ...s, phase: p.id })));
  const ICON = {
    check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    note: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 12.5V3.5h10v6l-3 3H3z M10 12.5v-3h3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  };
  const hm = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "");
  const day = (iso) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
  const runIdNow = () => { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
  const fresh = () => ({ runId: runIdNow(), title: `${RB.title} · ${RB.version}`, startedAt: new Date().toISOString(), startedBy: D.author() || "", steps: {} });

  /* ---------- Static render ---------- */
  document.title = `Runbook · ${RB.title}`;
  $("#rb-title").innerHTML = esc(RB.title).replace("deploy", "<em>deploy</em>");
  $("#rb-intro").textContent = RB.intro;
  $("#rb-version").textContent = "Version " + RB.version;
  $("#rb-duration").textContent = RB.duration;
  $("#rb-facts").innerHTML = RB.facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
  $("#seeding-text").textContent = RB.seeding;
  $("#run-total").textContent = steps.length;

  let n = 0;
  $("#side").innerHTML = RB.phases.map((p, pi) => `<h5>${pi + 1} · ${esc(p.title)}</h5>` + p.steps.map((s) => { n++; return `<a href="#s-${esc(s.id)}" data-side="${esc(s.id)}"><b class="sn">${String(n).padStart(2, "0")}</b><span>${esc(s.title)}</span><i class="side-check" aria-hidden="true">${ICON.check}</i></a>`; }).join("")).join("") +
    `<h5>Reference</h5><a href="#rollback"><b>↺</b>Rollback</a><a href="#history"><b>≡</b>Previous runs</a>`;

  n = 0;
  $("#phases").innerHTML = RB.phases.map((p, pi) => `<section class="rb-sec phase" id="p-${esc(p.id)}">
      <div class="phase-head"><span class="big-num">${pi + 1}</span><div><div class="eyebrow thread">Phase ${pi + 1} of ${RB.phases.length}</div><h2 class="h2">${esc(p.title)}</h2><p class="muted">${esc(p.summary)}</p></div><span class="phase-count mono" data-phase="${esc(p.id)}"></span></div>
      <ol class="rb-steps">${p.steps.map((s) => { n++; return `<li class="rb-step" id="s-${esc(s.id)}" data-step="${esc(s.id)}">
        <button class="tick" type="button" aria-pressed="false" aria-label="Mark step ${n} done: ${esc(s.title)}"><span class="tick-n">${n}</span>${ICON.check}</button>
        <div class="rb-card">
          <div class="rb-top"><h3>${esc(s.title)}</h3><span class="tag accent next-tag">Next</span><span class="spacer"></span><button class="btn ghost more-btn" type="button" aria-expanded="false">Show details</button></div>
          <p class="why">${esc(s.why)}</p>
          ${s.commands.map((c) => `<pre class="cmd" data-copy>${esc(c)}</pre>`).join("")}
          ${s.expect ? `<div class="expect"><span class="eyebrow">Expected</span><pre>${esc(s.expect)}</pre></div>` : ""}
          ${s.fail && s.fail.length ? `<details class="fold fail"><summary>If this fails</summary><div class="in"><ul class="dots">${s.fail.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></div></details>` : ""}
          <div class="rb-foot"><span class="who mono"></span><span class="spacer"></span><button class="btn ghost note-btn" type="button">${ICON.note}<span>Add note</span></button></div>
          <div class="note-box" hidden><label class="sr-only" for="note-${esc(s.id)}">Note for ${esc(s.title)}</label><textarea id="note-${esc(s.id)}" rows="2" placeholder="What happened? Output, deviations, links…"></textarea><div class="row" style="--gap:8px"><span class="note-meta mono"></span><span class="spacer"></span><button class="btn" type="button" data-note-cancel>Cancel</button><button class="btn primary" type="button" data-note-save>Save note</button></div></div>
          <p class="note-text" hidden></p>
        </div></li>`; }).join("")}</ol></section>`).join("");

  $("#rollback-list").innerHTML = RB.rollback.map((r) => `<article class="rb-roll"><h3>${esc(r.title)}</h3>${r.commands.map((c) => `<pre class="cmd" data-copy>${esc(c)}</pre>`).join("")}<p class="muted">${esc(r.note)}</p></article>`).join("");
  Kit.refresh();

  /* ---------- Progress state ---------- */
  let doc = null, run = fresh(), archived = [];
  const stepState = (id) => (run.steps && run.steps[id]) || {};
  function paint() {
    const done = steps.filter((s) => stepState(s.id).done).length;
    const next = steps.find((s) => !stepState(s.id).done);
    $("#run-title").textContent = run.title || RB.title;
    $("#run-meta").textContent = doc ? `Run ${run.runId} · started ${day(run.startedAt)} ${hm(run.startedAt)}${run.startedBy ? " by " + run.startedBy : ""}` : "Not started yet — tick the first step to start this run.";
    $("#run-done").textContent = done;
    const prog = $("#run-progress");
    prog.setAttribute("aria-label", `${done} of ${steps.length} steps done`);
    prog.innerHTML = steps.map((s) => `<a href="#s-${esc(s.id)}" class="${stepState(s.id).done ? "on" : ""} ${next === s ? "nx" : ""}" title="${esc(s.title)}"></a>`).join("");
    const last = steps.map((s) => ({ s, st: stepState(s.id) })).filter((x) => x.st.at).sort((a, b) => (a.st.at < b.st.at ? 1 : -1))[0];
    $("#run-last").textContent = last ? `Last change: ${last.st.by || "someone"} ${last.st.done ? "ticked" : "unticked"} “${last.s.title}” · ${Kit.ago(last.st.at)}` : done === steps.length ? "" : "Nobody has ticked a step in this run yet.";
    $("#run-bar").classList.toggle("complete", done === steps.length);
    $("#next-btn").textContent = done === steps.length ? "All steps done ✓" : "Jump to next step";
    $("#next-btn").disabled = done === steps.length;

    steps.forEach((s, i) => {
      const li = $(`[data-step="${s.id}"]`), st = stepState(s.id);
      li.classList.toggle("done", !!st.done);
      li.classList.toggle("next", next === s);
      $(".tick", li).setAttribute("aria-pressed", String(!!st.done));
      $(".who", li).textContent = st.done ? `Done by ${st.by || "someone"} · ${hm(st.at)}` : st.at ? `Unticked by ${st.by || "someone"} · ${hm(st.at)}` : "";
      const nt = $(".note-text", li);
      nt.hidden = !st.note;
      if (st.note) nt.innerHTML = `<span class="mono">${esc(st.noteBy || "")}${st.noteAt ? " · " + hm(st.noteAt) : ""}</span>${esc(st.note)}`;
      $(".note-btn span", li).textContent = st.note ? "Edit note" : "Add note";
      const side = $(`[data-side="${s.id}"]`);
      side.classList.toggle("done", !!st.done); side.classList.toggle("nx", next === s);
      void i;
    });
    RB.phases.forEach((p) => { const d = p.steps.filter((s) => stepState(s.id).done).length; $(`[data-phase="${p.id}"]`).textContent = `${d} / ${p.steps.length}`; });

    $("#runs").innerHTML = archived.length ? archived.map((a) => {
      const v = a.value || {}, d = Object.values(v.steps || {}).filter((x) => x.done).length;
      return `<li><b>${esc(v.title || "Run")}</b><span class="mono">${esc(v.runId || a.key.slice(KEY.length + 1))}</span><span>${day(v.startedAt)}${v.startedBy ? " · " + esc(v.startedBy) : ""}</span><span class="tag ${d === steps.length ? "good" : "warn"} dot">${d} / ${steps.length} done</span></li>`;
    }).join("") : '<li class="empty">No archived runs yet.</li>';
  }

  /* Merge a change into the latest saved run (retry on conflict). */
  async function mutate(change) {
    await D.ensureAuthor();
    for (let attempt = 0; attempt < 4; attempt++) {
      const latest = await D.get(KEY);
      const value = latest ? JSON.parse(JSON.stringify(latest.value)) : { ...run, startedBy: run.startedBy || D.author() };
      value.steps = value.steps || {};
      change(value);
      try { doc = await D.set(KEY, value, { expectedRevision: latest ? latest.revision : 0 }); run = doc.value; paint(); return; }
      catch (e) { if (e.code !== "DATA_CONFLICT") throw e; }
    }
  }
  $("#phases").addEventListener("click", async (e) => {
    const li = e.target.closest(".rb-step"); if (!li) return;
    const id = li.dataset.step;
    if (e.target.closest(".tick")) {
      const btn = e.target.closest(".tick"), done = btn.getAttribute("aria-pressed") !== "true";
      btn.disabled = true;
      try { await mutate((v) => { v.steps[id] = { ...(v.steps[id] || {}), done, by: D.author() || "Anonymous", at: new Date().toISOString() }; }); if (done) li.classList.add("just"); setTimeout(() => li.classList.remove("just"), 900); }
      catch (err) { /* status line shows the error */ }
      finally { btn.disabled = false; }
    } else if (e.target.closest(".more-btn")) {
      const open = li.classList.toggle("open"), b = e.target.closest(".more-btn");
      b.setAttribute("aria-expanded", String(open)); b.textContent = open ? "Hide details" : "Show details";
    } else if (e.target.closest(".note-btn")) {
      const box = $(".note-box", li); box.hidden = !box.hidden;
      if (!box.hidden) { const ta = $("textarea", box); ta.value = stepState(id).note || ""; ta.focus(); }
    } else if (e.target.closest("[data-note-cancel]")) {
      $(".note-box", li).hidden = true;
    } else if (e.target.closest("[data-note-save]")) {
      const text = $(".note-box textarea", li).value.trim(), b = e.target.closest("[data-note-save]");
      b.disabled = true;
      try { await mutate((v) => { v.steps[id] = { ...(v.steps[id] || {}), note: text, noteBy: D.author() || "Anonymous", noteAt: new Date().toISOString() }; }); $(".note-box", li).hidden = true; }
      finally { b.disabled = false; }
    }
  });
  $("#phases").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && e.target.matches(".note-box textarea")) $("[data-note-save]", e.target.closest(".note-box")).click(); });

  $("#next-btn").addEventListener("click", () => {
    const next = steps.find((s) => !stepState(s.id).done); if (!next) return;
    const el = document.getElementById("s-" + next.id); el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    $(".tick", el).focus({ preventScroll: true });
  });

  $("#new-run").addEventListener("click", async () => {
    const done = steps.filter((s) => stepState(s.id).done).length;
    if (!doc) { run = fresh(); paint(); return; }
    if (!confirm(`Archive run ${run.runId} (${done} of ${steps.length} done) and start a new, empty run for everyone?`)) return;
    await D.ensureAuthor();
    const btn = $("#new-run"); btn.disabled = true;
    try {
      await D.set(`${KEY}.${run.runId}`, { ...run, archivedAt: new Date().toISOString(), archivedBy: D.author() });
      doc = await D.set(KEY, { ...fresh(), startedBy: D.author() }, { expectedRevision: doc.revision });
      run = doc.value; refreshArchive(); paint();
    } catch (e) { if (e.code === "DATA_CONFLICT") alert("Someone changed the run just now. Check the page and try again."); }
    finally { btn.disabled = false; }
  });

  async function refreshArchive() { try { archived = (await D.list(KEY + ".")).sort((a, b) => (a.key < b.key ? 1 : -1)); paint(); } catch (e) {} }

  paint();
  D.ready.then(() => {
    D.watch(KEY, (docs) => {
      const cur = docs.find((d) => d.key === KEY);
      archived = docs.filter((d) => d.key.startsWith(KEY + ".")).sort((a, b) => (a.key < b.key ? 1 : -1));
      if (cur) { doc = cur; run = cur.value || fresh(); run.steps = run.steps || {}; }
      paint();
    }, { interval: 5000 });
  });
});
