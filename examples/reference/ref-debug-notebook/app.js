/* Debug notebook — renders window.NOTEBOOK (data.js). One function per section. */
document.addEventListener("kit:ready", () => {
  "use strict";
  const N = window.NOTEBOOK, { $, $$, esc } = Kit;
  const STATUS = {
    confirmed: { label: "Confirmed", icon: '<path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
    contributing: { label: "Contributing", icon: '<path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' },
    "ruled-out": { label: "Ruled out", icon: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' },
    open: { label: "Open", icon: '<circle cx="8" cy="8" r="4.5" fill="none" stroke="currentColor" stroke-width="1.8"/>' },
  };
  const VERIFY = { pass: "Pass", partial: "Partial", pending: "Pending", fail: "Fail", skip: "Not measurable" };
  const statusTag = (s) => `<span class="hs hs-${s}"><svg viewBox="0 0 16 16" aria-hidden="true">${STATUS[s].icon}</svg>${STATUS[s].label}</span>`;

  /* ---------- Head ---------- */
  const m = N.meta;
  document.title = `${m.id} · ${m.title}`;
  $("#brand-id").textContent = m.id;
  $("#nb-id").textContent = m.id;
  $("#nb-reported").textContent = "Reported " + m.reported;
  $("#nb-title").innerHTML = esc(m.title).replace(/flickered/, "<em>flickered</em>");
  $("#nb-summary").textContent = m.summary;
  const counts = {}; N.hypotheses.forEach((h) => (counts[h.status] = (counts[h.status] || 0) + 1));
  $("#nb-strip").innerHTML = `<div class="nb-status"><span class="eyebrow">Status</span><b>${esc(m.status)}</b><span>${esc(m.statusNote || "")}</span></div>
    <div><span class="eyebrow">Subject</span><a href="${esc(m.subjectUrl)}"><b>${esc(m.subject)}</b></a><span>${esc(m.fixedIn)}</span></div>
    <div><span class="eyebrow">Hypotheses</span><b>${N.hypotheses.length}</b><span>${Object.keys(STATUS).filter((k) => counts[k]).map((k) => counts[k] + " " + STATUS[k].label.toLowerCase()).join(" · ")}</span></div>
    <div><span class="eyebrow">Investigator</span><b>${esc(m.investigator)}</b><span>Comments welcome on every hypothesis</span></div>`;

  /* ---------- Symptom & reproduce ---------- */
  $("#quote").innerHTML = `<blockquote>“${esc(N.symptom.quote)}”</blockquote><figcaption>— ${esc(N.symptom.who)}</figcaption>`;
  $("#env").innerHTML = N.environment.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
  $("#observed").innerHTML = N.symptom.observed.map((o) => `<li>${esc(o)}</li>`).join("");
  $("#repro").innerHTML = N.reproduce.map((r, i) => `<li><div><h4>Step ${i + 1}</h4><p>${esc(r)}</p></div></li>`).join("");

  /* ---------- Evidence ---------- */
  function codeBlock(text, cls) { return text.split("\n").map((l) => `<span class="ln ${cls}">${esc(l) || " "}</span>`).join(""); }
  function evidence(e) {
    let body = "";
    if (e.kind === "code") {
      body = `<pre class="diff">${e.before ? codeBlock(e.before, "del") : ""}${codeBlock(e.after, e.before ? "add" : "ctx")}</pre>`;
    } else if (e.kind === "headers") {
      body = `<pre class="headers">${esc(e.body)}</pre>`;
    } else if (e.kind === "measure") {
      body = `<div class="table-wrap"><table class="table compact measure"><thead><tr>${e.headers.map((hd, i) => `<th class="${i ? "num" : ""}">${esc(hd)}</th>`).join("")}</tr></thead><tbody>${e.rows.map((r) => `<tr>${r.map((c, i) => (i ? `<td class="num">${esc(c)}</td>` : `<th scope="row">${esc(c)}</th>`)).join("")}</tr>`).join("")}</tbody></table></div>`;
    } else {
      body = `<p>${esc(e.body)}</p>`;
    }
    const kind = { code: "Code", headers: "Response", measure: "Measurement", note: "Note" }[e.kind] || "Evidence";
    return `<div class="ev ev-${e.kind}"><div class="ev-head"><span class="ev-kind">${kind}</span><b>${esc(e.title)}</b>${e.file ? `<code class="ev-file">${esc(e.file)}</code>` : ""}</div>${body}</div>`;
  }

  /* ---------- Hypotheses: board + cards + per-hypothesis threads ---------- */
  const order = ["confirmed", "contributing", "open", "ruled-out"];
  $("#board").innerHTML = N.hypotheses.slice().sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status)).map((h) =>
    `<a class="bcard hs-wrap-${h.status}" href="#${esc(h.id)}"><span class="bid mono">${esc(h.id.toUpperCase())}</span>${statusTag(h.status)}<b>${esc(h.title)}</b><span class="bcount" data-count-for="${esc(h.id)}"></span></a>`).join("");
  $("#side-hyps").innerHTML = N.hypotheses.map((h) => `<a href="#${esc(h.id)}" class="side-h"><i class="dot hs-dot-${h.status}" aria-hidden="true"></i>${esc(h.id.toUpperCase())} ${esc(h.title)}</a>`).join("");
  const hyps = $("#hyps");
  N.hypotheses.forEach((h) => {
    const card = document.createElement("article");
    card.className = "hyp hs-wrap-" + h.status; card.id = h.id; card.dataset.status = h.status;
    card.innerHTML = `<header class="hyp-head"><span class="hid mono">${esc(h.id.toUpperCase())}</span><h3>${esc(h.title)}</h3>${statusTag(h.status)}</header>
      <p class="claim"><span class="eyebrow">Claim</span>${esc(h.claim)}</p>
      <div class="evs">${h.evidence.map(evidence).join("")}</div>
      <div class="verdict"><span class="eyebrow">Verdict</span><p>${esc(h.verdict)}</p></div>
      <details class="fold hyp-talk"><summary><span>Discussion</span><span class="talk-count" data-count-for="${esc(h.id)}">Add a comment</span></summary><div class="in"><div class="hyp-thread"></div></div></details>`;
    hyps.appendChild(card);
    const host = $(".hyp-thread", card);
    Kit.comments(host, { key: h.id, compact: true, placeholder: `Challenge or support ${h.id.toUpperCase()}: what did you see?` });
    host.addEventListener("kit:comments", (e) => {
      const n = e.detail.items.length, open = e.detail.items.filter((i) => !i.resolved).length;
      $$(`[data-count-for="${h.id}"]`).forEach((el) => (el.textContent = n ? `${n} comment${n === 1 ? "" : "s"}${open ? ` · ${open} open` : ""}` : el.classList.contains("talk-count") ? "Add a comment" : ""));
      if (n && !card.dataset.opened) { card.dataset.opened = "1"; $(".hyp-talk", card).open = true; }
    });
  });

  // Status filter
  const filter = $("#hyp-filter");
  const opts = ["all", ...order.filter((k) => counts[k])];
  filter.innerHTML = opts.map((k) => `<button class="chip" type="button" data-f="${k}" aria-pressed="${k === "all"}">${k === "all" ? "All" : STATUS[k].label}<span class="c">${k === "all" ? N.hypotheses.length : counts[k]}</span></button>`).join("");
  filter.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    $$("button", filter).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    $$(".hyp", hyps).forEach((c) => (c.hidden = b.dataset.f !== "all" && c.dataset.status !== b.dataset.f));
    $$(".bcard").forEach((c) => c.classList.toggle("dim", b.dataset.f !== "all" && !c.classList.contains("hs-wrap-" + b.dataset.f)));
  });

  /* ---------- Root cause with a to-scale figure ---------- */
  const rc = N.rootCause;
  $("#cause-title").textContent = rc.title;
  $("#cause-body").textContent = rc.body;
  $("#cause-numbers").innerHTML = `<div class="cn-head"><span></span><span>Before</span><span>After</span></div>` + rc.numbers.map((n) => `<div><span>${esc(n.label)}</span><b class="${n.before === n.after ? "" : "was"}">${esc(n.before)}</b><b>${esc(n.after)}</b></div>`).join("");
  // To scale: one camera's shadow paint box before (≈23,000 px) and after (≈6,100 px) vs a 1440 × 900 viewport.
  const S = 300 / 23000, c = 170, sq = (side) => side * S;
  const before = sq(23000), after = sq(6100), vw = sq(1440), vh = sq(900);
  $("#cause-fig").innerHTML = `<svg viewBox="0 0 340 340" role="img" aria-label="To scale: shadow paint area before (23,000 px square) and after (6,100 px square) compared with a 1440 by 900 viewport">
      <rect x="${c - before / 2}" y="${c - before / 2}" width="${before}" height="${before}" rx="4" class="f-before"/>
      <rect x="${c - after / 2}" y="${c - after / 2}" width="${after}" height="${after}" rx="3" class="f-after"/>
      <rect x="${c - vw / 2}" y="${c - vh / 2}" width="${vw}" height="${vh}" rx="1.5" class="f-view"/>
    </svg><ul class="f-legend"><li><i class="k-before"></i>Before · ≈ 23,000 px square</li><li><i class="k-after"></i>After · ≈ 6,100 px square</li><li><i class="k-view"></i>Viewport · 1440 × 900</li></ul>
    <figcaption>To scale: the shadow paint box of one camera at 2.6× zoom. Before the fix the browser kept 24 of them on the GPU.</figcaption>`;

  /* ---------- Fix ---------- */
  $("#fixes").innerHTML = N.fixes.map((f, i) => `<article class="fix-card"><header><span class="fix-n">${i + 1}</span><div><h3>${esc(f.title)}</h3><code class="ev-file">${esc(f.file)}</code></div></header>
      <pre class="diff">${f.before ? codeBlock(f.before, "del") : ""}${codeBlock(f.after, f.before ? "add" : "ctx")}</pre><p class="why"><b>Why it is safe</b>${esc(f.why)}</p></article>`).join("");

  /* ---------- Verification & lessons ---------- */
  $("#verification").innerHTML = N.verification.map((v) => `<li class="vr vr-${v.status}"><span class="vr-tag">${VERIFY[v.status] || v.status}</span><div><b>${esc(v.check)}</b><span>${esc(v.result)}</span></div></li>`).join("");
  $("#lesson-list").innerHTML = N.lessons.map((l) => `<li>${esc(l)}</li>`).join("");

  /* ---------- New hypotheses from readers ---------- */
  Kit.comments($("#add-thread"), { key: "hypotheses", title: "Proposed hypotheses", placeholder: "H5 — what you saw, and what would prove or disprove it…" });

  if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) setTimeout(() => t.scrollIntoView(), 60); }
});
