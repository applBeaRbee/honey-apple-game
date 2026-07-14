// ================= 📚 墨韵 · 数据库引擎 (Database Revised) =================
// 星河璀璨 · 记忆召回系统的数据层
// 负责：AM代码分类管理、表格JSON生成、AutoCardUpdaterAPI桥接

import { escapeHtml, safeParseJSON } from './constants.js';
import { gameConfig } from './state.js';
import { saveLocalData } from './storage.js';

// ===== 时间分类标签 =====
export const TIME_CATEGORIES = {
    now:   { label: '此刻',  icon: '◈', color: '#d3765c', weight: 0 },
    today: { label: '今日',  icon: '◇', color: '#8e6e53', weight: 1 },
    days:  { label: '近日',  icon: '◇', color: '#6d8a6e', weight: 2 },
    weeks: { label: '往周',  icon: '○', color: '#5b7fa5', weight: 3 },
    months:{ label: '去月',  icon: '◎', color: '#8e6e8e', weight: 4 },
    seasons:{label: '往季',  icon: '□', color: '#7d7d5e', weight: 5 },
    years: { label: '经年',  icon: '▽', color: '#6e7b8b', weight: 6 },
    old:   { label: '久远',  icon: '△', color: '#5a5a5a', weight: 7 },
    unknown:{label: '模糊',  icon: '·', color: '#9e9e9e', weight: 8 }
};

// ===== AM 代码分类解析 =====
// 支持的格式：
//   分组式：
//     now = 
//     AM001 | 初见
//     today =
//     AM002 | 战斗
//   无分组式：
//     AM001, AM002, AM003（纯列表）
export function parseAmCategories(rawText) {
    if (!rawText || !rawText.trim()) return { categories: [], isGrouped: false, total: 0 };

    const lines = rawText.split('\n');
    const categories = [];
    let currentCat = null;
    let hasGroupHeader = false;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // 检测分组头： now =  或 now=
        const catMatch = trimmed.match(/^(\w+)\s*=\s*$/);
        if (catMatch) {
            hasGroupHeader = true;
            const key = catMatch[1].toLowerCase();
            const catInfo = TIME_CATEGORIES[key] || { label: key, icon: '·', color: '#999' };
            currentCat = {
                key,
                label: catInfo.label,
                icon: catInfo.icon,
                color: catInfo.color,
                weight: catInfo.weight ?? 99,
                items: []
            };
            categories.push(currentCat);
            continue;
        }

        // 检测 AM 代码行： AM001 | 标题  或  AM001|标题
        const amMatch = trimmed.match(/^(AM\d+)\s*\|\s*(.+)$/i);
        if (amMatch) {
            const amCode = amMatch[1].toUpperCase();
            const title = amMatch[2].trim();
            // 如果在分组内，添加到当前分组
            if (currentCat) {
                currentCat.items.push({ code: amCode, title, original: trimmed });
            } else {
                // 无分组模式：创建隐式分组
                categories.push({
                    key: amCode,
                    label: amCode,
                    icon: '▪',
                    color: '#b8a088',
                    weight: 99,
                    items: [{ code: amCode, title, original: trimmed }]
                });
            }
            continue;
        }

        // 非 AM 代码行，如果当前有分组则忽略（可能是注释），否则忽略
    }

    // 排序：按 weight 升序
    categories.sort((a, b) => a.weight - b.weight);
    const total = categories.reduce((sum, cat) => sum + cat.items.length, 0);

    return { categories, isGrouped: hasGroupHeader, total };
}

// ===== 纯 AM 代码提取（无分组模式）=====
export function extractAmCodes(rawText) {
    if (!rawText) return [];
    const matches = rawText.match(/AM\d+/gi);
    if (!matches) return [];
    return [...new Set(matches.map(m => m.toUpperCase()))];
}

