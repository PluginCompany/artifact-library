/* ==========================================================================
   app.js — renders the report from window.REPORT (data.js).

   Sections
     1. Pages        — the nav order. Add a page here + create its .html file.
     2. Derive       — totals, KPIs and checks computed from data.js
     3. Chrome       — top bar, mobile tabs, pager, footer (built on load)
     4. KPIS         — stat-tile sets:  <div class="stats" data-kpis="summary">
     5. CHARTS       — chart builders:  <div data-chart-id="weeklyTotal">
     6. TABLES       — table builders:  <div data-table-id="mechanics">
     7. Filter       — bench filter:    <div class="seg" data-line-filter>
     8. Render       — wires everything once kit.js is ready

   A builder receives the current filter ({line: "all" | "A" | "B" | "C"})
   and returns plain data, so filtering just calls the builders again.
   Series colours follow fixed slots: a filter never changes which series a
   chart has, only their values, so colours never repaint.
   ========================================================================== */
(function () {
  "use strict";
  const R = window.REPORT;

  /* 1. Pages --------------------------------------------------------------- */
  const PAGES = [
    { id: "summary", href: "index.html", label: "Summary" },
    { id: "throughput", href: "throughput.html", label: "Throughput" },
    { id: "quality", href: "quality.html", label: "Quality" },
    { id: "people", href: "people.html", label: "People" },
    { id: "appendix", href: "appendix.html", label: "Appendix" },
  ];
  const pageId = document.body.dataset.page || "summary";

  /* 2. Derive -------------------------------------------------------------- */
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const n = R.weeks.length;
  const lineIds = R.lines.map((l) => l.id);
  const lineName = (id) => (R.lines.find((l) => l.id === id) || {}).name || id;
  const weekIdx = (w) => R.weeks.indexOf(w);
  const pick = (byLine, line) => (line === "all" ? R.weeks.map((_, i) => sum(lineIds.map((l) => byLine[l][i]))) : byLine[line].slice());
  const reworkWeekly = Object.fromEntries(lineIds.map((l) => [l, R.actual[l].map((a, i) => Math.round((a * (100 - R.fpy[l][i])) / 100))]));
  const monthNames = Object.keys(R.months);
  const monthSum = (weekly, m) => sum(R.months[m].map((w) => weekly[weekIdx(w)]));
  const worked = R.people.scheduledHours.map((s, i) => s - R.people.absenceHours[i]);

  function totals(line = "all") {
    const actual = pick(R.actual, line), plan = pick(R.plan, line), jobs = pick(R.jobs, line), late = pick(R.lateJobs, line), rework = pick(reworkWeekly, line);
    return {
      actual, plan, jobs, late, rework,
      repairs: sum(actual), planned: sum(plan), jobCount: sum(jobs), lateCount: sum(late), reworkCount: sum(rework),
      attainment: (sum(actual) / sum(plan)) * 100,
      fpy: 100 - (sum(rework) / sum(actual)) * 100,
      onTime: ((sum(jobs) - sum(late)) / sum(jobs)) * 100,
      weeklyAttainment: actual.map((a, i) => (a / plan[i]) * 100),
      weeklyFpy: actual.map((a, i) => 100 - (rework[i] / a) * 100),
      weeklyOnTime: jobs.map((j, i) => ((j - late[i]) / j) * 100),
    };
  }
  const T = totals("all");
  const utilisation = (sum(R.people.benchHours) / sum(worked)) * 100;
  const weeklyUtil = R.people.benchHours.map((s, i) => (s / worked[i]) * 100);

  // Consistency checks — edit data.js until the console is quiet.
  (function check() {
    const warn = (m) => console.warn("[data.js] " + m);
    const arrays = { plan: R.plan, actual: R.actual, jobs: R.jobs, lateJobs: R.lateJobs, fpy: R.fpy };
    for (const [k, v] of Object.entries(arrays)) lineIds.forEach((l) => v[l].length !== n && warn(`${k}.${l} has ${v[l].length} values, expected ${n}`));
    lineIds.forEach((l) => monthNames.forEach((m) => {
      const c = sum(R.categoryByMonth[l][m]), a = monthSum(R.actual[l], m);
      if (c !== a) warn(`categoryByMonth.${l}.${m} sums to ${c}, actual repairs are ${a}`);
    }));
    if (sum(R.rework.byCategory) !== T.reworkCount) warn(`rework.byCategory sums to ${sum(R.rework.byCategory)}, derived comebacks are ${T.reworkCount}`);
    const rr = sum(R.rework.reasons.map((r) => r.count));
    if (rr !== T.reworkCount) warn(`rework.reasons sums to ${rr}, derived comebacks are ${T.reworkCount}`);
    lineIds.forEach((l) => { const s = sum(R.mechanics.filter((x) => x.line === l).map((x) => x.repairs)); if (s !== sum(R.actual[l])) warn(`mechanics on ${l} sum to ${s}, the bench completed ${sum(R.actual[l])}`); });
    const ab = sum(R.people.absenceByReason.map((r) => r.hours));
    if (ab !== sum(R.people.absenceHours)) warn(`absenceByReason sums to ${ab}, absenceHours to ${sum(R.people.absenceHours)}`);
  })();

  // Formatting
  const f = {
    int: (v) => Math.round(v).toLocaleString("en-US"),
    pct1: (v) => v.toFixed(1) + "%",
    pct0: (v) => Math.round(v) + "%",
    h: (v) => Math.round(v).toLocaleString("en-US") + " h",
    // Axis-friendly percent: "96%" on round ticks, "96.4%" otherwise
    axisPct: (v) => (Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : v.toFixed(1)) + "%",
    signed: (v, d = 1) => (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(d),
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const P = R.previous;

  /* 3. Chrome -------------------------------------------------------------- */
  const icon = {
    grid: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4zM9.5 9.5h4v4h-4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
    print: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 5.5V2h7v3.5M4.5 11.5h-2V6h11v5.5h-2M4.5 9.5h7V14h-7z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
    down: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v8M4.5 7.5L8 11l3.5-3.5M3 13.5h10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  function buildChrome() {
    const top = document.getElementById("topbar");
    if (top) {
      top.innerHTML = `
        <a class="brand" href="index.html"><i>S</i><span>${esc(R.meta.department)}</span><small>${esc(R.meta.quarter)}</small></a>
        <nav class="topnav" aria-label="Report pages">${PAGES.map((p) => `<a href="${p.href}"${p.id === pageId ? ' aria-current="page"' : ""}>${p.label}</a>`).join("")}</nav>
        <span class="spacer"></span>
        ${R.meta.sample ? '<span class="tag warn dot sample-tag">Sample data</span>' : ""}
        <button class="icon-btn hide-sm" type="button" data-print title="Print or save as PDF" aria-label="Print or save as PDF">${icon.print}</button>
        <a class="icon-btn" href="/artifacts/reference-collection/" title="All reference artifacts">${icon.grid}<span class="hide-sm">Collection</span></a>
        <button class="icon-btn" type="button" data-theme-toggle></button>`;
      top.insertAdjacentHTML("afterend", `<nav class="report-tabs" aria-label="Report pages">${PAGES.map((p, i) => `<a href="${p.href}"${p.id === pageId ? ' aria-current="page"' : ""}><b>${String(i + 1).padStart(2, "0")}</b>${p.label}</a>`).join("")}</nav>`);
    }
    document.querySelectorAll("[data-print]").forEach((b) => b.addEventListener("click", () => window.print()));
    const pager = document.querySelector("[data-pager]");
    if (pager) {
      const i = PAGES.findIndex((p) => p.id === pageId), prev = PAGES[i - 1], next = PAGES[i + 1];
      pager.innerHTML = (prev ? `<a href="${prev.href}"><span>← Previous</span><b>${prev.label}</b></a>` : "") + (next ? `<a class="next" href="${next.href}"><span>Next →</span><b>${next.label}</b></a>` : "");
    }
    const foot = document.querySelector("[data-footer]");
    if (foot) foot.innerHTML = `<div class="row" style="--gap:6px 18px"><span><b>${esc(R.meta.department)} · ${esc(R.meta.title)}</b></span><span>${esc(R.meta.period)}</span><span>Published ${esc(R.meta.published)} by ${esc(R.meta.owner)}</span><span class="spacer"></span><span>${R.meta.sample ? "Sample data for the artifact reference collection · " : ""}source: examples/reference/ref-ops-report</span></div>`;
    document.querySelectorAll("[data-meta]").forEach((el) => { el.textContent = R.meta[el.dataset.meta] ?? ""; });
    document.querySelectorAll("[data-page-no]").forEach((el) => { el.textContent = `${String(PAGES.findIndex((p) => p.id === pageId) + 1).padStart(2, "0")} / ${String(PAGES.length).padStart(2, "0")}`; });
  }

  /* 4. KPIS ---------------------------------------------------------------- */
  // delta: {v: number, unit: "%"|" pt"|"", goodWhen: "up"|"down", vs}
  function deltaHtml(d) {
    if (!d) return "";
    const dir = Math.abs(d.v) < 0.05 ? "flat" : (d.v > 0 ? "up" : "down") + "-" + ((d.v > 0) === (d.goodWhen === "up") ? "good" : "bad");
    const arrow = dir === "flat" ? "▬" : d.v > 0 ? "▲" : "▼";
    const word = dir === "flat" ? "no change" : "";
    return `<span class="delta ${dir}">${arrow} ${word || f.signed(d.v, d.digits ?? 1) + d.unit} <span>vs ${esc(d.vs || P.label)}</span></span>`;
  }
  const KPIS = {
    summary: () => [
      { label: "Repairs completed", value: f.int(T.repairs), delta: { v: ((T.repairs - P.repairs) / P.repairs) * 100, unit: "%", goodWhen: "up" }, spark: T.actual },
      { label: "Plan attainment", value: T.attainment.toFixed(1), unit: "%", delta: { v: T.attainment - P.planAttainment, unit: " pt", goodWhen: "up" }, spark: T.weeklyAttainment },
      { label: "First-time fix", value: T.fpy.toFixed(1), unit: "%", delta: { v: T.fpy - P.fpy, unit: " pt", goodWhen: "up" }, spark: T.weeklyFpy },
      { label: "Ready on time", value: T.onTime.toFixed(1), unit: "%", delta: { v: T.onTime - P.onTime, unit: " pt", goodWhen: "up" }, spark: T.weeklyOnTime },
      { label: "Utilisation", value: utilisation.toFixed(1), unit: "%", delta: { v: utilisation - P.utilisation, unit: " pt", goodWhen: "up" }, spark: weeklyUtil },
      { label: "Bikes at risk at close", value: String(R.lateRiskOpenAtClose), delta: { v: R.lateRiskOpenAtClose - P.lateRiskOpenAtClose, unit: "", digits: 0, goodWhen: "down" }, foot: "Bikes in the workshop forecast to miss their pick-up time" },
    ],
    throughput: (flt) => {
      const t = totals(flt.line);
      return [
        { label: "Repairs completed", value: f.int(t.repairs), note: `${f.int(t.planned)} planned` },
        { label: "Plan attainment", value: t.attainment.toFixed(1), unit: "%", note: t.attainment >= 100 ? "Ahead of plan" : `${f.int(t.planned - t.repairs)} repairs short` },
        { label: "Bikes checked out", value: f.int(t.jobCount), note: `${f.int(t.lateCount)} ready late` },
        { label: "Repairs per bike", value: (t.repairs / t.jobCount).toFixed(1), note: "Average work per visit" },
      ];
    },
    quality: () => {
      const top = R.rework.reasons[0];
      return [
        { label: "First-time fix", value: T.fpy.toFixed(1), unit: "%", delta: { v: T.fpy - P.fpy, unit: " pt", goodWhen: "up" }, spark: T.weeklyFpy },
        { label: "Comebacks", value: f.int(T.reworkCount), note: `${((T.reworkCount / T.repairs) * 100).toFixed(1)}% of repairs` },
        { label: "Top comeback reason", value: Math.round((top.count / T.reworkCount) * 100) + "%", note: top.reason },
        { label: "Incidents", value: String(R.incidents.filter((i) => i.severity === "bad").length), note: `+ ${R.incidents.filter((i) => i.severity !== "bad").length} near miss` },
      ];
    },
    people: () => {
      const sched = sum(R.people.scheduledHours), abs = sum(R.people.absenceHours);
      const cells = Object.values(R.people.coverage).flat();
      return [
        { label: "Hours worked", value: f.int(sum(worked)), unit: "h", note: `of ${f.int(sched)} h scheduled` },
        { label: "Absence rate", value: ((abs / sched) * 100).toFixed(1), unit: "%", note: `${f.int(abs)} h, mostly summer holiday` },
        { label: "Utilisation", value: utilisation.toFixed(1), unit: "%", delta: { v: utilisation - P.utilisation, unit: " pt", goodWhen: "up" }, spark: weeklyUtil },
        { label: "Skill gaps", value: String(cells.filter((c) => c < R.people.coverageTarget).length), note: `of ${cells.length} shift × skill slots below ${R.people.coverageTarget}` },
      ];
    },
  };
  function renderKpis(el, flt) {
    const items = KPIS[el.dataset.kpis](flt);
    el.innerHTML = items.map((k, i) => `<div class="stat"><span class="label">${esc(k.label)}</span><span class="value">${esc(k.value)}${k.unit ? `<small>${esc(k.unit)}</small>` : ""}</span>${k.delta ? deltaHtml(k.delta) : `<span class="delta flat">${esc(k.note || "")}</span>`}${k.spark ? `<div class="spark" data-spark="${i}"></div>` : ""}${k.foot ? `<span class="stat-foot">${esc(k.foot)}</span>` : ""}</div>`).join("");
    items.forEach((k, i) => { if (k.spark) Kit.chart.spark(el.querySelector(`[data-spark="${i}"]`), { values: k.spark }); });
  }

  /* 5. CHARTS -------------------------------------------------------------- */
  // Each entry: (filter) => [kind, spec]. kind is a Kit.chart method.
  const lineSeries = (byLine, map = (v) => v) => R.lines.map((l) => ({ name: l.name, values: byLine[l.id].map(map) }));
  const CHARTS = {
    weeklyTotal: () => ["line", { title: "Weekly repairs vs plan", labels: R.weeks, yMin: 240, xLabel: "Week",
      series: [{ name: "Actual", values: T.actual }, { name: "Plan", values: T.plan }] }],
    weeklyByLine: () => ["line", { title: "Weekly repairs by bench", labels: R.weeks, xLabel: "Week", series: lineSeries(R.actual) }],
    monthlyPlan: (flt) => {
      const t = totals(flt.line);
      return ["column", { title: "Plan vs actual by month", labels: monthNames, xLabel: "Month",
        series: [{ name: "Plan", values: monthNames.map((m) => monthSum(t.plan, m)) }, { name: "Actual", values: monthNames.map((m) => monthSum(t.actual, m)) }] }];
    },
    categoryMix: (flt) => {
      const ls = flt.line === "all" ? lineIds : [flt.line];
      return ["column", { title: "Repairs by category", stacked: true, labels: monthNames, xLabel: "Month",
        series: R.categories.map((c, ci) => ({ name: c, values: monthNames.map((m) => sum(ls.map((l) => R.categoryByMonth[l][m][ci]))) })) }];
    },
    fpyByLine: () => ["line", { title: "First-time-fix rate by bench", labels: R.weeks, yMin: 90, yMax: 100, endLabels: false, format: f.axisPct, xLabel: "Week", series: lineSeries(R.fpy) }],
    reworkReasons: () => ["bar", { title: "Comebacks by reason", labels: R.rework.reasons.map((r) => r.reason), labelWidth: 190, series: [{ name: "Comebacks", values: R.rework.reasons.map((r) => r.count) }] }],
    reworkByCategory: () => {
      const out = R.categories.map((_, ci) => sum(lineIds.flatMap((l) => monthNames.map((m) => R.categoryByMonth[l][m][ci]))));
      return ["column", { title: "Comeback rate by category", labels: R.categories, valueLabels: true, format: f.axisPct, xLabel: "Category",
        series: [{ name: "Comeback rate", values: R.rework.byCategory.map((r, i) => +((r / out[i]) * 100).toFixed(2)) }] }];
    },
    hours: () => ["line", { title: "Hours per week", labels: R.weeks, yMin: 200, format: f.h, xLabel: "Week",
      series: [{ name: "Scheduled", values: R.people.scheduledHours }, { name: "Worked", values: worked }, { name: "On the stand", values: R.people.benchHours }] }],
    utilByShift: () => ["column", { title: "Utilisation by shift", labels: monthNames, yMax: 100, format: f.axisPct, xLabel: "Month",
      series: R.people.shifts.map((s, si) => ({ name: s, values: monthNames.map((m) => R.people.utilisation[m][si]) })) }],
    absence: () => {
      const tot = sum(R.people.absenceByReason.map((r) => r.hours));
      return ["donut", { title: "Absence by reason", labels: R.people.absenceByReason.map((r) => r.reason), values: R.people.absenceByReason.map((r) => r.hours), format: f.h, valueLabel: "Hours", center: { value: f.int(tot), label: "hours absent" } }];
    },
  };
  const chartHandles = new Map();
  function renderChart(el, flt) {
    const [kind, spec] = CHARTS[el.dataset.chartId](flt);
    const h = chartHandles.get(el);
    if (h) h.update(spec);
    else chartHandles.set(el, Kit.chart[kind](el, spec));
  }

  /* 6. TABLES -------------------------------------------------------------- */
  // Each entry: (filter) => {columns:[{key,label,num,fmt,html}], rows:[{}], sort:{key,dir}}
  // Diverging mini-bar centred on plan (±15 pt full scale); the number beside it carries the value
  const devBar = (d) => { const w = Math.min(Math.abs(d), 15) / 15 * 50; return `<span class="dev ${d >= 0 ? "ahead" : "behind"}" aria-hidden="true"><i style="left:${d >= 0 ? 50 : 50 - w}%;width:${w}%"></i></span>`; };
  const statusTag = (s) => s === "top" ? '<span class="tag good dot">Top 3</span>' : s === "bottom" ? '<span class="tag bad dot">Bottom 3</span>' : "";
  const TABLES = {
    mechanics: (flt) => {
      const ranked = R.mechanics.map((s) => ({ ...s, vsPlan: (s.repairs / s.plan) * 100 })).sort((a, b) => b.vsPlan - a.vsPlan);
      ranked.forEach((s, i) => (s.status = i < 3 ? "top" : i >= ranked.length - 3 ? "bottom" : ""));
      return {
        sort: { key: "vsPlan", dir: "desc" },
        rows: ranked.filter((s) => flt.line === "all" || s.line === flt.line),
        columns: [
          { key: "id", label: "Mechanic", html: (r) => `<b>${esc(r.id)}</b>` },
          { key: "type", label: "Speciality", cls: "hide-sm" },
          { key: "line", label: "Bench", fmt: lineName, cls: "hide-sm" },
          { key: "repairs", label: "Repairs", num: true, fmt: f.int, cls: "hide-sm" },
          { key: "plan", label: "Plan", num: true, fmt: f.int, cls: "hide-sm" },
          { key: "vsPlan", label: "vs plan", num: true, html: (r) => `<span class="dev-cell">${devBar(r.vsPlan - 100)}<span class="num">${r.vsPlan.toFixed(1)}%</span></span>` },
          { key: "fpy", label: "First-time fix", num: true, fmt: (v) => v.toFixed(1) + "%" },
          { key: "status", label: "", html: (r) => statusTag(r.status), sortable: false },
        ],
      };
    },
    qcByCategory: () => {
      const out = R.categories.map((_, ci) => sum(lineIds.flatMap((l) => monthNames.map((m) => R.categoryByMonth[l][m][ci]))));
      return {
        rows: R.categories.map((c, i) => ({ cat: c, out: out[i], rw: R.rework.byCategory[i], rate: (R.rework.byCategory[i] / out[i]) * 100, fpy: 100 - (R.rework.byCategory[i] / out[i]) * 100 })),
        columns: [
          { key: "cat", label: "Category" },
          { key: "out", label: "Repairs", num: true, fmt: f.int },
          { key: "rw", label: "Comebacks", num: true, fmt: f.int },
          { key: "rate", label: "Comeback rate", num: true, fmt: f.pct1 },
          { key: "fpy", label: "First-time fix", num: true, fmt: f.pct1 },
        ],
      };
    },
    weeklyFull: () => ({
      sort: { key: "week", dir: "asc" },
      rows: R.weeks.flatMap((w, i) => lineIds.map((l) => ({ week: w, i, line: l, plan: R.plan[l][i], actual: R.actual[l][i], vs: (R.actual[l][i] / R.plan[l][i]) * 100, fpy: R.fpy[l][i], rework: reworkWeekly[l][i], jobs: R.jobs[l][i], late: R.lateJobs[l][i] }))),
      columns: [
        { key: "week", label: "Week", sortKey: (r) => r.i * 10 + lineIds.indexOf(r.line), html: (r) => `<span class="mono">${r.week}</span>${R.notes[r.week] && r.line === lineIds[0] ? ` <span class="tag info" title="${esc(R.notes[r.week])}">note</span>` : ""}` },
        { key: "line", label: "Bench", fmt: lineName },
        { key: "plan", label: "Plan", num: true, fmt: f.int },
        { key: "actual", label: "Actual", num: true, fmt: f.int },
        { key: "vs", label: "vs plan", num: true, fmt: f.pct1 },
        { key: "fpy", label: "First-time fix", num: true, fmt: f.pct1 },
        { key: "rework", label: "Comebacks", num: true, fmt: f.int },
        { key: "jobs", label: "Bikes", num: true, fmt: f.int },
        { key: "late", label: "Late", num: true, fmt: f.int },
      ],
    }),
    hoursFull: () => ({
      rows: R.weeks.map((w, i) => ({ week: w, i, sched: R.people.scheduledHours[i], abs: R.people.absenceHours[i], worked: worked[i], sew: R.people.benchHours[i], util: weeklyUtil[i] })),
      columns: [
        { key: "week", label: "Week", sortKey: (r) => r.i, html: (r) => `<span class="mono">${r.week}</span>` },
        { key: "sched", label: "Scheduled", num: true, fmt: f.h },
        { key: "abs", label: "Absence", num: true, fmt: f.h },
        { key: "worked", label: "Worked", num: true, fmt: f.h },
        { key: "sew", label: "On the stand", num: true, fmt: f.h },
        { key: "util", label: "Utilisation", num: true, fmt: f.pct1 },
      ],
      foot: { week: "Total", sched: sum(R.people.scheduledHours), abs: sum(R.people.absenceHours), worked: sum(worked), sew: sum(R.people.benchHours), util: utilisation },
    }),
  };
  const tableState = new WeakMap();
  function renderTable(el, flt) {
    const def = TABLES[el.dataset.tableId](flt);
    const st = tableState.get(el) || def.sort || null;
    const cols = def.columns;
    const rows = def.rows.slice();
    if (st) {
      const c = cols.find((x) => x.key === st.key);
      const key = (r) => (c && c.sortKey ? c.sortKey(r) : r[st.key]);
      rows.sort((a, b) => { const x = key(a), y = key(b); return (x > y ? 1 : x < y ? -1 : 0) * (st.dir === "asc" ? 1 : -1); });
    }
    const cell = (c, r) => (c.html ? c.html(r) : esc(c.fmt ? c.fmt(r[c.key]) : r[c.key]));
    el.innerHTML = `<div class="table-wrap"><table class="table"><thead><tr>${cols.map((c) => {
      const sortable = c.sortable !== false && c.label;
      const aria = st && st.key === c.key ? ` aria-sort="${st.dir === "asc" ? "ascending" : "descending"}"` : "";
      return `<th class="${c.num ? "num" : ""} ${c.cls || ""}"${sortable ? ` data-sort data-key="${c.key}" tabindex="0"` : ""}${aria}>${esc(c.label)}</th>`;
    }).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td class="${c.num ? "num" : ""} ${c.cls || ""}">${cell(c, r)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${cols.length}" class="muted">No rows for this filter.</td></tr>`}</tbody>${def.foot ? `<tfoot><tr>${cols.map((c) => `<td class="${c.num ? "num" : ""} ${c.cls || ""}">${def.foot[c.key] == null ? "" : typeof def.foot[c.key] === "string" ? esc(def.foot[c.key]) : esc(c.fmt ? c.fmt(def.foot[c.key]) : def.foot[c.key])}</td>`).join("")}</tr></tfoot>` : ""}</table></div>`;
    el.querySelectorAll("th[data-sort]").forEach((th) => {
      const go = () => {
        const key = th.dataset.key;
        const cur = tableState.get(el) || def.sort;
        tableState.set(el, { key, dir: cur && cur.key === key && cur.dir === "asc" ? "desc" : "asc" });
        renderTable(el, flt);
        const again = el.querySelector(`th[data-key="${key}"]`); if (again) again.focus();
      };
      th.addEventListener("click", go);
      th.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
  }

  // Skills coverage heat-table: numbers in every cell, single-hue tint for magnitude
  function renderCoverage(el) {
    const p = R.people, max = Math.max(...Object.values(p.coverage).flat());
    const tint = (v) => Math.round(6 + ((v - 1) / Math.max(max - 1, 1)) * 50); // % of --s1 mixed into the panel
    el.innerHTML = `<div class="table-wrap"><table class="table heat"><caption class="sr-only">Qualified mechanics per shift and skill. Target is ${p.coverageTarget}.</caption><thead><tr><th>Skill</th>${p.shifts.map((s) => `<th class="num">${esc(s)}</th>`).join("")}</tr></thead><tbody>${p.skills.map((sk, si) => `<tr><th scope="row">${esc(sk)}</th>${p.shifts.map((s) => {
      const v = p.coverage[s][si], low = v < p.coverageTarget;
      return `<td class="num${low ? " low" : ""}" style="--t:${tint(v)}%">${v}${low ? '<span class="sr-only"> (below target)</span>' : ""}</td>`;
    }).join("")}</tr>`).join("")}</tbody></table></div>
    <div class="heat-legend"><span>Fewer</span>${[1, 2, 3, 4, 5, 6].map((v) => `<i style="--t:${tint(v)}%">${v}</i>`).join("")}<span>More mechanics</span><span class="spacer"></span><span class="gap-key"><i></i>Below target of ${p.coverageTarget}</span></div>`;
  }

  // Narrative + incidents (summary and quality pages)
  function renderNarrative() {
    document.querySelectorAll("[data-headline]").forEach((el) => (el.innerHTML = R.narrative.headline));
    document.querySelectorAll("[data-lead]").forEach((el) => (el.textContent = R.narrative.lead));
    document.querySelectorAll("[data-takeaways]").forEach((el) => {
      el.innerHTML = R.narrative.takeaways.map((t, i) => `<a class="card takeaway" href="${t.href}"><div class="body"><span class="big-num">${i + 1}</span><h3>${esc(t.title)}</h3><p>${esc(t.body)}</p><span class="foot"><span class="more">Read more →</span></span></div></a>`).join("");
    });
    document.querySelectorAll("[data-incidents]").forEach((el) => {
      el.innerHTML = R.incidents.map((x) => `<article class="incident ${x.severity}"><header><span class="tag ${x.severity} dot">${esc(x.label)}</span><span class="mono muted">${esc(x.week)} · ${x.line === "All" ? "All benches" : esc(lineName(x.line))}</span></header><h3>${esc(x.title)}</h3><p>${esc(x.body)}</p><dl><div><dt>Impact</dt><dd>${esc(x.impact)}</dd></div><div><dt>Fix</dt><dd>${esc(x.action)}</dd></div></dl></article>`).join("");
    });
  }

  /* 7. Filter -------------------------------------------------------------- */
  const flt = { line: "all" };
  try { const m = location.hash.match(/line=([A-Za-z]+)/); if (m && (m[1] === "all" || lineIds.includes(m[1]))) flt.line = m[1]; } catch (e) {}
  function renderFilter(el) {
    const opts = [{ id: "all", label: "All benches" }, ...R.lines.map((l) => ({ id: l.id, label: l.name }))];
    el.setAttribute("role", "group");
    el.setAttribute("aria-label", "Filter by bench");
    el.innerHTML = opts.map((o) => `<button type="button" data-line="${o.id}" aria-pressed="${o.id === flt.line}">${esc(o.label)}</button>`).join("");
    el.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-line]"); if (!b) return;
      flt.line = b.dataset.line;
      el.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      try { history.replaceState(null, "", flt.line === "all" ? location.pathname + location.search : "#line=" + flt.line); } catch (e2) {}
      renderAll(true);
    });
  }

  /* CSV export (appendix) */
  function csv(rows, cols) {
    const q = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return [cols.map((c) => q(c[1])).join(","), ...rows.map((r) => cols.map((c) => q(typeof c[2] === "function" ? c[2](r) : r[c[0]])).join(","))].join("\n");
  }
  const EXPORTS = {
    weekly: () => ["spokewise-q3-2026-weekly-by-bench.csv", csv(TABLES.weeklyFull().rows, [["week", "week"], ["line", "bench"], ["plan", "plan_repairs"], ["actual", "actual_repairs"], ["fpy", "first_time_fix_pct"], ["rework", "comebacks"], ["jobs", "bikes_checked_out"], ["late", "late_bikes"]])],
    mechanics: () => ["spokewise-q3-2026-mechanics.csv", csv(R.mechanics, [["id", "mechanic"], ["line", "bench"], ["type", "speciality"], ["repairs", "repairs"], ["plan", "plan_repairs"], ["fpy", "first_time_fix_pct"]])],
    hours: () => ["spokewise-q3-2026-hours.csv", csv(TABLES.hoursFull().rows, [["week", "week"], ["sched", "scheduled_h"], ["abs", "absence_h"], ["worked", "worked_h"], ["sew", "on_stand_h"], ["util", "utilisation_pct", (r) => r.util.toFixed(2)]])],
    categories: () => ["spokewise-q3-2026-categories.csv", csv(lineIds.flatMap((l) => monthNames.flatMap((m) => R.categories.map((c, ci) => ({ l, m, c, v: R.categoryByMonth[l][m][ci] })))), [["l", "bench"], ["m", "month"], ["c", "category"], ["v", "repairs"]])],
  };
  function wireExports() {
    document.querySelectorAll("[data-export]").forEach((b) => b.addEventListener("click", () => {
      const [name, text] = EXPORTS[b.dataset.export]();
      const url = URL.createObjectURL(new Blob([text + "\n"], { type: "text/csv;charset=utf-8" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }));
  }

  /* 8. Render -------------------------------------------------------------- */
  function renderAll(filterOnly) {
    document.querySelectorAll("[data-kpis]").forEach((el) => (!filterOnly || el.hasAttribute("data-filtered")) && renderKpis(el, flt));
    document.querySelectorAll("[data-chart-id]").forEach((el) => (!filterOnly || el.hasAttribute("data-filtered")) && renderChart(el, flt));
    document.querySelectorAll("[data-table-id]").forEach((el) => (!filterOnly || el.hasAttribute("data-filtered")) && renderTable(el, flt));
    if (filterOnly) {
      const label = flt.line === "all" ? "All benches" : lineName(flt.line);
      document.querySelectorAll("[data-filter-label]").forEach((el) => (el.textContent = label));
    }
  }
  buildChrome();
  let started = false;
  function start() {
    if (started || !window.Kit || !Kit.chart) return;
    started = true;
    renderNarrative();
    document.querySelectorAll("[data-line-filter]").forEach(renderFilter);
    document.querySelectorAll("[data-coverage]").forEach(renderCoverage);
    renderAll(false);
    document.querySelectorAll("[data-filter-label]").forEach((el) => (el.textContent = flt.line === "all" ? "All benches" : lineName(flt.line)));
    wireExports();
  }
  document.addEventListener("kit:ready", start);
  if (document.readyState === "complete") start();
  window.ReportApp = { R, totals, CHARTS, TABLES, KPIS };
})();
