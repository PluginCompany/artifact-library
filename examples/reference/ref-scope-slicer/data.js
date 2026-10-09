/* ==========================================================================
   SCOPE — candidate work items for the next release, and planning defaults.
   app.js renders the item list, schedules the selection onto people (lanes),
   draws the timeline and saves proposals.

   items[]   { id, title, area, effort (person-days), value 1–5, risk low|medium|high,
               deps: [ids that must ship first], must (in "Must-have only"),
               source (where it came from), why (one sentence) }
   areas[]   { id, label } — colour follows the order (chart slots 1–4)
   capacity  defaults: people, weeks, focus (share of a day spent on planned work)

   Saved data (read with: artifact feedback ref-scope-slicer)
     state.scope.<person>  { name, author, selected:[{id,title,effort}], capacity:{people,weeks,focus,days},
                             totalDays, finishWeek, fits, valuePoints, missingDeps:[…] }
     comments.scope        discussion thread
   ========================================================================== */
window.SCOPE = {
  meta: {
    title: "v0.5 scope slicer",
    release: "Artifact Library 0.5",
    intro: "Fourteen candidate items for the next release, from the implementation review findings, the decision record, the v0.5 questionnaire and reader feedback. Switch items in and out, set how many people and weeks you have, and see what fits. Save your slice as a proposal so the agent can plan from it.",
  },
  capacity: { people: 2, weeks: 3, focus: 0.8, maxPeople: 4, maxWeeks: 8 },
  areas: [
    { id: "ui", label: "Library & toolbar" },
    { id: "org", label: "Search & organising" },
    { id: "data", label: "Saved data" },
    { id: "platform", label: "Platform" },
  ],
  items: [
    { id: "phone-toolbar", title: "Phone toolbar starts collapsed", area: "ui", effort: 2, value: 5, risk: "low", deps: [], must: true, source: "Finding F2",
      why: "The toolbar covers two rows of every artifact opened on a phone." },
    { id: "dark-mode", title: "Dark mode for library and toolbar", area: "ui", effort: 4, value: 3, risk: "low", deps: [], source: "Finding F3",
      why: "A bright dock floats over dark artifacts and the library ignores the system theme." },
    { id: "comment-counts", title: "Open-comment counts on cards and toolbar", area: "ui", effort: 3, value: 3, risk: "low", deps: ["version-chip"], source: "Questionnaire Q4",
      why: "People only find comments by opening the artifact." },
    { id: "fulltext", title: "Full-text search inside artifacts", area: "org", effort: 6, value: 4, risk: "medium", deps: [], source: "Plan deck",
      why: "Search only matches slug, title and description, so “night shift” finds nothing." },
    { id: "tags", title: "Tags on artifacts", area: "org", effort: 4, value: 4, risk: "low", deps: [], source: "ADR-007 phase 1",
      why: "Readers cannot group related artifacts; slug prefixes are the only workaround." },
    { id: "collections", title: "Curated collections", area: "org", effort: 6, value: 3, risk: "medium", deps: ["tags"], source: "ADR-007 phase 2",
      why: "Ordered sets like this reference collection need a home in the library." },
    { id: "version-chip", title: "Mark saved data with its version", area: "data", effort: 2, value: 3, risk: "low", deps: [], must: true, source: "Questionnaire Q5",
      why: "A comment written on version 2 can read oddly next to version 5." },
    { id: "since-last", title: "artifact feedback --since-last", area: "data", effort: 1, value: 4, risk: "low", deps: [], must: true, source: "Agent workflow",
      why: "Agents re-read every comment each time instead of only what is new." },
    { id: "data-export", title: "Export saved data as JSON or CSV", area: "data", effort: 1.5, value: 2, risk: "low", deps: [], source: "Reader request",
      why: "Questionnaire answers end up pasted into spreadsheets by hand." },
    { id: "webhooks", title: "Comment webhooks", area: "data", effort: 5, value: 3, risk: "high", deps: ["comment-counts"], source: "Questionnaire Q4",
      why: "Lets a chat channel or an agent runner react to new comments right away." },
    { id: "preview-cache", title: "Versioned preview URLs, cached for good", area: "platform", effort: 1, value: 3, risk: "low", deps: [], must: true, source: "Questionnaire Q3",
      why: "Every library visit re-requests every preview image." },
    { id: "proxy-guide", title: "Guide: sign-in proxy in front of the server", area: "platform", effort: 1, value: 3, risk: "low", deps: [], source: "Questionnaire Q6",
      why: "Reads are open to anyone who can reach the server; teams on the internet need a tested way to put sign-in in front." },
    { id: "read-token", title: "Optional read token with a sign-in page", area: "platform", effort: 4, value: 2, risk: "medium", deps: ["proxy-guide"], source: "Questionnaire Q6",
      why: "Protects reads without running a proxy; the guide comes first so the simpler path is documented." },
    { id: "s3-storage", title: "S3-compatible storage for versions", area: "platform", effort: 8, value: 2, risk: "high", deps: [], source: "Self-hosting feedback",
      why: "Lets a server keep snapshots in object storage instead of one local volume." },
  ],
  presets: [
    { id: "must", label: "Must-have only", pick: (items) => items.filter((i) => i.must).map((i) => i.id) },
    { id: "quick", label: "Quick wins", pick: (items) => items.filter((i) => i.effort <= 2 && i.value >= 3).map((i) => i.id) },
    { id: "all", label: "Everything", pick: (items) => items.map((i) => i.id) },
    { id: "none", label: "Clear", pick: () => [] },
  ],
};
