import type { Page } from 'playwright';
import { ArtifactError, encodePath } from './shared.js';
import type { Previews } from './previews.js';
import type { Storage } from './storage.js';

/* Lint: render a published version in the server's headless browser (the one previews use) and report
   concrete problems an agent can fix without a browser of its own: layout, navigation, walls of text,
   chapters without anything visual, errors. One job at a time; a few may wait. */

export type Severity = 'error' | 'warning' | 'info';
export interface Finding { severity: Severity; check: string; message: string; where?: string; count?: number; width?: number }
export interface LintStats {
  words: number; chapters: number; paragraphs: number; longestParagraphWords: number; visuals: number;
  tables: number; images: number; diagrams: number; controls: number; navLinks: number;
}
export interface LintScreenshot { width: number; theme: 'light' | 'dark'; type: 'jpeg'; fullPage: boolean; height: number; data: string }
export interface LintResult { slug: string; version: number; widths: number[]; findings: Finding[]; stats: LintStats; screenshots?: LintScreenshot[] }
export interface LintOptions { version?: number; widths?: number[]; screenshots?: boolean }

const DEFAULT_WIDTHS = [1440, 390];
const MAX_WAITING = 3;
const JOB_TIMEOUT = 90_000;
const SHOT_MAX_HEIGHT = 12_000;

