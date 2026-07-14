// ================= 面板渲染系统 =================
import { gameConfig, relationCanvasEl, mapCanvasEl, relationWrapperEl, mapWrapperEl, relObserver, mapObserver, mapAnimReq, setRelationCanvasEl, setMapCanvasEl, setRelationWrapperEl, setMapWrapperEl, setRelObserver, setMapObserver, setMapAnimReq } from './state.js';
import { escapeHtml, isRelationPanel, isMapPanel, isInventoryPanel, isQuestPanel, isCharacterPanel } from './constants.js';
import { showToast, showConfirm } from './ui.js';
import { saveLocalData } from './storage.js';
import { renderSidebarSessions } from './sessions.js';
import { renderStructuredText } from './structured-renderer.js';
import { syncPanelOrder } from './world-state.js';

// ===== 面板数据操作 =====
export function deleteCustomPanel(name) {
    if (!gameConfig) return;
    delete gameConfig.panels[name];
    gameConfig.customPanels = (gameConfig.customPanels || []).filter(p => p !== name);
    saveLocalData();
    renderGamePanelsUI();
    renderSidebarSessions();
}

export function openAddPropertyModal(tabName) {
    document.getElementById('addPropModalName').value = '';
    document.getElementById('addPropModalValue').value = '';
    document.getElementById('addPropModalTabName').value = tabName;
    document.getElementById('addPropModal').style.display = 'flex';
}

export function confirmAddProperty() {
    const tabName = document.getElementById('addPropModalTabName').value;
    const key = document.getElementById('addPropModalName').value.trim();
    const val = document.getElementById('addPropModalValue').value.trim();
    if (!key || !val) return showToast('属性名和值不能为空', 'error');
    if (!gameConfig?.panels?.[tabName]) return;
    if (typeof gameConfig.panels[tabName] === 'object' && !Array.isArray(gameConfig.panels[tabName])) {
        gameConfig.panels[tabName][key] = isNaN(Number(val)) ? val : Number(val);
    }
    document.getElementById('addPropModal').style.display = 'none';
    saveLocalData();
    renderGamePanelsUI();
    showToast('属性已添加', 'success');
}

export function openEditPropertyModal(tabName, key) {
    document.getElementById('editPropModalKey').value = key;
    document.getElementById('editPropModalValue').value = (function(v){
        if (v === null || v === undefined) return '';
        if (typeof v === 'object') {
            try { return JSON.stringify(v, null, 2); } catch(e) { return String(v); }
        }
        return String(v);
    })(gameConfig.panels?.[tabName]?.[key]);
    document.getElementById('editPropModalTabName').value = tabName;
    document.getElementById('editPropModal').style.display = 'flex';
}

export function confirmEditProperty() {
    const tabName = document.getElementById('editPropModalTabName').value;
    const oldKey = document.getElementById('editPropModalKey').value;
    const newKey = document.getElementById('editPropModalNewKey').value.trim() || oldKey;
    const val = document.getElementById('editPropModalValue').value.trim();
    if (!newKey || !val) return showToast('键值不能为空', 'error');
    if (!gameConfig?.panels?.[tabName]) return;
    if (oldKey !== newKey) {
        delete gameConfig.panels[tabName][oldKey];
    }
    gameConfig.panels[tabName][newKey] = isNaN(Number(val)) ? val : Number(val);
    document.getElementById('editPropModal').style.display = 'none';
    document.getElementById('editPropModalNewKey').value = '';
    saveLocalData();
    renderGamePanelsUI();
    showToast('属性已更新', 'success');
}

export function deleteProperty(tabName, key) {
    if (!gameConfig?.panels?.[tabName]) return;
    delete gameConfig.panels[tabName][key];
    saveLocalData();
    renderGamePanelsUI();
}

export function addListItem(tabName) {
    const input = document.getElementById('listAdd_' + tabName);
    if (!input || !input.value.trim()) return;
    if (!gameConfig?.panels?.[tabName]) return;
    gameConfig.panels[tabName].push(input.value.trim());
    input.value = '';
    saveLocalData();
    renderGamePanelsUI();
}

export function removeListItem(tabName, idx) {
    if (!gameConfig?.panels?.[tabName]) return;
    gameConfig.panels[tabName].splice(idx, 1);
    saveLocalData();
    renderGamePanelsUI();
}

export function openEditListItemModal(tabName, idx) {
    document.getElementById('editListItemIdx').value = idx;
    document.getElementById('editListItemTab').value = tabName;
    document.getElementById('editListItemValue').value = String(gameConfig.panels?.[tabName]?.[idx] || '');
    document.getElementById('editListItemModal').style.display = 'flex';
}

export function confirmEditListItem() {
    const tabName = document.getElementById('editListItemTab').value;
    const idx = parseInt(document.getElementById('editListItemIdx').value);
    const val = document.getElementById('editListItemValue').value.trim();
    if (!val || !gameConfig?.panels?.[tabName]) return;
    gameConfig.panels[tabName][idx] = val;
    document.getElementById('editListItemModal').style.display = 'none';
    saveLocalData();
    renderGamePanelsUI();
}

export function openAddCustomPanelModal() {
    document.getElementById('addCustomPanelInput').value = '';
    document.getElementById('addCustomPanelModal').style.display = 'flex';
}

export function confirmAddCustomPanel() {
    const name = document.getElementById('addCustomPanelInput').value.trim();
    if (!name) return showToast('面板名不能为空', 'error');
    if (!gameConfig) return;
    if (gameConfig.panels[name]) return showToast('面板已存在', 'warning');
    gameConfig.panels[name] = {};
    gameConfig.customPanels = gameConfig.customPanels || [];
    gameConfig.customPanels.push(name);
    document.getElementById('addCustomPanelModal').style.display = 'none';
    saveLocalData();
    renderGamePanelsUI();
    showToast(`📌 面板「${name}」已创建`, 'success');
}

