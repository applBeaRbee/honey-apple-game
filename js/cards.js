// ================= 剧情卡系统 (CRUD + 导入) =================
import { appState, gameConfig } from './state.js';
import { escapeHtml, generateId } from './constants.js';
import { showToast, showConfirm, closeModal } from './ui.js';
import { saveLocalData } from './storage.js';
import { renderGamePanelsUI, renderPanelPreviewHtml } from './panels.js';
import { renderStructuredText, renderInfoCard } from './structured-renderer.js';
import { renderSidebarSessions } from './sessions.js';
import { buildLorebookFromCharacterBook, buildGameplayPanelsFromCharacterBook as buildImportedPanelsFromCharacterBook, parseSillyTavernCharacterCard } from './card-importer.js';

// ===== 创建默认卡片 =====
export function createDefaultCard() {
    const defPanel = {
        "人物核心": { "姓名": "{charName}", "等级": 1, "力量": 10, "生命值": "100/100" },
        "随身行囊": [{ "name": "生锈的铁剑", "qty": 1, "desc": "略微破旧但很结实" }],
        "状态记录": [],
        "社交关系": { "节点": [{ "id": "{charName}", "name": "{charName}", "type": "主角", "color": "#d3765c" }], "连线": [] },
        "区域地图": { "当前位置": "黑水镇", "区域": [{ "id": "黑水镇", "name": "黑水镇", "type": "村镇" }], "路线": [] }
    };
    return {
        id: generateId('card'),
        avatar: '📜',
        name: '黑水镇佣兵传',
        description: '边境小镇的传说...',
        worldSetting: '中世纪奇幻世界。',
        storyBackground: '你刚刚抵达黑水镇...',
        defaultCharName: '亚瑟',
        defaultCharInfo: '年轻的流浪剑客。',
        systemPrompt: '你是硬核跑团DM，必须严格判定。',
        authorsNote: '',
        openingText: '伴随着刺耳的摩擦声，你推开了酒馆大门。',
        lorebook: { "黑水镇": "边境中立城镇" },
        panelTemplate: JSON.stringify(defPanel, null, 2),
        created: Date.now()
    };
}

// ===== 渲染头像（支持图片 URL 和 emoji） =====
export function renderAvatarHtml(avatar, size = '60px') {
    if (!avatar || avatar === '📜' || avatar === '🖼️') {
        return `<div class="avatar" style="width:${size};height:${size};font-size:${size === '60px' ? '1.8rem' : '3.5rem'};border-radius:50%;background:#e6decb;display:flex;align-items:center;justify-content:center;border:2px solid var(--border-color-strong);flex-shrink:0;overflow:hidden;">${escapeHtml(avatar||'📜')}</div>`;
    }
    // 如果是图片 URL（http/https/blob/data），显示为 <img>
    if (avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('blob:') || avatar.startsWith('data:')) {
        const imgSize = size === '60px' ? '60px' : '80px';
        const borderRadius = size === '60px' ? '50%' : 'var(--radius-md)';
        return `<div style="width:${imgSize};height:${imgSize};flex-shrink:0;overflow:hidden;border-radius:${borderRadius};border:2px solid var(--border-color-strong);background:var(--bg-card);"><img src="${escapeHtml(avatar)}" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="var p=this.parentElement;if(p){p.innerHTML='📜';p.style.display='flex';p.style.alignItems='center';p.style.justifyContent='center';p.style.fontSize='${size === '60px' ? '1.8rem' : '3.5rem'}'"></div>`;
    }
    return `<div class="avatar" style="width:${size};height:${size};font-size:${size === '60px' ? '1.8rem' : '3.5rem'};border-radius:50%;background:#e6decb;display:flex;align-items:center;justify-content:center;border:2px solid var(--border-color-strong);flex-shrink:0;">${escapeHtml(avatar)}</div>`;
}

function isPngArrayBuffer(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer || []);
    return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
}

export function renderFrontendAssetsHtml(assets = []) {
    if (!Array.isArray(assets) || !assets.length) return '';
    return `<section class="card-detail-section card-frontend-section"><h4>🌸 内置前端 (${assets.length})</h4>
        <div class="frontend-preview-stack">
            ${assets.map(asset => {
                const title = `${asset.disabled ? '已禁用 · ' : ''}${asset.name || '内置前端'}`;
                const frame = asset.sourceUrl
                    ? `<iframe class="frontend-preview-frame" src="${escapeHtml(asset.sourceUrl)}" loading="lazy" sandbox="allow-scripts allow-forms allow-popups"></iframe>`
                    : `<iframe class="frontend-preview-frame" src="${buildFrontendDataUrl(asset.html || '')}" loading="lazy" sandbox="allow-scripts allow-forms allow-popups"></iframe>`;
                return `<article class="frontend-preview-card">
                    <div class="frontend-preview-head"><strong>${escapeHtml(title)}</strong>${asset.sourceUrl ? `<a href="${escapeHtml(asset.sourceUrl)}" target="_blank" rel="noopener noreferrer">打开源页面</a>` : ''}</div>
                    ${frame}
                </article>`;
            }).join('')}
        </div>
    </section>`;
}

