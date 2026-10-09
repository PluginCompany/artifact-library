/* ==========================================================================
   ADR content — everything a reader sees that is likely to change lives here.
   index.html holds structure only; app.js renders this object.

   Add an option:     append to `options` (id must be a single capital letter;
                      `short` is the label used in the ranking chart on phones)
                      and add a score for it to every entry in `criteria[].scores`.
   Add a criterion:   append to `criteria` with a default weight (0–5) and a
                      1–5 score for every option id.
   Change the pick:   set `recommended` to an option id. The scoring matrix
                      flags it if the default weights disagree.
   ========================================================================== */
window.ADR = {
  id: "ADR-007",
  title: "How should we model collections in the artifact library?",
  titleAccent: "collections", // word in the title rendered in the accent colour
  status: "Proposed", // Draft | Proposed | Accepted | Rejected | Superseded
  date: "2026-10-09",
  reviewBy: "2026-10-16",
  deciders: ["Platform lead", "Library maintainer", "Agent tooling owner"],
  consulted: ["Workshop leads", "Report authors"],
  related: [
    { label: "catalog.ts — queryCatalog()", href: "#context" },
    { label: "storage.ts — artifact.json layout", href: "#context" },
    { label: "PATCH /api/v1/artifacts/:slug", href: "#context" },
  ],

  tldr: {
    headline: "Start with tags on artifacts, then add curated collections that are built on them.",
    points: [
      "Phase 1 adds an optional <code>tags</code> list to catalog metadata. It is edited like title and description, with no new content version, and the search and list APIs can filter on it.",
      "Phase 2 adds collection files with an ordered list of slugs and an optional tag rule, for pages like this reference set.",
      "Saved searches are rejected: substring search over slug, title and description cannot express membership reliably.",
    ],
  },

  context: {
    problem:
      "The library is one flat list. A reader can search, sort and filter by age, but cannot ask for “the reference set”, “Q3 reports” or “everything for the workshop”. Teams work around it with slug prefixes such as <code>ref-</code>. That grouping is invisible in the UI, cannot be changed after publishing and does not survive a rename of the series.",
    today: [
      { field: "slug", note: "Immutable id, 1–100 lowercase characters. There is no delete route, so references to a slug never dangle." },
      { field: "title, description", note: "Catalog metadata. Edited with PATCH and expectedRevision, without a new content version." },
      { field: "createdAt, updatedAt", note: "Used for the sort orders and the updatedSince filter." },
      { field: "latestVersion, revision", note: "The version counts content snapshots. The revision is the concurrency token for every write." },
    ],
    search:
      "<code>queryCatalog()</code> lowercases the query, splits it into terms, and keeps artifacts whose <code>slug title description</code> contains every term. It runs in memory over <code>storage.list()</code>, with sort and cursor pagination. The cursor is signed with <code>{sort, terms, since}</code>, so a new filter has to be added to that signature.",
  },

  drivers: [
    { title: "Readers find related work in one place", text: "A link should show a stable, ordered set: a reference collection, a project or a quarter." },
    { title: "Agents can group work while publishing", text: "Grouping must be one CLI flag or one API field, with no second request that can be forgotten." },
    { title: "No migration of stored artifacts", text: "Existing <code>artifact.json</code> files must load unchanged. New fields are optional." },
    { title: "Same concurrency model", text: "Every write uses the existing <code>expectedRevision</code> and operation-key semantics." },
  ],

  options: [
    {
      id: "A",
      name: "Free-form tags", short: "Tags",
      summary: "Add <code>tags: string[]</code> to the catalog metadata. Filter with <code>?tag=</code> and show tags as chips.",
      sketch: "tags",
      changes: ["shared.ts — Artifact.tags?", "catalog.ts — tag filter + cursor signature", "app.ts — PATCH accepts tags", "cli.ts — --tag on publish/update/list"],
      pros: ["Smallest change, and old artifacts read as having no tags", "Many-to-many: one artifact can be in several groups", "Fits agents: <code>--tag reference</code> while publishing"],
      cons: ["No order and no page of its own to introduce the set", "Tag sprawl (<code>report</code> vs <code>reports</code>) without a tag list"],
      effort: 1, risk: 1,
    },
    {
      id: "B",
      name: "First-class collections", short: "Collections",
      summary: "A new entity in <code>collections/&lt;id&gt;/collection.json</code>, with a title, a description, an ordered list of slugs and its own revision.",
      sketch: "folders",
      changes: ["storage.ts — new collection store with locks and journal", "app.ts — /api/v1/collections CRUD", "library.ts — collection page and picker", "cli.ts — collection subcommands"],
      pros: ["Curated order and an introduction, so it reads like a table of contents", "A stable URL to share for the whole set", "Slugs are never deleted, so items never dangle"],
      cons: ["A second entity with its own revision and recovery path", "Grouping takes a second command after publishing, which agents will forget"],
      effort: 3, risk: 2,
    },
    {
      id: "C",
      name: "Saved searches", short: "Saved search",
      summary: "A collection is a stored <code>CatalogQuery</code> (<code>q</code>, <code>sort</code>, <code>updatedSince</code>) run by the existing <code>queryCatalog()</code>.",
      sketch: "search",
      changes: ["storage.ts — saved-search records", "library.ts — run a saved query", "No change to artifacts or the search algorithm"],
      pros: ["Reuses the search code unchanged", "Stays current as artifacts are published"],
      cons: ["Substring matching includes false positives: <code>report</code> also matches “reporting guide”", "No manual curation, and membership changes when a title is edited"],
      effort: 2, risk: 2,
    },
    {
      id: "D",
      name: "Tags + curated collections", short: "Hybrid",
      summary: "Ship A first. Then collections hold an ordered list of slugs, a tag rule, or both, so a curated set can also pick up new tagged work.",
      sketch: "hybrid",
      changes: ["Phase 1 = option A", "Phase 2 — collection.json with items[] and tag?", "library.ts — collection page shows pinned items first"],
      pros: ["Each phase is useful on its own and can ship separately", "Curation where it matters, automatic membership everywhere else", "Agents tag while publishing, and people curate later"],
      cons: ["Two concepts for readers to understand", "Needs a clear rule when the order and the tag rule disagree"],
      effort: 2, risk: 1,
    },
  ],

  // Weight 0–5 (how much the criterion matters). Score 1–5 per option (5 = best).
  criteria: [
    { id: "model", name: "Fits the current data model", hint: "Optional fields only, no migration", weight: 3, scores: { A: 5, B: 2, C: 5, D: 4 } },
    { id: "curation", name: "Curation and ordering", hint: "A set with an order and an introduction", weight: 4, scores: { A: 1, B: 5, C: 2, D: 5 } },
    { id: "find", name: "Findability", hint: "Search, filters, browse", weight: 4, scores: { A: 4, B: 3, C: 2, D: 4 } },
    { id: "effort", name: "Low implementation effort", hint: "5 = smallest change", weight: 3, scores: { A: 5, B: 2, C: 4, D: 3 } },
    { id: "safety", name: "Concurrency safety", hint: "Reuses revision and operation keys", weight: 2, scores: { A: 4, B: 3, C: 5, D: 4 } },
    { id: "sprawl", name: "Resists sprawl", hint: "Stays tidy after a year of use", weight: 2, scores: { A: 2, B: 4, C: 3, D: 4 } },
    { id: "agents", name: "Agent and CLI ergonomics", hint: "One flag while publishing", weight: 3, scores: { A: 5, B: 3, C: 3, D: 4 } },
  ],
  recommended: "D",

  consequences: {
    good: [
      "This reference set gets a real page instead of a slug prefix.",
      "The skill can tell agents to use <code>--tag</code> on every publish, so grouping comes for free.",
      "Readers can filter the library by tag from the URL, e.g. <code>/?tag=workshop</code>.",
    ],
    bad: [
      "The cursor signature changes shape, so cursors issued before the deploy fail once with <code>INVALID_CURSOR</code>.",
      "A tag list or an admin view is needed to merge near-duplicate tags.",
    ],
    neutral: [
      "Tags are catalog metadata, not part of a version, so they are not in a snapshot's history.",
      "Collections in phase 2 get their own revision counter, separate from the artifacts they list.",
    ],
  },

  rollout: [
    { phase: "Phase 1", title: "Optional tags on catalog metadata", text: "Add <code>tags?: string[]</code> to <code>Artifact</code>, with slug-style values and at most 10 per artifact. A missing field reads as <code>[]</code>, so no files are rewritten." },
    { phase: "Phase 1", title: "Edit tags like title and description", text: "<code>PATCH /api/v1/artifacts/:slug</code> accepts <code>tags</code> under the same <code>expectedRevision</code> check. <code>publish</code> and <code>update</code> accept <code>--tag</code>." },
    { phase: "Phase 1", title: "Filter and show", text: "<code>queryCatalog()</code> gets a <code>tag</code> parameter that is added to the cursor signature. The library shows tag chips and keeps <code>?tag=</code> in the URL." },
    { phase: "Phase 2", title: "Curated collections", text: "<code>collections/&lt;id&gt;/collection.json</code> holds <code>{title, description, items[], tag?, revision}</code>. Pinned items come first, then other tagged items newest first." },
    { phase: "Phase 3", title: "Retire the prefix workaround", text: "Tag <code>ref-*</code> artifacts as <code>reference</code> and publish a “Reference collection” that pins this set in reading order." },
  ],

  questions: [
    { q: "Should tags be part of a content version, so they appear in history?", owner: "Library maintainer" },
    { q: "Who can merge or rename a tag across all artifacts, and is that one revision bump per artifact?", owner: "Platform lead" },
    { q: "Does a collection page need its own preview image for the library grid?", owner: "Agent tooling owner" },
  ],

  log: [
    { date: "2026-09-28", title: "Drafted", text: "Problem written up after the reference set needed a <code>ref-</code> prefix.", kind: "" },
    { date: "2026-10-02", title: "Options reviewed", text: "Saved searches were scored low after testing <code>q=report</code> against the live catalog.", kind: "" },
    { date: "2026-10-09", title: "Proposed", text: "Recommendation D circulated to deciders with the scoring matrix.", kind: "key" },
    { date: "2026-10-16", title: "Decision review", text: "Accept, amend or reject. Record the outcome here.", kind: "next" },
  ],

  supersede: [
    "Write a new ADR with the next number, link this one from it, and explain what changed.",
    "Set this record's <code>status</code> to <code>Superseded</code> and add the new ADR to <code>related</code>.",
    "Add an entry to the decision log here. Leave the rest of this record unchanged.",
  ],
};
