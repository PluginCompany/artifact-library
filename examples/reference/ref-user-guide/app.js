/* ref-user-guide: renders window.GUIDE (data.js) with screenshots from window.GUIDE_SHOTS
   (shots.js, written by capture.py). Routes: #/ start, #/p/<process>, #/a/<area>,
   #/t/<topic>, #/print[/<area>]. Change only to add a new kind of block. */
(() => {
"use strict";
const G = window.GUIDE, SHOTS = (window.GUIDE_SHOTS && window.GUIDE_SHOTS.shots) || {};
const { $, $$, esc, store } = Kit;
const D = Kit.data;

/* ---------- Language and text ---------- */
const langs = Object.keys(G.langs);
let lang = [store.get("guide-lang"), ...(navigator.languages || [navigator.language || ""]).map((l) => l.slice(0, 2)), "en"].find((l) => langs.includes(l));
const L = (v) => (v == null ? v : typeof v === "string" || Array.isArray(v) ? v : v[lang] != null ? v[lang] : v.en);
const t = (key, vars) => String(L(G.ui[key]) ?? key).replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] !== undefined ? vars[k] : ""));
const tr = (key) => L(G.ui[key]);

/* ---------- Content, localised once per language ---------- */
let areas, topics, byId, processes;
function build() {
  areas = G.order.map((id) => G.areas.find((a) => a.id === id)).filter(Boolean).concat(G.areas.filter((a) => !G.order.includes(a.id)))
    .map((a, ai) => ({ id: a.id, index: ai, roles: a.roles, title: L(a.title), intro: L(a.intro), raw: a }));
  areas.forEach((a) => {
    a.topics = a.raw.topics.map((x, ti) => ({
      id: x.id, area: a, ti, roles: x.roles || a.roles,
      title: L(x.title), summary: L(x.summary), where: L(x.where), before: (x.before || []).map(L),
      steps: (x.steps || []).map((st) => ({ text: L(st.text), shot: st.shot, pin: st.pin })),
      screen: x.screen ? { shot: x.screen.shot, points: x.screen.points.map(([txt, pin]) => [L(txt), pin]) } : null,
      diagram: x.diagram, rules: (x.rules || []).map(L),
      compare: x.compare ? { before: { ...x.compare.before, label: L(x.compare.before.label) }, after: { ...x.compare.after, label: L(x.compare.after.label) } } : null,
      inside: x.inside ? { title: L(x.inside.title), text: x.inside.text.map(L) } : null,
      faq: (x.faq || []).map(([q, a]) => [L(q), L(a)]), related: x.related || [],
    }));
  });
  topics = areas.flatMap((a) => a.topics);
  byId = Object.fromEntries(topics.map((x) => [x.id, x]));
  processes = G.processes.map((p) => ({ id: p.id, roles: p.roles, title: L(p.title), intro: L(p.intro),
    steps: p.steps.map((s) => ({ topic: s.topic, title: L(s.title), text: L(s.text) })) }));
}
const ROLES = Object.keys(G.roles);
let role = ROLES.includes(store.get("guide-role")) ? store.get("guide-role") : "all";
const visible = (x) => role === "all" || x.roles.some((r) => r === role);
const num = (x) => `${x.area.index + 1}.${x.ti + 1}`;
const tags = (roles) => `<div class="tags">${roles.map((r) => `<span class="tag role-${r}">${esc(L(G.roles[r]))}</span>`).join("")}</div>`;

/* ---------- Screenshots ---------- */
const shotInfo = (id) => SHOTS[id] || null;
const img = (id, alt, lazy = true) => { const i = shotInfo(id); return i ? `<img src="${esc(i.file)}" width="${i.w}" height="${i.h}" alt="${esc(alt)}"${lazy ? ' loading="lazy"' : ""} decoding="async" draggable="false">` : ""; };
/* A pin is a rectangle [x, y, w, h] in percent of the picture (capture.py). */
const rectFor = (id, pin) => { const i = shotInfo(id); return i && pin && i.pins && i.pins[pin] ? i.pins[pin] : null; };
const mainShot = (x) => (x.screen && x.screen.shot) || ((x.steps || []).filter((st) => st.shot).slice(-1)[0] || {}).shot || (x.compare && x.compare.after.shot) || null;
const thumb = (x) => { const id = mainShot(x); return (id && img(id, x.title)) || (x.diagram && DIAGRAMS[x.diagram] ? `<div class="concept">${DIAGRAMS[x.diagram]()}</div>` : `<span class="noshot">${num(x)}</span>`); };

