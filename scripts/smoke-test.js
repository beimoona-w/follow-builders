#!/usr/bin/env node

// ============================================================================
// Follow Builders — Smoke Test
// ============================================================================
// Renders a sample digest through deliver.js into a throwaway HOME and
// asserts the key page features survived. Run with: npm test
// ============================================================================

import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import assert from 'assert';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const home = mkdtempSync(join(tmpdir(), 'fb-smoke-'));
const outDir = join(home, 'out');

mkdirSync(join(home, '.follow-builders'), { recursive: true });
writeFileSync(
  join(home, '.follow-builders', 'config.json'),
  JSON.stringify({ delivery: { method: 'local_html', folder: outDir } })
);

const sampleDigest = [
  'AI Builders Digest — June 11, 2026',
  '',
  '今日要览：这是一段中文导语，用于验证导语区块渲染。',
  '',
  '## X / TWITTER',
  '',
  '### Test Builder (test on X)',
  'An English summary paragraph that is long enough to be collected into the briefing list for testing.',
  'https://x.com/test/status/1',
  '一段足够长的中文摘要段落，用来验证双语段落标记与速览收集是否正确工作。',
  'https://x.com/test/status/2',
  '',
  'Generated through the Follow Builders skill: https://github.com/zarazhangrui/follow-builders'
].join('\n');

const mdPath = join(home, 'sample.md');
writeFileSync(mdPath, sampleDigest);

const res = spawnSync('node', [join(scriptDir, 'deliver.js'), '--file', mdPath], {
  env: { ...process.env, HOME: home, FB_NO_OPEN: '1' },
  encoding: 'utf-8'
});
assert.strictEqual(res.status, 0, 'deliver.js failed: ' + res.stderr);

const digestFile = readdirSync(outDir).find(f => /^\d{4}-\d{2}-\d{2}\.html$/.test(f));
assert(digestFile, 'no dated digest HTML written to ' + outDir);
const html = readFileSync(join(outDir, digestFile), 'utf-8');

const mustContain = [
  ['site-title', 'masthead'],
  ['id="langSeg"', 'language toggle'],
  ['id="darkToggle"', 'dark mode toggle'],
  ['archive-link', 'archive link'],
  ['link-chip', 'source link chips'],
  ['must-read', 'briefing list'],
  ['var markdown = "', 'embedded markdown'],
  ['class="layout"', 'two-column layout wrapper']
];
for (const [needle, label] of mustContain) {
  assert(html.includes(needle), `digest page missing ${label} ("${needle}")`);
}

assert(existsSync(join(outDir, 'index.html')), 'archive index.html not generated');
const index = readFileSync(join(outDir, 'index.html'), 'utf-8');
assert(index.includes(digestFile), 'archive index does not link to the digest');
assert(index.includes('往期归档'), 'archive index missing title');

console.log('✅ smoke test passed (' + digestFile + ' + index.html)');
