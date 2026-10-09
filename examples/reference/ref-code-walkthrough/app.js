/* Code walkthrough — renders window.WALK (data.js) over window.DIFF (diff.js)
   and saves verdicts + comments with Kit.data. One render function per section. */
document.addEventListener("kit:ready", () => {
  "use strict";
  const W = window.WALK, D = window.DIFF;
  const { $, $$, esc } = Kit;
  const pad = (n) => String(n).padStart(2, "0");
  const VERDICTS = {
    approved: { label: "Approve", word: "Approved", c: "var(--good)", icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
    changes: { label: "Request changes", word: "Changes requested", c: "var(--bad)", icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 13l1-3.5L11 2.5l2.5 2.5L6.5 12z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>' },
    question: { label: "Question", word: "Question", c: "var(--warn)", icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 6a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2v.5M8 12v.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' },
  };
  const reviews = {};   // chapterId -> saved document
  const commentDocs = {}; // key -> document

  /* ---------- Syntax colouring (tiny, display only) ---------- */
  const KW = /\b(?:const|let|var|async|await|function|return|if|else|export|import|from|new|throw|for|of|in|try|catch|finally|interface|class|private|public|type|extends|while|do|void|typeof|null|undefined|true|false|this)\b/;
  const TOKEN = new RegExp(`(\\/\\/.*$|\\/\\*.*?\\*\\/)|('(?:[^'\\\\]|\\\\.)*'|"(?:[^"\\\\]|\\\\.)*"|\`(?:[^\`\\\\]|\\\\.)*\`)|${KW.source}`, "g");
  function colour(text) {
    const clipAt = text.lastIndexOf(" …(+");
    let tail = "";
    if (clipAt > 0 && /chars\)$/.test(text)) { tail = `<span class="clip">${esc(text.slice(clipAt))}</span>`; text = text.slice(0, clipAt); }
    let out = "", last = 0, m;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(text))) {
      out += esc(text.slice(last, m.index));
      const cls = m[1] ? "tk-c" : m[2] ? "tk-s" : "tk-k";
      out += `<span class="${cls}">${esc(m[0])}</span>`;
      last = m.index + m[0].length;
      if (m[0].length === 0) TOKEN.lastIndex++;
    }
    return out + esc(text.slice(last)) + tail;
  }

  /* ---------- Diff slicing ---------- */
  function numbered(h) {
    let o = h.old, n = h.new;
    return h.lines.map(([kind, text]) => {
      const row = { kind, text, old: kind !== "add" ? o : null, new: kind !== "del" ? n : null, pos: n };
      if (kind !== "add") o++;
      if (kind !== "del") n++;
      return row;
    });
  }
  function segmentRows(seg) {
    const file = D.files[seg.file];
    const hunk = file && file.hunks[seg.hunk];
    if (!hunk) return null;
    let rows = numbered(hunk);
    if (seg.lines) rows = rows.filter((r) => r.pos >= seg.lines[0] && r.pos <= seg.lines[1]);
    return rows;
  }
  function diffTable(rows, foldContext) {
    // Fold long unchanged runs (only meaningful for modified files)
    const out = [];
    let i = 0;
    while (i < rows.length) {
      if (foldContext && rows[i].kind === "ctx") {
        let j = i; while (j < rows.length && rows[j].kind === "ctx") j++;
        if (j - i > 8) {
          rows.slice(i, i + 3).forEach((r) => out.push(r));
          out.push({ fold: rows.slice(i + 3, j - 3) });
          rows.slice(j - 3, j).forEach((r) => out.push(r));
          i = j; continue;
        }
      }
      out.push(rows[i]); i++;
    }
    return `<table><tbody>${out.map((r, k) => r.fold
      ? `<tr class="fold"><td colspan="4"><button type="button" data-fold="${k}">⋯ Show ${r.fold.length} unchanged lines</button></td></tr>`
      : rowHtml(r)).join("")}</tbody></table>`;
  }
  const rowHtml = (r) => `<tr class="${r.kind}"><td class="ln old">${r.old ?? ""}</td><td class="ln">${r.new ?? ""}</td><td class="sg">${r.kind === "add" ? "+" : r.kind === "del" ? "−" : " "}</td><td>${colour(r.text) || " "}</td></tr>`;

  /* ---------- Hero ---------- */
  function renderHero() {
    const files = Object.values(D.files);
    const add = files.reduce((a, f) => a + f.added, 0), del = files.reduce((a, f) => a + f.removed, 0);
    const captured = new Date(D.capturedAt);
    $("#h-eyebrow").textContent = `Code review · ${D.baseLabel} → ${D.headLabel === "working tree" ? "0.4.0" : D.headLabel} · captured ${captured.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`;
    $("#h-title").textContent = W.meta.title;
    $("#h-summary").textContent = W.meta.summary;
    const risks = W.chapters.filter((c) => c.risk === "high").length;
    $("#h-stats").innerHTML = [
      [W.chapters.length, "chapters"], [files.length, "files"],
      [`<span class="add">+${add}</span> <span class="del">−${del}</span>`, "lines"],
      [risks, risks === 1 ? "high-risk chapter" : "high-risk chapters"],
    ].map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join("");
    $("#h-example").innerHTML = `<b>About this walkthrough</b>${esc(W.meta.example)} Compared with release ${esc(D.baseLabel)}; paths: ${D.paths.map((p) => `<code>${esc(p)}/</code>`).join(", ")}.`;
    $("#foot").innerHTML = `Reference artifact · source <code>examples/reference/ref-code-walkthrough</code> · diff snapshot ${esc(D.capturedAt)} against release ${esc(D.baseLabel)} · built with the reference kit.`;
  }

  /* ---------- Reading order + side nav ---------- */
  function renderNav() {
    $("#order").innerHTML = W.chapters.map((c, i) => `<li><a href="#ch-${c.id}"><span class="n">${pad(i + 1)}</span><span class="t">${esc(c.title)}</span><span class="risk ${c.risk}">${c.risk}</span></a></li>`).join("");
    $("#side-chapters").innerHTML = W.chapters.map((c, i) => `<a href="#ch-${c.id}" data-ch="${c.id}"><b>${pad(i + 1)}</b><span>${esc(c.title)}</span><i class="sd" aria-hidden="true"></i></a>`).join("");
  }

  /* ---------- Chapters ---------- */
  function renderChapters() {
    const host = $("#chapters");
    W.chapters.forEach((c, ci) => {
      const files = [...new Set(c.segments.map((s) => s.file))];
      const add = c.segments.reduce((a, s) => a + (segmentRows(s) || []).filter((r) => r.kind === "add").length, 0);
      const del = c.segments.reduce((a, s) => a + (segmentRows(s) || []).filter((r) => r.kind === "del").length, 0);
      const sec = document.createElement("section");
      sec.className = "chapter"; sec.id = "ch-" + c.id;
      sec.setAttribute("aria-labelledby", "cht-" + c.id);
      sec.innerHTML = `
        <div class="ch-head"><span class="big-num">${pad(ci + 1)}</span><h2 class="stitch" id="cht-${c.id}">${esc(c.title)}</h2>
          <div class="ch-meta"><span class="risk ${c.risk}">${c.risk} risk</span><span class="mono">${files.length} file${files.length === 1 ? "" : "s"} · +${add} −${del}</span><span class="vd none" data-vd>Not reviewed</span></div></div>
        <div class="ch-why"><div class="callout"><b>Why this change</b>${esc(c.why)}</div>
          ${c.watch && c.watch.length ? `<div class="ch-watch"><b>Worth checking</b><ul class="dots">${c.watch.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : ""}</div>
        <p class="ch-tests"><b>Tests</b><span>${esc(c.tests || "None")}</span></p>
        <div class="segs"></div>
        <div class="ch-review"><div class="verdict-box"></div><div class="ch-thread"></div></div>`;
      host.appendChild(sec);
      const segs = $(".segs", sec);
      c.segments.forEach((s, si) => segs.appendChild(segment(c, s, si)));
      verdictBox($(".verdict-box", sec), c);
      Kit.comments($(".ch-thread", sec), { key: `comments.${c.id}`, title: "Discussion", placeholder: `Comment on “${c.title}” for the agent…` });
    });
  }

  function segment(c, s, si) {
    const file = D.files[s.file];
    const rows = segmentRows(s);
    const card = document.createElement("article");
    card.className = "seg-card";
    if (!rows) { card.innerHTML = `<div class="seg-top"><h3>${esc(s.title)}</h3><p>Hunk ${s.hunk} of ${esc(s.file)} is not in this snapshot. Re-run snapshot.py and check data.js.</p></div>`; return card; }
    const shown = rows.filter((r) => r.new != null);
    const range = shown.length ? `lines ${shown[0].new}–${shown[shown.length - 1].new}` : "";
    const add = rows.filter((r) => r.kind === "add").length, del = rows.filter((r) => r.kind === "del").length;
    const LIMIT = 28;
    const fold = file.status === "modified";
    card.innerHTML = `<div class="seg-top"><h3><span class="seg-n">${pad(si + 1)}</span>${esc(s.title)}</h3><span class="tag ${file.status === "added" ? "good" : "info"}">${file.status === "added" ? "New file" : "Modified"}</span><p>${esc(s.why)}</p></div>
      <div class="file-bar"><code>${esc(s.file)}</code><span>${range}</span><span class="add">+${add}</span><span class="del">−${del}</span></div>
      <div class="diff${file.status === "added" ? " new" : ""}" tabindex="0" aria-label="Diff of ${esc(s.file)} ${range}">${diffTable(rows.length > LIMIT ? rows.slice(0, LIMIT) : rows, fold)}</div>
      ${rows.length > LIMIT ? `<div class="seg-more"><button class="btn" type="button" data-more>Show all ${rows.length} lines</button></div>` : ""}
      <div class="seg-foot"><button class="btn ghost" type="button" data-thread aria-expanded="false">Comment on this part<span class="cnt" hidden></span></button></div>
      <div class="seg-thread" hidden></div>`;
    const diff = $(".diff", card);
    let foldRows = null;
    const bindFolds = (list) => $$("[data-fold]", diff).forEach((b) => b.addEventListener("click", () => {
      const tr = b.closest("tr"); const k = +b.dataset.fold; const item = list[k];
      tr.outerHTML = item.fold.map(rowHtml).join("");
    }));
    // rebuild fold list for the current view so buttons know which rows they hide
    function draw(all) {
      const view = all ? rows : rows.slice(0, LIMIT);
      diff.innerHTML = diffTable(view, fold);
      foldRows = []; // recompute the same structure diffTable used
      let i = 0; const out = [];
      while (i < view.length) {
        if (fold && view[i].kind === "ctx") { let j = i; while (j < view.length && view[j].kind === "ctx") j++; if (j - i > 8) { out.push(...view.slice(i, i + 3)); out.push({ fold: view.slice(i + 3, j - 3) }); out.push(...view.slice(j - 3, j)); i = j; continue; } }
        out.push(view[i]); i++;
      }
      foldRows = out; bindFolds(foldRows);
    }
    draw(false);
    const more = $("[data-more]", card);
    if (more) more.addEventListener("click", () => { draw(true); more.parentElement.remove(); });
    const key = `comments.${c.id}--${si + 1}`;
    const btn = $("[data-thread]", card), slot = $(".seg-thread", card);
    let mounted = false;
    btn.dataset.key = key;
    btn.addEventListener("click", () => {
      const open = slot.hidden;
      slot.hidden = !open; btn.setAttribute("aria-expanded", String(open));
      if (open && !mounted) { mounted = true; Kit.comments(slot, { key, compact: true, placeholder: `Comment on ${s.file} ${range}…` }); }
      if (open) $("textarea", slot)?.focus();
    });
    return card;
  }

  /* ---------- Verdict per chapter ---------- */
  function verdictBox(box, c) {
    box.innerHTML = `<h3>Your verdict on this chapter</h3>
      <div class="choices" role="group" aria-label="Verdict for ${esc(c.title)}">${Object.entries(VERDICTS).map(([k, v]) => `<button type="button" class="choice ${k}" data-v="${k}" aria-pressed="false">${v.icon}${v.label}</button>`).join("")}</div>
      <label class="sr-only" for="note-${c.id}">Note for the agent</label>
      <textarea id="note-${c.id}" placeholder="Note for the agent (what to change, or what you want to know)"></textarea>
      <div class="row" style="--gap:10px"><span class="saved" aria-live="polite"></span><span class="spacer"></span><button class="btn" type="button" data-save>Save note</button></div>`;
    const ta = $("textarea", box), saved = $(".saved", box);
    async function save(verdict) {
      await Kit.data.ensureAuthor();
      const current = reviews[c.id] && reviews[c.id].value;
      const next = verdict === undefined ? (current && current.verdict) : verdict;
      if (!next && !ta.value.trim()) return;
      if (!next) { saved.textContent = "Pick a verdict to save the note."; return; }
      try {
        const doc = await Kit.data.set(`review.${c.id}`, { chapter: c.title, verdict: next, note: ta.value.trim(), author: Kit.data.author() || undefined, reviewedAt: new Date().toISOString() });
        reviews[c.id] = doc; paint();
      } catch (e) { saved.textContent = "Not saved: " + e.message; }
    }
    $$(".choice", box).forEach((b) => b.addEventListener("click", async () => {
      const current = reviews[c.id] && reviews[c.id].value && reviews[c.id].value.verdict;
      if (current === b.dataset.v) { // second click clears the verdict
        try { await Kit.data.remove(`review.${c.id}`); delete reviews[c.id]; paint(); } catch (e) { saved.textContent = "Not saved: " + e.message; }
        return;
      }
      save(b.dataset.v);
    }));
    $("[data-save]", box).addEventListener("click", () => save());
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } });
    box._paint = () => {
      const v = reviews[c.id] && reviews[c.id].value;
      $$(".choice", box).forEach((b) => b.setAttribute("aria-pressed", String(!!v && b.dataset.v === v.verdict)));
      if (document.activeElement !== ta) ta.value = (v && v.note) || "";
      saved.textContent = v ? `${VERDICTS[v.verdict] ? VERDICTS[v.verdict].word : v.verdict} by ${reviews[c.id].author || v.author || "someone"} · ${Kit.ago(reviews[c.id].updatedAt)}` : "No verdict yet";
    };
  }

  /* ---------- Progress, asks, side dots ---------- */
  function paint() {
    const counts = { approved: 0, changes: 0, question: 0 };
    W.chapters.forEach((c) => { const v = reviews[c.id] && reviews[c.id].value; if (v && counts[v.verdict] != null) counts[v.verdict]++; });
    const done = counts.approved + counts.changes + counts.question, total = W.chapters.length;
    const bar = [...Object.entries(counts).map(([k, n]) => n ? `<i style="--n:${n};--c:${VERDICTS[k].c}"></i>` : ""), total - done ? `<i style="--n:${total - done};--c:transparent"></i>` : ""].join("");
    $("#progress-bar").innerHTML = bar;
    $("#progress-bar").setAttribute("aria-label", `${done} of ${total} chapters reviewed`);
    $("#progress-count").textContent = `${done} of ${total} reviewed`;
    $("#progress-legend").innerHTML = Object.entries(counts).map(([k, n]) => `<span><i style="--c:${VERDICTS[k].c}"></i><b>${n}</b> ${VERDICTS[k].word.toLowerCase()}</span>`).join("") + `<span><i style="--c:var(--line-strong)"></i><b>${total - done}</b> to read</span>`;
    $("#side-progress").innerHTML = `<b>${done} of ${total} chapters reviewed</b><div class="cw-bar">${bar}</div>`;
    W.chapters.forEach((c) => {
      const v = reviews[c.id] && reviews[c.id].value;
      const dot = $(`.side a[data-ch="${c.id}"] .sd`); if (dot) dot.className = "sd " + (v ? v.verdict : "");
      const badge = $(`#ch-${c.id} [data-vd]`);
      if (badge) { badge.className = "vd " + (v ? v.verdict : "none"); badge.textContent = v ? VERDICTS[v.verdict].word : "Not reviewed"; }
      const box = $(`#ch-${c.id} .verdict-box`); if (box && box._paint) box._paint();
    });
    // Requested changes, questions and open comments, for the agent
    const asks = [];
    W.chapters.forEach((c, i) => {
      const r = reviews[c.id], v = r && r.value;
      const open = Object.entries(commentDocs).filter(([k]) => k === `comments.${c.id}` || k.startsWith(`comments.${c.id}--`))
        .reduce((a, [, d]) => a + ((d.value && d.value.items) || []).filter((it) => !it.resolved && it.role !== "agent").length, 0);
      const ask = v && (v.verdict === "changes" || v.verdict === "question");
      if (!ask && !open) return;
      const openLine = open ? `<span class="by">${open} unresolved comment${open === 1 ? "" : "s"} in this chapter</span>` : "";
      asks.push(ask
        ? `<div class="cw-ask ${v.verdict}"><span class="vd ${v.verdict}">${VERDICTS[v.verdict].word}</span><a href="#ch-${c.id}">${pad(i + 1)} · ${esc(c.title)}</a><p>${esc(v.note || "No note — see the chapter discussion.")}</p><span class="by">${esc(r.author || "Someone")} · ${Kit.ago(r.updatedAt)}</span>${openLine}</div>`
        : `<div class="cw-ask comments"><span class="vd" style="background:var(--accent-soft);color:var(--accent)">${open} open</span><a href="#ch-${c.id}">${pad(i + 1)} · ${esc(c.title)}</a><p>${open} unresolved comment${open === 1 ? "" : "s"} from reviewers.</p></div>`);
    });
    $("#asks-list").innerHTML = asks.length ? asks.join("") : `<p class="cw-empty">Nothing requested yet. Approve chapters, request changes or ask questions as you read; they collect here.</p>`;
    // Segment comment counts
    $$("[data-thread]").forEach((b) => {
      const d = commentDocs[b.dataset.key], n = (d && d.value && d.value.items && d.value.items.length) || 0;
      const cnt = $(".cnt", b); cnt.hidden = !n; cnt.textContent = n;
    });
  }

  /* ---------- Files table ---------- */
  function renderFiles() {
    const chapterOf = {};
    W.chapters.forEach((c, i) => c.segments.forEach((s) => ((chapterOf[s.file] = chapterOf[s.file] || new Set()).add(i))));
    const files = Object.values(D.files).sort((a, b) => b.added + b.removed - (a.added + a.removed));
    $("#files-sub").textContent = `${files.length} files in the snapshot. Files not covered by any chapter are listed with a dash.`;
    $("#files-table tbody").innerHTML = files.map((f) => `<tr><td><code>${esc(f.path)}</code></td><td><span class="tag ${f.status === "added" ? "good" : "info"}">${f.status === "added" ? "New" : "Modified"}</span></td><td class="num" data-value="${f.added}">+${f.added}</td><td class="num" data-value="${f.removed}">−${f.removed}</td><td>${chapterOf[f.path] ? [...chapterOf[f.path]].map((i) => `<a href="#ch-${W.chapters[i].id}">${pad(i + 1)}</a>`).join(" ") : "—"}</td></tr>`).join("");
  }

  renderHero(); renderNav(); renderChapters(); renderFiles();
  Kit.refresh();
  paint();
  Kit.data.watch("review.", (docs) => {
    Object.keys(reviews).forEach((k) => delete reviews[k]);
    docs.forEach((d) => { reviews[d.key.slice(7)] = d; });
    paint();
  }, { interval: 8000 });
  Kit.data.watch("comments.", (docs) => {
    Object.keys(commentDocs).forEach((k) => delete commentDocs[k]);
    docs.forEach((d) => (commentDocs[d.key] = d));
    paint();
  }, { interval: 10000 });
  // Keep the local copy of a verdict in sync immediately after saving
  document.addEventListener("kit:comments", (e) => { commentDocs[e.detail.key] = { value: { items: e.detail.items } }; paint(); }, true);
});