export function preserveSpecialPanels(panels) {
    // 保留社交/地图等特殊面板的结构完整性
    for (const k in panels) {
        if (isRelationPanel(k) || isMapPanel(k)) {
            const cur = gameConfig?.panels?.[k];
            if (cur && typeof cur === 'object') {
                if (isRelationPanel(k) && cur.nodes && panels[k].nodes) {
                    panels[k].nodes = cur.nodes;
                    panels[k].links = cur.links;
                }
                if (isMapPanel(k) && cur.area && panels[k].area) {
                    panels[k].area = cur.area;
                }
            }
        }
    }
}

// ===== 面板值渲染工具 =====
function renderValueToHTML(val, depth = 0) {
    if (val === null || val === undefined || val === '') return '<span class="value-empty">—</span>';
    if (depth > 5) return `<span class="value-text">${escapeHtml(String(val))}</span>`;

    if (typeof val === 'number' || typeof val === 'boolean') {
        return `<span class="value-text value-number">${escapeHtml(String(val))}</span>`;
    }

    if (typeof val === 'string') {
        const progress = val.match(/^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/);
        if (progress && Number(progress[2]) > 0) {
            const pct = Math.max(0, Math.min(100, (Number(progress[1]) / Number(progress[2])) * 100));
            return `<div class="value-progress"><div class="value-progress-track"><div class="value-progress-fill" style="width:${pct}%"></div></div><span>${escapeHtml(val)}</span></div>`;
        }
        if (val.length > 80 || /\n/.test(val) || /[：:]\s*/.test(val) || /^\s*[-*•]/m.test(val)) {
            return `<div class="value-long-text">${renderStructuredText(val, 2400)}</div>`;
        }
        return `<span class="value-text">${escapeHtml(val)}</span>`;
    }

    if (Array.isArray(val)) return renderArrayValue(val, depth);
    if (typeof val === 'object') return renderObjectValue(val, depth);
    return `<span class="value-text">${escapeHtml(String(val))}</span>`;
}

function renderArrayValue(items, depth) {
    if (!items.length) return '<span class="value-empty">暂无记录</span>';
    const objectItems = items.every(item => item && typeof item === 'object' && !Array.isArray(item));
    if (objectItems && items.some(item => item.time || item.title || item.desc || item.content)) {
        return `<div class="value-list value-object-list">${items.map((item, index) => {
            const title = item.time || item.title || item.name || `条目 ${index + 1}`;
            const body = item.content || item.desc || item.description || item.value || '';
            const rest = Object.entries(item).filter(([key]) => !['time', 'title', 'name', 'desc', 'description', 'content', 'value'].includes(key));
            return `<div class="value-list-item"><div class="value-list-marker">${escapeHtml(String(index + 1).padStart(2, '0'))}</div><div class="value-list-body"><div class="value-list-title">${escapeHtml(title)}</div>${body ? `<div class="value-list-desc">${escapeHtml(String(body))}</div>` : ''}${rest.length ? `<div class="value-list-meta">${rest.map(([key, value]) => `<span><b>${escapeHtml(key)}</b> ${escapeHtml(formatScalar(value))}</span>`).join('')}</div>` : ''}</div></div>`;
        }).join('')}</div>`;
    }
    if (items.every(item => typeof item !== 'object')) {
        return `<div class="value-chip-list">${items.map(item => `<span class="value-chip">${escapeHtml(String(item))}</span>`).join('')}</div>`;
    }
    return `<div class="value-list">${items.map(item => `<div class="value-list-item simple"><span class="value-list-marker">•</span><div class="value-list-body">${renderValueToHTML(item, depth + 1)}</div></div>`).join('')}</div>`;
}

function renderObjectValue(obj, depth) {
    const entries = Object.entries(obj);
    if (!entries.length) return '<span class="value-empty">暂无记录</span>';
    return `<div class="value-object">${entries.map(([key, value]) => `<div class="value-object-row"><div class="value-object-key">${escapeHtml(key)}</div><div class="value-object-value">${renderValueToHTML(value, depth + 1)}</div></div>`).join('')}</div>`;
}

