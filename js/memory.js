// ================= 🌐 世界观数据库（Memory DB） =================
// 酒馆风格的动态记忆系统：AI可读写，自动从对话提取关键信息
import { gameConfig } from './state.js';
import { escapeHtml } from './constants.js';
import { showToast } from './ui.js';
import { saveLocalData } from './storage.js';
import { renderStructuredText, renderCharacterCard, renderFactCard, renderInfoCard } from './structured-renderer.js';
import { ensureLiyuanData, updateMemoryTiers } from './world-state.js';

// ===== 记忆数据库结构 =====
// 动态结构：卡片有什么就创建什么，不硬编码固定字段
const DEFAULT_MEMORY_DB = {
    characters: {},
    locations: {},
    facts: [],
    quests: [],
    events: [],
    lastUpdated: null,
    // 动态分区：来自卡片 character_book 的原始条目
    // 键 = 条目标题（comment），值 = { type, content, keys, ... }
    sections: {}
};

// 初始化或获取记忆数据库
export function getMemoryDb() {
    if (!gameConfig) return null;
    ensureLiyuanData(gameConfig);
    if (!gameConfig.memoryDb) {
        gameConfig.memoryDb = JSON.parse(JSON.stringify(DEFAULT_MEMORY_DB));
    }
    return gameConfig.memoryDb;
}

// ===== 生成记忆上下文提示（给 AI 用）=====
export function buildMemoryContext() {
    const db = getMemoryDb();
    if (!db) return '';

    const parts = [];

    // 角色信息
    const chars = Object.entries(db.characters);
    if (chars.length > 0) {
        const charLines = chars.map(([name, info]) => {
            let line = `${name}: ${info.description || '未知'}`;
            if (info.relationship) line += ` | 关系: ${info.relationship}`;
            if (info.traits && info.traits.length) line += ` | 特质: ${info.traits.join(', ')}`;
            return line;
        });
        parts.push('【已知人物】\n' + charLines.join('\n'));
    }

    // 地点信息
    const locs = Object.entries(db.locations);
    if (locs.length > 0) {
        const locLines = locs.map(([name, info]) => `${name}: ${info.description || '未知'}${info.features ? ' (' + info.features + ')' : ''}`);
        parts.push('【已知地点】\n' + locLines.join('\n'));
    }

    // 事件历史（最近5条）
    if (db.events && db.events.length > 0) {
        const recentEvents = db.events.slice(-5);
        const eventLines = recentEvents.map(e => `[第${e.day||'?'}天] ${e.title}: ${e.description}`);
        parts.push('【近期事件】\n' + eventLines.join('\n'));
    }

    // 重要事实
    if (db.facts && db.facts.length > 0) {
        const factLines = db.facts.filter(f => f.certainty !== '低').map(f => `${f.subject}${f.relation}${f.object}`);
        if (factLines.length > 0) {
            parts.push('【世界事实】\n' + factLines.join('\n'));
        }
    }

    // 任务状态
    if (db.quests && db.quests.length > 0) {
        const activeQuests = db.quests.filter(q => q.status !== '已完成' && q.status !== '失败');
        if (activeQuests.length > 0) {
            const questLines = activeQuests.map(q => `${q.title}: ${q.status || '进行中'}${q.objectives?.length ? ' [' + q.objectives.join(', ') + ']' : ''}`);
            parts.push('【当前任务】\n' + questLines.join('\n'));
        }
    }

    // ===== 动态分区：卡片有什么就展现什么 =====
    if (db.sections) {
        for (const [title, data] of Object.entries(db.sections)) {
            const lower = title.toLowerCase();
            // 跳过已经在上面单独展示的类型和技术性条目
            if (lower.includes('角色档案') || lower.includes('角色卡') || 
                lower.includes('initvar') || lower.includes('mvu_') ||
                lower.includes('变量初始化')) continue;
            
            let content = '';
            if (typeof data === 'string') content = data;
            else if (data?.content) content = data.content;
            else if (data?.description) content = data.description;
            
            if (content && content.length > 20) {
                const label = title.replace(/^(school_|item_|rule_|world_|activity_|role_)/i, '').substring(0, 24);
                parts.push(`【${label}】\n${content.substring(0, 400)}`);
            }
        }
    }

    updateMemoryTiers(gameConfig);
    const tiers = gameConfig.memoryTiers;
    if (tiers?.summary?.entries?.length) {
        const summary = tiers.summary.entries.slice(-8).map(entry => entry.content || entry.info?.description || entry.info?.title || '').filter(Boolean).join('\n');
        if (summary) parts.push('【长期摘要】\n' + summary.substring(0, 1400));
    }
    return parts.join('\n\n');
}

