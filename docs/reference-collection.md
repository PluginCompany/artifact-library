# The reference collection

Every server starts with a collection of finished, polished artifacts, one per common job. Agents download the closest one, swap the content and publish, instead of starting from a blank page. The sources live in [`examples/reference/`](../examples/reference/); the hub is `/artifacts/reference-collection/` on any server and its style guide is `kit.html` there.

| Phase | Slug | Use it to | Saves feedback |
|---|---|---|---|
| Plan | `ref-plan-deck` | Pitch a plan or roadmap (keyboard slide deck, speaker notes, print to PDF) | |
| Plan | `ref-decision-questionnaire` | Get several decisions at once (options with trade-offs and a recommended default), built on the kit's questions block | ✓ |
| Plan | `ref-prototype-variants` | Choose between clickable UI variants before building | ✓ |
| Plan | `ref-scope-slicer` | Cut scope to fit capacity (live timeline, dependency warnings, saved proposals) | ✓ |
| Plan | `ref-decision-record` | Compare options and record a decision (adjustable weighted scoring) | ✓ |
| Build | `ref-live-run-log` | Show a long task as it happens (driven by `artifact data set`) | ✓ |
| Build | `ref-debug-notebook` | Write up a bug investigation (hypotheses, evidence, root cause, fix) | ✓ |
| Build | `ref-runbook` | Run an operational procedure together (shared ticks, rollback) | ✓ |
| Review | `ref-code-review` | Explain a change for review: why, screenshots with notes, each change with its reasoning and a short diff, decisions to confirm, a verdict | ✓ |
| Review | `ref-implementation-review` | Review finished work finding by finding (annotated screenshots, criteria, a verdict) | ✓ |
| Review | `ref-results-evidence` | Hand finished work back with proof: criteria and their checks, before/after, evidence, sign-off | ✓ |
| Review | `ref-code-walkthrough` | Walk a reviewer through a whole diff by purpose, with a verdict per chapter | ✓ |
| Review | `ref-visual-regression` | Approve before/after screenshots with pixel diffs, screen by screen | ✓ |
| Review | `ref-test-report` | Show tests and performance against budgets | ✓ |
| Report | `ref-ops-report` | Report numbers across several pages (charts with table views, CSV) | |
| Report | `ref-weekly-digest` | Summarise a week for stakeholders | ✓ |
| Explain | `ref-feature-tour` | Show people around a product: real screenshots with callouts, paths per role, a guided player | ✓ |
| Explain | `ref-architecture-tour` | Explain how a system works (clickable diagram, step-through flows) | |
| Explain | `ref-codebase-map` | Find your way around a codebase (treemap, module graph) | |
| Explain | `ref-user-guide` | Give people a step-by-step guide with real screenshots, processes, roles and two languages | ✓ |
| Explain | `agent-guide` | How agents should make artifacts on this server | |
| Explain | `artifact-cli` | Install the CLI and the agent skill | |

## Anatomy of a reference

```text
ref-implementation-review/
  index.html     page skeleton; starts with an EDITING GUIDE comment
  data.js        all content (edit this)
  app.js         rendering and behaviour
  style.css      styles for this page only, using kit tokens
  capture.py     (some) regenerates screenshots or data from a real system
  kit/           the shared design system, copied in at publish time
```

## The kit

`kit/` is a small design system shared by every reference: `kit.css` (tokens with light and dark mode, typography, components), `kit.js` (theme and style toggles, side-nav scroll spy, copy buttons, sortable tables, charts via `Kit.chart`, lazy images, galleries, diffs and syntax colouring), `kit-data.js` (saving answers and comments, see [saved-data.md](saved-data.md), and the questions block) and self-hosted fonts (SIL OFL). Pages built with it work offline, print sensibly and are checked at 390 px.

### Blocks for explaining

Higher-level blocks so a page shows its structure instead of describing it. Each works in both styles and in light and dark mode.

