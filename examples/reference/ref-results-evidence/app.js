/* Results & evidence — renders RESULTS (data.js) and EVIDENCE (evidence.js, generated). */
(function () {
  "use strict";
  const R = window.RESULTS, E = window.EVIDENCE;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const md = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
  const fmt = (n) => Number(n).toLocaleString("en-GB");
  const WORD = { met: "Met", partly: "Partly", not: "Not met", passed: "Passed", failed: "Failed", "not-run": "Not run", restored: "Restored", left: "Left as is", "n/a": "Not touched" };
  const st = (s) => `<span class="st ${s === "n/a" ? "na" : esc(s)}">${WORD[s] || esc(s)}</span>`;
  const C = E.checks;

  /* ---------- Hero ---------- */
  const w = R.work;
  $("#h-eyebrow").textContent = `${w.kind} · ${w.date} · ${E.after.rev}`;
  $("#h-title").innerHTML = `${esc(w.title)}. <em>${esc(w.titleEm)}</em>`;
  $("#h-lead").textContent = w.lead;
  const count = (s) => R.criteria.filter((c) => c.status === s).length;
  const pxChanged = C.pixels.reduce((a, p) => a + p.changed, 0);
  $("#board").innerHTML = `
    <div class="re-verdict">
      <span class="re-lbl">Outcome</span>
      <span class="word">${esc(w.status)}</span>
      <div class="re-counts">${["met", "partly", "not"].map((s) => `<span class="st ${s}">${count(s)} ${WORD[s].toLowerCase()}</span>`).join("")}</div>
      <div class="meta">
        <span>By <b>${esc(w.by)}</b></span>
        <span>Commit <a href="${esc(w.commitUrl)}">${esc(E.after.rev)}</a> on <b>${esc(w.branch)}</b> · ${esc(E.shortstat.replace(/\(\+\)|\(-\)/g, "").trim())}</span>
      </div>
    </div>
    <div class="re-keys">
      <div class="re-key"><b>${fmt(C.styles.differ)}<small>of ${fmt(C.styles.elements)}</small></b><span>elements change in the default theme, across ${C.styles.pages.length} pages</span></div>
      <div class="re-key"><b>${fmt(pxChanged)}<small>pixels</small></b><span>differ in before/after screenshots of ${C.pixels.length} pages</span></div>
      <div class="re-key"><b>1<small>line</small></b><span>turns the theme on: a stylesheet link, or <code>KIT_THEME=quiet</code></span></div>
      <div class="re-key"><b>${fmt(C.files.fonts_kb)}<small>KB</small></b><span>of self-hosted fonts, ${C.files.licences.length} licences bundled</span></div>
    </div>`;
  $("#bounds").innerHTML = `<span class="re-lbl">Not claimed</span>${R.boundaries.map((b) => `<p>${md(b)}</p>`).join("")}`;

  /* ---------- Criteria ---------- */
  $("#criteria-list").innerHTML = R.criteria.map((c) => `
    <li class="${esc(c.status)}">
      <span class="cid">${esc(c.id)}</span>
      <div><div class="ctext">${md(c.text)}</div><div class="chow">${md(c.how)}</div></div>
      <div class="cside">${st(c.status)}<div class="re-chips">${c.evidence.map((v) => `<a class="re-chip" href="#check-${esc(v)}" data-check="${esc(v)}">${esc(v)}</a>`).join("")}</div></div>
    </li>`).join("");
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-check]"); if (!a) return;
    e.preventDefault();
    const d = document.getElementById("check-" + a.dataset.check); if (!d) return;
    d.open = true; d.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    d.classList.remove("flash"); void d.offsetWidth; d.classList.add("flash"); setTimeout(() => d.classList.remove("flash"), 1800);
  });

  /* ---------- Before / after ---------- */
  const stage = $("#compare-stage"), range = $("#cmp-range");
  const setPos = (v) => stage.style.setProperty("--pos", v + "%");
  range.addEventListener("input", () => setPos(range.value));
  function show(i) {
    const c = R.compare[i];
    $("#cmp-before").src = `shots/${c.shot}-default.webp`; $("#cmp-before").alt = `${c.label} with the default theme`;
    $("#cmp-after").src = `shots/${c.shot}-quiet.webp`; $("#cmp-after").alt = `${c.label} with the Quiet theme`;
    $("#compare-note").innerHTML = `<b>${esc(c.label)}.</b> ${md(c.note)}`;
    tabs.querySelectorAll("button").forEach((b, j) => b.setAttribute("aria-selected", String(i === j)));
  }
  const tabs = $("#compare-tabs");
  tabs.innerHTML = R.compare.map((c, i) => `<button type="button" role="tab" aria-selected="${i === 0}" data-i="${i}">${esc(c.label)}</button>`).join("");
  tabs.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) show(+b.dataset.i); });
  show(0); setPos(50);
  $("#changes-list").innerHTML = R.changes.map((c) => `
    <div class="panel re-change"><h3>${esc(c.title)}</h3><p>${md(c.text)}</p>
      <div class="re-files">${c.files.map((f) => `<code>${esc(f)}</code>`).join("")}</div></div>`).join("");

  /* ---------- Ledger ---------- */
  const passed = R.checks.filter((c) => c.result === "passed").length;
  $("#ledger-sub").textContent = `${R.checks.length} checks: ${passed} passed, ${R.checks.length - passed} partly. Open a check for its method and the raw evidence. Measured ${new Date(E.generated).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} by capture.py unless noted.`;
  const summary = {
    V1: () => `${fmt(C.styles.differ)} of ${fmt(C.styles.elements)} elements differ on ${C.styles.pages.length} pages`,
    V2: () => C.pixels.map((p) => `${fmt(p.changed)} px`).join(" · ") + ` changed of ${fmt(C.pixels[0].pixels)} each`,
    V3: () => `${Object.values(C.coverage.tokens).reduce((a, b) => a + b, 0)} token reads in ${C.coverage.files} files; ${C.coverage.kept.filter((k) => /\{/.test(k)).length} dashed lines kept fixed`,
    V4: () => `${C.files.fonts.length} fonts, ${C.files.fonts_kb} KB, ${C.files.fonts.every((f) => f.referenced) ? "all referenced" : "some unreferenced"}; ${C.files.licences.join(", ")}`,
  };
  function detail(c) {
    const d = c.detail; if (!d) return "";
    if (d.kind === "styles") {
      const changed = C.styles.pages.filter((p) => p.markup.length);
      return `<div class="re-mini">${C.styles.pages.map((p) => `<div><span title="${esc(p.page)}">${esc(p.page)}${p.markup.length ? " *" : ""}</span><span>${p.differ} / ${fmt(p.elements)}</span></div>`).join("")}</div>
        <p class="method">Properties: ${C.styles.props.map((p) => `<code>${esc(p)}</code>`).join(" ")}</p>
        ${changed.length ? `<p class="method">* Markup also changed in this commit (${changed.map((p) => `${esc(p.page)}: ${p.markup.map(esc).join(", ")}`).join("; ")}); compared with the new markup on both sides.</p>` : ""}`;
    }
    if (d.kind === "pixels") return `<div class="re-mini">${C.pixels.map((p) => `<div><span>${esc(p.page)}</span><span>${fmt(p.changed)} of ${fmt(p.pixels)} px</span></div>`).join("")}</div>`;
    if (d.kind === "coverage") return `<div class="re-mini">${Object.entries(C.coverage.tokens).map(([t, n]) => `<div><span><code>${esc(t)}</code></span><span>${n}</span></div>`).join("")}</div>
        <p class="method"><b>Kept fixed on purpose</b> — the dash itself means something here (legend keys, scope markers, “next” and “running” states):</p>
        <ul class="re-kept">${C.coverage.kept.filter((k) => /\{/.test(k)).map((k) => `<li>${esc(k)}</li>`).join("")}</ul>`;
    if (d.kind === "fonts") return `<div class="re-mini">${C.files.fonts.map((f) => `<div><span>${esc(f.file)}</span><span>${f.kb} KB${f.referenced ? "" : " · unreferenced"}</span></div>`).join("")}</div>
        <p class="method">quiet.css: ${C.files.theme_css_lines} lines · publish.sh injects the theme link: ${C.files.publish_injects ? "yes" : "no"}</p>`;
    if (d.kind === "code") return `<pre data-copy>${esc(d.text)}</pre>`;
    return "";
  }
  $("#ledger-list").innerHTML = R.checks.map((c) => `
    <details class="re-check" id="check-${esc(c.id)}">
      <summary><span class="vid">${esc(c.id)}</span><span class="vtitle">${esc(c.title)}<span class="vsum">${summary[c.id] ? esc(summary[c.id]()) : md(c.method)}</span></span>${st(c.result)}</summary>
      <div class="in"><p class="method"><b>Method.</b> ${md(c.method)}</p>${detail(c)}</div>
    </details>`).join("");
  window.addEventListener("beforeprint", () => document.querySelectorAll(".re-check").forEach((d) => (d.open = true)));

  /* ---------- Evidence gallery ---------- */
  $("#metrics").innerHTML = [
    ["Pages compared", C.styles.pages.length, "every reference, the hub and the template"],
    ["Elements compared", fmt(C.styles.elements), `${C.styles.props.length} computed properties each`],
    ["Pixels compared", fmt(C.pixels.reduce((a, p) => a + p.pixels, 0)), `${C.pixels.length} pages at 1440 × 900`],
    ["Screenshots", E.shots.length * 2, "default and Quiet, light and dark"],
  ].map(([l, v, d]) => `<div class="stat"><span class="label">${l}</span><span class="value">${v}</span><span class="delta flat">${d}</span></div>`).join("");
  const gal = E.shots.flatMap((s) => {
    const c = R.compare.find((x) => x.shot === s.id) || { label: s.page };
    return [["default", "Default"], ["quiet", "Quiet"]].map(([v, l]) => ({ src: `shots/${s.id}-${v}.webp`, title: `${c.label} · ${l}`, meta: `${s.page} · ${s.scheme} · ${s.w} × ${s.h}` }));
  });
  $("#gallery-list").innerHTML = gal.map((g, i) => `<button class="re-shot" type="button" data-i="${i}"><img src="${g.src}" alt="${esc(g.title)}"><b>${esc(g.title)}</b><span>${esc(g.meta)}</span></button>`).join("");
  const box = $("#lightbox");
  $("#gallery-list").addEventListener("click", (e) => {
    const b = e.target.closest(".re-shot"); if (!b) return;
    const g = gal[+b.dataset.i]; $("#lightbox-img").src = g.src; $("#lightbox-img").alt = g.title; $("#lightbox-cap").textContent = `${g.title} — ${g.meta}`;
    box.showModal();
  });
  box.addEventListener("click", (e) => { if (e.target === box) box.close(); });

  /* ---------- Environment, caveats, references ---------- */
  $("#env-list").innerHTML = R.environment.map((x) => `
    <div class="re-env-row"><b>${esc(x.what)}</b><span class="then">${md(x.then)}</span><span class="arrow" aria-hidden="true">→</span><span class="now">${md(x.now)}</span>${st(x.status)}</div>`).join("");
  $("#caveats").innerHTML = R.caveats.map((c) => `
    <div class="panel re-caveat ${esc(c.kind)}"><span class="tag ${c.kind === "caveat" ? "warn" : "info"} re-kind">${c.kind === "caveat" ? "Caveat" : "Follow-up"}</span><h3>${esc(c.title)}</h3><p>${md(c.text)}</p></div>`).join("");
  $("#refs").innerHTML = `
    <details class="fold"><summary>References · commit ${esc(E.after.rev)} · ${E.commit_files.length} files</summary><div class="in">
      <div class="re-commit"><a href="${esc(w.commitUrl)}">${esc(E.after.rev)}</a><span>${esc(E.after.subject)}</span><span class="muted">${esc(E.after.date)} · compared with ${esc(E.before.rev)} (${esc(E.before.subject)})</span></div>
      <div class="table-wrap"><table class="table compact"><thead><tr><th>File</th><th class="num">Added</th><th class="num">Removed</th></tr></thead><tbody>
        ${E.commit_files.map((f) => `<tr><td><code>${esc(f.path)}</code></td><td class="num add">${f.add === "-" ? "binary" : "+" + esc(f.add)}</td><td class="num del">${f.del === "-" ? "" : "−" + esc(f.del)}</td></tr>`).join("")}
      </tbody></table></div></div></details>`;
  $("#foot").innerHTML = `Reference example: real work on this repository, measured by <code>capture.py</code> (${esc(E.seconds)} s). Sign-offs and comments are saved beside the page, never inside a version.`;

  /* ---------- Sign-off (review.signoff) and questions (comments.results) ---------- */
  const opts = $("#options"), note = $("#decide-note"), save = $("#decide-save");
  let choice = null, saved = null;
  opts.innerHTML = R.signoff.options.map((o) => `<button type="button" class="re-opt" role="radio" aria-checked="false" data-v="${esc(o.id)}"><b>${esc(o.label)}</b><span>${esc(o.hint)}</span></button>`).join("");
  const paint = () => {
    opts.querySelectorAll(".re-opt").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.v === choice)));
    save.disabled = !choice;
    const v = saved && saved.value;
    const cls = v && ({ accepted: "met", "follow-ups": "partly", "not-yet": "not" }[v.verdict] || "na");
    $("#decide-state").innerHTML = v ? `<span class="re-decided"><span class="st ${cls}">${esc(v.label)}</span><span>by ${esc(v.author || "someone")}, ${new Date(v.decidedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span></span>` : "Not decided yet";
  };
  opts.addEventListener("click", (e) => { const b = e.target.closest(".re-opt"); if (b) { choice = b.dataset.v; paint(); } });
  save.addEventListener("click", async () => {
    const o = R.signoff.options.find((x) => x.id === choice); if (!o) return;
    await Kit.data.ensureAuthor();
    try {
      saved = await Kit.data.set("review.signoff", { verdict: o.id, label: o.label, note: note.value.trim(), author: Kit.data.author() || undefined, decidedAt: new Date().toISOString(), work: w.title, commit: E.after.rev });
      paint();
    } catch (err) { /* the save-status chip shows the error */ }
  });
  Kit.data.watch("review.signoff", (docs) => {
    saved = docs.find((d) => d.key === "review.signoff") || null;
    if (saved && !choice) { choice = saved.value.verdict; note.value = saved.value.note || ""; }
    paint();
  }, { interval: 8000 });
  paint();
  Kit.comments($("#thread"), { key: "comments.results", title: "Questions about the evidence", placeholder: "Ask the agent about a check, a screenshot or a caveat…" });
  if (window.Kit && Kit.refresh) Kit.refresh();
})();