// ===== 补充条目解析 =====
export function parseSupplementItems(rawText) {
    if (!rawText || !rawText.trim()) return [];

    const lines = rawText.split('\n');
    const items = [];
    let current = null;

    for (const line of lines) {
        const tagMatch = line.match(/^\s*-\s*\[([^\]]+)\]\s*(.*)/);
        if (tagMatch) {
            if (current) items.push(current);
            current = {
                tag: tagMatch[1].trim(),
                content: tagMatch[2].trim(),
                tagColor: getTagColor(tagMatch[1].trim())
            };
        } else if (current && line.trim()) {
            current.content += '\n' + line.trim();
        }
    }
    if (current) items.push(current);
    return items;
}

// 给标签分配颜色
function getTagColor(tag) {
    const colorMap = {
        '线索': '#5b7fa5', '推理': '#5b7fa5',
        '物品': '#6d8a6e', '道具': '#6d8a6e',
        '人物': '#d3765c', '角色': '#d3765c',
        '地点': '#7d7d5e', '场景': '#7d7d5e',
        '事件': '#8e6e8e', '情报': '#8e6e8e',
        '战斗': '#c0392b', '危险': '#c0392b',
        '线索': '#f39c12',
    };
    return colorMap[tag] || '#9e978e';
}

// ===== 检定结果解析 =====
export function parseMetaCheckBlocks(content) {
    const results = [];
    const re = /<meta:检定结果>([\s\S]*?)<\/meta:检定结果>/g;
    let m;
    while ((m = re.exec(content)) !== null) {
        const text = m[1].replace(/^\s+|\s+$/g, '');
        if (text) {
            const tagMatch = text.match(/【([^】]+)】/);
            const tag = tagMatch ? tagMatch[1] : '检定';
            const rank = determineRank(text);
            results.push({ text, tag, rank, startPos: m.index, endPos: m.index + m[0].length });
        }
    }
    return results;
}

function determineRank(text) {
    if (/非常成功|大成功|极难成功/.test(text)) return 'crit';
    if (/成功/.test(text)) return 'success';
    if (/失败/.test(text) && !/成功/.test(text)) return 'fail';
    if (/大失败|极难失败/.test(text)) return 'fumble';
    return 'normal';
}

// ===== character breakdown (cb) 解析 =====
export function parseCbItems(rawText) {
    if (!rawText || !rawText.trim()) return [];
    const lines = rawText.split('\n');
    const items = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const m = trimmed.match(/^【([^】]+)】(.+)$/);
        if (m) {
            items.push({ role: m[1].trim(), content: m[2].trim() });
        }
    }
    return items;
}

// ===== 灵犀 (soul) 解析 =====
export function parseSoulItems(rawText) {
    if (!rawText || !rawText.trim()) return [];
    const lines = rawText.split('\n');
    const items = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const m = trimmed.match(/^【([^】]+)】(.+)$/);
        if (!m) continue;

        const parts = m[2].trim().split('|');
        const shield = parts[0]?.trim() || '';
        let mind = '';
        let bodyState = '';

        if (parts.length >= 2) {
            const rawMind = parts[1].trim();
            // 去掉引号包裹
            const firstChar = rawMind.charCodeAt(0);
            const lastChar = rawMind.charCodeAt(rawMind.length - 1);
            if ((firstChar === 34 && lastChar === 34) ||
                (firstChar === 0x201C && lastChar === 0x201D) ||
                (firstChar === 0x300C && lastChar === 0x300D)) {
                mind = rawMind.substring(1, rawMind.length - 1).trim();
            } else {
                mind = rawMind;
            }
        }
        if (parts.length >= 3) {
            bodyState = parts[2].trim();
        }

        items.push({ role: m[1].trim(), shield, mind, bodyState });
    }
    return items;
}

// ===== 混沌 (chaos) 解析 =====
export function parseChaosItems(rawText) {
    if (!rawText || !rawText.trim()) return [];
    return rawText.split('\n')
        .map(l => l.trim())
        .filter(l => l)
        .map(content => ({ content }));
}