| Block | Markup | Use it for |
|---|---|---|
| Chapter menu | `<nav class="topnav" data-toc></nav>` inside the sticky `header.topbar`, or `<nav class="side" data-toc></nav>` in `.shell` | Every page with 3+ chapters: filled from top-level `section[id]` with an `h2` (nested sections are items of their chapter; `data-toc-skip` leaves one out), with scroll-spy; never in the page body |
| Flow diagram | `<div data-flow='{"steps":[{"title":"…","text":"…","tag":"new","files":["src/x.ts"]}],"caption":"…"}'></div>`, `"direction":"down"`, `"rows":[{"label":"…","steps":[…]}]`, or `Kit.flow(el, spec)` | Processes, pipelines, data flow |
| Comparison table | `<table class="table compare">` with `<tr class="rec">` on the recommended option | Options compared on the same criteria |
| Risk table | `<div data-risks='[{"risk":"…","likelihood":"low\|medium\|high","impact":"…","plan":"…"}]'></div>` or `Kit.risks(el, rows)` | Risks with likelihood (word and colour) and what the plan does about each |
| Before/after | `<div class="ba"><figure class="before">…</figure><figure class="after">…</figure></div>` | Screens, output or numbers before and after a change |
| Changes and what stays | `<div class="delta"><div class="changes">…</div><div class="stays">…</div></div>` | Reassuring readers about what does not change |
| Steps with files | `<ol class="steps">` with `<p class="files"><code>src/x.ts</code></p>` in a step | Work plans that say which files each step touches |
| Questions | `<div data-questions='{"questions":[{"id":"…","title":"…","recommended":"a","options":[{"id":"a","label":"…","summary":"…","pros":[],"cons":[],"effort":"S","then":"…"}]}]}'></div>`, `data-questions-src="PLAN.questions"` or `Kit.questions(el, spec)`; needs `kit/kit-data.js` | Decisions you need from the reader, on their own page or as a chapter of a plan, review or report: option cards with trade-offs and a recommended default, a note per question, "Accept all recommended", a summary and "I'm done". Saves `answer.<id>` and `state.submitted` ([saved-data.md](saved-data.md)); `heading`, `nav`, `toolbar`, `summary`, `finish` and `labels` adapt it. Notes from the agent show under a question: `updates` in the spec, or live with `artifact data append <slug> comments.q-<id>` |

### Images and code

