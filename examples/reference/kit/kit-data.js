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

  document.addEventListener("DOMContentLoaded", () => { paintAuthor(); emit(); });
})();
