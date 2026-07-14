// ================= 🏮 墨韵 · 面板渲染系统 (Panels Revised) =================
// 星河璀璨 · 记忆召回系统的展示层 —— 纸墨设计体系
// 输出：纯 HTML 字符串，支持 iframe 嵌入和主应用渲染

import { escapeHtml } from './constants.js';
import {
    parseAmCategories, parseSupplementItems, parseMetaCheckBlocks,
    parseCbItems, parseSoulItems, parseChaosItems,
    dbManager, localCache
} from './database-revised.js';

// ============================================================
//  设 计 体 系 —— 墨 韵 (Ink Resonance)
// ============================================================
//  每个区块有独立的色调和质感卡片，共用一个语言体系
//  卡片：圆角、微妙阴影、左侧色条、折叠展开
//  字体：衬线为主，等宽用于代码/索引

const DS = {
    // —— 区块色调 ——
    hue: {
        userInput: { base: '#3e2723', light: '#f5f0e6', border: '#d7ccc8', accent: '#3e2723', label: '墨' },
        recall:    { base: '#8d6e63', light: '#faf5ef', border: '#d4c5b5', accent: '#d3765c', label: '忆' },
        supplement:{ base: '#6d8a6e', light: '#f2f7f0', border: '#c0d0bf', accent: '#6d8a6e', label: '注' },
        metaCheck: { base: '#b8860b', light: '#fdf8ed', border: '#e8d5a3', accent: '#d4a017', label: '骰' },
        soul:      { base: '#8e6e8e', light: '#f7f2f7', border: '#d4c5d4', accent: '#8e6e8e', label: '灵' },
        cb:        { base: '#c0392b', light: '#fdf2f0', border: '#e8c5c0', accent: '#c0392b', label: '警' },
        chaos:     { base: '#4a4a4a', light: '#f0f0f0', border: '#c0c0c0', accent: '#4a4a4a', label: '乱' },
    },

    // —— 分类色板（AM 分类用）——
    catColors: {
        now:    '#d3765c',
        today:  '#8e6e53',
        days:   '#6d8a6e',
        weeks:  '#5b7fa5',
        months: '#8e6e8e',
        seasons:'#7d7d5e',
        years:  '#6e7b8b',
        old:    '#5a5a5a',
        unknown:'#9e9e9e',
    },

    radius: '6px',
    shadow: '0 1px 4px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.03)',
    font: "'Noto Serif SC','Source Han Serif SC','Songti SC',serif",
    fontCode: "'Courier New',Consolas,monospace",
};

// ============================================================
//  工 具 函 数
// ============================================================

function randomDice() {
    const dice = ['⚀','⚁','⚂','⚃','⚄','⚅'];
    return dice[Math.floor(Math.random() * 6)];
}

function tagColor(tag) {
    const map = {
        '线索':'#5b7fa5','推理':'#5b7fa5','物品':'#6d8a6e','道具':'#6d8a6e',
        '人物':'#d3765c','角色':'#d3765c','地点':'#7d7d5e','场景':'#7d7d5e',
        '事件':'#8e6e8e','情报':'#8e6e8e','战斗':'#c0392b','危险':'#c0392b',
        '线索':'#f39c12','秘密':'#8e44ad','传说':'#2c3e50',
    };
    return map[tag] || '#9e978e';
}

// ============================================================
//  卡 片 容 器 构 造
// ============================================================

/**
 * 创建一个可折叠卡片
 * @param {string} seal   — 印文字（单字）
 * @param {string} title  — 卡片标题
 * @param {string} body   — HTML 内容（不要额外包裹）
 * @param {object} hue    — 色调对象 { base, accent, light, border }
 * @param {object} opts   — 选项 { badge, collapsed, extraClass, bodyClass }
 */
function createCard(seal, title, body, hue, opts = {}) {
    const collapsed = opts.collapsed !== false ? ' collapsed' : '';
    const badgeHtml = opts.badge ? `<span class="mv-badge">${escapeHtml(String(opts.badge))}</span>` : '';

    return `
<div class="mv-card${collapsed}${opts.extraClass ? ' ' + opts.extraClass : ''}"
     style="--mv-accent:${hue.base}; --mv-accent-light:${hue.light}; --mv-border:${hue.border}; --mv-accent-strong:${hue.accent};">
  <div class="mv-card-header" onclick="toggleMvCard(this)">
    <span class="mv-seal" style="color:${hue.accent};">${escapeHtml(seal)}</span>
    <span class="mv-card-title">${escapeHtml(title)}</span>
    ${badgeHtml}
    <span class="mv-card-toggle">▾</span>
  </div>
  <div class="mv-card-body${opts.bodyClass ? ' ' + opts.bodyClass : ''}">
    ${body}
  </div>
</div>`;
}

// ============================================================
//  各 区 块 渲 染 器
// ============================================================

