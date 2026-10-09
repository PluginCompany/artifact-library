/* The collection catalogue. One entry per artifact, in display order.
   slug       — artifact slug on the server (live title, version and preview come from the API;
                entries whose slug is not on this server are hidden)
   phase      — filter chip and job-picker group: Plan · Build · Review · Report · Explain
   category   — the label on the card
   job        — the "I need to…" sentence used in the picker
   shows      — what this example demonstrates (3 short items)
   saves      — true when readers can answer, comment or approve on the page
   source     — "kit" for artifacts built with examples/reference/kit, "mirror" for copies of external artifacts
   To add an artifact: publish it, append an entry here and republish this hub. */
window.COLLECTION = [
  { slug: "agent-guide", phase: "Explain", category: "Guide", title: "Artifact guide for agents", source: "kit",
    description: "How agents should plan, build, verify, publish and follow up on artifacts on this server.",
    job: "learn how to make a great artifact", shows: ["Workflow from search to feedback", "Kit and saving conventions", "Quality checklist and CLI cheat sheet"] },

  { slug: "ref-plan-deck", phase: "Plan", category: "Presentation", title: "Artifact Library v0.5 plan", source: "kit",
    description: "A keyboard-driven slide deck that pitches a roadmap: problem, goals, approach, milestones, risks and the ask.",
    job: "pitch a plan or roadmap to a group", shows: ["16:9 slides that scale to any screen", "Overview grid, speaker notes, deep links", "Prints one slide per PDF page"] },
  { slug: "ref-decision-questionnaire", phase: "Plan", category: "Questions", title: "Questions before v0.5", source: "kit", saves: true,
    description: "The agent asks several decisions at once; you answer on the page and the agent reads your answers.",
    job: "get several decisions from someone", shows: ["Options with sketches and a recommended default", "Answers saved for the agent", "Progress and summary"] },
  { slug: "ref-prototype-variants", phase: "Plan", category: "Prototype", title: "Toolbar redesign variants", source: "kit", saves: true,
    description: "Three clickable variants of the same UI, switchable in place, with a pick and comments per variant.",
    job: "choose between UI options before building", shows: ["Interactive variants side by side", "Desktop/phone and light/dark", "Picks and comments saved"] },
  { slug: "ref-scope-slicer", phase: "Plan", category: "Scope", title: "v0.5 scope slicer", source: "kit", saves: true,
    description: "Toggle work items against team capacity and watch the timeline, totals and dependency warnings update.",
    job: "cut scope to fit a deadline", shows: ["Live timeline and capacity", "Dependency and overload warnings", "Saved proposals to compare"] },
  { slug: "ref-decision-record", phase: "Plan", category: "Decision", title: "ADR: modelling collections", source: "kit", saves: true,
    description: "An architecture decision record with options, trade-offs and a weighted scoring matrix readers can adjust.",
    job: "compare options and record a decision", shows: ["Option cards with pros, cons, effort and risk", "Adjustable weights with live ranking", "Readers save their own weighting"] },

  { slug: "ref-live-run-log", phase: "Build", category: "Run log", title: "Live run log", source: "kit", saves: true,
    description: "A page the agent updates while it works — steps, logs, blockers — without publishing new versions.",
    job: "show progress of a long task as it happens", shows: ["Driven by artifact data set", "Blocker questions answered on the page", "Stale and elapsed-time indicators"] },
  { slug: "ref-debug-notebook", phase: "Build", category: "Investigation", title: "Debug notebook", source: "kit", saves: true,
    description: "A real bug hunt written up: symptom, reproduction, hypotheses with evidence, root cause, fix and verification.",
    job: "write up a bug investigation", shows: ["Hypothesis cards with status", "Evidence and before/after code", "Comments per hypothesis"] },
  { slug: "ref-runbook", phase: "Build", category: "Runbook", title: "Release and deploy runbook", source: "kit", saves: true,
    description: "A step-by-step operational procedure with copyable commands, shared ticks and an escape hatch at every step.",
    job: "run an operational procedure together", shows: ["Shared progress with who and when", "If-this-fails boxes and rollback", "Runs archived and restartable"] },

  { slug: "ref-implementation-review", phase: "Review", category: "Review", title: "Implementation review", source: "kit", saves: true,
    description: "What an agent hands back after finishing work: verdict, acceptance criteria and annotated screenshot evidence.",
    job: "show a reviewer what an agent built, with proof", shows: ["Annotated screenshot viewer and popups", "Comments per finding and a verdict", "Re-runnable capture script"] },
  { slug: "ref-code-walkthrough", phase: "Review", category: "Code review", title: "Code change walkthrough", source: "kit", saves: true,
    description: "A real change grouped by purpose, with a reading order, why-notes, risk levels and a verdict per chapter.",
    job: "walk a reviewer through a code change", shows: ["Readable diffs grouped by purpose", "Verdict and thread per chapter", "Summary of requested changes"] },
  { slug: "ref-visual-regression", phase: "Review", category: "Visual diff", title: "Visual regression gallery", source: "kit", saves: true,
    description: "Before and after screenshots of every screen with pixel-diff overlays to approve or reject one by one.",
    job: "approve visual changes screen by screen", shows: ["Before / after / diff modes", "Changed-pixel percentage", "Approve or request changes"] },
  { slug: "ref-test-report", phase: "Review", category: "Tests", title: "Test and performance report", source: "kit", saves: true,
    description: "Real test results, timings and sizes measured against budgets, regenerated by a script.",
    job: "show tests and performance against budgets", shows: ["Pass/fail with words, not colour", "Timing charts with table views", "Measurement script included"] },

  { slug: "ref-ops-report", phase: "Report", category: "Report", title: "Q3 operations report", source: "kit",
    description: "A five-page report with KPI tiles, interactive charts with table views and a CSV appendix, all fed from one data file.",
    job: "report numbers across several pages", shows: ["Shared navigation across pages", "Line, column, bar and donut charts", "One data.js drives every number"] },
  { slug: "ref-weekly-digest", phase: "Report", category: "Digest", title: "Weekly digest", source: "kit", saves: true,
    description: "What shipped, what is in progress and what is blocked this week, built from git history and the library.",
    job: "summarise a week for stakeholders", shows: ["Skimmable in a minute", "Built from git and the library", "Questions thread"] },

  { slug: "ref-architecture-tour", phase: "Explain", category: "Explainer", title: "How the artifact service works", source: "kit",
    description: "A long-form technical tour with a clickable system diagram, step-through request flows and API reference tables.",
    job: "explain how a system works", shows: ["Clickable SVG system diagram", "Step-through flow player", "Filterable API and CLI reference"] },
  { slug: "ref-codebase-map", phase: "Explain", category: "Code map", title: "Codebase map", source: "kit",
    description: "A treemap of the repository sized by lines and coloured by churn, with a module graph and where to start reading.",
    job: "find your way around an unfamiliar codebase", shows: ["Treemap by size and churn", "Module dependency graph", "Regenerated from git"] },
  { slug: "artifact-cli", phase: "Explain", category: "Download", title: "Artifact CLI", source: "kit",
    description: "Install the CLI on Linux, macOS or Windows, connect it to this server and give your agent the skill.",
    job: "install the CLI and the agent skill", shows: ["Install on any platform", "Connect to this server", "Install the agent skill"] },
];