// ===== 从原始面板内容中提取各区块 =====
export function parsePanelContent(rawContent) {
    const extract = (tag) => {
        const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);
        const m = rawContent.match(re);
        return m ? m[1].replace(/^\s+|\s+$/g, '') : '';
    };

    return {
        userInput: extract('本轮用户输入'),
        recall: extract('recall'),
        supplement: extract('supplement'),
        metaCheck: extract('meta:检定结果'),
        cb: extract('cb'),
        soul: extract('soul'),
        chaos: extract('chaos'),
        profile: extract('profile'),
        data: extract('data'),
    };
}

// ===== 🗄️ 数据库管理器 (AutoCardUpdater 桥接) =====
export class DatabaseManager {
    constructor() {
        this._tables = null;
        this._api = null;
    }

    // 获取 AutoCardUpdater API
    getAPI() {
        if (this._api) return this._api;
        try {
            if (typeof parent !== 'undefined' && parent.AutoCardUpdaterAPI) {
                this._api = parent.AutoCardUpdaterAPI;
            } else if (window.AutoCardUpdaterAPI) {
                this._api = window.AutoCardUpdaterAPI;
            }
        } catch (e) { /* cross-origin */ }
        return this._api;
    }

    // 刷新并获取表格数据
    async refreshTables() {
        const api = this.getAPI();
        if (!api) {
            this._tables = null;
            return null;
        }
        try {
            if (api.refreshDataAndWorldbook) await api.refreshDataAndWorldbook();
            const jsonData = api.exportTableAsJson();
            this._tables = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
        } catch (err) {
            console.warn('[数据库] 刷新表格失败:', err);
            this._tables = null;
        }
        return this._tables;
    }

    // 在表格中查找 AM 代码
    findMemory(amCode, tableNames = ['纪要表', '总结表']) {
        if (!this._tables) return null;

        const targetCode = amCode.toUpperCase();
        for (const uid in this._tables) {
            const sheet = this._tables[uid];
            if (!sheet || !sheet.name || !sheet.content) continue;
            if (!tableNames.includes(sheet.name)) continue;
            if (sheet.content.length < 2) continue;

            const headers = sheet.content[0];
            const rows = sheet.content.slice(1);
            const codeIdx = headers.indexOf('编码索引');
            const summaryIdx = headers.indexOf('纪要');
            const titleIdx = headers.indexOf('标题');
            if (codeIdx === -1) continue;

            for (let ri = 0; ri < rows.length; ri++) {
                const row = rows[ri];
                if (!row || row.length <= codeIdx) continue;
                const codeVal = String(row[codeIdx] || '').trim().toUpperCase();
                if (codeVal === targetCode) {
                    return {
                        code: amCode,
                        title: titleIdx !== -1 && row.length > titleIdx ? String(row[titleIdx] || '').trim() : '',
                        content: summaryIdx !== -1 && row.length > summaryIdx ? String(row[summaryIdx] || '').trim() : '',
                        source: sheet.name,
                        rowIndex: ri + 1,
                        rawRow: row
                    };
                }
            }
        }
        return null;
    }

    // 批量查找多个 AM 代码
    async findMemories(amCodes, tableNames = ['纪要表', '总结表']) {
        await this.refreshTables();
        const results = [];
        const seen = new Set();

        for (const code of amCodes) {
            const upper = code.toUpperCase();
            if (seen.has(upper)) continue;
            seen.add(upper);
            const entry = this.findMemory(upper, tableNames);
            results.push({
                code: upper,
                entry,
                found: !!entry,
                hasDB: !!this._tables
            });
        }
        return results;
    }