// ===== 从 AI 响应更新数据库 =====
export function updateMemoryFromAIResponse(parsed) {
    if (!parsed || !gameConfig) return;
    const db = getMemoryDb();
    if (!db) return;

    // 1. 更新角色信息
    if (parsed.memory_db?.characters) {
        for (const [name, info] of Object.entries(parsed.memory_db.characters)) {
            if (!db.characters[name]) db.characters[name] = {};
            Object.assign(db.characters[name], info);
            db.characters[name].lastSeen = gameConfig.worldTime ? 
                `第${gameConfig.worldTime.day}天 ${gameConfig.worldTime.hour}:${String(gameConfig.worldTime.minute).padStart(2,'0')}` : '未知';
        }
    }

    // 2. 更新地点信息
    if (parsed.memory_db?.locations) {
        for (const [name, info] of Object.entries(parsed.memory_db.locations)) {
            if (!db.locations[name]) db.locations[name] = {};
            Object.assign(db.locations[name], info);
        }
    }

    // 3. 添加事件
    if (parsed.memory_db?.events) {
        for (const event of parsed.memory_db.events) {
            const exists = db.events.find(e => e.title === event.title);
            if (exists) {
                Object.assign(exists, event);
            } else {
                db.events.push({
                    ...event,
                    day: gameConfig.worldTime?.day || 1,
                    importance: event.importance || '普通'
                });
            }
        }
        if (db.events.length > 100) db.events = db.events.slice(-100);
    }

    // 4. 添加事实
    if (parsed.memory_db?.facts) {
        for (const fact of parsed.memory_db.facts) {
            const exists = db.facts.find(f => f.subject === fact.subject && f.relation === fact.relation);
            if (exists) {
                Object.assign(exists, fact);
            } else {
                db.facts.push(fact);
            }
        }
        if (db.facts.length > 200) db.facts = db.facts.slice(-200);
    }

    // 5. 更新任务
    if (parsed.memory_db?.quests) {
        for (const quest of parsed.memory_db.quests) {
            const exists = db.quests.find(q => q.title === quest.title);
            if (exists) {
                Object.assign(exists, quest);
            } else {
                db.quests.push(quest);
            }
        }
    }

    // 6. 更新动态分区 sections
    if (parsed.memory_db?.sections) {
        if (!db.sections) db.sections = {};
        for (const [key, val] of Object.entries(parsed.memory_db.sections)) {
            db.sections[key] = val;
        }
    }

    db.lastUpdated = Date.now();
    ensureLiyuanData(gameConfig);
    updateMemoryTiers(gameConfig);
    saveLocalData();
}

function compactText(text, maxLen = 120) {
    const value = String(text || '').replace(/\s+/g, ' ').trim();
    if (!value) return '';
    return value.length > maxLen ? value.slice(0, maxLen - 1) + '…' : value;
}

