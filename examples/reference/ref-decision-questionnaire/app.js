/* Decision questionnaire — the page around the kit's questions block (Kit.questions in kit/kit-data.js):
   hero with a progress ring, "accept all defaults", and this example's option sketches. The block renders
   window.QUESTIONNAIRE.questions (data.js), saves answer.<questionId> and state.submitted, and draws the
   jump list, the summary table and "I'm done". */
document.addEventListener("kit:ready", () => {
  "use strict";
  const Q = window.QUESTIONNAIRE;
  const { $, esc } = Kit;
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

  /* ---------- Progress ring and "finished" banner follow the block ---------- */
  document.addEventListener("kit:answers", (e) => {
    const { answered: n, submitted } = e.detail, C = 2 * Math.PI * 52;
    $("#ring-n").textContent = n;
    $("#ring-of").textContent = `of ${total} answered`;
    $("#ring").setAttribute("aria-label", `${n} of ${total} answered`);
    $("#ring-fill").style.strokeDasharray = `${(n / total) * C} ${C}`;
    $("#ring").classList.toggle("complete", n === total);
    const banner = $("#submitted-banner"), s = submitted && submitted.value;
    banner.hidden = !s;
    if (s) banner.innerHTML = `<b>Finished</b>${esc(s.author)} pressed “I’m done” ${Kit.ago(s.at)} with ${s.answered} of ${s.total} answered.`;
  });

  /* ---------- The questions ---------- */
  const block = Kit.questions($("#questions"), { questions: Q.questions, heading: 2, toolbar: false, summary: "#summary-slot", sketches: SKETCHES,
    labels: { acceptAll: "Accept all defaults" } });
  $("#accept-all").addEventListener("click", async (e) => {
    const btn = e.currentTarget; btn.disabled = true;
    const n = await block.acceptAll();
    btn.disabled = false;
    $("#accept-note").textContent = n ? `Filled ${n} question${n === 1 ? "" : "s"} with the default. Change any of them below.` : "Every question already had an answer, so nothing changed.";
    document.getElementById("summary").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });
  Kit.refresh();
});