    // ===== JSON 导出：生成可导入的数据库表结构 =====
    exportAsJson(entries) {
        // entries: [{ code, title, content, category?, tags? }]
        const timestamp = new Date().toISOString();
        return {
            meta: {
                version: '2.0',
                generator: '数据库引擎 · 墨韵',
                exportedAt: timestamp,
                totalEntries: entries.length
            },
            schema: {
                tables: [
                    {
                        name: '纪要表',
                        columns: ['编码索引', '标题', '纪要', '分类', '标签', '创建时间', '更新时间'],
                        primaryKey: '编码索引'
                    }
                ]
            },
            data: {
                '纪要表': entries.map((e, i) => ({
                    '编码索引': e.code,
                    '标题': e.title || '',
                    '纪要': e.content || '',
                    '分类': e.category || '通用',
                    '标签': (e.tags || []).join(', '),
                    '创建时间': e.createdAt || timestamp,
                    '更新时间': e.updatedAt || timestamp,
                    _order: i
                }))
            },
            exportType: '星河璀璨 · 记忆表'
        };
    }

    // 检测数据库是否可用
    isAvailable() {
        return !!this.getAPI();
    }
}

// ===== 全局单例 =====
export const dbManager = new DatabaseManager();

// ===== 本地记忆缓存（无数据库时备用）=====
export class LocalMemoryCache {
    constructor() {
        this._cache = new Map();
        this._load();
    }

    _key(amCode) { return `am_cache_${amCode.toUpperCase()}`; }

    get(amCode) {
        const key = this._key(amCode);
        if (this._cache.has(key)) return this._cache.get(key);
        try {
            const raw = localStorage.getItem(key);
            if (raw) {
                const data = JSON.parse(raw);
                this._cache.set(key, data);
                return data;
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    set(amCode, data) {
        const key = this._key(amCode);
        const entry = {
            ...data,
            cachedAt: Date.now()
        };
        this._cache.set(key, entry);
        try {
            localStorage.setItem(key, JSON.stringify(entry));
        } catch (e) { /* storage full */ }
    }

    _load() {
        // 惰性加载，使用时才读
    }

    clear() {
        this._cache.clear();
        // 清除所有本地缓存
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('am_cache_')) keys.push(k);
        }
        keys.forEach(k => localStorage.removeItem(k));
    }
}

export const localCache = new LocalMemoryCache();

// ============================================================
//  📋 角色档案 JSON 解析器
// ============================================================
// 解析 AI 以 JSON 格式输出的角色档案（带 ```json 代码块）
// 模板见：基本信息 → 外貌特征 → 互动设定

/**
 * 从文本中提取并解析 JSON 角色档案
 * @param {string} text - 可能包含 ```json ... ``` 代码块的文本
 * @returns {object|null} - { profile, sections, raw }
 */
export function parseCharacterProfile(text) {
    if (!text || !text.trim()) return null;

    // 预处理：剥离包裹的 ```json 代码块标记（无论是 <profile> 内部还是外部）
    let cleanText = text.trim();

    // 如果包含 <profile> 标签，先提取内部内容
    const profileTagMatch = cleanText.match(/<profile>([\s\S]*?)<\/profile>/);
    if (profileTagMatch) {
        cleanText = profileTagMatch[1].trim();
    }

    // 再剥离 ```json / ``` 代码块标记（如果存在）
    const codeBlockMatch = cleanText.match(/```(?:json)?\s*\n?({[\s\S]*?})\n?```/);
    if (codeBlockMatch) {
        cleanText = codeBlockMatch[1].trim();
    }

    // 尝试直接解析
    let jsonStr = null;
    try {
        JSON.parse(cleanText);
        jsonStr = cleanText;
    } catch (e) {
        // 如果失败，尝试找第一个 { 和最后一个 }
        const firstBrace = cleanText.indexOf('{');
        const lastBrace = cleanText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
            const candidate = cleanText.substring(firstBrace, lastBrace + 1);
            try {
                JSON.parse(candidate);
                jsonStr = candidate;
            } catch (e2) {
                return null;
            }
        }
    }

    if (!jsonStr) return null;