export function buildFrontendSrcdoc(html) {
    const source = decodeFrontendHtml(String(html || '').trim());
    if (!source) {
        return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>html,body{margin:0;padding:10px;background:#fffafc;color:#3b2532;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;}*{box-sizing:border-box;max-width:100%;}</style></head><body><div>无可预览内容</div></body></html>`;
    }
    if (/^\s*<!doctype\s+html[^>]*>/i.test(source) || /^\s*<html\b/i.test(source)) return source;
    if (/^\s*<head\b/i.test(source)) {
        const hasBody = /<body\b/i.test(source);
        return `<!doctype html><html>${source}${hasBody ? '' : '<body></body>'}</html>`;
    }
    return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>html,body{margin:0;padding:10px;background:#fffafc;color:#3b2532;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;}*{box-sizing:border-box;max-width:100%;}</style></head><body>${source}</body></html>`;
    return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>html,body{margin:0;padding:10px;background:#fffafc;color:#3b2532;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;}*{box-sizing:border-box;max-width:100%;}</style></head><body>${html || '<div>无可预览内容</div>'}</body></html>`;
}

// ===== 渲染卡片库 =====
export function buildFrontendDataUrl(html) {
    return `data:text/html;charset=utf-8;base64,${encodeFrontendPayload(buildFrontendSrcdoc(html))}`;
}

export function mountFrontendFrames(root = document) {
    root.querySelectorAll?.('.frontend-preview-frame[data-frontend-payload]').forEach(frame => {
        if (frame.dataset.frontendMounted === 'true') return;
        const payload = frame.dataset.frontendPayload;
        frame.dataset.frontendMounted = 'true';
        const writeFrame = () => {
            try {
                const doc = frame.contentDocument;
                if (!doc) throw new Error('iframe document unavailable');
                doc.open();
                doc.write(decodeFrontendPayload(payload));
                doc.close();
            } catch (error) {
                console.warn('内置前端渲染失败:', error);
                frame.removeAttribute('data-frontend-mounted');
            }
        };
        frame.addEventListener('load', writeFrame, { once: true });
        if (frame.contentDocument?.readyState === 'complete') writeFrame();
    });
}

function encodeFrontendPayload(value) {
    const bytes = new TextEncoder().encode(String(value || ''));
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
}

function decodeFrontendPayload(value) {
    const binary = atob(value || '');
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

function decodeFrontendHtml(value) {
    let decoded = String(value || '');
    const textarea = document.createElement('textarea');
    for (let i = 0; i < 4; i += 1) {
        if (!/[&](?:lt|gt|amp|quot|#39|apos);/i.test(decoded)) break;
        textarea.innerHTML = decoded;
        const next = textarea.value;
        if (next === decoded) break;
        decoded = next;
    }
    decoded = decoded
        .replace(/\\u003c/gi, '<')
        .replace(/\\u003e/gi, '>')
        .replace(/\\u0026/gi, '&');
    const lower = decoded.toLowerCase();
    const markers = ['<!doctype', '<html', '<head', '<body', '<div', '<section', '<article', '<style'];
    const indexes = markers.map(marker => lower.indexOf(marker)).filter(index => index >= 0);
    if (indexes.length) {
        decoded = decoded.slice(Math.min(...indexes));
        const endMarkers = ['</html>', '</body>', '</head>'];
        for (const marker of endMarkers) {
            const index = decoded.toLowerCase().lastIndexOf(marker);
            if (index >= 0) {
                decoded = decoded.slice(0, index + marker.length);
                break;
            }
        }
    }
    return decoded.trim();
}

function arrayBufferToDataUrl(arrayBuffer, mime = 'image/png') {
    const bytes = new Uint8Array(arrayBuffer || []);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
    }
    return `data:${mime};base64,${btoa(binary)}`;
}

export function renderLibrary() {
    const grid = document.getElementById('cardGridUI');
    if (!grid) return;
    const search = (document.getElementById('searchInput')?.value || '').toLowerCase();
    const stats = document.getElementById('libraryStatsUI');
    if (stats) {
        const loreCount = appState.cards.reduce((total, card) => total + Object.keys(card.lorebook || {}).length, 0);
        stats.innerHTML = `<div><strong>${appState.cards.length}</strong><span>剧本卡</span></div><div><strong>${appState.sessions.length}</strong><span>存档</span></div><div><strong>${loreCount}</strong><span>图鉴条目</span></div>`;
    }
    grid.innerHTML =
        `<div class="script-card action-card" onclick="openCardEditor()"><div class="icon">➕</div><div class="name" style="color:var(--color-primary);">新建剧本卡</div><div class="desc">构筑新世界</div></div>
<div class="script-card action-card" onclick="openSillyTavernImportModal()"><div class="icon">📥</div><div class="name" style="color:var(--color-primary);">导入酒馆角色卡</div><div class="desc">PNG / JSON / 粘贴内容</div></div>
<div class="script-card action-card" onclick="document.getElementById('fileImportInput').click()"><div class="icon">📦</div><div class="name" style="color:var(--color-primary);">导入剧本包</div><div class="desc">读取 JSON</div><input type="file" id="fileImportInput" accept=".json" style="display:none;" onchange="importData(event)"></div>`;
    appState.cards.forEach(card => {
        if (search && !card.name.toLowerCase().includes(search) && !(card.storyBackground || '').toLowerCase().includes(search)) return;
        const d = document.createElement('div');
        d.className = 'script-card';
        d.onclick = () => showCardDetail(card.id);
        d.innerHTML =
            `${renderAvatarHtml(card.avatar)}<div class="name">${escapeHtml(card.name)}</div><div class="desc">${escapeHtml(card.description||'...')}</div><div class="card-actions"><button class="card-action-btn" onclick="event.stopPropagation(); showCardDetail('${card.id}')" title="详情">📖</button><button class="card-action-btn" onclick="event.stopPropagation(); openCardEditor('${card.id}')">⚙️</button><button class="card-action-btn" onclick="event.stopPropagation(); duplicateCard('${card.id}')">📋</button><button class="card-action-btn" onclick="event.stopPropagation(); deleteCard('${card.id}')" style="color:var(--color-danger);">🗑️</button></div>`;
        grid.appendChild(d);
    });
}

// ===== 复制/编辑/删除卡片 =====
export function duplicateCard(id) {
    const card = appState.cards.find(c => c.id === id);
    if (!card) return;
    const nc = JSON.parse(JSON.stringify(card));
    nc.id = generateId('card');
    nc.name = nc.name + ' (副本)';
    nc.created = Date.now();
    appState.cards.unshift(nc);
    saveLocalData();
    renderLibrary();
    showToast("复制成功", "success");
}

export function openCardEditor(cardId = null) {
    const modal = document.getElementById('cardEditorModal');
    if (!modal) return;
    document.getElementById('editCardMode').value = 'card';
    if (cardId) {
        const card = appState.cards.find(c => c.id === cardId);
        if (!card) return;
        document.getElementById('cardEditorTitle').innerText = '✏️ 编辑剧本卡';
        ['Id', 'Avatar', 'Name', 'World', 'Story', 'CharName', 'CharInfo', 'Prompt', 'Opening'].forEach(k => {
            const el = document.getElementById('editCard' + k);
            const dbK = k === 'CharName' ? 'defaultCharName' : k === 'CharInfo' ? 'defaultCharInfo' :
                k === 'Prompt' ? 'systemPrompt' : k === 'Opening' ? 'openingText' : k === 'Story' ?
                'storyBackground' : k === 'World' ? 'worldSetting' : k.toLowerCase();
            el.value = card[dbK] || '';
        });
        document.getElementById('editCardPanelJSON').value = card.panelTemplate || '{}';
    } else {
        document.getElementById('cardEditorTitle').innerText = '✨ 撰写新剧本卡';
        document.getElementById('editCardId').value = '';
        document.getElementById('editCardAvatar').value = '📜';
        document.getElementById('editCardName').value = '';
        document.getElementById('editCardWorld').value = '';
        document.getElementById('editCardStory').value = '';
        document.getElementById('editCardCharName').value = '';
        document.getElementById('editCardCharInfo').value = '';
        document.getElementById('editCardPanelJSON').value = '{\n  "人物核心": { "姓名": "{charName}", "生命值": "100/100" },\n  "随身行囊": []\n}';
        document.getElementById('editCardPrompt').value = '你是一个DM...';
        document.getElementById('editCardOpening').value = '';
    }
    modal.style.display = 'flex';
}

export function openSessionCardEditor() {
    if (!gameConfig) return showToast('当前没有可编辑的存档', 'warning');
    const modal = document.getElementById('cardEditorModal');
    if (!modal) return;
    document.getElementById('editCardMode').value = 'session';
    document.getElementById('cardEditorTitle').innerText = '📝 编辑当前存档角色卡';
    document.getElementById('editCardId').value = gameConfig.id || '';
    document.getElementById('editCardAvatar').value = gameConfig.avatar || '📜';
    document.getElementById('editCardName').value = gameConfig.name || gameConfig.charName || '';
    document.getElementById('editCardWorld').value = gameConfig.worldSetting || '';
    document.getElementById('editCardStory').value = gameConfig.storyBackground || '';
    document.getElementById('editCardCharName').value = gameConfig.charName || '';
    document.getElementById('editCardCharInfo').value = gameConfig.charInfo || '';
    document.getElementById('editCardPrompt').value = gameConfig.systemPromptText || '';
    document.getElementById('editCardOpening').value = gameConfig.openingText || '';
    document.getElementById('editCardPanelJSON').value = JSON.stringify(gameConfig.panels || {}, null, 2);
    modal.style.display = 'flex';
}

export function saveCardEditor() {
    const id = document.getElementById('editCardId').value;
    const mode = document.getElementById('editCardMode')?.value || 'card';
    const name = document.getElementById('editCardName').value.trim();
    const panelJson = document.getElementById('editCardPanelJSON').value.trim();
    if (!name) return showToast('名称不能为空', 'error');
    if (panelJson) { try { JSON.parse(panelJson); } catch (e) { return showToast('JSON格式错误', 'error'); } }
    const data = {
        avatar: document.getElementById('editCardAvatar').value.trim(),
        name: name,
        description: document.getElementById('editCardStory').value.substring(0, 45) + '...',
        worldSetting: document.getElementById('editCardWorld').value.trim(),
        storyBackground: document.getElementById('editCardStory').value.trim(),
        defaultCharName: document.getElementById('editCardCharName').value.trim(),
        defaultCharInfo: document.getElementById('editCardCharInfo').value.trim(),
        panelTemplate: panelJson,
        systemPrompt: document.getElementById('editCardPrompt').value.trim(),
        openingText: document.getElementById('editCardOpening').value.trim(),
        lorebook: id ? (appState.cards.find(c => c.id === id)?.lorebook || {}) : {}
    };
    if (mode === 'session') {
        if (!gameConfig) return showToast('当前没有可保存的存档', 'error');
        let panels = {};
        try { panels = panelJson ? JSON.parse(panelJson) : {}; } catch (e) { return showToast('JSON格式错误', 'error'); }
        gameConfig.avatar = data.avatar || gameConfig.avatar;
        gameConfig.name = data.name || gameConfig.name;
        gameConfig.worldSetting = data.worldSetting;
        gameConfig.storyBackground = data.storyBackground;
        gameConfig.charName = data.defaultCharName;
        gameConfig.charInfo = data.defaultCharInfo;
        gameConfig.systemPromptText = data.systemPrompt;
        gameConfig.openingText = data.openingText;
        gameConfig.panels = panels;
        gameConfig.originalPanels = gameConfig.originalPanels || JSON.parse(JSON.stringify(panels));
        gameConfig.lastUpdated = Date.now();
        document.getElementById('gameTitle').innerText = gameConfig.name || gameConfig.charName || '冒险';
        saveLocalData();
        renderSidebarSessions();
        renderGamePanelsUI();
        closeModal('cardEditorModal');
        showToast('当前存档角色卡已更新', 'success');
        return;
    }
    if (id) {
        const idx = appState.cards.findIndex(c => c.id === id);
        if (idx !== -1) appState.cards[idx] = { ...appState.cards[idx], ...data };
    } else {
        data.id = generateId('card');
        data.created = Date.now();
        appState.cards.unshift(data);
    }
    saveLocalData();
    renderLibrary();
    closeModal('cardEditorModal');
    showToast("保存入库成功", "success");
}

export async function deleteCard(id) {
    if (await showConfirm("确定删除此卡？")) {
        appState.cards = appState.cards.filter(c => c.id !== id);
        saveLocalData();
        renderLibrary();
    }
}

// ===== 卡片详情页 =====
export function showCardDetail(cardId) {
    const card = appState.cards.find(c => c.id === cardId);
    if (!card) return;
    const modal = document.getElementById('cardDetailModal');
    if (!modal) return;
    document.getElementById('detailCardId').value = cardId;

    // 渲染面板预览（精美前端风格）
    let panelPreviewHtml = renderPanelPreviewHtml(card.panelTemplate);
    let hasPanels = panelPreviewHtml.length > 0;

    let loreItems = '';
    if (card.lorebook) {
        loreItems += '<div style="display:flex;flex-direction:column;gap:4px;">';
        for (const [k, v] of Object.entries(card.lorebook)) {
            // 使用结构化渲染器
            const rendered = renderInfoCard(k, v, '📖', '#8d6e63');
            loreItems += rendered;
        }
        loreItems += '</div>';
    }
    if (!loreItems) loreItems = '<div style="color:var(--text-muted);font-style:italic;font-size:0.8rem;">无图鉴条目</div>';

    const tags = Array.isArray(card.tags) ? card.tags : [];
    const metaBadges = [
        card.defaultCharName ? `👤 ${escapeHtml(card.defaultCharName)}` : '',
        card.spec ? `ST ${escapeHtml(card.specVersion || card.spec)}` : '',
        card.characterBookData?.entries?.length ? `📚 ${card.characterBookData.entries.length} 条角色书` : '',
        card.frontendAssets?.length ? `🌸 ${card.frontendAssets.length} 个内置前端` : ''
    ].filter(Boolean);

    document.getElementById('cardDetailContent').innerHTML = `
        <div class="card-detail-hero">
            ${renderAvatarHtml(card.avatar, '80px')}
            <div class="card-detail-titleblock">
                <div class="card-detail-name">${escapeHtml(card.name)}</div>
                <div class="card-detail-desc">${escapeHtml(card.description||'')}</div>
                <div class="card-detail-badges">
                    ${metaBadges.map(item => `<span class="badge">${item}</span>`).join('')}
                    ${tags.slice(0, 10).map(tag => `<span class="badge soft">#${escapeHtml(tag)}</span>`).join('')}
                </div>
            </div>
        </div>
        ${hasPanels ? `<section class="card-detail-section"><h4>📊 角色面板</h4>${panelPreviewHtml}</section>` : ''}
        <div class="card-detail-grid">
            <div class="card-detail-column">
                ${renderFrontendAssetsHtml(card.frontendAssets)}
                <section class="card-detail-section"><h4>🌍 世界观</h4><div class="panel-card">${escapeHtml(card.worldSetting||'未设定')}</div></section>
                <section class="card-detail-section"><h4>📖 背景故事</h4><div class="panel-card scroll-card">${escapeHtml(card.storyBackground||'未设定')}</div></section>
                <section class="card-detail-section"><h4>🎭 角色设定</h4><div class="panel-card">${escapeHtml(card.defaultCharInfo||'未设定')}</div></section>
            </div>
            <div class="card-detail-column">
                <section class="card-detail-section"><h4>🤖 系统提示词</h4><div class="panel-card scroll-card compact-text">${escapeHtml(card.systemPrompt||'未设定')}</div></section>
                <section class="card-detail-section"><h4>🎬 开场白</h4><div class="panel-card scroll-card italic-text">${escapeHtml(card.openingText||'无')}</div></section>
                ${card.exampleMessages ? `<section class="card-detail-section"><h4>💬 示例对话</h4><div class="panel-card scroll-card compact-text">${escapeHtml(card.exampleMessages)}</div></section>` : ''}
                <section class="card-detail-section"><h4>📇 图鉴 (${Object.keys(card.lorebook||{}).length}条)</h4>${loreItems}</section>
            </div>
        </div>
    `;
    requestAnimationFrame(() => mountFrontendFrames(document.getElementById('cardDetailContent')));
    modal.style.display = 'flex';
}

export function startAdventureFromDetail() {
    const cardId = document.getElementById('detailCardId')?.value;
    if (!cardId) return;
    closeModal('cardDetailModal');
    if (typeof window.openSessionSetup === 'function') {
        window.openSessionSetup(cardId);
    }
}

// ===== 清理 SillyTavern 占位符 =====
function cleanPlaceholders(text) {
    if (!text) return '';
    return text
        .replace(/<StatusPlaceHolderImpl\/>/g, '')
        .replace(/<\/?[A-Z][a-z]*PlaceHolder[A-Za-z]*\/?>/g, '')
        .replace(/<UpdateVariable[^>]*>[\s\S]*?<\/UpdateVariable>/g, '')
        .replace(/<Analysis>[\s\S]*?<\/Analysis>/g, '')
        .replace(/<[A-Z][a-z]*\/>/g, '')
        .replace(/\r\n\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// ===== SillyTavern 角色卡解析和导入 (PNG 格式) =====
// SillyTavern 角色卡标准格式：PNG 图片，角色数据以 base64 编码的 JSON 存储在 tEXt 块中

function parseSillyTavernCardFromPNGLegacy(arrayBuffer) {
    if (!arrayBuffer || arrayBuffer.byteLength < 100) return null;
    try {
        const bytes = new Uint8Array(arrayBuffer);
        
        // 验证 PNG 签名
        const pngSig = [137, 80, 78, 71, 13, 10, 26, 10];
        for (let i = 0; i < 8; i++) {
            if (bytes[i] !== pngSig[i]) return null;
        }
        
        // 遍历 PNG 块，查找 tEXt 块并检查 keyword
        let offset = 8;
        let jsonData = null;
        
        const textDecoder = new TextDecoder('utf-8');
        
        while (offset + 12 <= bytes.length) {
            const chunkLen = (bytes[offset] << 24) | (bytes[offset+1] << 16) |
                            (bytes[offset+2] << 8) | bytes[offset+3];
            const chunkType = String.fromCharCode(bytes[offset+4], bytes[offset+5],
                                                  bytes[offset+6], bytes[offset+7]);
            
            if (chunkType === 'tEXt' && chunkLen > 0) {
                const dataStart = offset + 8;
                const chunkBytes = bytes.slice(dataStart, dataStart + chunkLen);
                
                // tEXt 格式: keyword (null-terminated) + text string
                let nullPos = -1;
                for (let i = 0; i < chunkBytes.length; i++) {
                    if (chunkBytes[i] === 0) { nullPos = i; break; }
                }
                
                if (nullPos > 0) {
                    const keyword = textDecoder.decode(chunkBytes.slice(0, nullPos));
                    // SillyTavern 使用 keyword: chara, ccv3, ccv2, ccv1
                    if (['chara', 'ccv3', 'ccv2', 'ccv1'].includes(keyword)) {
                        const encodedData = textDecoder.decode(chunkBytes.slice(nullPos + 1)).trim();
                        // 数据是 base64 编码的 JSON，需要正确转换 UTF-8
                        try {
                            // atob 返回 Latin-1 字符串，需转成 UTF-8
                            const latin1 = atob(encodedData);
                            // 方法1: 用 TextDecoder 解码 UTF-8
                            const utf8Bytes = new Uint8Array(latin1.length);
                            for (let i = 0; i < latin1.length; i++) {
                                utf8Bytes[i] = latin1.charCodeAt(i);
                            }
                            const decodedStr = new TextDecoder('utf-8').decode(utf8Bytes);
                            jsonData = JSON.parse(decodedStr);
                            break;
                        } catch (_) {
                            // 备用方案：escape/unescape 转换
                            try {
                                const latin1 = atob(encodedData);
                                const decodedStr = decodeURIComponent(escape(latin1));
                                jsonData = JSON.parse(decodedStr);
                                break;
                            } catch(__) {}
                        }
                    }
                }
            }
            
            offset += 12 + chunkLen;
            if (chunkType === 'IEND') break;
            if (offset > bytes.length) break;
        }
        
        if (!jsonData) return null;
        
        // 解析角色数据 - SillyTavern V2/V3 格式
        const charData = jsonData.data || jsonData;
        
        const card = {
            id: generateId('card'),
            created: Date.now(),
            avatar: '🖼️',
            name: charData.name || '未命名角色',
            description: (charData.description || '').substring(0, 100),
            // worldSetting: 优先用 extensions.world，其次 scenario，最后默认
            worldSetting: charData.extensions?.world || charData.scenario || '奇幻冒险世界',
            storyBackground: charData.description || '一段新的冒险...',
            defaultCharName: charData.your_name || charData.player_name || '',
            defaultCharInfo: charData.personality || '',
            // systemPrompt: 合并 depth_prompt 和 system_prompt
            systemPrompt: [
                charData.system_prompt,
                charData.creator_notes,
                charData.instructions,
                charData.extensions?.depth_prompt?.prompt
            ].filter(Boolean).join('\n') || '你是硬核DM。',
            // openingText: 清理 SillyTavern 占位符
            openingText: cleanPlaceholders(charData.first_mes || charData.greeting || '故事开始了...'),
            lorebook: {},
            panelTemplate: '{}',
            avatarDataUrl: null,
            // 保存 character_book 原始数据，创建会话时注入 memoryDb
            characterBookData: null
        };
        
        // 如果有多条开场白，取第一条非占位符的
        if (charData.alternate_greetings && Array.isArray(charData.alternate_greetings)) {
            for (const g of charData.alternate_greetings) {
                const cleaned = cleanPlaceholders(g);
                if (cleaned && cleaned !== '故事开始了...') {
                    card.openingText = cleaned;
                    break;
                }
            }
        }
        
        // 替换头像为 PNG 图片本身的 data URL
        card.avatar = arrayBufferToDataUrl(arrayBuffer, 'image/png');
        card.avatarDataUrl = card.avatar;
        
        // 尝试从 post_history_instructions 获取更多提示词
        if (charData.post_history_instructions) {
            card.systemPrompt = (card.systemPrompt + '\n' + charData.post_history_instructions).trim();
        }
        
        // ===== 从 character_book 构建丰富的面板结构 =====
        try {
            let panels = null;
            
            if (charData.character_book?.entries && charData.character_book.entries.length > 0) {
                panels = buildImportedPanelsFromCharacterBook(charData, card);
            }
            
            // 如果没有 character_book 或构建失败，用默认模板
            if (!panels) {
                panels = {
                    "人物核心": { "姓名": card.defaultCharName || card.name || '{charName}', "状态": "正常" },
                    "角色设定": card.defaultCharInfo ? [card.defaultCharInfo.substring(0, 500)] : [],
                    "随身物品": []
                };
            }
            
            card.panelTemplate = JSON.stringify(panels, null, 2);
        } catch (_) {}

// ===== 从 character_book 构建面板 =====

// 解析扁平文本为结构化 JSON 对象
// "基本信息: 姓名: 江甜甜 年龄: 16岁..." → {"基本信息": {"姓名": "江甜甜", "年龄": "16岁"}}
function parseFlatToStructured(flatText) {
    const secHeaders = ['基本信息','外貌特征','互动设定','背景经历','特殊状态','性格特质','能力装备','其他'];
    const fieldKeys = ['姓名','年龄','性别','身份','年级班级','网名','昵称','发色','发型','发饰','特征','整体印象','体型','皮肤','气质','简介','关系','性经验','与{{user}}关系'];
    
    let t = flatText.replace(/^角色档案[\s\S]*?(基本信息\s*[：:]|角色档案\s*[：:])/, '');
    t = t.replace(/^\s*[：:]\s*/, '');
    
    // 按章节标题拆分
    const secPattern = new RegExp('(?=' + secHeaders.map(s => s + '\\s*[：:]').join('|') + ')');
    const parts = t.split(secPattern);
    const result = {};
    
    for (const part of parts) {
        const p = part.trim();
        if (!p) continue;
        
        // 确定是哪个章节
        let secName = '';
        for (const s of secHeaders) {
            if (p.indexOf(s) === 0) {
                secName = s;
                break;
            }
        }
        if (!secName) continue;
        
        // 去掉章节标题部分
        let content = p.substring(secName.length).replace(/^\s*[：:]\s*/, '');
        
        // 按字段拆分
        const fieldPattern = new RegExp('(?=' + fieldKeys.map(k => k + '\\s*[：:]').join('|') + ')');
        const fieldParts = content.split(fieldPattern);
        const secObj = {};
        
        for (const fp of fieldParts) {
            const f = fp.trim();
            if (!f) continue;
            let keyName = '';
            for (const k of fieldKeys) {
                if (f.indexOf(k) === 0) {
                    keyName = k;
                    break;
                }
            }
            if (!keyName) continue;
            let val = f.substring(keyName.length).replace(/^\s*[：:]\s*/, '').replace(/\\n/g, '\n').trim();
            if (val) secObj[keyName] = val;
        }
        
        if (Object.keys(secObj).length > 0) result[secName] = secObj;
    }
    
    return result;
}

// 将结构化对象格式化为 <profile> JSON 字符串
function formatAsProfileJSON(parsedObj) {
    if (!parsedObj || Object.keys(parsedObj).length === 0) return '';
    const profile = { "角色档案": parsedObj };
    return JSON.stringify(profile, null, 4);
}

// 解析物品扁平文本
function parseItemToStructured(flatText) {
    const itemKeys = ['物品名称','载体','图标','性质','核心功能','来源','稀有度','数量'];
    let t = flatText;
    
    // 按字段拆分
    const fieldPattern = new RegExp('(?=' + itemKeys.map(k => k + '\\s*[：:]').join('|') + ')');
    const parts = t.split(fieldPattern);
    const result = {};
    
    for (const part of parts) {
        const p = part.trim();
        if (!p) continue;
        let keyName = '';
        for (const k of itemKeys) {
            if (p.indexOf(k) === 0) {
                keyName = k;
                break;
            }
        }
        if (!keyName) continue;
        let val = p.substring(keyName.length).replace(/^\s*[：:]\s*/, '').replace(/\s+/g, ' ').trim();
        if (val) {
            // 处理列表项：- xxx
            if (val.includes('- ')) {
                const lines = val.split('- ').filter(Boolean);
                if (lines.length > 1) {
                    val = '【' + keyName + '】\\n' + lines.map(l => '- ' + l.trim()).join('\\n');
                    result['核心内容'] = result['核心内容'] || '';
                    result['核心内容'] += lines.map(l => l.trim()).join('\\n');
                    continue;
                }
            }
            result[keyName] = val;
        }
    }
    
    return result;
}

// 解析世界观扁平文本
function parseWorldToStructured(flatText) {
    const lines = flatText.split('\n').map(l => l.trim()).filter(Boolean);
    const result = {};
    let currentKey = '';
    let currentVal = '';
    
    for (const line of lines) {
        // 跳过纯分隔符行
        if (/^[-\s]*$/.test(line) || /^[✏️✕📌]+/.test(line)) continue;
        // 检测 "Key: Value" 长键模式（键至少2个字符）
        const kvMatch = line.match(/^([\u4e00-\u9fa5]{2,10})[：:]\s*(.+)/);
        if (kvMatch) {
            if (currentKey && currentVal) result[currentKey] = currentVal.trim();
            currentKey = kvMatch[1].trim();
            currentVal = kvMatch[2].trim();
            continue;
        }
        // 检测 "- 内容" 列表项
        const listMatch = line.match(/^-\s+(.+)/);
        if (listMatch) {
            if (currentKey) {
                currentVal += '\n' + line;
            } else {
                currentKey = '要点';
                currentVal = line;
            }
            continue;
        }
        // 单字键行（世界观的特殊格式：单字标题行）
        const singleKeyMatch = line.match(/^([\u4e00-\u9fa5])$/);
        if (singleKeyMatch) {
            if (currentKey && currentVal) {
                // 如果当前key已经积累了一段，保存它
                if (currentVal.length > 2) result[currentKey] = currentVal.trim();
            }
            currentKey = singleKeyMatch[1];
            currentVal = '';
            continue;
        }
        // 普通内容行，追加到当前key
        if (currentKey) {
            currentVal += (currentVal ? ' ' : '') + line;
        }
    }
    if (currentKey && currentVal && currentVal.length > 2) result[currentKey] = currentVal.trim();
    
    return Object.keys(result).length > 0 ? result : { '设定': flatText.replace(/\s+/g, ' ').trim().substring(0, 300) };
}

// 清理标签前缀
function cleanLabel(label) {
    if (!label) return '';
    return label.replace(/^(item_|activity_|school_|world_|rule_|role_|mvu_|initvar_)/i, '');
}

function buildPanelsFromCharacterBook(charData, card) {
    const panels = {};
    const entries = (charData.character_book?.entries || []).filter(e =>
        !/^\[?(initvar|mvu_|regex_)/i.test(e.comment || '')
    );
    if (entries.length === 0) return null;
    
    // 1. 人物核心 - 键值对
    panels["人物核心"] = { 
        "姓名": card.defaultCharName || card.name || '{charName}', 
        "状态": "正常"
    };
    for (const e of entries) {
        const c = (e.content || '').replace(/<[^>]+>/g, " ");
        const locMatch = c.match(/所在地[：:]\s*([^\n<]+)/);
        if (locMatch) { panels["人物核心"]["所在地"] = locMatch[1].trim(); break; }
    }
    
    // 2. 角色档案 → 键值对
    const charEntries = entries.filter(e => 
        (e.comment||'').includes('角色档案') || e.comment?.includes('角色卡') || 
        e.comment?.startsWith('role_') || (e.keys && e.keys.length > 0 && (e.content||'').includes('年龄'))
    );
    if (charEntries.length > 0) {
        const relPanel = {};
        charEntries.forEach(e => {
            const c = (e.content || '').replace(/<[^>]+>/g, " ");
            const nameMatch = c.match(/姓名[：:]\s*([\u4e00-\u9fa5]{2,4})/);
            if (nameMatch) {
                const npcName = nameMatch[1];
                const age = c.match(/年龄[：:]\s*([^\n]+)/)?.[1]?.trim() || '';
                const identity = c.match(/身份[：:]\s*([^\n]+)/)?.[1]?.trim() || '';
                const rel = c.match(/与\{\{user\}\}关系[：:]\s*([^\n]+)/)?.[1]?.trim() || '';
                const cls = c.match(/(?:年级|班级)[：:]\s*([^\n]+)/)?.[1]?.trim() || '';
                const info = [age, identity, cls, rel].filter(Boolean).join(' | ');
                if (info) relPanel[npcName] = info;
            }
        });
        if (Object.keys(relPanel).length > 0) panels["社交关系"] = relPanel;
        
        const charPanel = {};
        charEntries.forEach(e => {
            const c = (e.content || '').replace(/<[^>]+>/g, " ");
            const nameMatch = c.match(/姓名[：:]\s*([\u4e00-\u9fa5]{2,4})/);
            if (nameMatch) {
                const npcName = nameMatch[1];
                const parsed = parseFlatToStructured(c);
                if (Object.keys(parsed).length > 0) {
                    charPanel[npcName] = parsed;
                } else {
                    const desc = c.replace(/\s+/g, ' ').trim();
                    charPanel[npcName] = desc.substring(0, 1500);
                }
            }
        });
        if (Object.keys(charPanel).length > 0) panels["角色档案"] = charPanel;
    }
    
    // 3. 物品 → 键值对
    const itemEntries = entries.filter(e => 
        (e.comment||'').startsWith('item_') || (e.comment||'').includes('物品')
    );
    if (itemEntries.length > 0) {
        const itemPanel = {};
        itemEntries.forEach(e => {
            const c = (e.content || '').replace(/<[^>]+>/g, " ");
            const nameMatch = c.match(/物品名称[：:]\s*([^\n]+)/);
            if (nameMatch) {
                const name = nameMatch[1].trim();
                let raw = c.replace(/^\s+|\s+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
                if (raw.length > 8000) raw = raw.substring(0, 8000);
                itemPanel[name] = raw;
            }
        });
        if (Object.keys(itemPanel).length > 0) panels["随身物品"] = itemPanel;
    }
    
    // 4. 世界观 → 键值对
    const worldEntry = entries.find(e => 
        (e.comment||'').startsWith('world_') || (e.comment||'').includes('世界观') ||
        (e.comment||'').includes('学校') && (e.comment||'').includes('概况')
    );
    if (worldEntry) {
        // Store worldview as formatted raw text - preserve newlines and structure
        let raw = (worldEntry.content || '').replace(/<[^>]+>/g, "");
        // Clean excessive whitespace but keep structure
        raw = raw.replace(/^\s+|\s+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
        if (raw.length > 10000) raw = raw.substring(0, 10000);
        panels["世界观"] = { "全文": raw };
    }
    
    // 5. 校规 → 键值对
    const ruleEntries = entries.filter(e => 
        (e.comment||'').startsWith('rule_') || (e.comment||'').includes('校规')
    );
    if (ruleEntries.length > 0) {
        const rulePanel = {};
        ruleEntries.forEach((e, i) => {
            const c = (e.content || '').replace(/<[^>]+>/g, " ");
            const title = c.match(/文件名称[：:]\s*([^\n]+)/)?.[1]?.trim() || 
                c.match(/物品名称[：:]\s*([^\n]+)/)?.[1]?.trim() || 
                (cleanLabel(e.comment) || '校规' + (i+1));
            let raw = c.replace(/^\s+|\s+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
            if (raw) rulePanel[title] = raw.substring(0, 8000);
        });
        if (Object.keys(rulePanel).length > 0) panels["校规"] = rulePanel;
    }
    
    // 6. 校园活动 → 键值对
    const activityEntries = entries.filter(e => 
        (e.comment||'').includes('作息') || (e.comment||'').includes('时间表') ||
        (e.comment||'').startsWith('activity_')
    );
    if (activityEntries.length > 0) {
        const actPanel = {};
        activityEntries.forEach((e, i) => {
            const c = (e.content || '').replace(/<[^>]+>/g, " ");
            const raw = c.replace(/^\s+|\s+$/gm, '').replace(/\n{3,}/g, '\n\n').trim().substring(0, 5000);
            if (raw) actPanel[(cleanLabel(e.comment) || '活动' + (i+1))] = raw;
        });
        if (Object.keys(actPanel).length > 0) panels["校园活动"] = actPanel;
    }
    
    // 7. 区域 → 键值对
    panels["区域地图"] = { "当前位置": charData.extensions?.world || '圣樱学院' };
    
    return Object.keys(panels).length > 0 ? panels : null;
}
        // 解析标签
        if (charData.tags && Array.isArray(charData.tags)) {
            const lb = {};
            charData.tags.forEach(tag => {
                if (typeof tag === 'string') lb[tag] = '角色标签';
            });
            if (Object.keys(lb).length > 0) card.lorebook = lb;
        }
        
        // 解析 character_book (世界书/图鉴) - 这是 SillyTavern 的核心数据
        if (charData.character_book?.entries) {
            // 保存原始数据供创建会话时注入 memoryDb
            card.characterBookData = charData.character_book;
            
            const lb = buildLorebookFromCharacterBook(charData.character_book, card.lorebook || {});
            for (const entry of charData.character_book.entries) {
                const key = entry.comment || (entry.keys && entry.keys[0]) || '条目';
                
                // 尝试从特定条目提取世界观和背景故事
                const lowerKey = key.toLowerCase();
                const lowerContent = (entry.content || '').toLowerCase();
                
                // 世界观类条目
                if ((lowerKey.includes('world') || lowerKey.includes('世界观') || 
                     lowerKey.includes('school') || lowerKey.includes('学校')) && 
                    entry.content && entry.content.length > 50) {
                    const plainText = entry.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, ' ').trim();
                    if (plainText.length > 50) {
                        // 如果卡片的世界观还是默认值，用这个替换
                        if (card.worldSetting === '奇幻冒险世界' || !card.worldSetting) {
                            card.worldSetting = plainText.substring(0, 500);
                        }
                        if (card.storyBackground === '一段新的冒险...' || !card.storyBackground) {
                            card.storyBackground = plainText.substring(0, 800);
                        }
                    }
                }
            }
            card.lorebook = lb;
        }
        
        return card;
        
    } catch (e) {
        console.error('解析 PNG 角色卡失败:', e);
        return null;
    }
}

export function openSillyTavernImportModal() {
    const modal = document.getElementById('sillyTavernImportModal');
    if (!modal) return;
    modal.style.display = 'flex';
}

// 统一 PNG/JSON 角色卡入口。旧解析器保留在文件中作为历史兼容代码，但新导入不再走分叉逻辑。
export function parseSillyTavernCardFromPNG(arrayBuffer) {
    if (!arrayBuffer) return null;
    try {
        const avatar = isPngArrayBuffer(arrayBuffer) ? arrayBufferToDataUrl(arrayBuffer, 'image/png') : null;
        const card = parseSillyTavernCharacterCard(arrayBuffer, { avatar });
        return card;
    } catch (error) {
        console.error('解析 SillyTavern 角色卡失败:', error);
        return null;
    }
}

export function parseSillyTavernCardFromJSON(text) {
    try {
        const card = parseSillyTavernCharacterCard(text);
        return card || parseSillyTavernCard(text);
    } catch (error) {
        console.error('解析 JSON 角色卡失败:', error);
        return null;
    }
}

export function importSillyTavernFromFile() {
    const input = document.getElementById('stFileInput');
    if (!input || !input.files?.[0]) return showToast('请选择 PNG 或 JSON 角色卡文件', 'warning');
    const file = input.files[0];
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const buffer = e.target.result;
            const isJsonName = file.type === 'application/json' || /\.json$/i.test(file.name);
            const card = isJsonName
                ? parseSillyTavernCardFromJSON(new TextDecoder().decode(new Uint8Array(buffer)))
                : parseSillyTavernCardFromPNG(buffer) || parseSillyTavernCardFromJSON(new TextDecoder().decode(new Uint8Array(buffer)));
            if (!card) {
                showToast('❌ 无法解析该文件。请确认它是 PNG 内嵌角色卡、旧版 JSON 或有效的角色卡文本。', 'error', 6000);
                return;
            }
            if (card.avatarDataUrl && isPngArrayBuffer(buffer)) card.avatar = card.avatarDataUrl;
            appState.cards.unshift(card);
            saveLocalData();
            renderLibrary();
            closeModal('sillyTavernImportModal');
            showToast('✅ 成功导入角色卡: ' + card.name, 'success');
        } catch (error) {
            console.error('导入角色卡失败:', error);
            showToast('❌ 导入失败：文件内容不完整或格式不受支持', 'error', 6000);
        }
    };
    reader.onerror = () => showToast('❌ 文件读取失败，请重新选择文件', 'error');
    reader.readAsArrayBuffer(file);
}

export function importSillyTavernFromPaste() {
    // 从粘贴框导入也支持
    const html = document.getElementById('stPasteInput')?.value?.trim();
    if (!html) return showToast('请粘贴内容', 'warning');
    
    try {
        const card = parseSillyTavernCardFromJSON(html);
        if (!card) return showToast('无法解析粘贴内容', 'error');
        appState.cards.unshift(card);
        saveLocalData();
        renderLibrary();
        closeModal('sillyTavernImportModal');
        showToast('✅ 成功导入角色卡: ' + card.name, 'success');
    } catch (_) {
        showToast('粘贴内容格式不支持，请检查 JSON、Base64 或 HTML 内容', 'warning');
    }
}

// === 也支持 HTML 格式的解析 (备用) ===
export function parseSillyTavernCard(htmlContent) {
    if (!htmlContent || typeof htmlContent !== 'string') return null;
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        const card = {};
        const avatarImg = doc.querySelector('.character-portrait img, .char-portrait img, .avatar img');
        card.avatar = avatarImg?.getAttribute('src') || '📜';
        const nameEl = doc.querySelector('.character-name h1, .char-name h1, .character-name, .char-name, [data-name]');
        card.name = nameEl?.textContent?.trim() || '未命名角色';
        const descEl = doc.querySelector('.character-bio p, .char-bio p, .character-bio, .char-bio, .description p');
        card.description = descEl?.textContent?.trim() || '';
        const findText = (selectors) => {
            for (const s of selectors) {
                const el = doc.querySelector(s);
                if (el?.textContent?.trim()) return el.textContent.trim();
            }
            return '';
        };
        card.worldSetting = findText(['.world-setting .content', '.world-setting', '.background-text', '[data-world]']) || '奇幻冒险世界';
        card.storyBackground = findText(['.story-background', '.background-story', '.story-text', '.char-desc', '[data-story]']) || '一段新的冒险即将开始...';
        card.defaultCharName = findText(['.player-name', '.main-char-name', '[data-player-name]']) || '冒险者';
        card.defaultCharInfo = findText(['.player-desc', '.player-info', '.char-info', '[data-char-info]']) || '勇敢的旅人。';
        card.systemPrompt = findText(['.ai-prompt', '.system-prompt', '.system-instructions', '[data-system-prompt]']) || '你是硬核DM，严格判定。';
        card.openingText = findText(['.opening-text', '.first-scene', '.opening', '[data-opening]']) || '故事开始了...';
        
        let panelData = {};
        const scriptData = doc.querySelector('script[type="application/json"], script.panel-data');
        if (scriptData) {
            try { panelData = JSON.parse(scriptData.textContent); } catch (_) {}
        }
        if (!panelData || Object.keys(panelData).length === 0) {
            panelData = {
                "人物核心": { "姓名": card.defaultCharName || "{charName}", "等级": 1, "生命值": "100/100" },
                "随身行囊": [{ "name": "冒险者背包", "qty": 1, "desc": "基础冒险装备" }],
                "状态记录": [],
                "社交关系": { "节点": [{ "id": card.defaultCharName || "{charName}", "name": card.defaultCharName || "{charName}", "type": "主角", "color": "#d3765c" }], "连线": [] },
                "区域地图": { "当前位置": "出发地", "区域": [{ "id": "出发地", "name": "出发地", "type": "村镇" }], "路线": [] }
            };
        }
        card.panelTemplate = JSON.stringify(panelData, null, 2);
        
        const lorebook = {};
        doc.querySelectorAll('.lore-item, .lore-entry').forEach(el => {
            const key = el.querySelector('.lore-title, .lore-key, .term')?.textContent?.trim();
            const val = el.querySelector('.lore-content, .lore-value, .definition')?.textContent?.trim();
            if (key && val) lorebook[key] = val;
        });
        
        return {
            id: generateId('card'),
            created: Date.now(),
            avatar: card.avatar || '📜',
            name: card.name,
            description: card.description,
            worldSetting: card.worldSetting,
            storyBackground: card.storyBackground,
            defaultCharName: card.defaultCharName || '冒险者',
            defaultCharInfo: card.defaultCharInfo || '一位勇敢的冒险者。',
            panelTemplate: card.panelTemplate,
            systemPrompt: card.systemPrompt,
            openingText: card.openingText,
            lorebook: lorebook
        };
    } catch (e) {
        console.error('解析 HTML 角色卡失败:', e);
        return null;
    }
}

// ===== 导出到 window =====
window.openCardEditor = openCardEditor;
window.openSessionCardEditor = openSessionCardEditor;
window.saveCardEditor = saveCardEditor;
window.deleteCard = deleteCard;
window.duplicateCard = duplicateCard;
window.renderLibrary = renderLibrary;
window.showCardDetail = showCardDetail;
window.startAdventureFromDetail = startAdventureFromDetail;
window.openSillyTavernImportModal = openSillyTavernImportModal;
window.importSillyTavernFromFile = importSillyTavernFromFile;
window.importSillyTavernFromPaste = importSillyTavernFromPaste;
