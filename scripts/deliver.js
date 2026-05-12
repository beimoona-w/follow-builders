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
  var escaped = markdownText
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');

  var jsLines = [];
  jsLines.push("var toggleBtn = document.getElementById('darkToggle');");
  jsLines.push("var savedTheme = localStorage.getItem('digest-theme');");
  jsLines.push("if (savedTheme === 'dark') { document.body.classList.add('dark'); toggleBtn.textContent = '\u2600\uFE0F'; }");
  jsLines.push("toggleBtn.addEventListener('click', function() {");
  jsLines.push("  document.body.classList.toggle('dark');");
  jsLines.push("  var isDark = document.body.classList.contains('dark');");
  jsLines.push("  toggleBtn.textContent = isDark ? '\u2600\uFE0F' : '\uD83C\uDF19';");
  jsLines.push("  localStorage.setItem('digest-theme', isDark ? 'dark' : 'light');");
  jsLines.push("});");
  jsLines.push("var markdown = '" + escaped + "';");
  jsLines.push("var tempDiv = document.createElement('div');");
  jsLines.push("tempDiv.innerHTML = marked.parse(markdown);");
  jsLines.push("var contentDiv = document.getElementById('content');");

  // Keyword highlighting
  jsLines.push("var AI_KEYWORDS = ['AGI','LLM','GPT','Claude','OpenAI','Anthropic','Google','DeepMind','Gemini','Llama','Meta','Microsoft','Copilot','Agent','Agents','RAG','Transformer','RLHF','MCP','Sora','Midjourney','Cursor','Codex','Perplexity','Groq','xAI','Grok'];");
  jsLines.push("function highlightKw(el) {");
  jsLines.push("  if (el.closest && el.closest('.card-title')) return;");
  jsLines.push("  var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);");
  jsLines.push("  var nodes = []; while(w.nextNode()) nodes.push(w.currentNode);");
  jsLines.push("  nodes.forEach(function(n) {");
  jsLines.push("    var t = n.textContent, c = false;");
  jsLines.push("    AI_KEYWORDS.forEach(function(k) {");
  jsLines.push("      var r = new RegExp('\\\\b(' + k + ')\\\\b', 'gi');");
  jsLines.push("      if (r.test(t)) { t = t.replace(new RegExp('\\\\b(' + k + ')\\\\b','gi'), '<span class=\"kw-tag\">$1</span>'); c = true; }");
  jsLines.push("    });");
  jsLines.push("    if (c) { var s = document.createElement('span'); s.innerHTML = t; n.parentNode.replaceChild(s, n); }");
  jsLines.push("  });");
  jsLines.push("}");

  // Card building — collect bilingual pairs for must-read
  jsLines.push("var curCard=null,inCard=false,firsts=[],pCount=0,cardIdx=0;");
  jsLines.push("Array.from(tempDiv.children).forEach(function(el) {");
  jsLines.push("  if(el.tagName==='H1'){contentDiv.appendChild(el);return;}");
  jsLines.push("  if(el.tagName==='H2'||el.tagName==='H3'||el.tagName==='HR'){contentDiv.appendChild(el);inCard=false;return;}");
  jsLines.push("  if(!inCard){");
  jsLines.push("    curCard=document.createElement('div');curCard.className='card';curCard.id='card-'+cardIdx;contentDiv.appendChild(curCard);inCard=true;pCount=0;cardIdx++;");
  jsLines.push("    if(el.tagName==='P'){");
  jsLines.push("      var tc=el.textContent||'';");
  jsLines.push("      if(tc.indexOf('Digest')>-1){curCard.remove();cardIdx--;var dh=document.createElement('p');dh.className='date-sub';dh.textContent=tc;contentDiv.appendChild(dh);inCard=false;return;}");
  jsLines.push("      var nm=tc.split(/[\\u0028\\u2014\\u002D\\u003A\\uFF1A]/)[0].trim();");
  jsLines.push("      var ini=nm?nm.charAt(0).toUpperCase():'A',hue=0;");
  jsLines.push("      for(var i=0;i<nm.length;i++) hue+=nm.charCodeAt(i);hue=hue%360;");
  jsLines.push("      var td=document.createElement('div');td.className='card-title';");
  jsLines.push("      td.innerHTML='<div class=\"avatar\" style=\"background-color:hsl('+hue+',60%,92%);color:hsl('+hue+',60%,35%)\">'+ini+'</div><div class=\"author-text\">'+el.innerHTML+'</div>';");
  jsLines.push("      curCard.appendChild(td);return;");
  jsLines.push("    }");
  jsLines.push("  }");
  jsLines.push("  if(el.tagName==='P'&&curCard&&pCount<2){");
  jsLines.push("    var txt=el.textContent.trim();");
  jsLines.push("    if(txt.length>40&&!txt.startsWith('http')&&txt.indexOf('TWITTER')===-1&&txt.indexOf('\u2014\u2014')===-1){");
  jsLines.push("      firsts.push({t:txt.length>80?txt.substring(0,80)+'\u2026':txt,id:curCard.id});");
  jsLines.push("      pCount++;");
  jsLines.push("    }");
  jsLines.push("  }");
  jsLines.push("  var isLink=el.tagName==='P'&&el.querySelector('a')&&el.textContent.trim()===(el.querySelector('a')?el.querySelector('a').textContent.trim():'');");
  jsLines.push("  if(isLink){curCard.appendChild(el);inCard=false;return;}");
  jsLines.push("  curCard.appendChild(el);");
  jsLines.push("});");

  jsLines.push("document.querySelectorAll('.card p').forEach(highlightKw);");

  // Must-read — bilingual pairs with anchor links
  jsLines.push("if(firsts.length>0){");
  jsLines.push("  var pairs=[];for(var i=0;i<firsts.length;i+=2){pairs.push({en:firsts[i].t,cn:firsts[i+1]?firsts[i+1].t:'',id:firsts[i].id});if(pairs.length>=5)break;}");
  jsLines.push("  var mr=document.getElementById('must-read-container');");
  jsLines.push("  mr.innerHTML='<div class=\"must-read\" style=\"max-width:900px;margin:0 auto 24px auto;\"><div class=\"must-read-title\">\u26A1 \u4ECA\u65E5\u901F\u89C8 \u00B7 Top '+pairs.length+'</div><ul>'+pairs.map(function(p){return '<li><a href=\"#'+p.id+'\" style=\"text-decoration:none;color:inherit;display:block\">'+p.en+(p.cn?'<br><span style=\"color:var(--text-muted);font-size:13px\">'+p.cn+'</span>':'')+'</a></li>';}).join('')+'</ul></div>';");
  jsLines.push("}");

  // Progress + back-to-top visibility
  jsLines.push("var btt=document.getElementById('backToTop');");
  jsLines.push("window.addEventListener('scroll',function(){");
  jsLines.push("  var ws=document.body.scrollTop||document.documentElement.scrollTop;");
  jsLines.push("  var h=document.documentElement.scrollHeight-document.documentElement.clientHeight;");
  jsLines.push("  document.getElementById('progress-bar').style.width=((ws/h)*100)+'%';");
  jsLines.push("  btt.style.opacity=ws>300?'1':'0';btt.style.pointerEvents=ws>300?'auto':'none';");
  jsLines.push("});");
  jsLines.push("btt.addEventListener('click',function(){window.scrollTo({top:0,behavior:'smooth'});});");

  var jsBlock = jsLines.join('\n');

  var css = [
    "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;800&display=swap');",
    ":root{--bg-color:#f8fafc;--card-bg:#fff;--text-main:#334155;--text-muted:#64748b;--text-heading:#0f172a;--accent:#6366f1;--border-color:#e2e8f0;--shadow:0 4px 6px -1px rgba(0,0,0,.05),0 2px 4px -1px rgba(0,0,0,.03);--kw-bg:rgba(99,102,241,.1);--kw-color:#4f46e5;--mustread-bg:linear-gradient(135deg,rgba(99,102,241,.06),rgba(168,85,247,.06));--mustread-border:#c7d2fe;--toggle-bg:#f1f5f9}",
    "body.dark{--bg-color:#0f172a;--card-bg:#1e293b;--text-main:#cbd5e1;--text-muted:#94a3b8;--text-heading:#f1f5f9;--accent:#818cf8;--border-color:#334155;--shadow:0 4px 6px -1px rgba(0,0,0,.3);--kw-bg:rgba(129,140,248,.15);--kw-color:#a5b4fc;--mustread-bg:linear-gradient(135deg,rgba(129,140,248,.1),rgba(168,85,247,.1));--mustread-border:#4338ca;--toggle-bg:#334155}",
    "body{font-family:'Inter',-apple-system,'SF Pro Display','PingFang SC','Helvetica Neue',Arial,sans-serif;line-height:1.75;color:var(--text-main);background:var(--bg-color);margin:0;padding:40px 20px;min-height:100vh;-webkit-font-smoothing:antialiased;transition:background .3s,color .3s}",
    ".top-bar{max-width:900px;margin:0 auto 30px;display:flex;align-items:center;gap:12px}",
    ".tag{background:var(--accent);color:#fff;padding:8px 16px;border-radius:8px;font-size:14px;font-weight:600}",
    ".tag.secondary{background:var(--card-bg);color:var(--text-muted);border:1px solid var(--border-color)}",
    ".top-bar-spacer{flex:1}",
    ".dark-toggle{width:44px;height:44px;border-radius:12px;border:1px solid var(--border-color);background:var(--toggle-bg);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:20px;transition:all .3s}",
    ".dark-toggle:hover{border-color:var(--accent);transform:scale(1.05)}",
    ".archive-link{font-size:14px;font-weight:500;color:var(--accent);text-decoration:none;padding:8px 14px;border-radius:8px;border:1px solid var(--border-color);background:var(--card-bg);transition:all .2s}",
    ".archive-link:hover{border-color:var(--accent)}",
    "#content{max-width:900px;margin:0 auto;display:flex;flex-direction:column;gap:24px}",
    ".must-read{background:var(--mustread-bg);border:1px solid var(--mustread-border);border-radius:16px;padding:24px 30px;width:100%;box-sizing:border-box}",
    ".must-read-title{font-size:16px;font-weight:700;color:var(--accent);margin-bottom:14px}",
    ".must-read ul{margin:0;padding:0;list-style:none}",
    ".must-read li{font-size:14px;color:var(--text-main);padding:6px 0;border-bottom:1px solid var(--border-color);line-height:1.6}",
    ".must-read li:last-child{border-bottom:none}",
    ".card{background:var(--card-bg);border-radius:12px;padding:24px 30px;box-shadow:var(--shadow);border:1px solid var(--border-color);transition:background .3s,border-color .3s}",
    ".card-title{font-size:15px;font-weight:600;color:var(--text-heading);margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border-color);display:flex;align-items:center;gap:12px}",
    ".card-title .author-text{flex:1}",
    ".avatar{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:600;flex-shrink:0}",
    ".card p{margin:0 0 20px;font-size:15px;color:var(--text-main);letter-spacing:.2px}",
    ".card p:last-child{margin-bottom:0}",
    ".card a{color:var(--accent);text-decoration:none;font-size:14px;font-weight:500;word-break:break-all;display:block;margin-top:10px}",
    ".card a:hover{text-decoration:underline}",
    ".kw-tag{display:inline;background:var(--kw-bg);color:var(--kw-color);padding:1px 6px;border-radius:4px;font-weight:600;font-size:.95em}",
    "h1{font-size:24px;font-weight:800;text-align:center;margin-bottom:30px;color:var(--text-heading)}",
    ".date-sub{text-align:center;font-size:14px;color:var(--text-muted);margin:0 0 24px;font-weight:500;letter-spacing:.5px}",
    ".must-read li a:hover{opacity:.7}",
    ".must-read li{cursor:pointer;transition:opacity .2s}",
    "h2{font-size:15px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1.5px;margin:30px 0 10px;font-weight:600}",
    "hr{border:none;border-top:1px solid var(--border-color);margin:20px 0}",
    "#progress-bar{position:fixed;top:0;left:0;height:3px;background:linear-gradient(to right,var(--accent),#a78bfa);width:0%;z-index:100;transition:width .1s}",
    "#backToTop{position:fixed;bottom:40px;right:30px;width:42px;height:42px;border-radius:10px;border:none;background:var(--kw-bg);color:var(--kw-color);font-size:22px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .3s,transform .2s;z-index:99}",
    "#backToTop:hover{transform:translateY(-3px);background:var(--accent);color:#fff}",
    "@media(max-width:600px){.card{padding:20px}.must-read{padding:20px}.top-bar{flex-wrap:wrap}}"
  ].join('\n');

  return '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '<title>AI Builders Digest - ' + dateStr + '</title>\n' +
    '<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><' + '/script>\n' +
    '<style>' + css + '</style>\n' +
    '</head>\n<body>\n' +
    '<div id="progress-bar"></div>\n' +
    '<div class="top-bar">\n' +
    '  <div class="top-bar-spacer"></div>\n' +
    '  <div class="tag">Follow Builders</div>\n' +
    '  <div class="top-bar-spacer"></div>\n' +
    '  <button class="dark-toggle" id="darkToggle" title="\u5207\u6362\u6697\u8272\u6A21\u5F0F">\uD83C\uDF19</button>\n' +
    '</div>\n' +
    '<div id="must-read-container"></div>\n' +
    '<div id="content"></div>\n' +
    '<button id="backToTop" title="\u8FD4\u56DE\u9876\u90E8">\u2191</button>\n' +
    '<script>' + jsBlock + '<' + '/script>\n' +
    '</body>\n</html>';
}

