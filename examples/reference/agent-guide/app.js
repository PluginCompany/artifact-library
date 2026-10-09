/* Agent guide — renders window.GUIDE (data.js): picker, checklist, anti-patterns,
   CLI cheat sheet, exit codes, and the feedback thread (comments.guide). */
(function () {
  "use strict";
  const G = window.GUIDE;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const md = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");

  /* ---------- Picker ---------- */
  const kinds = ["All", ...new Set(G.references.map((r) => r.kind))];
  let kind = "All", q = "";
  $("#pick-kinds").innerHTML = kinds.map((k) => `<button class="chip" type="button" aria-pressed="${k === kind}" data-kind="${esc(k)}">${esc(k)}</button>`).join("");
  $("#pick-kinds").addEventListener("click", (e) => {
    const b = e.target.closest("[data-kind]"); if (!b) return;
    kind = b.dataset.kind;
    $$("#pick-kinds [data-kind]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderPick();
  });
  $("#pick-q").addEventListener("input", (e) => { q = e.target.value.trim().toLowerCase(); renderPick(); });
  function renderPick() {
    const words = q.split(/\s+/).filter(Boolean);
    const rows = G.references.filter((r) => (kind === "All" || r.kind === kind) && words.every((w) => [r.job, r.why, r.slug, r.kind, ...r.saves].join(" ").toLowerCase().includes(w)));
    $("#pick-table tbody").innerHTML = rows.map((r) => `<tr>
      <td><span class="tag ${{ Plan: "accent", Progress: "thread", Review: "good", Report: "info", Explain: "", Index: "outline" }[r.kind] || ""}">${esc(r.kind)}</span><b class="job">${esc(r.job)}</b></td>
      <td><a href="/artifacts/${esc(r.slug)}/"><code>${esc(r.slug)}</code></a></td>
      <td>${md(r.why)}</td>
      <td>${r.saves.length ? r.saves.map((s) => `<code class="key">${esc(s)}</code>`).join(" ") : '<span class="faint">—</span>'}</td></tr>`).join("");
    $("#pick-empty").hidden = rows.length > 0;
  }
  renderPick();

  /* ---------- Checklist (remembered per browser) ---------- */
  const KEY = "agent-guide-checklist";
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} };
  let ticks = read();
  function renderChecks() {
    $("#checklist").innerHTML = G.checklist.map((c) => `<li><label><input type="checkbox" data-id="${esc(c.id)}" ${ticks[c.id] ? "checked" : ""}><span>${md(c.text)}</span></label></li>`).join("");
    count();
  }
  function count() {
    const done = G.checklist.filter((c) => ticks[c.id]).length;
    $("#cl-count").textContent = done === G.checklist.length ? "All checks done — ready to share" : `${done} of ${G.checklist.length} checks done`;
    $("#cl-meter").style.setProperty("--v", (100 * done) / G.checklist.length + "%");
    $("#cl-meter").setAttribute("role", "img"); $("#cl-meter").setAttribute("aria-label", `${done} of ${G.checklist.length} checks done`);
  }
  $("#checklist").addEventListener("change", (e) => { const i = e.target.closest("input[data-id]"); if (!i) return; ticks[i.dataset.id] = i.checked; write(ticks); count(); });
  $("#cl-reset").addEventListener("click", () => { ticks = {}; write(ticks); renderChecks(); });
  renderChecks();

  /* ---------- Anti-patterns, exit codes, CLI ---------- */
  $("#anti-list").innerHTML = G.antipatterns.map((a) => `<div class="anti-row"><div class="dont"><span class="tag bad dot">Don't</span><p>${md(a.dont)}</p></div><div class="do"><span class="tag good dot">Instead</span><p>${md(a.instead)}</p></div></div>`).join("");
  $("#exit-codes").innerHTML = G.exitCodes.map(([c, t]) => `<div><dt>Exit ${esc(c)}</dt><dd>${md(t)}</dd></div>`).join("");
  $("#cli-groups").innerHTML = G.cli.map((g) => `<div class="cli-group panel"><h3 class="h3">${esc(g.group)}</h3><dl>${g.rows.map(([cmd, what]) => `<div><dt><pre data-copy>${esc(cmd)}</pre></dt><dd>${md(what)}</dd></div>`).join("")}</dl></div>`).join("");

  /* ---------- Feedback thread ---------- */
  if (Kit.comments) Kit.comments($("#guide-thread"), { key: "guide", title: "Feedback", placeholder: "What should this guide say differently?" });
})();