/** Runs inside the rendered page. Returns findings that depend on the content plus statistics. */
const contentChecks = () => {
  type F = { severity: 'error' | 'warning' | 'info'; check: string; message: string; where?: string; count?: number };
  const findings: F[] = [];
  const words = (text: string) => (text.trim().match(/\S+/g) || []).length;
  const shown = (el: Element) => {
    if (!el.getClientRects().length) return false;
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
  };
  const snippet = (el: Element) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70);
  const label = (el: Element) => {
    const id = el.id ? '#' + el.id : '';
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return el.tagName.toLowerCase() + id + cls;
  };
  const VISUAL = 'table, svg, img, picture, video, canvas, figure, pre, [data-flow], [data-chart], .chart, .chart-card, .ba, .delta, .stats, .steps, .timeline, .flow, .cards, details, [role="radiogroup"], .grid, .cols-2, .cols-3, .cols-4, .auto-grid';
  const isVisual = (el: Element) => el.matches(VISUAL) || ((el.matches('ul, ol')) && el.querySelectorAll(':scope > li').length >= 3);

  if (!document.title.trim()) findings.push({ severity: 'error', check: 'missing-title', message: 'The page has no <title>. Give it a name of a few words.' });
  if (!document.querySelector('meta[name="description"][content]')?.getAttribute('content')?.trim())
    findings.push({ severity: 'warning', check: 'missing-description', message: 'No <meta name="description">: add one sentence that says what the reader gets.' });

  // Chapters are the visible h2 headings; a deck shows one slide at a time, so hidden slides do not count.
  const chapters = Array.from(document.querySelectorAll('h2')).filter(shown);
  const anchorOf = (h: Element) => h.id || h.closest('section[id], article[id], div[id]')?.id || '';
  const navSelector = 'nav, [role="navigation"], .topnav, .side, .toc, [data-toc], header';
  const navs = Array.from(document.querySelectorAll(navSelector)).filter(shown);
  const navLinks = navs.flatMap(n => Array.from(n.querySelectorAll('a[href]')));
  const navTargets = new Set(navLinks.map(a => decodeURIComponent((a.getAttribute('href') || '').split('#')[1] || '')).filter(Boolean));
  const pageLinks = new Set(navLinks.map(a => (a.getAttribute('href') || '').split('#')[0]).filter(h => h && !/^(https?:)?\/\//.test(h) && !h.startsWith('/')));
  const scriptNav = navs.some(n => n.querySelectorAll('button, [role="tab"]').length >= 3); // chapter buttons that scroll by script
  const targetElements = Array.from(navTargets).map(id => document.getElementById(id)).filter((e): e is HTMLElement => Boolean(e));
  // A chapter is linked when the navigation points at its heading, at an element around it, or into it.
  const linked = (h: Element, i: number) => {
    for (let e: Element | null = h; e && e !== document.body; e = e.parentElement) if (e.id && navTargets.has(e.id)) return true;
    const range = document.createRange(); range.setStartBefore(h);
    const next = chapters[i + 1]; if (next) range.setEndBefore(next); else range.setEndAfter(document.body.lastChild || document.body);
    return targetElements.some(t => range.intersectsNode(t));
  };
  if (chapters.length >= 3) {
    const covered = chapters.filter(linked).length;
    if (covered / chapters.length < 0.5) {
      if ((pageLinks.size >= 2 || scriptNav) && chapters.length < 5) { /* page menu or script-driven chapter nav: fine for a short page */ }
      else if (pageLinks.size >= 2 || scriptNav) findings.push({ severity: 'warning', check: 'chapters-not-in-nav', message: `${chapters.length} chapters on this page but the menu only links pages: add the chapters to a side nav or table of contents.`, count: chapters.length - covered });
      else findings.push({ severity: 'error', check: 'no-global-nav', message: `${chapters.length} chapters but no navigation to them (${covered} linked): add a sticky top bar or side nav with a link to every chapter.`, count: chapters.length - covered });
    }
  }
  const unlinkable = chapters.filter(h => !anchorOf(h));
  if (unlinkable.length) findings.push({ severity: 'warning', check: 'heading-without-id', message: 'Chapter headings without an id (or a section with an id) cannot be linked or put in the navigation.', where: snippet(unlinkable[0]), count: unlinkable.length });

  const paragraphs = Array.from(document.querySelectorAll('p, li')).filter(shown);
  const walls = paragraphs.filter(p => !p.querySelector('p, li') && words(p.textContent || '') > 110);
  if (walls.length) findings.push({ severity: 'warning', check: 'wall-of-text', message: `Paragraph of ${words(walls[0].textContent || '')} words: split it, or turn it into a list, table or diagram (aim for at most ~80 words).`, where: snippet(walls[0]), count: walls.length });

  // A long chapter needs something to look at: a table, diagram, chart, list, code or figure.
  const bare: string[] = [];
  chapters.forEach((h, i) => {
    const range = document.createRange();
    range.setStartBefore(h);
    const next = chapters[i + 1];
    if (next) range.setEndBefore(next); else range.setEndAfter(document.querySelector('main') || document.body.lastElementChild || document.body);
    const chapterWords = words(range.toString());
    if (chapterWords <= 300) return;
    const hasVisual = Array.from(document.querySelectorAll(VISUAL + ', ul, ol')).some(v => isVisual(v) && shown(v) && range.intersectsNode(v) && !v.closest('nav, .side, .topbar, header'));
    if (!hasVisual) bare.push(`${snippet(h)} (${chapterWords} words)`);
  });
  if (bare.length) findings.push({ severity: 'warning', check: 'chapter-without-visual', message: 'Long chapter with only text: show it as a table, diagram, chart, steps or a list.', where: bare[0], count: bare.length });

  // Runs of plain paragraphs with no heading, list or visual in between.
  const blocks = Array.from(document.querySelectorAll('p, h1, h2, h3, h4, ul, ol, table, figure, pre, svg, img, .chart-card, .callout, details, .card, .panel')).filter(shown).filter(b => !b.closest('nav, .side, .topbar'));
  let run = 0, start: Element | undefined, longestRun = 0, longestStart: Element | undefined;
  for (const block of blocks) {
    if (block.matches('p') && !block.closest('li, td, .callout, .card, .panel')) { if (!run) start = block; run++; if (run > longestRun) { longestRun = run; longestStart = start; } }
    else if (!block.closest('p')) run = 0;
  }
  if (longestRun > 6 && longestStart) findings.push({ severity: 'warning', check: 'paragraph-run', message: `${longestRun} paragraphs in a row with no heading, list or visual: break them up.`, where: snippet(longestStart), count: longestRun });

  const noAlt = Array.from(document.querySelectorAll('img:not([alt])'));
  if (noAlt.length) findings.push({ severity: 'warning', check: 'image-without-alt', message: 'Images without an alt attribute (use alt="" for decoration).', where: noAlt[0].getAttribute('src') || label(noAlt[0]), count: noAlt.length });

  const tiny = paragraphs.concat(Array.from(document.querySelectorAll('td, dd')).filter(shown))
    .filter(el => words(el.textContent || '') >= 4 && parseFloat(getComputedStyle(el).fontSize) < 12);
  if (tiny.length) findings.push({ severity: 'warning', check: 'small-text', message: `Body text under 12 px (${getComputedStyle(tiny[0]).fontSize}) is hard to read.`, where: snippet(tiny[0]), count: tiny.length });

  const visible = (selector: string) => Array.from(document.querySelectorAll(selector)).filter(shown).length;
  const longest = paragraphs.reduce((m, p) => Math.max(m, p.querySelector('p, li') ? 0 : words(p.textContent || '')), 0);
  const stats = {
    words: words(document.body.innerText || ''), chapters: chapters.length, paragraphs: visible('p'), longestParagraphWords: longest,
    visuals: Array.from(document.querySelectorAll(VISUAL + ', ul, ol')).filter(v => isVisual(v) && shown(v)).length,
    tables: visible('table'), images: visible('img, picture, video'), diagrams: visible('svg, canvas, [data-flow], .chart'),
    controls: visible('button, input, select, textarea'), navLinks: navTargets.size
  };
  return { findings, stats };
};

/** Runs inside the page at each width: horizontal overflow and the element that causes it. */
const overflowCheck = () => {
  const width = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth <= width + 1) return null;
  const clipped = (el: Element) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true; } return false; };
  const culprit = Array.from(document.body.querySelectorAll('*')).find(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > width + 1 && getComputedStyle(el).position !== 'fixed' && !clipped(el); });
  const where = culprit ? culprit.tagName.toLowerCase() + (culprit.id ? '#' + culprit.id : '') + (typeof culprit.className === 'string' && culprit.className.trim() ? '.' + culprit.className.trim().split(/\s+/)[0] : '') : undefined;
  return { scrollWidth: document.documentElement.scrollWidth, where };
};

