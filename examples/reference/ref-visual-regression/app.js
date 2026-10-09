/* Visual regression gallery — renders window.SHOTS (capture.py) + window.GALLERY
   and saves one verdict and one comment thread per screen with Kit.data. */
document.addEventListener("kit:ready", () => {
  "use strict";
  const S = window.SHOTS || { screens: {} }, G = window.GALLERY;
  const { $, $$, esc } = Kit;
  const screens = Object.values(S.screens);
  const pad = (n) => String(n).padStart(2, "0");
  const VERDICTS = {
    approved: { label: "Approve", word: "Approved", c: "var(--good)", icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
    changes: { label: "Request changes", word: "Changes requested", c: "var(--bad)", icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 13l1-3.5L11 2.5l2.5 2.5L6.5 12z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>' },
    question: { label: "Question", word: "Question", c: "var(--warn)", icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 6a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2v.5M8 12v.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' },
  };
  const ZOOM = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.5 10.5L14 14M5 7h4M7 5v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  const reviews = {}, comments = {};
  let filter = "all";

  /* ---------- Hero ---------- */
  const when = S.capturedAt ? new Date(S.capturedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
  $("#h-eyebrow").textContent = `${G.eyebrow} · captured ${when}`;
  $("#h-title").innerHTML = G.title;
  $("#h-lead").textContent = G.lead;
  $("#h-facts").innerHTML = [
    ["Before", `<code>${esc(S.before || "—")}</code>`], ["After", `<code>${esc(S.after || "—")}</code>`],
    ["Intended", esc(G.intended)], ["Ignore", esc(G.ignore)],
    ["Threshold", `A pixel counts as changed when a colour channel moves by more than ${S.threshold ?? "—"} of 255.`],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  $("#foot").innerHTML = `Reference artifact · source <code>examples/reference/ref-visual-regression</code> · ${esc(G.example)} · built with the reference kit.`;

  /* ---------- Cards ---------- */
  const list = $("#list");
  if (!screens.length) list.innerHTML = '<p class="vr-empty">No screenshots yet. Run <code>python3 capture.py</code>.</p>';
  screens.forEach((s, i) => list.appendChild(card(s, i)));

  function card(s, i) {
    const el = document.createElement("article");
    el.className = "vr-card"; el.id = "screen-" + s.id; el.dataset.id = s.id;
    el.style.animationDelay = Math.min(i, 6) * 50 + "ms";
    const phone = s.viewport[0] < 600;
    const level = s.changed < 1 ? "good" : s.changed < 5 ? "" : "warn";
    el.innerHTML = `
      <div class="vr-main">
        <div class="vr-head"><h3><span class="n">${pad(i + 1)}</span>${esc(s.title)}</h3><span class="vd none" data-vd>Not reviewed</span></div>
        <div class="vr-route"><code>${esc(s.path)}</code><span class="tag outline">${s.viewport.join(" × ")}</span><span class="tag outline">${esc(s.scheme)}</span></div>
        <div class="vr-change"><span><b>${s.changed.toFixed(2)}%</b> of pixels changed</span><div class="meter ${level}" style="--v:${Math.min(100, Math.max(2, s.changed * 4))}%" role="img" aria-label="${s.changed.toFixed(2)} percent changed"><i></i></div></div>
        ${s.note ? `<p class="vr-intent"><b>Expected</b>${esc(s.note)}</p>` : ""}
        <div class="vr-modes"><div class="seg" role="group" aria-label="View mode for ${esc(s.title)}">${["Slider", "Side by side", "Before", "After", "Diff"].map((m, k) => `<button type="button" data-mode="${m}" aria-pressed="${k === 0}">${m}</button>`).join("")}</div></div>
        <div class="vr-view"></div>
      </div>
      <div class="vr-review">
        <h4>Verdict</h4>
        <div class="choices" role="group" aria-label="Verdict for ${esc(s.title)}">${Object.entries(VERDICTS).map(([k, v]) => `<button type="button" class="choice ${k}" data-v="${k}" aria-pressed="false">${v.icon}${v.label}</button>`).join("")}</div>
        <label class="sr-only" for="note-${s.id}">Note for the agent</label>
        <textarea id="note-${s.id}" placeholder="What should change, or what do you want to know?"></textarea>
        <div class="row" style="--gap:8px"><span class="saved" aria-live="polite">No verdict yet</span><span class="spacer"></span><button class="btn" type="button" data-save>Save note</button></div>
        <button class="btn ghost vr-thread-btn" type="button" aria-expanded="false">Discussion<span class="cnt" hidden></span></button>
        <div class="vr-thread" hidden></div>
      </div>`;
    const view = $(".vr-view", el);
    function show(mode) {
      $$(".vr-modes button", el).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
      const cls = "vr-stage" + (phone ? " phone" : "");
      const img = (src, alt, extra = "") => `<img src="${esc(src)}" alt="${esc(alt)}" width="${s.w}" height="${s.h}" ${extra}>`;
      const zoom = (src, label) => `<button class="icon-btn vr-zoom" type="button" data-full="${esc(src)}" data-label="${esc(label)}" aria-label="Open ${esc(label)} full size">${ZOOM}</button>`;
      if (mode === "Slider") {
        view.innerHTML = `<div class="${cls} vr-slider" style="--cut:${s.cut ?? 50}%">${img(s.before, "Before: " + s.title)}${img(s.after, "After: " + s.title, 'class="after"')}<span class="vr-lbl l">Before</span><span class="vr-lbl r">After</span><input type="range" min="0" max="100" step="0.5" value="${s.cut ?? 50}" aria-label="Reveal the after image of ${esc(s.title)}"><span class="handle"></span></div>`;
        const box = $(".vr-slider", view), range = $("input", view);
        range.addEventListener("input", () => box.style.setProperty("--cut", range.value + "%"));
      } else if (mode === "Side by side") {
        view.innerHTML = `<div class="vr-side${phone ? " phone" : ""}"><figure><div class="vr-stage">${img(s.before, "Before: " + s.title)}${zoom(s.before, "Before · " + s.title)}</div><figcaption>Before · ${esc(S.before || "")}</figcaption></figure><figure><div class="vr-stage">${img(s.after, "After: " + s.title)}${zoom(s.after, "After · " + s.title)}</div><figcaption>After · ${esc(S.after || "")}</figcaption></figure></div>`;
      } else {
        const src = mode === "Before" ? s.before : mode === "After" ? s.after : s.diff;
        const label = mode === "Diff" ? "Pixel diff" : mode;
        view.innerHTML = `<div class="${cls}">${img(src, `${label}: ${s.title}`)}<span class="vr-lbl l">${label}</span>${zoom(src, label + " · " + s.title)}</div>`;
      }
    }
    $$(".vr-modes button", el).forEach((b) => b.addEventListener("click", () => show(b.dataset.mode)));
    show("Slider");

    // verdict
    const ta = $("textarea", el), saved = $(".saved", el);
    async function save(verdict) {
      await Kit.data.ensureAuthor();
      const cur = reviews[s.id] && reviews[s.id].value;
      const next = verdict || (cur && cur.verdict);
      if (!next) { saved.textContent = "Pick a verdict to save the note."; return; }
      try {
        reviews[s.id] = await Kit.data.set(`review.${s.id}`, { screen: s.title, route: s.path, viewport: s.viewport.join("x") + " " + s.scheme, changedPercent: s.changed, verdict: next, note: ta.value.trim(), author: Kit.data.author() || undefined, reviewedAt: new Date().toISOString() });
        paint();
      } catch (e) { saved.textContent = "Not saved: " + e.message; }
    }
    $$(".choice", el).forEach((b) => b.addEventListener("click", async () => {
      const cur = reviews[s.id] && reviews[s.id].value && reviews[s.id].value.verdict;
      if (cur === b.dataset.v) { try { await Kit.data.remove(`review.${s.id}`); delete reviews[s.id]; paint(); } catch (e) { saved.textContent = "Not saved: " + e.message; } return; }
      save(b.dataset.v);
    }));
    $("[data-save]", el).addEventListener("click", () => save());
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } });

    // discussion
    const tb = $(".vr-thread-btn", el), slot = $(".vr-thread", el);
    let mounted = false;
    tb.addEventListener("click", () => {
      const open = slot.hidden; slot.hidden = !open; tb.setAttribute("aria-expanded", String(open));
      if (open && !mounted) { mounted = true; Kit.comments(slot, { key: `comments.${s.id}`, compact: true, placeholder: `Comment on “${s.title}”…` }); }
    });
    return el;
  }

  /* ---------- Full-size view ---------- */
  let full = null, lastFocus = null;
  list.addEventListener("click", (e) => {
    const b = e.target.closest("[data-full]"); if (!b) return;
    lastFocus = b;
    full = document.createElement("div");
    full.className = "vr-full"; full.setAttribute("role", "dialog"); full.setAttribute("aria-modal", "true"); full.tabIndex = -1;
    full.innerHTML = `<div class="bar"><span>${esc(b.dataset.label)}</span><button class="icon-btn" type="button" aria-label="Close"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button></div><img src="${esc(b.dataset.full)}" alt="${esc(b.dataset.label)}">`;
    document.body.appendChild(full); document.body.style.overflow = "hidden"; full.focus();
    full.addEventListener("click", (ev) => { if (ev.target === full || ev.target.closest(".bar button")) closeFull(); });
  });
  function closeFull() { if (!full) return; full.remove(); full = null; document.body.style.overflow = ""; if (lastFocus) lastFocus.focus(); }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && full) closeFull(); });

  /* ---------- Filter ---------- */
  const filterHost = $("#filter");
  function drawFilter(counts) {
    const opts = [["all", "All", screens.length], ["todo", "To review", counts.todo], ["approved", "Approved", counts.approved], ["changes", "Changes", counts.changes], ["question", "Questions", counts.question]];
    filterHost.innerHTML = opts.map(([k, l, n]) => `<button class="chip" type="button" data-f="${k}" aria-pressed="${filter === k}">${l}<span class="c">${n}</span></button>`).join("");
  }
  filterHost.addEventListener("click", (e) => { const b = e.target.closest("[data-f]"); if (!b) return; filter = b.dataset.f; paint(); });

  /* ---------- Paint everything that depends on saved data ---------- */
  function paint() {
    const counts = { approved: 0, changes: 0, question: 0, todo: 0 };
    screens.forEach((s) => { const v = reviews[s.id] && reviews[s.id].value; if (v && counts[v.verdict] != null) counts[v.verdict]++; else counts.todo++; });
    drawFilter(counts);
    let shown = 0;
    screens.forEach((s) => {
      const el = $("#screen-" + s.id), r = reviews[s.id], v = r && r.value;
      el.className = "vr-card " + (v ? v.verdict : "");
      const badge = $("[data-vd]", el); badge.className = "vd " + (v ? v.verdict : "none"); badge.textContent = v ? VERDICTS[v.verdict].word : "Not reviewed";
      $$(".choice", el).forEach((b) => b.setAttribute("aria-pressed", String(!!v && b.dataset.v === v.verdict)));
      const ta = $("textarea", el); if (document.activeElement !== ta) ta.value = (v && v.note) || "";
      $(".saved", el).textContent = v ? `${VERDICTS[v.verdict].word} by ${r.author || v.author || "someone"} · ${Kit.ago(r.updatedAt)}` : "No verdict yet";
      const c = comments[`comments.${s.id}`], n = (c && c.value && c.value.items && c.value.items.length) || 0;
      const cnt = $(".vr-thread-btn .cnt", el); cnt.hidden = !n; cnt.textContent = n;
      const match = filter === "all" || (filter === "todo" ? !v : v && v.verdict === filter);
      el.hidden = !match; if (match) shown++;
    });
    $("#empty").hidden = shown > 0;
    const total = screens.length, done = total - counts.todo;
    $("#h-summary").innerHTML = `<h2>${done} of ${total} screens reviewed</h2>
      <div class="vr-bar" role="img" aria-label="${counts.approved} approved, ${counts.changes} changes requested, ${counts.question} questions, ${counts.todo} to review">${["approved", "changes", "question"].map((k) => counts[k] ? `<i style="--n:${counts[k]};--c:${VERDICTS[k].c}"></i>` : "").join("")}${counts.todo ? `<i style="--n:${counts.todo};--c:transparent"></i>` : ""}</div>
      <div class="vr-counts">${[["approved", "Approved"], ["changes", "Changes"], ["question", "Questions"], ["todo", "To review"]].map(([k, l]) => `<div><b>${counts[k]}</b><span><i style="--c:${k === "todo" ? "var(--line-strong)" : VERDICTS[k].c}"></i>${l}</span></div>`).join("")}</div>
      <p class="note-line"><b>${screens.filter((s) => s.changed >= 5).length}</b> screens changed by 5% or more; the largest change is <b>${screens.length ? Math.max(...screens.map((s) => s.changed)).toFixed(1) : 0}%</b>.</p>
      <p class="callout note"><b>About this gallery</b>${esc(G.example)}</p>`;
    const asks = screens.filter((s) => { const v = reviews[s.id] && reviews[s.id].value; return v && v.verdict !== "approved"; });
    $("#asks").innerHTML = asks.length ? asks.map((s) => { const r = reviews[s.id], v = r.value; return `<div class="vr-ask ${v.verdict}"><span class="vd ${v.verdict}">${VERDICTS[v.verdict].word}</span><a href="#screen-${s.id}">${esc(s.title)} · ${s.viewport.join("×")}</a><p>${esc(v.note || "No note — see the discussion on this screen.")}</p><span class="by">${esc(r.author || "Someone")} · ${Kit.ago(r.updatedAt)}</span></div>`; }).join("")
      : `<p class="vr-empty">Nothing requested yet. Screens marked “Request changes” or “Question” collect here.</p>`;
  }
  paint();
  Kit.data.watch("review.", (docs) => { Object.keys(reviews).forEach((k) => delete reviews[k]); docs.forEach((d) => (reviews[d.key.slice(7)] = d)); paint(); }, { interval: 8000 });
  Kit.data.watch("comments.", (docs) => { Object.keys(comments).forEach((k) => delete comments[k]); docs.forEach((d) => (comments[d.key] = d)); paint(); }, { interval: 10000 });
  document.addEventListener("kit:comments", (e) => { comments[e.detail.key] = { value: { items: e.detail.items } }; paint(); }, true);
  Kit.refresh();
});