function formatScalar(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

function renderInventoryList(data) {
    let items = [];
    if (Array.isArray(data)) items = data.map(i => typeof i === 'string' ? { name: i, qty: 1 } : { name: i.name || i.id || '?', qty: i.count || i.qty || 1, desc: i.desc || '' });
    else if (typeof data === 'object')
        for (let k in data) items.push(typeof data[k] === 'object' ? { name: k, qty: data[k].count || data[k].qty || 1, desc: data[k].desc || '' } : { name: k, qty: data[k] });
    if (!items.length) return '<div style="color:var(--text-muted);padding:12px;text-align:center;font-style:italic;">空</div>';
    let html = '';
    items.forEach(it => {
        let icon = '🎒', isLeg = false;
        if (/剑|刀|枪|斧|弓/.test(it.name)) icon = '⚔️';
        else if (/药|丹|血瓶/.test(it.name)) icon = '💊';
        else if (/金|银|铜|币|钱/.test(it.name)) icon = '🪙';
        else if (/甲|盾|盔/.test(it.name)) icon = '🛡️';
        else if (/书|卷轴|信/.test(it.name)) icon = '📜';
        if (/史诗|传说|神器|金|远古|神/.test(it.name) || /史诗|传说|神器/.test(it.desc)) isLeg = true;
        html += `<div class="inv-list-item ${isLeg?'item-legendary':''}" ${isLeg ? `onclick="openLegendaryItem('${escapeHtml(it.name)}','${escapeHtml(it.desc)}')"` : ''}><div class="inv-list-icon">${icon}</div><div class="inv-list-info"><div class="inv-list-name">${escapeHtml(it.name)}</div><div style="font-size:0.75rem;color:var(--text-muted);line-height:1.3;">${escapeHtml(it.desc||'')}</div></div><div class="inv-list-qty">x${it.qty}</div></div>`;
    });
    return html;
}

function renderQuestList(data) {
    let items = [];
    if (Array.isArray(data)) items = data.map(i => typeof i === 'string' ? { title: i, status: '未完成' } : { title: i.title || i.name || '任务', status: i.status || '进行中', desc: i.desc || '' });
    if (!items.length) return '<div style="color:var(--text-muted);padding:12px;text-align:center;font-style:italic;">无</div>';
    let html = '';
    items.forEach(it => {
        let color = /完成|结束/.test(it.status) ? 'var(--color-success)' : (/失败|放弃/.test(it.status) ? 'var(--color-danger)' : '#3498db');
        html += `<div class="panel-card" style="border-left:4px solid ${color};"><div style="display:flex;justify-content:space-between;margin-bottom:4px;flex-wrap:wrap;gap:4px;"><div style="font-weight:bold;color:var(--text-main);font-family:var(--font-serif);font-size:0.9rem;">${escapeHtml(it.title)}</div><div style="font-size:0.7rem;color:${color};font-weight:bold;background:rgba(255,255,255,0.7);padding:1px 8px;border-radius:4px;">${escapeHtml(it.status)}</div></div><div style="font-size:0.8rem;color:var(--text-muted);line-height:1.4;">${escapeHtml(it.desc||'')}</div></div>`;
    });
    return html;
}

// ===== 面板切换 =====
export function switchGamePanelTab(tabName) {
    document.querySelectorAll('.panel-tab-btn').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.panel-tab-btn').forEach(el => { if (el.innerText.includes(tabName)) el.classList.add('active'); });
    document.querySelectorAll('.dynamic-panel').forEach(el => el.classList.remove('active'));
    const panel = document.getElementById('gpanel-' + tabName);
    if (panel) {
        panel.classList.add('active');
        if (isRelationPanel(tabName)) setTimeout(() => drawRelationWeb(tabName), 50);
        if (isMapPanel(tabName)) setTimeout(() => drawMapCanvas(tabName), 50);
    }
    if (window.innerWidth <= 850) {
        // 移动端面板切换由 sessions 处理
    }
}

// ===== 主渲染函数 =====
export function renderGamePanelsUI() {
    if (!gameConfig || !gameConfig.panels) return;
    const sidebar = document.getElementById('gameSidebarUI');
    const content = document.getElementById('panelContentUI');
    if (!sidebar || !content) return;
    sidebar.innerHTML = "";
    content.innerHTML = "";
    let first = true, active = "";
    // Clean up canvas observers
    if (relObserver) { relObserver.disconnect(); setRelObserver(null); }
    if (mapObserver) { mapObserver.disconnect(); setMapObserver(null); if (mapAnimReq) cancelAnimationFrame(mapAnimReq); setMapAnimReq(null); }
    setRelationCanvasEl(null);
    setMapCanvasEl(null);
    setRelationWrapperEl(null);
    setMapWrapperEl(null);

    const icons = { '人物': '👤', '角色': '👤', '核心': '✨', '状态': '📊', '包裹': '🎒', '行囊': '🎒', '背包': '🎒', '物品': '🎒', '装备': '⚔️', '技能': '⚡', '任务': '📋', '日记': '📜', '地图': '🗺️', '区域': '🗺️', '关系': '🕸️', '社交': '🕸️', '羁绊': '❤️' };
    function getIcon(name) { for (const [k, v] of Object.entries(icons)) if (name.includes(k)) return v; return '📌'; }

    const panelNames = syncPanelOrder(gameConfig);
    for (const tabName of panelNames) {
        const isCustom = (gameConfig.customPanels || []).includes(tabName);
        const btn = document.createElement('div');
        btn.className = "panel-tab-btn";
        btn.innerHTML = `<div class="icon">${getIcon(tabName)}</div><div>${escapeHtml(tabName)}</div>`;
        btn.onclick = () => switchGamePanelTab(tabName);
        sidebar.appendChild(btn);

        const panelDiv = document.createElement('div');
        panelDiv.id = 'gpanel-' + tabName;
        panelDiv.className = "dynamic-panel";
        let html = `<div class="panel-title">${getIcon(tabName)} ${escapeHtml(tabName)}`;
        if (isCustom) html += `<span class="badge" style="margin-left:6px;background:rgba(142,68,173,0.15);color:#71368a;font-size:0.65rem;">自建</span><button class="prop-del-btn" style="margin-left:auto;" onclick="deleteCustomPanel('${escapeHtml(tabName)}')">✕</button>`;
        html += `</div><div class="panel-divider"></div>`;

        if (isRelationPanel(tabName)) {
            html += `<div class="canvas-wrapper" id="cw-rel-${tabName}"><canvas id="cv-rel-${tabName}"></canvas><div class="relation-tooltip" id="tip-rel-${tabName}"></div></div>`;
        } else if (isMapPanel(tabName)) {
            html += `<div class="canvas-wrapper" id="cw-map-${tabName}"><canvas id="cv-map-${tabName}"></canvas><div class="relation-tooltip" id="tip-map-${tabName}"></div></div>`;
        } else {
            let data = gameConfig.panels[tabName];
            if (Array.isArray(data)) {
                if (isInventoryPanel(tabName)) { html += renderInventoryList(data); }
                else if (isQuestPanel(tabName)) { html += renderQuestList(data); }
                else if (data.some(item => item && typeof item === 'object')) {
                    html += `<div class="panel-card adaptive-array-card">${renderValueToHTML(data)}</div>`;
                }
                else {
                    html += `<div class="list-add-row"><input type="text" class="list-add-input" id="listAdd_${escapeHtml(tabName)}" placeholder="钉上一笔..."><button class="list-add-btn" onclick="addListItem('${escapeHtml(tabName)}')">钉上</button></div>`;
                    if (!data.length) html += `<div style="color:var(--text-muted);text-align:center;padding:12px;font-style:italic;">空</div>`;
                    data.forEach((item, idx) => {
                        html += `<div class="list-item-card"><div class="list-item-content">${escapeHtml(String(item))}</div><div class="card-action-row"><button class="list-item-btn edit" onclick="openEditListItemModal('${escapeHtml(tabName)}',${idx})">✏️</button><button class="list-item-btn del" onclick="removeListItem('${escapeHtml(tabName)}',${idx})">✕</button></div></div>`;
                    });
                }
            } else if (typeof data === 'object' && data !== null) {
                if (isCharacterPanel(tabName)) {
                    const n = data['姓名'] || data['name'] || '';
                    const c = data['职业'] || data['class'] || data['种族'] || '';
                    html += `<div class="char-header"><div class="char-avatar">${escapeHtml(n.charAt(0) || '?')}</div><div><div class="char-name">${escapeHtml(n)}</div><span class="char-class">${escapeHtml(c)}</span></div></div>`;
                }
                for (let k in data) {
                    if ((isCharacterPanel(tabName) && (k === '姓名' || k === 'name' || k === '职业' || k === 'class' || k === '种族'))) continue;
                    html += `<div class="panel-card"><div class="card-action-row"><button class="prop-edit-btn" onclick="openEditPropertyModal('${escapeHtml(tabName)}','${escapeHtml(k)}')">✏️</button><button class="prop-del-btn" onclick="deleteProperty('${escapeHtml(tabName)}','${escapeHtml(k)}')">✕</button></div><div style="font-weight:bold;font-size:0.85rem;margin-bottom:2px;color:var(--text-sub);">${escapeHtml(k)}</div>${renderValueToHTML(data[k])}</div>`;
                }
                html += `<button class="add-prop-btn" onclick="openAddPropertyModal('${escapeHtml(tabName)}')">➕ 新增属性</button>`;
            }
        }
        panelDiv.innerHTML = html;
        content.appendChild(panelDiv);

        if (first) { active = tabName; first = false; }
    }
    // 添加新建面板按钮
    if (gameConfig) {
        const addBtn = document.createElement('div');
        addBtn.className = "panel-tab-btn";
        addBtn.innerHTML = `<div class="icon" style="font-size:1.3rem;">➕</div>`;
        addBtn.onclick = () => openAddCustomPanelModal();
        sidebar.appendChild(addBtn);
    }

    if (active) switchGamePanelTab(active);
}

// ===== Canvas 关系网 =====
export function initRelationCanvas(tabName) {
    drawRelationWeb(tabName);
}

const interactiveCanvasStates = new Map();

function getCanvasRect(canvas, wrapper) {
    const rect = wrapper.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    return { width: rect.width, height: rect.height, dpr };
}

function buildCanvasSignature(kind, data) {
    try {
        const source = kind === 'relation'
            ? { nodes: data.nodes || data.节点, links: data.links || data.连线 }
            : { area: data.area || data.区域, routes: data.routes || data.路线, currentPosition: data.currentPosition || data.当前位置 };
        return JSON.stringify(source);
    } catch (_) {
        return String(Date.now());
    }
}

function getInteractiveState(canvas, wrapper, kind, data, size) {
    const id = canvas.id;
    const signature = buildCanvasSignature(kind, data);
    let state = interactiveCanvasStates.get(id);
    if (!state || state.signature !== signature || state.kind !== kind) {
        state = {
            kind,
            signature,
            scale: 1,
            panX: size.width / 2,
            panY: size.height / 2,
            hover: null,
            selected: null,
            dragNode: null,
            isPanning: false,
            lastX: 0,
            lastY: 0,
            nodes: kind === 'relation' ? layoutRelationNodes(data.nodes || data.节点 || [], size) : layoutMapNodes(data.area || data.区域 || [], data.currentPosition || data.当前位置 || '', size),
            links: kind === 'relation' ? (data.links || data.连线 || []) : (data.routes || data.路线 || []),
            currentPosition: data.currentPosition || data.当前位置 || ''
        };
        interactiveCanvasStates.set(id, state);
    } else {
        state.currentPosition = data.currentPosition || data.当前位置 || state.currentPosition || '';
        state.links = kind === 'relation' ? (data.links || data.连线 || []) : (data.routes || data.路线 || []);
    }
    return state;
}

function layoutRelationNodes(nodes, size) {
    if (!nodes.length) return [];
    const mainIdx = Math.max(0, nodes.findIndex(n => n.type === '主角'));
    const radius = Math.max(96, Math.min(size.width, size.height) * 0.32);
    const others = nodes.map((node, index) => ({ node, index })).filter(item => item.index !== mainIdx);
    const laidOut = nodes.map((node, index) => ({ ...node, radius: node.type === '主角' ? 24 : 18, x: 0, y: 0 }));
    laidOut[mainIdx].x = Number(nodes[mainIdx].x) || 0;
    laidOut[mainIdx].y = Number(nodes[mainIdx].y) || 0;
    others.forEach((item, order) => {
        const angle = -Math.PI / 2 + (Math.PI * 2 * order) / Math.max(1, others.length);
        const ring = radius + (order % 2) * 22;
        laidOut[item.index].x = Number(item.node.x) || Math.cos(angle) * ring;
        laidOut[item.index].y = Number(item.node.y) || Math.sin(angle) * ring;
    });
    return laidOut;
}

function layoutMapNodes(area, currentPosition, size) {
    if (!area.length) return [];
    const cols = Math.ceil(Math.sqrt(area.length));
    const gapX = Math.max(120, Math.min(190, size.width / Math.max(2, cols)));
    const gapY = 96;
    const rows = Math.ceil(area.length / cols);
    const startX = -((cols - 1) * gapX) / 2;
    const startY = -((rows - 1) * gapY) / 2;
    return area.map((node, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const isCurrent = node.id === currentPosition || node.name === currentPosition;
        return {
            ...node,
            radius: isCurrent ? 18 : 15,
            x: Number(node.x) || startX + col * gapX + (row % 2) * 24,
            y: Number(node.y) || startY + row * gapY
        };
    });
}

function bindInteractiveCanvas(canvas, wrapper, kind, drawFn) {
    if (canvas.dataset.boundInteractive === '1') return;
    canvas.dataset.boundInteractive = '1';

    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const state = interactiveCanvasStates.get(canvas.id);
        if (!state) return;
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const before = screenToWorld(state, sx, sy);
        const factor = e.deltaY < 0 ? 1.12 : 0.9;
        state.scale = clamp(state.scale * factor, 0.45, 2.6);
        state.panX = sx - before.x * state.scale;
        state.panY = sy - before.y * state.scale;
        drawFn();
    }, { passive: false });

    canvas.addEventListener('pointerdown', e => {
        const state = interactiveCanvasStates.get(canvas.id);
        if (!state) return;
        canvas.setPointerCapture?.(e.pointerId);
        const pos = getPointerPos(canvas, e);
        const hit = hitTestNode(state, pos.x, pos.y);
        state.lastX = pos.x;
        state.lastY = pos.y;
        if (hit) {
            state.dragNode = hit;
            state.selected = hit;
        } else {
            state.isPanning = true;
        }
        drawFn();
    });

    canvas.addEventListener('pointermove', e => {
        const state = interactiveCanvasStates.get(canvas.id);
        if (!state) return;
        const pos = getPointerPos(canvas, e);
        if (state.dragNode) {
            const world = screenToWorld(state, pos.x, pos.y);
            state.dragNode.x = world.x;
            state.dragNode.y = world.y;
        } else if (state.isPanning) {
            state.panX += pos.x - state.lastX;
            state.panY += pos.y - state.lastY;
        } else {
            state.hover = hitTestNode(state, pos.x, pos.y);
            updateCanvasTooltip(wrapper, kind, state.hover, pos.x, pos.y);
        }
        state.lastX = pos.x;
        state.lastY = pos.y;
        drawFn();
    });

    canvas.addEventListener('pointerup', e => {
        const state = interactiveCanvasStates.get(canvas.id);
        if (!state) return;
        state.dragNode = null;
        state.isPanning = false;
        canvas.releasePointerCapture?.(e.pointerId);
        drawFn();
    });

    canvas.addEventListener('pointerleave', () => {
        const state = interactiveCanvasStates.get(canvas.id);
        if (!state) return;
        state.hover = null;
        state.dragNode = null;
        state.isPanning = false;
        updateCanvasTooltip(wrapper, kind, null, 0, 0);
        drawFn();
    });
}

