#!/usr/bin/env node

// ============================================================================
// Follow Builders — Delivery Script (Enhanced SaaS UI Edition v2)
// ============================================================================
// Improvements:
//   1. Historical archive index page
//   2. Dark mode toggle
//   3. Keyword highlighting for AI terms
//   4. "Today's Must-Read" summary section
//   5. Full Telegram & Email delivery restored
//   6. Failure notification via macOS dialog (handled by wrapper script)
// ============================================================================

import { readFile, mkdir, writeFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { exec } from 'child_process';
import { config as loadEnv } from 'dotenv';

// -- Constants ---------------------------------------------------------------

const USER_DIR = join(homedir(), '.follow-builders');
const CONFIG_PATH = join(USER_DIR, 'config.json');
const ENV_PATH = join(USER_DIR, '.env');

// -- Read input --------------------------------------------------------------

async function getDigestText() {
  const args = process.argv.slice(2);
  const msgIdx = args.indexOf('--message');
  if (msgIdx !== -1 && args[msgIdx + 1]) return args[msgIdx + 1];
  const fileIdx = args.indexOf('--file');
  if (fileIdx !== -1 && args[fileIdx + 1]) return await readFile(args[fileIdx + 1], 'utf-8');

  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8');
}

// -- Telegram Delivery -------------------------------------------------------

async function sendTelegram(text, botToken, chatId) {
  const MAX_LEN = 4000;
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= MAX_LEN) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf('\n', MAX_LEN);
    if (splitAt < MAX_LEN * 0.5) splitAt = MAX_LEN;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }

  for (const chunk of chunks) {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunk,
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        })
      }
    );

    if (!res.ok) {
      const err = await res.json();
      if (err.description && err.description.includes("can't parse")) {
        await fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: chunk,
              disable_web_page_preview: true
            })
          }
        );
      } else {
        throw new Error(`Telegram API error: ${err.description}`);
      }
    }

    if (chunks.length > 1) await new Promise(r => setTimeout(r, 500));
  }
}

// -- Email Delivery (Resend) -------------------------------------------------

async function sendEmail(text, apiKey, toEmail) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      from: 'AI Builders Digest <digest@resend.dev>',
      to: [toEmail],
      subject: `AI Builders Digest — ${new Date().toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      })}`,
      text: text
    })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Resend API error: ${err.message || JSON.stringify(err)}`);
  }
}

// -- Generate Index Page -----------------------------------------------------

async function generateIndexPage(folderPath) {
  const files = await readdir(folderPath);
  const digests = files
    .filter(f => f.match(/^\\d{4}-\\d{2}-\\d{2}\\.html$/) && f !== 'index.html')
    .sort()
    .reverse();

  const listItems = digests.map(f => {
    const date = f.replace('.html', '');
    const d = new Date(date + 'T00:00:00');
    const weekday = d.toLocaleDateString('zh-CN', { weekday: 'long' });
    const display = d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    return `<a href="${f}" class="index-card"><span class="index-date">${display}</span><span class="index-weekday">${weekday}</span><span class="index-arrow">→</span></a>`;
  }).join('\\n');

  const indexHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI Builders Digest — 往期归档</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;800&display=swap');
  body {
    font-family: 'Inter', -apple-system, 'SF Pro Display', 'PingFang SC', sans-serif;
    background: #f8fafc; margin: 0; padding: 40px 20px; min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }
  .container { max-width: 700px; margin: 0 auto; }
  h1 { font-size: 28px; font-weight: 800; color: #0f172a; text-align: center; margin-bottom: 8px; }
  .subtitle { text-align: center; color: #64748b; font-size: 15px; margin-bottom: 40px; }
  .count { text-align: center; color: #94a3b8; font-size: 13px; margin-bottom: 30px; }
  .index-card {
    display: flex; align-items: center; padding: 18px 24px;
    background: #fff; border-radius: 12px; margin-bottom: 12px;
    border: 1px solid #e2e8f0; text-decoration: none; color: #334155;
    transition: all 0.2s ease;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .index-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(0,0,0,0.08);
    border-color: #6366f1;
  }
  .index-date { font-weight: 600; font-size: 16px; flex: 1; }
  .index-weekday { color: #94a3b8; font-size: 14px; margin-right: 12px; }
  .index-arrow { color: #6366f1; font-size: 18px; font-weight: 600; opacity: 0; transition: opacity 0.2s; }
  .index-card:hover .index-arrow { opacity: 1; }
</style>
</head>
<body>
<div class="container">
  <h1>📚 AI Builders Digest</h1>
  <p class="subtitle">你的私人 AI 情报知识库</p>
  <p class="count">共 ${digests.length} 期</p>
  ${listItems}
</div>
</body>
</html>`;

  await writeFile(join(folderPath, 'index.html'), indexHtml, 'utf-8');
}

