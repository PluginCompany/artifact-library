/* Weekly digest — renders window.DIGEST (data.js, generated) with window.NOTES (notes.js). */
(function () {
  "use strict";
  const D = window.DIGEST, N = window.NOTES;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = (n) => Math.round(n).toLocaleString("en-US");
  const md = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
  const day = (iso, opts) => new Date(iso).toLocaleDateString("en-GB", opts || { weekday: "short", day: "numeric", month: "short" });
  const time = (iso) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const size = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : b >= 1024 ? Math.round(b / 1024) + " KB" : b + " B");
  const start = new Date(D.week.start + "T00:00:00"), end = new Date(D.week.end + "T00:00:00");
  const range = `${start.getDate()}–${end.getDate()} ${end.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`;

  /* ---------- Hero ---------- */
  const weekArtifacts = D.artifacts.filter((a) => a.versionsThisWeek > 0);
  const newArtifacts = D.versions.filter((v) => v.new).length;
  const committedLines = D.commits.reduce((s, c) => s + c.added + c.removed, 0);
  document.title = `Weekly digest · Week ${D.week.number}`;
  $("#b-week").textContent = `Week ${D.week.number}`;
  $("#h-eyebrow").innerHTML = `Weekly digest · Week ${D.week.number} · ${esc(range)} · Artifact Library <span class="tag thread">Example content</span>`;
  $("#h-title").innerHTML = esc(N.headline).replace(/\*([^*]+)\*/, "<em>$1</em>");
  $("#h-summary").textContent = N.summary;
  $("#h-meta").innerHTML = [
    [D.commits.length, D.commits.length === 1 ? "commit" : "commits"],
    [weekArtifacts.length, "artifacts published"],
    [D.versions.length, "versions"],
    [fmt(D.wip.added + D.wip.removed), "lines in progress"],
  ].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("");

  /* ---------- In one minute ---------- */
  const keys = { shipped: "shipped", progress: "progress", blocked: "blocked", next: "next" };
  Object.keys(keys).forEach((k) => {
    const list = N[k] || [];
    const ul = $(`[data-list="${k}"]`);
    ul.closest(".col").querySelector(".n").textContent = list.length;
    ul.innerHTML = list.length ? list.map((i) => `<li><details><summary>${esc(i.text)}</summary><div class="more">${i.detail ? `<span>${md(i.detail)}</span>` : ""}${i.ref ? `<span><code>${esc(i.ref)}</code></span>` : ""}${i.link ? `<a href="${esc(i.link)}">${i.link.startsWith("#") ? "Jump to section" : "Open " + esc(i.link.replace(/^\/artifacts\/|\/.*$/g, "") || "link")} →</a>` : ""}</div></details></li>`).join("") : `<li class="muted" style="padding:6px">Nothing this week.</li>`;
  });

  /* ---------- Numbers ---------- */
  $("#n-sub").innerHTML = `Git <code>${esc(D.repo.branch)}${D.repo.head ? "@" + esc(D.repo.head) : ""}</code> and ${D.server.reachable ? `the server at <code>${esc(D.server.origin.replace(/^https?:\/\//, ""))}</code>` : "no server (it was unreachable when the data was generated)"}.`;
  $("#stats").innerHTML = [
    ["Artifacts on the server", D.artifacts.length, `${newArtifacts} new this week`],
    ["Versions published", D.versions.length, `${D.versions.length - newArtifacts} updates, ${newArtifacts} first versions`],
    ["Commits", D.commits.length, `${fmt(committedLines)} lines changed`],
    ["Uncommitted work", fmt(D.wip.added + D.wip.removed), `lines across ${Object.values(D.wip.areas).reduce((s, a) => s + a.files, 0)} files`],
  ].map(([l, v, d]) => `<div class="stat"><span class="label">${esc(l)}</span><span class="value">${v}</span><span class="delta flat">${esc(d)}</span></div>`).join("");

  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * 864e5));
  const dayKey = (d) => d.toDateString();
  const newPer = days.map((d) => D.versions.filter((v) => v.new && new Date(v.createdAt).toDateString() === dayKey(d)).length);
  const updPer = days.map((d) => D.versions.filter((v) => !v.new && new Date(v.createdAt).toDateString() === dayKey(d)).length);
  Kit.chart.column($("#c-days"), { labels: days.map((d) => d.toLocaleDateString("en-GB", { weekday: "short" })), stacked: true, xLabel: "Day",
    series: [{ name: "First versions", values: newPer }, { name: "Updates", values: updPer }], title: "Publishes per day" });
  const busiest = days.map((d, i) => [d, newPer[i] + updPer[i]]).sort((a, b) => b[1] - a[1])[0];
  $("#c-days-sub").textContent = busiest[1] ? `${busiest[0].toLocaleDateString("en-GB", { weekday: "long" })} was the busiest day with ${busiest[1]} versions.` : "Nothing was published this week.";

  const areaNames = { "(root)": "root" };
  const AREA_ORDER = ["src", "tests", "scripts", "release", "skills", "(root)", "examples"];
  const committedBy = {}, wipBy = {};
  D.commits.forEach((c) => Object.entries(c.areas).forEach(([a, n]) => (committedBy[a] = (committedBy[a] || 0) + n)));
  Object.entries(D.wip.areas).forEach(([a, v]) => (wipBy[a] = v.added + v.removed));
  const areas = AREA_ORDER.filter((a) => committedBy[a] || wipBy[a]);
  Kit.chart.column($("#c-areas"), { labels: areas.map((a) => areaNames[a] || a), stacked: true, xLabel: "Area",
    series: [{ name: "Committed", values: areas.map((a) => committedBy[a] || 0) }, { name: "Uncommitted", values: areas.map((a) => wipBy[a] || 0) }], title: "Lines changed by area" });
  const ref = wipBy["reference artifacts"] || 0;
  $("#c-areas-sub").textContent = ref ? `Leaves out ${fmt(ref)} new lines of reference artifacts so the code areas stay readable.` : "Lines added plus removed.";

  /* ---------- Commits ---------- */
  $("#c-branch").textContent = D.repo.branch;
  const wipFiles = Object.values(D.wip.areas).reduce((s, a) => s + a.files, 0);
  const commitItems = D.commits.map((c) => `<li class="key"><time>${esc(day(c.date, { weekday: "short", day: "numeric" }))}<br>${esc(time(c.date))}</time><span class="pt"></span><div><div class="cm"><h4>${esc(c.subject)}</h4></div><div class="cm">${c.sha ? `<span class="sha">${esc(c.sha)}</span>` : ""}<span class="chg">${c.files} files · <b>+${fmt(c.added)}</b> <i>−${fmt(c.removed)}</i></span>${c.author ? `<span class="chg">${esc(c.author)}</span>` : ""}</div><div class="areas">${Object.entries(c.areas).sort((a, b) => b[1] - a[1]).map(([a, n]) => `<span class="tag outline">${esc(areaNames[a] || a)} · ${fmt(n)}</span>`).join("")}</div></div></li>`);
  const wipItem = wipFiles ? `<li class="wip-item"><time>now</time><span class="pt"></span><div><div class="cm"><h4>Uncommitted work</h4></div><div class="cm"><span class="chg">${wipFiles} files · <b>+${fmt(D.wip.added)}</b> <i>−${fmt(D.wip.removed)}</i></span></div><p>Not on <code>${esc(D.repo.branch)}</code> yet — see the breakdown beside the timeline.</p></div></li>` : "";
  $("#commit-list").innerHTML = (wipItem + commitItems.join("")) || `<li><div><p class="muted">No commits this week.</p></div></li>`;
  const rows = Object.entries(D.wip.areas).sort((a, b) => b[1].added + b[1].removed - (a[1].added + a[1].removed));
  $("#wip").innerHTML = wipFiles ? `<div class="eyebrow accent">In progress</div><h3>Uncommitted work by area</h3><p class="wip-total">${wipFiles} files · +${fmt(D.wip.added)} −${fmt(D.wip.removed)}</p>
    <div class="table-wrap"><table class="table compact"><thead><tr><th>Area</th><th class="num">Files</th><th class="num">New</th><th class="num">+</th><th class="num">−</th></tr></thead><tbody>${rows.map(([a, v]) => `<tr><td>${esc(areaNames[a] || a)}</td><td class="num">${v.files}</td><td class="num">${v.new}</td><td class="num">${fmt(v.added)}</td><td class="num">${fmt(v.removed)}</td></tr>`).join("")}</tbody></table></div>`
    : `<div class="eyebrow">In progress</div><h3>Nothing uncommitted</h3><p class="muted">The working tree was clean when this digest was generated.</p>`;

  /* ---------- Artifacts ---------- */
  let show = "week";
  function renderArtifacts() {
    const list = (show === "week" ? weekArtifacts : D.artifacts).slice().sort((a, b) => b.versionsThisWeek - a.versionsThisWeek || (a.updatedAt < b.updatedAt ? 1 : -1));
    $("#art-table tbody").innerHTML = list.length ? list.map((a) => `<tr><td data-value="${esc(a.title.toLowerCase())}"><a href="${esc(a.url)}">${esc(a.title)}</a><small>${esc(a.slug)}</small></td><td class="num">${a.versionsThisWeek}</td><td class="num" data-value="${a.latestVersion}">v${a.latestVersion}</td><td data-value="${esc(a.updatedAt)}">${esc(day(a.updatedAt))}, ${esc(time(a.updatedAt))}</td><td class="num">${a.files}</td><td class="num" data-value="${a.bytes}">${size(a.bytes)}</td></tr>`).join("")
      : `<tr><td colspan="6" class="muted">${D.server.reachable ? "Nothing was published this week." : "The server was unreachable when this digest was generated."}</td></tr>`;
    $("#art-note").textContent = `${D.artifacts.length} artifacts on the server in total; ${weekArtifacts.length} had a new version this week. Links open the latest version.`;
  }
  $$("[data-show]").forEach((b) => b.addEventListener("click", () => { show = b.dataset.show; $$("[data-show]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); renderArtifacts(); }));
  renderArtifacts();
  const titleOf = Object.fromEntries(D.artifacts.map((a) => [a.slug, a.title]));
  $("#pub-log").innerHTML = D.versions.slice().reverse().map((v) => `<li><time>${esc(day(v.createdAt, { weekday: "short", day: "numeric" }))} ${esc(time(v.createdAt))}</time><div><b><a href="/artifacts/${esc(v.slug)}/_versions/${v.version}/">${esc(titleOf[v.slug] || v.slug)}</a></b> · v${v.version}<br><span>${v.message ? esc(v.message) : v.new ? "First version" : "No message"}</span></div></li>`).join("");

  /* ---------- Questions ---------- */
  Kit.comments($("#q-thread"), { key: "questions", title: "Questions", placeholder: "Ask about anything in this digest…" });

  $("#foot").innerHTML = `Reference artifact · source <code>examples/reference/ref-weekly-digest</code> · generated ${esc(new Date(D.generatedAt).toLocaleString("en-GB"))} from git and ${esc(D.server.origin)} · regenerate with <code>python3 build-data.py --week ${esc(D.week.start)}</code>.`;
})();