function ensureCanvasToolbar(wrapper, state, drawFn) {
    let toolbar = wrapper.querySelector('.canvas-toolbar');
    if (!toolbar) {
        toolbar = document.createElement('div');
        toolbar.className = 'canvas-toolbar';
        toolbar.innerHTML = `
            <button type="button" title="放大" data-act="zoom-in">＋</button>
            <button type="button" title="缩小" data-act="zoom-out">－</button>
            <button type="button" title="重置视图" data-act="reset">⟲</button>
        `;
        wrapper.appendChild(toolbar);
        toolbar.addEventListener('click', e => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const cur = interactiveCanvasStates.get(wrapper.querySelector('canvas')?.id || '');
            if (!cur) return;
            const act = btn.dataset.act;
            if (act === 'zoom-in') cur.scale = clamp(cur.scale * 1.16, 0.45, 2.6);
            if (act === 'zoom-out') cur.scale = clamp(cur.scale * 0.86, 0.45, 2.6);
            if (act === 'reset') {
                const rect = wrapper.getBoundingClientRect();
                cur.scale = 1;
                cur.panX = rect.width / 2;
                cur.panY = rect.height / 2;
                cur.selected = null;
            }
            drawFn();
        });
    }
    toolbar.dataset.scale = Math.round(state.scale * 100) + '%';
}

