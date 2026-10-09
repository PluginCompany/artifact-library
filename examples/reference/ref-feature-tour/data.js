/* ==========================================================================
   Feature tour — all content lives here (the slide types are described in the
   EDITING GUIDE at the top of index.html). Screenshots and their targets come from
   shots/manifest.js, written by capture.py; a point's second value names a target.
   Slide ids are <chapter id>-<position>, e.g. "versions-2".
   ========================================================================== */
window.TOUR = {
  hero: {
    eyebrow: "Artifact Library 0.4 · Feature tour",
    title: "A guided tour of <em>Artifact Library</em>",
    lead: "Your coding agents publish plans, progress, reviews and reports as real pages. You read them, answer on the page, and every agent reads your answers back. Here is every part of it, in the order you'd meet it.",
    collage: [
      { shot: "lib_grid", label: "The library" },
      { shot: "q_chosen", label: "Answering a questionnaire" },
      { shot: "run_log", label: "A live run log" },
    ],
  },
  galleryText: "From the first publish to running your own server. Open any screen, or play a whole chapter.",
  behindTitle: "What you can rely on",
  behindText: "You won't see these on screen. They are why the links you share keep working.",

  /* The short cut of the tour */
  highlights: ["big-picture-1", "library-1", "versions-1", "versions-3", "answer-2", "answer-4", "readback-1", "live-1", "collection-2", "agents-1", "running-1"],

  roleNames: { reader: "Readers", developer: "Developers", operator: "Operators" },
  roles: [
    { id: "reader", title: "I read and answer", text: "Open what an agent sent you, find older versions, answer questions, comment and approve, without leaving the page." },
    { id: "developer", title: "I build with agents", text: "Publish from any agent, read the answers back, reply in the same thread, and start from a reference instead of a blank page." },
    { id: "operator", title: "I run the server", text: "One container and one volume: install, upgrade, protect writes with a token, archive or purge, several servers side by side." },
    { id: "all", title: "Show me everything", text: "The whole tour, from the first publish to the server it runs on." },
  ],

  behind: [
    ["Self-hosted", "One container and one data volume, no database. Your pages never leave your network."],
    ["Stable links", "/artifacts/<slug>/ always opens the latest version; every version keeps its own address."],
    ["Nothing is overwritten", "A version is a complete snapshot of a folder and never changes. Identical uploads make no new version."],
    ["Answers outlive versions", "Answers, comments and verdicts are saved beside the artifact, not in it, so a new version keeps them."],
    ["Static only", "Uploaded files are served, never executed. Pages can only write their own saved data."],
    ["Safe uploads", "The CLI saves every upload before sending it; a lost response is retried exactly, not published twice."],
    ["Previews from the server", "A headless browser on the server renders each preview; agents never have to make screenshots for the library."],
    ["Built for scripts", "--json on every command, stable exit codes and optimistic revisions, so agents can rely on the output."],
  ],

  diagrams: {
    loop: {
      aria: "How an artifact travels from an agent to a reader and back",
      kicker: "ONE LOOP, ANY AGENT",
      boxes: [["Agent", "any coding agent"], ["artifact publish", "a folder of HTML"], ["Library", "stable link · versions"], ["Reader", "reads in the browser"], ["Saved answers", "beside the artifact"]],
      back: "artifact feedback → reply → update",
    },
    store: {
      aria: "What the server keeps for one artifact",
      kicker: "ONE ARTIFACT ON THE SERVER",
      versions: [["Version 1", "complete snapshot"], ["Version 2", "complete snapshot"], ["Version 3", "complete snapshot"]],
      latest: ["/artifacts/login-review/", "always the latest version"],
      data: ["Saved data", "answers · comments · verdicts · live state"],
      keys: "answer.* · comments.* · review.* · state.*",
      agent: "A new version keeps every answer; agents read them all with artifact feedback",
    },
  },

  chapters: [
  /* ------------------------------------------------------------------ 1 */
  { id: "big-picture", title: "How it all fits together", roles: ["reader", "developer", "operator"], thumb: "lib_grid",
    intro: "Before the details: how a page travels from an agent's folder to your browser, and how your answers find their way back.",
    learn: ["The publish and feedback loop", "What a published page looks like", "One command to publish"],
    slides: [
      { type: "concept", diagram: "loop", title: "From an agent's folder to your answer",
        lead: "Five steps connect any coding agent with the people who read its work.",
        points: [
          ["An agent writes a plan, a review or a report as a folder of HTML, CSS and images.", null],
          ["artifact publish uploads the whole folder in one go and gets a stable link back.", null],
          ["The library keeps every version and shows a preview, so anyone can find it later.", null],
          ["You open the link, read the page and answer on it: pick options, comment, approve.", null],
          ["Your answers are saved beside the artifact. Any agent reads them back, replies, and publishes the next version.", null] ],
        why: "Nobody copies text between chats. The page is the conversation, and every agent sees the same one." },
      { type: "feature", title: "Every page is a real web page", shot: "tb_page", roles: ["reader", "developer"],
        lead: "An artifact is exactly what the agent published: its own layout, scripts and styles. The server adds only a small toolbar.",
        points: [
          ["The artifact itself: here a slide deck with keyboard navigation and speaker notes", "page"],
          ["The version toolbar, added on the way out; the stored files never change", "dock"] ],
        why: "Agents can build whatever explains their work best: decks, maps, live logs, interactive comparisons." },
      { type: "feature", title: "One command to publish", shot: "t_publish", roles: ["developer"],
        lead: "The agent publishes a folder and keeps the links it gets back.",
        points: [
          ["artifact publish takes a folder, a slug, a title and a description", "cmd"],
          ["The stable link: always the latest version", "url"],
          ["The link to exactly this version, for when it must not change", "version"] ],
        how: ["artifact publish ./review --slug login-review --title \"Login flow review\" --json", "Share the url; keep the slug to update it later"],
        why: "The same command works from every agent, and --json makes the result easy to read back." },
    ]},

  /* ------------------------------------------------------------------ 2 */
  { id: "library", title: "The library", roles: ["reader", "developer"], thumb: "lib_grid",
    intro: "Everything your agents published, with previews the server makes itself. Search it, sort it, and switch between cards and a list.",
    learn: ["Previews and cards", "Search, sort and time filters", "Grid or list"],
    slides: [
      { type: "feature", title: "Everything your agents published", shot: "lib_grid",
        lead: "The front page of the server: newest work first, each with a live preview.",
        points: [
          ["Each card shows the preview, title, slug and when it was last updated", "card"],
          ["Previews are rendered on the server, so agents never make screenshots for the library", "preview"],
          ["Search titles, descriptions and slugs", "search"],
          ["Sort by last update, creation or title", "sort"],
          ["Narrow it down to the last day, week or month", "since"],
          ["Cards or a compact list", "view"],
          ["How to publish, right on the page for new users", "publish"] ],
        why: "Work from last week is as easy to find as work from this morning." },
      { type: "feature", title: "Search as you type", shot: "lib_search",
        lead: "Every word has to match, across titles, descriptions and slugs.",
        points: [
          ["Type a few words; the list follows as you type", "search"],
          ["The best match, with its description and version", "card"] ],
        why: "Agents use the same search from the CLI with artifact search, so you both find the same pages." },
      { type: "feature", title: "A list for scanning", shot: "lib_list",
        lead: "The list view trades big previews for descriptions you can read at a glance.",
        points: [
          ["Switch views; the library remembers your choice", "view"],
          ["One row per artifact, with its full description", "row"],
          ["The slug: the stable part of every link", "slug"],
          ["The version badge counts every update", "version"] ],
        why: "Long libraries stay readable, on a laptop or a phone." },
    ]},

  /* ------------------------------------------------------------------ 3 */
  { id: "versions", title: "Links and versions", roles: ["reader", "developer"], thumb: "tb_dock",
    intro: "Every update is a new version at the same link. The toolbar on each page switches versions, copies links and tells you when there's something newer.",
    learn: ["The version toolbar", "Stable link or exact snapshot", "Update notices without reloads"],
    slides: [
      { type: "feature", title: "The version toolbar", shot: "tb_dock",
        lead: "A small bar in the corner of every artifact, out of the page's way.",
        points: [
          ["Back to the library", "home"],
          ["The artifact's title", "title"],
          ["Every version, newest first, with its date", "versions"],
          ["Copy the stable link in one click", "copy"],
          ["More: snapshot link, download, collapse the bar", "menu"] ],
        why: "Readers move between versions without ever needing to know a URL." },
      { type: "feature", title: "Stable link or exact snapshot", shot: "tb_menu",
        lead: "Two kinds of link, for two kinds of sharing.",
        points: [
          ["The stable link follows updates; the snapshot link never changes. Download a version as a zip, or collapse the bar", "menu"],
          ["Pick any older version to read it exactly as it was", "versions"] ],
        why: "Discuss the latest plan, but quote the exact version you approved." },
      { type: "feature", title: "A new version, without surprise reloads", shot: "tb_update",
        lead: "When an agent publishes an update while you are reading, the page tells you instead of reloading.",
        points: [
          ["A quiet notice: version 2 is available", "update"],
          ["Open the latest version when you are ready", "latest"],
          ["You stay on the version you were reading", "versions"] ],
        why: "Nobody loses their place, or a half-written comment, because an agent was quick." },
    ]},

  /* ------------------------------------------------------------------ 4 */
  { id: "answer", title: "Answering on the page", roles: ["reader"], thumb: "q_chosen",
    intro: "Agents ask; you answer where you read. Questionnaires, comment threads and verdicts are saved for the agent the moment you click.",
    learn: ["Questionnaires", "Comment threads", "Verdicts per chapter"],
    slides: [
      { type: "feature", title: "A questionnaire from the agent", shot: "q_intro",
        lead: "Before planning, the agent asks every open question at once, each with a recommended default.",
        points: [
          ["How many questions you have answered so far", "progress"],
          ["Go through the questions one by one", "start"],
          ["Or accept every default in one click", "defaults"],
          ["Jump to any question", "list"] ],
        why: "Six decisions take two minutes instead of six messages back and forth." },
      { type: "steps", title: "Pick an answer", lead: "Every option shows its trade-offs; one click saves your choice.",
        steps: [
          { text: "Read the question and its options; each one has a sketch, pros and cons and an effort estimate.", shot: "q_options", pin: "question" },
          { text: "The agent marks the option it would pick, so you can simply agree.", shot: "q_options", pin: "recommended" },
          { text: "Click your answer. It is selected and saved straight away.", shot: "q_chosen", pin: "chosen" },
          { text: "The page confirms the save and who answered.", shot: "q_chosen", pin: "status" },
          { text: "Add a note for the agent when an option needs a condition.", shot: "q_chosen", pin: "note" } ],
        why: "Your answer reaches the agent exactly as you meant it: the option, its label and your note." },
      { type: "feature", title: "Review what you sent", shot: "q_summary",
        lead: "The last step lists every answer next to the default.",
        points: [
          ["Every question, your answer and the default side by side", "summary"],
          ["Click a row to change that answer", "answer"] ],
        why: "You see what the agent will read before you say you're done." },
      { type: "feature", title: "Comment on a finding", shot: "rv_thread",
        lead: "In a review, every finding has its own thread. Agents answer in the same place.",
        points: [
          ["The thread for this finding, with how many comments are open", "thread"],
          ["Your comment, saved for the agent", "human"],
          ["The agent's reply, in the same thread", "agent"] ],
        why: "Feedback stays attached to the exact thing it is about." },
      { type: "feature", title: "A verdict per chapter", shot: "cw_verdict",
        lead: "Code walkthroughs ask for a decision on each chapter of a change.",
        points: [
          ["Approve the chapter", "verdict"],
          ["Or request changes, or ask a question", "changes"],
          ["Tell the agent what to change", "note"],
          ["Progress through the chapters, in reading order", "side"] ],
        why: "Large changes get reviewed in parts, and the agent knows exactly which parts to redo." },
    ]},

  /* ------------------------------------------------------------------ 5 */
  { id: "readback", title: "The agent reads it back", roles: ["developer"], thumb: "t_feedback",
    intro: "Tell your agent “check the artifact”. It reads everything readers saved, replies in the same threads and publishes the next version.",
    learn: ["artifact feedback", "Replies in the same thread", "Versions and saved data"],
    slides: [
      { type: "feature", title: "Read the answers, reply in the thread", shot: "t_feedback",
        lead: "Two commands close the loop.",
        points: [
          ["artifact feedback prints every answer, comment and verdict, newest first", "read"],
          ["Each thread by its key, with who wrote what and when", "comment"],
          ["artifact data append adds the agent's reply to the same thread, where the reader sees it", "reply"] ],
        how: ["Ask the agent to check the artifact", "It runs artifact feedback <slug>", "It replies, fixes, and runs artifact update"],
        why: "Answers reach the agent without anyone copying them, and the reader sees the reply on the page." },
      { type: "concept", diagram: "store", title: "Versions and answers live side by side",
        lead: "The server keeps two things for every artifact.",
        points: [
          ["Every publish is a complete, immutable snapshot of the folder.", null],
          ["The stable link always serves the latest one.", null],
          ["Answers, comments, verdicts and live state are saved beside the versions, not inside them.", null],
          ["So a new version keeps every answer, and agents read them all in one place.", null] ],
        why: "You can update a page as often as you like without losing a single comment." },
      { type: "feature", title: "Everything as JSON", shot: "t_json", roles: ["developer"],
        lead: "Every command has --json, stable exit codes and the same fields as the HTTP API.",
        points: [
          ["Search, list, info, feedback: all with --json", "cmd"],
          ["Slugs, versions, links and previews, ready for a script", "slug"] ],
        why: "Agents don't parse prose. They get exactly the fields they need." },
    ]},

  /* ------------------------------------------------------------------ 6 */
  { id: "live", title: "Live pages", roles: ["reader", "developer"], thumb: "run_log",
    intro: "Some pages update while you watch: a long agent run writes its progress beside the page, and the page follows without new versions.",
    learn: ["A live run log", "Progress without new versions"],
    slides: [
      { type: "feature", title: "A run log that updates itself", shot: "run_log",
        lead: "The agent writes its progress with artifact data set; readers see it within seconds.",
        points: [
          ["Who is running and since when", "agent"],
          ["The status of the whole run", "status"],
          ["The step that is running now, with its live log", "now"] ],
        how: ["artifact data set ref-live-run-log state.run --file run.json", "Repeat as the run moves on; the page polls for changes"],
        why: "Follow a two-hour task from your phone, and answer when it gets stuck." },
    ]},

  /* ------------------------------------------------------------------ 7 */
  { id: "collection", title: "The reference collection and themes", roles: ["developer"], thumb: "hub",
    intro: "Every server ships polished examples for the common jobs. Agents copy the closest one and change the content, not the plumbing.",
    learn: ["Reference artifacts", "Default or Quiet theme"],
    slides: [
      { type: "feature", title: "Finished examples to copy from", shot: "hub",
        lead: "Plans, reviews, reports, live pages and tours, grouped by the phase of work.",
        points: [
          ["Search by name, job or feature", "search"],
          ["Filter by phase: plan, build, review, report, explain", "chips"],
          ["Each card shows a live preview and what the page can do", "card"],
          ["Pages that save answers are marked", "saves"] ],
        how: ["artifact download ref-implementation-review --out ./login-review", "Change data.js, then artifact publish"],
        why: "Agents produce consistent, polished pages from the first try." },
      { type: "compare", title: "Default or Quiet", lead: "Every reference works with both themes; one stylesheet link switches.",
        before: { shot: "theme_default", label: "Default" }, after: { shot: "theme_quiet", label: "Quiet" },
        points: [
          ["The default: bold display type, dashed rules, mono labels", null],
          ["Quiet: white space, medium weights, faint rings instead of borders", null],
          ["Light and dark mode in both", null] ],
        why: "Pick the look that fits the reader; the content and the saved answers stay the same." },
    ]},

  /* ------------------------------------------------------------------ 8 */
  { id: "agents", title: "Every agent, one library", roles: ["developer"], thumb: "t_agents",
    intro: "Claude Code, Codex and OpenCode publish to, search and read the same library, through a skill or an MCP server.",
    learn: ["The agent skill", "The MCP server"],
    slides: [
      { type: "feature", title: "A skill or MCP, for any agent", shot: "t_agents",
        lead: "One command teaches every agent the publish, share, feedback and update loop.",
        points: [
          ["The skill installs where each agent looks for it", "skill"],
          ["Or add the MCP server to Claude Code", "mcp"],
          ["… and to Codex, or any MCP client", "codex"] ],
        why: "A plan from one agent, a review from another, answers from you: all at links everyone can open." },
    ]},

  /* ------------------------------------------------------------------ 9 */
  { id: "running", title: "Running the server", roles: ["operator"], thumb: "t_server",
    intro: "One container and one data volume. Start it, put it behind your network, and manage what is published from the CLI.",
    learn: ["Docker or Compose", "Archive, restore and purge", "Several servers"],
    slides: [
      { type: "feature", title: "Start a server", shot: "t_server",
        lead: "The image seeds the reference collection and the agent guide on first start.",
        points: [
          ["docker run with one volume for all data", "docker"],
          ["Or generate a Compose deployment that checks Docker and the port first", "init"] ],
        how: ["Set PUBLIC_BASE_URL to the address readers use", "Set ARTIFACT_TOKEN to require a token for writes", "Upgrade by changing the image tag; the volume stays"],
        why: "A server for the whole team in a few minutes, on hardware you already have." },
      { type: "feature", title: "Archive, restore, purge, and several servers", shot: "t_manage",
        lead: "Everything an operator needs, from the same CLI.",
        points: [
          ["Archive hides an artifact and stops serving it; restore brings it back", "archive"],
          ["Purge deletes it with every version and every comment", "purge"],
          ["Profiles keep several servers apart, such as work and home", "profiles"] ],
        why: "Mistakes are reversible, deletions are deliberate, and nothing gets published to the wrong place." },
    ]},
  ],
};
