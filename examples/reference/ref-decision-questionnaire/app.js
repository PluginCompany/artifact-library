/* Decision questionnaire — renders window.QUESTIONNAIRE (data.js) and saves
   answers with Kit.data as answer.<questionId>. Sections: hero/progress,
   jump nav, question cards, review table and "I'm done". */
document.addEventListener("kit:ready", () => {
  "use strict";
  const Q = window.QUESTIONNAIRE;
  const { $, $$, esc } = Kit;
  const D = Kit.data;
  const byId = Object.fromEntries(Q.questions.map((q) => [q.id, q]));
  const optOf = (q, id) => q.options.find((o) => o.id === id);
  const answers = {};        // questionId -> saved document (or undefined)
  let submitted = null;      // state.submitted document
  const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

  /* ---------- Sketches: tiny pictures drawn with kit tokens ---------- */
  const phone = (dock) => `<svg viewBox="18 0 84 150" class="sk" aria-hidden="true">
      <rect class="sk-frame" x="30" y="4" width="60" height="142" rx="10"/>
      <rect class="sk-soft" x="35" y="14" width="50" height="122" rx="3"/>
      <rect class="sk-line strong" x="40" y="22" width="34" height="6" rx="2"/>
      <rect class="sk-line" x="40" y="34" width="40" height="3" rx="1.5"/><rect class="sk-line" x="40" y="41" width="36" height="3" rx="1.5"/>
      <rect class="sk-card" x="40" y="52" width="40" height="26" rx="3"/>
      <rect class="sk-line" x="40" y="86" width="40" height="3" rx="1.5"/><rect class="sk-line" x="40" y="93" width="30" height="3" rx="1.5"/>
      <rect class="sk-line" x="40" y="104" width="38" height="3" rx="1.5"/><rect class="sk-line" x="40" y="111" width="26" height="3" rx="1.5"/>
      ${dock}</svg>`;
  const SKETCHES = {
    "phone-pill": phone(`<rect class="sk-accent" x="64" y="120" width="18" height="11" rx="5.5"/><text class="sk-t on" x="73" y="128" text-anchor="middle">v3</text>`),
    "phone-row": phone(`<rect class="sk-dock" x="35" y="118" width="50" height="18"/><rect class="sk-accent" x="39" y="123" width="8" height="8" rx="2"/><rect class="sk-line strong" x="51" y="125" width="18" height="4" rx="2"/><circle class="sk-line strong" cx="78" cy="127" r="2"/>`),
    "phone-none": phone(``),
    "phone-two": phone(`<rect class="sk-dock warn" x="35" y="102" width="50" height="34"/><rect class="sk-accent" x="39" y="107" width="8" height="8" rx="2"/><rect class="sk-line strong" x="51" y="109" width="28" height="4" rx="2"/><rect class="sk-line strong" x="39" y="121" width="30" height="8" rx="2"/><rect class="sk-line strong" x="72" y="121" width="9" height="8" rx="2"/>`),
    "theme-both": themes([["dark", "dark"], ["dark", "dark"]], ["Library", "Artifact"]),
    "theme-match": themes([["light", "light"], ["dark", "dark"]], ["Light page", "Dark page"]),
    "theme-toggle": `<svg viewBox="0 0 220 120" class="sk" aria-hidden="true"><rect class="sk-frame" x="10" y="10" width="200" height="100" rx="8"/><rect class="sk-soft" x="10" y="10" width="200" height="24" rx="8"/><rect class="sk-accent" x="20" y="17" width="10" height="10" rx="3"/><rect class="sk-line strong" x="36" y="19" width="50" height="6" rx="3"/>
      <rect class="sk-card" x="128" y="15" width="74" height="14" rx="7"/><rect class="sk-dark-fill" x="152" y="17" width="24" height="10" rx="5"/><text class="sk-t" x="140" y="25" text-anchor="middle">☀</text><text class="sk-t on" x="164" y="25" text-anchor="middle">☾</text><text class="sk-t" x="189" y="25" text-anchor="middle">◐</text>
      <rect class="sk-line" x="22" y="46" width="80" height="5" rx="2.5"/><rect class="sk-card" x="22" y="58" width="56" height="40" rx="4"/><rect class="sk-card" x="84" y="58" width="56" height="40" rx="4"/><rect class="sk-card" x="146" y="58" width="56" height="40" rx="4"/></svg>`,
    "theme-light": themes([["dark", "light"]], ["Dark page, light toolbar"]),
    "notify-pull": `<svg viewBox="0 0 220 120" class="sk" aria-hidden="true"><rect class="sk-dark-fill" x="18" y="16" width="184" height="88" rx="8"/><circle class="sk-thread" cx="32" cy="29" r="3"/><circle class="sk-line" cx="42" cy="29" r="3"/><circle class="sk-line" cx="52" cy="29" r="3"/>
      <text class="sk-t on mono" x="30" y="56">$ artifact feedback plan</text><text class="sk-t on mono dim" x="30" y="74">## comments.f1 (3)</text><text class="sk-t on mono dim" x="30" y="90">- [human · Alex] Looks good</text></svg>`,
    "notify-badge": `<svg viewBox="0 0 220 120" class="sk" aria-hidden="true"><rect class="sk-card" x="34" y="14" width="96" height="92" rx="8"/><rect class="sk-soft" x="34" y="14" width="96" height="52" rx="8"/><rect class="sk-line strong" x="44" y="76" width="60" height="6" rx="3"/><rect class="sk-line" x="44" y="88" width="40" height="4" rx="2"/>
      <rect class="sk-thread" x="104" y="6" width="38" height="18" rx="9"/><text class="sk-t on" x="123" y="18.5" text-anchor="middle">3 open</text>
      <rect class="sk-card" x="144" y="80" width="64" height="24" rx="12"/><rect class="sk-accent" x="150" y="86" width="12" height="12" rx="3"/><text class="sk-t" x="186" y="95" text-anchor="middle">v3 · 3</text></svg>`,
    "notify-hook": `<svg viewBox="0 0 220 120" class="sk" aria-hidden="true"><rect class="sk-card" x="14" y="30" width="70" height="60" rx="8"/><rect class="sk-line strong" x="24" y="42" width="40" height="5" rx="2.5"/><rect class="sk-line" x="24" y="54" width="48" height="4" rx="2"/><rect class="sk-line" x="24" y="64" width="34" height="4" rx="2"/>
      <path class="sk-wire" d="M88 60 H130"/><path class="sk-arrow" d="M126 54 L134 60 L126 66"/>
      <rect class="sk-accent-soft" x="138" y="28" width="70" height="26" rx="10"/><text class="sk-t" x="173" y="45" text-anchor="middle">#artifacts</text><rect class="sk-accent-soft" x="138" y="62" width="70" height="26" rx="10"/><text class="sk-t" x="173" y="79" text-anchor="middle">agent run</text></svg>`,
    "data-tag": comments([["v2", true], ["v2", true], ["v5", false]]),
    "data-fold": `<svg viewBox="0 0 220 120" class="sk" aria-hidden="true"><rect class="sk-soft" x="20" y="14" width="180" height="22" rx="6"/><text class="sk-t" x="32" y="29">▸ Earlier versions · 4 resolved</text>${bubble(20, 44, "v5", false)}${bubble(20, 80, "v5", false)}</svg>`,
    "data-fresh": `<svg viewBox="0 0 220 120" class="sk" aria-hidden="true"><rect class="sk-frame" x="20" y="12" width="84" height="96" rx="8"/>${bubble(26, 22, "v4", true, 72)}${bubble(26, 60, "v4", true, 72)}<path class="sk-wire" d="M110 60 H126"/><path class="sk-arrow" d="M122 54 L130 60 L122 66"/><rect class="sk-frame" x="134" y="12" width="70" height="96" rx="8"/><text class="sk-t dim" x="169" y="64" text-anchor="middle">v5 · empty</text></svg>`,
  };
  function themes(pairs, labels) {
    const w = pairs.length === 1 ? 160 : 92, gap = 16, start = (220 - (w * pairs.length + gap * (pairs.length - 1))) / 2;
    return `<svg viewBox="0 0 220 120" class="sk" aria-hidden="true">${pairs.map(([page, dock], i) => {
      const x = start + i * (w + gap);
      return `<rect class="${page === "dark" ? "sk-dark-fill" : "sk-frame"}" x="${x}" y="10" width="${w}" height="84" rx="7"/>
        <rect class="${page === "dark" ? "sk-line-d" : "sk-line"} strong" x="${x + 10}" y="22" width="${w * 0.5}" height="5" rx="2.5"/>
        <rect class="${page === "dark" ? "sk-line-d" : "sk-line"}" x="${x + 10}" y="34" width="${w * 0.7}" height="3" rx="1.5"/><rect class="${page === "dark" ? "sk-line-d" : "sk-line"}" x="${x + 10}" y="41" width="${w * 0.55}" height="3" rx="1.5"/>
        <rect class="${dock === "dark" ? "sk-dock-d" : "sk-dock-l"}" x="${x + w - 58}" y="70" width="52" height="16" rx="5"/><rect class="sk-accent" x="${x + w - 54}" y="74" width="8" height="8" rx="2"/><rect class="${dock === "dark" ? "sk-line-d" : "sk-line"} strong" x="${x + w - 42}" y="76" width="30" height="4" rx="2"/>
        <text class="sk-t dim" x="${x + w / 2}" y="110" text-anchor="middle">${esc(labels[i])}</text>`;
    }).join("")}</svg>`;
  }
  function bubble(x, y, v, old, w = 180) {
    return `<rect class="${old ? "sk-soft" : "sk-card"}" x="${x}" y="${y}" width="${w}" height="30" rx="8"/><circle class="sk-thread" cx="${x + 14}" cy="${y + 15}" r="7"/><rect class="sk-line strong" x="${x + 28}" y="${y + 9}" width="${w * 0.38}" height="4" rx="2"/><rect class="sk-line" x="${x + 28}" y="${y + 18}" width="${w * 0.5}" height="3.5" rx="1.75"/>
      <rect class="${old ? "sk-chip-old" : "sk-chip"}" x="${x + w - 30}" y="${y + 8}" width="22" height="14" rx="7"/><text class="sk-t ${old ? "" : "on"}" x="${x + w - 19}" y="${y + 18}" text-anchor="middle">${v}</text>`;
  }
  function comments(list) {
    return `<svg viewBox="0 0 220 120" class="sk" aria-hidden="true">${list.map(([v, old], i) => bubble(20, 6 + i * 37, v, old)).join("")}</svg>`;
  }

  /* ---------- Hero ---------- */
  const total = Q.questions.length;
  $("#h-project").textContent = Q.meta.project;
  $("#h-count").textContent = WORDS[total] || total;
  $("#h-intro").textContent = Q.meta.intro;
  $("#h-facts").innerHTML = [["Asked by", esc(Q.meta.agent)], ["Asked on", esc(new Date(Q.meta.asked).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }))], ["Status", esc(Q.meta.release)]]
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  $("#start-btn").href = "#q-" + Q.questions[0].id;

  /* ---------- Question cards ---------- */
  const list = $("#questions");
  Q.questions.forEach((q, qi) => {
    const sec = document.createElement("section");
    sec.className = "q reveal"; sec.id = "q-" + q.id; sec.dataset.q = q.id;
    sec.setAttribute("aria-labelledby", `qt-${q.id}`);
    const rec = optOf(q, q.recommended);
    sec.innerHTML = `
      <header class="q-head">
        <span class="q-num">${String(qi + 1).padStart(2, "0")}</span>
        <div class="q-titles">
          <h2 id="qt-${esc(q.id)}">${esc(q.title)}</h2>
          <p class="q-context">${esc(q.context)}</p>
          ${q.evidence ? `<span class="tag outline">${esc(q.evidence)}</span>` : ""}
        </div>
        <span class="q-state" data-state="open">Not answered</span>
      </header>
      <div class="opts n${q.options.length}" role="radiogroup" aria-labelledby="qt-${esc(q.id)}">
        ${q.options.map((o, oi) => `
          <button type="button" class="opt" role="radio" aria-checked="false" tabindex="${oi === 0 ? 0 : -1}" data-opt="${esc(o.id)}">
            <span class="opt-visual">${o.code ? `<code class="opt-code">${esc(o.code)}</code>` : SKETCHES[o.sketch] || ""}</span>
            <span class="opt-body">
              <span class="opt-top"><span class="radio" aria-hidden="true"></span><b>${esc(o.label)}</b></span>
              <span class="opt-tags">${o.id === q.recommended ? '<span class="tag accent">Recommended</span>' : ""}<span class="tag outline">Effort ${esc(o.effort || "?")}</span></span>
              <span class="opt-sum">${esc(o.summary)}</span>
              <span class="pc">${(o.pros || []).map((p) => `<span class="pro">${esc(p)}</span>`).join("")}${(o.cons || []).map((c) => `<span class="con">${esc(c)}</span>`).join("")}</span>
            </span>
          </button>`).join("")}
      </div>
      <div class="q-foot">
        <div class="then"><b>What I’ll do</b><span class="then-text"></span></div>
        <label class="note"><span>Note for the agent <em>optional</em></span><textarea rows="2" placeholder="Anything I should know about this choice…"></textarea></label>
        <div class="q-meta"><span class="who" aria-live="polite"></span><span class="spacer"></span><button class="btn ghost clear" type="button" hidden>Clear answer</button><a class="btn ghost next" href="#${qi + 1 < total ? "q-" + Q.questions[qi + 1].id : "summary"}">${qi + 1 < total ? "Next question" : "Review answers"} ↓</a></div>
      </div>`;
    list.appendChild(sec);
    sec.querySelector(".then-text").textContent = `If you keep the default (${rec.label.toLowerCase()}): ${rec.then}`;

    const radios = $$(".opt", sec);
    radios.forEach((b, i) => {
      b.addEventListener("click", () => choose(q, b.dataset.opt));
      b.addEventListener("keydown", (e) => {
        const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!d) return;
        e.preventDefault();
        const next = radios[(i + d + radios.length) % radios.length];
        next.focus(); choose(q, next.dataset.opt);
      });
    });
    const ta = $("textarea", sec);
    let timer;
    ta.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => saveNote(q, ta.value), 700); });
    ta.addEventListener("blur", () => { clearTimeout(timer); if ((answers[q.id]?.value?.note || "") !== ta.value.trim()) saveNote(q, ta.value); });
    $(".clear", sec).addEventListener("click", () => clearAnswer(q));
  });

  $("#jump-list").innerHTML = Q.questions.map((q, i) => `<li><a href="#q-${esc(q.id)}" data-q="${esc(q.id)}"><span class="dot" aria-hidden="true"></span><b>${String(i + 1).padStart(2, "0")}</b><span>${esc(q.title)}</span></a></li>`).join("");

  /* ---------- Saving ---------- */
  const valueFor = (q, choice, note) => {
    const o = choice ? optOf(q, choice) : null;
    return { questionId: q.id, question: q.title, choice: choice || null, choiceLabel: o ? o.label : null, recommended: q.recommended,
      recommendedLabel: optOf(q, q.recommended).label, followsRecommendation: choice ? choice === q.recommended : null, note: (note || "").trim() };
  };
  async function save(q, choice, note) {
    await D.ensureAuthor();
    const sec = $("#q-" + q.id);
    sec.classList.add("saving");
    try { answers[q.id] = await D.set("answer." + q.id, valueFor(q, choice, note)); }
    catch (e) { flash(sec, "Couldn’t save: " + e.message); }
    finally { sec.classList.remove("saving"); paint(); }
  }
  function choose(q, choice) {
    const cur = answers[q.id]?.value;
    if (cur && cur.choice === choice) return;
    const ta = $(`#q-${q.id} textarea`);
    paintQuestion(q, { value: valueFor(q, choice, ta.value), author: D.author(), updatedAt: new Date().toISOString(), pending: true });
    save(q, choice, ta.value);
  }
  function saveNote(q, note) {
    const cur = answers[q.id]?.value;
    if (!cur && !note.trim()) return;
    save(q, cur ? cur.choice : null, note);
  }
  async function clearAnswer(q) {
    try { await D.remove("answer." + q.id); delete answers[q.id]; $(`#q-${q.id} textarea`).value = ""; paint(); }
    catch (e) { flash($("#q-" + q.id), "Couldn’t clear: " + e.message); }
  }
  function flash(sec, msg) { const who = $(".who", sec); who.textContent = msg; who.classList.add("err"); setTimeout(() => who.classList.remove("err"), 4000); }

  $("#accept-all").addEventListener("click", async (e) => {
    const btn = e.currentTarget; btn.disabled = true;
    await D.ensureAuthor();
    const open = Q.questions.filter((q) => !answers[q.id]?.value?.choice);
    for (const q of open) await save(q, q.recommended, $(`#q-${q.id} textarea`).value || "");
    btn.disabled = false;
    $("#accept-note").textContent = open.length ? `Filled ${open.length} question${open.length === 1 ? "" : "s"} with the default. Change any of them below.` : "Every question already had an answer, so nothing changed.";
    document.getElementById("summary").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });

  let confirmFinish = false;
  $("#done-btn").addEventListener("click", async () => {
    const answered = Q.questions.filter((q) => answers[q.id]?.value?.choice);
    const missing = Q.questions.filter((q) => !answers[q.id]?.value?.choice);
    if (missing.length && !confirmFinish) {
      confirmFinish = true;
      $("#done-btn").textContent = `Finish with ${missing.length} unanswered`;
      $("#finish-title").textContent = `${missing.length} question${missing.length === 1 ? " has" : "s have"} no answer`;
      $("#finish-text").textContent = `The agent will treat ${missing.map((q) => "“" + q.title.replace(/\?$/, "") + "”").join(", ")} as open. Press again to finish anyway, or answer ${missing.length === 1 ? "it" : "them"} first.`;
      return;
    }
    await D.ensureAuthor();
    try {
      submitted = await D.set("state.submitted", { at: new Date().toISOString(), author: D.author() || "Anonymous", answered: answered.length, total,
        unanswered: missing.map((q) => q.id), followsRecommendations: answered.filter((q) => answers[q.id].value.choice === q.recommended).length });
      confirmFinish = false;
    } catch (e) { $("#finish-text").textContent = "Couldn’t save: " + e.message; }
    paint();
  });

  /* ---------- Painting ---------- */
  function paintQuestion(q, doc) {
    const sec = $("#q-" + q.id), v = doc && doc.value, choice = v && v.choice;
    $$(".opt", sec).forEach((b) => {
      const on = b.dataset.opt === choice;
      b.setAttribute("aria-checked", String(on));
      b.classList.toggle("on", on);
    });
    if (choice) $$(".opt", sec).forEach((b) => (b.tabIndex = b.dataset.opt === choice ? 0 : -1));
    const ta = $("textarea", sec);
    if (document.activeElement !== ta && v) ta.value = v.note || "";
    const st = $(".q-state", sec);
    st.dataset.state = choice ? (choice === q.recommended ? "default" : "custom") : "open";
    st.textContent = choice ? (choice === q.recommended ? "Default" : "Your choice") : "Not answered";
    const o = choice ? optOf(q, choice) : optOf(q, q.recommended);
    $(".then-text", sec).textContent = choice ? o.then : `If you keep the default (${o.label.toLowerCase()}): ${o.then}`;
    $(".then", sec).classList.toggle("chosen", !!choice);
    const who = $(".who", sec);
    if (!who.classList.contains("err")) {
      if (doc && doc.pending) who.textContent = "Saving…";
      else if (v) who.innerHTML = `${choice ? "Answered" : "Note saved"} by <b>${esc(doc.author || "Anonymous")}</b> · <time datetime="${esc(doc.updatedAt)}">${Kit.ago(doc.updatedAt)}</time>`;
      else who.textContent = "";
    }
    $(".clear", sec).hidden = !v;
  }
  function paint() {
    Q.questions.forEach((q) => paintQuestion(q, answers[q.id]));
    const n = Q.questions.filter((q) => answers[q.id]?.value?.choice).length;
    $("#ring-n").textContent = n;
    $("#ring-of").textContent = `of ${total} answered`;
    $("#ring").setAttribute("aria-label", `${n} of ${total} answered`);
    const C = 2 * Math.PI * 52;
    $("#ring-fill").style.strokeDasharray = `${(n / total) * C} ${C}`;
    $("#ring").classList.toggle("complete", n === total);
    $$("#jump-list a").forEach((a) => {
      const v = answers[a.dataset.q]?.value;
      a.dataset.state = v && v.choice ? (v.choice === byId[a.dataset.q].recommended ? "default" : "custom") : "open";
    });
    $("#summary-body").innerHTML = Q.questions.map((q, i) => {
      const v = answers[q.id]?.value, rec = optOf(q, q.recommended);
      return `<tr data-q="${esc(q.id)}" tabindex="0"><td><span class="num">${String(i + 1).padStart(2, "0")}</span> ${esc(q.title)}</td>
        <td>${v && v.choice ? `<b>${esc(v.choiceLabel)}</b>${v.choice === q.recommended ? ' <span class="tag good">Default</span>' : ' <span class="tag thread">Changed</span>'}` : '<span class="tag warn dot">Not answered</span>'}</td>
        <td class="hide-sm note-cell">${v && v.note ? esc(v.note) : '<span class="faint">—</span>'}</td>
        <td class="muted">${esc(rec.label)}</td></tr>`;
    }).join("");
    const banner = $("#submitted-banner");
    if (submitted && submitted.value) {
      const s = submitted.value;
      banner.hidden = false;
      banner.innerHTML = `<b>Finished</b>${esc(s.author)} pressed “I’m done” ${Kit.ago(s.at)} with ${s.answered} of ${s.total} answered.`;
      if (!confirmFinish) {
        $("#finish-title").textContent = "Sent to the agent";
        $("#finish-text").textContent = `${s.author} finished ${Kit.ago(s.at)}. Later changes are still saved; press again to tell the agent to re-read.`;
        $("#done-btn").textContent = "Mark done again";
      }
    } else {
      banner.hidden = true;
      if (!confirmFinish) $("#done-btn").textContent = "I’m done";
    }
  }
  $("#summary-body").addEventListener("click", (e) => { const tr = e.target.closest("tr[data-q]"); if (tr) location.hash = "q-" + tr.dataset.q; });
  $("#summary-body").addEventListener("keydown", (e) => { const tr = e.target.closest("tr[data-q]"); if (tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); location.hash = "q-" + tr.dataset.q; } });

  // Jump nav: mark the question in view
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) $$("#jump-list a").forEach((a) => a.classList.toggle("cur", "q-" + a.dataset.q === en.target.id));
    }), { rootMargin: "-35% 0px -55% 0px" });
    $$(".q").forEach((s) => io.observe(s));
  }

  /* ---------- Live: answers from anyone, as they are saved ---------- */
  paint();
  Kit.refresh();
  D.watch("answer.", (docs) => {
    const seen = new Set();
    docs.forEach((d) => { const id = d.key.slice(7); if (byId[id]) { answers[id] = d; seen.add(id); } });
    Object.keys(answers).forEach((id) => { if (!seen.has(id)) delete answers[id]; });
    paint();
  }, { interval: 6000 });
  D.watch("state.submitted", (docs) => { submitted = docs.find((d) => d.key === "state.submitted") || null; paint(); }, { interval: 10000 });
  setInterval(paint, 60000); // keep "x min ago" fresh
});
