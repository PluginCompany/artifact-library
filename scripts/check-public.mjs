#!/usr/bin/env node
// Fails when files that would be published contain internal names: private hostnames,
// tailnet addresses, internal services, personal or company email addresses, customer
// projects or local paths. Scans every tracked file plus untracked files that are not
// ignored (exactly what `git add -A` would publish), including file names.
//
//   node scripts/check-public.mjs            report and exit 1 on findings
//   node scripts/check-public.mjs --summary  counts per pattern only
//
// Intentional mentions: put "check-public: allow" on the same line (or on the line
// directly above). This script itself is excluded.
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const PATTERNS = [
  ['tailnet hostname', /tail7e1d05/i],
  ['tailnet IP (CGNAT 100.64/10)', /\b100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b/],
  ['internal host shared-services', /shared-services/i],
  ['internal service personal-artifacts', /personal-artifacts/i],
  ['GitLab', /gitlab\.com/i],
  ['company email domain', /plugin\.company/i],
  ['personal email', /\bmilan@/i],
  ['internal project euroko', /euroko/i],
  ['internal host hermes', /hermes/i],
  ['customer project (sewing)', /sewing/i],
  ['internal host pc-office', /pc-office/i],
  ['internal host gmk', /\bgmk\b/i],
  ['local home path', /\/home\/milans?\b/i],
];
const ALLOW = /check-public:\s*allow/i;
const SELF = path.relative(process.cwd(), new URL(import.meta.url).pathname);
const MAX_BYTES = 8 * 1024 * 1024;

const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\0').filter(Boolean)
  .filter(f => f !== SELF && !f.startsWith('node_modules/'));

const findings = [];
const counts = new Map(PATTERNS.map(([name]) => [name, 0]));
for (const file of files) {
  for (const [name, re] of PATTERNS) if (re.test(file)) { findings.push({ file, line: 0, name, text: '(file name)' }); counts.set(name, counts.get(name) + 1); }
  let stat;
  try { stat = statSync(file); } catch { continue; } // deleted in the working tree
  if (!stat.isFile() || stat.size > MAX_BYTES) continue;
  const bytes = readFileSync(file);
  if (bytes.subarray(0, 8000).includes(0)) continue; // binary (images, fonts, archives)
  const lines = bytes.toString('utf8').split('\n');
  lines.forEach((text, i) => {
    if (ALLOW.test(text) || (i > 0 && ALLOW.test(lines[i - 1]))) return;
    for (const [name, re] of PATTERNS) {
      if (!re.test(text)) continue;
      const at = text.search(re);
      findings.push({ file, line: i + 1, name, text: text.slice(Math.max(0, at - 40), at + 60).trim() });
      counts.set(name, counts.get(name) + 1);
    }
  });
}

if (!process.argv.includes('--summary')) for (const f of findings) console.log(`${f.file}:${f.line}: ${f.name}: ${f.text}`);
const total = findings.length;
console.log(`\ncheck-public: ${files.length} files scanned, ${total} finding${total === 1 ? '' : 's'}`);
for (const [name, n] of counts) if (n) console.log(`  ${String(n).padStart(5)}  ${name}`);
process.exit(total ? 1 : 0);