async function saveLocalHtml(text, folderPath) {
  await mkdir(folderPath, { recursive: true });
  var dateStr = new Date().toISOString().split('T')[0];
  var filename = dateStr + '.html';
  var filePath = join(folderPath, filename);

  var html = buildHtmlPage(dateStr, text);

  await writeFile(filePath, html, 'utf-8');
  exec('open "' + filePath + '"');

  // index page generation removed per user request
  return filePath;
}

// -- Main --------------------------------------------------------------------

async function main() {
  loadEnv({ path: ENV_PATH });
  var config = {};
  if (existsSync(CONFIG_PATH)) config = JSON.parse(await readFile(CONFIG_PATH, 'utf-8'));

  var delivery = config.delivery || { method: 'stdout' };
  var digestText = await getDigestText();

  if (!digestText || digestText.trim().length === 0) {
    console.log(JSON.stringify({ status: 'skipped', reason: 'Empty digest text' }));
    return;
  }

  try {
    switch (delivery.method) {
      case 'telegram': {
        var botToken = process.env.TELEGRAM_BOT_TOKEN;
        var chatId = delivery.chatId;
        if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN not found in .env');
        if (!chatId) throw new Error('delivery.chatId not found in config.json');
        await sendTelegram(digestText, botToken, chatId);
        console.log(JSON.stringify({ status: 'ok', method: 'telegram', message: 'Digest sent to Telegram' }));
        break;
      }
      case 'email': {
        var apiKey = process.env.RESEND_API_KEY;
        var toEmail = delivery.email;
        if (!apiKey) throw new Error('RESEND_API_KEY not found in .env');
        if (!toEmail) throw new Error('delivery.email not found in config.json');
        await sendEmail(digestText, apiKey, toEmail);
        console.log(JSON.stringify({ status: 'ok', method: 'email', message: 'Digest sent to ' + toEmail }));
        break;
      }
      case 'local_html': {
        var folder = delivery.folder || join(homedir(), 'Documents', 'AI_Builders_Digests');
        var filePath = await saveLocalHtml(digestText, folder);
        console.log(JSON.stringify({ status: 'ok', method: 'local_html', message: 'Digest saved to ' + filePath + ' and opened.' }));
        break;
      }
      case 'stdout':
      default:
        console.log(digestText);
        break;
    }
  } catch (err) {
    console.log(JSON.stringify({ status: 'error', method: delivery.method, message: err.message }));
    process.exit(1);
  }
}

main();
