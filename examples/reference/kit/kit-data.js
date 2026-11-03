/* ==========================================================================
   Reference kit — saved data, comments and answers.
   Load after kit.js:  <script src="kit/kit-data.js" defer></script>

   Pages published on the artifact server save small JSON documents beside the
   artifact (never inside its versions). Agents read them with
     artifact feedback <slug>          readable digest of everything saved
     artifact data list|get|set <slug> raw documents
   and can answer in the same threads with `artifact data append`.

   Key conventions (agents rely on these):
     comments.<anchor>   { items: [{ id, author, role, createdAt, text, resolved? }] }
     answer.<question>   { choice, note }            one per question
     review.<item>       { verdict: approved|changes|question, note }
     state.<name>        anything the page or the agent keeps live
   Reserve a top-level `items` array for threads: `artifact feedback` prints any
   value.items as comments, so name other lists differently (tasks, steps, …).

   API (all async, all return the saved document):
     Kit.data.get(key) · set(key, value, {expectedRevision}) · remove(key)
     Kit.data.update(key, value => next)    merge safely; retries on conflicts
     Kit.data.list(prefix) · append(key, item) · updateItem(key, id, changes)
     Kit.data.watch(prefix, callback, {interval}) → stop()   polls for changes
     Kit.data.mode → "server" | "local" (opened from disk or another host)
     Kit.comments(element, {key, title, placeholder, compact})
     Kit.questions(element, spec)   decisions with options; also [data-questions] (see "Questions" below)
     Kit.steps(element, spec)       a shared checklist (runbook, to-dos); also [data-steps] (see "Steps" below)
     Kit.data.author() / Kit.data.askAuthor() / Kit.data.personKey()
   Markup hooks: [data-save-status] shows save state, [data-author-chip] the name.
   ========================================================================== */