/** Evaluate a function in the page from its source. Builds that keep function names (tsx, esbuild) wrap
    nested functions in a __name() helper that pages do not have, so define it first. */
function inPage<T>(page: Page, fn: () => T): Promise<T> {
  return page.evaluate(`(() => { const __name = (f) => f; return (${fn.toString()})(); })()`) as Promise<T>;
}

export class Linter {
  private chain: Promise<unknown> = Promise.resolve();
  private waiting = 0;
  constructor(private storage: Storage, private previews: Previews) {}

  get available() { return this.previews.available; }

  async lint(slug: string, options: LintOptions = {}): Promise<LintResult> {
    if (!this.previews.available) throw new ArtifactError('LINT_UNAVAILABLE', 'Lint renders pages in the server\'s headless browser, which is off on this server (PREVIEWS=false or the slim image).', 501);
    const artifact = await this.storage.get(slug);
    if (artifact.archivedAt) throw new ArtifactError('ARTIFACT_ARCHIVED', `Artifact is archived: ${slug}`, 410);
    const metadata = await this.storage.version(slug, options.version ?? artifact.latestVersion);
    const widths = [...new Set((options.widths?.length ? options.widths : DEFAULT_WIDTHS).map(Number))];
    if (widths.length > 4 || widths.some(w => !Number.isInteger(w) || w < 320 || w > 2560)) throw new ArtifactError('INVALID_LINT_OPTIONS', 'widths: up to 4 whole numbers between 320 and 2560');
    if (this.waiting >= MAX_WAITING) throw new ArtifactError('LINT_BUSY', 'The server is linting other pages; try again in a minute.', 429);
    this.waiting++;
    const job = this.chain.then(() => { this.waiting--; return this.withTimeout(this.run(slug, metadata.version, metadata.entry, widths, Boolean(options.screenshots))); });
    this.chain = job.catch(() => {});
    return job;
  }