// ---------- 1. 用户输入面板 ----------
export function renderUserInputPanel(text) {
    if (!text || !text.trim()) {
        return createCard('录', '当归', '<div class="mv-empty">无声无息</div>', DS.hue.userInput);
    }
    const body = `<div class="mv-user-text">${escapeHtml(text)}</div>`;
    return createCard('录', '当归', body, DS.hue.userInput, { collapsed: false });
}

// ---------- 2. 回忆/流转面板 ----------
export async function renderRecallPanel(recallRaw) {
    const { categories, isGrouped, total } = parseAmCategories(recallRaw);
    if (total === 0) {
        return createCard('忆', '流转',
            '<div class="mv-empty">此刻尚无记忆泛起涟漪</div>',
            DS.hue.recall, { collapsed: true, badge: '0' });
    }

    // 分两阶段：先构建骨架（空状态），再异步填充数据
    const skeleton = buildRecallSkeleton(categories, isGrouped, total);

    // 异步加载数据
    const allCodes = categories.flatMap(c => c.items.map(i => i.code));
    let memories = [];
    if (dbManager.isAvailable()) {
        memories = await dbManager.findMemories(allCodes);
    }

    // 拼合数据
    let codeIdx = 0;
    for (const cat of categories) {
        for (const item of cat.items) {
            const mem = memories[codeIdx] || null;
            item.content = mem?.entry?.content || '';
            item.title = mem?.entry?.title || item.title || '';
            item.found = mem?.found || false;
            item.hasDB = mem?.hasDB ?? false;
            codeIdx++;
        }
    }

    const body = buildRecallBody(categories, isGrouped);
    return createCard('忆', '流转', body, DS.hue.recall, {
        badge: total,
        collapsed: total > 0,
        bodyClass: 'mv-recall-body'
    });
}

function buildRecallSkeleton(categories, isGrouped, total) {
    return '<div class="mv-loading">加载中...</div>';
}

function buildRecallBody(categories, isGrouped) {
    if (categories.length === 0) return '<div class="mv-empty">无召回条目</div>';

    let html = '';

    if (isGrouped) {
        // 分组视图：tab 切换
        html += '<div class="mv-cat-bar">';
        for (let ci = 0; ci < categories.length; ci++) {
            const cat = categories[ci];
            const count = cat.items.length > 1 ? ` <span class="mv-cat-count">${cat.items.length}</span>` : '';
            html += `<span class="mv-cat-btn${ci === 0 ? ' active' : ''}" onclick="switchMvCat(${ci})" data-cat="${ci}">
                <span class="mv-cat-icon" style="color:${cat.color}">${cat.icon}</span>
                ${escapeHtml(cat.label)}${count}
            </span>`;
        }
        html += '</div>';

        for (let ci = 0; ci < categories.length; ci++) {
            const cat = categories[ci];
            const style = ci === 0 ? '' : ' style="display:none"';
            html += `<div class="mv-cat-panel" id="mv-cat-${ci}"${style}>`;

            if (cat.items.length > 1) {
                // 子 AM 按钮
                html += '<div class="mv-sub-bar">';
                for (let ii = 0; ii < cat.items.length; ii++) {
                    const item = cat.items[ii];
                    html += `<span class="mv-sub-btn${ii === 0 ? ' active' : ''}" onclick="switchMvSub(${ci},${ii})" data-cat="${ci}" data-sub="${ii}">${escapeHtml(item.code)}</span>`;
                }
                html += '</div>';

                for (let ii = 0; ii < cat.items.length; ii++) {
                    const item = cat.items[ii];
                    const vis = ii === 0 ? '' : ' style="display:none"';
                    html += `<div class="mv-am-detail" id="mv-am-${ci}-${ii}"${vis}>`;
                    html += renderAmEntry(item);
                    html += '</div>';
                }
            } else {
                html += renderAmEntry(cat.items[0]);
            }

            html += '</div>';
        }
    } else {
        // 平铺视图
        for (const cat of categories) {
            for (const item of cat.items) {
                html += renderAmEntry(item);
            }
        }
    }

    return html;
}

function renderAmEntry(item) {
    const content = item.content || (item.hasDB ? '（散佚）' : '（无法连接数据库）');
    const emptyClass = (!item.content) ? ' mv-content-empty' : '';
    const sourceHtml = item.found && item.sourceHtml
        ? `<div class="mv-source">来自 ${escapeHtml(item.sourceHtml)} · 卷${item.rowIndex || '?'}</div>`
        : '';

    return `
<div class="mv-am-box">
  <div class="mv-am-header">
    <span class="mv-am-code">${escapeHtml(item.code)}</span>
    <span class="mv-am-title">${escapeHtml(item.title || '无名')}</span>
  </div>
  <div class="mv-am-content${emptyClass}">${escapeHtml(content)}</div>
  ${sourceHtml}
</div>`;
}