    try {
        const data = JSON.parse(jsonStr);

        // 支持两种顶层结构：
        // 1. { "角色档案": { ... } }
        // 2. { "基本信息": { ... }, "外貌特征": { ... } }
        let profile = data.角色档案 || data;

        if (!profile || typeof profile !== 'object') return null;

        // 提取各区块
        const sections = [];
        const sectionKeys = ['基本信息', '外貌特征', '互动设定', '背景经历', '性格特質', '能力装备', '其他'];

        for (const key of sectionKeys) {
            if (profile[key] && typeof profile[key] === 'object') {
                const entries = Object.entries(profile[key]);
                if (entries.length > 0) {
                    sections.push({
                        title: key,
                        fields: entries.map(([k, v]) => ({
                            key: k,
                            value: typeof v === 'string' ? v : JSON.stringify(v, null, 2)
                        }))
                    });
                }
            }
        }

        // 捕获不在预设 key 中的额外字段
        const extraKeys = Object.keys(profile).filter(k => !sectionKeys.includes(k));
        for (const key of extraKeys) {
            const val = profile[key];
            if (typeof val === 'object' && !Array.isArray(val)) {
                const entries = Object.entries(val);
                if (entries.length > 0) {
                    sections.push({
                        title: key,
                        fields: entries.map(([k, v]) => ({
                            key: k,
                            value: typeof v === 'string' ? v : JSON.stringify(v, null, 2)
                        }))
                    });
                }
            }
        }

        return {
            profile,
            sections,
            raw: jsonStr,
            sectionCount: sections.length,
            fieldCount: sections.reduce((sum, s) => sum + s.fields.length, 0)
        };
    } catch (e) {
        console.warn('[墨韵] 角色档案 JSON 解析失败:', e.message);
        return null;
    }
}

/**
 * 生成 AI 提示词中的角色档案格式说明
 * @param {object} customFields - 可选的自定义字段映射
 * @returns {string}
 */
export function generateProfilePrompt(customFields = {}) {
    const extraFields = Object.entries(customFields)
        .map(([key, desc]) => `      "${key}": "${desc}"`)
        .join(',\n');

    return `注意，我的前端界面启用了专用的角色卡片渲染插件。为了触发卡片 UI，从现在开始，你在输出任何【角色档案】时，必须且只能使用 <profile> 标签将 Markdown 格式的 JSON 代码块包裹起来！

请严格遵守以下模板的嵌套格式（一字不差地输出标签）：

<profile>\`\`\`json
{
  "角色档案": {
    "基本信息": {
      "姓名": "填入姓名",
      "年龄": "填入年龄",
      "性别": "填入性别",
      "身份": "填入身份、社团或年级",
      "性经验": "填入设定"
    },
    "外貌特征": {
      "整体印象": "用一两句话概括给人的第一感觉",
      "体型": "填入身高、体态等",
      "发型": "填入发色、发型、发饰",
      "特征": "填入穿搭、眼镜等显著特征"
    },
    "互动设定": {
      "与{{user}}关系": "填入具体关系或特殊状态"
    }${extraFields ? ',\n' + extraFields : ''}
  }
}\`\`\`
</profile>

最高指令：绝对不要省略 <profile> 和 </profile> 标签！不要在标签内部写任何非 JSON 的闲聊废话，确保输出纯净的格式以便我的系统解析。`;
}

/**
 * 角色档案 → 数据库条目转换
 * @param {object} parsed - parseCharacterProfile 的返回值
 * @param {string} amCode - 关联的 AM 代码
 * @returns {object} - { code, title, content, category, tags }
 */