  private async withTimeout<T>(work: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new ArtifactError('LINT_TIMEOUT', 'Rendering the page took too long.', 504)), JOB_TIMEOUT); });
    try { return await Promise.race([work, timeout]); } finally { clearTimeout(timer); }
  }

  private async run(slug: string, version: number, entry: string, widths: number[], screenshots: boolean): Promise<LintResult> {
    const browser = await this.previews.launch().catch(error => { throw new ArtifactError('LINT_UNAVAILABLE', `Could not start the headless browser: ${(error as Error).message.split('\n')[0]}`, 503); });
    const origin = this.previews.renderOrigin;
    const base = `/artifacts/${slug}/_versions/${version}/`;
    const target = origin + base + encodePath(entry);
    const findings: Finding[] = [];
    const shots: LintScreenshot[] = [];
    let stats: LintStats | undefined;
    const errors = new Map<string, number>(), missingFiles = new Map<string, number>(), external = new Set<string>();
    const count = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
    const ordered = [...widths].sort((a, b) => b - a); // widest first: content checks run there
    for (const width of ordered) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce', serviceWorkers: 'block', extraHTTPHeaders: { 'X-Artifact-Render-Mode': 'preview' } });
      try {
        const page = await context.newPage();
        page.on('pageerror', error => count(errors, error.message.split('\n')[0]));
        page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) count(errors, message.text().split('\n')[0]); });
        page.on('response', response => {
          const url = new URL(response.url());
          if (url.origin === origin && url.pathname.startsWith(base) && response.status() >= 400) count(missingFiles, decodeURIComponent(url.pathname.slice(base.length)));
        });
        page.on('requestfailed', request => {
          const url = new URL(request.url());
          if (url.origin === origin && url.pathname.startsWith(base)) count(missingFiles, decodeURIComponent(url.pathname.slice(base.length)));
          else if (url.origin !== origin) external.add(url.origin);
        });
        const response = await page.goto(target, { waitUntil: 'load', timeout: 20_000 }).catch(() => page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15_000 }));
        if (!response?.ok()) throw new ArtifactError('LINT_FAILED', `The entry page returned HTTP ${response?.status()}`, 502);
        await settle(page);
        const overflow = await inPage(page, overflowCheck);
        if (overflow) findings.push({ severity: 'error', check: 'horizontal-overflow', width, message: `At ${width} px the page scrolls sideways (${overflow.scrollWidth} px wide). Wrap or stack the element, or give it its own overflow-x:auto container.`, where: overflow.where });
        if (!stats) { const result = await inPage(page, contentChecks); stats = result.stats; findings.push(...result.findings); }
        if (screenshots) shots.push(await screenshot(page, width, 'light'));
        if (screenshots && width === ordered[ordered.length - 1]) {
          await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(300);
          shots.push(await screenshot(page, width, 'dark'));
        }
      } finally { await context.close().catch(() => {}); }
    }
    for (const [message, n] of errors) findings.push({ severity: 'error', check: 'script-error', message, count: n });
    for (const [file, n] of missingFiles) findings.push({ severity: 'error', check: 'missing-file', message: `The page asks for a file that is not in this version: ${file}`, where: file, count: n });
    if (external.size) findings.push({ severity: 'warning', check: 'external-request-failed', message: `Requests to other sites failed: ${[...external].join(', ')}. Bundle fonts, scripts and images with the artifact so it works offline and inside private networks.`, count: external.size });
    const order: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
    findings.sort((a, b) => order[a.severity] - order[b.severity]);
    const result: LintResult = { slug, version, widths: ordered, findings, stats: stats! };
    if (screenshots) result.screenshots = shots;
    return result;
  }
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    await Promise.race([
      Promise.all([document.fonts.ready, ...Array.from(document.images).map(image => image.complete ? Promise.resolve() : new Promise(resolve => { image.onload = resolve; image.onerror = resolve; }))]),
      new Promise(resolve => setTimeout(resolve, 3000))
    ]);
  });
  await page.waitForTimeout(700);
}

async function screenshot(page: Page, width: number, theme: 'light' | 'dark'): Promise<LintScreenshot> {
  const height = Math.min(SHOT_MAX_HEIGHT, await page.evaluate(() => document.documentElement.scrollHeight));
  const buffer = await page.screenshot({ type: 'jpeg', quality: 70, fullPage: true, clip: { x: 0, y: 0, width, height }, animations: 'disabled', timeout: 20_000 });
  return { width, theme, type: 'jpeg', fullPage: true, height, data: buffer.toString('base64') };
}