// ---------- 3. 补充面板 ----------
export function renderSupplementPanel(raw) {
    const items = parseSupplementItems(raw);
    if (items.length === 0) {
        return createCard('注', '旁支', '<div class="mv-empty">无旁支线索</div>',
            DS.hue.supplement, { badge: '0' });
    }

    let body = '';
    for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const tc = tagColor(it.tag);
        // 长内容用文档流渲染
        const content = it.content.length > 100
            ? renderDocFlow(it.content)
            : escapeHtml(it.content);
        body += `
<div class="mv-supp-item" style="animation-delay:${i * 0.04}s">
  <span class="mv-supp-tag" style="--tag-color:${tc}">${escapeHtml(it.tag)}</span>
  <span class="mv-supp-body">${content}</span>
</div>`;
    }

    return createCard('注', '旁支', body, DS.hue.supplement, {
        badge: items.length,
        collapsed: true
    });
}

/** 文档流渲染器（等效 _rd）*/
function renderDocFlow(text) {
    if (!text) return '';
    const lines = text.split('\n');
    let html = '<div class="mv-doc-root">';
    let para = '';
    for (const line of lines) {
        const l = line.trim();
        if (!l) continue;
        if (l.includes('\u5185\u5bb9\u8fc7\u957f') || l.includes('\u4ec5\u663e\u793a')) continue;
        const bM = l.match(/^[\-\u2022\u25cf]\s+(.+)/);
        if (bM) {
            if (para) { html += '<div class="mv-doc-t">' + para + '</div>'; para = ''; }
            html += '<div class="mv-doc-t">\u2022 ' + escapeHtml(bM[1]) + '</div>';
            continue;
        }
        if (para) para += '<br>' + escapeHtml(l);
        else para = escapeHtml(l);
    }
    if (para) html += '<div class="mv-doc-t">' + para + '</div>';
    html += '</div>';
    return html;
}

// ---------- 4. 检定结果面板 ----------
export function renderMetaCheckPanel(rawContent) {
    const blocks = parseMetaCheckBlocks(rawContent);
    if (blocks.length === 0) return '';

    let body = '';
    for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        const firstLine = b.text.split('\n')[0] || '';
        const tagMatch = firstLine.match(/【[^】]+】/g) || [];
        const tagTitle = tagMatch.map(t => t.replace(/[【】]/g, '')).join(' × ') || '检定';

        const rankLabels = { crit: '非凡', success: '成功', normal: '寻常', fail: '败绩', fumble: '大败' };
        const rankClass = `mv-rank-${b.rank}`;

        body += `
<div class="mv-meta-card" style="animation-delay:${i * 0.06}s">
  <div class="mv-meta-top">
    <span class="mv-dice">${randomDice()}</span>
    <span class="mv-meta-tag ${rankClass}">${escapeHtml(tagTitle)}</span>
    <span class="mv-dice">${randomDice()}</span>
  </div>
  <div class="mv-meta-rank ${rankClass}">${rankLabels[b.rank] || ''}</div>
  <div class="mv-meta-body">${escapeHtml(b.text)}</div>
</div>`;
        if (i < blocks.length - 1) {
            body += '<div class="mv-meta-divider"></div>';
        }
    }

    return createCard('骰', '检定', body, DS.hue.metaCheck, {
        badge: blocks.length,
        collapsed: true,
        extraClass: 'mv-meta-section'
    });
}

// ---------- 5. 灵犀面板 ----------
export function renderSoulPanel(raw) {
    const items = parseSoulItems(raw);
    if (items.length === 0) return '';

    let body = '';
    for (let i = 0; i < items.length; i++) {
        const it = items[i];
        body += `
<div class="mv-soul-card">
  <span class="mv-soul-role">${escapeHtml(it.role)}</span>
  <div class="mv-soul-shield">${escapeHtml(it.shield)}</div>
  ${it.mind ? `<div class="mv-soul-mind">${escapeHtml(it.mind)}</div>` : ''}
  ${it.bodyState ? `<div class="mv-soul-body">${escapeHtml(it.bodyState)}</div>` : ''}
</div>`;
    }

    return createCard('灵', '灵犀', body, DS.hue.soul, {
        badge: items.length,
        collapsed: true
    });
}

// ---------- 6. 预警面板 ----------
export function renderCbPanel(raw) {
    const items = parseCbItems(raw);
    if (items.length === 0) return '';

    let body = '';
    for (let i = 0; i < items.length; i++) {
        const it = items[i];
        body += `
<div class="mv-cb-item">
  <span class="mv-cb-role">${escapeHtml(it.role)}</span>
  <span class="mv-cb-content">${escapeHtml(it.content)}</span>
</div>`;
    }

    return createCard('警', '预警', body, DS.hue.cb, {
        badge: items.length,
        collapsed: true
    });
}

// ---------- 7. 混沌面板 ----------
export function renderChaosPanel(raw) {
    const items = parseChaosItems(raw);
    if (items.length === 0) return '';

    let body = '';
    for (const it of items) {
        body += `<div class="mv-chaos-line">${escapeHtml(it.content)}</div>`;
    }

    return createCard('乱', '意外', body, DS.hue.chaos, {
        badge: items.length,
        collapsed: true
    });
}

