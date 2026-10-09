/* Test & performance report — renders window.REPORT (measure.py). Nothing here is typed in by hand. */
document.addEventListener("kit:ready", () => {
  "use strict";
  const R = window.REPORT;
  const { $, esc } = Kit;
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
  const sec = (v) => (v < 1 ? v.toFixed(2) : v.toFixed(1)) + " s";
  const ms = (v) => (v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString("en-US")) + " ms";
  const mb = (bytes) => bytes / 1e6;
  const parseSize = (s) => { const m = /([\d.]+)\s*([KMG]?B)/i.exec(s || ""); if (!m) return null; return parseFloat(m[1]) * ({ KB: 0.001, MB: 1, GB: 1000, B: 1e-6 }[m[2].toUpperCase()]); };

  /* ---------- Derived numbers ---------- */
  const tests = R.testFiles.flatMap((f) => f.tests.map((t) => ({ ...t, file: f.file })));
  const passed = tests.filter((t) => t.status === "pass").length, failed = tests.length - passed;
  const assertions = R.testFiles.reduce((a, f) => a + f.assertions, 0);
  const image = (R.images || []).find((i) => i.variant !== "slim"), slim = (R.images || []).find((i) => i.variant === "slim");
  const values = {
    suite: R.suiteSeconds, check: R.check.seconds, coldStart: median(R.coldStart),
    publishBig: median(R.publishBig), publishMany: median(R.publishMany),
    dataPutP95: R.data.putP95, dataGetP95: R.data.getP95,
    binary: R.binary.bytes ? mb(R.binary.bytes) : null, image: image ? parseSize(image.size) : null, imageSlim: slim ? parseSize(slim.size) : null,
  };
  const fmt = (v, unit) => (v == null ? "—" : unit === "s" ? (v < 1 ? v.toFixed(2) : v.toFixed(1)) : unit === "ms" ? (v < 10 ? v.toFixed(1) : Math.round(v)) : unit === "MB" ? (v >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1)) : v);
  const board = Object.entries(R.budgets).map(([id, b]) => ({ id, ...b, value: values[id], ok: values[id] != null && values[id] <= b.limit, missing: values[id] == null }));
  const over = board.filter((b) => !b.ok && !b.missing);

  /* ---------- Hero ---------- */
  const when = new Date(R.generatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  $("#h-eyebrow").textContent = `Test & performance · Artifact Library ${R.version}${R.dirty ? " (working tree)" : ""} · measured ${when}`;
  $("#h-title").innerHTML = failed ? `${failed} failing test${failed === 1 ? "" : "s"}, <em>${over.length} budget${over.length === 1 ? "" : "s"} over</em>`
    : over.length ? `All ${tests.length} tests pass; <em>${over.length} budget${over.length === 1 ? "" : "s"} over</em>` : `All ${tests.length} tests pass, <em>every budget met</em>`;
  $("#h-lead").textContent = `Artifact Library ${R.version}, measured on this machine with Node ${R.node}. Publishing a 5 MB file takes ${sec(values.publishBig)}, a data write ${ms(values.dataPutP95)} at the 95th percentile, and the server is ready ${sec(values.coldStart)} after starting.`;
  $("#board").innerHTML = board.map((b) => {
    const ratio = b.value == null ? 0 : Math.min(100, (b.value / b.limit) * 100);
    const word = b.missing ? "Not measured" : b.ok ? "Within budget" : "Over budget";
    return `<div class="budget ${b.ok || b.missing ? "" : "over"}"><span class="label">${esc(b.label)}</span>
      <span class="value">${fmt(b.value, b.unit)}<small>${b.unit}</small></span>
      <div class="meter ${b.ok ? "good" : b.missing ? "" : "bad"}" style="--v:${Math.max(ratio, b.value ? 2 : 0)}%" role="img" aria-label="${ratio.toFixed(0)}% of the ${b.limit} ${b.unit} budget"><i></i></div>
      <div class="foot"><span class="tag ${b.missing ? "" : b.ok ? "good" : "bad"} dot">${word}</span><span class="limit">${b.value == null ? "—" : ratio < 1 ? "<1" : ratio.toFixed(0)}% of ${b.limit.toLocaleString("en-US")} ${b.unit}</span></div></div>`;
  }).join("");

  /* ---------- Tests ---------- */
  $("#tests-sub").textContent = `Each test file runs on its own with the TAP reporter, so durations belong to the right file. ${R.check.ok ? "The type check is clean" : `The type check reports ${R.check.errors} errors`} (${sec(R.check.seconds)}).`;
  $("#test-stats").innerHTML = [
    ["Tests", `${passed}<small>/${tests.length}</small>`, failed ? `<span class="delta up-bad">${failed} failing</span>` : `<span class="delta flat">all passing</span>`],
    ["Test files", R.testFiles.length, `<span class="delta flat">${R.testFiles.filter((f) => f.exit === 0).length} exited cleanly</span>`],
    ["Assertions", assertions.toLocaleString("en-US"), `<span class="delta flat">counted in source</span>`],
    ["Suite time", fmt(R.suiteSeconds, "s") + "<small>s</small>", `<span class="delta flat">including TypeScript start-up</span>`],
  ].map(([l, v, d]) => `<div class="stat"><span class="label">${l}</span><span class="value">${v}</span>${d}</div>`).join("");
  const slow = [...tests].filter((t) => t.ms != null).sort((a, b) => b.ms - a.ms).slice(0, 8);
  const totalMs = tests.reduce((x, t) => x + (t.ms || 0), 0);
  $("#slow-sub").textContent = slow.length ? `The slowest test takes ${sec(slow[0].ms / 1000)}, ${Math.round((slow[0].ms / totalMs) * 100)}% of all test time. Hover a bar for the full name.` : "";
  Kit.chart.bar($("#c-slow"), { title: "Slowest tests", labels: slow.map((t) => t.name), series: [{ name: "Duration", values: slow.map((t) => t.ms) }], format: ms, labelWidth: 210, xLabel: "Test", valueLabel: "Duration" });
  const files = [...R.testFiles].sort((a, b) => b.seconds - a.seconds);
  $("#files-sub").textContent = "Wall-clock time per file, including the TypeScript loader.";
  Kit.chart.bar($("#c-files"), { title: "Time per test file", labels: files.map((f) => f.file.replace("tests/", "")), series: [{ name: "Seconds", values: files.map((f) => f.seconds) }], format: sec, labelWidth: 140, xLabel: "File" });

  const tbody = $("#test-table tbody");
  tbody.innerHTML = tests.map((t) => `<tr data-q="${esc((t.name + " " + t.file).toLowerCase())}"><td>${esc(t.name)}</td><td><code>${esc(t.file.replace("tests/", ""))}</code></td><td data-value="${t.status}"><span class="res ${t.status}">${t.status === "pass" ? "Passed" : "Failed"}</span></td><td class="num" data-value="${t.ms ?? 0}">${t.ms == null ? "—" : ms(t.ms)}</td></tr>`).join("");
  const count = () => { const shown = tbody.querySelectorAll("tr:not([hidden])").length; $("#q-count").textContent = `${shown} of ${tests.length} tests`; };
  $("#q").addEventListener("input", (e) => { const q = e.target.value.trim().toLowerCase(); tbody.querySelectorAll("tr").forEach((tr) => (tr.hidden = q && !tr.dataset.q.includes(q))); count(); });
  count();

  /* ---------- Performance ---------- */
  $("#perf-sub").textContent = `${R.runs} runs each against a throwaway local server (no previews, no seeding), using the CLI ${R.cliVersion} built from this tree. Medians are shown on the budget board.`;
  const runs = R.publishBig.map((_, i) => `Run ${i + 1}`);
  $("#pub-sub").textContent = `Median ${sec(values.publishBig)} for 5 MB and ${sec(values.publishMany)} for 50 files, end to end through the CLI.`;
  Kit.chart.column($("#c-publish"), { title: "Publishing time", labels: runs, series: [{ name: "One 5 MB file", values: R.publishBig }, { name: "50 small files", values: R.publishMany }], format: (v) => v.toFixed(2) + " s", tickFormat: (v) => v.toFixed(2), xLabel: "Run" });
  $("#cold-sub").textContent = `Median ${sec(values.coldStart)} from process start to a healthy /healthz, with an empty data directory.`;
  Kit.chart.column($("#c-cold"), { title: "Server cold start", labels: R.coldStart.map((_, i) => `Run ${i + 1}`), series: [{ name: "Seconds", values: R.coldStart }], format: (v) => v.toFixed(2) + " s", tickFormat: (v) => v.toFixed(1), xLabel: "Run" });
  $("#data-sub").textContent = "Each write replaces one answer document atomically under a per-key lock; reads go straight to disk.";
  $("#data-stats").innerHTML = [["PUT p50", R.data.putP50], ["PUT p95", R.data.putP95], ["GET p50", R.data.getP50], ["GET p95", R.data.getP95]]
    .map(([l, v]) => `<div class="stat"><span class="label">${l}</span><span class="value">${fmt(v, "ms")}<small>ms</small></span></div>`).join("");
  Kit.chart.line($("#c-data"), { title: "Data API latency", labels: R.data.put.map((_, i) => String(i + 1)), series: [{ name: "PUT", values: R.data.put }, { name: "GET", values: R.data.get }], format: (v) => v.toFixed(2) + " ms", tickFormat: (v) => v.toFixed(1), xLabel: "Request", height: 220 });

  /* ---------- Sizes ---------- */
  $("#size-stats").innerHTML = [
    ["CLI binary (Linux x64)", values.binary, "MB", `${esc(R.binary.version || "")} · Node runtime embedded`],
    ["Server image · full", values.image, "MB", image ? `<code>${esc(image.ref.split("/").pop())}</code> · Chromium included for previews` : "No local image"],
    ["Server image · slim", values.imageSlim, "MB", slim ? `<code>${esc(slim.ref.split("/").pop())}</code> · no browser, previews off` : "No local image"],
  ].map(([l, v, u, d]) => `<div class="stat"><span class="label">${l}</span><span class="value">${fmt(v, u)}<small>${u}</small></span><span class="delta flat">${d}</span></div>`).join("");

  /* ---------- Method ---------- */
  $("#method-facts").innerHTML = [
    ["Version", `Artifact Library ${esc(R.version)}${R.dirty ? ", working tree with uncommitted changes in src/ and tests/" : ""}`],
    ["Runtime", `Node ${esc(R.node)}, tsx loader`],
    ["Server", "Throwaway instance on a free port, PREVIEWS=false, SEED=false"],
    ["Publishing", `CLI ${esc(R.cliVersion)} (built from this tree) over HTTP, ${R.runs} runs`],
    ["Data API", "100 PUT + 100 GET on 10 keys, measured from Python"],
    ["Generated", esc(R.generatedAt)],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  $("#caveats").innerHTML = `<b>Read with care</b>One machine, warm disk cache, no network between client and server. Publishing over a real network adds transfer time. Image sizes are the uncompressed local sizes of ${image || slim ? [image, slim].filter(Boolean).map((i) => `<code>${esc(i.ref)}</code>`).join(" and ") : "no local image"}; the registry download is smaller.`;
  $("#foot").innerHTML = `Reference artifact · source <code>examples/reference/ref-test-report</code> · numbers generated by measure.py on ${esc(R.generatedAt)} · built with the reference kit.`;

  Kit.comments($("#thread"), { key: "comments.report", placeholder: "Ask about a number, or suggest a budget…" });
  Kit.refresh();
});
