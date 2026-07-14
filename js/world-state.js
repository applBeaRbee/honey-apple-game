// ================= Liyuan-style world state layer =================
// Browser-side implementation for Honey Apple: memory tiers, worldlines,
// director choice cards, codex libraries and upload references.

import { gameConfig } from './state.js';

const MAX_SNAPSHOTS = 80;
const MAX_EVENTS = 160;
const MAX_FACTS = 240;

export function createDefaultWorldState(seed = {}) {
    return {
        version: 1,
        time: seed.time || '',
        location: seed.location || '',
        characters: seed.characters || {},
        inventory: seed.inventory || [],
        flags: seed.flags || {},
        plotThreads: seed.plotThreads || [],
        currentSaveId: seed.currentSaveId || null,
        updatedAt: Date.now()
    };
}

export function ensureLiyuanData(session = gameConfig) {
    if (!session) return null;
    if (!session.memoryDb) session.memoryDb = { characters: {}, locations: {}, events: [], facts: [], quests: [], sections: {} };
    if (!session.panels) session.panels = {};
    if (!session.history) session.history = [];
    if (!session.worldTime) session.worldTime = { day: 1, hour: 8, minute: 0 };

    if (!session.worldState) {
        session.worldState = createDefaultWorldState({
            time: formatWorldTime(session.worldTime),
            location: inferLocation(session),
            characters: mapMemoryCharacters(session.memoryDb.characters || {}),
            inventory: inferInventory(session.panels || {}),
            plotThreads: inferPlotThreads(session.memoryDb.quests || [])
        });
    }

    if (!session.memoryTiers) session.memoryTiers = buildMemoryTiers(session);
    normalizeMemoryTiers(session);

    if (!session.worldline) {
        session.worldline = {
            lines: [{ id: 'main', name: '主线', forkFromSaveId: null, saveIds: [] }],
            saves: [],
            currentLineId: 'main'
        };
    }

    if (!session.directorCards) session.directorCards = [];
    if (!session.codexLibraries) session.codexLibraries = [];
    if (!session.uploads) session.uploads = [];
    if (!session.panelMeta) session.panelMeta = {};
    if (!session.panelOrder) session.panelOrder = Object.keys(session.panels || {});
    syncPanelOrder(session);
    return session;
}

export function afterTurnBookkeeping(session = gameConfig, options = {}) {
    if (!session) return;
    ensureLiyuanData(session);
    updateWorldStateFromSession(session);
    updateMemoryTiers(session);
    maybeCreateAutoSnapshot(session, options.reason || 'auto');
    session.worldState.updatedAt = Date.now();
}

export function updateWorldStateFromSession(session = gameConfig) {
    if (!session) return;
    ensureLiyuanData(session);
    const wt = session.worldTime || { day: 1, hour: 8, minute: 0 };
    session.worldState.time = formatWorldTime(wt);
    session.worldState.location = inferLocation(session);
    session.worldState.characters = {
        ...session.worldState.characters,
        ...mapMemoryCharacters(session.memoryDb?.characters || {})
    };
    const inv = inferInventory(session.panels || {});
    if (inv.length) session.worldState.inventory = inv;
    session.worldState.plotThreads = inferPlotThreads(session.memoryDb?.quests || []);
}

export function buildMemoryTiers(session = gameConfig) {
    const db = session?.memoryDb || {};
    return {
        working: {
            title: '工作记忆',
            description: '最近剧情与本轮需要模型立刻遵守的状态。',
            entries: []
        },
        ledger: {
            title: '结构化账本',
            description: '人物、物品、地点、任务、事实等确定性记录。',
            entries: []
        },
        codex: {
            title: '检索资产',
            description: '角色卡世界书、知识库和素材索引，用时注入。',
            entries: []
        },
        summary: {
            title: '剧情摘要',
            description: '压缩后的前情提要和长期背景记忆。',
            entries: db.events ? db.events.slice(-12) : []
        }
    };
}

export function normalizeMemoryTiers(session = gameConfig) {
    const base = buildMemoryTiers(session || {});
    session.memoryTiers = { ...base, ...(session.memoryTiers || {}) };
    for (const key of Object.keys(base)) {
        session.memoryTiers[key] = { ...base[key], ...(session.memoryTiers[key] || {}) };
        if (!Array.isArray(session.memoryTiers[key].entries)) session.memoryTiers[key].entries = [];
    }
}

