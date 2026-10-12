# The reference collection

Every server starts with a collection of finished, polished artifacts, one per common job. Agents download the closest one, swap the content and publish, instead of starting from a blank page. The sources live in [`examples/reference/`](../examples/reference/); the hub is `/artifacts/reference-collection/` on any server and its style guide is `kit.html` there.

| Phase | Slug | Use it to | Saves feedback |
|---|---|---|---|
| Plan | `ref-plan-deck` | Pitch a plan or roadmap (keyboard slide deck, speaker notes, print to PDF) | |
| Plan | `ref-decision-questionnaire` | Get several decisions at once (options with trade-offs and a recommended default) | ✓ |
| Plan | `ref-prototype-variants` | Choose between clickable UI variants before building | ✓ |
| Plan | `ref-scope-slicer` | Cut scope to fit capacity (live timeline, dependency warnings, saved proposals) | ✓ |
| Plan | `ref-decision-record` | Compare options and record a decision (adjustable weighted scoring) | ✓ |
| Build | `ref-live-run-log` | Show a long task as it happens (driven by `artifact data set`) | ✓ |
| Build | `ref-debug-notebook` | Write up a bug investigation (hypotheses, evidence, root cause, fix) | ✓ |
| Build | `ref-runbook` | Run an operational procedure together (shared ticks, rollback) | ✓ |
| Review | `ref-implementation-review` | Review finished work finding by finding (annotated screenshots, criteria, a verdict) | ✓ |
| Review | `ref-results-evidence` | Hand finished work back with proof: criteria and their checks, before/after, evidence, sign-off | ✓ |
| Review | `ref-code-walkthrough` | Walk a reviewer through a change by purpose, with a verdict per chapter | ✓ |
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

`kit/` is a small design system shared by every reference: `kit.css` (tokens with light and dark mode, typography, components), `kit.js` (theme toggle, side-nav scroll spy, copy buttons, sortable tables, charts via `Kit.chart`), `kit-data.js` (saving answers and comments, see [saved-data.md](saved-data.md)) and self-hosted fonts (SIL OFL). Pages built with it work offline, print sensibly and are checked at 390 px.

## Themes: Bold and Clean

Every kit page comes in two styles that share the same markup, scripts and saved data; light and dark mode work in both.

- **Bold** (`kit/kit.css`, the default): heavy display type, dashed "stitch" rules, small mono uppercase labels, an indigo accent with a burnt-orange thread and coloured status strips.
- **Clean** (`kit/themes/clean/clean.css`): a calm, professional documentation look: a flat white page, hairline borders, small radii, no gradients and no decorative shadows, Inter for text and semibold headings, Geist Mono for code, one blue accent for links and primary actions. Its fonts (SIL OFL) are bundled.

**Readers choose.** `kit.js` puts a *Bold / Clean* button next to the light/dark toggle of every kit page and remembers the choice for every kit page on the server. Fully custom pages that don't load the kit get no button. Put `data-style-toggle` on a button of your own to place it yourself; `Kit.style.get()`, `Kit.style.set("clean")` and the `kit:style` event are there for scripts. After a switch the page also gets `kit:theme` and a `resize`, so charts and measured layouts redraw.

**Authors pick the default.** A page defaults to Bold. Link Clean after every other stylesheet to make Clean the default:

```html
<link rel="stylesheet" href="kit/kit.css">
<link rel="stylesheet" href="style.css">
<link rel="stylesheet" href="kit/themes/clean/clean.css">
```

or publish a reference with it: `KIT_THEME=clean ./publish.sh <dir>` (from `examples/reference/`) links the theme into every HTML page of the staged copy. `kit/themes/quiet/quiet.css` is an alias of Clean (its earlier name), so older pages keep working.

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
