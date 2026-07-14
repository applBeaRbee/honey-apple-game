const fs = require('fs');
let p = fs.readFileSync('../js/panels-revised.js', 'utf-8');

// 1. Replace renderDocFlow function
const oldDocFlow = `function renderDocFlow(text) {
    if (!text) return '';
    const lines = text.split('\\n');
    let html = '<div class="mv-doc-root">';
    for (const line of lines) {
        const l = line.trim();
        if (!l) continue;
        if (l.includes('内容过长') || l.includes('仅显示')) continue;

        // 章节标题
        const hM = l.match(/^【([^】]+)】/);
        if (hM) { html += '<div class="mv-doc-h">' + escapeHtml(hM[1]) + '</div>'; continue; }

        // 子弹点
        const bM = l.match(/^[-\\u2022\\u25cf]\\s+(.+)/);
        if (bM) {
            const c = bM[1];
            const kv = c.match(/^([^：:]{1,20})[：:]\\s*(.+)/);
            if (kv) {
                html += '<div class="mv-doc-b"><span class="mv-doc-bl">' + escapeHtml(kv[1]) + '</span><span class="mv-doc-bv">' + escapeHtml(kv[2]) + '</span></div>';
            } else {
                html += '<div class="mv-doc-b"><span class="mv-doc-bv">' + escapeHtml(c) + '</span></div>';
            }
            continue;
        }

        // 键值对
        const kvM = l.match(/^([^：:]{1,20})[：:]\\s*(.+)/);
        if (kvM && kvM[2].length < 80) {
            html += '<div class="mv-doc-r"><span class="mv-doc-k">' + escapeHtml(kvM[1]) + '</span><span class="mv-doc-v">' + escapeHtml(kvM[2]) + '</span></div>';
            continue;
        }

        html += '<div class="mv-doc-t">' + escapeHtml(l) + '</div>';
    }
    html += '</div>';
    return html;
}`;

const newDocFlow = `function renderDocFlow(text) {
    if (!text) return '';
    const lines = text.split('\\n');
    let html = '<div class="mv-doc-root">';
    for (const line of lines) {
        const l = line.trim();
        if (!l) continue;
        if (l.includes('内容过长') || l.includes('仅显示')) continue;
        const bM = l.match(/^[-\\u2022\\u25cf]\\s+(.+)/);
        if (bM) {
            html += '<div class="mv-doc-t">\\u2022 ' + escapeHtml(bM[1]) + '</div>';
            continue;
        }
        html += '<div class="mv-doc-t">' + escapeHtml(l) + '</div>';
    }
    html += '</div>';
    return html;
}`;

if (p.includes(oldDocFlow)) {
  p = p.replace(oldDocFlow, newDocFlow);
  console.log('renderDocFlow replaced');
} else {
  console.log('renderDocFlow NOT FOUND - trying partial');
  // Find the function start
  const idx = p.indexOf('function renderDocFlow(text)');
  if (idx >= 0) {
    // Find the closing brace of the function (after the "return html;}")
    const end = p.indexOf('return html;\n}', idx);
    if (end >= 0) {
      p = p.substring(0, idx) + newDocFlow + p.substring(end + 'return html;\n}'.length);
      console.log('renderDocFlow replaced (partial)');
    }
  }
}

// 2. Replace CSS from .mv-doc-root to .mv-doc-t + newline
const oldCSS = `.mv-doc-root { padding: 2px 0; min-width: 0; width: 100%; max-width: 100%; box-sizing: border-box; overflow-wrap: break-word; word-break: break-word; }
.mv-doc-h {
  font-size: 12px;
  font-weight: 700;
  color: #5b7fa5;
  letter-spacing: 2px;
  padding: 6px 0 3px;
  margin-top: 6px;
  border-bottom: 1px dashed var(--t-line, #c0d0e0);
  line-height: 1.5;
  overflow-wrap: break-word;
  word-break: break-word;
}
.mv-doc-b {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 2px 0 2px 12px;
  font-size: 12px;
  line-height: 1.6;
  position: relative;
  color: var(--text-sub, #6e5e4e);
  overflow-wrap: break-word;
  word-break: break-word;
  width: 100%;
}
.mv-doc-b::before {
  content: "\\2022";
  position: absolute;
  left: 0;
  color: #5b7fa5;
  opacity: 0.6;
}
.mv-doc-bl {
  flex-shrink: 0;
  font-weight: 600;
  color: var(--text-sub, #5d4037);
  min-width: 56px;
  max-width: 40%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
}
.mv-doc-bv {
  color: var(--text-sub, #6e5e4e);
  word-break: break-all;
  overflow-wrap: break-word;
  flex: 1;
  min-width: 0;
  font-size: 12px;
}
.mv-doc-r {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 2px 0 2px 8px;
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: break-word;
  word-break: break-word;
}
.mv-doc-k {
  flex-shrink: 0;
  font-weight: 600;
  color: var(--text-muted, #8d6e63);
  min-width: 52px;
  max-width: 35%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
}
.mv-doc-v {
  color: var(--text-main, #3e2723);
  word-break: break-all;
  overflow-wrap: break-word;
  flex: 1;
  min-width: 0;
  font-size: 12px;
}
.mv-doc-t {
  padding: 2px 0 2px 8px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-sub, #6e5e4e);
  overflow-wrap: break-word;
  word-break: break-word;
}`;

const newCSS = `.mv-doc-root { padding: 2px 0; min-width: 0; width: 100%; max-width: 100%; box-sizing: border-box; overflow-wrap: break-word; word-break: break-all; }
.mv-doc-t {
  padding: 2px 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-sub, #6e5e4e);
  overflow-wrap: break-word;
  word-break: break-all;
}`;

if (p.includes(oldCSS)) {
  p = p.replace(oldCSS, newCSS);
  console.log('CSS replaced');
} else {
  // Try to find and replace the CSS block differently
  const cIdx = p.indexOf('.mv-doc-root {');
  if (cIdx >= 0) {
    // Find the end of mv-doc-t block
    const endIdx = p.indexOf('word-break: break-word;\n}', cIdx);
    if (endIdx >= 0) {
      const oldBlock = p.substring(cIdx, endIdx + 'word-break: break-word;\n}'.length);
      p = p.replace(oldBlock, newCSS);
      console.log('CSS replaced (block match, len=' + oldBlock.length + ')');
    }
  }
}

fs.writeFileSync('E:/剧情卡/原版/js/panels-revised.js', p, 'utf-8');
console.log('Written!');

// Verify
const check = fs.readFileSync('E:/剧情卡/原版/js/panels-revised.js', 'utf-8');
const checks = [
  ['no doc-h in renderDocFlow', !check.includes('mv-doc-h')],
  ['no doc-b in renderDocFlow', !check.includes('"mv-doc-b"')],
  ['no doc-bl', !check.includes('.mv-doc-bl')],
  ['no doc-bv', !check.includes('.mv-doc-bv')],
  ['no doc-r', !check.includes('.mv-doc-r')],
  ['no doc-k', !check.includes('.mv-doc-k')],
  ['no doc-v', !check.includes('.mv-doc-v')],
  ['has doc-root', check.includes('.mv-doc-root')],
  ['has doc-t', check.includes('.mv-doc-t')],
];
checks.forEach(([n, ok]) => console.log(n + ':', ok ? 'OK' : 'FAIL'));
