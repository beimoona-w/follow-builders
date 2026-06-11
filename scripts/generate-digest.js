#!/usr/bin/env node

// ============================================================================
// Follow Builders — Generate Digest
// ============================================================================
// Reads the JSON blob from prepare-digest.js via stdin, calls the local
// `claude` CLI (Claude Code) to generate a human-readable bilingual digest,
// and outputs the digest text to stdout.
//
// Usage: node prepare-digest.js | node generate-digest.js
// ============================================================================

import { spawn } from 'child_process';

const CLAUDE_BIN = '/opt/homebrew/bin/claude';

async function main() {
  // Read JSON blob from stdin
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf-8');

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    process.stderr.write('generate-digest: invalid JSON from stdin\n');
    process.exit(1);
  }

  if (data.status === 'error') {
    process.stderr.write(`generate-digest: upstream error: ${data.message}\n`);
    process.exit(1);
  }

  const { config, podcasts, x, blogs, prompts, stats } = data;
  const isBilingual = (config?.language || 'en') === 'bilingual';
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const hasContent = (podcasts?.length > 0) || (x?.length > 0) || (blogs?.length > 0);
  if (!hasContent) {
    process.stdout.write('No new content today.\n');
    process.exit(0);
  }

  const prompt = `Today is ${today}.

You are generating the daily AI Builders Digest. Below are the raw content feeds and the instructions for each section. Follow every instruction exactly.

---

## SUMMARIZE-TWEETS INSTRUCTIONS
${prompts.summarize_tweets || ''}

---

## SUMMARIZE-PODCAST INSTRUCTIONS
${prompts.summarize_podcast || ''}

---

## SUMMARIZE-BLOGS INSTRUCTIONS
${prompts.summarize_blogs || ''}

---

## DIGEST-INTRO INSTRUCTIONS
${prompts.digest_intro || ''}

---

${isBilingual ? `## TRANSLATE/BILINGUAL INSTRUCTIONS
${prompts.translate || ''}

---

` : ''}## CONTENT DATA

### X/TWITTER BUILDERS (${stats.xBuilders} builders, ${stats.totalTweets} tweets)
${JSON.stringify(x, null, 2)}

### OFFICIAL BLOG POSTS (${stats.blogPosts} posts)
${JSON.stringify(blogs, null, 2)}

### PODCAST EPISODES (${stats.podcastEpisodes} episodes)
${JSON.stringify(podcasts, null, 2)}

---

Now generate the complete digest. Apply all the instructions above. ${isBilingual ? 'Output must be bilingual (English + Chinese interleaved paragraph by paragraph).' : ''}
Output only the digest text itself — no preamble, no explanation, no markdown code fences.`;

  await new Promise((resolve, reject) => {
    const proc = spawn(CLAUDE_BIN, [
      '--print',
      '--dangerously-skip-permissions',
      prompt
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'cli' }
    });

    proc.stdout.pipe(process.stdout);
    proc.stderr.on('data', d => process.stderr.write(d));

    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`claude exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

main().catch(err => {
  process.stderr.write(`generate-digest error: ${err.message}\n`);
  process.exit(1);
});