export function updateMemoryTiers(session = gameConfig) {
    if (!session) return;
    ensureLiyuanData(session);
    const recent = (session.history || []).slice(-8).map(m => ({
        role: m.role,
        content: trimText(m.content || m.rawData || '', 260),
        time: m.worldTime ? formatWorldTime(m.worldTime) : ''
    }));
    const db = session.memoryDb || {};
    session.memoryTiers.working.entries = recent;
    session.memoryTiers.ledger.entries = [
        ...Object.entries(db.characters || {}).map(([name, info]) => ({ type: 'character', name, info })),
        ...Object.entries(db.locations || {}).map(([name, info]) => ({ type: 'location', name, info })),
        ...(db.quests || []).map(q => ({ type: 'quest', name: q.title || q.name || '任务', info: q })),
        ...(db.facts || []).slice(-40).map(f => ({ type: 'fact', name: f.subject || '事实', info: f }))
    ].slice(-120);
    session.memoryTiers.codex.entries = [
        ...Object.entries(db.sections || {}).map(([name, data]) => ({ type: 'section', name, info: data })),
        ...(session.codexLibraries || []).map(lib => ({ type: 'codex', name: lib.name, info: lib })),
        ...(session.uploads || []).map(file => ({ type: 'upload', name: file.name, info: file }))
    ].slice(-120);
    session.memoryTiers.summary.entries = [
        ...(session.backgroundMemory ? [{ type: 'background', content: session.backgroundMemory }] : []),
        ...(db.events || []).slice(-20).map(e => ({ type: 'event', name: e.title, info: e }))
    ];
}

export function buildLiyuanContext(session = gameConfig) {
    if (!session) return '';
    ensureLiyuanData(session);
    updateWorldStateFromSession(session);
    updateMemoryTiers(session);
    const parts = [];
    parts.push(`【世界状态】\n${formatWorldState(session.worldState)}`);
    parts.push(`【活跃面板】${formatPanelIndex(session) || '暂无'}`);
    const codex = formatCodexIndex(session);
    if (codex) parts.push(`【知识库/素材】${codex}`);
    const choices = getOpenDirectorCards(session);
    if (choices.length) parts.push(`【待处理决策卡】${choices.map(c => c.title).join('、')}`);
    return parts.join('\n\n');
}

export function formatWorldState(state) {
    if (!state) return '（尚无记录）';
    const lines = [];
    if (state.time) lines.push(`时间：${state.time}`);
    if (state.location) lines.push(`地点：${state.location}`);
    const chars = Object.entries(state.characters || {});
    if (chars.length) {
        lines.push('人物：' + chars.slice(0, 12).map(([name, info]) => {
            const affinity = info.affinity !== undefined ? `好感 ${info.affinity}` : '';
            const status = info.status || info.relationship || '';
            return `${name}${status || affinity ? `（${[status, affinity].filter(Boolean).join('；')}）` : ''}`;
        }).join('、'));
    }
    if (state.inventory?.length) lines.push('物品：' + state.inventory.slice(0, 18).join('、'));
    const flags = Object.entries(state.flags || {});
    if (flags.length) lines.push('标记：' + flags.map(([k, v]) => `${k}=${v}`).join('；'));
    if (state.plotThreads?.length) lines.push('剧情线：' + state.plotThreads.slice(0, 8).join('；'));
    return lines.length ? lines.join('\n') : '（尚无记录）';
}

export function createWorldlineSnapshot(name = '', session = gameConfig, meta = {}) {
    if (!session) return null;
    ensureLiyuanData(session);
    const now = Date.now();
    const lineId = session.worldline.currentLineId || 'main';
    const save = {
        id: 'save_' + now.toString(36),
        lineId,
        name: name.trim() || defaultSaveName(now),
        createdAt: now,
        turnIndex: (session.history || []).length,
        worldState: clone(session.worldState),
        panels: clone(session.panels || {}),
        memoryDb: clone(session.memoryDb || {}),
        backgroundMemory: session.backgroundMemory || '',
        worldTime: clone(session.worldTime || {}),
        note: meta.note || '',
        auto: !!meta.auto
    };
    session.worldline.saves.push(save);
    const line = session.worldline.lines.find(l => l.id === lineId) || session.worldline.lines[0];
    if (line && !line.saveIds.includes(save.id)) line.saveIds.push(save.id);
    session.worldState.currentSaveId = save.id;
    if (session.worldline.saves.length > MAX_SNAPSHOTS) {
        const manual = session.worldline.saves.filter(s => !s.auto);
        const autos = session.worldline.saves.filter(s => s.auto).slice(-Math.max(0, MAX_SNAPSHOTS - manual.length));
        session.worldline.saves = [...manual, ...autos].sort((a, b) => a.createdAt - b.createdAt);
        const ids = new Set(session.worldline.saves.map(s => s.id));
        session.worldline.lines.forEach(l => l.saveIds = l.saveIds.filter(id => ids.has(id)));
    }
    return save;
}

