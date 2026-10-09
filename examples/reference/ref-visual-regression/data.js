/* GALLERY — page text. Screens and images come from shots.js (capture.py). */
window.GALLERY = {
  eyebrow: "Visual regression · 0.3.3 → 0.4.0",
  title: "Archived artifacts leave, <em>everything else stays put</em>",
  lead: "Release 0.4.0 adds archive and purge. The only intended visual change is that an archived artifact disappears from the library and its link answers 410. The header, the 404 page and the toolbar should be pixel-identical.",
  intended: "The archived draft gone from the grid and list views; the new 410 page at its link.",
  ignore: "Publish times in the toolbar's version label, and tiny differences inside thumbnails, which each server's own browser renders.",
  example: "Reference example. Every image is a real capture of two local servers holding the same artifacts: BEFORE runs release 0.3.3, AFTER the 0.4.0 code. The draft was archived on the AFTER server only, because 0.3.3 can't archive.",
};
