/* Syntax highlighting for kit pages: Shiki (VS Code's TextMate grammars, JavaScript regex engine, no WASM),
   served by the server at /_artifact/libs/highlight.js. Colours are kit tokens (var(--syn-*)), so code follows
   the page's style and light/dark mode without re-rendering. kit.js only uses these exports; keep them stable:

     tokens(code, lang) → Promise<{lang, lines: [[{t, color, italic, bold}]]} | null>   null: language unknown
     html(code, lang)   → Promise<string | null>   one line of spans per source line, joined with "\n"
     has(lang)          → boolean                   the language (or an alias) is available
     version            Shiki version string

   Grammars load on first use, one file per language. */
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { bundledLanguages, bundledLanguagesAlias } from "shiki/langs";
import pkg from "shiki/package.json" with { type: "json" };

export const version = pkg.version;

const v = (name) => `var(--syn-${name})`;
// Scopes → kit syntax tokens. Specific scopes first; TextMate picks the most specific match anyway.
const theme = {
  name: "kit",
  type: "light", // only used for defaults; every colour below is a CSS variable
  colors: { "editor.foreground": "var(--ink)", "editor.background": "transparent" },
  fg: "var(--ink)",
  bg: "transparent",
  settings: [
    { settings: { foreground: "var(--ink)" } },
    { scope: ["comment", "punctuation.definition.comment", "string.comment"], settings: { foreground: v("c"), fontStyle: "italic" } },
    { scope: ["keyword", "storage", "storage.type", "storage.modifier", "keyword.control", "keyword.other", "constant.language.import-export-all", "variable.language.this", "variable.language.self", "variable.language.super", "support.type.primitive", "keyword.type"], settings: { foreground: v("k") } },
    { scope: ["keyword.operator", "punctuation.accessor", "punctuation.separator.key-value"], settings: { foreground: v("o") } },
    { scope: ["keyword.operator.new", "keyword.operator.expression", "keyword.operator.logical.python", "keyword.operator.word"], settings: { foreground: v("k") } },
    { scope: ["string", "string.template", "punctuation.definition.string", "markup.inline.raw", "string.quoted"], settings: { foreground: v("s") } },
    { scope: ["string.regexp", "constant.character.escape", "constant.other.placeholder"], settings: { foreground: v("r") } },
    { scope: ["constant.numeric", "constant.language", "constant.language.boolean", "constant.other", "support.constant", "variable.other.constant", "variable.other.enummember"], settings: { foreground: v("n") } },
    { scope: ["entity.name.function", "support.function", "meta.function-call entity.name.function", "variable.function", "entity.name.method", "support.function.builtin"], settings: { foreground: v("f") } },
    { scope: ["entity.name.type", "entity.name.class", "entity.other.inherited-class", "support.type", "support.class", "entity.name.namespace", "entity.name.struct", "entity.name.enum", "entity.name.interface", "storage.type.class.jsdoc", "meta.type.annotation entity.name.type"], settings: { foreground: v("t") } },
    { scope: ["variable.parameter", "meta.parameter", "variable.other.property", "variable.other.object.property", "support.type.property-name", "meta.object-literal.key", "entity.name.tag.yaml", "support.type.property-name.json", "support.type.property-name.css", "variable.other.member", "entity.name.variable.field"], settings: { foreground: v("a") } },
    { scope: ["variable.other.readwrite.shell", "variable.other.normal.shell", "variable.other.positional.shell", "variable.other.special.shell", "punctuation.definition.variable.shell", "variable.other.env"], settings: { foreground: v("a") } },
    { scope: ["entity.name.tag", "punctuation.definition.tag", "meta.tag.sgml"], settings: { foreground: v("tag") } },
    { scope: ["entity.other.attribute-name", "entity.other.attribute-name.class.css", "entity.other.attribute-name.id.css", "entity.other.attribute-name.pseudo-class.css"], settings: { foreground: v("a") } },
    { scope: ["meta.decorator", "punctuation.decorator", "entity.name.function.decorator", "meta.annotation", "storage.type.annotation"], settings: { foreground: v("t") } },
    { scope: ["punctuation", "meta.brace", "punctuation.definition.block", "punctuation.terminator", "punctuation.separator"], settings: { foreground: v("p") } },
    { scope: ["markup.heading", "entity.name.section"], settings: { foreground: v("k"), fontStyle: "bold" } },
    { scope: ["markup.bold"], settings: { fontStyle: "bold" } },
    { scope: ["markup.italic"], settings: { fontStyle: "italic" } },
    { scope: ["markup.underline.link", "string.other.link"], settings: { foreground: v("f") } },
    { scope: ["markup.inserted", "punctuation.definition.inserted"], settings: { foreground: "var(--good)" } },
    { scope: ["markup.deleted", "punctuation.definition.deleted"], settings: { foreground: "var(--bad)" } },
    { scope: ["markup.changed", "meta.diff.range", "meta.diff.header"], settings: { foreground: v("t") } },
    { scope: ["invalid", "invalid.illegal"], settings: { foreground: "var(--bad)" } },
  ],
};

// Names readers type that Shiki spells differently.
const EXTRA = { sh: "bash", shell: "bash", console: "shellsession", zsh: "bash", yml: "yaml", py: "python", rb: "ruby", rs: "rust", kt: "kotlin",
  cs: "csharp", "c#": "csharp", "c++": "cpp", cc: "cpp", h: "c", hpp: "cpp", js: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", mts: "typescript", cts: "typescript", md: "markdown", htm: "html", conf: "ini", env: "dotenv", text: null, txt: null, plain: null, plaintext: null };

const resolve = (lang) => {
  let name = String(lang || "").trim().toLowerCase();
  if (!name) return null;
  if (Object.prototype.hasOwnProperty.call(EXTRA, name)) name = EXTRA[name];
  if (!name) return null;
  if (bundledLanguages[name]) return name;
  if (bundledLanguagesAlias && bundledLanguagesAlias[name]) return name;
  return null;
};
export const has = (lang) => Boolean(resolve(lang));

let core = null;
const loading = new Map();
const highlighter = () => (core ||= createHighlighterCore({ themes: [theme], langs: [], engine: createJavaScriptRegexEngine({ forgiving: true }) }));
async function ready(lang) {
  const name = resolve(lang);
  if (!name) return null;
  const h = await highlighter();
  if (!h.getLoadedLanguages().includes(name)) {
    const load = bundledLanguages[name] || (bundledLanguagesAlias && bundledLanguagesAlias[name]);
    if (!loading.has(name)) loading.set(name, h.loadLanguage(load).catch((e) => { loading.delete(name); throw e; }));
    await loading.get(name);
  }
  return { h, name };
}

export async function tokens(code, lang) {
  const r = await ready(lang);
  if (!r) return null;
  const lines = r.h.codeToTokensBase(String(code), { lang: r.name, theme: "kit" });
  return {
    lang: r.name,
    lines: lines.map((line) => line.map((tk) => ({
      t: tk.content,
      color: tk.color && tk.color !== "var(--ink)" ? tk.color : "",
      italic: Boolean(tk.fontStyle & 1),
      bold: Boolean(tk.fontStyle & 2),
    }))),
  };
}

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const style = (tk) => (tk.color ? `color:${tk.color};` : "") + (tk.italic ? "font-style:italic;" : "") + (tk.bold ? "font-weight:600;" : "");
export async function html(code, lang) {
  const r = await tokens(code, lang);
  if (!r) return null;
  return r.lines.map((line) => line.map((tk) => (style(tk) ? `<span style="${style(tk)}">${esc(tk.t)}</span>` : esc(tk.t))).join("")).join("\n");
}