function getPointerPos(canvas, e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function screenToWorld(state, x, y) {
    return { x: (x - state.panX) / state.scale, y: (y - state.panY) / state.scale };
}

function hitTestNode(state, sx, sy) {
    const world = screenToWorld(state, sx, sy);
    for (let i = state.nodes.length - 1; i >= 0; i--) {
        const node = state.nodes[i];
        const dist = Math.hypot(node.x - world.x, node.y - world.y);
        if (dist <= (node.radius || 16) + 8 / state.scale) return node;
    }
    return null;
}

function updateCanvasTooltip(wrapper, kind, node, x, y) {
    const tooltip = wrapper.querySelector('.relation-tooltip');
    if (!tooltip) return;
    if (!node) {
        tooltip.style.opacity = '0';
        return;
    }
    tooltip.style.left = Math.min(x + 14, wrapper.clientWidth - 220) + 'px';
    tooltip.style.top = Math.max(10, Math.min(y + 14, wrapper.clientHeight - 96)) + 'px';
    tooltip.style.opacity = '1';
    const title = node.name || node.id || '未知';
    const type = node.type || (kind === 'map' ? '地点' : '角色');
    const extra = node.desc || node.description || node.label || '';
    tooltip.innerHTML = `<strong>${escapeHtml(title)}</strong><br><span>${escapeHtml(type)}</span>${extra ? `<br><em>${escapeHtml(String(extra).substring(0, 80))}</em>` : ''}`;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function roundedRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
}

function drawCanvasBackdrop(ctx, w, h, kind) {
    const bg = ctx.createLinearGradient(0, 0, w, h);
    if (kind === 'map') {
        bg.addColorStop(0, '#fff8ec');
        bg.addColorStop(1, '#eadcc4');
    } else {
        bg.addColorStop(0, '#fffdf8');
        bg.addColorStop(1, '#f0e7d8');
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = kind === 'map' ? '#b79b76' : '#d1bfa9';
    ctx.lineWidth = 1;
    const gap = kind === 'map' ? 36 : 28;
    for (let x = -gap; x < w + gap; x += gap) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + h * 0.24, h);
        ctx.stroke();
    }
    for (let y = 0; y < h; y += gap) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }
    ctx.restore();
}