// ---------- 8. 角色档案 JSON 面板（新增）----------
export function renderCharacterProfilePanel(parsedProfile) {
    if (!parsedProfile || parsedProfile.sections.length === 0) return '';

    const hueProfile = { base: '#5b4a3e', light: '#f3efe8', border: '#d4c8b8', accent: '#8a6e52' };

    let body = '';
    for (let si = 0; si < parsedProfile.sections.length; si++) {
        const section = parsedProfile.sections[si];
        body += `<div class="mv-prof-section">`;
        body += `<div class="mv-prof-st">${escapeHtml(section.title)}</div>`;
        for (let fi = 0; fi < section.fields.length; fi++) {
            const field = section.fields[fi];
            const val = String(field.value).replace(/\\n/g, '<br>');
            const isLong = val.length > 60;
            body += `<div class="mv-prof-row${isLong ? ' mv-prof-row-long' : ''}">`;
            body += `<span class="mv-prof-key">${escapeHtml(field.key)}</span>`;
            body += `<span class="mv-prof-val">${escapeHtml(val)}</span>`;
            body += `</div>`;
        }
        body += `</div>`;
    }

    const badgeText = `${parsedProfile.sections.length}章 · ${parsedProfile.fieldCount}项`;
    return createCard('札', '卷宗', body, hueProfile, {
        badge: badgeText,
        collapsed: true,
        bodyClass: 'mv-profile-body'
    });
}

/**
 * 从原始内容中提取 JSON 角色档案
 * 先查 <profile> 标签，再查 ```json 代码块
 */
export function extractProfileFromText(text) {
    if (!text) return null;

    // 1. <profile> 标签（内部可能嵌套 ```json 代码块）
    const tagM = text.match(/<profile>([\s\S]*?)<\/profile>/);
    if (tagM) {
        let inner = tagM[1].trim();
        // 剥离内部可能的 ```json / ``` 代码块标记
        const codeM = inner.match(/```(?:json)?\s*\n?({[\s\S]*?})\n?```/);
        if (codeM) return codeM[1].trim();
        return inner;
    }

    // 2. ```json 代码块（包含"角色档案"关键字）
    const namedM = text.match(/```(?:json)?\s*\n?({[\s\S]*?"角色档案"[\s\S]*?})\n?```/);
    if (namedM) return namedM[1].trim();

    // 3. 通用 ```json 代码块（宽松匹配）
    const anyM = text.match(/```(?:json)?\s*\n?({[\s\S]*?})\n?```/);
    if (anyM) {
        const c = anyM[1].trim();
        if (c.includes('角色档案') || c.includes('基本信息')) return c;
    }

    return null;
}

// ---------- 9. 结构化数据面板（物品/规则/世界观）----------
/**
 * 解析 Markdown 列表格式的结构化数据并渲染为卡片
 * 支持格式：
 *   章节标题：【...】
 *   列表项：- xxx
 *   键值对：Key：Value
 *   \\n → <br> 自动转换
 *   内容过长 → 自动过滤
 */
export function renderDataPanel(rawText) {
    if (!rawText || !rawText.trim()) return "";

    let clean = rawText.trim();
    const codeM = clean.match(/`{3}(?:markdown)?s*
?([sS]*?)
?`{3}/);
    if (codeM) clean = codeM[1].trim();

    const hueData = { base: "#5b7fa5", light: "#f0f4f8", border: "#c0d0e0", accent: "#5b7fa5" };
    const body = renderDocFlow(clean);

    return createCard("匣", "卷牍", body, hueData, {
        collapsed: true
    });
}

// ============================================================
//  完 整 面 板 生 成
// ============================================================

/**
 * 从解析后的内容生成完整面板 HTML
 * @param {object} parsed — { userInput, recall, supplement, metaCheck, cb, soul, chaos, profile? }
 * @param {object} opts — { showTime, showCopy, showReset }
 */