(function () {
  "use strict";
  const Kit = (window.Kit = window.Kit || {});
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };
  const match = /^\/artifacts\/([a-z0-9]+(?:-[a-z0-9]+)*)\//.exec(location.pathname);
  const slug = match ? match[1] : null;
  const base = slug ? `/api/v1/artifacts/${slug}/data` : null;
  const localKey = "kit-data:" + (slug || location.pathname);
  const now = () => new Date().toISOString();
  const rid = () => Math.random().toString(16).slice(2, 14);

  /* ---------- Status broadcasting ---------- */
  let pending = 0, lastError = null, mode = "local";
  const listeners = new Set();
  function emit() {
    const state = lastError ? "error" : pending ? "saving" : mode === "local" ? "local" : "saved";
    listeners.forEach((fn) => fn(state, lastError));
    document.querySelectorAll("[data-save-status]").forEach((el) => {
      el.dataset.state = state;
      el.textContent = { saving: "Saving…", saved: "All changes saved", local: "Saved in this browser only", error: "Couldn’t save — " + (lastError || "try again") }[state];
      el.title = state === "local" ? "This page is not on the artifact server (or it is unreachable), so changes stay in this browser and agents cannot see them." : "";
    });
  }
  async function track(promise) {
    pending++; lastError = null; emit();
    try { return await promise; }
    catch (e) { lastError = e.message || String(e); throw e; }
    finally { pending--; emit(); }
  }

  /* ---------- Transport: server API, or a localStorage mirror with the same shapes ---------- */
  async function http(method, path, body) {
    const res = await fetch(base + path, { method, cache: "no-store", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error((json.error && json.error.message) || "HTTP " + res.status); err.code = json.error && json.error.code; err.status = res.status; throw err; }
    return json;
  }
  const local = {
    all() { return ls.get(localKey) || {}; },
    save(all) { if (!ls.set(localKey, all)) throw new Error("browser storage is unavailable"); },
    write(key, value, extra = {}) {
      const all = this.all(), cur = all[key];
      if (extra.expectedRevision != null && (cur ? cur.revision : 0) !== extra.expectedRevision) { const e = new Error("Changed elsewhere"); e.code = "DATA_CONFLICT"; e.status = 409; throw e; }
      const doc = { key, value, revision: (cur ? cur.revision : 0) + 1, createdAt: cur ? cur.createdAt : now(), updatedAt: now(), author: Data.author(), role: "human" };
      all[key] = doc; this.save(all); return doc;
    },
  };
  const ready = (async () => {
    if (!base || location.protocol === "file:") return "local";
    try { const r = await fetch(base + "?prefix=__probe", { cache: "no-store" }); return r.ok ? "server" : "local"; }
    catch (e) { return "local"; }
  })().then((m) => { mode = m; Data.mode = m; emit(); return m; });

  const Data = {
    slug, mode, ready,
    onStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async list(prefix = "") {
      if ((await ready) === "server") return (await http("GET", prefix ? "?prefix=" + encodeURIComponent(prefix) : "")).documents;
      return Object.values(local.all()).filter((d) => d.key.startsWith(prefix)).sort((a, b) => (a.key < b.key ? -1 : 1));
    },
    async get(key) {
      // Listing by prefix answers "not saved yet" without a 404 in the console.
      if ((await ready) === "server") return (await http("GET", "?prefix=" + encodeURIComponent(key))).documents.find((d) => d.key === key) || null;
      return local.all()[key] || null;
    },
    /* Read-modify-write with retry: update(key, value => next). Safe when several people save the same document. */
    async update(key, fn, attempts = 4) {
      for (let i = 0; ; i++) {
        const cur = await Data.get(key);
        const next = await fn(cur ? structuredClone(cur.value) : undefined, cur);
        try { return await Data.set(key, next, { expectedRevision: cur ? cur.revision : 0 }); }
        catch (e) { if (e.code !== "DATA_CONFLICT" || i >= attempts - 1) throw e; lastError = null; }
      }
    },
    async set(key, value, opts = {}) {
      return track((async () => {
        if ((await ready) === "server") return http("PUT", "/" + encodeURIComponent(key), { value, author: Data.author(), expectedRevision: opts.expectedRevision });
        return local.write(key, value, opts);
      })());
    },
    async remove(key) {
      return track((async () => {
        if ((await ready) === "server") return http("DELETE", "/" + encodeURIComponent(key));
        const all = local.all(); delete all[key]; local.save(all); return { key, deleted: true };
      })());
    },
    async append(key, item) {
      return track((async () => {
        if ((await ready) === "server") return http("POST", "/" + encodeURIComponent(key) + "/items", { item, author: Data.author() });
        const cur = local.all()[key], value = cur && cur.value && typeof cur.value === "object" ? cur.value : {};
        const added = { ...item, id: rid(), author: Data.author(), role: "human", createdAt: now() };
        return { document: local.write(key, { ...value, items: [...(value.items || []), added] }), item: added };
      })());
    },
    async updateItem(key, id, changes) {
      return track((async () => {
        if ((await ready) === "server") return http("PATCH", "/" + encodeURIComponent(key) + "/items/" + encodeURIComponent(id), { changes, author: Data.author() });
        const cur = local.all()[key]; if (!cur) throw new Error("Not found");
        const items = cur.value.items.map((i) => (i.id === id ? { ...i, ...changes, updatedAt: now() } : i));
        return { document: local.write(key, { ...cur.value, items }), item: items.find((i) => i.id === id) };
      })());
    },
    /* Poll a prefix; callback(documents) runs on start and whenever anything changes. */
    watch(prefix, callback, opts = {}) {
      let stopped = false, sig = null, timer = null;
      const interval = opts.interval || 8000;
      const tick = async () => {
        if (stopped) return;
        if (!document.hidden) {
          try {
            const docs = await Data.list(prefix);
            const s = docs.map((d) => d.key + ":" + d.revision).join("|");
            if (s !== sig) { sig = s; callback(docs); }
          } catch (e) { /* keep polling */ }
        }
        timer = setTimeout(tick, interval);
      };
      tick();
      const onVis = () => { if (!document.hidden) { clearTimeout(timer); tick(); } };
      document.addEventListener("visibilitychange", onVis);
      return () => { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); };
    },
    author() { return ls.get("kit-author") || ""; },
    /* Stable per-reader key suffix for one-document-per-person data, e.g. "answer.pick." + personKey(). */
    personKey() {
      const slugged = Data.author().toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
      if (slugged) return slugged;
      let anon = ls.get("kit-anon-id");
      if (!anon) { anon = "anon-" + rid().slice(0, 8); ls.set("kit-anon-id", anon); }
      return anon;
    },
    setAuthor(name) { ls.set("kit-author", String(name || "").trim().slice(0, 80)); paintAuthor(); },
    /* Ask once for a display name; resolves with it (or "" if skipped). */
    askAuthor() {
      return new Promise((resolve) => {
        const dlg = document.createElement("dialog");
        dlg.className = "kit-dialog";
        // "Continue" is the form's only submit button, so Enter saves the name.
        dlg.innerHTML = `<form method="dialog"><h3>Who is commenting?</h3><p>Your name is shown next to what you save, so the agent and others know who said it. It is remembered for every artifact on this server, in this browser.</p><input name="n" autocomplete="name" placeholder="Your name" value="${esc(Data.author())}" required maxlength="80"><div class="row"><button class="btn ghost" type="button" data-skip>Skip</button><span class="spacer"></span><button class="btn primary" value="ok" type="submit">Continue</button></div></form>`;
        document.body.appendChild(dlg);
        dlg.querySelector("[data-skip]").addEventListener("click", () => dlg.close("skip"));
        dlg.addEventListener("close", () => {
          const name = dlg.returnValue === "ok" ? dlg.querySelector("input").value.trim() : "";
          if (name) { Data.setAuthor(name); ls.set("kit-author-skipped", false); }
          else if (dlg.returnValue === "skip") ls.set("kit-author-skipped", true); // Escape just closes; we ask again next time
          dlg.remove(); resolve(name || Data.author());
        });
        dlg.showModal();
        const input = dlg.querySelector("input"); input.focus(); input.select();
      });
    },
    async ensureAuthor() { if (!Data.author() && !ls.get("kit-author-skipped")) await Data.askAuthor(); return Data.author(); },
  };
  Kit.data = Data;

  function paintAuthor() {
    document.querySelectorAll("[data-author-chip]").forEach((el) => {
      const n = Data.author();
      el.innerHTML = n ? `<span class="kit-avatar" aria-hidden="true">${esc(initials(n))}</span>${esc(n)}` : "Set your name";
      el.title = "Change the name shown next to your comments";
      if (!el.dataset.wired) { el.dataset.wired = "1"; el.addEventListener("click", () => Data.askAuthor()); }
    });
  }
  const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
  const ago = (iso) => {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + " min ago"; if (s < 86400) return Math.floor(s / 3600) + " h ago";
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };
  Kit.ago = ago;

  /* ---------- Comment threads ---------- */
  const threads = new Map(); // key -> render fn
  let threadWatch = null;
  function startThreadWatch() {
    if (threadWatch) return;
    threadWatch = Data.watch("comments.", (docs) => {
      const byKey = Object.fromEntries(docs.map((d) => [d.key, d]));
      threads.forEach((renders, key) => renders.forEach((fn) => fn(byKey[key] || null)));
    }, { interval: 10000 });
  }
  Kit.comments = function (host, opts) {
    const key = opts.key.startsWith("comments.") ? opts.key : "comments." + opts.key;
    host.classList.add("kit-thread");
    if (opts.compact) host.classList.add("compact");
    host.innerHTML = `${opts.title ? `<div class="thread-head"><b>${esc(opts.title)}</b><span class="thread-count"></span></div>` : ""}
      <ol class="thread-items" aria-live="polite"></ol>
      <form class="thread-form"><label class="sr-only" for="c-${esc(key)}">Add a comment</label><textarea id="c-${esc(key)}" rows="2" placeholder="${esc(opts.placeholder || "Add a comment for the agent or the team…")}"></textarea>
      <div class="thread-actions"><button class="author-chip" type="button" data-author-chip></button><span class="spacer"></span><span class="hint">Ctrl + Enter</span><button class="btn primary" type="submit">Comment</button></div></form>`;
    const list = host.querySelector(".thread-items"), form = host.querySelector("form"), ta = host.querySelector("textarea"), count = host.querySelector(".thread-count");
    let items = [];
    function render(doc) {
      items = (doc && doc.value && doc.value.items) || [];
      const open = items.filter((i) => !i.resolved).length;
      if (count) count.textContent = items.length ? `${items.length} · ${open} open` : "";
      host.dataset.count = items.length;
      list.innerHTML = items.map((i) => `<li class="${i.role === "agent" ? "agent" : ""} ${i.resolved ? "resolved" : ""}" data-id="${esc(i.id)}">
        <span class="kit-avatar ${i.role === "agent" ? "agent" : ""}" aria-hidden="true">${i.role === "agent" ? "AI" : esc(initials(i.author || "?"))}</span>
        <div><div class="meta"><b>${esc(i.author || (i.role === "agent" ? "Agent" : "Anonymous"))}</b>${i.role === "agent" ? '<span class="tag accent">Agent</span>' : ""}<time datetime="${esc(i.createdAt)}" title="${esc(new Date(i.createdAt).toLocaleString())}">${ago(i.createdAt)}</time>${i.resolved ? '<span class="tag good dot">Resolved</span>' : ""}</div>
        <p>${esc(i.text)}</p><button type="button" class="btn ghost resolve">${i.resolved ? "Reopen" : "Resolve"}</button></div></li>`).join("");
      host.dispatchEvent(new CustomEvent("kit:comments", { bubbles: true, detail: { key, items } }));
    }
    list.addEventListener("click", async (e) => {
      const b = e.target.closest(".resolve"); if (!b) return;
      const id = b.closest("li").dataset.id, item = items.find((i) => i.id === id);
      b.disabled = true;
      try { const r = await Data.updateItem(key, id, { resolved: !item.resolved }); render(r.document); } catch (err) { b.disabled = false; }
    });
    async function submit() {
      const text = ta.value.trim(); if (!text) return;
      await Data.ensureAuthor();
      const btn = form.querySelector("[type=submit]"); btn.disabled = true;
      try { const r = await Data.append(key, { text }); ta.value = ""; render(r.document); }
      catch (err) { /* status line shows the error; keep the text */ }
      finally { btn.disabled = false; }
    }
    form.addEventListener("submit", (e) => { e.preventDefault(); submit(); });
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } });
    if (!threads.has(key)) threads.set(key, []);
    threads.get(key).push(render);
    Data.get(key).then(render).catch(() => render(null));
    paintAuthor();
    startThreadWatch();
    return { key, refresh: () => Data.get(key).then(render) };
  };

  /* ---------- Questions ([data-questions]) ----------
     Several decisions on one page: option cards with trade-offs and a recommended default, a note per
     question, "accept all recommended", a jump list, a summary and "I'm done". Spec (JSON in the attribute,
     data-questions-src="PLAN.questions", or Kit.questions(el, spec)); an array is taken as the questions:
       { questions: [{ id, title, context, evidence, recommended, why, updates: [{ text, author, at, tone }],
                       options: [{ id, label, summary, pros:[], cons:[], effort: "S"|"M"|"L", then,
                                   image: "shots/a.webp" | {src, w, h, alt}, code, lang, html, sketch }] }],
         heading: 2 | 3, nav, toolbar, summary: true | false | "#selector", finish, sketches: {name: "<svg…>"}, agent: "Claude",
         labels: { recommended, keep, changed, open, then, why, acceptAll, done } }
     Notes from the agent on a question: `updates` in the spec (written when the page is republished), and live
     without republishing: artifact data append <slug> comments.q-<id> --item '{"text":"…"}' --author "Claude Code"
     Both show under the question's context, newest last.
     Saves (the format agents read):
       answer.<id>      { questionId, question, choice, choiceLabel, recommended, recommendedLabel, followsRecommendation, note }
       state.submitted  { at, author, answered, total, unanswered: [ids], followsRecommendations }   ("I'm done")
     Returns { acceptAll(), finish(), answers(), el } and fires kit:answers ({answered, total, answers, submitted}) on el. */
  const pad2 = (n) => String(n).padStart(2, "0");
  const qx = (s) => esc(s == null ? "" : s);
  /* Notes from the agent on an item (a question, a step): authored ones from the spec ({text, author, at, tone}
     or a plain string, plus a legacy `advice` string) and live items saved with artifact data append. Newest last;
     older than the latest two fold away; resolved items are hidden. */
  const noteDay = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }); };
  function notesHtml(authored, liveItems, agent) {
    const items = (authored || []).map((u) => (typeof u === "string" ? { text: u } : u)).map((u) => ({ ...u, author: u.author || agent || "Agent", role: u.role || "agent", at: u.at || u.date }))
      .concat((liveItems || []).filter((i) => !i.resolved).map((i) => ({ text: i.text, author: i.author, role: i.role, at: i.createdAt, tone: i.tone })))
      .filter((u) => u.text).sort((a, b) => (a.at && b.at ? new Date(a.at) - new Date(b.at) : 0));
    const card = (u) => `<div class="kit-q-update ${u.role === "agent" ? "agent" : "human"} ${qx(u.tone || "")}"><b>${qx(u.author || "Agent")}${u.at ? ` · ${qx(noteDay(u.at))}` : ""}</b><p>${qx(u.text)}</p></div>`;
    const shown = items.slice(-2), older = items.slice(0, -2);
    return (older.length ? `<details class="kit-q-older"><summary>${older.length} earlier note${older.length === 1 ? "" : "s"}</summary>${older.map(card).join("")}</details>` : "") + shown.map(card).join("");
  }
  function questions(el, spec) {
    spec = Array.isArray(spec) ? { questions: spec } : spec || {};
    const list = (spec.questions || []).filter((q) => q && q.id && Array.isArray(q.options) && q.options.length);
    const L = { recommended: "Recommended", keep: "Default", changed: "Your choice", open: "Not answered", then: "What happens",
      why: "Why the default", acceptAll: "Accept all recommended", done: "I’m done", ...(spec.labels || {}) };
    const H = spec.heading === 2 ? "h2" : "h3", total = list.length;
    const byId = Object.fromEntries(list.map((q) => [q.id, q]));
    const optOf = (q, id) => q.options.find((o) => o.id === id);
    const answers = {}; let submitted = null, confirmFinish = false;
    const choiceOf = (q) => answers[q.id] && answers[q.id].value && answers[q.id].value.choice;
    const nav = spec.nav !== false && total >= 4, finishOn = spec.finish !== false, toolbar = spec.toolbar !== false && list.some((q) => q.recommended);
    const sumHost = spec.summary === false ? null : typeof spec.summary === "string" ? document.querySelector(spec.summary) : el;
    el.classList.add("kit-questions"); el.dataset.wired = "1";
    if (!total) { el.innerHTML = '<p class="muted">No questions.</p>'; return {}; }

    const visual = (q, o) => {
      if (o.image) {
        const im = typeof o.image === "string" ? { src: o.image } : o.image;
        return `<img data-src="${qx(im.src)}" alt="${qx(im.alt || "")}"${+im.w > 0 && +im.h > 0 ? ` width="${Math.round(+im.w)}" height="${Math.round(+im.h)}"` : ""}>`;
      }
      if (o.code) return `<code class="kit-q-code">${o.lang && Kit.highlight ? Kit.highlight(String(o.code), o.lang) : qx(o.code)}</code>`;
      if (o.html) return String(o.html);
      if (o.sketch) return (spec.sketches && spec.sketches[o.sketch]) || "";
      return "";
    };
    const card = (q, qi) => {
      const pics = q.options.map((o) => visual(q, o)), anyPic = pics.some(Boolean), anyThen = q.options.some((o) => o.then);
      const next = qi + 1 < total ? `#q-${qx(list[qi + 1].id)}` : sumHost ? "#q-summary" : "";
      return `<section class="kit-q" id="q-${qx(q.id)}" data-q="${qx(q.id)}" aria-labelledby="qt-${qx(q.id)}">
        <header class="kit-q-head"><span class="kit-q-num">${pad2(qi + 1)}</span>
          <div><${H} id="qt-${qx(q.id)}">${qx(q.title)}</${H}>${q.context ? `<p class="kit-q-context">${qx(q.context)}</p>` : ""}${q.evidence ? `<span class="tag outline">${qx(q.evidence)}</span>` : ""}<div class="kit-q-updates" aria-live="polite"></div></div>
          <span class="kit-q-state" data-state="open">${qx(L.open)}</span></header>
        <div class="kit-q-opts n${q.options.length}" role="radiogroup" aria-labelledby="qt-${qx(q.id)}">${q.options.map((o, oi) => `
          <button type="button" class="kit-q-opt" role="radio" aria-checked="false" tabindex="${oi === 0 ? 0 : -1}" data-opt="${qx(o.id)}">
            ${anyPic ? `<span class="kit-q-visual">${pics[oi]}</span>` : ""}
            <span class="kit-q-body">
              <span class="kit-q-top"><span class="kit-q-radio" aria-hidden="true"></span><b>${qx(o.label)}</b></span>
              ${o.id === q.recommended || o.effort ? `<span class="kit-q-tags">${o.id === q.recommended ? `<span class="tag accent">${qx(L.recommended)}</span>` : ""}${o.effort ? `<span class="tag outline">Effort ${qx(o.effort)}</span>` : ""}</span>` : ""}
              ${o.summary ? `<span class="kit-q-sum">${qx(o.summary)}</span>` : ""}
              ${(o.pros || []).filter(Boolean).length || (o.cons || []).filter(Boolean).length ? `<span class="kit-q-pc">${(o.pros || []).filter(Boolean).map((p) => `<span class="pro">${qx(p)}</span>`).join("")}${(o.cons || []).filter(Boolean).map((c) => `<span class="con">${qx(c)}</span>`).join("")}</span>` : ""}
            </span>
          </button>`).join("")}
        </div>
        <div class="kit-q-foot">
          ${anyThen ? `<div class="kit-q-then"><b>${qx(L.then)}</b><span></span></div>` : q.why ? `<div class="kit-q-then chosen"><b>${qx(L.why)}</b><span>${qx(q.why)}</span></div>` : ""}
          <label class="kit-q-note"><span>Note for the agent <em>optional</em></span><textarea rows="2" placeholder="Anything the agent should know about this choice…"></textarea></label>
          <div class="kit-q-meta"><span class="who" aria-live="polite"></span><span class="spacer"></span><button class="btn ghost" type="button" data-clear hidden>Clear answer</button>${next ? `<a class="btn ghost" href="${next}">${qi + 1 < total ? "Next question" : "Review answers"} ↓</a>` : ""}</div>
        </div></section>`;
    };
    el.innerHTML = (toolbar ? `<div class="kit-q-bar"><div class="kit-q-progress"><span><b data-n>0</b> of ${total} answered</span><span class="meter" aria-hidden="true"><i></i></span></div>
        <button class="btn" type="button" data-accept-all>${qx(L.acceptAll)}</button><p class="kit-q-accept-note muted">Fills only the questions nobody has answered; change any of them afterwards.</p></div>` : "") +
      `<div class="kit-q-layout${nav ? " has-nav" : ""}">${nav ? `<nav class="kit-q-jump" aria-label="Questions"><ol>${list.map((q, i) => `<li><a href="#q-${qx(q.id)}" data-q="${qx(q.id)}"><span class="dot" aria-hidden="true"></span><b>${pad2(i + 1)}</b><span>${qx(q.title)}</span></a></li>`).join("")}</ol>${sumHost ? '<a class="kit-q-jump-sum" href="#q-summary">Review &amp; finish</a>' : ""}</nav>` : ""}
        <div class="kit-q-list">${list.map(card).join("")}</div></div>`;
    let sum = null;
    if (sumHost) {
      sum = document.createElement("div");
      sum.className = "kit-q-summary"; sum.id = "q-summary";
      sum.innerHTML = `<div class="table-wrap"><table class="table kit-q-table"><thead><tr><th>Question</th><th>Answer</th><th class="kit-q-hide-sm">Note</th>${toolbar ? `<th>${qx(L.keep)}</th>` : ""}</tr></thead><tbody></tbody></table></div>` +
        (finishOn ? `<div class="kit-q-finish"><div><b class="kit-q-finish-title">Ready when you are</b><p class="muted kit-q-finish-text">Press “${qx(L.done)}” to tell the agent it can read your answers. You can still change them afterwards.</p></div>
          <div class="row" style="--gap:10px"><button class="author-chip" type="button" data-author-chip></button><button class="btn primary lg" type="button" data-done>${qx(L.done)}</button></div></div>` : "");
      sumHost.appendChild(sum);
    }
    if (Kit.images) Kit.images.wire(el);

    /* Saving */
    const valueFor = (q, choice, note) => {
      const o = choice ? optOf(q, choice) : null, rec = q.recommended ? optOf(q, q.recommended) : null;
      return { questionId: q.id, question: q.title, choice: choice || null, choiceLabel: o ? o.label : null, recommended: q.recommended || null,
        recommendedLabel: rec ? rec.label : null, followsRecommendation: choice && q.recommended ? choice === q.recommended : null, note: (note || "").trim() };
    };
    const secOf = (q) => el.querySelector(`[data-q="${CSS.escape(q.id)}"].kit-q`);
    const flash = (q, msg) => { const who = secOf(q).querySelector(".who"); who.textContent = msg; who.classList.add("err"); setTimeout(() => who.classList.remove("err"), 4000); };
    async function save(q, choice, note) {
      await Data.ensureAuthor();
      const sec = secOf(q); sec.classList.add("saving");
      try { answers[q.id] = await Data.set("answer." + q.id, valueFor(q, choice, note)); }
      catch (e) { flash(q, "Couldn’t save: " + e.message); }
      finally { sec.classList.remove("saving"); paint(); }
    }
    function choose(q, choice) {
      if (choiceOf(q) === choice) return;
      const ta = secOf(q).querySelector("textarea");
      paintQuestion(q, { value: valueFor(q, choice, ta.value), author: Data.author(), updatedAt: now(), pending: true });
      save(q, choice, ta.value);
    }
    list.forEach((q) => {
      const sec = secOf(q), radios = Array.from(sec.querySelectorAll(".kit-q-opt")), ta = sec.querySelector("textarea");
      radios.forEach((b, i) => {
        b.addEventListener("click", () => choose(q, b.dataset.opt));
        b.addEventListener("keydown", (e) => {
          const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
          if (!d) return;
          e.preventDefault();
          const next = radios[(i + d + radios.length) % radios.length]; next.focus(); choose(q, next.dataset.opt);
        });
      });
      let timer;
      const saveNote = () => { const cur = answers[q.id] && answers[q.id].value; if (!cur && !ta.value.trim()) return; save(q, cur ? cur.choice : null, ta.value); };
      ta.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(saveNote, 700); });
      ta.addEventListener("blur", () => { clearTimeout(timer); const cur = answers[q.id] && answers[q.id].value; if (((cur && cur.note) || "") !== ta.value.trim()) saveNote(); });
      sec.querySelector("[data-clear]").addEventListener("click", async () => {
        try { await Data.remove("answer." + q.id); delete answers[q.id]; ta.value = ""; paint(); } catch (e) { flash(q, "Couldn’t clear: " + e.message); }
      });
    });
    async function acceptAll() {
      await Data.ensureAuthor();
      const open = list.filter((q) => q.recommended && !choiceOf(q));
      for (const q of open) await save(q, q.recommended, secOf(q).querySelector("textarea").value || "");
      return open.length;
    }
    const accept = el.querySelector("[data-accept-all]");
    if (accept) accept.addEventListener("click", async () => {
      accept.disabled = true;
      const n = await acceptAll();
      accept.disabled = false;
      el.querySelector(".kit-q-accept-note").textContent = n ? `Filled ${n} question${n === 1 ? "" : "s"} with the recommended option. Change any of them below.` : "Every question already had an answer, so nothing changed.";
    });
    async function finish(force) {
      const missing = list.filter((q) => !choiceOf(q));
      const title = sum && sum.querySelector(".kit-q-finish-title"), text = sum && sum.querySelector(".kit-q-finish-text"), btn = sum && sum.querySelector("[data-done]");
      if (missing.length && !confirmFinish && !force) {
        confirmFinish = true;
        if (btn) { btn.textContent = `Finish with ${missing.length} unanswered`; title.textContent = `${missing.length} question${missing.length === 1 ? " has" : "s have"} no answer`;
          text.textContent = `The agent will treat ${missing.map((q) => "“" + q.title.replace(/\?$/, "") + "”").join(", ")} as open. Press again to finish anyway, or answer ${missing.length === 1 ? "it" : "them"} first.`; }
        return false;
      }
      await Data.ensureAuthor();
      const answered = list.filter((q) => choiceOf(q));
      try {
        submitted = await Data.set("state.submitted", { at: now(), author: Data.author() || "Anonymous", answered: answered.length, total,
          unanswered: missing.map((q) => q.id), followsRecommendations: answered.filter((q) => choiceOf(q) === q.recommended).length });
        confirmFinish = false;
      } catch (e) { if (text) text.textContent = "Couldn’t save: " + e.message; }
      paint();
      return true;
    }
    const doneBtn = sum && sum.querySelector("[data-done]");
    if (doneBtn) doneBtn.addEventListener("click", () => finish());
    if (sum) {
      const go = (e) => { const tr = e.target.closest("tr[data-q]"); if (tr && (e.type === "click" || e.key === "Enter" || e.key === " ")) { e.preventDefault(); location.hash = "q-" + tr.dataset.q; } };
      sum.querySelector("tbody").addEventListener("click", go); sum.querySelector("tbody").addEventListener("keydown", go);
    }

    /* Notes from the agent: authored in the spec, plus live items in comments.q-<id> */
    const live = {}; // questionId -> items saved with artifact data append
    function paintUpdates(q) {
      secOf(q).querySelector(".kit-q-updates").innerHTML = notesHtml((q.updates || []).concat(q.advice ? [{ text: q.advice }] : []), live[q.id], spec.agent);
    }
    list.forEach(paintUpdates);
    Data.watch("comments.q-", (docs) => {
      list.forEach((q) => { const d = docs.find((x) => x.key === "comments.q-" + q.id); live[q.id] = (d && d.value && d.value.items) || []; paintUpdates(q); });
    }, { interval: 10000 });

    /* Painting */
    function paintQuestion(q, doc) {
      const sec = secOf(q), v = doc && doc.value, choice = v && v.choice;
      sec.querySelectorAll(".kit-q-opt").forEach((b) => { const on = b.dataset.opt === choice; b.setAttribute("aria-checked", String(on)); b.classList.toggle("on", on); if (choice) b.tabIndex = on ? 0 : -1; });
      const ta = sec.querySelector("textarea");
      if (document.activeElement !== ta && v) ta.value = v.note || "";
      const st = sec.querySelector(".kit-q-state"), keeps = choice && q.recommended && choice === q.recommended;
      st.dataset.state = choice ? (keeps ? "default" : "custom") : "open";
      st.textContent = choice ? (keeps ? L.keep : L.changed) : L.open;
      const then = sec.querySelector(".kit-q-then span");
      if (then && q.options.some((o) => o.then)) {
        const o = choice ? optOf(q, choice) : q.recommended && optOf(q, q.recommended);
        then.textContent = !o ? "Pick an option to see what happens next." : choice ? o.then || "" : `If you keep the default (${o.label.toLowerCase()}): ${o.then || ""}`;
        then.parentElement.classList.toggle("chosen", !!choice);
      }
      const who = sec.querySelector(".who");
      if (!who.classList.contains("err")) {
        if (doc && doc.pending) who.textContent = "Saving…";
        else if (v) who.innerHTML = `${choice ? "Answered" : "Note saved"} by <b>${qx(doc.author || "Anonymous")}</b> · <time datetime="${qx(doc.updatedAt)}">${ago(doc.updatedAt)}</time>`;
        else who.textContent = "";
      }
      sec.querySelector("[data-clear]").hidden = !v;
    }
    function paint() {
      list.forEach((q) => paintQuestion(q, answers[q.id]));
      const n = list.filter((q) => choiceOf(q)).length;
      const nEl = el.querySelector("[data-n]"); if (nEl) { nEl.textContent = n; el.querySelector(".kit-q-progress .meter i").style.width = (n / total) * 100 + "%"; el.querySelector(".kit-q-progress .meter").classList.toggle("good", n === total); }
      el.querySelectorAll(".kit-q-jump a[data-q]").forEach((a) => { const q = byId[a.dataset.q], c = q && choiceOf(q); a.dataset.state = c ? (c === q.recommended ? "default" : "custom") : "open"; });
      if (sum) {
        sum.querySelector("tbody").innerHTML = list.map((q, i) => {
          const v = answers[q.id] && answers[q.id].value, rec = q.recommended && optOf(q, q.recommended);
          return `<tr data-q="${qx(q.id)}" tabindex="0"><td><span class="num">${pad2(i + 1)}</span> ${qx(q.title)}</td>
            <td>${v && v.choice ? `<b>${qx(v.choiceLabel)}</b>${q.recommended ? (v.choice === q.recommended ? ` <span class="tag good">${qx(L.keep)}</span>` : ` <span class="tag thread">${qx(L.changed)}</span>`) : ""}` : `<span class="tag warn dot">${qx(L.open)}</span>`}</td>
            <td class="kit-q-hide-sm kit-q-notecell">${v && v.note ? qx(v.note) : '<span class="faint">—</span>'}</td>${toolbar ? `<td class="muted">${rec ? qx(rec.label) : "—"}</td>` : ""}</tr>`;
        }).join("");
        const btn = sum.querySelector("[data-done]");
        if (btn && !confirmFinish) {
          const s = submitted && submitted.value;
          btn.textContent = s ? "Mark done again" : L.done;
          sum.querySelector(".kit-q-finish-title").textContent = s ? "Sent to the agent" : "Ready when you are";
          sum.querySelector(".kit-q-finish-text").textContent = s ? `${s.author} finished ${ago(s.at)} with ${s.answered} of ${s.total} answered. Later changes are still saved; press again to tell the agent to re-read.`
            : `Press “${L.done}” to tell the agent it can read your answers. You can still change them afterwards.`;
          sum.querySelector(".kit-q-finish").classList.toggle("sent", !!s);
        }
      }
      el.dispatchEvent(new CustomEvent("kit:answers", { bubbles: true, detail: { answered: n, total, answers: { ...answers }, submitted } }));
    }
    // The jump list marks the question being read.
    if (nav && "IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => entries.forEach((en) => {
        if (en.isIntersecting) el.querySelectorAll(".kit-q-jump a[data-q]").forEach((a) => a.classList.toggle("cur", "q-" + a.dataset.q === en.target.id));
      }), { rootMargin: "-35% 0px -55% 0px" });
      el.querySelectorAll(".kit-q").forEach((s) => io.observe(s));
    }
    paint();
    Data.watch("answer.", (docs) => {
      const seen = new Set();
      docs.forEach((d) => { const id = d.key.slice(7); if (byId[id]) { answers[id] = d; seen.add(id); } });
      Object.keys(answers).forEach((id) => { if (!seen.has(id)) delete answers[id]; });
      paint();
    }, { interval: 6000 });
    if (finishOn) Data.watch("state.submitted", (docs) => { submitted = docs.find((d) => d.key === "state.submitted") || null; paint(); }, { interval: 10000 });
    setInterval(paint, 60000); // keep "x min ago" fresh
    return { el, acceptAll, finish, answers: () => ({ ...answers }), paint };
  }
  Kit.questions = questions;

  /* ---------- Steps ([data-steps]) ----------
     A checklist people work through together: a runbook (phases of steps with commands, what to expect and what
     to do if it fails) or a to-do list for the reader. Everyone sees the same ticks, who ticked and when, and a note
     per step; "Start a new run" archives the run. Spec (JSON in the attribute, data-steps-src="PLAN.steps", or
     Kit.steps(el, spec)); an array is taken as the steps:
       { phases: [{ id, title, summary, steps }] | steps: [{ id, title, why, owner, due, link: {href, label},
                     commands: [], expect, fail: [], updates: [{ text, author, at, tone }] }],
         title, key: "state.checklist", heading: 2 | 3, bar, runs, side: "#selector", history: "#selector", agent,
         labels: { next, newRun, done, step } }
     Keep step ids stable: progress is saved by id. Saves (the format agents read):
       state.checklist           { runId, title, startedAt, startedBy, steps: { <id>: { done, by, at, note, noteBy, noteAt } } }
       state.checklist.<runId>   an archived run (same shape, plus archivedAt, archivedBy)
     Agents add a note on a step live: artifact data append <slug> comments.s-<id> --item '{"text":"…"}' --author "Claude Code".
     Returns { el, next(), paint } and fires kit:steps ({done, total, run}) on el. */
  const STEP_ICON = {
    check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    note: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 12.5V3.5h10v6l-3 3H3z M10 12.5v-3h3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  };
  function steps(el, spec) {
    spec = Array.isArray(spec) ? { steps: spec } : spec || {};
    const phases = (spec.phases || [{ id: "", title: "", steps: spec.steps || [] }]).map((p) => ({ ...p, steps: (p.steps || []).filter((st) => st && st.id) })).filter((p) => p.steps.length);
    const all = phases.flatMap((p) => p.steps.map((st) => ({ ...st, phase: p.id })));
    const KEY = spec.key || "state.checklist", total = all.length, titled = phases.some((p) => p.title);
    const L = { next: "Jump to next step", newRun: "Start a new run", done: "done", allDone: "All steps done ✓", step: "step", ...(spec.labels || {}) };
    const H = spec.heading === 3 ? 3 : titled ? 2 : 3, HS = titled ? Math.min(H + 1, 4) : H;
    el.classList.add("kit-steps"); el.dataset.wired = "1";
    if (!total) { el.innerHTML = '<p class="muted">No steps.</p>'; return {}; }
    const hm = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "");
    const dayYear = (iso) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
    const runIdNow = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`; };
    const runTitle = spec.title || document.title;
    const fresh = () => ({ runId: runIdNow(), title: runTitle, startedAt: now(), startedBy: Data.author() || "", steps: {} });
    const bar = spec.bar !== false, runsOn = spec.runs !== false;

    let n = 0;
    const stepHtml = (st) => { n++; const id = qx(st.id); return `<li class="kit-st" id="s-${id}" data-step="${id}">
        <button class="kit-st-tick" type="button" aria-pressed="false" aria-label="Mark ${qx(L.step)} ${n} done: ${qx(st.title)}"><span class="kit-st-n">${n}</span>${STEP_ICON.check}</button>
        <div class="kit-st-card">
          <div class="kit-st-top"><h${HS} class="kit-st-title">${qx(st.title)}</h${HS}>${st.owner ? `<span class="tag outline">${qx(st.owner)}</span>` : ""}${st.due ? `<span class="tag warn">${qx(st.due)}</span>` : ""}<span class="tag accent kit-st-nexttag">Next</span><span class="spacer"></span><button class="btn ghost kit-st-more" type="button" aria-expanded="false">Show details</button></div>
          <div class="kit-st-body">
            ${st.why ? `<p class="kit-st-why">${qx(st.why)}</p>` : ""}
            ${st.link && st.link.href ? `<p class="kit-st-link"><a href="${qx(st.link.href)}"${/^https?:/.test(st.link.href) ? ' target="_blank" rel="noopener"' : ""}>${qx(st.link.label || st.link.href)} →</a></p>` : ""}
            ${(st.commands || []).map((c) => `<pre class="kit-st-cmd" data-copy${st.lang ? ` data-lang="${qx(st.lang)}"` : ""}>${qx(c)}</pre>`).join("")}
            ${st.expect ? `<div class="kit-st-expect"><span class="eyebrow">Expected</span><pre>${qx(st.expect)}</pre></div>` : ""}
            ${st.fail && st.fail.length ? `<details class="fold kit-st-fail"><summary>If this fails</summary><div class="in"><ul class="dots">${st.fail.map((f) => `<li>${qx(f)}</li>`).join("")}</ul></div></details>` : ""}
          </div>
          <div class="kit-q-updates kit-st-updates" aria-live="polite"></div>
          <div class="kit-st-foot"><span class="kit-st-who mono"></span><span class="spacer"></span><button class="btn ghost kit-st-notebtn" type="button">${STEP_ICON.note}<span>Add note</span></button></div>
          <div class="kit-st-notebox" hidden><label class="sr-only" for="sn-${id}">Note for ${qx(st.title)}</label><textarea id="sn-${id}" rows="2" placeholder="What happened? Output, deviations, links…"></textarea><div class="row" style="--gap:8px"><span class="spacer"></span><button class="btn" type="button" data-note-cancel>Cancel</button><button class="btn primary" type="button" data-note-save>Save note</button></div></div>
          <p class="kit-st-note" hidden></p>
        </div></li>`; };
    el.innerHTML = (bar ? `<div class="kit-st-bar" aria-live="polite"><div class="kit-st-bartop">
          <div class="kit-st-run"><span class="eyebrow">Current run</span><b data-run-title></b><span class="muted" data-run-meta></span></div>
          <div class="kit-st-count"><b data-done>0</b><span>/ ${total} ${qx(L.done)}</span></div>
          <div class="row" style="--gap:8px"><button class="btn" type="button" data-next>${qx(L.next)}</button>${runsOn ? `<button class="btn ghost" type="button" data-new-run>${qx(L.newRun)}</button>` : ""}</div></div>
        <div class="kit-st-progress" role="img"></div><p class="kit-st-last mono"></p></div>` : "") +
      phases.map((p, pi) => (p.title ? `<section class="kit-st-phase" id="p-${qx(p.id || pi + 1)}"><div class="kit-st-phasehead"><span class="big-num">${pi + 1}</span><div>${phases.length > 1 ? `<div class="eyebrow thread">Phase ${pi + 1} of ${phases.length}</div>` : ""}<h${H}>${qx(p.title)}</h${H}>${p.summary ? `<p class="muted">${qx(p.summary)}</p>` : ""}</div><span class="kit-st-phasecount mono" data-phase="${qx(p.id || pi + 1)}"></span></div>` : "") +
        `<ol class="kit-st-list">${p.steps.map(stepHtml).join("")}</ol>` + (p.title ? "</section>" : "")).join("");
    const side = spec.side && document.querySelector(spec.side), history = spec.history && document.querySelector(spec.history);
    if (side) { let k = 0; side.innerHTML = phases.map((p, pi) => (p.title ? `<h5>${pi + 1} · ${qx(p.title)}</h5>` : "") + p.steps.map((st) => { k++; return `<a href="#s-${qx(st.id)}" data-side-step="${qx(st.id)}"><b>${pad2(k)}</b><span>${qx(st.title)}</span><i class="kit-st-check" aria-hidden="true">${STEP_ICON.check}</i></a>`; }).join("")).join(""); }
    const li = (id) => el.querySelector(`.kit-st[data-step="${CSS.escape(id)}"]`);

    /* Progress */
    let doc = null, run = fresh(), archived = [];
    const stateOf = (id) => (run.steps && run.steps[id]) || {};
    function paint() {
      const done = all.filter((st) => stateOf(st.id).done).length, next = all.find((st) => !stateOf(st.id).done);
      if (bar) {
        el.querySelector("[data-run-title]").textContent = run.title || runTitle;
        el.querySelector("[data-run-meta]").textContent = doc ? `Run ${run.runId} · started ${dayYear(run.startedAt)} ${hm(run.startedAt)}${run.startedBy ? " by " + run.startedBy : ""}` : "Not started yet: tick the first step to start.";
        el.querySelector("[data-done]").textContent = done;
        const prog = el.querySelector(".kit-st-progress");
        prog.setAttribute("aria-label", `${done} of ${total} steps done`);
        prog.innerHTML = all.map((st) => `<a href="#s-${qx(st.id)}" class="${stateOf(st.id).done ? "on" : ""} ${next === st ? "nx" : ""}" title="${qx(st.title)}"></a>`).join("");
        const last = all.map((st) => ({ st, s: stateOf(st.id) })).filter((x) => x.s.at).sort((a, b) => (a.s.at < b.s.at ? 1 : -1))[0];
        el.querySelector(".kit-st-last").textContent = last ? `Last change: ${last.s.by || "someone"} ${last.s.done ? "ticked" : "unticked"} “${last.st.title}” · ${ago(last.s.at)}` : done === total ? "" : "Nobody has ticked a step yet.";
        el.querySelector(".kit-st-bar").classList.toggle("complete", done === total);
        const nb = el.querySelector("[data-next]"); nb.textContent = done === total ? L.allDone : L.next; nb.disabled = done === total;
      }
      all.forEach((st) => {
        const item = li(st.id), s = stateOf(st.id);
        item.classList.toggle("done", !!s.done); item.classList.toggle("next", next === st);
        item.querySelector(".kit-st-tick").setAttribute("aria-pressed", String(!!s.done));
        item.querySelector(".kit-st-who").textContent = s.done ? `Done by ${s.by || "someone"} · ${hm(s.at)}` : s.at ? `Unticked by ${s.by || "someone"} · ${hm(s.at)}` : "";
        const nt = item.querySelector(".kit-st-note"); nt.hidden = !s.note;
        if (s.note) nt.innerHTML = `<span class="mono">${qx(s.noteBy || "")}${s.noteAt ? " · " + hm(s.noteAt) : ""}</span>${qx(s.note)}`;
        item.querySelector(".kit-st-notebtn span").textContent = s.note ? "Edit note" : "Add note";
        const sl = side && side.querySelector(`[data-side-step="${CSS.escape(st.id)}"]`);
        if (sl) { sl.classList.toggle("done", !!s.done); sl.classList.toggle("nx", next === st); }
      });
      phases.forEach((p, pi) => { const c = el.querySelector(`[data-phase="${CSS.escape(String(p.id || pi + 1))}"]`); if (c) c.textContent = `${p.steps.filter((st) => stateOf(st.id).done).length} / ${p.steps.length}`; });
      if (history) history.innerHTML = archived.length ? archived.map((a) => {
        const v = a.value || {}, d = Object.values(v.steps || {}).filter((x) => x.done).length;
        return `<li><b>${qx(v.title || "Run")}</b><span class="mono">${qx(v.runId || a.key.slice(KEY.length + 1))}</span><span>${dayYear(v.startedAt)}${v.startedBy ? " · " + qx(v.startedBy) : ""}</span><span class="tag ${d === total ? "good" : "warn"} dot">${d} / ${total} done</span></li>`;
      }).join("") : '<li class="empty">No archived runs yet.</li>';
      el.dispatchEvent(new CustomEvent("kit:steps", { bubbles: true, detail: { done, total, run } }));
    }
    // Merge a change into the latest saved run, retrying when someone else saved in between.
    async function mutate(change) {
      await Data.ensureAuthor();
      for (let attempt = 0; attempt < 4; attempt++) {
        const latest = await Data.get(KEY);
        const value = latest ? JSON.parse(JSON.stringify(latest.value)) : { ...run, startedBy: run.startedBy || Data.author() };
        value.steps = value.steps || {};
        change(value);
        try { doc = await Data.set(KEY, value, { expectedRevision: latest ? latest.revision : 0 }); run = doc.value; paint(); return; }
        catch (e) { if (e.code !== "DATA_CONFLICT") throw e; }
      }
    }
    el.addEventListener("click", async (e) => {
      const item = e.target.closest(".kit-st");
      if (e.target.closest("[data-next]")) return next();
      if (e.target.closest("[data-new-run]")) return newRun(e.target.closest("[data-new-run]"));
      if (!item) return;
      const id = item.dataset.step, t = (sel) => e.target.closest(sel);
      if (t(".kit-st-tick")) {
        const btn = t(".kit-st-tick"), done = btn.getAttribute("aria-pressed") !== "true";
        btn.disabled = true;
        try { await mutate((v) => { v.steps[id] = { ...(v.steps[id] || {}), done, by: Data.author() || "Anonymous", at: now() }; }); if (done) { item.classList.add("just"); setTimeout(() => item.classList.remove("just"), 900); } }
        catch (err) { /* the save status shows the error */ }
        finally { btn.disabled = false; }
      } else if (t(".kit-st-more")) {
        const open = item.classList.toggle("open"); t(".kit-st-more").setAttribute("aria-expanded", String(open)); t(".kit-st-more").textContent = open ? "Hide details" : "Show details";
      } else if (t(".kit-st-notebtn")) {
        const box = item.querySelector(".kit-st-notebox"); box.hidden = !box.hidden;
        if (!box.hidden) { const ta = box.querySelector("textarea"); ta.value = stateOf(id).note || ""; ta.focus(); }
      } else if (t("[data-note-cancel]")) item.querySelector(".kit-st-notebox").hidden = true;
      else if (t("[data-note-save]")) {
        const b = t("[data-note-save]"), text = item.querySelector(".kit-st-notebox textarea").value.trim();
        b.disabled = true;
        try { await mutate((v) => { v.steps[id] = { ...(v.steps[id] || {}), note: text, noteBy: Data.author() || "Anonymous", noteAt: now() }; }); item.querySelector(".kit-st-notebox").hidden = true; }
        finally { b.disabled = false; }
      }
    });
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && e.target.matches(".kit-st-notebox textarea")) e.target.closest(".kit-st-notebox").querySelector("[data-note-save]").click(); });
    function next() {
      const st = all.find((x) => !stateOf(x.id).done); if (!st) return;
      const item = li(st.id);
      item.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      item.querySelector(".kit-st-tick").focus({ preventScroll: true });
    }
    async function newRun(btn) {
      const done = all.filter((st) => stateOf(st.id).done).length;
      if (!doc) { run = fresh(); paint(); return; }
      if (!confirm(`Archive run ${run.runId} (${done} of ${total} done) and start a new, empty run for everyone?`)) return;
      await Data.ensureAuthor();
      btn.disabled = true;
      try {
        await Data.set(`${KEY}.${run.runId}`, { ...run, archivedAt: now(), archivedBy: Data.author() });
        doc = await Data.set(KEY, { ...fresh(), startedBy: Data.author() }, { expectedRevision: doc.revision });
        run = doc.value;
        archived = (await Data.list(KEY + ".")).sort((a, b) => (a.key < b.key ? 1 : -1)); // show the archived run at once
        paint();
      } catch (e) { if (e.code === "DATA_CONFLICT") alert("Someone changed the run just now. Check the page and try again."); }
      finally { btn.disabled = false; }
    }

    /* Notes from the agent per step */
    const live = {};
    const paintNotes = (st) => { li(st.id).querySelector(".kit-st-updates").innerHTML = notesHtml(st.updates, live[st.id], spec.agent); };
    all.forEach(paintNotes);
    Data.watch("comments.s-", (docs) => { all.forEach((st) => { const d = docs.find((x) => x.key === "comments.s-" + st.id); live[st.id] = (d && d.value && d.value.items) || []; paintNotes(st); }); }, { interval: 10000 });

    paint();
    Data.watch(KEY, (docs) => {
      const cur = docs.find((d) => d.key === KEY);
      archived = docs.filter((d) => d.key.startsWith(KEY + ".")).sort((a, b) => (a.key < b.key ? 1 : -1));
      if (cur) { doc = cur; run = cur.value || fresh(); run.steps = run.steps || {}; }
      paint();
    }, { interval: 5000 });
    setInterval(paint, 60000);
    return { el, next, paint };
  }
  Kit.steps = steps;
  function wireQuestions() {
    let added = false;
    [["questions", questions, "These questions"], ["steps", steps, "These steps"]].forEach(([name, fn, what]) => {
      document.querySelectorAll(`[data-${name}], [data-${name}-src]`).forEach((el) => {
        if (el.dataset.wired) return;
        const src = el.getAttribute(`data-${name}-src`), raw = (el.getAttribute(`data-${name}`) || "").trim();
        try {
          const spec = src ? src.split(".").reduce((o, k) => (o ? o[k] : undefined), window) : raw ? JSON.parse(raw) : null;
          if (!spec) throw new Error(`nothing given (data-${name} JSON or data-${name}-src)`);
          fn(el, spec); added = true;
        } catch (e) { el.dataset.wired = "1"; el.innerHTML = `<p class="kit-block-error">${what} could not be shown: ${esc(e.message)}</p>`; console.error(`Kit: ${name} failed`, el, e); }
      });
    });
    if (added && Kit.toc) document.querySelectorAll("[data-toc]").forEach((t) => Kit.toc(t)); // questions and phases can be chapters or their items
    if (added) { if (Kit.wireCode) Kit.wireCode(); if (Kit.wireCopy) Kit.wireCopy(); } // commands in steps: colouring and Copy buttons
  }
  document.addEventListener("kit:ready", wireQuestions);
  const refreshBefore = Kit.refresh;
  Kit.refresh = () => { if (refreshBefore) refreshBefore(); wireQuestions(); };

  document.addEventListener("DOMContentLoaded", () => { paintAuthor(); emit(); });
})();
