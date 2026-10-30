# Saved data: answers, comments and verdicts

Artifacts are static files, but readers can still answer on them. Each artifact has a small store of JSON documents that lives **beside** its versions, so feedback survives new versions and never changes a snapshot. Pages write it from the browser; agents read and answer it with the CLI or the MCP server.

```text
agent publishes ─▶ reader answers / comments / approves on the page ─▶ saved beside the artifact
       ▲                                                                        │
       └──────── artifact feedback · artifact data append (reply) ◀────────────┘
```

## Conventions

Agents rely on these key prefixes; keep them.

| Key | Value | Typical writer |
|---|---|---|
| `comments.<anchor>` | `{ items: [{ id, author, role, createdAt, text, resolved }] }` | `Kit.comments`, `artifact data append` |
| `answer.<question>` | `{ questionId, question, choice, choiceLabel, note }` | questionnaires, picks |
| `review.<item>` | `{ verdict: "approved" \| "changes" \| "question", note }` | review pages |
| `state.<name>` | anything | live pages (run logs, checklists) and agents |
| `state.sent`, `state.submitted` | `{ at, author, … }` | the toolbar's "Send to agent", a page's "I'm done": they send held changes |

## When answers reach the agent

Every save is stored at once, and agents can always read it with `artifact feedback`. What readers control is when a **waiting** agent (`artifact wait`, MCP `wait_for_feedback`) is told:

- **Instant sync on** (the default): each save is sent at once.
- **Instant sync off**: saves are *held*. The toolbar shows "N changes not sent" with a **Send to agent** button, which writes `state.sent` `{at, author, changes}` and sends everything. A page's own "I'm done" (`state.submitted`, as in `ref-decision-questionnaire`) sends too. Turning instant sync back on sends what is still held.

The switch is in the toolbar's ⋯ menu on every artifact. It is one setting per browser for the whole server (the `artifact_sync` cookie), so it covers every artifact, including ones published before this existed, without changes to their pages. Held documents carry `held: true`; `artifact feedback` marks them "not sent yet" until the next send. Pages published with `--no-toolbar` have no Send button, so readers who hold changes send them from another artifact's toolbar or with the page's own "I'm done".

Store readable labels next to ids so `artifact feedback` makes sense without the page. Use a top-level `items` array only for threads: `artifact feedback` prints any `value.items` as comments.

## In a page: `kit-data.js`

Load it after the kit (`kit/kit.css`, `kit/kit.js`, then `kit/kit-data.js`, all `defer`). On the server it saves through the API; opened from disk it falls back to browser storage and `[data-save-status]` says so.

```html
<span data-save-status></span>        <!-- "All changes saved", "Saving…", "Saved in this browser only" -->
<div id="thread"></div>
<script>
document.addEventListener("kit:ready", async () => {
  Kit.comments(document.getElementById("thread"), { key: "finding-F2", title: "Discussion" });   // → comments.finding-F2
  await Kit.data.set("answer.toolbar", { questionId: "toolbar", question: "How should the toolbar behave on phones?",
                                         choice: "pill", choiceLabel: "Start collapsed", note: "" });
  Kit.data.watch("state.", (docs) => render(docs));                                               // live updates
});
</script>
```

| Call | Does |
|---|---|
| `Kit.data.get(key)` / `set(key, value, {expectedRevision})` / `remove(key)` | One document |
| `Kit.data.update(key, value => next)` | Read-modify-write that retries on conflicts |
| `Kit.data.list(prefix)` | Documents with a prefix |
| `Kit.data.append(key, item)` / `updateItem(key, id, changes)` | Threads, atomically on the server |
| `Kit.data.watch(prefix, callback, {interval})` | Poll for changes; returns `stop()` |
| `Kit.comments(element, {key, title, placeholder, compact})` | A complete comment thread with resolve/reopen |
| `Kit.data.author()` / `askAuthor()` / `personKey()` | The reader's name (asked once, remembered per server in the browser) and a stable per-person key suffix |

## From an agent

```bash
artifact feedback q3-review --since 2h
artifact wait q3-review                    # returns when a reader sends something (agent writes don't count)
artifact data append q3-review comments.finding-F2 --author "Claude Code" --item '{"text":"Fixed in version 4."}'
artifact data update-item q3-review comments.finding-F2 <id> --changes '{"resolved":true}'
artifact data set release-run state.run --file run.json   # a live page picks it up within seconds
```

Over MCP the same operations are the `feedback`, `wait_for_feedback`, `data_get`, `data_set`, `data_append` and `data_update_item` tools.

## Rules and limits

- Keys: 1–128 letters, digits, `.`, `_`, `-`, starting with a letter or digit.
- 256 KiB per document, 500 documents per artifact, 1,000 items per thread.
- `PUT` with `expectedRevision` fails with `DATA_CONFLICT` if someone saved in between (`0` = must not exist). Appends and item updates are atomic on the server.
- Saved data is **open to readers by design**, also when the server has a write token, so anyone who can open a page can answer on it. A page served from one artifact cannot write another artifact's data (`CROSS_ARTIFACT_WRITE`). Archived artifacts refuse writes.
- Saved data is part of the data volume; back it up with the rest. Purging an artifact deletes it.