export function restoreWorldlineSnapshot(saveId, session = gameConfig) {
    if (!session) return false;
    ensureLiyuanData(session);
    const save = session.worldline.saves.find(s => s.id === saveId);
    if (!save) return false;
    session.panels = clone(save.panels || {});
    session.memoryDb = clone(save.memoryDb || {});
    session.backgroundMemory = save.backgroundMemory || '';
    session.worldTime = clone(save.worldTime || session.worldTime || {});
    session.worldState = clone(save.worldState || createDefaultWorldState());
    session.history = (session.history || []).slice(0, Math.max(0, save.turnIndex));
    session.worldline.currentLineId = save.lineId || 'main';
    session.worldState.currentSaveId = save.id;
    updateMemoryTiers(session);
    return true;
}

export function forkWorldlineFromSave(saveId, name = '', session = gameConfig) {
    if (!session) return null;
    ensureLiyuanData(session);
    const save = session.worldline.saves.find(s => s.id === saveId);
    if (!save) return null;
    const line = {
        id: 'line_' + Date.now().toString(36),
        name: name.trim() || `从「${save.name}」分出`,
        forkFromSaveId: save.id,
        saveIds: []
    };
    session.worldline.lines.push(line);
    session.worldline.currentLineId = line.id;
    restoreWorldlineSnapshot(save.id, session);
    session.worldline.currentLineId = line.id;
    return line;
}

export function maybeCreateAutoSnapshot(session = gameConfig, reason = 'auto') {
    if (!session) return null;
    ensureLiyuanData(session);
    const historyLen = (session.history || []).length;
    if (!historyLen) return null;
    const last = [...session.worldline.saves].reverse().find(s => s.auto);
    if (last && historyLen - last.turnIndex < 4) return null;
    return createWorldlineSnapshot(`自动快照 · ${reason}`, session, { auto: true, note: reason });
}

export function createDirectorCard(payload = {}, session = gameConfig) {
    if (!session) return null;
    ensureLiyuanData(session);
    const card = {
        id: 'choice_' + Date.now().toString(36),
        title: payload.title || '剧情抉择',
        body: payload.body || '',
        options: Array.isArray(payload.options) ? payload.options.slice(0, 4) : [],
        freeform: payload.freeform !== false,
        status: 'open',
        answer: '',
        createdAt: Date.now(),
        resolvedAt: null,
        turnIndex: (session.history || []).length
    };
    session.directorCards.push(card);
    return card;
}

export function resolveDirectorCard(cardId, answer, session = gameConfig) {
    if (!session) return null;
    ensureLiyuanData(session);
    const card = session.directorCards.find(c => c.id === cardId);
    if (!card) return null;
    card.status = 'resolved';
    card.answer = answer || '';
    card.resolvedAt = Date.now();
    session.worldState.flags[`决策:${card.title}`] = card.answer;
    return card;
}

export function getOpenDirectorCards(session = gameConfig) {
    ensureLiyuanData(session);
    return (session?.directorCards || []).filter(c => c.status === 'open');
}

export function shouldSuggestDirectorCard(text = '') {
    const t = text.trim();
    if (!t || t.length > 500) return false;
    return /(该做什么|该怎么办|怎么办|怎么走|怎么选|下一步|接下来|你觉得|给.*选项|让我选|帮我选|开始生成身份|生成人设|创建角色|建档|捏角色)/.test(t);
}

export function formatPanelIndex(session = gameConfig) {
    if (!session?.panels) return '';
    return Object.entries(session.panels).map(([name, data]) => {
        const kind = Array.isArray(data) ? '列表' : (data && typeof data === 'object' ? '结构' : '文本');
        return `${name}(${kind})`;
    }).join('、');
}