function applyWorldTransform(ctx, state) {
    ctx.translate(state.panX, state.panY);
    ctx.scale(state.scale, state.scale);
}

function drawRelationWebLegacy(tabName) {
    const canvas = document.getElementById('cv-rel-' + tabName);
    const wrapper = document.getElementById('cw-rel-' + tabName);
    if (!canvas || !wrapper) return;
    setRelationCanvasEl(canvas);
    setRelationWrapperEl(wrapper);

    const data = gameConfig?.panels?.[tabName];
    if (!data || !data.nodes) return;
    const ctx = canvas.getContext('2d');
    const rect = wrapper.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;

    const nodes = data.nodes.map(n => ({
        ...n,
        x: n.x || (Math.random() * (w - 60) + 30),
        y: n.y || (Math.random() * (h - 60) + 30)
    }));
    const links = data.links || [];

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(253,251,247,0.3)';
    ctx.fillRect(0, 0, w, h);

    links.forEach(l => {
        const s = nodes.find(n => n.id === l.source);
        const t = nodes.find(n => n.id === l.target);
        if (s && t) {
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(t.x, t.y);
            ctx.strokeStyle = l.color || 'rgba(141,110,99,0.3)';
            ctx.lineWidth = l.width || 1.5;
            ctx.stroke();
            if (l.label) {
                const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2;
                ctx.fillStyle = 'rgba(253,251,247,0.9)';
                ctx.fillRect(mx - 30, my - 8, 60, 16);
                ctx.fillStyle = '#8d6e63';
                ctx.font = '9px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(l.label, mx, my + 3);
            }
        }
    });

    nodes.forEach((n, i) => {
        const isMain = n.type === '主角';
        ctx.beginPath();
        ctx.arc(n.x, n.y, isMain ? 18 : 12, 0, Math.PI * 2);
        ctx.fillStyle = n.color || (isMain ? '#d3765c' : '#8d6e63');
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = (isMain ? 'bold ' : '') + '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(n.name.charAt(0), n.x, n.y + 3);
        // Name label
        ctx.fillStyle = '#3e2723';
        ctx.font = '10px sans-serif';
        ctx.fillText(n.name, n.x, n.y + (isMain ? 30 : 24));
    });

    // Tooltip
    const tooltip = document.getElementById('tip-rel-' + tabName);
    if (tooltip) {
        canvas.onmousemove = (e) => {
            const r = canvas.getBoundingClientRect();
            const mx = e.clientX - r.left, my = e.clientY - r.top;
            const hit = nodes.find(n => Math.hypot(n.x - mx, n.y - my) < 15);
            if (hit) {
                tooltip.style.left = (mx + 12) + 'px';
                tooltip.style.top = (my + 12) + 'px';
                tooltip.style.opacity = '1';
                tooltip.innerHTML = `<strong>${escapeHtml(hit.name)}</strong><br>${escapeHtml(hit.type||'')}`;
            } else {
                tooltip.style.opacity = '0';
            }
        };
    }
}

// ===== Canvas 地图 =====
export function initMapCanvas(tabName) {
    drawMapCanvas(tabName);
}

