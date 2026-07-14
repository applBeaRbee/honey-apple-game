// ================= 结构化文本渲染器 =================

import { escapeHtml } from './constants.js';

export function renderStructuredText(text, maxLength = 3000) {
    if (!text || !String(text).trim()) return '<div class="sr-empty">无内容</div>';

    const source = String(text);
    const truncated = source.length > maxLength;
    const display = truncated ? source.substring(0, maxLength) : source;
    const lines = expandInlineItems(display).split('\n');
    let html = '<div class="sr-text">';

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            html += '<div class="sr-gap"></div>';
            continue;
        }

        const heading = line.match(/^(.{1,32})[：:]$/);
        if (heading && !/^[-*•]/.test(line)) {
            html += `<div class="sr-heading">${escapeHtml(heading[1])}</div>`;
            continue;
        }

        const list = line.match(/^[-*•]\s*(.+)$/) || line.match(/^\d+[.)、]\s*(.+)$/);
        if (list) {
            html += renderListLine(list[1]);
            continue;
        }

        const pair = splitKeyValue(line);
        if (pair) {
            html += renderKeyValue(pair.key, pair.value);
            continue;
        }

        html += `<p class="sr-paragraph">${escapeHtml(line)}</p>`;
    }

    html += '</div>';
    if (truncated) html += `<div class="sr-truncated">内容较长，仅显示前 ${maxLength} 字</div>`;
    return html;
}

export function renderInfoCard(title, content, icon = '📋', accentColor = 'var(--color-primary)') {
    return `
        <div class="panel-card info-card" style="--info-accent:${escapeHtml(accentColor)};">
            <div class="info-card-header">
                <span class="info-card-icon">${escapeHtml(icon)}</span>
                <span class="info-card-title">${escapeHtml(title)}</span>
            </div>
            ${renderStructuredText(content)}
        </div>
    `;
}

export function renderCharacterCard(name, info, accentColor = '#8d6e63') {
    const desc = info?.description || info?.summary || '';
    const relationship = info?.relationship || '';
    const traits = Array.isArray(info?.traits) ? info.traits : [];
    const portraitId = `npc-portrait-${hashString(name)}`;
    const portraitName = encodeURIComponent(String(name));
    const portraitInfo = encodeURIComponent(String([desc, relationship, traits.join('、')].filter(Boolean).join('；')));
    return `
        <div class="panel-card memory-person-card" style="--person-accent:${escapeHtml(accentColor)};">
            <div class="memory-person-portrait" id="${portraitId}"></div>
            <div class="memory-person-head">
                <div class="memory-person-avatar">${escapeHtml(String(name).charAt(0) || '?')}</div>
                <div class="memory-person-meta">
                    <div class="memory-person-name">${escapeHtml(name)}</div>
                    ${relationship ? `<div class="memory-person-sub">${escapeHtml(relationship)}</div>` : ''}
                </div>
            </div>
            ${desc ? `<div class="memory-person-desc">${escapeHtml(String(desc).substring(0, 320))}</div>` : ''}
            ${traits.length ? `<div class="memory-chip-row">${traits.slice(0, 6).map(t => `<span class="memory-chip">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
            ${info?.lastSeen ? `<div class="memory-person-foot">最后记录：${escapeHtml(info.lastSeen)}</div>` : ''}
            <button type="button" class="memory-portrait-btn" onclick="generateNpcPortrait('${portraitName}','${portraitInfo}','${portraitId}')">生成 NPC 肖像</button>
        </div>
    `;
}

export function renderFactCard(fact, accentColor = '#3498db') {
    const title = fact?.subject || '事实';
    const body = [fact?.relation, fact?.object].filter(Boolean).join('');
    return `
        <div class="panel-card fact-card" style="--fact-accent:${escapeHtml(accentColor)};">
            <div class="fact-title">${escapeHtml(title)}</div>
            <div class="fact-body">${escapeHtml(String(body).substring(0, 260))}</div>
        </div>
    `;
}

function renderListLine(content) {
    const pair = splitKeyValue(content);
    if (pair) return `<div class="sr-list-item"><span class="sr-dot"></span>${renderKeyValue(pair.key, pair.value, true)}</div>`;
    return `<div class="sr-list-item"><span class="sr-dot"></span><span>${escapeHtml(content.substring(0, 220))}</span></div>`;
}

function renderKeyValue(key, value, compact = false) {
    const progress = String(value).match(/^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/);
    if (progress) {
        const cur = Number(progress[1]);
        const max = Number(progress[2]);
        const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
        return `<div class="sr-kv ${compact ? 'compact' : ''}"><span class="sr-key">${escapeHtml(key)}</span><div class="sr-progress"><div style="width:${pct}%"></div></div><span class="sr-value strong">${escapeHtml(value)}</span></div>`;
    }
    return `<div class="sr-kv ${compact ? 'compact' : ''}"><span class="sr-key">${escapeHtml(key)}</span><span class="sr-value">${escapeHtml(String(value).substring(0, 500))}</span></div>`;
}

function splitKeyValue(line) {
    const idxs = ['：', ':', '='].map(sep => line.indexOf(sep)).filter(i => i > 0);
    if (!idxs.length) return null;
    const idx = Math.min(...idxs);
    const key = line.substring(0, idx).trim();
    const value = line.substring(idx + 1).trim();
    if (!key || !value || key.length > 28) return null;
    return { key, value };
}

function expandInlineItems(text) {
    return String(text)
        .replace(/\s+(?=\d{2}:\d{2}(?:-\d{2}:\d{2})?[：:])/g, '\n')
        .replace(/\s+(?=[-*•]\s+)/g, '\n');
}

function hashString(value) {
    let hash = 0;
    for (let i = 0; i < String(value).length; i++) hash = ((hash << 5) - hash + String(value).charCodeAt(i)) | 0;
    return Math.abs(hash).toString(36);
}

window.renderStructuredText = renderStructuredText;