export function formatCodexIndex(session = gameConfig) {
    if (!session) return '';
    const libs = (session.codexLibraries || []).map(lib => `${lib.name}(${lib.entries?.length || 0}条)`);
    const uploads = (session.uploads || []).map(file => `${file.name}${file.type ? `/${file.type}` : ''}`);
    return [...libs, ...uploads].join('、');
}

export function addCodexLibrary(name, session = gameConfig) {
    if (!session || !name?.trim()) return null;
    ensureLiyuanData(session);
    const existing = session.codexLibraries.find(l => l.name === name.trim());
    if (existing) return existing;
    const lib = { id: 'codex_' + Date.now().toString(36), name: name.trim(), entries: [], mounted: true, createdAt: Date.now() };
    session.codexLibraries.push(lib);
    return lib;
}

export function addCodexEntry(libraryId, entry, session = gameConfig) {
    if (!session) return null;
    ensureLiyuanData(session);
    const lib = session.codexLibraries.find(l => l.id === libraryId || l.name === libraryId);
    if (!lib) return null;
    const item = { id: 'entry_' + Date.now().toString(36), title: entry.title || '未命名条目', content: entry.content || '', tags: entry.tags || [], createdAt: Date.now() };
    lib.entries.push(item);
    return item;
}

export function registerUpload(fileInfo, session = gameConfig) {
    if (!session || !fileInfo?.name) return null;
    ensureLiyuanData(session);
    const item = { id: 'upload_' + Date.now().toString(36), name: fileInfo.name, type: fileInfo.type || '', url: fileInfo.url || '', note: fileInfo.note || '', createdAt: Date.now() };
    session.uploads.push(item);
    return item;
}

export function syncPanelOrder(session = gameConfig) {
    if (!session?.panels) return [];
    const keys = Object.keys(session.panels);
    const existing = Array.isArray(session.panelOrder) ? session.panelOrder.filter(k => keys.includes(k)) : [];
    session.panelOrder = [...existing, ...keys.filter(k => !existing.includes(k))];
    return session.panelOrder;
}

function mapMemoryCharacters(chars) {
    const out = {};
    for (const [name, info] of Object.entries(chars || {})) {
        out[name] = {
            affinity: parseAffinity(info),
            status: info.status || info.relationship || info.description || '',
            notes: info.notes || info.description || '',
            relationship: info.relationship || ''
        };
    }
    return out;
}

function parseAffinity(info = {}) {
    const raw = info.affinity ?? info.favor ?? info.好感 ?? info.好感度;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(-100, Math.min(100, Math.round(n))) : undefined;
}

function inferLocation(session) {
    const panels = session.panels || {};
    for (const [name, data] of Object.entries(panels)) {
        if (/地图|区域|地点|位置/.test(name) && data && typeof data === 'object') {
            return data.currentPosition || data.当前位置 || data.location || data.地点 || '';
        }
    }
    return session.memoryDb?.events?.slice(-1)[0]?.location || '';
}

function inferInventory(panels) {
    for (const [name, data] of Object.entries(panels || {})) {
        if (!/包裹|行囊|背包|物品|装备|库存/.test(name)) continue;
        if (Array.isArray(data)) return data.map(i => typeof i === 'string' ? i : (i.name || i.title || JSON.stringify(i))).filter(Boolean);
        if (data && typeof data === 'object') return Object.keys(data);
    }
    return [];
}

function inferPlotThreads(quests) {
    return (quests || []).filter(q => !/已完成|失败|结束/.test(q.status || '')).map(q => `${q.title || q.name || '任务'}：${q.status || '进行中'}`);
}

function formatWorldTime(wt) {
    if (!wt) return '';
    return `第${wt.day || 1}天 ${String(wt.hour || 0).padStart(2, '0')}:${String(wt.minute || 0).padStart(2, '0')}`;
}

function defaultSaveName(now) {
    const d = new Date(now);
    return `存档 ${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function trimText(text, limit) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    return s.length > limit ? s.slice(0, limit) + '...' : s;
}

function clone(value) {
    return JSON.parse(JSON.stringify(value ?? null));
}

export function trimMemoryDb(session = gameConfig) {
    const db = session?.memoryDb;
    if (!db) return;
    if (db.events?.length > MAX_EVENTS) db.events = db.events.slice(-MAX_EVENTS);
    if (db.facts?.length > MAX_FACTS) db.facts = db.facts.slice(-MAX_FACTS);
}

window.__ensureLiyuanData = ensureLiyuanData;
window.__createWorldlineSnapshot = createWorldlineSnapshot;
