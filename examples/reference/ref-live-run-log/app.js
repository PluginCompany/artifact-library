/* Live run log — renders the `state.run` data document and polls for changes.
   Everything is normalised first, so partial or slightly wrong data still renders. */
document.addEventListener("kit:ready", () => {
  "use strict";
  const { $, $$, esc } = Kit;
  const SLUG = Kit.data.slug || "ref-live-run-log";
  const STATUS = {
    pending: { label: "Pending", tone: "muted" }, running: { label: "Running", tone: "accent" }, done: { label: "Done", tone: "good" },
    failed: { label: "Failed", tone: "bad" }, skipped: { label: "Skipped", tone: "muted" }, blocked: { label: "Blocked", tone: "warn" },
  };
  const ICON = {
    pending: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2.4 2.2"/></svg>',
    running: '<svg viewBox="0 0 16 16" class="spin"><path d="M8 2.5a5.5 5.5 0 1 1-5.2 3.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    done: '<svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    failed: '<svg viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    skipped: '<svg viewBox="0 0 16 16"><path d="M4 8h8M9 5l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    blocked: '<svg viewBox="0 0 16 16"><rect x="5" y="4" width="2" height="8" rx="1" fill="currentColor"/><rect x="9" y="4" width="2" height="8" rx="1" fill="currentColor"/></svg>',
  };
  const LEVELS = { info: "Info", ok: "OK", warn: "Warn", error: "Error" };

  /* ---------- Normalise ---------- */
  const time = (v) => { const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : null; };
  const str = (v) => (v == null ? "" : String(v));
  function normalise(raw) {
    const r = raw && typeof raw === "object" ? raw : {};
    const steps = (Array.isArray(r.steps) ? r.steps : []).filter((s) => s && typeof s === "object").map((s, i) => ({
      id: str(s.id || "step-" + (i + 1)), title: str(s.title || s.id || "Step " + (i + 1)),
      status: STATUS[s.status] ? s.status : "pending", startedAt: time(s.startedAt), finishedAt: time(s.finishedAt),
      summary: str(s.summary),
      links: (Array.isArray(s.links) ? s.links : []).filter((l) => l && l.url).map((l) => ({ label: str(l.label || l.url), url: str(l.url) })),
      log: (Array.isArray(s.log) ? s.log : []).filter(Boolean).map((l) => (typeof l === "string" ? { at: null, level: "info", text: l } : { at: time(l.at), level: LEVELS[l.level] ? l.level : "info", text: str(l.text) })),
    }));
    let status = ["running", "done", "failed", "blocked"].includes(r.status) ? r.status : steps.some((s) => s.status === "failed") ? "failed" : steps.length && steps.every((s) => ["done", "skipped"].includes(s.status)) ? "done" : "running";
    if (r.blocker && r.blocker.question && status === "running") status = "blocked";
    const current = steps.find((s) => s.id === r.currentStep) || steps.find((s) => s.status === "running" || s.status === "blocked") || steps.find((s) => s.status === "failed") || (status === "done" ? steps[steps.length - 1] : steps.find((s) => s.status === "pending")) || null;
    let metrics = [];
    if (Array.isArray(r.metrics)) metrics = r.metrics.filter((m) => m && m.label != null).map((m) => ({ label: str(m.label), value: str(m.value) }));
    else if (r.metrics && typeof r.metrics === "object") metrics = Object.entries(r.metrics).map(([k, v]) => ({ label: k, value: str(v) }));
    const blocker = r.blocker && r.blocker.question ? { question: str(r.blocker.question), options: (Array.isArray(r.blocker.options) ? r.blocker.options : []).map(str).filter(Boolean), since: time(r.blocker.since) } : null;
    return {
      title: str(r.title || "Untitled run"), goal: str(r.goal), agent: str(r.agent), status, steps, current, metrics, blocker,
      startedAt: time(r.startedAt) || (steps.find((s) => s.startedAt) || {}).startedAt || null,
      updatedAt: time(r.updatedAt), artifacts: (Array.isArray(r.artifacts) ? r.artifacts : []).filter((a) => a && a.url).map((a) => ({ label: str(a.label || a.url), url: str(a.url) })),
    };
  }

  /* ---------- Formatting ---------- */
  const clock = (ms) => { if (ms == null || ms < 0) return "—"; const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(sec).padStart(2, "0"); };
  const dur = (ms) => { if (ms == null || ms < 0) return ""; const s = Math.round(ms / 1000); if (s < 60) return s + " s"; const m = Math.round(s / 60); return m < 60 ? m + " min" : Math.floor(m / 60) + " h " + (m % 60) + " min"; };
  const hhmm = (t) => (t ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "");
  const hhmmss = (t) => (t ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }) : "");
  const since = (t) => { if (!t) return "never"; const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 5 ? "just now" : s < 60 ? s + " s ago" : s < 3600 ? Math.floor(s / 60) + " min ago" : Math.floor(s / 3600) + " h ago"; };
  const pill = (st) => `<span class="st st-${st}">${ICON[st]}${STATUS[st].label}</span>`;

  /* ---------- State ---------- */
  let run = null, isExample = false, answer = null, prevStatuses = {}, openSteps = new Set(), firstRender = true, docUpdatedAt = null;

  function render() {
    if (!run) return;
    document.title = (run.status === "blocked" ? "⏸ " : run.status === "done" ? "✓ " : run.status === "failed" ? "✗ " : "") + run.title + " · Live run";
    $("#example-note").hidden = !isExample;
    $("#run-title").textContent = run.title;
    const status = $("#run-status");
    status.dataset.status = run.status; status.innerHTML = ICON[run.status] + STATUS[run.status].label;
    $("#run-goal").textContent = run.goal;
    $("#run-goal").hidden = !run.goal;
    $("#run-meta").textContent = [run.agent && "Agent: " + run.agent, run.startedAt && "Started " + new Date(run.startedAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })].filter(Boolean).join(" · ");

    // Progress bar: one segment per step
    const prog = $("#progress");
    const done = run.steps.filter((s) => s.status === "done" || s.status === "skipped").length;
    prog.setAttribute("aria-label", `${done} of ${run.steps.length} steps finished`);
    prog.innerHTML = run.steps.map((s) => `<a href="#step-${esc(s.id)}" class="seg-${s.status}" title="${esc(s.title)} · ${STATUS[s.status].label}"><span class="sr-only">${esc(s.title)}: ${STATUS[s.status].label}</span></a>`).join("") || '<span class="seg-pending"></span>';

    // Stats
    const stats = [
      `<div><b id="elapsed">${clock(elapsed())}</b><span>${run.status === "running" || run.status === "blocked" ? "elapsed" : "total time"}</span></div>`,
      `<div><b>${done}<small> / ${run.steps.length}</small></b><span>steps finished</span></div>`,
      ...run.metrics.slice(0, 4).map((m) => `<div><b>${esc(m.value)}</b><span>${esc(m.label)}</span></div>`),
    ];
    $("#run-stats").innerHTML = stats.join("");

    renderBlocker();
    renderNow();
    renderSteps();

    const prodSec = $("#produced-section");
    prodSec.hidden = !run.artifacts.length;
    $("#produced").innerHTML = run.artifacts.map((a) => `<a class="card produced-card" href="${esc(a.url)}"><div class="body"><span class="n">Output</span><h3>${esc(a.label)}</h3><p class="mono url">${esc(a.url)}</p></div></a>`).join("");
    firstRender = false;
    tick();
  }

  function elapsed() {
    if (!run || !run.startedAt) return null;
    const end = run.status === "done" || run.status === "failed" ? run.updatedAt || Math.max(...run.steps.map((s) => s.finishedAt || 0)) || Date.now() : isExample ? run.updatedAt || Date.now() : Date.now();
    return end - run.startedAt;
  }

  function renderNow() {
    const s = run.current, host = $("#now");
    if (!s) { host.innerHTML = '<p class="empty">No steps yet. The agent has not published a plan.</p>'; return; }
    const lines = s.log.slice(-6);
    const took = s.startedAt ? (s.finishedAt ? "took " + dur(s.finishedAt - s.startedAt) : "for " + dur((isExample ? run.updatedAt || Date.now() : Date.now()) - s.startedAt)) : "";
    host.className = "now st-wrap-" + s.status;
    host.innerHTML = `<div class="now-head"><div><div class="eyebrow">Step ${run.steps.indexOf(s) + 1} of ${run.steps.length}</div><h3>${esc(s.title)}</h3></div>${pill(s.status)}</div>
      ${s.summary ? `<p class="now-sum">${esc(s.summary)}</p>` : ""}
      <div class="now-meta mono">${s.startedAt ? `Started ${hhmm(s.startedAt)}` : "Not started"}${took ? " · " + took : ""}</div>
      ${lines.length ? `<ol class="log">${lines.map(logLine).join("")}</ol>` : ""}
      ${s.links.length ? `<div class="links">${s.links.map((l) => `<a class="btn" href="${esc(l.url)}">${esc(l.label)} →</a>`).join("")}</div>` : ""}`;
  }
  const logLine = (l) => `<li class="lv-${l.level}"><time>${l.at ? hhmmss(l.at) : ""}</time><span class="lv">${LEVELS[l.level]}</span><span class="tx">${esc(l.text)}</span></li>`;

  function renderSteps() {
    const list = $("#step-list");
    list.innerHTML = run.steps.map((s, i) => {
      const changed = !firstRender && prevStatuses[s.id] && prevStatuses[s.id] !== s.status;
      const open = openSteps.has(s.id);
      const took = s.startedAt && s.finishedAt ? dur(s.finishedAt - s.startedAt) : s.startedAt && (s.status === "running" || s.status === "blocked") ? "running " + dur((isExample ? run.updatedAt || Date.now() : Date.now()) - s.startedAt) : "";
      const hasMore = s.log.length || s.links.length;
      return `<li class="rs st-wrap-${s.status} ${changed ? "changed" : ""} ${run.current === s ? "is-current" : ""}" id="step-${esc(s.id)}">
        <span class="rs-dot" aria-hidden="true">${ICON[s.status]}</span>
        <div class="rs-card">
          <button class="rs-head" type="button" aria-expanded="${open}" ${hasMore ? "" : "disabled"}>
            <span class="rs-n mono">${String(i + 1).padStart(2, "0")}</span>
            <span class="rs-title"><b>${esc(s.title)}</b>${s.summary ? `<span>${esc(s.summary)}</span>` : ""}</span>
            <span class="rs-side">${pill(s.status)}<span class="mono rs-time">${s.startedAt ? hhmm(s.startedAt) : ""}${took ? " · " + took : ""}</span></span>
            ${hasMore ? '<span class="rs-chev" aria-hidden="true"></span>' : ""}
          </button>
          <div class="rs-body" ${open ? "" : "hidden"}>
            ${s.log.length ? `<ol class="log">${s.log.map(logLine).join("")}</ol>` : ""}
            ${s.links.length ? `<div class="links">${s.links.map((l) => `<a class="btn" href="${esc(l.url)}">${esc(l.label)} →</a>`).join("")}</div>` : ""}
          </div>
        </div></li>`;
    }).join("") || '<li class="empty">No steps published yet.</li>';
    prevStatuses = Object.fromEntries(run.steps.map((s) => [s.id, s.status]));
  }
  $("#step-list").addEventListener("click", (e) => {
    const b = e.target.closest(".rs-head"); if (!b || b.disabled) return;
    const li = b.closest(".rs"), id = li.id.slice(5), body = $(".rs-body", li), open = body.hidden;
    body.hidden = !open; b.setAttribute("aria-expanded", String(open));
    open ? openSteps.add(id) : openSteps.delete(id);
  });
  $("#expand-all").addEventListener("click", (e) => {
    const all = run && run.steps.every((s) => openSteps.has(s.id) || !(s.log.length || s.links.length));
    openSteps = all ? new Set() : new Set(run.steps.map((s) => s.id));
    e.currentTarget.textContent = all ? "Expand all" : "Collapse all";
    renderSteps();
  });

  /* ---------- Blocker: the human answers, the agent reads answer.blocker ---------- */
  let draft = null;
  function renderBlocker() {
    const sec = $("#blocker-section"), host = $("#blocker");
    const b = run.blocker;
    const answered = answer && b && answer.value && answer.value.question === b.question ? answer : null;
    if (!b) {
      sec.hidden = !(answer && answer.value);
      if (answer && answer.value) host.innerHTML = `<div class="blk resolved"><div class="eyebrow">Last answer</div><h3>${esc(answer.value.question || "")}</h3><p><b>${esc(answer.value.choice || "")}</b>${answer.value.note ? " — " + esc(answer.value.note) : ""}</p><p class="mono muted small">${esc(answer.author || "")} · ${since(time(answer.updatedAt))}. The agent has moved on.</p></div>`;
      return;
    }
    sec.hidden = false;
    if (draft && draft.question !== b.question) draft = null;
    const choice = draft ? draft.choice : answered ? answered.value.choice : "";
    const note = draft ? draft.note : answered ? answered.value.note || "" : "";
    host.innerHTML = `<div class="blk ${answered ? "answered" : ""}">
      <div class="blk-head"><span class="blk-icon" aria-hidden="true">${ICON.blocked}</span><div><div class="eyebrow">The agent is waiting for you${b.since ? " · since " + hhmm(b.since) : ""}</div><h2>${esc(b.question)}</h2></div></div>
      <form class="blk-form">
        ${b.options.length ? `<div class="blk-options" role="radiogroup" aria-label="Your answer">${b.options.map((o, i) => `<label class="opt"><input type="radio" name="choice" value="${esc(o)}" ${o === choice ? "checked" : ""}><span class="opt-k mono">${String.fromCharCode(65 + i)}</span><span>${esc(o)}</span></label>`).join("")}</div>` : ""}
        <label class="note-label" for="blk-note">${b.options.length ? "Anything to add? (optional)" : "Your answer"}</label>
        <textarea id="blk-note" rows="2" placeholder="${b.options.length ? "Context the agent should know" : "Type your answer"}">${esc(note)}</textarea>
        <div class="row blk-actions"><span class="blk-saved mono">${answered ? `Answered by ${esc(answered.author || "someone")} · ${since(time(answered.updatedAt))} — the agent picks it up on its next check.` : "Not answered yet."}</span><span class="spacer"></span><button class="btn primary" type="submit">${answered ? "Update answer" : "Send answer"}</button></div>
      </form></div>`;
    const form = $(".blk-form", host);
    form.addEventListener("input", () => { draft = { question: b.question, choice: (form.choice && form.querySelector("input[name=choice]:checked") || {}).value || "", note: $("#blk-note").value }; });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const picked = form.querySelector("input[name=choice]:checked");
      const value = { question: b.question, choice: picked ? picked.value : "", note: $("#blk-note").value.trim(), answeredAt: new Date().toISOString() };
      if (b.options.length && !value.choice) { form.querySelector(".blk-options").classList.add("shake"); setTimeout(() => form.querySelector(".blk-options") && form.querySelector(".blk-options").classList.remove("shake"), 500); return; }
      if (!b.options.length && !value.note) { $("#blk-note").focus(); return; }
      await Kit.data.ensureAuthor();
      const btn = form.querySelector("[type=submit]"); btn.disabled = true;
      try { answer = await Kit.data.set("answer.blocker", value); draft = null; renderBlocker(); }
      catch (err) { btn.disabled = false; }
    });
  }

  /* ---------- Live indicator ---------- */
  function tick() {
    const el = $("#elapsed"); if (el) el.textContent = clock(elapsed());
    const live = $("#live"), text = $("#live-text");
    if (isExample) { live.dataset.state = "example"; text.textContent = Kit.data.mode === "server" ? "Waiting for the agent’s first update" : "Example · opened outside the artifact server"; return; }
    const upd = run && (run.updatedAt || docUpdatedAt);
    const age = upd ? Date.now() - upd : 0;
    const active = run && (run.status === "running" || run.status === "blocked");
    live.dataset.state = !active ? "finished" : age > 5 * 60000 ? "stale" : "live";
    text.textContent = !active ? `Finished · last update ${since(upd)}` : age > 5 * 60000 ? `No update for ${since(upd).replace(" ago", "")} — the agent may be stuck` : `Live · updated ${since(upd)}`;
  }
  setInterval(tick, 1000);

  /* ---------- Data wiring ---------- */
  function useExample() {
    if (run && !isExample) return;
    isExample = true; run = normalise(window.RUN_EXAMPLE || {}); render();
  }
  Kit.data.ready.then(() => {
    Kit.data.watch("state.run", (docs) => {
      const doc = docs.find((d) => d.key === "state.run");
      if (!doc) { useExample(); return; }
      isExample = false; docUpdatedAt = time(doc.updatedAt);
      run = normalise(doc.value);
      if (!run.updatedAt) run.updatedAt = docUpdatedAt;
      render();
    }, { interval: 4000 });
    Kit.data.watch("answer.blocker", (docs) => { answer = docs.find((d) => d.key === "answer.blocker") || null; if (run) renderBlocker(); }, { interval: 6000 });
  });
  setTimeout(() => { if (!run) useExample(); }, 2500);

  Kit.comments($("#thread"), { key: "run", placeholder: "Ask the agent something, or leave a note for the team…" });

  /* ---------- For agents ---------- */
  $("#cmd-set").textContent = `artifact data set ${SLUG} state.run \\\n  --file run.json --author "Claude Code"`;
  $("#cmd-read").textContent = `artifact feedback ${SLUG} --since 30m\nartifact data get ${SLUG} answer.blocker --json`;
  $("#cmd-reply").textContent = `artifact data append ${SLUG} comments.run \\\n  --item '{"text":"Done, see step 5"}' --author "Claude Code"`;
  const schema = [
    ["title, goal", "Heading and one-line definition of done"], ["status", "running · done · failed · blocked"], ["startedAt, updatedAt", "ISO times; drive the clock and the stale warning"],
    ["currentStep", "Step id in the spotlight (optional)"], ["steps[]", "{ id, title, status, startedAt, finishedAt, summary, links[], log[] }"],
    ["steps[].log[]", "{ at, level: info · ok · warn · error, text }"], ["blocker", "{ question, options[], since } — shows the answer panel"],
    ["artifacts[]", "{ label, url } produced so far"], ["metrics", "[{ label, value }] or { label: value }"],
  ];
  $("#schema").innerHTML = schema.map(([k, v]) => `<tr><th scope="row"><code>${esc(k)}</code></th><td>${esc(v)}</td></tr>`).join("");
  Kit.refresh && Kit.refresh();
});