function drawMapCanvasLegacy(tabName) {
    const canvas = document.getElementById('cv-map-' + tabName);
    const wrapper = document.getElementById('cw-map-' + tabName);
    if (!canvas || !wrapper) return;
    setMapCanvasEl(canvas);
    setMapWrapperEl(wrapper);
    const data = gameConfig?.panels?.[tabName];
    if (!data || !data.area) return;
    const ctx = canvas.getContext('2d');
    const rect = wrapper.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;

    const nodes = data.area.map(a => ({
        ...a,
        x: a.x || (Math.random() * (w - 80) + 40),
        y: a.y || (Math.random() * (h - 80) + 40)
    }));
    const routes = data.routes || [];
    const cur = data.currentPosition || data.当前位置 || '';

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(244,235,216,0.5)';
    ctx.fillRect(0, 0, w, h);

    routes.forEach(r => {
        const from = nodes.find(n => n.id === r.from || n.name === r.from);
        const to = nodes.find(n => n.id === r.to || n.name === r.to);
        if (from && to) {
            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.lineTo(to.x, to.y);
            ctx.strokeStyle = r.color || 'rgba(141,110,99,0.2)';
            ctx.lineWidth = r.width || 2;
            ctx.setLineDash([6, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
            if (r.label) {
                const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
                ctx.fillStyle = 'rgba(253,251,247,0.95)';
                const lw = ctx.measureText(r.label).width;
                ctx.fillRect(mx - lw/2 - 4, my - 9, lw + 8, 18);
                ctx.fillStyle = '#8e3a23';
                ctx.font = 'bold 9px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(r.label, mx, my + 3);
            }
        }
    });

    nodes.forEach(n => {
        const isCur = (n.id === cur || n.name === cur);
        ctx.beginPath();
        ctx.arc(n.x, n.y, 12, 0, Math.PI * 2);
        ctx.fillStyle = isCur ? '#e74c3c' : '#5d4037';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        const tw = ctx.measureText(n.name).width;
        ctx.fillStyle = 'rgba(253,251,247,0.95)';
        ctx.fillRect(n.x - tw/2 - 4, n.y + 15, tw + 8, 16);
        ctx.fillStyle = isCur ? '#c0392b' : '#3e2723';
        ctx.font = (isCur ? 'bold ' : '') + '11px serif';
        ctx.textAlign = 'center';
        ctx.fillText(n.name, n.x, n.y + 27);
    });

    ctx.fillStyle = 'rgba(141,110,99,0.4)';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('🔍 滚轮缩放 / 拖拽', 10, h - 10);
}

function drawRelationNode(ctx, node, state) {
    const isMain = node.type === '主角';
    const selected = state.selected === node;
    const hovered = state.hover === node;
    const radius = node.radius || (isMain ? 24 : 18);
    ctx.save();
    if (selected || hovered) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 9, 0, Math.PI * 2);
        ctx.fillStyle = selected ? 'rgba(211,118,92,0.16)' : 'rgba(141,110,99,0.12)';
        ctx.fill();
    }
    ctx.shadowColor = 'rgba(80,50,30,0.22)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    const fill = ctx.createRadialGradient(node.x - radius * 0.35, node.y - radius * 0.4, 2, node.x, node.y, radius);
    fill.addColorStop(0, isMain ? '#f4a083' : '#f0c5a7');
    fill.addColorStop(1, node.color || (isMain ? '#c65e4f' : '#8d6e63'));
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = selected ? '#fff9ef' : 'rgba(255,255,255,0.88)';
    ctx.lineWidth = (selected ? 3 : 2) / state.scale;
    ctx.stroke();
    ctx.fillStyle = '#fffaf2';
    ctx.font = `${isMain ? 'bold ' : ''}${Math.max(11, 14 / state.scale)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(node.name || node.id || '?').charAt(0), node.x, node.y);
    ctx.shadowColor = 'transparent';
    ctx.font = `${isMain ? 'bold ' : ''}${Math.max(10, 12 / state.scale)}px sans-serif`;
    ctx.fillStyle = '#4c382d';
    const label = String(node.name || node.id || '?').substring(0, 14);
    const width = ctx.measureText(label).width;
    roundedRect(ctx, node.x - width / 2 - 6 / state.scale, node.y + radius + 8 / state.scale, width + 12 / state.scale, 20 / state.scale, 7 / state.scale);
    ctx.fillStyle = 'rgba(255,253,247,0.88)';
    ctx.fill();
    ctx.fillStyle = '#4c382d';
    ctx.fillText(label, node.x, node.y + radius + 18 / state.scale);
    ctx.restore();
}

function drawMapNode(ctx, node, state) {
    const isCurrent = node.id === state.currentPosition || node.name === state.currentPosition;
    const selected = state.selected === node;
    const hovered = state.hover === node;
    const radius = node.radius || (isCurrent ? 18 : 15);
    ctx.save();
    if (selected || hovered || isCurrent) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + (isCurrent ? 10 : 7), 0, Math.PI * 2);
        ctx.fillStyle = isCurrent ? 'rgba(211,118,92,0.18)' : 'rgba(78,127,112,0.14)';
        ctx.fill();
    }
    ctx.shadowColor = 'rgba(80,50,30,0.2)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = isCurrent ? '#d3765c' : (node.color || '#527f72');
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#fff9ef';
    ctx.lineWidth = (selected ? 3 : 2) / state.scale;
    ctx.stroke();
    const label = String(node.name || node.id || '?').substring(0, 16);
    ctx.font = `${isCurrent ? 'bold ' : ''}${Math.max(10, 12 / state.scale)}px sans-serif`;
    const width = ctx.measureText(label).width;
    roundedRect(ctx, node.x - width / 2 - 6 / state.scale, node.y + radius + 7 / state.scale, width + 12 / state.scale, 20 / state.scale, 7 / state.scale);
    ctx.fillStyle = 'rgba(255,252,241,0.9)';
    ctx.fill();
    ctx.fillStyle = isCurrent ? '#a64d3d' : '#4f453d';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, node.x, node.y + radius + 17 / state.scale);
    ctx.restore();
}

function drawCanvasHud(ctx, width, height, state, hint) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,253,247,0.78)';
    roundedRect(ctx, 12, height - 34, Math.min(width - 24, 270), 22, 11);
    ctx.fill();
    ctx.fillStyle = '#806b5c';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${hint}  ·  ${Math.round(state.scale * 100)}%`, 22, height - 23);
    ctx.restore();
}