export async function generatePanelHTML(parsed, opts = {}) {
    const startTime = Date.now();
    const cards = [];

    // 1. 用户输入（始终显示）
    cards.push(renderUserInputPanel(parsed.userInput));

    // 2. 回忆面板（异步加载）
    if (parsed.recall) {
        cards.push(await renderRecallPanel(parsed.recall));
    }

    // 3. 检定结果
    const metaHtml = renderMetaCheckPanel(parsed.metaCheck || parsed.rawContent || '');
    if (metaHtml) cards.push(metaHtml);

    // 4. 补充
    if (parsed.supplement) {
        cards.push(renderSupplementPanel(parsed.supplement));
    }

    // 5. 灵犀
    const soulHtml = renderSoulPanel(parsed.soul || parsed.rawContent || '');
    if (soulHtml) cards.push(soulHtml);

    // 6. 预警
    const cbHtml = renderCbPanel(parsed.cb || parsed.rawContent || '');
    if (cbHtml) cards.push(cbHtml);

    // 7. 混沌
    const chaosHtml = renderChaosPanel(parsed.chaos || parsed.rawContent || '');
    if (chaosHtml) cards.push(chaosHtml);

    // 8. 角色档案 JSON
    if (parsed.profile || parsed.rawContent) {
        const { parseCharacterProfile } = await import('./database-revised.js');
        let profileParsed = null;

        if (parsed.profile) {
            profileParsed = parseCharacterProfile(parsed.profile);
        }
        if (!profileParsed && parsed.rawContent) {
            const profileRaw = extractProfileFromText(parsed.rawContent);
            if (profileRaw) {
                profileParsed = parseCharacterProfile(profileRaw);
            }
        }

        if (profileParsed) {
            const profileCard = renderCharacterProfilePanel(profileParsed);
            if (profileCard) cards.push(profileCard);
        }
    }

    // 9. 结构化数据（物品/规则/世界观）
    if (parsed.data) {
        const dataCard = renderDataPanel(parsed.data);
        if (dataCard) cards.push(dataCard);
    } else if (parsed.rawContent) {
        // 自动检测 <data> 标签内容
        const dataM = parsed.rawContent.match(/<data>([\s\S]*?)<\/data>/);
        if (dataM) {
            const dataCard = renderDataPanel(dataM[1].trim());
            if (dataCard) cards.push(dataCard);
        }
    }

    const elapsed = Date.now() - startTime;

    // 操作栏
    const actionBar = `
<div class="mv-actions">
  <span class="mv-action-btn" onclick="copyMvContent()">📋 抄录</span>
  <span class="mv-action-sep">·</span>
  <span class="mv-action-btn" onclick="resetMvContent()">⟳ 重置</span>
  <span class="mv-action-sep">·</span>
  <span class="mv-elapsed">${elapsed}ms</span>
</div>`;

    const statsBadge = cards.length > 0
        ? `<div class="mv-stats">${cards.length} 枚 · ${elapsed}ms</div>`
        : '';

    return {
        html: `
<div class="mv-container">
  ${actionBar}
  <div class="mv-cards-stack">
    ${cards.join('\n')}
  </div>
  ${statsBadge}
</div>`,
        elapsed,
        cardCount: cards.length
    };
}

// ============================================================
//  嵌 入 脚 本（在 iframe 中运行）
// ============================================================

/**
 * 生成配套的 JS 脚本（窗口切换/折叠等交互）
 * 注：已通过全局函数注入
 */
export function getInlineScript() {
    return `
<script>
(function(){
  // 卡片折叠切换
  window.toggleMvCard = function(header) {
    var card = header.closest('.mv-card');
    if (card) card.classList.toggle('collapsed');
    updateMvHeight();
  };

  // 分类切换
  window.switchMvCat = function(idx) {
    var btns = document.querySelectorAll('.mv-cat-btn');
    var panels = document.querySelectorAll('.mv-cat-panel');
    btns.forEach(function(b,i){ b.classList.toggle('active', i===idx); });
    panels.forEach(function(p,i){ p.style.display = i===idx ? 'block' : 'none'; });
    updateMvHeight();
  };

  // 子 AM 切换
  window.switchMvSub = function(ci, ai) {
    var bar = document.querySelector('[data-cat="'+ci+'"]').closest('.mv-cat-panel').querySelector('.mv-sub-bar');
    if (bar) {
      bar.querySelectorAll('.mv-sub-btn').forEach(function(b){ b.classList.remove('active'); });
      var btn = bar.querySelector('[data-sub="'+ai+'"]');
      if (btn) btn.classList.add('active');
    }
    var parent = document.getElementById('mv-cat-'+ci);
    if (parent) {
      parent.querySelectorAll('.mv-am-detail').forEach(function(d){ d.style.display = 'none'; });
      var det = document.getElementById('mv-am-'+ci+'-'+ai);
      if (det) det.style.display = 'block';
    }
    updateMvHeight();
  };

  // 高度同步
  function updateMvHeight() {
    setTimeout(function(){
      var bodyH = document.body ? document.body.scrollHeight : 0;
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: 'resizeIframe', height: bodyH + 20 }, '*');
        }
      } catch(e) {}
    }, 60);
  }

  // 抄录
  window.copyMvContent = function() {
    var texts = [];
    document.querySelectorAll('.mv-user-text, .mv-am-content, .mv-supp-body, .mv-meta-body').forEach(function(el){
      var t = el.textContent || el.innerText || '';
      if (t.trim()) texts.push(t.trim());
    });
    var full = texts.join('\\n\\n');
    if (!full) return;

    var btn = document.querySelector('.mv-action-btn');
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = full; ta.style.position = 'fixed';
        document.body.appendChild(ta); ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (btn) btn.textContent = ok ? '✓ 已抄录' : '✗ 失败';
      } catch(e) { if(btn) btn.textContent = '✗ 失败'; }
    }

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(full).then(function(){
        if(btn) btn.textContent = '✓ 已抄录';
      }).catch(fallback);
    } else { fallback(); }

    if (btn) {
      setTimeout(function(){ btn.textContent = '📋 抄录'; }, 2000);
    }
  };

  // 重置
  window.resetMvContent = function() {
    var btn = document.querySelector('.mv-action-btn:nth-child(3)');
    if (btn) { btn.textContent = '...'; btn.style.opacity = '0.6'; }

    try {
      var pWin = window.parent;
      if (!pWin || !pWin.SillyTavern) throw new Error('not in ST');
      var st = pWin.SillyTavern;
      var ctx = st.getContext();
      var chat = ctx.chat;
      var $ = pWin.$;
      if (!$) throw new Error('no jquery');

      if ($("#stop_but").is(":visible") || $("#send_but").is(":hidden")) throw new Error('AI 生成中');
      if ($(".mes_edit_box:visible, .mes_edit_textarea:visible").length > 0) throw new Error('请先退出编辑');

      var newInput = $("#send_textarea").val();
      if (!newInput || !newInput.trim()) throw new Error('输入框为空');

      var deleteCount = 0;
      if (chat[chat.length - 1] && !chat[chat.length - 1].is_user) {
        deleteCount = 2;
      } else if (chat[chat.length - 1] && chat[chat.length - 1].is_user) {
        deleteCount = 1;
      } else { throw new Error('消息结构异常'); }

      var runner = pWin.eval("(function(count, text){ return (async function(){" +
        "var st = window.SillyTavern; var ctx = st.getContext(); var $ = window.$;" +
        "for(var i=0;i<count;i++){ await ctx.deleteLastMessage(); " +
        "await new Promise(function(r){ setTimeout(r, 150); }); }" +
        "$('#send_textarea').val(text).trigger('input');" +
        "await new Promise(function(r){ setTimeout(r, 300); });" +
        "var sb = $('#send_but'); if(sb && sb.length) sb[0].click();" +
        "})(); })");
      runner(deleteCount, newInput);
    } catch(err) {
      if (btn) { btn.textContent = '✗ ' + err.message; btn.style.opacity = ''; }
      setTimeout(function(){ if(btn) btn.textContent = '⟳ 重置'; }, 3000);
    }
  };

  updateMvHeight();
})();
</script>`;
}