/* ---------- Concept diagrams (inline SVG, theme colours) ---------- */
function box(x, y, w, h, title, sub) {
  return `<g class="st"><rect class="box" x="${x}" y="${y}" width="${w}" height="${h}" rx="14"/>
    <text class="t-h" x="${x + w / 2}" y="${y + h / 2 - (sub ? 6 : -6)}" text-anchor="middle" font-size="${Math.min(19, Math.floor(w * 1.55 / String(title).length))}">${esc(title)}</text>
    ${sub ? `<text class="t-m" x="${x + w / 2}" y="${y + h / 2 + 18}" text-anchor="middle" font-size="13">${esc(sub)}</text>` : ""}</g>`;
}
const DIAGRAMS = {
  loop() {
    const xs = [24, 212, 400, 588, 776], w = 168, y = 120, h = 104, labels = tr("dLoop");
    let g = `<text class="t-m kick" x="24" y="72" font-size="14">${esc(t("dLoopKicker"))}</text>`;
    labels.forEach(([a, b], i) => {
      g += box(xs[i], y, w, h, a, b);
      if (i < 4) g += `<path class="wire" d="M${xs[i] + w} ${y + h / 2} L${xs[i + 1]} ${y + h / 2}"/><path class="arrow" d="M${xs[i + 1] - 9} ${y + h / 2 - 6} L${xs[i + 1]} ${y + h / 2} L${xs[i + 1] - 9} ${y + h / 2 + 6}"/>`;
    });
    g += `<path class="wire back" d="M${xs[4] + w / 2} ${y + h} V290 H${xs[1] + w / 2} V${y + h}"/><path class="arrow" d="M${xs[1] + w / 2 - 6} ${y + h + 9} L${xs[1] + w / 2} ${y + h} L${xs[1] + w / 2 + 6} ${y + h + 9}"/>`;
    return `<svg viewBox="0 0 968 330" role="img" aria-label="${esc(t("dLoopAria"))}">${g}</svg>`;
  },
  saved() {
    const [a, b, c, d] = tr("dSaved");
    let g = `<text class="t-h" x="40" y="62" font-size="20">${esc(a)}</text>`;
    [0, 1, 2].forEach((i) => { g += `<g class="st"><rect class="box" x="${40 + i * 150}" y="86" width="130" height="150" rx="14"/><text class="t-h" x="${105 + i * 150}" y="170" text-anchor="middle" font-size="22">v${i + 1}</text></g>`; });
    g += `<g class="st"><rect class="box now" x="560" y="86" width="368" height="150" rx="14"/><text class="t-h" x="744" y="146" text-anchor="middle" font-size="19">${esc(b)}</text><text class="t-m" x="744" y="174" text-anchor="middle" font-size="14">${esc(c)}</text></g>`;
    g += `<path class="wire" d="M490 161 H560"/><text class="t-m" x="40" y="280" font-size="14">${esc(d)}</text>`;
    return `<svg viewBox="0 0 968 310" role="img" aria-label="${esc(t("dSavedAria"))}">${g}</svg>`;
  },
};

/* ---------- Search ---------- */
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
let index = [];
function buildIndex() {
  index = topics.map((x) => {
    const parts = [[x.title, 6], [x.summary, 3], [x.area.title, 2], [x.where, 1], ...x.before.map((b) => [b, 1]),
      ...x.steps.map((st) => [st.text, 1]), ...((x.screen && x.screen.points) || []).map((p) => [p[0], 1]),
      ...x.rules.map((r) => [r, 1]), ...((x.inside && x.inside.text) || []).map((r) => [r, 1]), [x.inside && x.inside.title, 1],
      ...x.faq.flatMap((f) => [[f[0], 2], [f[1], 1]])].filter((p) => p[0]);
    return { x, parts: parts.map(([text, w]) => ({ text, n: norm(text), w })) };
  });
}
function search(q) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return index.filter((e) => visible(e.x)).map((e) => {
    let score = 0;
    for (const w of words) {
      const hits = e.parts.filter((p) => p.n.includes(w));
      if (!hits.length) return null;
      const start = new RegExp("(^|[^a-z0-9])" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      hits.forEach((p) => { score += p.w * (start.test(p.n) ? 2 : 1); });
    }
    const body = e.parts.find((p) => p.w < 6 && words.some((w) => p.n.includes(w)));
    return { x: e.x, score, snippet: body ? body.text : e.x.summary };
  }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 12);
}
function hl(text, q) {
  const words = norm(q).split(/\s+/).filter(Boolean); text = String(text || ""); const n = norm(text);
  if (n.length !== text.length) return esc(text);
  let out = "", i = 0;
  while (i < text.length) {
    const w = words.find((w) => n.startsWith(w, i));
    if (w) { out += `<mark>${esc(text.slice(i, i + w.length))}</mark>`; i += w.length; } else out += esc(text[i++]);
  }
  return out;
}
/* A snippet around the first match, so long texts show the part that matched. */
function around(text, q) {
  const w = norm(q).split(/\s+/).filter(Boolean)[0]; const at = w ? norm(text).indexOf(w) : -1;
  return at > 70 ? "…" + String(text).slice(at - 50) : text;
}
let sel = 0, found = [];
function renderResults() {
  const q = $("#q").value, boxEl = $("#results");
  if (!q.trim()) { boxEl.hidden = true; return; }
  found = search(q); sel = Math.min(sel, Math.max(0, found.length - 1));
  boxEl.innerHTML = found.length ? found.map((r, i) => `<a href="#/t/${r.x.id}" class="${i === sel ? "sel" : ""}"><span class="th">${mainShot(r.x) ? img(mainShot(r.x), "") : ""}</span>
    <span><span class="where">${esc(r.x.area.title)}</span><b>${hl(r.x.title, q)}</b><span>${hl(around(r.snippet || "", q), q)}</span></span></a>`).join("")
    : `<div class="none">${esc(t("noResults", { q }))}</div>`;
  boxEl.hidden = false;
}
function closeSearch() { $("#results").hidden = true; }