// -- Local HTML Delivery (SaaS Card UI) --------------------------------------

function buildHtmlPage(dateStr, markdownText) {
  // Escape the markdown for safe embedding in a JS string
  const escaped = markdownText
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');

  const cssBlock = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;800&display=swap');

  :root {
    --bg-color: #f8fafc;
    --card-bg: #ffffff;
    --text-main: #334155;
    --text-muted: #64748b;
    --text-heading: #0f172a;
    --accent: #6366f1;
    --accent-light: rgba(99,102,241,0.08);
    --border-color: #e2e8f0;
    --shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03);
    --kw-bg: rgba(99,102,241,0.1);
    --kw-color: #4f46e5;
    --mustread-bg: linear-gradient(135deg, rgba(99,102,241,0.06), rgba(168,85,247,0.06));
    --mustread-border: #c7d2fe;
    --toggle-bg: #f1f5f9;
  }

  body.dark {
    --bg-color: #0f172a;
    --card-bg: #1e293b;
    --text-main: #cbd5e1;
    --text-muted: #94a3b8;
    --text-heading: #f1f5f9;
    --accent: #818cf8;
    --accent-light: rgba(129,140,248,0.12);
    --border-color: #334155;
    --shadow: 0 4px 6px -1px rgba(0,0,0,0.3);
    --kw-bg: rgba(129,140,248,0.15);
    --kw-color: #a5b4fc;
    --mustread-bg: linear-gradient(135deg, rgba(129,140,248,0.1), rgba(168,85,247,0.1));
    --mustread-border: #4338ca;
    --toggle-bg: #334155;
  }

  body {
    font-family: 'Inter', -apple-system, 'SF Pro Display', 'PingFang SC', 'Helvetica Neue', Arial, sans-serif;
    line-height: 1.75; color: var(--text-main); background: var(--bg-color);
    margin: 0; padding: 40px 20px; min-height: 100vh;
    -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    transition: background 0.3s ease, color 0.3s ease;
  }

  .top-bar { max-width: 900px; margin: 0 auto 30px auto; display: flex; align-items: center; gap: 12px; }
  .tag { background: var(--accent); color: white; padding: 8px 16px; border-radius: 8px; font-size: 14px; font-weight: 600; }
  .tag.secondary { background: var(--card-bg); color: var(--text-muted); border: 1px solid var(--border-color); }
  .top-bar-spacer { flex: 1; }

  .dark-toggle {
    width: 44px; height: 44px; border-radius: 12px; border: 1px solid var(--border-color);
    background: var(--toggle-bg); cursor: pointer; display: flex; align-items: center;
    justify-content: center; font-size: 20px; transition: all 0.3s ease;
  }
  .dark-toggle:hover { border-color: var(--accent); transform: scale(1.05); }

  .archive-link {
    font-size: 14px; font-weight: 500; color: var(--accent); text-decoration: none;
    padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border-color);
    background: var(--card-bg); transition: all 0.2s;
  }
  .archive-link:hover { border-color: var(--accent); }

  #content { max-width: 900px; margin: 0 auto; display: flex; flex-direction: column; gap: 24px; }

  .must-read {
    background: var(--mustread-bg); border: 1px solid var(--mustread-border);
    border-radius: 16px; padding: 24px 30px; max-width: 900px; margin: 0 auto 24px auto;
    width: 100%; box-sizing: border-box;
  }
  .must-read-title { font-size: 16px; font-weight: 700; color: var(--accent); margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
  .must-read ul { margin: 0; padding: 0; list-style: none; }
  .must-read li { font-size: 14px; color: var(--text-main); padding: 6px 0; border-bottom: 1px solid var(--border-color); line-height: 1.6; }
  .must-read li:last-child { border-bottom: none; }

  .card {
    background: var(--card-bg); border-radius: 12px; padding: 24px 30px;
    box-shadow: var(--shadow); border: 1px solid var(--border-color);
    transition: background 0.3s ease, border-color 0.3s ease;
  }

  .card-title {
    font-size: 15px; font-weight: 600; color: var(--text-heading);
    margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--border-color);
    display: flex; align-items: center; gap: 12px;
  }
  .card-title .author-text { flex: 1; }

  .avatar {
    width: 36px; height: 36px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; font-weight: 600; flex-shrink: 0;
  }

  .card p { margin: 0 0 20px 0; font-size: 15px; color: var(--text-main); letter-spacing: 0.2px; }
  .card p:last-child { margin-bottom: 0; }

  .card a {
    color: var(--accent); text-decoration: none; font-size: 14px; font-weight: 500;
    word-break: break-all; display: block; margin-top: 10px;
  }
  .card a:hover { text-decoration: underline; }

  .kw-tag { display: inline; background: var(--kw-bg); color: var(--kw-color); padding: 1px 6px; border-radius: 4px; font-weight: 600; font-size: 0.95em; }

  h1 { font-size: 24px; font-weight: 800; text-align: center; margin-bottom: 30px; color: var(--text-heading); }
  h2 { font-size: 15px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1.5px; margin: 30px 0 10px 0; font-weight: 600; }
  hr { border: none; border-top: 1px solid var(--border-color); margin: 20px 0; }

  #progress-bar {
    position: fixed; top: 0; left: 0; height: 3px;
    background: linear-gradient(to right, var(--accent), #a78bfa);
    width: 0%; z-index: 100; transition: width 0.1s;
  }

  @media (max-width: 600px) {
    .card { padding: 20px; }
    .must-read { padding: 20px; }
    .top-bar { flex-wrap: wrap; }
  }`;

  const jsBlock = `
  // Dark Mode
  var toggleBtn = document.getElementById('darkToggle');
  var savedTheme = localStorage.getItem('digest-theme');
  if (savedTheme === 'dark') { document.body.classList.add('dark'); toggleBtn.textContent = '☀️'; }
  toggleBtn.addEventListener('click', function() {
    document.body.classList.toggle('dark');
    var isDark = document.body.classList.contains('dark');
    toggleBtn.textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('digest-theme', isDark ? 'dark' : 'light');
  });

  // Parse Markdown
  var markdown = '${escaped}';
  var tempDiv = document.createElement('div');
  tempDiv.innerHTML = marked.parse(markdown);
  var contentDiv = document.getElementById('content');

  // Keyword Highlighting
  var AI_KEYWORDS = [
    'AGI','LLM','GPT','GPT-4','GPT-5','Claude','OpenAI','Anthropic','Google','DeepMind',
    'Gemini','Llama','Meta','Apple','Microsoft','Copilot','Agent','Agents',
    'RAG','Fine-tuning','Transformer','Diffusion','RLHF','MCP','MoE',
    'Sora','Midjourney','Stable Diffusion','DALL-E','Cursor','Codex',
    'AI Engineer','NanoClaw','Latent Space','Perplexity','Groq','xAI','Grok',
    'Sam Altman','Dario Amodei','Andrej Karpathy','Swyx'
  ];

  function highlightKeywords(el) {
    if (el.closest && el.closest('.card-title')) return;
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    var textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach(function(node) {
      var html = node.textContent;
      var changed = false;
      AI_KEYWORDS.forEach(function(kw) {
        var regex = new RegExp('\\\\b(' + kw.replace(/[.*+?^\\/{}()|[\\\\]\\\\\\\\]/g, '\\\\\\\\$$&') + ')\\\\b', 'gi');
        if (regex.test(html)) {
          html = html.replace(regex, '<span class="kw-tag">$$1</span>');
          changed = true;
        }
      });
      if (changed) {
        var span = document.createElement('span');
        span.innerHTML = html;
        node.parentNode.replaceChild(span, node);
      }
    });
  }

  // Build Cards
  var currentCard = null;
  var isInsideCard = false;
  var cardFirstTexts = [];

  Array.from(tempDiv.children).forEach(function(el) {
    if (el.tagName === 'H1') { contentDiv.appendChild(el); return; }
    if (el.tagName === 'H2' || el.tagName === 'H3' || el.tagName === 'HR') {
      contentDiv.appendChild(el); isInsideCard = false; return;
    }
    if (!isInsideCard) {
      currentCard = document.createElement('div');
      currentCard.className = 'card';
      contentDiv.appendChild(currentCard);
      isInsideCard = true;
      if (el.tagName === 'P') {
        var textContent = el.textContent || '';
        var nameMatch = textContent.split(/[\\\\(—\\\\-:：]/)[0].trim();
        var initial = nameMatch ? nameMatch.charAt(0).toUpperCase() : 'A';
        var colorHue = 0;
        for (var i = 0; i < nameMatch.length; i++) colorHue += nameMatch.charCodeAt(i);
        colorHue = colorHue % 360;
        var titleDiv = document.createElement('div');
        titleDiv.className = 'card-title';
        titleDiv.innerHTML = '<div class="avatar" style="background-color:hsl(' + colorHue + ',60%,92%);color:hsl(' + colorHue + ',60%,35%)">' + initial + '</div><div class="author-text">' + el.innerHTML + '</div>';
        currentCard.appendChild(titleDiv);
        return;
      }
    }
    if (el.tagName === 'P' && currentCard && currentCard.querySelectorAll('p').length === 0) {
      var txt = el.textContent.trim();
      if (txt.length > 20 && !txt.startsWith('http')) {
        cardFirstTexts.push(txt.length > 80 ? txt.substring(0, 80) + '…' : txt);
      }
    }
    var isOnlyLink = el.tagName === 'P' && el.querySelector('a') && el.textContent.trim() === (el.querySelector('a') ? el.querySelector('a').textContent.trim() : '');
    if (isOnlyLink) { currentCard.appendChild(el); isInsideCard = false; return; }
    currentCard.appendChild(el);
  });

  // Apply Keyword Highlighting
  document.querySelectorAll('.card p').forEach(highlightKeywords);

  // Build Must-Read Section
  if (cardFirstTexts.length > 0) {
    var items = cardFirstTexts.slice(0, 5);
    var mustReadDiv = document.getElementById('must-read-container');
    mustReadDiv.innerHTML = '<div class="must-read" style="max-width:900px;margin:0 auto 24px auto;">' +
      '<div class="must-read-title">⚡ 今日速览 · Top ' + items.length + '</div>' +
      '<ul>' + items.map(function(t) { return '<li>' + t + '</li>'; }).join('') + '</ul></div>';
  }

  // Reading Progress
  window.addEventListener('scroll', function() {
    var winScroll = document.body.scrollTop || document.documentElement.scrollTop;
    var height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    document.getElementById('progress-bar').style.width = ((winScroll / height) * 100) + '%';
  });`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI Builders Digest - ${dateStr}</title>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<style>${cssBlock}</style>
</head>
<body>
<div id="progress-bar"></div>
<div class="top-bar">
  <div class="tag">AI领域摘要</div>
  <div class="tag secondary">Follow Builders</div>
  <div class="top-bar-spacer"></div>
  <a href="index.html" class="archive-link">📚 往期归档</a>
  <button class="dark-toggle" id="darkToggle" title="切换暗色模式">🌙</button>
</div>
<div id="must-read-container"></div>
<div id="content"></div>
<script>${jsBlock}</script>
</body>
</html>`;
}


