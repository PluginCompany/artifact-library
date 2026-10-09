/* Feature tour — renders everything from window.TOUR (data.js) and window.SHOTS (shots/manifest.js,
   written by capture.py). Slide types: feature (one screenshot with numbered callouts), steps
   (several screenshots in order), compare (before/after slider), concept (diagram), and an
   opener per chapter that the player adds by itself. */
(() => {
"use strict";
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const MANIFEST = window.SHOTS || {shots: {}};
const shotInfo = id => (MANIFEST.shots && MANIFEST.shots[id]) || null;
const shotSrc = id => `shots/${id}.webp`;
const ICON = d => `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICONS = {
  reader: ICON('M2.5 10s2.8-5.5 7.5-5.5 7.5 5.5 7.5 5.5-2.8 5.5-7.5 5.5S2.5 10 2.5 10zM10 12.4a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8z'),
  developer: ICON('M7 6L3 10l4 4M13 6l4 4-4 4M11 4l-2 12'),
  operator: ICON('M3 5.5h14v4H3zM3 10.5h14v4H3zM6 7.5h.01M6 12.5h.01'),
  all: ICON('M3 5h14M3 10h14M3 15h9'),
};
const PLAY = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M5 3v12l10-6z" fill="currentColor"/></svg>';
const PAUSE = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M5 3h3v12H5zM10 3h3v12h-3z" fill="currentColor"/></svg>';
const store = { get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }, set(k,v){ try { localStorage.setItem(k,v); } catch(e){} } };

/* ---------- Interface text (content lives in data.js) ---------- */
const CONTENT = window.TOUR;
const UI = {
  browse: "Browse all ↓", reelAria: "Play this chapter", playChapter: "Play chapter",
  pathTitle: "Pick your path", pathText: "Each path plays only what matters for that role.",
  galleryTitle: "Every feature, chapter by chapter", galleryText: CONTENT.galleryText,
  searchLabel: "Search features", searchHint: "Search, e.g. versions, comments, token", filterAria: "Filter by role",
  chapters: "Chapters", behindEyebrow: "Under the hood", behindTitle: CONTENT.behindTitle, behindText: CONTENT.behindText,
  tourAria: "Guided tour", closeAria: "Close the tour", prev: "Previous", next: "Next", play: "Play", pause: "Pause",
  speedAria: "Playback speed", modeAria: "Mode", watch: "Watch", explore: "Explore", fullAria: "Full screen", zoomAria: "Screenshot at full size",
  statChapters: "chapters", statFeatures: "features", statDetails: "details explained",
  watchHighlights: "Watch the highlights · {n} min", fullTour: "Full tour · {n} min",
  playsAt: "Plays at {speed}× · pause, step or change speed at any time", roleMeta: "{count} features · {n} min",
  everything: "Everything", kindSteps: "How-to", kindCompare: "Before / after", kindConcept: "Explainer",
  shotPending: "Screenshot pending", shotLater: "Run capture.py to add this screenshot",
  playChapterTime: "Play chapter · {time}", noMatch: "No feature matches \"{q}\".",
  captured: "Screens captured from a real Artifact Library server on {date}.",
  chapterOf: "Chapter {n} of {total}", itemOf: "{n} of {total}", chapterMeta: "Chapter {n} · {count} features · {time}",
  chapterAria: "Chapter {n}: {title}", stepOf: "step {n} of {total}", pointAria: "Point {n}", enlarge: "Click to enlarge",
  why: "Why it helps", how: "How to use it",
  compareHint: "Drag the handle to compare. Click the picture first to move it with ← →.",
  compareAria: "Before and after: drag, or use the arrow keys", timeLeft: "{time} left",
  zoomClose: "Click or press Esc to close", loading: "Loading pictures…",
  ask: "Ask about this chapter", askHint: "Questions are saved beside this page; whoever maintains the tour (or their agent) answers with artifact feedback.",
};
const tr = key => UI[key];
const t = (key, vars) => String(tr(key)).replace(/\{(\w+)\}/g, (_, k) => vars && vars[k] !== undefined ? vars[k] : '');
document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
document.querySelectorAll('[data-t-aria]').forEach(el => el.setAttribute('aria-label', t(el.dataset.tAria)));
document.querySelectorAll('[data-t-ph]').forEach(el => el.setAttribute('placeholder', t(el.dataset.tPh)));

/* ---------- Flatten content ---------- */
const chapters = CONTENT.chapters;
chapters.forEach((c, ci) => { c.index = ci; c.slides.forEach((s, si) => { s.chapter = c; s.si = si; s.id = s.id || `${c.id}-${si + 1}`; s.roles = s.roles || c.roles; }); });
const allSlides = chapters.flatMap(c => c.slides);
const HL = new Set(CONTENT.highlights || []);
const inList = (role, s) => role === 'all' || (role === 'highlights' ? HL.has(s.id) : s.roles.includes(role));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Player state (speed is remembered; the tour plays at 2x unless the viewer changes it). */
const SPEEDS = [1, 1.5, 2, 3];
const P = { list:[], idx:0, beat:0, beatStart:0, elapsed:0, playing:false, speed:2, mode:'watch', role:'all', raf:0 };
if (SPEEDS.includes(+store.get('tour-speed'))) P.speed = +store.get('tour-speed');

/* Beats: the timed steps a slide plays through in watch mode (ms at 1x). */
function beatsOf(slide){
  if (slide.type === 'opener') return [{kind:'opener', ms:4400}];
  const b = [{kind:'intro', ms:2800}];
  const read = t => Math.min(6800, Math.max(3600, 1800 + t.length * 38));
  if (slide.type === 'steps') slide.steps.forEach((st, i) => b.push({kind:'step', i, ms:read(st.text) + 600}));
  else if (slide.type === 'compare') { b.push({kind:'sweep', ms:3800}); (slide.points||[]).forEach((p,i)=>b.push({kind:'point', i, ms:read(p[0])})); }
  else (slide.points||[]).forEach((p, i) => b.push({kind:'point', i, ms:read(p[0])}));
  if (slide.why) b.push({kind:'why', ms:3400});
  return b;
}
const slideMs = s => beatsOf(s).reduce((n, b) => n + b.ms, 0);
const fmt = ms => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const minutes = ms => Math.max(1, Math.round(ms / 60000));

/* Playlists: the whole tour or one role; each chapter starts with an opener slide. */
function openerFor(c){ return {type:'opener', chapter:c, id:`${c.id}-intro`, title:c.title, roles:c.roles}; }
function playlist(role){
  const out = [];
  chapters.forEach(c => {
    const slides = c.slides.filter(s => inList(role, s));
    if (slides.length) out.push(openerFor(c), ...slides);
  });
  return out;
}

/* ---------- Landing ---------- */
const H = CONTENT.hero;
$('#hero-eyebrow').textContent = H.eyebrow;
$('#hero-title').innerHTML = H.title;
$('#hero-lead').textContent = H.lead;
const listMs = role => playlist(role).reduce((n, s) => n + slideMs(s), 0) / P.speed;
const details = allSlides.reduce((n, s) => n + (s.points ? s.points.length : 0) + (s.steps ? s.steps.length : 0), 0);
$('#hero-stats').innerHTML = [[chapters.length,t('statChapters')],[allSlides.length,t('statFeatures')],[details,t('statDetails')]].map(([v,l]) => `<div><b data-to="${v}">${v}</b><span>${l}</span></div>`).join('');
if (!reduced) document.querySelectorAll('#hero-stats b').forEach(el => {
  const to = +el.dataset.to, t0 = performance.now() + 500;
  const f = now => { const t = Math.min(1, Math.max(0, (now - t0) / 1300)); el.textContent = Math.round(to * (1 - Math.pow(1 - t, 3))); if (t < 1) requestAnimationFrame(f); };
  requestAnimationFrame(f);
});

function img(shotId, alt, cls='', lazy=true){
  const info = shotInfo(shotId);
  return info ? `<img class="${cls}" src="${shotSrc(shotId)}" width="${info.w}" height="${info.h}" alt="${esc(alt)}"${lazy ? ' loading="lazy"' : ''} decoding="async">` : '';
}
const slideShot = s => s.type === 'concept' ? null : s.type === 'steps' ? s.steps[s.steps.length - 1].shot : s.type === 'compare' ? s.after.shot : s.shot;
/* Shots shaped like a screen (not a thin strip), for frames that crop to 16:10. */
const screenLike = id => { const i = shotInfo(id); return !!i && i.w / i.h > 1.25 && i.w / i.h < 2.3; };
const chapterShots = c => {
  const all = [...new Set([c.thumb, ...c.slides.map(slideShot)].filter(shotInfo))], good = all.filter(screenLike);
  return good.length ? good : all;
};

/* Hero reel: one screen per chapter, cross-fading. */
const REEL_MS = 3600;
const reelItems = chapters.map(c => ({c, shot: chapterShots(c)[0]})).filter(r => screenLike(r.shot));
let reelI = 0, reelT = 0;
$('#reel-view').innerHTML = reelItems.map(r => img(r.shot, r.c.title, '', false)).join('');
$('#pips').innerHTML = reelItems.map((r, i) => `<button class="pip" type="button" data-i="${i}" aria-label="${esc(r.c.title)}"></button>`).join('');
$('#pips').style.setProperty('--reel', `${REEL_MS}ms`);
function reelShow(i){
  if (!reelItems.length) return;
  reelI = (i + reelItems.length) % reelItems.length;
  document.querySelectorAll('#reel-view img').forEach((el, k) => el.classList.toggle('on', k === reelI));
  document.querySelectorAll('#pips .pip').forEach((el, k) => el.classList.toggle('on', k === reelI));
  $('#reel-n').textContent = String(reelItems[reelI].c.index + 1).padStart(2, '0');
  $('#reel-title').textContent = reelItems[reelI].c.title;
}
function reelRun(){ clearInterval(reelT); reelT = setInterval(() => { if ($('#player').hidden && !document.hidden) reelShow(reelI + 1); }, REEL_MS); }
reelShow(0); if (!reduced) reelRun();
$('#pips').addEventListener('click', e => { const b = e.target.closest('.pip'); if (b) { reelShow(+b.dataset.i); reelRun(); } });
$('#reel').onclick = () => { if (reelItems.length) openPlayer('all', `${reelItems[reelI].c.id}-intro`, 'watch'); };
$('#reel-float').innerHTML = img(H.collage[1].shot, '', '', false);

/* Marquee: a moving strip of screens; each opens its feature. */
{
  const seen = new Set(reelItems.map(r => r.shot)), picks = [];
  allSlides.forEach(s => { const id = slideShot(s); if (id && screenLike(id) && !seen.has(id)) { seen.add(id); picks.push(s); } });
  const every = Math.max(1, Math.floor(picks.length / 12));
  const items = picks.filter((_, i) => i % every === 0).slice(0, 12);
  const row = hidden => items.map(s => `<button type="button" data-slide="${s.id}"${hidden ? ' tabindex="-1" aria-hidden="true"' : ''}>${img(slideShot(s), s.title, '', false)}<span>${esc(s.title)}</span></button>`).join('');
  $('#marquee').innerHTML = items.length ? `<div class="marquee-track">${row(false)}${row(true)}</div>` : '';
  $('#marquee').addEventListener('click', e => { const b = e.target.closest('[data-slide]'); if (b) openPlayer('all', b.dataset.slide, 'explore'); });
}

/* Everything that shows a duration, re-rendered when the speed changes. */
function renderTimes(){
  $('#hl-label').textContent = t('watchHighlights', {n: minutes(listMs('highlights'))});
  $('#watch-all').textContent = t('fullTour', {n: minutes(listMs('all'))});
  $('#hero-length').textContent = t('playsAt', {speed: P.speed});
  $('#roles').innerHTML = CONTENT.roles.map(r => {
    const count = playlist(r.id).filter(s => s.type !== 'opener').length;
    return `<button class="role ${r.id} rv" type="button" data-role="${r.id}"><span class="icon">${ICONS[r.id]}</span><h3>${esc(r.title)}</h3><p>${esc(r.text)}</p><span class="meta">${t('roleMeta', {count, n: minutes(listMs(r.id))})}</span></button>`;
  }).join('');
  reveal($('#roles'));
}
$('#roles').addEventListener('click', e => { const b = e.target.closest('[data-role]'); if (b) openPlayer(b.dataset.role, 0, 'watch'); });
$('#watch-hl').onclick = () => openPlayer('highlights', 0, 'watch');
$('#watch-all').onclick = () => { const saved = store.get('tour-pos'); openPlayer('all', saved && playlist('all').some(s => s.id === saved) ? saved : 0, 'watch'); };
$('#browse').onclick = () => $('#features').scrollIntoView({behavior: reduced ? 'auto' : 'smooth'});

/* Scroll reveal: cards rise in as they enter the viewport. */
const io = 'IntersectionObserver' in window && !reduced ? new IntersectionObserver(entries => {
  let k = 0;
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    const el = e.target; io.unobserve(el);
    el.style.setProperty('--d', `${Math.min(k++, 8) * 70}ms`); el.classList.add('in');
    setTimeout(() => { el.classList.remove('rv', 'in'); el.style.removeProperty('--d'); }, 1400);
  });
}, {rootMargin: '0px 0px -5% 0px'}) : null;
function reveal(root){ root.querySelectorAll('.rv').forEach(el => io ? io.observe(el) : el.classList.remove('rv')); }

let indexRole = 'all';
$('#index-chips').innerHTML = [['all',t('everything')],...CONTENT.roles.filter(r => r.id !== 'all').map(r => [r.id, CONTENT.roleNames[r.id]])]
  .map(([id, l]) => `<button class="chip" type="button" data-f="${id}" aria-pressed="${id === 'all'}">${l}</button>`).join('');
const KIND = {steps:t('kindSteps'), compare:t('kindCompare'), concept:t('kindConcept')};
const ARROW = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4l4 4-4 4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function thumb(s){
  if (s.type === 'concept') return `<div class="concept">${DIAGRAMS[s.diagram]()}</div>`;
  return img(slideShot(s), s.title) || `<div class="pending"><span class="kbd">${t('shotPending')}</span></div>`;
}
const spy = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  entries.forEach(e => { if (!e.isIntersecting) return;
    document.querySelectorAll('#g-nav button').forEach(b => { const on = b.dataset.jump === e.target.id; b.classList.toggle('cur', on); if (on) $('#g-nav').scrollTo({left: b.offsetLeft - 40, behavior: 'smooth'}); }); });
}, {rootMargin: '-25% 0px -65% 0px'}) : null;
function renderGallery(){
  const q = $('#q').value.trim().toLowerCase();
  const match = s => (indexRole === 'all' || s.roles.includes(indexRole)) &&
    (!q || [s.title, s.lead, ...(s.points || []).map(p => p[0]), ...(s.steps || []).map(p => p.text), s.chapter.title].join(' ').toLowerCase().includes(q));
  const groups = chapters.map(c => [c, c.slides.filter(match)]).filter(([, list]) => list.length);
  const rv = q ? '' : ' rv';
  $('#g-nav').innerHTML = groups.map(([c]) => `<button type="button" data-jump="chapter-${c.id}"><b>${String(c.index + 1).padStart(2, '0')}</b>${esc(c.title)}</button>`).join('');
  $('#gallery').innerHTML = groups.length ? groups.map(([c, list]) => {
    const ms = [openerFor(c), ...c.slides].reduce((n, x) => n + slideMs(x), 0) / P.speed;
    const big = !q && indexRole === 'all' && list.length >= 3;
    return `<section class="g-group" id="chapter-${c.id}">
      <div class="g-head${rv}"><span class="big">${String(c.index + 1).padStart(2, '0')}</span><h3>${esc(c.title)}</h3><p>${esc(c.intro)}</p>
        <button class="btn" type="button" data-chapter="${c.id}">${PLAY}${t('playChapterTime', {time: fmt(ms)})}</button></div>
      <div class="g-grid">${list.map((s, i) => `<button class="g-card${big && i === 0 ? ' big' : ''}${rv}" type="button" data-slide="${s.id}">
        <div class="g-thumb">${KIND[s.type] ? `<span class="g-kind">${KIND[s.type]}</span>` : ''}${thumb(s)}<span class="g-open">${ARROW}</span></div>
        <div class="g-body"><span class="n">${c.index + 1}.${s.si + 1}</span><h4>${esc(s.title)}</h4><p>${esc(s.lead || '')}</p></div></button>`).join('')}</div>
    </section>`; }).join('') : `<p class="empty">${esc(t('noMatch', {q}))}</p>`;
  reveal($('#gallery'));
  if (spy) { spy.disconnect(); document.querySelectorAll('.g-group').forEach(g => spy.observe(g)); }
}
$('#g-nav').addEventListener('click', e => { const b = e.target.closest('[data-jump]'); if (b) document.getElementById(b.dataset.jump).scrollIntoView({behavior: reduced ? 'auto' : 'smooth'}); });
$('#q').addEventListener('input', renderGallery);
$('#index-chips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; indexRole = b.dataset.f; document.querySelectorAll('#index-chips .chip').forEach(c => c.setAttribute('aria-pressed', c === b)); renderGallery(); });
$('#gallery').addEventListener('click', e => {
  const ch = e.target.closest('[data-chapter]'); if (ch) { openPlayer('all', `${ch.dataset.chapter}-intro`, 'watch'); return; }
  const b = e.target.closest('[data-slide]'); if (b) openPlayer('all', b.dataset.slide, 'explore');
});

$('#behind').innerHTML = CONTENT.behind.map(([t, d]) => `<li><b>${t}</b><span>${d}</span></li>`).join('');
if (MANIFEST && MANIFEST.generated_at) {
  const d = new Date(MANIFEST.generated_at);
  $('#captured').textContent = t('captured', {date: d.toLocaleDateString('en-GB', {day:'numeric', month:'long', year:'numeric'})});
}

/* ---------- Player ---------- */
$('#p-speed').textContent = `${P.speed}×`;

function openPlayer(role, start, mode){
  P.role = role; P.list = playlist(role); P.mode = mode;
  P.idx = typeof start === 'number' ? start : Math.max(0, P.list.findIndex(s => s.id === start));
  $('#player').hidden = false; document.body.style.overflow = 'hidden';
  setMode(mode);
  renderSlide();
  if (mode === 'watch') play(); else pause();
  $('#p-play').focus();
}
function closePlayer(){
  pause(); $('#player').hidden = true; document.body.style.overflow = ''; $('#p-menu').hidden = true;
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}
/* Watch: full-width picture with one caption at a time. Explore: picture plus the full text panel. */
function markMode(mode){
  P.mode = mode;
  document.querySelectorAll('.mode button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === mode));
  $('#p-stage').classList.toggle('watch', mode === 'watch');
  sizeCam();
}
function setMode(mode){
  markMode(mode);
  if (mode === 'explore') { pause(); applyBeat(); } else { play(); }
}

/* ---------- Rendering a slide ---------- */
function pinNumbers(shotId, points){
  const info = shotInfo(shotId); let n = 0;
  return (points || []).map(p => (info && p[1] && info.pins[p[1]]) ? ++n : null);
}
function frameSize(info){
  const box = $('#p-visual').getBoundingClientRect();
  const ar = info ? info.w / info.h : 16 / 10;
  let w = box.width, h = w / ar;
  if (h > box.height) { h = box.height; w = h * ar; }
  return {w: Math.max(200, Math.floor(w)), h: Math.max(120, Math.floor(h))};
}
function camHtml(shotId, label, points, withPins=true){
  const info = shotInfo(shotId);
  if (!info) return `<div class="cam" data-ar="1.6"><div class="pending"><div><b>${esc(label)}</b><br><span class="kbd">${t('shotLater')}</span></div></div></div>`;
  const nums = pinNumbers(shotId, points);
  const pins = withPins ? (points || []).map((p, i) => nums[i] ? `<button class="pin" type="button" data-p="${i}" style="left:${info.pins[p[1]][0]}%;top:${info.pins[p[1]][1]}%" aria-label="${t('pointAria', {n: nums[i]})}">${nums[i]}</button>` : '').join('') : '';
  return `<div class="cam" data-shot="${shotId}"><div class="layer"><img src="${shotSrc(shotId)}" alt="${esc(label)}" draggable="false">${pins}<div class="spot"></div></div><span class="zoom-hint">${t('enlarge')}</span></div>`;
}
function sizeCam(){
  const cam = $('#p-visual .cam'); if (!cam) return;
  const info = shotInfo(cam.dataset.shot || (cam.querySelector('.cmp') && cam.dataset.cmp));
  /* Watch mode shows tall pages through a wide window and lets the camera travel down them. */
  const ar = info ? info.w / info.h : 1.6, layer = cam.querySelector('.layer');
  const crop = P.mode === 'watch' && !!layer && ar < 1.5;
  const {w, h} = frameSize(crop ? {w: 1.5, h: 1} : info);
  cam.style.width = w + 'px'; cam.style.height = h + 'px';
  if (layer) { layer.style.height = crop ? `${w / ar}px` : ''; layer.style.bottom = crop ? 'auto' : ''; }
  cam.dataset.k = crop ? h / (w / ar) : 1;
}

function renderSlide(){
  const s = P.list[P.idx]; if (!s) return;
  P.beat = 0; P.elapsed = 0; P.beatStart = performance.now();
  waitSince = 0; $('#p-loading').hidden = true; preloadAhead();
  const c = s.chapter;
  const inChapter = P.list.filter(x => x.chapter === c && x.type !== 'opener');
  const pos = inChapter.indexOf(s);
  $('#p-kicker').textContent = t('chapterOf', {n: c.index + 1, total: chapters.length}) + (pos >= 0 ? ` · ${t('itemOf', {n: pos + 1, total: inChapter.length})}` : '');
  $('#p-chapter').textContent = c.title;
  const vis = $('#p-visual'), panel = $('#p-panel');
  const tags = `<div class="tags">${s.roles.map(r => `<span class="tag ${r}">${CONTENT.roleNames[r]}</span>`).join('')}</div>`;

  if (s.type === 'opener') {
    vis.innerHTML = `<div class="opener"><div class="o-text"><span class="big">${String(c.index + 1).padStart(2, '0')}</span><h2>${esc(c.title)}</h2>
      <div class="learn">${(c.learn || []).map((l, i) => `<span style="--i:${i}">${esc(l)}</span>`).join('')}</div></div>
      <div class="fan">${chapterShots(c).filter(id => P.list.some(x => x.chapter === c && slideShot(x) === id) || id === c.thumb).slice(0, 3).map((id, i) => `<img src="${shotSrc(id)}" alt="" style="--i:${i}">`).join('')}</div></div>`;
    panel.innerHTML = `<span class="count">${t('chapterMeta', {n: c.index + 1, count: inChapter.length, time: fmt(inChapter.reduce((n, x) => n + slideMs(x), 0) / P.speed)})}</span>${tags}
      <h2>${esc(c.title)}</h2><p class="lead">${esc(c.intro)}</p>
      <ol class="points">${inChapter.map((x, i) => `<li data-go="${x.id}"><span class="dash"></span><span>${esc(x.title)}</span></li>`).join('')}</ol>`;
  } else if (s.type === 'steps') {
    panel.innerHTML = `${tags}<h2>${esc(s.title)}</h2><p class="lead">${esc(s.lead)}</p>
      <ol class="points steps">${s.steps.map((st, i) => `<li data-p="${i}"><span class="num">${i + 1}</span><span>${esc(st.text)}</span></li>`).join('')}</ol>
      ${s.why ? `<div class="why"><b>${t('why')}</b>${esc(s.why)}</div>` : ''}`;
    vis.innerHTML = camHtml(s.steps[0].shot, s.title, [], false);
  } else if (s.type === 'compare') {
    const before = shotInfo(s.before.shot), after = shotInfo(s.after.shot);
    panel.innerHTML = `${tags}<h2>${esc(s.title)}</h2><p class="lead">${esc(s.lead)}</p>
      <ol class="points">${(s.points || []).map((p, i) => `<li data-p="${i}"><span class="dash"></span><span>${esc(p[0])}</span></li>`).join('')}</ol>
      ${s.why ? `<div class="why"><b>${t('why')}</b>${esc(s.why)}</div>` : ''}<span class="kbd">${t('compareHint')}</span>`;
    if (before && after) {
      vis.innerHTML = `<div class="cam" data-cmp="${s.after.shot}"><div class="cmp" style="--cut:50%" tabindex="0" role="slider" aria-label="${t('compareAria')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"><img src="${shotSrc(s.before.shot)}" alt="${esc(s.before.label)}" draggable="false"><img class="after" src="${shotSrc(s.after.shot)}" alt="${esc(s.after.label)}" draggable="false"><span class="handle"></span><span class="lbl b">${esc(s.before.label)}</span><span class="lbl a">${esc(s.after.label)}</span></div></div>`;
      bindCompare();
    } else vis.innerHTML = camHtml(s.after.shot, s.title, []);
  } else if (s.type === 'concept') {
    panel.innerHTML = `${tags}<h2>${esc(s.title)}</h2><p class="lead">${esc(s.lead)}</p>
      <ol class="points">${s.points.map((p, i) => `<li data-p="${i}"><span class="num" style="background:var(--thread)">${i + 1}</span><span>${esc(p[0])}</span></li>`).join('')}</ol>
      ${s.why ? `<div class="why"><b>${t('why')}</b>${esc(s.why)}</div>` : ''}`;
    vis.innerHTML = `<div class="concept">${DIAGRAMS[s.diagram]()}</div>`;
  } else {
    const nums = pinNumbers(s.shot, s.points);
    panel.innerHTML = `${tags}<h2>${esc(s.title)}</h2><p class="lead">${esc(s.lead)}</p>
      <ol class="points">${(s.points || []).map((p, i) => `<li data-p="${i}">${nums[i] ? `<span class="num">${nums[i]}</span>` : '<span class="dash"></span>'}<span>${esc(p[0])}</span></li>`).join('')}</ol>
      ${s.how ? `<div class="how"><b>${t('how')}</b><ol>${s.how.map(h => `<li>${esc(h)}</li>`).join('')}</ol></div>` : ''}
      ${s.why ? `<div class="why"><b>${t('why')}</b>${esc(s.why)}</div>` : ''}`;
    vis.innerHTML = camHtml(s.shot, s.title, s.points);
  }
  /* Explore mode: a question thread per chapter, saved beside the page (comments.chapter-<id>). */
  if (window.Kit && Kit.comments) {
    const ask = document.createElement('details');
    ask.className = 'ask';
    ask.innerHTML = `<summary>${esc(t('ask'))}</summary><p class="ask-hint">${esc(t('askHint'))}</p><div class="ask-thread"></div>`;
    panel.appendChild(ask);
    ask.addEventListener('toggle', () => {
      if (!ask.open || ask.dataset.mounted) return;
      ask.dataset.mounted = '1'; if (P.playing) pause();
      Kit.comments(ask.querySelector('.ask-thread'), {key: `comments.chapter-${c.id}`, compact: true, placeholder: `Ask about “${c.title}”…`});
    });
  }
  sizeCam();
  const stage = $('#p-stage'); stage.classList.remove('anim'); void stage.offsetWidth; stage.classList.add('anim');
  renderProgress();
  bindPanel();
  applyBeat();
  store.set('tour-pos', s.id);
  if (s.id) history.replaceState(null, '', '#' + s.id);
  $('#p-prev').disabled = P.idx === 0;
}

function renderProgress(){
  const cur = P.list[P.idx];
  const groups = [];
  P.list.forEach((s, i) => { const g = groups[groups.length - 1]; if (g && g.c === s.chapter) g.items.push(i); else groups.push({c: s.chapter, items:[i]}); });
  $('#p-progress').innerHTML = groups.map(g => `<button class="ch" type="button" style="--n:${g.items.length}" data-go-index="${g.items[0]}" aria-label="${esc(t('chapterAria', {n: g.c.index + 1, title: g.c.title}))}">${g.items.map(i => `<i class="${i < P.idx ? 'past' : i === P.idx ? 'now' : ''}"></i>`).join('')}</button>`).join('');
  const left = P.list.slice(P.idx).reduce((n, s) => n + slideMs(s), 0) / P.speed;
  $('#p-time').textContent = t('timeLeft', {time: fmt(left)});
  $('#p-menu').innerHTML = chapters.map(c => {
    const i = P.list.findIndex(s => s.chapter === c);
    if (i < 0) return '';
    return `<button type="button" data-go-index="${i}" class="${cur.chapter === c ? 'cur' : ''}"><span class="n">${c.index + 1}</span><span>${esc(c.title)}</span><span class="d">${c.slides.filter(s => inList(P.role, s)).length}</span></button>`;
  }).join('');
}

/* ---------- Beats: spotlight, camera, subtitle ---------- */
function focusCam(rect, pinIndex){
  const cam = $('#p-visual .cam'); if (!cam) return;
  const layer = cam.querySelector('.layer'), spot = cam.querySelector('.spot');
  cam.querySelectorAll('.pin').forEach(p => p.classList.toggle('on', +p.dataset.p === pinIndex));
  if (!layer) return;
  if (!rect) { layer.style.transform = ''; layer.style.setProperty('--s', 1); if (spot) spot.classList.remove('on'); return; }
  const [x, y, w, h] = rect;
  const k = +cam.dataset.k || 1;   /* visible share of the picture's height */
  const zoom = P.mode === 'watch' ? Math.max(1, Math.min(2.2, 55 / Math.max(w, h / k))) : 1;
  const cx = x + w / 2, cy = y + h / 2;
  const tx = Math.min(0, Math.max(100 - 100 * zoom, 50 - cx * zoom));
  const ty = Math.min(0, Math.max(100 * k - 100 * zoom, 50 * k - cy * zoom));
  layer.style.transform = `translate(${tx}%, ${ty}%) scale(${zoom})`;
  layer.style.setProperty('--s', zoom);
  if (spot) { Object.assign(spot.style, {left:`${x}%`, top:`${y}%`, width:`${w}%`, height:`${h}%`}); spot.classList.add('on'); }
}
function rectFor(shotId, pinName){
  const info = shotInfo(shotId); if (!info || !pinName) return null;
  if (info.rects && info.rects[pinName]) return info.rects[pinName];
  const p = info.pins[pinName]; if (!p) return null;
  return [Math.max(0, p[0] - 7), Math.max(0, p[1] - 7), 14, 14];
}
/* The watch-mode caption: one line at a time, words rising in. */
function caption(kick, text, cls='', sub='', i=-1, n=0){
  const el = $('#p-cap'), key = [P.idx, kick, text].join('|');
  if (el.dataset.k === key) return;
  el.dataset.k = key; el.className = `cap ${cls}`;
  const words = String(text || '').split(' ').map((w, k) => `<span style="animation-delay:${Math.min(k * 24, 520)}ms">${esc(w)}</span>`).join(' ');
  el.innerHTML = `<span class="cap-k">${esc(kick)}</span><p class="cap-t">${words}</p>${sub ? `<p class="cap-s">${esc(sub)}</p>` : ''}
    ${n > 1 ? `<span class="cap-d">${Array.from({length: n}, (_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</span>` : ''}`;
}
function markPoint(i){ document.querySelectorAll('#p-panel [data-p]').forEach(li => li.classList.toggle('on', +li.dataset.p === i)); }

function applyBeat(){
  const s = P.list[P.idx]; if (!s) return;
  const beats = beatsOf(s), b = beats[Math.min(P.beat, beats.length - 1)], c = s.chapter;
  const why = $('#p-panel .why'); if (why) why.classList.toggle('on', b.kind === 'why');
  const n = (s.steps || s.points || []).length;
  if (b.kind === 'opener') caption(t('chapterOf', {n: c.index + 1, total: chapters.length}), c.intro);
  else if (b.kind === 'intro') caption(`${c.title} · ${c.index + 1}.${s.si + 1}`, s.title, 'title', s.lead);
  else if (b.kind === 'why') caption(t('why'), s.why, 'why');
  else if (b.kind === 'sweep') caption(s.title, `${s.before.label} → ${s.after.label}`);
  else if (b.kind === 'step') caption(`${s.title} · ${t('stepOf', {n: b.i + 1, total: n})}`, s.steps[b.i].text, '', '', b.i, n);
  else caption(s.title, s.points[b.i][0], '', '', b.i, n);
  if (s.type === 'steps') {
    const i = b.kind === 'step' ? b.i : 0;
    const st = s.steps[i];
    const cam = $('#p-visual .cam');
    if (!cam || cam.dataset.shot !== st.shot) { $('#p-visual').innerHTML = camHtml(st.shot, st.text, [], false); sizeCam(); }
    markPoint(b.kind === 'step' ? i : -1);
    focusCam(b.kind === 'step' ? rectFor(st.shot, st.pin) : null, -1);
  } else if (s.type === 'compare') {
    const cmp = $('#p-visual .cmp');
    if (cmp && P.playing && b.kind === 'sweep' && !cmp.dataset.user) sweepCompare(cmp, P.beatStart, b.ms / P.speed);
    markPoint(b.kind === 'point' ? b.i : -1);
  } else if (s.type === 'concept') {
    const stage = b.kind === 'point' ? b.i : b.kind === 'why' ? s.points.length - 1 : -1;
    document.querySelectorAll('#p-visual .st').forEach(el => { const k = +el.dataset.st; el.classList.toggle('on', P.mode === 'explore' && stage < 0 ? true : k <= stage); el.classList.toggle('now', k === stage); });
    markPoint(b.kind === 'point' ? b.i : -1);
  } else if (s.type !== 'opener') {
    if (b.kind === 'point') { const p = s.points[b.i]; markPoint(b.i); focusCam(rectFor(s.shot, p[1]), b.i); }
    else { markPoint(-1); focusCam(null, -1); }
  }
}
function sweepCompare(cmp, start, dur){
  const run = now => {
    if ($('#p-visual .cmp') !== cmp || !P.playing || cmp.dataset.user) return;
    const t = Math.min(1, (now - start) / dur);
    const e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    cmp.style.setProperty('--cut', `${(95 - 90 * e).toFixed(2)}%`);
    if (t < 1) requestAnimationFrame(run);
  };
  requestAnimationFrame(run);
}
/* The before/after slider is its own control: dragging it (or its arrow keys while it has
   focus) never changes slide or mode; it only pauses playback so the sweep doesn't fight the hand. */
function bindCompare(){
  const cmp = $('#p-visual .cmp'); if (!cmp) return;
  const cut = () => parseFloat(cmp.style.getPropertyValue('--cut')) || 50;
  const setCut = v => { v = Math.min(100, Math.max(0, v)); cmp.style.setProperty('--cut', `${v}%`); cmp.setAttribute('aria-valuenow', Math.round(v)); };
  const fromX = x => { const r = cmp.getBoundingClientRect(); setCut((x - r.left) / r.width * 100); };
  const take = () => { cmp.dataset.user = '1'; if (P.playing) pause(); };
  let drag = false;
  const end = e => { drag = false; if (e && e.pointerId !== undefined && cmp.hasPointerCapture(e.pointerId)) cmp.releasePointerCapture(e.pointerId); };
  cmp.addEventListener('pointerdown', e => { if (e.button > 0) return; drag = true; take(); cmp.setPointerCapture(e.pointerId); fromX(e.clientX); cmp.focus({preventScroll:true}); e.preventDefault(); });
  cmp.addEventListener('pointermove', e => { if (drag) fromX(e.clientX); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => cmp.addEventListener(t, end));
  cmp.addEventListener('click', e => e.stopPropagation());
  ['touchstart', 'touchend'].forEach(t => cmp.addEventListener(t, e => e.stopPropagation(), {passive:true}));
  cmp.addEventListener('keydown', e => {
    const d = e.key === 'ArrowLeft' ? -5 : e.key === 'ArrowRight' ? 5 : e.key === 'Home' ? -100 : e.key === 'End' ? 100 : 0;
    if (!d) return;
    e.preventDefault(); e.stopPropagation(); take(); setCut(cut() + d);
  });
}
function bindPanel(){
  $('#p-panel').querySelectorAll('[data-p]').forEach(li => {
    li.addEventListener('mouseenter', () => { if (P.mode === 'explore') gotoPoint(+li.dataset.p); });
    li.addEventListener('click', () => { if (P.mode === 'watch') setMode('explore'); gotoPoint(+li.dataset.p); });
  });
  $('#p-panel').querySelectorAll('[data-go]').forEach(li => li.addEventListener('click', () => { P.idx = P.list.findIndex(x => x.id === li.dataset.go); renderSlide(); }));
  $('#p-visual').querySelectorAll('.pin').forEach(pin => pin.addEventListener('click', e => { e.stopPropagation(); if (P.mode === 'watch') setMode('explore'); gotoPoint(+pin.dataset.p); }));
}
function gotoPoint(i){
  const s = P.list[P.idx]; const beats = beatsOf(s);
  const k = beats.findIndex(b => (b.kind === 'point' || b.kind === 'step') && b.i === i);
  if (k >= 0) { P.beat = k; P.elapsed = 0; P.beatStart = performance.now(); applyBeat(); }
}

/* ---------- Clock ---------- */
/* ---------- Pre-loading: the pictures of the next slides are fetched ahead, and the tour waits
   (for a limited time) rather than showing a slide whose pictures have not arrived. ---------- */
const AHEAD = 4, WAIT_MS = 12000;
const loaded = new Map();   /* shot id -> true once loaded (or failed), false while loading */
function slideShots(sl){
  if (!sl) return [];
  const ids = sl.type === 'opener' ? chapterShots(sl.chapter).slice(0, 3) : sl.type === 'steps' ? sl.steps.map(st => st.shot)
    : sl.type === 'compare' ? [sl.before.shot, sl.after.shot] : sl.type === 'concept' ? [] : [sl.shot];
  return [...new Set(ids)].filter(shotInfo);
}
function preload(sl){
  slideShots(sl).forEach(id => {
    if (loaded.has(id)) return;
    loaded.set(id, false);
    const im = new Image();
    im.onload = im.onerror = () => loaded.set(id, true);
    im.src = shotSrc(id);
  });
}
const ready = sl => slideShots(sl).every(id => loaded.get(id) === true);
function preloadAhead(){ for (let k = 0; k <= AHEAD; k++) preload(P.list[P.idx + k]); }
let waitSince = 0;
const gaveUp = new Set();   /* slides the tour stopped waiting for */
/* True while the tour should hold: the clock is frozen and a small note shows. */
function holdFor(sl, now){
  if (ready(sl) || gaveUp.has(sl.id)) { waitSince = 0; $('#p-loading').hidden = true; return false; }
  preload(sl);
  if (!waitSince) waitSince = now;
  if (now - waitSince > WAIT_MS) { gaveUp.add(sl.id); waitSince = 0; $('#p-loading').hidden = true; return false; }   /* go on without them */
  $('#p-loading').hidden = false;
  return true;
}

function tick(now){
  if (!P.playing) return;
  const s = P.list[P.idx], beats = beatsOf(s), b = beats[P.beat];
  if (holdFor(s, now)) { P.beatStart = now; P.raf = requestAnimationFrame(tick); return; }
  const t = P.elapsed + (now - P.beatStart) * P.speed;
  const done = beats.slice(0, P.beat).reduce((n, x) => n + x.ms, 0) + Math.min(t, b.ms);
  const bar = document.querySelector('#p-progress i.now'); if (bar) bar.style.setProperty('--fill', `${(done / slideMs(s) * 100).toFixed(1)}%`);
  if (t >= b.ms) {
    if (P.beat < beats.length - 1) { P.beat++; P.elapsed = 0; P.beatStart = now; applyBeat(); }
    else if (P.idx < P.list.length - 1) {
      /* Stay on this slide until the next one's pictures are there. */
      if (holdFor(P.list[P.idx + 1], now)) { P.elapsed = b.ms; P.beatStart = now; P.raf = requestAnimationFrame(tick); return; }
      P.idx++; renderSlide();
    }
    else { pause(); return; }
  }
  P.raf = requestAnimationFrame(tick);
}
function play(){ if (P.playing) return; P.playing = true; markMode('watch'); P.beatStart = performance.now(); $('#p-play').innerHTML = PAUSE; $('#p-play').setAttribute('aria-label', t('pause')); applyBeat(); P.raf = requestAnimationFrame(tick); }
function pause(){ if (P.playing) P.elapsed += (performance.now() - P.beatStart) * P.speed; P.playing = false; cancelAnimationFrame(P.raf); $('#p-play').innerHTML = PLAY; $('#p-play').setAttribute('aria-label', t('play')); }
/* ← → move one animation step (intro, each point, why) in both modes; at either end of a
   slide they move to the neighbouring slide. Playback keeps running from the new step. */
function step(d){
  const beats = beatsOf(P.list[P.idx]), k = P.beat + d;
  if (k >= 0 && k < beats.length) { P.beat = k; P.elapsed = 0; P.beatStart = performance.now(); applyBeat(); return; }
  const n = P.idx + d;
  if (n < 0) return;
  if (n >= P.list.length) { closePlayer(); return; }
  P.idx = n; renderSlide();
}

/* ---------- Controls ---------- */
$('#p-play').onclick = () => P.playing ? pause() : play();
$('#p-prev').onclick = () => step(-1);
$('#p-next').onclick = () => step(1);
$('#p-close').onclick = closePlayer;
$('#p-speed').onclick = () => { const i = (SPEEDS.indexOf(P.speed) + 1) % SPEEDS.length; if (P.playing) { P.elapsed += (performance.now() - P.beatStart) * P.speed; P.beatStart = performance.now(); } P.speed = SPEEDS[i]; store.set('tour-speed', P.speed); $('#p-speed').textContent = `${P.speed}×`; renderProgress(); renderTimes(); renderGallery(); };
document.querySelectorAll('.mode button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
$('#p-menu-btn').onclick = () => { const m = $('#p-menu'); m.hidden = !m.hidden; $('#p-menu-btn').setAttribute('aria-expanded', String(!m.hidden)); };
$('#p-menu').addEventListener('click', e => { const b = e.target.closest('[data-go-index]'); if (b) { P.idx = +b.dataset.goIndex; $('#p-menu').hidden = true; renderSlide(); } });
$('#p-progress').addEventListener('click', e => { const b = e.target.closest('[data-go-index]'); if (b) { P.idx = +b.dataset.goIndex; renderSlide(); } });
$('#p-full').onclick = () => { const el = document.documentElement; if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {}); else if (document.exitFullscreen) document.exitFullscreen().catch(() => {}); };
$('#p-visual').addEventListener('click', e => {
  const cam = e.target.closest('.cam[data-shot]'); if (!cam || e.target.closest('.pin')) return;
  openZoom(cam.dataset.shot);
});
function openZoom(id){
  const info = shotInfo(id); if (!info) return;
  if (P.playing) pause();
  const z = $('#zoom');
  z.innerHTML = `<img src="${shotSrc(id)}" alt="" style="width:${Math.round(info.w / (info.scale || 1))}px"><span class="kbd">${t('zoomClose')}</span>`;
  z.hidden = false; z.focus();
}
$('#zoom').addEventListener('click', () => { $('#zoom').hidden = true; });
document.addEventListener('keydown', e => {
  if (!$('#zoom').hidden) { if (e.key === 'Escape') $('#zoom').hidden = true; return; }
  if ($('#player').hidden) return;
  if (e.key === ' ' || e.key === 'k') { e.preventDefault(); P.playing ? pause() : play(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  else if (e.key === 'Escape') { if (!$('#p-menu').hidden) $('#p-menu').hidden = true; else closePlayer(); }
});
let sx = null;
$('#p-visual').addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, {passive:true});
$('#p-visual').addEventListener('touchend', e => { if (sx === null || e.target.closest('.cmp')) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 60) step(dx < 0 ? 1 : -1); sx = null; });
window.addEventListener('resize', () => { if (!$('#player').hidden) { sizeCam(); applyBeat(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden && P.playing) pause(); });


/* ---------- Concept diagrams (inline SVG, stages revealed per point) ---------- */
function box(x, y, w, h, title, sub, st, extra=''){
  return `<g class="st" data-st="${st}"><rect class="box" x="${x}" y="${y}" width="${w}" height="${h}" rx="14"/>${extra}
    <text class="t-h" x="${x + w / 2}" y="${y + h / 2 - (sub ? 6 : -6)}" text-anchor="middle" font-size="${Math.min(19, Math.floor(w * 1.55 / String(title).length))}">${esc(title)}</text>
    ${sub ? `<text class="t-m" x="${x + w / 2}" y="${y + h / 2 + 18}" text-anchor="middle" font-size="13">${esc(sub)}</text>` : ''}</g>`;
}
const arrow = (x1, x2, y, st) => `<g class="st" data-st="${st}"><path class="wire" d="M${x1} ${y} L${x2} ${y}"/><path class="tip" d="M${x2 - 9} ${y - 6} L${x2} ${y} L${x2 - 9} ${y + 6}"/></g>`;
const DIAGRAMS = {
  /* The loop: an agent publishes, the library keeps it, a reader answers, the agent reads it back. */
  loop(){
    const D = CONTENT.diagrams.loop, xs = [24, 212, 400, 588, 776], w = 168, y = 120, h = 104;
    let g = `<g class="st" data-st="0"><text class="t-k" x="24" y="70" font-size="14">${esc(D.kicker)}</text></g>`;
    D.boxes.forEach(([title, sub], i) => { g += box(xs[i], y, w, h, title, sub, i); if (i < 4) g += arrow(xs[i] + w, xs[i + 1], y + h / 2, i + 1); });
    g += `<g class="st" data-st="4"><path class="wire" d="M${xs[4] + w / 2} ${y + h} V330 H${xs[0] + w / 2} V${y + h}"/><path class="tip" d="M${xs[0] + w / 2 - 6} ${y + h + 9} L${xs[0] + w / 2} ${y + h} L${xs[0] + w / 2 + 6} ${y + h + 9}"/>
      <rect class="box pill" x="304" y="306" width="360" height="48" rx="24"/><text class="t-h" x="484" y="336" text-anchor="middle" font-size="16">${esc(D.back)}</text></g>`;
    return `<svg viewBox="0 0 968 400" role="img" aria-label="${esc(D.aria)}">${g}</svg>`;
  },
  /* What the server stores: immutable versions, and saved data beside them. */
  store(){
    const D = CONTENT.diagrams.store;
    let g = `<g class="st" data-st="0"><text class="t-k" x="40" y="54" font-size="14">${esc(D.kicker)}</text></g>`;
    D.versions.forEach((v, i) => { g += box(40 + i * 170, 80, 150, 96, v[0], v[1], 0, `<rect class="ver" x="${40 + i * 170}" y="80" width="150" height="8" rx="4"/>`); });
    g += box(40, 222, 490, 74, D.latest[0], D.latest[1], 1);
    g += `<g class="st" data-st="1"><path class="wire" d="M455 222 V176"/></g>`;
    g += box(600, 80, 328, 216, D.data[0], D.data[1], 2, `<text class="t-m" x="764" y="236" text-anchor="middle" font-size="13">${esc(D.keys)}</text>`);
    g += `<g class="st" data-st="3"><rect class="box pill" x="40" y="330" width="888" height="52" rx="26"/><text class="t-h" x="484" y="362" text-anchor="middle" font-size="16">${esc(D.agent)}</text></g>`;
    return `<svg viewBox="0 0 968 410" role="img" aria-label="${esc(D.aria)}">${g}</svg>`;
  },
};

/* The artifact server injects a fixed toolbar (bottom right). Measure it and keep the player's
   controls above it; it is absent locally and in print. */
(function watchToolbar(tries){
  const host = [...document.body.children].find(e => e.shadowRoot && e.shadowRoot.querySelector('.dock'));
  if (!host) { if (tries > 0) setTimeout(() => watchToolbar(tries - 1), 250); return; }
  const set = () => document.documentElement.style.setProperty('--toolbar-h', Math.ceil(host.getBoundingClientRect().height) + 16 + 'px');
  set();
  if ('ResizeObserver' in window) new ResizeObserver(set).observe(host);
})(12);

renderTimes();
renderGallery();

/* Deep link: #<slide id> opens that slide in explore mode (after everything above is defined). */
const hash = location.hash.slice(1);
if (hash && playlist('all').some(s => s.id === hash)) openPlayer('all', hash, 'explore');
window.addEventListener('hashchange', () => {
  const h = location.hash.slice(1);
  if (!h || (P.list[P.idx] && P.list[P.idx].id === h)) return;
  if (playlist('all').some(s => s.id === h)) openPlayer('all', h, 'explore');
});
})();
