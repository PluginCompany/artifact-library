/* d3 for one-off visuals the kit's charts and Mermaid do not cover (force graphs, treemaps, chords, maps),
   served by the server at /_artifact/libs/d3.js. In a page: const d3 = await Kit.libs.load("d3").
   Read colours from kit tokens (Kit.libs.color("--accent")) and redraw on kit:theme. */
export * from "d3";
import { version as v } from "d3";
export const version = v;