async function saveLocalHtml(text, folderPath) {
  await mkdir(folderPath, { recursive: true });
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `${dateStr}.html`;
  const filePath = join(folderPath, filename);

  const html = buildHtmlPage(dateStr, text);

  await writeFile(filePath, html, 'utf-8');
  exec(`open "${filePath}"`);

  // Generate / update the index page
  await generateIndexPage(folderPath);

  return filePath;
}

// -- Main --------------------------------------------------------------------

async function main() {
  loadEnv({ path: ENV_PATH });
  let config = {};
  if (existsSync(CONFIG_PATH)) config = JSON.parse(await readFile(CONFIG_PATH, 'utf-8'));

  const delivery = config.delivery || { method: 'stdout' };
  const digestText = await getDigestText();

  if (!digestText || digestText.trim().length === 0) {
    console.log(JSON.stringify({ status: 'skipped', reason: 'Empty digest text' }));
    return;
  }

  try {
    switch (delivery.method) {
      case 'telegram': {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = delivery.chatId;
        if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN not found in .env');
        if (!chatId) throw new Error('delivery.chatId not found in config.json');
        await sendTelegram(digestText, botToken, chatId);
        console.log(JSON.stringify({
          status: 'ok',
          method: 'telegram',
          message: 'Digest sent to Telegram'
        }));
        break;
      }

      case 'email': {
        const apiKey = process.env.RESEND_API_KEY;
        const toEmail = delivery.email;
        if (!apiKey) throw new Error('RESEND_API_KEY not found in .env');
        if (!toEmail) throw new Error('delivery.email not found in config.json');
        await sendEmail(digestText, apiKey, toEmail);
        console.log(JSON.stringify({
          status: 'ok',
          method: 'email',
          message: `Digest sent to ${toEmail}`
        }));
        break;
      }

      case 'local_html': {
        const folder = delivery.folder || join(homedir(), 'Documents', 'AI_Builders_Digests');
        const filePath = await saveLocalHtml(digestText, folder);
        console.log(JSON.stringify({
          status: 'ok',
          method: 'local_html',
          message: `Digest saved to ${filePath} and opened.`
        }));
        break;
      }

      case 'stdout':
      default:
        console.log(digestText);
        break;
    }
  } catch (err) {
    console.log(JSON.stringify({
      status: 'error',
      method: delivery.method,
      message: err.message
    }));
    process.exit(1);
  }
}

main();