/* ---------- Top bar, roles and side navigation ---------- */
function renderChrome() {
  document.documentElement.lang = lang;
  $("#brand").textContent = t("brand");
  $("#q").placeholder = t("search"); $("#q").setAttribute("aria-label", t("search"));
  $("#print-btn").setAttribute("aria-label", t("print")); $("#print-btn").title = t("print");
  $("#nav-btn").setAttribute("aria-label", t("nav")); $("#side").setAttribute("aria-label", t("nav"));
  $("#roles").setAttribute("aria-label", t("filterAria"));
  $("#roles").innerHTML = [["all", t("everything")], ...ROLES.map((r) => [r, L(G.roles[r])])]
    .map(([id, l]) => `<button type="button" data-role="${id}" aria-pressed="${id === role}">${esc(l)}</button>`).join("");
  $("#langs").innerHTML = langs.length > 1 ? langs.map((l) => `<button type="button" data-lang="${l}" lang="${l}" aria-pressed="${l === lang}">${esc(G.langs[l])}</button>`).join("") : "";
}
/* The side navigation is rendered once per language and role; routes only mark the current item,
   so the kit's scroll spy (which watches this nav) never sees it rebuilt under a click. */
function renderSide() {
  const procs = processes.filter(visible);
  $("#side").innerHTML = `<a href="#/" data-cur="home">${esc(t("home"))}</a>
    ${procs.length ? `<h5>${esc(t("flows"))}</h5>${procs.map((p) => `<a href="#/p/${p.id}" data-cur="p:${p.id}">${esc(p.title)}</a>`).join("")}` : ""}
    <h5>${esc(t("areas"))}</h5>` + areas.map((a) => {
      const list = a.topics.filter(visible); if (!list.length) return "";
      return `<details data-area="${a.id}"><summary><b>${String(a.index + 1).padStart(2, "0")}</b><span>${esc(a.title)}</span><i>${list.length}</i></summary>
        <a href="#/a/${a.id}" data-cur="a:${a.id}">${esc(t("overview"))}</a>
        ${list.map((x) => `<a href="#/t/${x.id}" data-cur="t:${x.id}">${esc(x.title)}</a>`).join("")}</details>`;
    }).join("");
}
function markSide(key, areaId) {
  $$("#side a").forEach((a) => {
    const on = a.dataset.cur === key;
    a.classList.toggle("cur", on);
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  $$("#side details").forEach((d) => { if (d.dataset.area === areaId) d.open = true; });
  const el = $("#side .cur"); if (el) el.scrollIntoView({ block: "nearest" });
}

/* ---------- Views ---------- */
const card = (x) => `<a class="card topic-card" href="#/t/${x.id}"><span class="thumb">${thumb(x)}</span><span class="body"><span class="n">${num(x)}</span><h3>${esc(x.title)}</h3><p>${esc(x.summary || "")}</p></span></a>`;
function home() {
  const quick = tr("quick"), procs = processes.filter(visible);
  $("#main").innerHTML = `<section class="home-hero rise">
      <div class="eyebrow">${esc(t("eyebrow"))}</div><h1>${esc(t("title"))}</h1><p>${esc(t("lead"))}</p>
      <div class="quick">${quick.map((q) => `<button type="button" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>
    </section>
    ${procs.length ? `<section class="gsec rise" style="--i:1"><h2>${esc(t("flows"))}</h2><p>${esc(t("flowsText"))}</p>
      <div class="flows">${procs.map((p) => `<a class="flow" href="#/p/${p.id}"><h3>${esc(p.title)}</h3><p>${esc(p.intro)}</p><span class="dots">${p.steps.map(() => "<i></i>").join("")}</span><span class="kbd">${esc(t("steps", { n: p.steps.length }))}</span></a>`).join("")}</div></section>` : ""}
    <section class="gsec rise" style="--i:2"><h2>${esc(t("areas"))}</h2>
      <div class="flows">${areas.map((a) => { const list = a.topics.filter(visible); return list.length ? `<a class="flow" href="#/a/${a.id}"><span class="big">${String(a.index + 1).padStart(2, "0")}</span><h3>${esc(a.title)}</h3><p>${esc(a.intro)}</p><span class="kbd">${esc(t("topics", { n: list.length }))}</span></a>` : ""; }).join("")}</div></section>`;
}
function areaView(a) {
  const list = a.topics.filter(visible);
  $("#main").innerHTML = `<div class="rise"><div class="crumbs"><a href="#/">${esc(t("home"))}</a><span>›</span><span>${esc(t("areas"))}</span></div>
    <div class="topic"><h1>${esc(a.title)}</h1>${tags(a.roles)}<p class="gist">${esc(a.intro)}</p></div>
    <div class="cards">${list.map(card).join("")}</div></div>`;
}
function processView(p) {
  $("#main").innerHTML = `<div class="topic rise"><div class="crumbs"><a href="#/">${esc(t("home"))}</a><span>›</span><span>${esc(t("flowLabel"))}</span></div>
    <h1>${esc(p.title)}</h1>${tags(p.roles)}<p class="gist">${esc(p.intro)}</p>
    <ol class="walk">${p.steps.map((st, i) => {
      const x = byId[st.topic];
      const inner = `<span class="th">${x ? thumb(x) : `<span class="noshot">${i + 1}</span>`}</span><span class="tx"><h3>${esc(st.title)}</h3><p>${esc(st.text)}</p>${x ? `<span class="kbd">${esc(t("readMore", { title: x.title }))}</span>` : ""}</span>`;
      return `<li><span class="n">${i + 1}</span>${x ? `<a href="#/t/${x.id}">${inner}</a>` : `<div class="plain">${inner}</div>`}</li>`;
    }).join("")}</ol></div>`;
}

/* ---------- The screenshot camera ---------- */
const ZOOM_ICON = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3 7V3h4M15 7V3h-4M3 11v4h4M15 11v4h-4" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>';
function camHtml(id, label) {
  const info = shotInfo(id);
  if (!info) return `<div class="shot-pending">${esc(t("shotPending"))}</div>`;
  return `<div class="cam" data-shot="${esc(id)}" data-ar="${(info.w / info.h).toFixed(4)}"><div class="layer">${img(id, label, false)}<div class="spot"></div></div>
    <button class="cam-zoom" type="button" aria-label="${esc(t("full"))}" title="${esc(t("full"))}">${ZOOM_ICON}</button></div>`;
}
/* The window is as wide as its column and at most 70% of the screen high, whatever the picture's shape. */
function layoutCam(cam) {
  const ar = +cam.dataset.ar, W = cam.clientWidth;
  const full = !!cam.closest(".viewer2.full"), steps = !!cam.closest('[data-v="steps"]');
  /* Steps use one window shape for all their screenshots, so the page does not jump between steps. */
  const shape = steps ? 16 / 9 : Math.min(2.6, Math.max(full ? 1 : 1.5, ar));
  const H = Math.max(160, Math.round(Math.min(W / shape, full ? innerHeight - 34 : innerHeight * 0.7)));
  cam.style.height = H + "px";
  const layer = cam.querySelector(".layer"); layer.style.width = W + "px"; layer.style.height = (W / ar) + "px";
  cam._g = { W, H, hL: W / ar };
}
/* How far "The screen explained" moves in on a part:
   max - the largest magnification; fill - how much of the window the part may fill. */
const ZOOM = { max: 2, fill: 0.64 };
/* rect = [x, y, w, h] in percent of the picture. No rect: the whole picture, centred.
   hint: outline the part without moving the camera. n: the number at its corner. */
function focusCam(cam, rect, hint, n) {
  if (!cam || !cam.querySelector(".layer")) return;
  layoutCam(cam);
  const { W, H, hL } = cam._g, layer = cam.querySelector(".layer"), spot = cam.querySelector(".spot");
  const fit = Math.min(1, H / hL);
  let z = fit;
  if (rect && !hint) z = Math.max(fit, Math.min(ZOOM.max, ZOOM.fill * W / (rect[2] / 100 * W), ZOOM.fill * H / (rect[3] / 100 * hL)));
  const cx = rect && !hint ? (rect[0] + rect[2] / 2) / 100 * W : W / 2, cy = rect && !hint ? (rect[1] + rect[3] / 2) / 100 * hL : hL / 2;
  const place = (size, view, c) => (size * z <= view ? (view - size * z) / 2 : Math.min(0, Math.max(view - size * z, view / 2 - c * z)));
  const tx = place(W, W, cx), ty = place(hL, H, cy);
  layer.style.transform = `translate(${tx}px,${ty}px) scale(${z})`; layer.style.setProperty("--s", z);
  cam._t = { tx, ty, z };
  if (rect) {
    Object.assign(spot.style, { left: rect[0] + "%", top: rect[1] + "%", width: rect[2] + "%", height: rect[3] + "%" });
    spot.classList.toggle("hint", !!hint); spot.classList.add("on");
    if (n) spot.dataset.n = n; else delete spot.dataset.n;
    spot.classList.toggle("low", rect[1] < 5);   // near the top edge: keep the number inside the picture
  } else spot.classList.remove("on");
}
const block = (title, body, cls = "") => `<section class="block ${cls}"><h2>${esc(title)}</h2>${body}</section>`;

/* ---------- A topic ---------- */
function topic(x) {
  const a = x.area, list = a.topics.filter(visible), pos = list.indexOf(x);
  let html = "";
  if (x.steps.length) {
    const withShots = x.steps.some((st) => st.shot);
    html += block(t("howTo"), withShots
      ? `<div class="viewer2" data-v="steps"><div class="stage">${camHtml((x.steps.find((st) => st.shot) || {}).shot, x.title)}</div>
          <ol class="points how">${x.steps.map((st, i) => `<li data-p="${i}"><span class="num">${i + 1}</span><span>${esc(st.text)}</span></li>`).join("")}</ol></div>`
      : `<ol class="points how plain">${x.steps.map((st, i) => `<li><span class="num">${i + 1}</span><span>${esc(st.text)}</span></li>`).join("")}</ol>`);
  }
  if (x.screen) {
    let n = 0;
    const nums = x.screen.points.map((p) => (rectFor(x.screen.shot, p[1]) ? ++n : null));
    html += block(t("screen"), `<div class="viewer2" data-v="screen"><div class="stage">${camHtml(x.screen.shot, x.title)}</div>
      <ol class="points">${x.screen.points.map((p, i) => `<li data-p="${i}" data-n="${nums[i] || ""}">${nums[i] ? `<span class="num">${nums[i]}</span>` : '<span class="dash"></span>'}<span>${esc(p[0])}</span></li>`).join("")}</ol></div>`);
  }
  if (x.diagram && DIAGRAMS[x.diagram]) html += block(t("diagram"), `<div class="concept wide">${DIAGRAMS[x.diagram]()}</div>`);
  if (x.compare && shotInfo(x.compare.after.shot) && shotInfo(x.compare.before.shot)) {
    const i = shotInfo(x.compare.after.shot);
    html += block(t("compare"), `<figure class="cmp-wrap"><div class="cmp" style="--cut:50%;--ar:${(i.w / i.h).toFixed(3)}" tabindex="0" role="slider" aria-label="${esc(t("compareAria"))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">${img(x.compare.before.shot, x.compare.before.label, false)}<img class="after" src="${esc(i.file)}" alt="${esc(x.compare.after.label)}" draggable="false"><span class="handle"></span><span class="lbl b">${esc(x.compare.before.label)}</span><span class="lbl a">${esc(x.compare.after.label)}</span></div></figure>`);
  }
  if (x.rules.length) html += block(t("know"), `<ul class="know">${x.rules.map((k) => `<li><span>${esc(k)}</span></li>`).join("")}</ul>`);
  if (x.inside) html += block(t("inside"), `<details class="fold deep"><summary>${esc(x.inside.title || t("insideOpen"))}</summary><div class="in">${x.inside.text.map((p) => `<p>${esc(p)}</p>`).join("")}</div></details>`);
  if (x.faq.length) html += block(t("faq"), x.faq.map((f) => `<details class="fold deep"><summary>${esc(f[0])}</summary><div class="in"><p>${esc(f[1])}</p></div></details>`).join(""));
  const related = x.related.map((id) => byId[id]).filter((o) => o && o !== x && visible(o));
  if (related.length) html += block(t("related"), `<div class="rel">${related.map((o) => `<a href="#/t/${o.id}"><b>${esc(o.title)}</b><span>${esc(o.area.title)}</span></a>`).join("")}</div>`);
  html += block(t("feedback"), `<div class="helpful-box" data-id="${x.id}">
      <div class="helpful"><span class="h-q">${esc(t("helpfulQ"))}</span>
        <div class="h-btns"><button class="btn" type="button" data-vote="yes" aria-pressed="false">${esc(t("yes"))}</button><button class="btn" type="button" data-vote="no" aria-pressed="false">${esc(t("notQuite"))}</button></div>
        <span class="h-tally kbd"></span></div>
      <form class="h-miss" hidden><label class="sr-only" for="m-${x.id}">${esc(t("missing"))}</label><textarea id="m-${x.id}" rows="2" placeholder="${esc(t("missing"))}"></textarea><button class="btn primary" type="submit">${esc(t("send"))}</button></form>
      <p class="h-thanks" hidden>${esc(t("thanks"))}</p>
      <details class="ask"><summary><span>${esc(t("ask"))}</span><span class="ask-cnt"></span></summary><div class="ask-thread"></div></details>
    </div>`, "fb");
  $("#main").innerHTML = `<article class="topic rise">
    <div class="crumbs"><a href="#/">${esc(t("home"))}</a><span>›</span><a href="#/a/${a.id}">${esc(a.title)}</a><span>›</span><span>${num(x)}</span></div>
    <h1>${esc(x.title)}</h1>${tags(x.roles)}
    <p class="gist">${esc(x.summary || "")}</p>
    ${x.where || x.before.length ? `<dl class="facts">${x.where ? `<div><dt>${esc(t("where"))}</dt><dd>${esc(x.where)}</dd></div>` : ""}${x.before.length ? `<div><dt>${esc(t("before"))}</dt><dd><ul>${x.before.map((b) => `<li>${esc(b)}</li>`).join("")}</ul></dd></div>` : ""}</dl>` : ""}
    ${html}
    <nav class="pager">${pos > 0 ? `<a href="#/t/${list[pos - 1].id}"><span>← ${esc(t("prev"))}</span><b>${esc(list[pos - 1].title)}</b></a>` : ""}${pos < list.length - 1 ? `<a class="next" href="#/t/${list[pos + 1].id}"><span>${esc(t("next"))} →</span><b>${esc(list[pos + 1].title)}</b></a>` : ""}</nav>
  </article>`;
  bindTopic(x);
  paintVotes();
}

function bindTopic(x) {
  const main = $("#main");
  const sv = main.querySelector('[data-v="steps"]');
  if (sv) {
    /* Pointing at (or tapping) a step shows its screenshot, whole, with the part it is about
       outlined and numbered. The last step pointed at stays shown. */
    let cur = 0;
    const show = (i) => {
      cur = i;
      /* A step without its own screenshot keeps the picture of the step before it. */
      const st = x.steps[i], pic = x.steps.slice(0, i + 1).reverse().find((s) => s.shot) || x.steps.find((s) => s.shot);
      let cam = sv.querySelector(".cam");
      if (pic && (!cam || cam.dataset.shot !== pic.shot)) { sv.querySelector(".stage").innerHTML = camHtml(pic.shot, st.text); cam = sv.querySelector(".cam"); }
      sv.querySelectorAll(".points [data-p]").forEach((li) => li.classList.toggle("on", +li.dataset.p === i));
      focusCam(cam, st.shot ? rectFor(st.shot, st.pin) : null, true, i + 1);
    };
    sv.querySelectorAll(".points [data-p]").forEach((li) => { li.onmouseenter = li.onclick = () => show(+li.dataset.p); });
    sv._relayout = () => show(cur);
    show(0);
  }
  const sc = main.querySelector('[data-v="screen"]');
  if (sc && sc.querySelector(".cam")) {
    /* No markers on the picture. A point in the list moves the camera to its part; pointing at
       the picture outlines the part under the pointer, and a click keeps the camera there. */
    const cam = sc.querySelector(".cam"), pts = x.screen.points, items = [...sc.querySelectorAll(".points [data-p]")];
    const rects = pts.map((p) => rectFor(x.screen.shot, p[1]));
    let held = -1;
    const mark = (i) => items.forEach((li) => li.classList.toggle("on", +li.dataset.p === i));
    const show = (i, hint) => { mark(i); focusCam(cam, i < 0 ? null : rects[i], hint, i < 0 ? "" : items[i].dataset.n); };
    const under = (e) => {
      const r = cam.getBoundingClientRect(), g = cam._g, c = cam._t; if (!g || !c) return -1;
      const px = ((e.clientX - r.left - c.tx) / c.z) / g.W * 100, py = ((e.clientY - r.top - c.ty) / c.z) / g.hL * 100;
      let best = -1, size = Infinity;
      rects.forEach((q, i) => { if (q && px >= q[0] && px <= q[0] + q[2] && py >= q[1] && py <= q[1] + q[3] && q[2] * q[3] < size) { best = i; size = q[2] * q[3]; } });
      return best;
    };
    if (rects.some(Boolean)) cam.classList.add("pick");
    items.forEach((li) => {
      const i = +li.dataset.p;
      li.onmouseenter = () => { if (held < 0) show(i, false); };
      li.onclick = () => { held = held === i ? -1 : i; show(held < 0 ? i : held, false); };
    });
    sc.querySelector(".points").onmouseleave = () => { if (held < 0) show(-1); };
    cam.addEventListener("mousemove", (e) => { if (held >= 0 || e.target.closest(".cam-zoom")) return; const i = under(e); show(i, true); });
    cam.addEventListener("mouseleave", () => { if (held < 0) show(-1); });
    cam.addEventListener("click", (e) => { if (e.target.closest(".cam-zoom")) return; if (held >= 0) { held = -1; show(-1); return; } const i = under(e); if (i >= 0) { held = i; show(i, false); } });
    sc._relayout = () => show(held, false);
    show(-1);
  }
  const cmp = main.querySelector(".cmp");
  if (cmp) {
    const set = (v) => { v = Math.min(100, Math.max(0, v)); cmp.style.setProperty("--cut", v + "%"); cmp.setAttribute("aria-valuenow", Math.round(v)); };
    const at = (cx) => { const r = cmp.getBoundingClientRect(); set((cx - r.left) / r.width * 100); };
    let drag = false;
    cmp.addEventListener("pointerdown", (e) => { drag = true; cmp.setPointerCapture(e.pointerId); at(e.clientX); e.preventDefault(); });
    cmp.addEventListener("pointermove", (e) => { if (drag) at(e.clientX); });
    ["pointerup", "pointercancel"].forEach((n) => cmp.addEventListener(n, () => { drag = false; }));
    cmp.addEventListener("keydown", (e) => { const d = e.key === "ArrowLeft" ? -5 : e.key === "ArrowRight" ? 5 : 0; if (d) { e.preventDefault(); set((parseFloat(cmp.style.getPropertyValue("--cut")) || 50) + d); } });
  }
}
function setFull(v, on) {
  v.classList.toggle("full", on); document.body.style.overflow = on ? "hidden" : "";
  if (v._relayout) v._relayout();
}

/* ---------- Was this helpful? and questions per topic (Kit.data) ---------- */
let votes = [], threadCounts = {};
const myKey = (id) => `answer.helpful.${id}.${D.personKey()}`;
function paintVotes() {
  const f = $(".helpful-box"); if (!f) return;
  const id = f.dataset.id, mine = votes.find((d) => d.key === myKey(id));
  const all = votes.filter((d) => d.key.startsWith(`answer.helpful.${id}.`));
  const yes = all.filter((d) => d.value && d.value.choice === "yes").length;
  $(".h-tally", f).textContent = all.length ? t("tally", { y: yes, n: all.length }) : "";
  $$("[data-vote]", f).forEach((b) => b.setAttribute("aria-pressed", String(!!mine && mine.value.choice === b.dataset.vote)));
  $(".ask-cnt", f).textContent = threadCounts[id] ? String(threadCounts[id]) : "";
}
async function loadFeedback() {
  try {
    const [v, c] = await Promise.all([D.list("answer.helpful."), D.list("comments.topic.")]);
    votes = v || []; threadCounts = {};
    (c || []).forEach((d) => { threadCounts[d.key.slice("comments.topic.".length)] = ((d.value && d.value.items) || []).length; });
    paintVotes();
  } catch (e) { /* offline or not on the server: saving still works locally */ }
}
async function vote(id, choice, note) {
  const x = byId[id];
  const value = { question: `Helpful? ${x.title}`, topic: id, choice, choiceLabel: choice === "yes" ? "Helpful" : "Not quite", note: note || "" };
  const doc = await D.set(myKey(id), value);
  votes = votes.filter((d) => d.key !== myKey(id)).concat([{ key: myKey(id), value: (doc && doc.value) || value }]);
  paintVotes();
}

/* ---------- Print view: the whole guide, or one area, as one static document ---------- */
function printShot(id, points) {
  const info = shotInfo(id); if (!info) return "";
  let n = 0;
  const pins = (points || []).map((p) => { const q = rectFor(id, p[1]); return q ? `<span class="p-rect" style="left:${q[0]}%;top:${q[1]}%;width:${q[2]}%;height:${q[3]}%"><i>${++n}</i></span>` : ""; }).join("");
  return `<div><span class="p-shot">${img(id, "", false)}${pins}</span></div>`;
}
function printTopic(x) {
  let h = `<section class="p-topic"><h3><small>${num(x)}</small>${esc(x.title)}</h3><p class="sum">${esc(x.summary || "")}</p>`;
  if (x.where) h += `<h4>${esc(t("where"))}</h4><p>${esc(x.where)}</p>`;
  if (x.before.length) h += `<h4>${esc(t("before"))}</h4><ul>${x.before.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`;
  if (x.steps.length) {
    /* One list per screenshot: the picture with the step numbers on it, then the steps. */
    h += `<h4>${esc(t("howTo"))}</h4>`; let open = false, last = null;
    x.steps.forEach((st, i) => {
      if (st.shot && st.shot !== last) {
        if (open) h += "</ol>";
        const pins = x.steps.map((s, j) => [s, j]).filter(([s]) => s.shot === st.shot)
          .map(([s, j]) => { const q = rectFor(s.shot, s.pin); return q ? `<span class="p-rect step" style="left:${q[0]}%;top:${q[1]}%;width:${q[2]}%;height:${q[3]}%"><i>${j + 1}</i></span>` : ""; }).join("");
        h += `<div><span class="p-shot">${img(st.shot, "", false)}${pins}</span></div><ol start="${i + 1}">`; open = true; last = st.shot;
      } else if (!open) { h += `<ol start="${i + 1}">`; open = true; }
      h += `<li>${esc(st.text)}</li>`;
    });
    h += "</ol>";
  }
  if (x.screen) {
    let n = 0;
    h += `<h4>${esc(t("screen"))}</h4>${printShot(x.screen.shot, x.screen.points)}<ul>${x.screen.points.map((p) => `<li>${rectFor(x.screen.shot, p[1]) ? `<b>${++n}.</b> ` : ""}${esc(p[0])}</li>`).join("")}</ul>`;
  }
  if (x.diagram && DIAGRAMS[x.diagram]) h += `<h4>${esc(t("diagram"))}</h4><div class="concept wide">${DIAGRAMS[x.diagram]()}</div>`;
  if (x.rules.length) h += `<h4>${esc(t("know"))}</h4><ul>${x.rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`;
  if (x.inside) h += `<h4>${esc(t("inside"))}${x.inside.title ? ": " + esc(x.inside.title) : ""}</h4>${x.inside.text.map((p) => `<p>${esc(p)}</p>`).join("")}`;
  if (x.faq.length) h += `<h4>${esc(t("faq"))}</h4><dl class="p-qa">${x.faq.map((f) => `<dt>${esc(f[0])}</dt><dd>${esc(f[1])}</dd>`).join("")}</dl>`;
  return h + "</section>";
}
function printView(only) {
  const list = areas.filter((a) => (!only || a === only) && a.topics.some(visible));
  $("#main").innerHTML = `<div class="p-tools"><button class="btn primary" type="button" id="do-print">${esc(t("print"))}</button>
      ${only ? `<a href="#/print">${esc(t("printAll"))}</a>` : ""}<span>${esc(t("printHint"))}</span></div>
    <div class="p-doc"><h1>${esc(only ? only.title : t("brand"))}</h1>
    ${list.map((a) => `<section class="p-area">${only ? "" : `<h2>${a.index + 1}. ${esc(a.title)}</h2>`}<p>${esc(a.intro)}</p>${a.topics.filter(visible).map(printTopic).join("")}</section>`).join("")}</div>`;
  $("#do-print").onclick = () => window.print();
}

/* ---------- Router ---------- */
function route() {
  document.body.style.overflow = "";
  closeSearch();
  $("#side").classList.remove("open");
  const pr = /^#\/print(?:\/([\w-]+))?/.exec(location.hash);
  const [, kind, id] = /^#\/(t|a|p)\/([\w-]+)/.exec(location.hash) || [];
  const x = kind === "t" ? byId[id] : null, a = kind === "a" ? areas.find((o) => o.id === id) : null, p = kind === "p" ? processes.find((o) => o.id === id) : null;
  if (pr) { const pa = areas.find((o) => o.id === pr[1]) || null; printView(pa); markSide("", pa && pa.id); }
  else if (x) { topic(x); markSide(`t:${x.id}`, x.area.id); }
  else if (a) { areaView(a); markSide(`a:${a.id}`, a.id); }
  else if (p) { processView(p); markSide(`p:${p.id}`); }
  else { home(); markSide("home"); }
  document.title = `${x ? x.title : a ? a.title : p ? p.title : t("brandShort")} · ${G.product}`;
  if (kind || pr) window.scrollTo({ top: 0, behavior: "instant" });
}
function render() { build(); buildIndex(); renderChrome(); renderSide(); route(); }

/* ---------- Events, wired once ---------- */
$("#q").addEventListener("input", () => { sel = 0; renderResults(); });
$("#q").addEventListener("focus", renderResults);
$("#q").addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + found.length) % Math.max(1, found.length); renderResults(); const el = $("#results .sel"); if (el) el.scrollIntoView({ block: "nearest" }); }
  else if (e.key === "Enter" && found[sel]) { location.hash = `#/t/${found[sel].x.id}`; closeSearch(); $("#q").blur(); }
  else if (e.key === "Escape") { closeSearch(); $("#q").blur(); }
});
document.addEventListener("click", async (e) => {
  const tgt = e.target;
  /* A click outside the search closes the results; the suggestion chips open them. */
  const chip = tgt.closest("[data-q]");
  if (chip) { $("#q").value = chip.dataset.q; $("#q").focus(); sel = 0; renderResults(); return; }
  if (!tgt.closest(".searchbox") || tgt.closest(".results a")) closeSearch();
  const r = tgt.closest("[data-role]");
  if (r) { role = r.dataset.role; store.set("guide-role", role); renderChrome(); renderSide(); route(); return; }
  const l = tgt.closest("[data-lang]");
  if (l && l.dataset.lang !== lang) { lang = l.dataset.lang; store.set("guide-lang", lang); render(); return; }
  if (tgt.closest("#print-btn")) {
    const [, kind, id] = /^#\/(t|a)\/([\w-]+)/.exec(location.hash) || [];
    const a = kind === "t" ? (byId[id] || {}).area : kind === "a" ? areas.find((o) => o.id === id) : null;
    location.hash = a ? `#/print/${a.id}` : "#/print"; return;
  }
  const z = tgt.closest(".cam-zoom");
  if (z) { const v = z.closest(".viewer2"); if (v) setFull(v, !v.classList.contains("full")); return; }
  const v = tgt.closest("[data-vote]");
  if (v) {
    const f = v.closest(".helpful-box"), id = f.dataset.id;
    $(".h-miss", f).hidden = v.dataset.vote !== "no";
    $(".h-thanks", f).hidden = v.dataset.vote !== "yes";
    try { await vote(id, v.dataset.vote); } catch (err) { /* the save status shows the error */ }
    if (v.dataset.vote === "no") $(".h-miss textarea", f).focus();
  }
});
document.addEventListener("submit", async (e) => {
  const form = e.target.closest(".h-miss"); if (!form) return;
  e.preventDefault();
  const f = form.closest(".helpful-box");
  await D.ensureAuthor();
  try { await vote(f.dataset.id, "no", $("textarea", form).value.trim()); form.hidden = true; $(".h-thanks", f).hidden = false; } catch (err) {}
});
/* The question thread is created when it is first opened. */
document.addEventListener("toggle", (e) => {
  const d = e.target; if (!d.matches || !d.matches("details.ask") || !d.open) return;
  const host = $(".ask-thread", d); if (host.dataset.ready) return; host.dataset.ready = "1";
  Kit.comments(host, { key: `topic.${d.closest(".helpful-box").dataset.id}`, title: t("askTitle"), placeholder: t("askPlaceholder"), compact: true });
}, true);
document.addEventListener("keydown", (e) => {
  const v = document.querySelector(".viewer2.full");
  if (v && e.key === "Escape") { setFull(v, false); return; }
  if (e.key === "/" && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) { e.preventDefault(); $("#q").focus(); $("#q").select(); }
});
let relayoutTimer = 0;
window.addEventListener("resize", () => { clearTimeout(relayoutTimer); relayoutTimer = setTimeout(() => $$("#main [data-v]").forEach((v) => v._relayout && v._relayout()), 120); });
window.addEventListener("hashchange", route);

render();
loadFeedback();
D.watch("answer.helpful.", (docs) => { votes = docs || []; paintVotes(); }, { interval: 20000 });
})();