export function profileToDbEntry(parsed, amCode = '') {
    if (!parsed || !parsed.profile) return null;

    const profile = parsed.profile;
    const basic = profile.基本信息 || {};
    const name = basic.姓名 || '未知角色';

    // 生成纪要文本
    const lines = [];
    for (const section of parsed.sections) {
        lines.push(`【${section.title}】`);
        for (const field of section.fields) {
            lines.push(`  ${field.key}：${field.value}`);
        }
        lines.push('');
    }

    return {
        code: amCode || `CHAR_${Date.now()}`,
        title: name,
        content: lines.join('\n').trim(),
        category: '角色档案',
        tags: ['角色', 'JSON档案', name],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

// ============================================================
//  📦 物品/规则/世界观 格式提示词
// ============================================================

/**
 * 生成非人物设定的排版规范提示词（物品、校规、世界观等）
 * @param {string} typeName - 内容类型名称，如"物品"、"校规"、"世界观设定"
 * @param {object} customFields - 可选的自定义字段
 * @returns {string}
 */
export function generateNonProfilePrompt(typeName = '内容', customFields = {}) {
    const extraFields = Object.entries(customFields)
        .map(([key, desc]) => `**${key}**：[${desc}]`)
        .join('\n');

    const coreExample = `【核心内容】\n\n- 功能/条款一：[具体描述，必须独立换行]\n\n- 功能/条款二：[具体描述，必须独立换行]`;

    return `当你输出【${typeName}】时，严禁使用单行长句堆砌多个属性。\n必须使用 Markdown 分行与列表格式，每个属性独立换行，属性名加粗。\n\n参考以下模板：\n\n<data>\`\`\`markdown\n名称：[${typeName}名称]\n性质：[具体性质]\n适用范围：[适用范围]\n${extraFields ? extraFields + '\n' : ''}\n${coreExample}\n\`\`\`\n</data>\n\n注意：\n- 每个属性必须**独立换行**\n- 属性名使用 **加粗** 标记\n- 核心内容使用无序列表 \`-\`\n- 必须使用 <data> 标签包裹`;
}

/**
 * 生成完整的排版规范系统提示（合并角色档案 + 其他内容）
 * @returns {string}
 */
export function generateFormattingSystemPrompt() {
    return `【系统最高指令：输出格式与排版规范】\n\n在本对话中，当你需要输出、更新或设定任何【角色档案】、【随身物品】、【校规】或【世界观】时，绝对禁止将多个属性堆砌成单行纯文本。你必须根据内容类型，严格采用以下两种排版格式之一：\n\n格式一：针对【角色人物档案】（必须使用 <profile> 标签与 JSON）\n当你输出人物设定时，必须使用 <profile> 标签包裹 Markdown 的 JSON 代码块，确保标准的 4 空格缩进：\n\n<profile>\`\`\`json\n{\n  \"角色档案\": {\n    \"基本信息\": {\n      \"姓名\": \"填入姓名\",\n      \"年龄\": \"填入年龄\",\n      \"身份\": \"填入身份/年级\"\n    },\n    \"外貌特征\": {\n      \"整体印象\": \"概括描述\",\n      \"特征\": \"细节描述\"\n    },\n    \"互动设定\": {\n      \"与{{user}}关系\": \"关系描述\"\n    }\n  }\n}\n\`\`\`\n</profile>\n\n格式二：针对【物品、校规、世界观设定】（必须使用 <data> 标签与 Markdown 分行列表）\n当你输出非人物设定的内容时，严禁使用单行长句。必须使用 <data> 标签包裹 Markdown 格式，保证每个属性独立换行，属性名加粗，并使用无序列表呈现核心内容：\n\n<data>\`\`\`markdown\n名称：[物品/规则名称]\n性质：[具体性质]\n适用范围：[适用范围]\n\n【核心内容】\n\n- 功能/条款一：[具体描述，必须独立换行]\n\n- 功能/条款二：[具体描述，必须独立换行]\n\`\`\`\n</data>\n\n最高指令：\n- 角色档案 → 只能用 <profile> + JSON\n- 物品/规则/世界观 → 只能用 <data> + Markdown 分行列表\n- 禁止混用格式，禁止省略标签，禁止在标签内写非内容的废话`;
}
