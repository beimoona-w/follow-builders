#!/usr/bin/env node

// ============================================================================
// Follow Builders — Delivery Script (Editorial Briefing UI v4)
// ============================================================================
// Features:
//   1. Editorial layout: serif masthead, 660px reading measure, numbered brief
//   2. One card per builder / podcast episode / blog post (H3 = card boundary)
//   3. Source links as compact deduplicated chips in the card footer
//   4. EN / bilingual / 中文 language toggle (persisted)
//   5. Dark mode (follows system preference, toggleable, persisted)
//   6. Scrollspy on the briefing list + gentle reveal (reduced-motion aware)
//   7. marked.js inlined from local cache — archives stay readable offline
//   8. Keyword highlighting, reading-time estimate, Telegram & Email delivery
// ============================================================================

import { readFile, mkdir, writeFile } from 'fs/promises';
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

// -- Local HTML Delivery (Editorial Briefing UI) -------------------------------

const MARKED_CDN = 'https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js';
const MARKED_CACHE = join(USER_DIR, 'cache', 'marked.min.js');

// Inline marked.js into the page so archived digests stay readable offline.
// Downloaded once, cached forever; falls back to the CDN tag if unavailable.
async function getMarkedSource() {
  try { return await readFile(MARKED_CACHE, 'utf-8'); } catch {}
  try {
    const res = await fetch(MARKED_CDN, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const src = await res.text();
    await mkdir(join(USER_DIR, 'cache'), { recursive: true });
    await writeFile(MARKED_CACHE, src, 'utf-8');
    return src;
  } catch {
    return null;
  }
}

function buildHtmlPage(dateStr, markdownText, markedSource) {
  // JSON.stringify handles quotes/newlines/backslashes correctly; escaping '<'
  // prevents a literal '</script>' inside the digest from breaking the page.
  var mdLiteral = JSON.stringify(markdownText).replace(/</g, '\\u003c');

  var jsLines = [];

  // Theme: saved preference wins, otherwise follow the system color scheme
  jsLines.push("var toggleBtn=document.getElementById('darkToggle');");
  jsLines.push("var savedTheme=localStorage.getItem('digest-theme');");
  jsLines.push("var prefersDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;");
  jsLines.push("if(savedTheme==='dark'||(!savedTheme&&prefersDark)){document.body.classList.add('dark');toggleBtn.textContent='☀️';}");
  jsLines.push("toggleBtn.addEventListener('click',function(){");
  jsLines.push("  document.body.classList.toggle('dark');");
  jsLines.push("  var isDark=document.body.classList.contains('dark');");
  jsLines.push("  toggleBtn.textContent=isDark?'☀️':'🌙';");
  jsLines.push("  localStorage.setItem('digest-theme',isDark?'dark':'light');");
  jsLines.push("});");

  // Language mode: EN / bilingual / 中文, persisted
  jsLines.push("var langSeg=document.getElementById('langSeg');");
  jsLines.push("var segBtns=Array.prototype.slice.call(langSeg.querySelectorAll('button'));");
  jsLines.push("function setLang(v){document.body.setAttribute('data-lang',v);localStorage.setItem('digest-lang',v);segBtns.forEach(function(b){b.classList.toggle('active',b.getAttribute('data-lang')===v);});}");
  jsLines.push("setLang(localStorage.getItem('digest-lang')||'both');");
  jsLines.push("segBtns.forEach(function(b){b.addEventListener('click',function(){setLang(b.getAttribute('data-lang'));});});");

  jsLines.push("var markdown = " + mdLiteral + ";");
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

  // Language classifier for paragraphs (CJK character ratio)
  jsLines.push("function isZh(t){var m=t.match(/[\\u4e00-\\u9fff]/g);return !!m&&m.length>t.replace(/\\s/g,'').length*0.15;}");

  // Source-link chips: bare URLs are collected per card and rendered as
  // compact labeled chips in the card footer instead of raw full-width URLs.
  jsLines.push("function chipLabel(url){");
  jsLines.push("  try{var h=new URL(url).hostname.replace(/^www\\./,'');");
  jsLines.push("    if(h==='x.com'||h==='twitter.com')return 'Tweet';");
  jsLines.push("    if(h.indexOf('youtube')>-1||h==='youtu.be')return 'YouTube';");
  jsLines.push("    return h;");
  jsLines.push("  }catch(e){return '原文';}");
  jsLines.push("}");

  // Card state machine: each H3 heading (builder / podcast episode / blog post)
  // opens one card; EN + CN paragraphs stay together inside it.
  jsLines.push("var curCard=null,curLinks=[],firsts=[],pCount=0,cardIdx=0,sawSection=false;");
  jsLines.push("function closeCard(){");
  jsLines.push("  if(!curCard)return;");
  jsLines.push("  var seen={},urls=curLinks.filter(function(u){if(seen[u])return false;seen[u]=1;return true;});");
  jsLines.push("  if(urls.length){");
  jsLines.push("    var counts={};urls.forEach(function(u){var l=chipLabel(u);counts[l]=(counts[l]||0)+1;});");
  jsLines.push("    var idx={},foot=document.createElement('div');foot.className='card-links';");
  jsLines.push("    urls.forEach(function(u){");
  jsLines.push("      var l=chipLabel(u);idx[l]=(idx[l]||0)+1;");
  jsLines.push("      var a=document.createElement('a');a.className='link-chip';a.href=u;a.target='_blank';a.rel='noopener';");
  jsLines.push("      a.textContent='↗ '+l+(counts[l]>1?' '+idx[l]:'');");
  jsLines.push("      foot.appendChild(a);");
  jsLines.push("    });");
  jsLines.push("    curCard.appendChild(foot);");
  jsLines.push("  }");
  jsLines.push("  curCard=null;curLinks=[];");
  jsLines.push("}");

  jsLines.push("Array.from(tempDiv.children).forEach(function(el){");
  jsLines.push("  var tag=el.tagName;");
  jsLines.push("  if(tag==='H1'){closeCard();contentDiv.appendChild(el);return;}");
  jsLines.push("  if(tag==='H2'){closeCard();sawSection=true;contentDiv.appendChild(el);return;}");
  jsLines.push("  if(tag==='HR'){closeCard();return;}");
  jsLines.push("  if(tag==='H3'||tag==='H4'){");
  jsLines.push("    closeCard();");
  jsLines.push("    curCard=document.createElement('div');curCard.className='card';curCard.id='card-'+cardIdx;cardIdx++;pCount=0;");
  jsLines.push("    contentDiv.appendChild(curCard);");
  jsLines.push("    var nm=(el.textContent||'').split(/[\\u0028\\u2014\\u003A\\uFF1A\\u201C\"]/)[0].trim();");
  jsLines.push("    var ini=nm?nm.charAt(0).toUpperCase():'A',hue=0;");
  jsLines.push("    for(var i=0;i<nm.length;i++)hue+=nm.charCodeAt(i);hue=hue%360;");
  jsLines.push("    var td=document.createElement('div');td.className='card-title';");
  jsLines.push("    td.innerHTML='<div class=\"avatar\" style=\"background:linear-gradient(135deg,hsl('+hue+',55%,92%),hsl('+((hue+45)%360)+',55%,86%));color:hsl('+hue+',45%,36%)\">'+ini+'</div><div class=\"author-text\">'+el.innerHTML+'</div>';");
  jsLines.push("    curCard.appendChild(td);return;");
  jsLines.push("  }");
  jsLines.push("  if(tag==='P'){");
  jsLines.push("    var txt=(el.textContent||'').trim();");
  jsLines.push("    if(txt.indexOf('Generated through')===0){closeCard();var ft=document.createElement('p');ft.className='digest-footer';ft.innerHTML=el.innerHTML;contentDiv.appendChild(ft);return;}");
  // Bare URLs (anchor text == its href) are moved out of the paragraph and
  // into the card's chip footer; real inline [text](url) links stay in place.
  jsLines.push("    if(curCard){");
  jsLines.push("      Array.prototype.slice.call(el.querySelectorAll('a')).forEach(function(a){");
  jsLines.push("        var t=(a.textContent||'').trim();");
  jsLines.push("        if(!/^https?:\\/\\//.test(t))return;");
  jsLines.push("        curLinks.push(a.href);");
  jsLines.push("        var prev=a.previousSibling;a.remove();");
  jsLines.push("        while(prev&&((prev.nodeType===3&&!prev.textContent.trim())||(prev.nodeType===1&&prev.tagName==='BR'))){var pp=prev.previousSibling;prev.remove();prev=pp;}");
  jsLines.push("      });");
  jsLines.push("      txt=(el.textContent||'').trim();");
  jsLines.push("      if(txt==='')return;");
  jsLines.push("    }");
  jsLines.push("    if(!curCard){");
  jsLines.push("      if(!sawSection&&txt.indexOf('Digest')>-1){var d2=txt.replace(/AI Builders Digest/i,'').replace(/^[\\s\\u2014\\u2013\\-\\u00B7,]+/,'');if(d2)document.getElementById('dateSlot').textContent=d2;return;}");
  jsLines.push("      var ld=document.createElement('p');ld.className='lede';ld.innerHTML=el.innerHTML;document.getElementById('lede-container').appendChild(ld);return;");
  jsLines.push("    }");
  jsLines.push("    el.className+=isZh(txt)?' p-zh':' p-en';");
  jsLines.push("    curCard.appendChild(el);");
  // Collect the first EN + CN snippet of each card for the briefing list
  jsLines.push("    if(pCount<2&&txt.length>40){");
  jsLines.push("      var sn=txt.length>90?txt.substring(0,90)+'…':txt;");
  jsLines.push("      var ent=firsts.length&&firsts[firsts.length-1].id===curCard.id?firsts[firsts.length-1]:null;");
  jsLines.push("      if(!ent){ent={id:curCard.id,en:'',cn:''};firsts.push(ent);}");
  jsLines.push("      if(isZh(txt)){if(!ent.cn)ent.cn=sn;}else{if(!ent.en)ent.en=sn;}");
  jsLines.push("      pCount++;");
  jsLines.push("    }");
  jsLines.push("    return;");
  jsLines.push("  }");
  jsLines.push("  if(curCard)curCard.appendChild(el);else contentDiv.appendChild(el);");
  jsLines.push("});");
  jsLines.push("closeCard();");

  jsLines.push("document.querySelectorAll('.card p, .lede').forEach(highlightKw);");

  // Masthead meta line: story count · source count · reading time
  jsLines.push("var zhChars=(markdown.match(/[\\u4e00-\\u9fff]/g)||[]).length;");
  jsLines.push("var enWords=markdown.replace(/[\\u4e00-\\u9fff]/g,' ').split(/\\s+/).filter(Boolean).length;");
  jsLines.push("var mins=Math.max(1,Math.round(enWords/220+zhChars/400));");
  jsLines.push("if(cardIdx>0)document.getElementById('metaLine').textContent=cardIdx+' 篇内容 · '+document.querySelectorAll('.link-chip').length+' 个来源 · 约 '+mins+' 分钟';");

  // Numbered briefing list (today's must-read) with anchors
  jsLines.push("if(firsts.length>0){");
  jsLines.push("  var pairs=firsts.slice(0,5);");
  jsLines.push("  var mr=document.getElementById('must-read-container');");
  jsLines.push("  mr.innerHTML='<div class=\"must-read\"><div class=\"must-read-title\">今日速览</div><ol>'+pairs.map(function(p){var main=p.en||p.cn,sub=p.en?p.cn:'';return '<li><a href=\"#'+p.id+'\"><span class=\"mr-en\">'+main+'</span>'+(sub?'<span class=\"mr-zh\">'+sub+'</span>':'')+'</a></li>';}).join('')+'</ol></div>';");
  jsLines.push("}");

  // Scrollspy: highlight the briefing entry of the card in view
  jsLines.push("if('IntersectionObserver' in window){");
  jsLines.push("  var spy=new IntersectionObserver(function(es){es.forEach(function(e){var l=document.querySelector('.must-read a[href=\"#'+e.target.id+'\"]');if(l)l.parentNode.classList.toggle('active',e.isIntersecting);});},{rootMargin:'-15% 0px -55% 0px'});");
  jsLines.push("  document.querySelectorAll('.card').forEach(function(c){spy.observe(c);});");
  // Gentle reveal-on-scroll (skipped when the user prefers reduced motion)
  jsLines.push("  if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){");
  jsLines.push("    document.body.classList.add('anim');");
  jsLines.push("    var rev=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');rev.unobserve(e.target);}});},{rootMargin:'0px 0px -4% 0px'});");
  jsLines.push("    document.querySelectorAll('.card').forEach(function(c){rev.observe(c);});");
  jsLines.push("  }");
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
    "@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');",
    ":root{--bg:#faf9f7;--card-bg:#fff;--text-main:#3d3d43;--text-muted:#85858f;--text-heading:#1c1c21;--accent:#4f46e5;--accent-ink:#4338ca;--accent-soft:rgba(79,70,229,.07);--border:#e8e6e1;--border-strong:#d9d6cf;--shadow:0 1px 2px rgba(28,25,23,.04),0 8px 24px -12px rgba(28,25,23,.12);--shadow-hover:0 2px 4px rgba(28,25,23,.05),0 16px 40px -12px rgba(28,25,23,.2);--kw-bg:rgba(79,70,229,.09);--kw-color:#4338ca;--serif:'Fraunces',Georgia,'Songti SC',serif;--sans:'Inter',-apple-system,'PingFang SC','Helvetica Neue',sans-serif}",
    "body.dark{--bg:#101013;--card-bg:#1a1a20;--text-main:#c6c6cd;--text-muted:#82828c;--text-heading:#f1f1f4;--accent:#818cf8;--accent-ink:#a5b4fc;--accent-soft:rgba(129,140,248,.1);--border:#26262e;--border-strong:#34343e;--shadow:0 1px 2px rgba(0,0,0,.4),0 12px 32px -16px rgba(0,0,0,.55);--shadow-hover:0 2px 4px rgba(0,0,0,.4),0 18px 44px -16px rgba(0,0,0,.7);--kw-bg:rgba(129,140,248,.14);--kw-color:#a5b4fc}",
    "html{scroll-behavior:smooth}",
    "body{font-family:var(--sans);background:var(--bg);color:var(--text-main);line-height:1.75;margin:0;padding:0 20px 90px;-webkit-font-smoothing:antialiased;transition:background .3s,color .3s}",
    "body::before{content:'';position:fixed;inset:0;background:radial-gradient(1100px 480px at 50% -8%,var(--accent-soft),transparent 70%);pointer-events:none;z-index:-1}",
    "#progress-bar{position:fixed;top:0;left:0;height:3px;background:linear-gradient(to right,var(--accent),#c084fc);width:0%;z-index:100;transition:width .1s}",
    ".controls{position:fixed;top:18px;right:18px;display:flex;gap:8px;z-index:50}",
    ".seg{display:flex;background:var(--card-bg);border:1px solid var(--border);border-radius:999px;padding:3px;box-shadow:var(--shadow)}",
    ".seg button{border:none;background:transparent;font-family:var(--sans);font-size:12px;font-weight:600;color:var(--text-muted);padding:5px 12px;border-radius:999px;cursor:pointer;transition:all .2s}",
    ".seg button.active{background:var(--accent);color:#fff}",
    ".dark-toggle{width:36px;height:36px;border-radius:999px;border:1px solid var(--border);background:var(--card-bg);cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow);transition:transform .2s}",
    ".dark-toggle:hover{transform:scale(1.08)}",
    ".masthead{max-width:920px;margin:0 auto;padding:74px 0 34px;text-align:center}",
    ".overline{font-size:11px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;color:var(--accent);margin-bottom:18px}",
    ".site-title{font-family:var(--serif);font-size:clamp(34px,6vw,52px);font-weight:600;color:var(--text-heading);letter-spacing:-.01em;line-height:1.08}",
    ".date-line{font-family:var(--serif);font-style:italic;font-size:17px;color:var(--text-muted);margin-top:12px}",
    ".meta-line{font-size:12.5px;color:var(--text-muted);margin-top:10px;letter-spacing:.05em}",
    ".lede{max-width:660px;margin:6px auto 0;font-size:16.5px;line-height:1.9;color:var(--text-main);text-align:center;padding:0 10px}",
    ".lede::before{content:'';display:block;width:46px;height:2px;background:var(--accent);margin:0 auto 22px;border-radius:2px}",
    ".must-read{max-width:660px;margin:40px auto 0;border-top:1px solid var(--border-strong);border-bottom:1px solid var(--border-strong)}",
    ".must-read-title{font-size:12px;font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:var(--text-heading);padding:20px 0 4px}",
    ".must-read ol{margin:0;padding:4px 0 16px;list-style:none;counter-reset:mr}",
    ".must-read li{counter-increment:mr;position:relative;padding:11px 0 11px 46px;border-top:1px solid var(--border)}",
    ".must-read li:first-child{border-top:none}",
    ".must-read li::before{content:counter(mr,decimal-leading-zero);position:absolute;left:2px;top:13px;font-family:var(--serif);font-size:15px;font-weight:600;color:var(--accent);font-variant-numeric:tabular-nums}",
    ".must-read a{text-decoration:none;color:var(--text-heading);display:block}",
    ".mr-en{display:block;font-size:14.5px;font-weight:500;line-height:1.55;transition:color .2s}",
    ".mr-zh{display:block;font-size:13px;color:var(--text-muted);margin-top:3px;line-height:1.65}",
    ".must-read li:hover .mr-en,.must-read li.active .mr-en{color:var(--accent)}",
    "body[data-lang=en] .mr-zh{display:none}",
    "body[data-lang=zh] .mr-en{display:none}",
    "body[data-lang=zh] .mr-zh{color:var(--text-heading);font-size:14.5px;font-weight:500;margin-top:0}",
    "body[data-lang=zh] .must-read li:hover .mr-zh,body[data-lang=zh] .must-read li.active .mr-zh{color:var(--accent)}",
    "#content{max-width:660px;margin:0 auto;display:flex;flex-direction:column;gap:18px}",
    "h1{font-family:var(--serif);font-size:26px;font-weight:600;text-align:center;margin:24px 0;color:var(--text-heading)}",
    "h2{display:flex;align-items:center;gap:14px;font-size:12px;font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:var(--text-muted);margin:36px 0 8px}",
    "h2::after{content:'';flex:1;height:1px;background:var(--border-strong)}",
    ".card{background:var(--card-bg);border:1px solid var(--border);border-radius:14px;padding:26px 30px;box-shadow:var(--shadow);transition:box-shadow .25s,border-color .25s;scroll-margin-top:90px}",
    ".card:hover{box-shadow:var(--shadow-hover);border-color:var(--border-strong)}",
    "body.anim .card{opacity:0;transform:translateY(14px);transition:opacity .55s ease,transform .55s cubic-bezier(.16,1,.3,1),box-shadow .25s,border-color .25s}",
    "body.anim .card.in{opacity:1;transform:translateY(0)}",
    ".card-title{display:flex;align-items:center;gap:13px;margin-bottom:16px}",
    ".card-title .author-text{flex:1;font-family:var(--serif);font-size:17px;font-weight:600;color:var(--text-heading);line-height:1.35}",
    ".avatar{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-family:var(--serif);font-size:17px;font-weight:600;flex-shrink:0}",
    ".card p{margin:0 0 16px;font-size:15px;line-height:1.85;letter-spacing:.1px}",
    ".card p:last-child{margin-bottom:0}",
    ".card p a{color:var(--accent);text-decoration:none;font-weight:500;word-break:break-word}",
    ".card p a:hover{text-decoration:underline}",
    "body[data-lang=both] .card p.p-zh{font-size:14px;color:var(--text-muted);border-left:2px solid var(--border-strong);padding-left:14px}",
    "body[data-lang=en] .card p.p-zh{display:none}",
    "body[data-lang=zh] .card p.p-en{display:none}",
    ".card-links{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px;padding-top:14px;border-top:1px dashed var(--border)}",
    ".link-chip{display:inline-flex;align-items:center;font-size:12px;font-weight:600;color:var(--accent-ink);border:1px solid var(--border-strong);padding:5px 12px;border-radius:999px;text-decoration:none;transition:all .2s}",
    ".link-chip:hover{background:var(--accent);border-color:var(--accent);color:#fff}",
    ".kw-tag{background:var(--kw-bg);color:var(--kw-color);padding:1px 6px;border-radius:5px;font-weight:600;font-size:.92em}",
    ".digest-footer{text-align:center;font-size:12.5px;color:var(--text-muted);margin-top:28px}",
    ".digest-footer a{color:var(--accent);text-decoration:none}",
    "#backToTop{position:fixed;bottom:36px;right:28px;width:42px;height:42px;border-radius:999px;border:1px solid var(--border);background:var(--card-bg);color:var(--accent);font-size:20px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow);opacity:0;pointer-events:none;transition:opacity .3s,transform .2s;z-index:99}",
    "#backToTop:hover{transform:translateY(-3px);background:var(--accent);border-color:var(--accent);color:#fff}",
    "@media(max-width:640px){body{padding:0 14px 70px}.masthead{padding-top:104px;padding-bottom:24px}.site-title{font-size:30px}.card{padding:20px 18px}.controls{top:12px;right:12px}.must-read li{padding-left:38px}}",
    "@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{transition:none!important;animation:none!important}}"
  ].join('\n');

  var markedTag = markedSource
    ? '<script>' + markedSource.replace(/<\/script/gi, '<\\/script') + '<' + '/script>'
    : '<script src="' + MARKED_CDN + '"><' + '/script>';

  return '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '<title>AI Builders Digest · ' + dateStr + '</title>\n' +
    markedTag + '\n' +
    '<style>' + css + '</style>\n' +
    '</head>\n<body>\n' +
    '<div id="progress-bar"></div>\n' +
    '<div class="controls">\n' +
    '  <div class="seg" id="langSeg"><button data-lang="en">EN</button><button data-lang="both">双语</button><button data-lang="zh">中</button></div>\n' +
    '  <button class="dark-toggle" id="darkToggle" title="切换暗色模式">🌙</button>\n' +
    '</div>\n' +
    '<header class="masthead">\n' +
    '  <div class="overline">Follow Builders · Daily Briefing</div>\n' +
    '  <div class="site-title">AI Builders Digest</div>\n' +
    '  <div class="date-line" id="dateSlot">' + dateStr + '</div>\n' +
    '  <div class="meta-line" id="metaLine"></div>\n' +
    '</header>\n' +
    '<div id="lede-container"></div>\n' +
    '<div id="must-read-container"></div>\n' +
    '<div id="content"></div>\n' +
    '<button id="backToTop" title="返回顶部">↑</button>\n' +
    '<script>' + jsBlock + '<' + '/script>\n' +
    '</body>\n</html>';
}

async function saveLocalHtml(text, folderPath) {
  await mkdir(folderPath, { recursive: true });
  var dateStr = new Date().toISOString().split('T')[0];
  var filePath = join(folderPath, dateStr + '.html');

  var markedSource = await getMarkedSource();
  var html = buildHtmlPage(dateStr, text, markedSource);

  await writeFile(filePath, html, 'utf-8');
  exec('open "' + filePath + '"');
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
