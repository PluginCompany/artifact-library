/* Code review — renders window.REVIEW (data.js) with the kit's gallery and diff blocks,
   and saves verdicts, decision answers and comments with Kit.data. One function per section. */
document.addEventListener("kit:ready", () => {
  "use strict";
  const R = window.REVIEW, SHOTS = window.SHOTS || {};
  const { $, $$, esc } = Kit;
  const pad = (n) => String(n).padStart(2, "0");
  const VERDICTS = {
    approved: { label: "Approve", word: "Approved", c: "var(--good)", icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
    changes: { label: "Request changes", word: "Changes requested", c: "var(--bad)", icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 13l1-3.5L11 2.5l2.5 2.5L6.5 12z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>' },
    question: { label: "Question", word: "Question", c: "var(--warn)", icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 6a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2v.5M8 12v.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' },
  };
  const RISK = { low: "Low risk", medium: "Medium risk", high: "High risk" };
  const docs = {}; // key -> saved document (review.*, answer.*, comments.*, state.*)
  const val = (key) => docs[key] && docs[key].value;

  /* ---------- Screenshots: shots.js entries + notes that point at named pins ---------- */
  function shotItem(it) {
    const s = SHOTS[it.shot];
    if (!s) { console.warn(`Screenshot "${it.shot}" is not in shots.js; run capture.py.`); return { src: `shots/${it.shot}.webp`, title: it.title, caption: it.caption }; }
    const notes = (it.notes || []).map((n) => {
      const r = n.pin ? s.pins && s.pins[n.pin] : null;
      if (n.pin && !r) { console.warn(`Pin "${n.pin}" is not in shots.js for ${it.shot}`); return null; }
      return r ? { x: r[0], y: r[1], w: r[2], h: r[3], title: n.title, text: n.text } : n;
    }).filter(Boolean);
    return { src: s.file, w: s.w, h: s.h, title: it.title, caption: it.caption, alt: it.alt || it.title, notes };
  }

  /* ---------- Hero and introduction ---------- */
  function renderIntro() {
    const m = R.meta, I = R.intro;
    const snippets = R.changes.flatMap((c) => c.snippets);
    const files = new Set(snippets.map((s) => s.file));
    $("#h-eyebrow").textContent = `Code review · ${m.branch} → ${m.base} · ${new Date(m.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · by ${m.author}`;
    $("#h-title").textContent = m.title;
    $("#h-summary").textContent = m.summary;
    $("#h-stats").innerHTML = [[R.changes.length, "changes"], [files.size, "files shown"], [snippets.length, "snippets"], [R.decisions.length, "decisions for you"]]
      .map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join("");
    $("#h-example").innerHTML = `<b>About this review</b>${esc(m.example)}`;
    $("#i-why").textContent = I.why;
    $("#i-does").innerHTML = I.does.map((d) => `<li>${esc(d)}</li>`).join("");
    $("#i-changes").innerHTML = I.changes.map((d) => `<li>${esc(d)}</li>`).join("");
    $("#i-stays").innerHTML = I.stays.map((d) => `<li>${esc(d)}</li>`).join("");
    $("#i-focus").textContent = I.focus;
    $("#foot").innerHTML = `Reference artifact · source <code>examples/reference/ref-code-review</code> · screenshots by capture.py · built with the reference kit.`;
  }

  function renderScreens() {
    const S = R.screenshots;
    Kit.gallery($("#gallery-main"), { layout: S.layout || "sidebar", frame: S.frame, items: S.items.map(shotItem) });
    if (R.compare && R.compare.length === 2) Kit.gallery($("#gallery-compare"), { layout: "compare", items: R.compare.map(shotItem) });
    else { $("#compare-title").remove(); $("#compare-sub").remove(); }
  }

  /* ---------- Changes ---------- */
  function renderChanges() {
    $("#change-index").innerHTML = R.changes.map((c, i) => `<li><a href="#c-${c.id}"><span class="n">${pad(i + 1)}</span><span class="t">${esc(c.title)}</span><span class="risk ${c.risk}">${RISK[c.risk] || c.risk}</span><span class="vd none" data-vd="${c.id}">Not reviewed</span></a></li>`).join("");
    const host = $("#change-list");
    R.changes.forEach((c, ci) => {
      const files = [...new Set(c.snippets.map((s) => s.file))];
      const sec = document.createElement("section");
      sec.className = "rv-change"; sec.id = "c-" + c.id;
      sec.innerHTML = `
        <header class="rv-ch-head"><span class="rv-n">${pad(ci + 1)}</span>
          <div><h3>${esc(c.title)}</h3><div class="rv-ch-meta"><span class="risk ${c.risk}">${RISK[c.risk] || c.risk}</span>${files.map((f) => `<code>${esc(f)}</code>`).join("")}<span class="vd none" data-vd="${c.id}">Not reviewed</span></div></div></header>
        <div class="rv-why"><p class="rv-label">Why</p>${(Array.isArray(c.why) ? c.why : [c.why]).map((p) => `<p>${esc(p)}</p>`).join("")}</div>
        <div class="rv-snips"></div>
        ${c.alternatives && c.alternatives.length ? `<details class="fold rv-alt"><summary>Considered instead (${c.alternatives.length})</summary><div class="in"><div class="table-wrap"><table class="table compact"><thead><tr><th>Option</th><th>Why not</th></tr></thead><tbody>${c.alternatives.map((a) => `<tr><td>${esc(a.option)}</td><td>${esc(a.why)}</td></tr>`).join("")}</tbody></table></div></div></details>` : ""}
        ${c.tests ? `<p class="rv-tests"><b>Checked by</b><span>${esc(c.tests)}</span></p>` : ""}
        <div class="rv-review"><div class="rv-verdict" data-key="review.${c.id}"></div><div class="rv-thread"></div></div>`;
      host.appendChild(sec);
      c.snippets.forEach((s, si) => $(".rv-snips", sec).appendChild(snippet(c, s, si)));
      verdictBox($(".rv-verdict", sec), `review.${c.id}`, { change: c.title }, `Your verdict on “${c.title}”`);
      Kit.comments($(".rv-thread", sec), { key: `comments.${c.id}`, title: "Discussion", placeholder: `Comment on “${c.title}” for the agent…` });
    });
  }

  function snippet(c, s, si) {
    const fig = document.createElement("figure");
    fig.className = "rv-snip";
    fig.innerHTML = `${s.title || s.caption ? `<figcaption class="rv-snip-cap">${s.title ? `<b><span class="rv-sn">${pad(si + 1)}</span>${esc(s.title)}</b>` : ""}${s.caption ? `<span>${esc(s.caption)}</span>` : ""}</figcaption>` : ""}
      <div class="rv-diff"></div>
      <div class="rv-snip-foot"><button class="btn ghost" type="button" aria-expanded="false">Comment on this snippet<span class="cnt" hidden></span></button></div>
      <div class="rv-snip-thread" hidden></div>`;
    // New code inside an existing file is "modified" (no New file tag); say newFile: true for a whole new file.
    const spec = { ...s, status: s.status || (s.newFile ? "added" : "modified") };
    delete spec.title; delete spec.caption;
    Kit.diff($(".rv-diff", fig), spec);
    const lines = $$(".kd-t tr:not(.kd-note):not(.kd-hunk)", fig).length;
    if (lines > 40) console.warn(`Snippet ${si + 1} of "${c.title}" shows ${lines} lines: cut it to the lines that carry the change, or split it.`);
    const key = `comments.${c.id}--${si + 1}`, btn = $(".rv-snip-foot button", fig), slot = $(".rv-snip-thread", fig);
    btn.dataset.key = key;
    let mounted = false;
    btn.addEventListener("click", () => {
      const open = slot.hidden;
      slot.hidden = !open; btn.setAttribute("aria-expanded", String(open));
      if (open && !mounted) { mounted = true; Kit.comments(slot, { key, compact: true, placeholder: `Comment on ${s.file}${s.start ? " from line " + s.start : ""}…` }); }
      if (open) { const ta = $("textarea", slot); if (ta) ta.focus(); }
    });
    return fig;
  }

  /* ---------- Verdict control: three choices and a note, saved under one key ---------- */
  function verdictBox(box, key, extra, title, opts = {}) {
    box.innerHTML = `<h4>${esc(title)}</h4>
      <div class="choices" role="group" aria-label="${esc(title)}">${Object.entries(VERDICTS).map(([k, v]) => `<button type="button" class="choice ${k}" data-v="${k}" aria-pressed="false">${v.icon}${opts.labels && opts.labels[k] || v.label}</button>`).join("")}</div>
      <label class="sr-only" for="n-${esc(key)}">Note for the agent</label>
      <textarea id="n-${esc(key)}" placeholder="${esc(opts.placeholder || "Note for the agent: what to change, or what you want to know")}"></textarea>
      <div class="row" style="--gap:10px"><span class="saved" aria-live="polite"></span><span class="spacer"></span><button class="btn${opts.onSave ? " primary" : ""}" type="button" data-save>${esc(opts.saveLabel || "Save note")}</button></div>`;
    const ta = $("textarea", box), saved = $(".saved", box);
    async function save(verdict) {
      await Kit.data.ensureAuthor();
      const next = verdict === undefined ? (val(key) && val(key).verdict) : verdict;
      if (!next) { saved.textContent = "Pick a verdict first."; return; }
      try {
        docs[key] = await Kit.data.set(key, { ...extra, verdict: next, note: ta.value.trim(), author: Kit.data.author() || undefined, reviewedAt: new Date().toISOString() });
        if (opts.onSave) await opts.onSave(next);
        paint();
      } catch (e) { saved.textContent = "Not saved: " + e.message; }
    }
    $$(".choice", box).forEach((b) => b.addEventListener("click", async () => {
      if (val(key) && val(key).verdict === b.dataset.v && !opts.onSave) { // second click clears it
        try { await Kit.data.remove(key); delete docs[key]; paint(); } catch (e) { saved.textContent = "Not saved: " + e.message; }
        return;
      }
      if (!opts.onSave) save(b.dataset.v);
      else { box.dataset.pick = b.dataset.v; $$(".choice", box).forEach((x) => x.setAttribute("aria-pressed", String(x === b))); }
    }));
    $("[data-save]", box).addEventListener("click", () => save(opts.onSave ? box.dataset.pick : undefined));
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $("[data-save]", box).click(); } });
    box._paint = () => {
      const v = val(key);
      const pick = v ? v.verdict : box.dataset.pick;
      if (v) box.dataset.pick = v.verdict;
      $$(".choice", box).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === pick)));
      if (document.activeElement !== ta) ta.value = (v && v.note) || "";
      saved.textContent = v ? `${VERDICTS[v.verdict] ? VERDICTS[v.verdict].word : v.verdict} by ${docs[key].author || v.author || "someone"} · ${Kit.ago(docs[key].updatedAt)}` : (opts.empty || "No verdict yet");
    };
    box.classList.add("verdict-box");
  }

  /* ---------- Decisions: the kit's questions block, with "Built" as the default ---------- */
  function renderDecisions() {
    Kit.questions($("#decision-list"), {
      questions: R.decisions.map((d) => ({ id: d.id, title: d.title, context: d.context, recommended: d.chosen, why: d.why,
        options: d.options.map((o) => ({ id: o.id, label: o.label, summary: o.text })) })),
      heading: 3, nav: false, toolbar: false, summary: false, finish: false,
      labels: { recommended: "Built", keep: "Agreed", changed: "Overruled", why: "Why it was built this way" },
    });
    // Answers saved by the block reach the side dots and "For the agent" straight away.
    $("#decision-list").addEventListener("kit:answers", (e) => { Object.entries(e.detail.answers).forEach(([id, d]) => (docs["answer." + id] = d)); R.decisions.forEach((d) => { if (!e.detail.answers[d.id]) delete docs["answer." + d.id]; }); paint(); });
  }

  /* ---------- Verdict section: progress, asks, overall ---------- */
  function renderVerdict() {
    verdictBox($("#overall"), "review.overall", { change: "Overall" }, "Overall verdict", {
      labels: { approved: "Approve", changes: "Request changes", question: "Comment only" },
      placeholder: "Summary for the agent (optional)", saveLabel: "Send review", empty: "Not sent yet",
      onSave: (verdict) => Kit.data.set("state.submitted", { at: new Date().toISOString(), author: Kit.data.author() || "Anonymous", verdict }).then((doc) => (docs["state.submitted"] = doc)),
    });
    Kit.comments($("#general"), { key: "comments.general", title: "Anything else", placeholder: "A comment on the review as a whole…" });
  }

  function paint() {
    const counts = { approved: 0, changes: 0, question: 0 }, total = R.changes.length;
    R.changes.forEach((c) => { const v = val("review." + c.id); if (v && counts[v.verdict] != null) counts[v.verdict]++; });
    const done = counts.approved + counts.changes + counts.question;
    const bar = Object.entries(counts).map(([k, n]) => (n ? `<i style="--n:${n};--c:${VERDICTS[k].c}"></i>` : "")).join("") + (total - done ? `<i style="--n:${total - done};--c:transparent"></i>` : "");
    $("#progress-bar").innerHTML = bar; $("#progress-bar").setAttribute("aria-label", `${done} of ${total} changes reviewed`);
    $("#progress-count").textContent = `${done} of ${total}`;
    $("#progress-legend").innerHTML = Object.entries(counts).map(([k, n]) => `<span><i style="--c:${VERDICTS[k].c}"></i><b>${n}</b> ${VERDICTS[k].word.toLowerCase()}</span>`).join("") + `<span><i style="--c:var(--line-strong)"></i><b>${total - done}</b> to read</span>`;
    const answered = R.decisions.filter((d) => val("answer." + d.id) && val("answer." + d.id).choice).length;
    $("#side-progress").innerHTML = `<b>${done} of ${total} changes reviewed</b><div class="rv-bar">${bar}</div><span class="muted">${answered} of ${R.decisions.length} decisions answered</span>`;
    R.changes.forEach((c) => {
      const v = val("review." + c.id);
      $$(`[data-vd="${c.id}"]`).forEach((b) => { b.className = "vd " + (v ? v.verdict : "none"); b.textContent = v ? VERDICTS[v.verdict].word : "Not reviewed"; });
      const link = $(`.side a[href="#c-${c.id}"]`);
      if (link) { let dot = $(".sd", link); if (!dot) { dot = document.createElement("i"); dot.className = "sd"; dot.setAttribute("aria-hidden", "true"); link.appendChild(dot); } dot.className = "sd " + (v ? v.verdict : ""); }
    });
    $$(".verdict-box").forEach((b) => b._paint && b._paint());
    R.decisions.forEach((d) => {
      const v = val("answer." + d.id), link = $(`.side a[href="#q-${d.id}"]`);
      if (link) { let dot = $(".sd", link); if (!dot) { dot = document.createElement("i"); dot.className = "sd"; dot.setAttribute("aria-hidden", "true"); link.appendChild(dot); } dot.className = "sd " + (v && v.choice ? (v.followsRecommendation ? "approved" : "changes") : ""); }
    });
    // Everything the agent has to act on
    const asks = [], open = (prefix) => Object.entries(docs).filter(([k]) => k === prefix || k.startsWith(prefix + "--"))
      .reduce((a, [, d]) => a + ((d.value && d.value.items) || []).filter((it) => !it.resolved && it.role !== "agent").length, 0);
    R.changes.forEach((c, i) => {
      const v = val("review." + c.id), n = open("comments." + c.id);
      if (v && v.verdict !== "approved") asks.push(`<div class="rv-ask ${v.verdict}"><span class="vd ${v.verdict}">${VERDICTS[v.verdict].word}</span><a href="#c-${c.id}">${pad(i + 1)} · ${esc(c.title)}</a><p>${esc(v.note || "No note; see the discussion.")}</p><span class="by">${esc(docs["review." + c.id].author || "Someone")} · ${Kit.ago(docs["review." + c.id].updatedAt)}${n ? ` · ${n} open comment${n === 1 ? "" : "s"}` : ""}</span></div>`);
      else if (n) asks.push(`<div class="rv-ask comments"><span class="vd info">${n} open</span><a href="#c-${c.id}">${pad(i + 1)} · ${esc(c.title)}</a><p>${n} unresolved comment${n === 1 ? "" : "s"}.</p></div>`);
    });
    R.decisions.forEach((d, i) => {
      const v = val("answer." + d.id);
      if (v && v.choice && !v.followsRecommendation) asks.push(`<div class="rv-ask changes"><span class="vd changes">Overruled</span><a href="#q-${d.id}">${pad(i + 1)} · ${esc(d.title)}</a><p>Change it to “${esc(v.choiceLabel)}”.${v.note ? " " + esc(v.note) : ""}</p></div>`);
    });
    $("#asks").innerHTML = asks.length ? asks.join("") : '<p class="rv-empty">Nothing requested yet. Requested changes, questions and overruled decisions collect here as you review.</p>';
    $$(".rv-snip-foot button").forEach((b) => { const d = docs[b.dataset.key], n = (d && d.value && d.value.items && d.value.items.length) || 0, cnt = $(".cnt", b); cnt.hidden = !n; cnt.textContent = n; });
    const sent = val("state.submitted");
    $("#overall").classList.toggle("sent", !!sent);
  }

  renderIntro(); renderScreens(); renderChanges(); renderDecisions(); renderVerdict();
  Kit.refresh();
  paint();
  const watch = (prefix, interval) => Kit.data.watch(prefix, (list) => {
    Object.keys(docs).filter((k) => k.startsWith(prefix)).forEach((k) => delete docs[k]);
    list.forEach((d) => (docs[d.key] = d));
    paint();
  }, { interval });
  watch("review.", 8000); watch("answer.", 8000); watch("comments.", 10000); watch("state.", 10000);
  document.addEventListener("kit:comments", (e) => { docs[e.detail.key] = { value: { items: e.detail.items } }; paint(); }, true);
});
