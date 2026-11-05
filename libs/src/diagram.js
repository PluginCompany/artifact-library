/* Diagrams for kit pages: Mermaid with the ELK layout, served by the server at /_artifact/libs/diagram.js.
   kit.js only uses this module's exports, so the libraries behind it can be upgraded on the server
   without changing pages that were published earlier. Keep these signatures stable:

     render(source, {vars, dark, look, layout, font}) → Promise<{svg, type}>   throws {message, line} on bad syntax
     parse(source)                                    → Promise<{type}>         same errors, nothing drawn
     version                                          Mermaid version string

   vars are Mermaid themeVariables (colours as hex). Diagram types are loaded when first used. */
import mermaid from "mermaid";
import elkLayouts from "@mermaid-js/layout-elk";
import pkg from "mermaid/package.json" with { type: "json" };

export const version = pkg.version;
mermaid.registerLayoutLoaders(elkLayouts);

let seq = 0, queue = Promise.resolve();
// Mermaid keeps global config: renders run one at a time so each gets its own theme.
const serial = (fn) => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; };

function configure(opts = {}) {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose", // the page's own author wrote the diagram; links and HTML labels work
    theme: "base",
    darkMode: Boolean(opts.dark),
    themeVariables: { ...(opts.vars || {}), darkMode: Boolean(opts.dark), fontFamily: opts.font || "inherit" },
    fontFamily: opts.font || "inherit",
    look: opts.look === "handDrawn" ? "handDrawn" : "classic",
    layout: opts.layout || "dagre",
    flowchart: { curve: "basis", padding: 12, htmlLabels: true },
    sequence: { mirrorActors: false, showSequenceNumbers: false },
    gantt: { useWidth: 960 },
    // ELK reads its own options when layout: elk is chosen in config or frontmatter.
    elk: { mergeEdges: false, nodePlacementStrategy: "BRANDES_KOEPF" },
  });
}

function failure(error) {
  const message = String((error && (error.str || error.message)) || error || "Unknown error");
  const hash = error && error.hash;
  // The message's "line N" counts from the first line of the text; jison's loc can be off by one.
  const line = (/\bline (\d+)/i.exec(message) || [])[1] || (hash && hash.loc ? hash.loc.first_line : undefined);
  const out = new Error(message.replace(/^Error:\s*/, ""));
  if (line) out.line = Number(line);
  return out;
}

export function parse(source) {
  return serial(async () => {
    configure();
    try { const r = await mermaid.parse(String(source)); return { type: r && r.diagramType }; }
    catch (e) { throw failure(e); }
  });
}

export function render(source, opts = {}) {
  return serial(async () => {
    configure(opts);
    const id = "kit-mmd-" + ++seq;
    try {
      const { svg, diagramType } = await mermaid.render(id, String(source));
      return { svg, type: diagramType };
    } catch (e) {
      document.getElementById("d" + id)?.remove(); // Mermaid leaves its scratch element behind on errors
      throw failure(e);
    }
  });
}
