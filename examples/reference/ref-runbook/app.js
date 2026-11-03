/* Runbook — the page around the kit's steps block (Kit.steps in kit/kit-data.js): header, facts, the seeding
   note and rollback. The block renders window.RUNBOOK.phases (data.js), keeps shared progress in
   state.checklist (archived runs in state.checklist.<runId>), and draws the progress bar, the side menu ticks
   and the run history. */
document.addEventListener("kit:ready", () => {
  "use strict";
  const RB = window.RUNBOOK, { $, esc } = Kit;

  document.title = `Runbook · ${RB.title}`;
  $("#rb-title").innerHTML = esc(RB.title).replace("deploy", "<em>deploy</em>");
  $("#rb-intro").textContent = RB.intro;
  $("#rb-version").textContent = "Version " + RB.version;
  $("#rb-duration").textContent = RB.duration;
  $("#rb-facts").innerHTML = RB.facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
  $("#seeding-text").textContent = RB.seeding;
  $("#rollback-list").innerHTML = RB.rollback.map((r) => `<article class="rb-roll"><h3>${esc(r.title)}</h3>${r.commands.map((c) => `<pre class="cmd" data-copy>${esc(c)}</pre>`).join("")}<p class="muted">${esc(r.note)}</p></article>`).join("");

  Kit.steps($("#steps"), { phases: RB.phases, title: `${RB.title} · ${RB.version}`, side: "#side-steps", history: "#runs" });
  Kit.refresh();
});