// ============================================================
//  CSS 生成
// ============================================================

export function getPanelCSS() {
    return `
.mv-container {
  font-family: ${DS.font};
  color: #3e2723;
  line-height: 1.7;
  width: 100%;
  max-width: 520px;
  margin: 0 auto;
}
.mv-actions {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  padding: 6px 0 14px;
  font-size: 12px;
  letter-spacing: 1px;
}
.mv-action-btn {
  cursor: pointer;
  color: #9e978e;
  transition: color 0.3s;
  user-select: none;
  border: none;
  background: none;
  font-family: inherit;
  font-size: inherit;
}
.mv-action-btn:hover { color: #3e2723; }
.mv-action-sep { color: #ccc; user-select: none; }
.mv-elapsed { color: #bbb; font-size: 11px; font-family: ${DS.fontCode}; }

/* ---- 卡片栈 ---- */
.mv-cards-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ---- 卡片 ---- */
.mv-card {
  background: #fdfbf7;
  border-radius: ${DS.radius};
  box-shadow: ${DS.shadow};
  border: 1px solid var(--mv-border, #ddd);
  overflow: hidden;
  transition: all 0.3s ease;
}
.mv-card:hover {
  box-shadow: 0 2px 8px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.04);
}
.mv-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
  border-bottom: 1px solid var(--mv-border, #eee);
}
.mv-card-header:hover { background: var(--mv-accent-light, #faf5ef); }
.mv-seal {
  font-size: 13px;
  font-weight: bold;
  letter-spacing: 2px;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid currentColor;
  border-radius: 2px;
  opacity: 0.8;
}
.mv-card-title {
  font-size: 14px;
  letter-spacing: 2px;
  flex: 1;
  font-weight: 600;
}
.mv-badge {
  font-size: 11px;
  color: var(--mv-accent, #999);
  font-family: ${DS.fontCode};
  opacity: 0.7;
}
.mv-card-toggle {
  font-size: 12px;
  color: #bbb;
  transition: transform 0.3s;
}
.collapsed .mv-card-toggle { transform: rotate(-90deg); }
.collapsed .mv-card-body { display: none; }
.mv-card-body {
  padding: 14px 16px;
  animation: mvFadeIn 0.35s ease;
}

/* ---- 空/加载 ---- */
.mv-empty {
  text-align: center;
  padding: 20px;
  color: #bbb;
  font-style: italic;
  letter-spacing: 1px;
  font-size: 13px;
}
.mv-loading {
  text-align: center;
  padding: 20px;
  color: #ccc;
  letter-spacing: 2px;
  font-size: 12px;
  animation: mvBreathe 2s infinite ease-in-out;
}

/* ---- 用户文本 ---- */
.mv-user-text {
  font-size: 14px;
  line-height: 1.9;
  white-space: pre-wrap;
  word-break: break-word;
  color: #3e2723;
}

/* ---- 召回分类栏 ---- */
.mv-cat-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding-bottom: 10px;
  border-bottom: 1px dashed #e0d5c5;
  margin-bottom: 10px;
}
.mv-cat-btn {
  padding: 4px 10px;
  font-size: 11px;
  cursor: pointer;
  border-radius: 3px;
  transition: all 0.25s;
  color: #8d6e63;
  letter-spacing: 1px;
  user-select: none;
  border: 1px solid transparent;
}
.mv-cat-btn:hover { background: #f5f0e6; }
.mv-cat-btn.active {
  background: #fff;
  border-color: var(--mv-accent, #d3765c);
  color: var(--mv-accent, #d3765c);
  font-weight: 600;
}
.mv-cat-icon { margin-right: 3px; font-size: 10px; }
.mv-cat-count { font-size: 9px; opacity: 0.6; margin-left: 2px; }

/* ---- 子 AM 按钮 ---- */
.mv-sub-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding-bottom: 8px;
  justify-content: center;
}
.mv-sub-btn {
  padding: 2px 8px;
  font-size: 10px;
  cursor: pointer;
  border-bottom: 1px dashed #ddd;
  color: #9e8e7e;
  transition: all 0.25s;
  user-select: none;
  letter-spacing: 0.5px;
}
.mv-sub-btn:hover { color: #5d4037; }
.mv-sub-btn.active {
  color: var(--mv-accent, #d3765c);
  border-bottom-color: var(--mv-accent, #d3765c);
  font-weight: 600;
}

/* ---- AM 条目 ---- */
.mv-am-box {
  margin-bottom: 10px;
  padding: 0 4px;
}
.mv-am-box:last-child { margin-bottom: 0; }
.mv-am-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 6px;
}
.mv-am-code {
  font-family: ${DS.fontCode};
  font-size: 11px;
  color: #b8a088;
  letter-spacing: 1px;
}
.mv-am-title {
  font-size: 13px;
  font-weight: 600;
  color: #5d4037;
}
.mv-am-content {
  font-size: 13px;
  line-height: 1.8;
  color: #6e5e4e;
  white-space: pre-wrap;
  word-break: break-word;
  text-align: justify;
}
.mv-content-empty { color: #ccc; font-style: italic; text-align: center; }
.mv-source {
  font-size: 10px;
  color: #b8a088;
  margin-top: 6px;
  font-style: italic;
}

/* ---- 补充 ---- */
.mv-supp-item {
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px dashed #e8e0d0;
  animation: mvFadeIn 0.5s ease both;
}
.mv-supp-item:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
.mv-supp-tag {
  font-size: 10px;
  color: var(--tag-color, #9e978e);
  border-bottom: 1px solid var(--tag-color, #ccc);
  padding: 0 3px;
  margin-right: 4px;
}
.mv-supp-body {
  font-size: 13px;
  color: #6e5e4e;
  line-height: 1.8;
}

/* ---- 检定 ---- */
.mv-meta-section .mv-card-body { padding: 12px 16px; }
.mv-meta-card {
  text-align: center;
  animation: mvFadeIn 0.5s ease both;
}
.mv-meta-top {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.mv-dice {
  font-size: 16px;
  opacity: 0.35;
  user-select: none;
}
.mv-meta-tag {
  font-size: 13px;
  letter-spacing: 3px;
  padding: 2px 10px;
  border-bottom: 1px dashed #d0c0a0;
  color: #8d7e5e;
}
.mv-meta-tag.mv-rank-crit { color: #b8860b; border-bottom-style: solid; border-bottom-color: #b8860b; }
.mv-meta-tag.mv-rank-fail { opacity: 0.4; text-decoration: line-through; }
.mv-meta-tag.mv-rank-fumble { opacity: 0.3; text-decoration: line-through; color: #999; }
.mv-meta-rank {
  font-size: 11px;
  letter-spacing: 4px;
  margin-bottom: 6px;
  opacity: 0.6;
}
.mv-meta-rank.mv-rank-crit { color: #b8860b; opacity: 0.9; }
.mv-meta-rank.mv-rank-fail { opacity: 0.4; }
.mv-meta-rank.mv-rank-fumble { opacity: 0.3; color: #999; }
.mv-meta-body {
  font-size: 12px;
  color: #6e5e4e;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  text-align: left;
  max-width: 400px;
  margin: 0 auto;
}
.mv-meta-divider {
  height: 1px;
  background: linear-gradient(to right, transparent, #e0d5c5, transparent);
  margin: 10px 0;
}

/* ---- 灵犀 ---- */
.mv-soul-card {
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px dashed #e0d5e0;
}
.mv-soul-card:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
.mv-soul-role {
  font-size: 10px;
  color: #8e6e8e;
  border-bottom: 1px solid #d4c5d4;
  padding: 0 3px;
}
.mv-soul-shield {
  font-size: 13px;
  color: #6e5e6e;
  line-height: 1.7;
  margin-top: 4px;
  padding-left: 14px;
  position: relative;
}
.mv-soul-shield::before { content: "◆"; position: absolute; left: 0; top: 2px; font-size: 9px; color: #b8a0b8; opacity: 0.6; }
.mv-soul-mind {
  font-size: 12px;
  color: #7e6e7e;
  line-height: 1.7;
  font-style: italic;
  margin-top: 3px;
  padding-left: 14px;
  position: relative;
}
.mv-soul-mind::before { content: "♥"; position: absolute; left: 0px; top: 3px; font-size: 12px; color: #b8a0b8; opacity: 0.35; font-style: normal; }
.mv-soul-body {
  font-size: 11px;
  color: #9e8e9e;
  margin-top: 3px;
  padding-left: 14px;
  position: relative;
}
.mv-soul-body::before { content: ""; position: absolute; left: 2px; top: 6px; width: 6px; height: 6px; border: 1.5px solid #b8a0b8; border-radius: 50%; opacity: 0.45; }

/* ---- 预警 ---- */
.mv-cb-item {
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px dashed #e8c5c0;
}
.mv-cb-item:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
.mv-cb-role {
  font-size: 10px;
  color: #c0392b;
  border-bottom: 1px solid #e8c5c0;
  padding: 0 3px;
  margin-right: 4px;
}
.mv-cb-content { font-size: 13px; color: #6e4e4e; line-height: 1.7; }

/* ---- 混沌 ---- */
.mv-chaos-line {
  font-size: 13px;
  font-weight: 600;
  color: #4a4a4a;
  padding: 6px 8px;
  text-align: center;
  letter-spacing: 2px;
}

/* ---- 角色档案（卷宗）---- */
.mv-profile-card .mv-card-body { padding: 10px 16px 14px; }
.mv-profile-body { max-width: 460px; margin: 0 auto; }
.mv-prof-section {
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px dashed #e0d5c5;
  animation: mvFadeIn 0.4s ease both;
}
.mv-prof-section:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
.mv-prof-st {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 2px;
  color: #8a6e52;
  margin-bottom: 6px;
  padding: 2px 8px;
  border-left: 2px solid #8a6e52;
  line-height: 1.6;
}
.mv-prof-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 3px 0 3px 10px;
  font-size: 12px;
  line-height: 1.7;
}
.mv-prof-row-long { flex-direction: column; gap: 2px; padding-bottom: 6px; }
.mv-prof-key {
  flex-shrink: 0;
  font-weight: 600;
  color: #8d6e63;
  min-width: 68px;
  white-space: nowrap;
  font-size: 11px;
  letter-spacing: 0.5px;
}
.mv-prof-row-long .mv-prof-key {
  min-width: auto;
  white-space: normal;
  font-size: 11px;
  color: #5b4a3e;
  border-bottom: 1px dashed #e0d5c5;
  padding-bottom: 2px;
  margin-bottom: 2px;
  width: 100%;
}
.mv-prof-val {
  color: #3e2723;
  word-break: break-word;
  overflow-wrap: break-word;
  flex: 1;
}
.mv-prof-row-long .mv-prof-val {
  font-size: 12px;
  line-height: 1.8;
  white-space: pre-wrap;
}

/* ---- 文档流（卷牍 / 补充 / 世界观）---- */
.mv-doc-root { padding: 2px 0; min-width: 0; width: 100%; max-width: 100%; box-sizing: border-box; overflow-wrap: break-word; word-break: break-all; }
.mv-doc-t {
  padding: 2px 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-sub, #6e5e4e);
  overflow-wrap: break-word;
  word-break: break-all;
}
.mv-stats {
  text-align: center;
  padding: 8px 0 4px;
  font-size: 10px;
  color: #ccc;
  font-family: ${DS.fontCode};
  letter-spacing: 1px;
}

/* ---- 动效 ---- */
@keyframes mvFadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes mvBreathe {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.7; }
}
</style>`;
}

// ============================================================
//  完 整 HTML 嵌 套 生 成
// ============================================================

/**
 * 生成完整的 iframe HTML 页面
 * @param {string} rawContent - 原始标签内容
 * @param {object} opts - { autoload: boolean }
 */
export async function generateIframeHTML(rawContent, opts = {}) {
    const { parsePanelContent } = await import('./database-revised.js');
    const parsed = parsePanelContent(rawContent);
    parsed.rawContent = rawContent;

    const panelResult = await generatePanelHTML(parsed, opts);

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>墨韵 · 记忆面板</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{font-family:'Noto Serif SC','Source Han Serif SC','Songti SC',serif;background:transparent;padding:0;margin:0}
${getPanelCSS()}
</style>
</head>
<body>
${panelResult.html}
${getInlineScript()}
</body>
</html>`;
}