export function drawRelationWeb(tabName) {
    const canvas = document.getElementById('cv-rel-' + tabName);
    const wrapper = document.getElementById('cw-rel-' + tabName);
    const data = gameConfig?.panels?.[tabName];
    if (!canvas || !wrapper || !(data?.nodes || data?.节点)) return;
    setRelationCanvasEl(canvas);
    setRelationWrapperEl(wrapper);
    const ctx = canvas.getContext('2d');
    const size = getCanvasRect(canvas, wrapper);
    const state = getInteractiveState(canvas, wrapper, 'relation', data, size);
    bindInteractiveCanvas(canvas, wrapper, 'relation', () => drawRelationWeb(tabName));
    ensureCanvasToolbar(wrapper, state, () => drawRelationWeb(tabName));
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    drawCanvasBackdrop(ctx, size.width, size.height, 'relation');
    ctx.save();
    applyWorldTransform(ctx, state);
    const byId = new Map(state.nodes.flatMap(node => [[node.id, node], [node.name, node]]));
    state.links.forEach(link => {
        const source = byId.get(link.source || link.from);
        const target = byId.get(link.target || link.to);
        if (!source || !target) return;
        const active = state.hover === source || state.hover === target || state.selected === source || state.selected === target;
        ctx.save();
        ctx.strokeStyle = active ? 'rgba(211,118,92,0.8)' : (link.color || 'rgba(141,110,99,0.34)');
        ctx.lineWidth = (active ? 2.8 : 1.4) / state.scale;
        ctx.beginPath();
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const cx = (source.x + target.x) / 2 - dy * 0.08;
        const cy = (source.y + target.y) / 2 + dx * 0.08;
        ctx.moveTo(source.x, source.y);
        ctx.quadraticCurveTo(cx, cy, target.x, target.y);
        ctx.stroke();
        if (link.label && (active || state.scale > 0.72)) {
            const label = String(link.label).substring(0, 18);
            ctx.font = `${11 / state.scale}px sans-serif`;
            const metrics = ctx.measureText(label);
            const pad = 7 / state.scale;
            roundedRect(ctx, cx - metrics.width / 2 - pad, cy - 10 / state.scale, metrics.width + pad * 2, 20 / state.scale, 6 / state.scale);
            ctx.fillStyle = 'rgba(255,253,247,0.92)';
            ctx.fill();
            ctx.fillStyle = '#7b5648';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, cx, cy);
        }
        ctx.restore();
    });
    state.nodes.forEach(node => drawRelationNode(ctx, node, state));
    ctx.restore();
    drawCanvasHud(ctx, size.width, size.height, state, '拖拽节点 / 滚轮缩放 / 拖空白移动');
}

export function drawMapCanvas(tabName) {
    const canvas = document.getElementById('cv-map-' + tabName);
    const wrapper = document.getElementById('cw-map-' + tabName);
    const data = gameConfig?.panels?.[tabName];
    if (!canvas || !wrapper || !(data?.area || data?.区域)) return;
    setMapCanvasEl(canvas);
    setMapWrapperEl(wrapper);
    const ctx = canvas.getContext('2d');
    const size = getCanvasRect(canvas, wrapper);
    const state = getInteractiveState(canvas, wrapper, 'map', data, size);
    bindInteractiveCanvas(canvas, wrapper, 'map', () => drawMapCanvas(tabName));
    ensureCanvasToolbar(wrapper, state, () => drawMapCanvas(tabName));
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    drawCanvasBackdrop(ctx, size.width, size.height, 'map');
    ctx.save();
    applyWorldTransform(ctx, state);
    const byId = new Map(state.nodes.flatMap(node => [[node.id, node], [node.name, node]]));
    state.links.forEach(route => {
        const source = byId.get(route.from || route.source);
        const target = byId.get(route.to || route.target);
        if (!source || !target) return;
        const active = state.hover === source || state.hover === target || state.selected === source || state.selected === target;
        ctx.save();
        ctx.strokeStyle = active ? '#c47b59' : (route.color || 'rgba(112,95,72,0.32)');
        ctx.lineWidth = (active ? 4 : 2) / state.scale;
        ctx.setLineDash([8 / state.scale, 7 / state.scale]);
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
        ctx.restore();
    });
    state.nodes.forEach(node => drawMapNode(ctx, node, state));
    ctx.restore();
    drawCanvasHud(ctx, size.width, size.height, state, '拖拽节点 / 滚轮缩放 / 拖空白移动');
}

// ===== 传奇物品弹窗 =====
export function openLegendaryItem(name, desc) {
    showToast(`🏆 ${name}: ${desc || '传说中的物品'}`, 'info', 5000);
}

// ===== 导出面板预览 HTML（给卡片详情页用） =====
export function renderPanelPreviewHtml(panelTemplate) {
    if (!panelTemplate) return '';
    let data;
    try { data = JSON.parse(panelTemplate); } catch (_) { return ''; }
    if (!data || typeof data !== 'object') return '';
    
    let html = '<div class="panel-preview-stack">';
    
    for (const [tabName, panelData] of Object.entries(data)) {
        html += `<div class="panel-card panel-preview-card"><div class="panel-preview-title">${escapeHtml(tabName)}</div>${renderValueToHTML(panelData)}</div>`;
    }
    
    html += '</div>';
    return html;
}

// ===== 导出到 window =====
window.renderGamePanelsUI = renderGamePanelsUI;
window.switchGamePanelTab = switchGamePanelTab;
window.deleteCustomPanel = deleteCustomPanel;
window.addListItem = addListItem;
window.removeListItem = removeListItem;
window.openAddPropertyModal = openAddPropertyModal;
window.confirmAddProperty = confirmAddProperty;
window.openEditPropertyModal = openEditPropertyModal;
window.confirmEditProperty = confirmEditProperty;
window.deleteProperty = deleteProperty;
window.openEditListItemModal = openEditListItemModal;
window.confirmEditListItem = confirmEditListItem;
window.openAddCustomPanelModal = openAddCustomPanelModal;
window.confirmAddCustomPanel = confirmAddCustomPanel;
window.openLegendaryItem = openLegendaryItem;