| Block | Markup | Use it for |
|---|---|---|
| Lazy image | `<img data-src="shots/a.webp" width="1600" height="900" alt="…">` (`data-srcset`, `data-sizes` too) | Every screenshot below the first screen: it loads when it comes near the screen, keeps its place while loading, shows its path when the file is missing, and loads for printing |
| Full-size viewer | `data-lightbox` on an `img`, the same `data-lightbox="<group>"` to page through several; `Kit.lightbox.open(items, index)` | Screenshots readers need to see at full size |
| Gallery | `<div data-gallery="grid">` with `<figure><img …><figcaption><b>Title</b> caption</figcaption></figure>` children, JSON `{layout, items:[{src, thumb, title, caption, alt, w, h, tag, url, notes}], min, ratio, frame, start}`, `data-gallery-src` or `Kit.gallery(el, spec)` | Sets of screenshots: `grid`, `masonry` (mixed shapes), `strip` (a short sequence), `sidebar` (a numbered walkthrough), `annotated` (notes on the image), `compare` (a divider to drag); notes are `{x, y, title, text}` pins or `{x, y, w, h, …}` boxes in percent of the image |
| Code diff | `<div data-diff='{"file":"src/x.ts","start":12}'>` with `<script type="text/plain" data-before>` / `data-after` (or `data-patch`) children, JSON `{before, after \| patch \| hunks, range, mode, notes, highlight, context, caption}` or `Kit.diff(el, spec)` | A change shown in a few lines: Unified, Split or Result view (the reader's choice holds across the server), word-level marks, notes under lines; `range` keeps a patch snippet tight |
| Syntax colouring | `<pre data-lang="ts">`, or `Kit.highlight(text, lang)` | Code blocks in js, ts, py, sh, css, html, json, sql and more |

The style guide (`kit.html` on the reference collection) shows every component with copyable HTML.

## Themes: Clean and Bold

Every kit page comes in two styles that share the same markup, scripts and saved data; light and dark mode work in both.

- **Clean** (`kit/themes/clean/clean.css`, the default): a calm, professional documentation look: a flat white page, hairline borders, small radii, no gradients and no decorative shadows, Inter for text and semibold headings, Geist Mono for code, one blue accent for links and primary actions. Its fonts (SIL OFL) are bundled.
- **Bold** (`kit/kit.css` alone): heavy display type, dashed "stitch" rules, small mono uppercase labels, an indigo accent with a burnt-orange thread and coloured status strips.

**Readers choose.** `kit.js` puts a *Bold / Clean* button next to the light/dark toggle of every kit page and remembers the choice for every kit page on the server; a reader's choice wins over the page's default. Fully custom pages that don't load the kit get no button. Put `data-style-toggle` on a button of your own to place it yourself; `Kit.style.get()`, `Kit.style.set("bold")` and the `kit:style` event are there for scripts. After a switch the page also gets `kit:theme` and a `resize`, so charts and measured layouts redraw.

**Pages open in Clean.** Link Clean after every other stylesheet so it is there on the first paint (without the link, `kit.js` adds it, and the page may show Bold for a moment):

```html
<link rel="stylesheet" href="kit/kit.css">
<link rel="stylesheet" href="style.css">
<link rel="stylesheet" href="kit/themes/clean/clean.css">
```

Every reference does this. To open a page in Bold, leave the Clean link out and mark the page: `<html data-kit-style="bold">`. `KIT_THEME=bold ./publish.sh <dir>` (from `examples/reference/`) does both in every HTML page of the staged copy; `KIT_THEME=<name>` links another theme from `kit/themes/` last. Artifacts already published keep the kit they were published with, so the new default does not change them. `kit/themes/quiet/quiet.css` is an alias of Clean (its earlier name), so older pages keep working.

Besides the colour, font and radius tokens, a theme sets these, which pages use for the kit's signature details:

| Token | Default | Controls |
|---|---|---|
| `--w-heavy` | `800` | Weight of display headings and big numbers |
| `--rule` / `--rule-w` | `dashed` / `2px` | Style and width of section rules and "stitch" lines |
| `--strip` | `1` | Coloured status strips on card and callout edges (`0` removes them) |
| `--label` | `var(--mono)` | Font of small labels (eyebrows, table heads, field names) |
| `--label-case` | `uppercase` | Their text transform |
| `--label-k` | `1` | Multiplier for their letter spacing |
| `--label-scale` | `1` | Multiplier for their size |
| `--em` | `var(--accent)` | Colour of emphasised words in headlines (`<em>`) |

Page CSS should use them too (`font:var(--w-heavy) 40px var(--display)`, `border-top:var(--rule-w) var(--rule) var(--line)`, `font:500 calc(11px*var(--label-scale)) var(--label)`, `border-left:calc(3px*var(--strip)) solid var(--good)`), so a theme restyles the whole page. To make another theme, copy `kit/themes/clean/` to `kit/themes/<name>/`, rename the CSS file, change the tokens, and keep component overrides to what tokens cannot express.

## Make your own

```bash
artifact download ref-implementation-review --out ./login-review
# edit data.js / index.html
artifact publish ./login-review --slug login-review --title "Login flow review" --description "Criteria, annotated screenshots and findings."
```

To change a reference that ships with the server, edit `examples/reference/<slug>/`, check it against a local server (`ARTIFACT_SERVER_URL=http://localhost:3000 ./publish.sh <slug>` from `examples/reference/`), and release a new image; seeding updates servers that still have the previous seeded version.
