# Using Artifact Library with agents

Coding agents are good at producing plans, reviews and reports; Artifact Library gives them somewhere to put them. An agent publishes a folder of HTML, shares a stable link, and later reads what people answered, commented or approved on the page.

There are two ways to connect an agent: the **skill** (instructions plus the `artifact` CLI) and the **MCP server** (`artifact mcp`). Use either or both.

## The skill

```bash
artifact skill install --agent claude      # ~/.claude/skills/artifact-publishing
artifact skill install --agent opencode    # ~/.config/opencode/skills/artifact-publishing
artifact skill install --agent codex       # ~/.codex/skills/artifact-publishing
artifact skill install --agent claude,codex --overwrite
artifact skill install --path ./skills/artifact-publishing
```

The skill is bundled in the CLI, so it always matches your CLI version. `SKILL.md` works on its own; three optional references sit beside it (`references/writing.md`, `references/building-artifacts.md`, `references/deployment.md`). It is also attached to every release as `artifact-skill.tar.gz`. Agent folders respect `CLAUDE_CONFIG_DIR`, `XDG_CONFIG_HOME` and `CODEX_HOME`.

## The MCP server

`artifact mcp` speaks MCP over stdio and uses the CLI's selected server and token (`--profile`, `--server`, `--token` work too).

```bash
claude mcp add artifact -- artifact mcp                  # Claude Code
```

```jsonc
// opencode.json
{ "mcp": { "artifact": { "type": "local", "command": ["artifact", "mcp"] } } }
```

```toml
# ~/.codex/config.toml
[mcp_servers.artifact]
command = "artifact"
args = ["mcp"]
```

| Tool | Does |
|---|---|
| `search`, `recent`, `info`, `versions` | Find existing work before making something new |
| `create_from_reference` | Download a reference artifact into a folder and return its editing guide |
| `publish`, `update` | Publish a folder, or a new version at the same link |
| `download` | Fetch the original files of any version |
| `feedback` | Everything readers saved: answers, comments, verdicts |
| `data_get`, `data_set`, `data_append`, `data_update_item` | Read saved documents, update live state, reply in a thread, resolve a comment |
| `archive` | Archive or restore an artifact |

Resources: the bundled skill (`artifact://skill/SKILL.md`, …) and the server's agent guide.

## The loop

1. **Find first.** `artifact search` — maybe there is already a page to update.
2. **Start from a reference.** Every server ships a [reference collection](reference-collection.md); download the closest one instead of starting blank.
3. **Change the content, keep the plumbing.** Each `index.html` starts with an EDITING GUIDE; data lives in `data.js`, the design system in `kit/`.
4. **Publish** with a title that says what it is and a description that says what the reader gets.
5. **Check it**: `artifact lint <slug>` renders the published page at 1440 and 390 px and reports console errors, overflow, a missing chapter menu, walls of text and broken links (`--screenshots <dir>` saves images to look at). Fix, `artifact update`, then share the stable `url`.
6. **Ask the reader to answer on the page**, then read it: `artifact feedback <slug>`.
7. **Reply where they asked** (`artifact data append … comments.<anchor>`), do the work, and `artifact update` at the same link.

## What the skill asks of every artifact

The skill gives agents a numbered bar to meet, so models that follow explicit rules well produce pages as useful as the best ones:

1. Copy a reference; use the kit.
2. Name the reader and what they must do.
3. The first screen says what this is, the conclusion, and what the reader must do.
4. Three or more chapters get a global chapter menu that stays on screen: `nav.topnav[data-toc]` in the sticky top bar, or `nav.side[data-toc]` for long documents; never in the page body.
5. Plain language, one idea per paragraph, at most about four lines.
6. Show, don't describe: comparisons as `table.compare`, flows as `[data-flow]` diagrams, numbers as stats or charts, risks as `[data-risks]`, before/after as `.ba`, changes as `.delta`, work plans as `.steps` with files.
7. Measure instead of estimating; cite files; label estimates and example content.
8. Open decisions are answered on the page, with a recommended default and a verdict.
9. Review with `artifact lint` and the screenshots before sharing.
10. A name-like title, a one-sentence description, the stable link.

The reasons and examples are in the skill's `references/writing.md` and in the server's agent guide.

For long tasks, publish a run log once and keep it live with `artifact data set <slug> state.run --file run.json`; no new versions needed.

## Write access

If the server sets `ARTIFACT_TOKEN`, publishing needs a token: `artifact config set token <token>` (stored per server) or `ARTIFACT_TOKEN` in the agent's environment. Agents should never ask for a token in chat. Reading and saving reader feedback never need one.

## Several servers

Use `--profile` per command when one agent works for several servers (for example work and personal); `profile use` changes the default for every later command. See [cli.md](cli.md#profiles).