export function recordConversationTurn(userText = '', aiText = '', parsed = null, turnTime = null) {
    if (!gameConfig) return null;
    const db = getMemoryDb();
    if (!db) return null;

    const wt = turnTime?.after || turnTime || gameConfig.worldTime || {};
    const day = wt.day || 1;
    const hour = Number.isFinite(wt.hour) ? wt.hour : 0;
    const minute = Number.isFinite(wt.minute) ? wt.minute : 0;
    const timestamp = `${day}-${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

    const userSummary = compactText(userText, 90);
    const aiSummary = compactText(
        parsed?.summary || parsed?.narrative || aiText || parsed?.content || '',
        140
    );

    const title = userSummary ? `回合: ${userSummary}` : `回合: ${timestamp}`;
    const descriptionParts = [];
    if (userSummary) descriptionParts.push(`用户: ${userSummary}`);
    if (aiSummary) descriptionParts.push(`AI: ${aiSummary}`);
    const description = descriptionParts.join('\n');

    const turnKey = `turn:${timestamp}:${userSummary.slice(0, 20)}:${aiSummary.slice(0, 20)}`;
    if (!db.events.some(e => e.type === 'conversation_turn' && e.turnKey === turnKey)) {
        db.events.push({
            type: 'conversation_turn',
            turnKey,
            title,
            description,
            day,
            time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
            importance: '中'
        });
        if (db.events.length > 100) db.events = db.events.slice(-100);
        db.lastUpdated = Date.now();
        return db.events[db.events.length - 1];
    }
    return null;
}

// ===== 自动从对话提取关键信息 =====
export function extractMemoryFromMessage(userText, aiResponse) {
    if (!gameConfig) return;
    const db = getMemoryDb();
    if (!db) return;

    const namePattern = /(?:名叫|名为|叫做|认识|遇到|见到|遇见)([\u4e00-\u9fa5]{2,4})/g;
    let match;
    while ((match = namePattern.exec(userText + ' ' + aiResponse)) !== null) {
        const name = match[1];
        if (name !== gameConfig.charName && !db.characters[name]) {
            db.characters[name] = {
                description: '在对话中被提及的角色',
                relationship: '未知',
                lastSeen: gameConfig.worldTime ? 
                    `第${gameConfig.worldTime.day}天 ${gameConfig.worldTime.hour}:${String(gameConfig.worldTime.minute).padStart(2,'0')}` : '未知',
                firstEncounter: `第${gameConfig.worldTime?.day || 1}天`
            };
        }
    }

    const locPattern = /(?:来到|抵达|位于|离开|前往|在)([\u4e00-\u9fa5]{2,6}(?:镇|城|村|国|大陆|港口|要塞|森林|山洞|神殿|塔|堡))/g;
    while ((match = locPattern.exec(userText + ' ' + aiResponse)) !== null) {
        const loc = match[1];
        if (!db.locations[loc]) {
            db.locations[loc] = { description: '被提及的地点', features: '' };
        }
    }

    db.lastUpdated = Date.now();
}

// ===== 打开记忆管理界面 =====
export function openMemoryModal() {
    const modal = document.getElementById('memoryModal');
    if (!modal) return;
    const db = getMemoryDb();
    if (!db) {
        showToast('未找到记忆数据库', 'warning');
        return;
    }
    const content = document.getElementById('memoryContent');
    if (!content) return;

    let html = '<div class="memory-modal-body">';

    html += renderMemorySectionHeader('👥', '已知人物', Object.keys(db.characters || {}).length);
    const chars = Object.entries(db.characters);
    if (chars.length) {
        html += '<div class="memory-card-grid people">';
        chars.forEach(([name, info]) => {
            html += renderCharacterCard(name, info);
        });
        html += '</div>';
    } else {
        html += renderEmptyState('尚无人物记录');
    }

    html += renderMemorySectionHeader('🗺️', '已知地点', Object.keys(db.locations || {}).length);
    const locs = Object.entries(db.locations);
    if (locs.length) {
        html += '<div class="memory-card-grid">';
        locs.forEach(([name, info]) => {
            const desc = info.description || info.features || '';
            html += `<div class="panel-card memory-location-card"><div class="memory-card-title">${escapeHtml(name)}</div><div class="memory-card-text">${escapeHtml(desc.substring(0,260))}</div></div>`;
        });
        html += '</div>';
    } else {
        html += renderEmptyState('尚无地点记录');
    }

    html += renderMemorySectionHeader('📜', '事件记录', db.events?.length || 0);
    if (db.events?.length) {
        const sorted = [...db.events].sort((a, b) => (b.day||0) - (a.day||0)).slice(0, 10);
        html += '<div class="memory-timeline">';
        sorted.forEach(e => {
            html += `<div class="memory-timeline-item"><div class="memory-timeline-day">第${escapeHtml(e.day || '?')}天</div><div class="memory-timeline-content"><div class="memory-card-title">${escapeHtml(e.title)}</div><div class="memory-card-text">${escapeHtml(e.description || '')}</div></div></div>`;
        });
        html += '</div>';
    } else {
        html += renderEmptyState('尚无事件记录');
    }

    html += renderMemorySectionHeader('⚔️', '任务追踪', db.quests?.length || 0);
    if (db.quests?.length) {
        db.quests.forEach(q => {
            const stateClass = q.status === '已完成' ? 'done' : (q.status === '失败' ? 'failed' : 'active');
            html += `<div class="panel-card memory-quest-card ${stateClass}"><div class="memory-card-title">${escapeHtml(q.title)}</div><span class="memory-status-pill">${escapeHtml(q.status || '进行中')}</span><div class="memory-card-text">${escapeHtml(q.notes || q.desc || '')}</div></div>`;
        });
    } else {
        html += renderEmptyState('尚无任务');
    }

    // ===== 动态分区 =====
    if (db.sections) {
        for (const [title, data] of Object.entries(db.sections)) {
            // 跳过技术性条目
            const lower = title.toLowerCase();
            if (lower.includes('[initvar]') || lower.includes('[mvu_') || 
                lower.includes('mvu_') || lower.includes('initvar') ||
                lower.includes('regex_script') || lower.includes('tavern_helper')) continue;
            
            let content = '';
            if (typeof data === 'string') content = data;
            else if (data?.content) content = data.content;
            if (!content || content.length < 20) continue;
            
            const label = title.replace(/^(school_|item_|rule_|world_|activity_|role_|mvu_|initvar_)/i, '').substring(0, 28);
            
            let icon = '📂', accent = 'var(--color-primary)';
            if (lower.includes('world') || lower.includes('世界观')) { icon = '🌍'; accent = '#2ecc71'; }
            else if (lower.includes('school') || lower.includes('学校') || lower.includes('概况')) { icon = '🏫'; accent = '#3498db'; }
            else if (lower.includes('item') || lower.includes('物品')) { icon = '🎒'; accent = '#e67e22'; }
            else if (lower.includes('rule') || lower.includes('校规') || lower.includes('规则')) { icon = '📜'; accent = '#e74c3c'; }
            else if (lower.includes('activity') || lower.includes('活动') || lower.includes('作息')) { icon = '📅'; accent = '#9b59b6'; }
            else if (lower.includes('role') || lower.includes('角色') || lower.includes('人物')) { icon = '👤'; accent = '#1abc9c'; }
            
            // 使用结构化渲染器
            html += renderInfoCard(label, content, icon, accent);
        }
    }

    html += '</div>';
    content.innerHTML = html;
    modal.style.display = 'flex';
}

function renderMemorySectionHeader(icon, title, count) {
    return `<div class="memory-section-header"><div><span class="memory-section-icon">${icon}</span><span>${escapeHtml(title)}</span></div><span class="memory-count">${escapeHtml(String(count))}</span></div>`;
}

function renderEmptyState(text) {
    return `<div class="memory-empty">${escapeHtml(text)}</div>`;
}

// ===== 导出到 window =====
window.openMemoryModal = openMemoryModal;
window.buildMemoryContext = buildMemoryContext;
window.__updateMemoryFromAI = updateMemoryFromAIResponse;
window.__extractMemoryFromMessage = extractMemoryFromMessage;
window.__recordConversationTurn = recordConversationTurn;
