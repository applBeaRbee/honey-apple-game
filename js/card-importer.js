// ================= SillyTavern 角色卡自适应导入工具 =================

const TECHNICAL_ENTRY_RE = /^\[?(initvar|mvu_|regex_|tavern_helper|script_)|MVU变量列表/i;
const MAX_SECTION_TEXT = 5000;

const TYPE_META = {
    character: { label: '角色档案', icon: '👥' },
    item: { label: '物品设定', icon: '🎒' },
    world: { label: '世界观', icon: '🌍' },
    rule: { label: '规则设定', icon: '📜' },
    activity: { label: '日程活动', icon: '📅' },
    location: { label: '地点图鉴', icon: '🗺️' },
    system: { label: '系统资料', icon: '⚙️' },
    general: { label: '资料库', icon: '📚' }
};

const FIELD_KEYS = [
    '与{{user}}关系', '年级班级', '当前所在地', '当前穿搭', '物品名称', '文件名称', '地点名称', '区域名称',
    '外貌特征', '互动设定', '背景经历', '特殊状态', '整体印象', '核心功能', '操作界面', '执行机关', '违反后果',
    '姓名', '名称', '年龄', '性别', '身份', '职业', '种族', '班级', '年级', '网名', '昵称', '所在地',
    '关系', '简介', '描述', '外貌', '性格', '状态', '性经验', '身高', '体型', '特征', '发色', '发型',
    '发饰', '发质', '面部', '皮肤', '气质', '载体', '图标', '性质', '来源', '稀有度', '数量', '关键词'
];

export function normalizeCharacterBook(characterBook) {
    const entries = Array.isArray(characterBook?.entries) ? characterBook.entries : [];
    return entries
        .map((entry, index) => {
            const rawTitle = entry.comment || entry.name || entry.keys?.[0] || `条目${index + 1}`;
            const title = cleanTitle(rawTitle);
            const raw = typeof entry.content === 'string' ? entry.content : String(entry.content || '');
            const content = normalizeText(raw, { keepNewlines: true });
            const compact = normalizeText(raw, { keepNewlines: false });
            const type = classifyEntry(rawTitle, compact);
            return {
                index,
                rawTitle,
                title,
                type,
                content,
                compact,
                keys: Array.isArray(entry.keys) ? entry.keys.filter(Boolean) : [],
                enabled: entry.enabled !== false,
                constant: entry.constant === true,
                insertionOrder: Number(entry.insertion_order ?? entry.order ?? index)
            };
        })
        .filter(entry => entry.content && !TECHNICAL_ENTRY_RE.test(entry.rawTitle) && !/format_message_variable::/i.test(entry.content))
        .filter(entry => entry.enabled || entry.type === 'character')
        .sort((a, b) => a.insertionOrder - b.insertionOrder || a.index - b.index);
}

export function buildPanelsFromCharacterBook(charData, card) {
    const entries = normalizeCharacterBook(charData.character_book);
    const panels = { '人物核心': buildCorePanel(charData, card, entries) };

    const characters = extractCharacters(entries);
    if (characters.length) {
        panels['社交关系'] = buildRelationPanel(card, characters);
        panels['角色档案'] = Object.fromEntries(characters.map(item => [item.name, buildCharacterPayload(item)]));
    }

    for (const group of buildDynamicGroups(entries)) {
        if (group.type === 'character') continue;
        panels[group.name] = group.payload;
    }

    if (!Object.keys(panels).some(name => /地图|地点|区域/.test(name))) {
        const current = panels['人物核心']['所在地'] || charData.extensions?.world || '起点';
        panels['区域地图'] = {
            currentPosition: current,
            area: [{ id: current, name: current, type: '当前位置' }],
            routes: []
        };
    }

    return panels;
}

export function buildGameplayPanelsFromCharacterBook(charData, card) {
    const entries = normalizeCharacterBook(charData.character_book);
    const characters = extractCharacters(entries);
    const core = buildCorePanel(charData, card, entries);
    const current = core['鎵€鍦ㄥ湴'] || core['所在地'] || charData.extensions?.world || '起点';
    const panels = {
        '当前状态': {
            '角色': core['濮撳悕'] || core['姓名'] || card.defaultCharName || card.name || '{charName}',
            '状态': core['鐘舵€?'] || core['状态'] || '正常',
            '当前位置': current,
            '当前目标': '等待玩家行动'
        },
        '背包': extractInitialInventory(entries),
        '任务追踪': []
    };

    if (characters.length) panels['社交关系'] = buildRelationPanel(card, characters);

    if (hasAbilitySystem(entries)) {
        panels['能力状态'] = {
            '已掌握': [],
            '当前效果': [],
            '限制': '根据剧情更新'
        };
    }

    panels['区域地图'] = buildMapPanel(entries, current);
    return panels;
}

function extractInitialInventory(entries) {
    const items = [];
    for (const entry of entries) {
        const sample = `${entry.title}\n${entry.compact}`;
        if (entry.type !== 'item') continue;
        if (!/背包|随身|持有|拥有|初始|携带|inventory|bag/i.test(sample)) continue;
        const fields = parseFields(entry.content);
        const name = fields['鐗╁搧鍚嶇О'] || fields['物品名称'] || cleanTitle(entry.title);
        items.push({ name, desc: normalizeOneLine(entry.compact, 120), count: fields['鏁伴噺'] || fields['数量'] || 1 });
    }
    return items.slice(0, 12);
}

function hasAbilitySystem(entries) {
    return entries.some(entry => /异能|能力|技能|魔法|法术|功法|修为|傀儡|强化|支配|血脉|天赋|ability|skill/i.test(`${entry.title}\n${entry.compact}`));
}

function buildMapPanel(entries, current) {
    const locations = entries
        .filter(entry => entry.type === 'location')
        .map(entry => {
            const fields = parseFields(entry.content);
            const name = fields['鍦扮偣鍚嶇О'] || fields['鍖哄煙鍚嶇О'] || fields['地点名称'] || fields['区域名称'] || cleanTitle(entry.title);
            return { id: name, name, type: '地点', desc: normalizeOneLine(entry.compact, 120) };
        })
        .filter(item => item.name)
        .slice(0, 24);
    if (!locations.some(item => item.name === current)) locations.unshift({ id: current, name: current, type: '当前位置' });
    return { currentPosition: current, area: locations, routes: [] };
}

export function buildLorebookFromCharacterBook(characterBook, baseLorebook = {}) {
    const lorebook = { ...baseLorebook };
    for (const entry of normalizeCharacterBook(characterBook)) {
        lorebook[entry.title] = entry.compact.substring(0, 1800) + (entry.compact.length > 1800 ? '...' : '');
    }
    return lorebook;
}

export function buildMemoryDbFromCard(card) {
    const entries = normalizeCharacterBook(card.characterBookData);
    const db = {
        characters: {},
        locations: {},
        events: [],
        facts: [],
        quests: [],
        lastUpdated: Date.now(),
        sections: {}
    };

    for (const entry of entries) {
        const payload = deriveEntryPayload(entry);
        db.sections[entry.title] = {
            type: entry.type,
            shape: payload.shape,
            content: entry.content.substring(0, MAX_SECTION_TEXT),
            data: payload.data,
            keys: entry.keys,
            order: entry.insertionOrder
        };

        if (entry.type === 'character') {
            const char = parseCharacterEntry(entry);
            if (char?.name) {
                db.characters[char.name] = {
                    description: char.summary || entry.compact.substring(0, 360),
                    relationship: char.fields['与{{user}}关系'] || char.fields['关系'] || '未知',
                    lastSeen: '初始',
                    traits: splitTraits(char.fields['性格'] || char.fields['外貌'] || char.fields['整体印象']),
                    goals: char.fields['目标'] || ''
                };
            }
        } else if (entry.type === 'location') {
            const name = readField(entry.content, ['地点名称', '区域名称', '名称']) || entry.title;
            db.locations[name] = { description: entry.compact.substring(0, 420), features: entry.keys.join('、') };
        } else if (entry.type === 'world' || entry.type === 'rule') {
            db.facts.push({ subject: entry.title, relation: '：', object: entry.compact.substring(0, 320), certainty: '高' });
        }
    }

    return db;
}

function buildCorePanel(charData, card, entries) {
    const core = {
        '姓名': card.defaultCharName || card.name || '{charName}',
        '状态': '正常'
    };
    const location = entries.map(e => readField(e.content, ['当前所在地', '所在地', '地点名称'])).find(Boolean);
    if (location) core['所在地'] = location;
    if (charData.name) core['卡名'] = charData.name;
    if (charData.scenario) core['开局背景'] = normalizeText(charData.scenario, { keepNewlines: false }).substring(0, 180);
    return core;
}

function buildDynamicGroups(entries) {
    const grouped = new Map();
    for (const entry of entries) {
        const groupName = getPanelName(entry);
        if (!grouped.has(groupName)) grouped.set(groupName, { type: entry.type, entries: [] });
        grouped.get(groupName).entries.push(entry);
    }

    return [...grouped.entries()].map(([name, group]) => ({
        name,
        type: group.type,
        payload: buildGroupPayload(group.entries, group.type)
    }));
}

function buildGroupPayload(entries, type) {
    if (entries.length === 1) {
        const single = deriveEntryPayload(entries[0]);
        if (single.shape === 'fields') return single.data;
        if (single.shape === 'schedule') return { '时间表': single.data };
        if (single.shape === 'list') return single.data;
        return { [entries[0].title]: single.data };
    }

    if (type === 'activity') {
        return Object.fromEntries(entries.map(entry => {
            const payload = deriveEntryPayload(entry);
            return [entry.title, payload.shape === 'schedule' ? payload.data : payload.data];
        }));
    }

    return Object.fromEntries(entries.map(entry => [entry.title, deriveEntryPayload(entry).data]));
}

function deriveEntryPayload(entry) {
    const schedule = parseSchedule(entry.content);
    if (schedule.length) return { shape: 'schedule', data: schedule };

    const ruleList = parseRules(entry.content);
    if (entry.type === 'rule' && ruleList.length) return { shape: 'list', data: ruleList };

    const fields = parseFields(entry.content);
    const fieldScore = Object.keys(fields).length;
    if (fieldScore >= 3 && entry.content.length < 5000) return { shape: 'fields', data: fields };

    const bullets = parseBullets(entry.content);
    if (bullets.length >= 3 && entry.content.length < 3500) return { shape: 'list', data: bullets };

    const sections = parseLooseSections(entry.content);
    if (Object.keys(sections).length >= 2) return { shape: 'sections', data: sections };

    return { shape: 'text', data: trimPanelText(entry.content) };
}

function extractCharacters(entries) {
    return entries
        .filter(entry => entry.type === 'character' || /姓名[：:]/.test(entry.content))
        .map(parseCharacterEntry)
        .filter(Boolean);
}

function parseCharacterEntry(entry) {
    const fields = parseFields(entry.content);
    const rawName = fields['姓名'] || readField(entry.content, ['姓名']) || cleanTitle(entry.title).replace(/角色档案$/, '');
    const name = normalizeCharacterName(rawName);
    if (!name || name.length > 30) return null;
    const summaryParts = [
        fields['身份'],
        fields['年级班级'] || fields['班级'] || fields['年级'],
        fields['与{{user}}关系'] || fields['关系'],
        fields['简介'] || fields['描述'] || fields['特殊状态']
    ].filter(Boolean).map(v => String(v).replace(/\n/g, ' ').trim());
    return { name, fields, summary: summaryParts.join(' | '), entry };
}

function buildCharacterPayload(char) {
    const fields = { ...char.fields };
    if (!fields['简介'] && char.summary) fields['简介'] = char.summary;
    return fields;
}

function buildRelationPanel(card, characters) {
    const player = card.defaultCharName || '{charName}';
    const nodes = [{ id: player, name: player, type: '主角', color: '#d3765c' }];
    const links = [];
    characters.slice(0, 32).forEach((char, index) => {
        const role = normalizeOneLine(char.fields['身份'] || char.fields['职业'] || '角色', 24);
        const relation = normalizeOneLine(char.fields['与{{user}}关系'] || char.fields['关系'] || '相关', 28);
        nodes.push({ id: char.name, name: char.name, type: role, color: pickColor(index) });
        links.push({ source: player, target: char.name, label: relation });
    });
    return { nodes, links };
}

function getPanelName(entry) {
    const meta = TYPE_META[entry.type] || TYPE_META.general;
    if (entry.type === 'general') return cleanTitle(entry.title).length <= 8 ? cleanTitle(entry.title) : meta.label;
    return meta.label;
}

function parseFields(text) {
    const normalized = normalizeText(text, { keepNewlines: true });
    const result = {};
    const keyPattern = FIELD_KEYS.map(escapeRegExp).join('|');
    const re = new RegExp(`(${keyPattern})\\s*[：:]\\s*`, 'g');
    const matches = [...normalized.matchAll(re)];
    for (let i = 0; i < matches.length; i++) {
        const key = matches[i][1];
        const start = matches[i].index + matches[i][0].length;
        const end = i + 1 < matches.length ? matches[i + 1].index : normalized.length;
        const value = normalized.slice(start, end).replace(/^[-\s]+/, '').trim();
        if (value) result[key] = value.substring(0, 1400);
    }
    return result;
}

function parseSchedule(text) {
    const lines = normalizeText(text, { keepNewlines: true }).split('\n').map(line => line.trim()).filter(Boolean);
    const rows = [];
    for (const line of lines) {
        const match = line.match(/^(\d{1,2}:\d{2}(?:\s*-\s*\d{1,2}:\d{2})?)\s*[：:]\s*(.+)$/);
        if (match) rows.push({ time: match[1], content: match[2].trim() });
    }
    return rows.length >= 2 ? rows : [];
}

function parseRules(text) {
    const source = normalizeText(text, { keepNewlines: true });
    const bracketRules = [...source.matchAll(/【([^】]+)】[：:]?\s*([^【]+)/g)]
        .map(match => ({ title: match[1].trim(), desc: match[2].trim().replace(/\n{2,}/g, '\n') }))
        .filter(item => item.desc);
    if (bracketRules.length) return bracketRules;
    return parseBullets(source).map(item => ({ title: item.substring(0, 24), desc: item }));
}

function parseBullets(text) {
    return normalizeText(text, { keepNewlines: true })
        .split('\n')
        .map(line => line.trim())
        .filter(line => /^[-*•]\s+/.test(line))
        .map(line => line.replace(/^[-*•]\s+/, '').trim())
        .filter(Boolean)
        .slice(0, 80);
}

function parseLooseSections(text) {
    const lines = normalizeText(text, { keepNewlines: true }).split('\n').map(line => line.trim()).filter(Boolean);
    const result = {};
    let current = '';
    for (const line of lines) {
        const heading = line.match(/^([^：:]{2,18})[：:]\s*(.*)$/);
        if (heading && heading[1].length <= 18) {
            current = heading[1].trim();
            result[current] = heading[2]?.trim() || '';
        } else if (current) {
            result[current] = `${result[current]}\n${line}`.trim();
        }
    }
    return result;
}

function readField(text, keys) {
    const fields = parseFields(text);
    for (const key of keys) if (fields[key]) return normalizeOneLine(fields[key], 80);
    return '';
}

function classifyEntry(title, content) {
    const sample = `${title}\n${content.substring(0, 800)}`;
    if (/^world_/i.test(title)) return 'world';
    if (/^school_/i.test(title)) return 'world';
    if (/^role_/i.test(title)) return 'character';
    if (/^location_|^map_/i.test(title)) return 'location';
    if (/角色档案|角色卡|人物|NPC|姓名[：:]/i.test(sample)) return 'character';
    if (/^activity_|作息时间表|教学时段|晚间安排|课程表/i.test(sample)) return 'activity';
    if (/文件名称[：:].*(校规|守则)|具体校规|着装规范|违反后果/i.test(sample)) return 'rule';
    if (/^rule_/i.test(title)) return 'rule';
    if (/^item_/i.test(title)) return 'item';
    if (/物品名称[：:]|载体[：:]|核心功能[：:]|物品|道具|装备|背包|APP/i.test(sample)) return 'item';
    if (/学校概况|人员构成|核心道路|学院概况|世界观/i.test(sample)) return 'world';
    if (/地点名称[：:]|区域名称[：:]|当前位置|地点|区域|地图|场所|建筑/i.test(sample)) return 'location';
    return 'general';
}

function normalizeText(text, options = {}) {
    const keepNewlines = options.keepNewlines !== false;
    let value = String(text || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>|<\/div>|<\/li>|<\/h\d>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n');
    value = keepNewlines
        ? value.replace(/[ \t]{2,}/g, ' ').replace(/^\s+|\s+$/gm, '').trim()
        : value.replace(/\s+/g, ' ').trim();
    return value;
}

function trimPanelText(text) {
    const value = normalizeText(text, { keepNewlines: true });
    return value.length > 10000 ? value.substring(0, 10000) : value;
}

function cleanTitle(title) {
    return String(title || '')
        .replace(/^(item_|activity_|school_|world_|rule_|role_|location_|map_)/i, '')
        .replace(/[\[\]]/g, '')
        .trim() || '条目';
}

function normalizeCharacterName(value) {
    return normalizeOneLine(value, 32).replace(/角色档案$/, '').trim();
}

function normalizeOneLine(value, max = 80) {
    return String(value || '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim().substring(0, max);
}

function splitTraits(value) {
    if (!value) return [];
    return String(value).split(/[、,，;；\n]/).map(item => item.trim()).filter(Boolean).slice(0, 8);
}

function pickColor(index) {
    return ['#8d6e63', '#4f8f7b', '#5d7fa3', '#a66a5c', '#7c6aa6', '#b8863b', '#3f7f8c', '#a05a7a'][index % 8];
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ================= SillyTavern 卡片规范化层 =================
// 解析入口只负责识别载体，后续统一走这里，避免 PNG/JSON 两套字段逻辑逐渐分叉。
export function parseSillyTavernCharacterCard(input, options = {}) {
    let raw;
    try { raw = readCardPayload(input); } catch (error) {
        console.warn('角色卡载荷读取失败:', error);
        return null;
    }
    if (!raw) return null;

    const normalized = normalizeSillyTavernCard(raw);
    if (!normalized?.hasCardSignal) return null;

    const data = normalized.data;
    const book = normalized.characterBook;
    const card = {
        id: generateBrowserId('card'),
        created: Date.now(),
        avatar: options.avatar || '🖼️',
        avatarDataUrl: options.avatar || null,
        name: data.name || '未命名角色',
        description: compactText(data.description || data.personality || '一张 SillyTavern 角色卡').substring(0, 180),
        worldSetting: firstValue(data.extensions?.world, data.scenario, findBookText(book, /world|世界观|学校|school/i), '奇幻冒险世界'),
        storyBackground: firstValue(data.scenario, data.description, findBookText(book, /world|世界观|学校|school/i), '一段新的冒险...'),
        defaultCharName: firstValue(data.your_name, data.player_name, data.user_name, data.userName, ''),
        defaultCharInfo: cleanImportedText(data.personality || data.description || ''),
        systemPrompt: [
            data.system_prompt,
            data.creator_notes,
            data.instructions,
            data.post_history_instructions,
            data.extensions?.depth_prompt?.prompt
        ].filter(Boolean).map(cleanImportedText).filter(Boolean).join('\n\n') || '你是硬核DM。',
        openingText: pickOpening(data),
        alternateGreetings: Array.isArray(data.alternate_greetings) ? data.alternate_greetings.map(cleanImportedText).filter(Boolean) : [],
        exampleMessages: cleanImportedText(data.mes_example || data.example_dialogue || ''),
        creator: data.creator || normalized.creator || '',
        creatorNotes: cleanImportedText(data.creator_notes || ''),
        tags: normalizeTags(data.tags),
        spec: normalized.spec,
        specVersion: normalized.specVersion,
        frontendAssets: extractFrontendAssets(data),
        extensions: cloneJson(data.extensions || {}),
        rawCardData: cloneJson(raw),
        characterBookData: book,
        lorebook: {},
        panelTemplate: '{}'
    };

    const tagLore = Object.fromEntries(card.tags.map(tag => [tag, '角色标签']));
    card.lorebook = buildLorebookFromCharacterBook(book, tagLore);

    let panels;
    if (book?.entries?.length) panels = buildGameplayPanelsFromCharacterBook({ ...data, character_book: book }, card);
    if (!panels) {
        panels = {
            '人物核心': { '姓名': card.name || '{charName}', '状态': '正常' },
            '角色设定': card.defaultCharInfo ? [card.defaultCharInfo.substring(0, 1200)] : [],
            '随身物品': []
        };
    }
    card.panelTemplate = JSON.stringify(panels, null, 2);
    return card;
}

export function normalizeSillyTavernCard(input) {
    const root = parseMaybeJsonObject(input);
    const embedded = firstObject(root.data, root.chara, root.ccv3, root.ccv2, root.ccv1);
    const data = embedded || root;
    const nested = parseMaybeJsonObject(data.data);
    const rawMerged = { ...data, ...(nested || {}) };
    const hasCardSignal = looksLikeCharacterCard(root) || looksLikeCharacterCard(rawMerged);
    const merged = normalizeLegacyFields(rawMerged);
    const extensionBook = isObject(merged.extensions) ? (merged.extensions.world_info || merged.extensions.lorebook) : null;
    const book = normalizeRawCharacterBook(merged.character_book || merged.characterBook || extensionBook || root.character_book || root.lorebook);
    return {
        data: merged,
        characterBook: book,
        hasCardSignal,
        spec: root.spec || merged.spec || (embedded ? 'chara_card_v2' : 'chara_card_v1'),
        specVersion: root.spec_version || merged.spec_version || root.specVersion || '',
        creator: root.creator || merged.creator || ''
    };
}

function readCardPayload(input) {
    if (typeof input !== 'string') {
        if (typeof ArrayBuffer !== 'undefined' && (input instanceof ArrayBuffer || ArrayBuffer.isView(input))) return readPngCardPayload(input);
        if (isObject(input)) return input;
        return null;
    }
    const text = input.replace(/^\uFEFF/, '').trim();
    if (!text) return null;
    try { return JSON.parse(text); } catch (_) {}
    const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced) {
        try { return JSON.parse(fenced[1]); } catch (_) {}
    }
    const objectStart = text.indexOf('{');
    const objectEnd = text.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) {
        try { return JSON.parse(text.slice(objectStart, objectEnd + 1)); } catch (_) {}
    }
    try {
        const decoded = decodeBase64Json(text);
        if (decoded) return decoded;
    } catch (_) {}
    return null;
}

function readPngCardPayload(input) {
    const bytes = input instanceof Uint8Array
        ? input
        : ArrayBuffer.isView(input)
            ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
            : new Uint8Array(input);
    const chunks = isPng(bytes) ? extractPngTextChunks(bytes) : extractLoosePngTextChunks(bytes);
    for (const keyword of ['ccv3', 'ccv2', 'chara', 'ccv1']) {
        if (chunks[keyword]) {
            let decoded = null;
            try { decoded = decodeMaybeEncodedJson(chunks[keyword]); } catch (_) {}
            if (decoded) return decoded;
        }
    }
    return decodeLooseCardPayload(bytes);
}

function decodeLooseCardPayload(bytes) {
    const rawText = decodeLooseBinaryText(bytes);
    const markerRe = /(?:tEXt)?(ccv3|ccv2|chara|ccv1)\s+/g;
    const matches = [...rawText.matchAll(markerRe)];
    for (const match of matches) {
        const tail = rawText.slice(match.index + match[0].length);
        const stop = tail.search(/IEND|tEXt(?:ccv3|ccv2|chara|ccv1)/);
        const payload = (stop > 0 ? tail.slice(0, stop) : tail).replace(/[^A-Za-z0-9+/=_-]/g, '');
        if (payload.length < 120) continue;
        let decoded = null;
        try { decoded = decodeMaybeEncodedJson(payload); } catch (_) {}
        if (decoded) return decoded;
    }
    return null;
}

function extractLoosePngTextChunks(bytes) {
    const text = decodeLooseBinaryText(bytes);
    const chunks = {};
    for (const keyword of ['ccv3', 'ccv2', 'chara', 'ccv1']) {
        const marker = `tEXt${keyword}`;
        const markerIndex = text.indexOf(marker);
        const keywordIndex = markerIndex >= 0 ? markerIndex + marker.length : text.indexOf(`${keyword} `);
        if (keywordIndex < 0) continue;
        const tail = text.slice(keywordIndex).replace(/^\s+/, '');
        const endMarkers = ['IEND', 'tEXtccv3', 'tEXtccv2', 'tEXtchara', 'tEXtccv1']
            .map(markerName => tail.indexOf(markerName))
            .filter(index => index > 0);
        const payload = tail.slice(0, endMarkers.length ? Math.min(...endMarkers) : tail.length);
        const match = payload.match(/[A-Za-z0-9+/=_\-\s]{120,}/);
        if (match) chunks[keyword] = match[0].replace(/\s/g, '');
    }
    return chunks;
}

function extractPngTextChunks(bytes) {
    const chunks = {};
    let offset = 8;
    while (offset + 12 <= bytes.length) {
        const length = readUint32(bytes, offset);
        const type = ascii(bytes, offset + 4, 4);
        const start = offset + 8;
        const end = start + length;
        if (end + 4 > bytes.length) break;
        const payload = bytes.slice(start, end);
        if (type === 'tEXt') {
            const split = payload.indexOf(0);
            if (split > 0) chunks[ascii(payload, 0, split)] = new TextDecoder().decode(payload.slice(split + 1)).trim();
        } else if (type === 'iTXt') {
            const keywordEnd = payload.indexOf(0);
            if (keywordEnd > 0) {
                let cursor = keywordEnd + 1;
                const compressionFlag = payload[cursor++];
                cursor++;
                const languageEnd = payload.indexOf(0, cursor);
                if (languageEnd < 0) { offset = end + 4; continue; }
                cursor = languageEnd + 1;
                const translatedEnd = payload.indexOf(0, cursor);
                if (translatedEnd < 0) { offset = end + 4; continue; }
                cursor = translatedEnd + 1;
                if (compressionFlag === 0) chunks[ascii(payload, 0, keywordEnd)] = new TextDecoder().decode(payload.slice(cursor)).trim();
            }
        }
        offset = end + 4;
        if (type === 'IEND') break;
    }
    return chunks;
}

function normalizeRawCharacterBook(book) {
    book = parseMaybeJsonObject(book);
    if (!isObject(book)) return { entries: [] };
    const entries = Array.isArray(book.entries)
        ? book.entries
        : isObject(book.entries)
            ? Object.values(book.entries)
            : Array.isArray(book.keys)
                ? book.keys
                : [];
    return {
        ...cloneJson(book),
        entries: entries.map((entry, index) => ({
            ...(isObject(entry) ? cloneJson(entry) : {}),
            comment: isObject(entry) ? (entry.comment || entry.name || entry.title || firstKey(entry.keys) || `条目${index + 1}`) : `条目${index + 1}`,
            keys: normalizeKeys(isObject(entry) ? entry.keys : []),
            content: isObject(entry) ? (typeof entry.content === 'string' ? entry.content : String(entry.content || entry.text || '')) : String(entry || ''),
            enabled: !isObject(entry) || entry.enabled !== false,
            insertion_order: Number(isObject(entry) ? (entry.insertion_order ?? entry.insertionOrder ?? entry.order ?? index) : index)
        }))
    };
}

function decodeBase64Json(value) {
    let normalized = String(value || '').replace(/^data:[^,]+,/, '').replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
    if (!normalized) return null;
    while (normalized.length % 4) normalized += '=';
    const binary = typeof atob === 'function'
        ? atob(normalized)
        : typeof Buffer !== 'undefined'
            ? Buffer.from(normalized, 'base64').toString('binary')
            : null;
    if (!binary) return null;
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    try { return JSON.parse(text); } catch (_) {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start >= 0 && end > start) {
            try { return JSON.parse(text.slice(start, end + 1)); } catch (__) {}
        }
        try {
            const legacyText = decodeURIComponent(escape(binary));
            const legacyStart = legacyText.indexOf('{');
            const legacyEnd = legacyText.lastIndexOf('}');
            return JSON.parse(legacyStart >= 0 && legacyEnd > legacyStart ? legacyText.slice(legacyStart, legacyEnd + 1) : legacyText);
        } catch (__) { return null; }
    }
}

function decodeMaybeEncodedJson(value) {
    const text = String(value || '').trim();
    if (!text) return null;
    try { return JSON.parse(text); } catch (_) {}
    return decodeBase64Json(text);
}

function decodeLooseBinaryText(bytes) {
    try { return new TextDecoder('latin1').decode(bytes); } catch (_) {}
    try { return new TextDecoder('utf-8').decode(bytes); } catch (_) {}
    return Array.from(bytes, byte => String.fromCharCode(byte)).join('');
}

function pickOpening(data) {
    const candidates = [data.first_mes, data.greeting, ...(Array.isArray(data.alternate_greetings) ? data.alternate_greetings : [])];
    return candidates.map(cleanImportedText).find(Boolean) || '故事开始了...';
}

function findBookText(book, pattern) {
    const entry = (book?.entries || []).find(item => pattern.test(`${item.comment || ''} ${item.content || ''}`) && item.content);
    return entry ? compactText(entry.content).substring(0, 600) : '';
}

function cleanImportedText(value) {
    return String(value || '')
        .replace(/<StatusPlaceHolderImpl\/>/g, '')
        .replace(/<UpdateVariable[^>]*>[\s\S]*?<\/UpdateVariable>/gi, '')
        .replace(/<Analysis>[\s\S]*?<\/Analysis>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\r\n/g, '\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function compactText(value) { return cleanImportedText(value).replace(/\s+/g, ' ').trim(); }
function firstValue(...values) { return values.find(value => value !== undefined && value !== null && String(value).trim()) || ''; }
function normalizeTags(tags) { return Array.isArray(tags) ? tags.map(tag => String(tag).trim()).filter(Boolean).slice(0, 80) : []; }
function cloneJson(value) { try { return JSON.parse(JSON.stringify(value)); } catch (_) { return {}; } }
function isObject(value) { return Object.prototype.toString.call(value) === '[object Object]'; }
function isPng(bytes) { return bytes?.length >= 8 && [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v); }
function readUint32(bytes, offset) { return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]; }
function ascii(bytes, start, length) { return String.fromCharCode(...bytes.slice(start, start + length)); }
function generateBrowserId(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }

function parseMaybeJsonObject(value) {
    if (isObject(value)) return value;
    if (typeof value !== 'string') return {};
    try {
        const parsed = JSON.parse(value.trim());
        return isObject(parsed) ? parsed : {};
    } catch (_) { return {}; }
}

function firstObject(...values) { return values.map(parseMaybeJsonObject).find(value => Object.keys(value).length) || null; }
function normalizeKeys(keys) { return Array.isArray(keys) ? keys.map(String).filter(Boolean) : typeof keys === 'string' ? keys.split(/[,，\n]/).map(item => item.trim()).filter(Boolean) : []; }
function firstKey(keys) { return normalizeKeys(keys)[0] || ''; }

function normalizeLegacyFields(data) {
    const normalized = { ...data };
    normalized.name = firstValue(data.name, data.char_name, data.character_name, data.title, '未命名角色');
    normalized.description = firstValue(data.description, data.char_persona, data.persona, data.profile, '');
    normalized.personality = firstValue(data.personality, data.persona, data.char_personality, '');
    normalized.scenario = firstValue(data.scenario, data.world, data.world_setting, '');
    normalized.first_mes = firstValue(data.first_mes, data.greeting, data.first_message, data.initial_message, '');
    normalized.system_prompt = firstValue(data.system_prompt, data.context, data.system, '');
    normalized.mes_example = firstValue(data.mes_example, data.example_dialogue, data.example_messages, '');
    normalized.tags = Array.isArray(data.tags) ? data.tags : typeof data.tags === 'string' ? data.tags.split(/[,，]/) : [];
    return normalized;
}

function looksLikeCharacterCard(value) {
    if (!isObject(value)) return false;
    const directKeys = ['name', 'char_name', 'character_name', 'description', 'char_persona', 'personality', 'first_mes', 'first_message', 'scenario'];
    if (directKeys.some(key => typeof value[key] === 'string' && value[key].trim())) return true;
    if (value.spec || value.spec_version || value.character_book || value.characterBook) return true;
    return ['data', 'chara', 'ccv3', 'ccv2', 'ccv1'].some(key => {
        const parsed = parseMaybeJsonObject(value[key]);
        return Object.keys(parsed).length > 0 && looksLikeCharacterCard(parsed);
    });
}

export function extractFrontendAssets(data) {
    const scripts = Array.isArray(data.extensions?.regex_scripts) ? data.extensions.regex_scripts : [];
    return scripts
        .map((script, index) => {
            const source = String(script.replaceString || script.content || '');
            const html = extractHtmlSnippet(source);
            const url = extractFrontendUrl(source);
            if (!html && !url) return null;
            return {
                id: script.id || `frontend_${index + 1}`,
                name: script.scriptName || script.name || `内置前端 ${index + 1}`,
                disabled: script.disabled === true,
                markdownOnly: script.markdownOnly === true,
                sourceUrl: url,
                html: html ? sanitizeFrontendHtml(html).substring(0, 160000) : '',
                placement: script.placement || []
            };
        })
        .filter(Boolean)
        .slice(0, 12);
}

function extractHtmlSnippet(value) {
    const text = normalizeFrontendSource(String(value || '').trim());
    const fenced = text.match(/```(?:html|text)?\s*([\s\S]*?)\s*```/i);
    const body = sliceHtmlDocument((fenced ? fenced[1] : text).trim());
    if (!/<(?:!doctype|html|head|div|details|style|body|iframe|section|article|span|p|script)\b/i.test(body)) return '';
    return body;
}

function extractFrontendUrl(value) {
    const match = String(value || '').match(/https?:\/\/[^\s"'\\)<>]+/i);
    return match ? match[0] : '';
}

function sanitizeFrontendHtml(value) {
    return String(value || '')
        .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
        .trim();
}

function decodeHtmlEntities(value) {
    let decoded = value;
    const textarea = document.createElement('textarea');
    for (let i = 0; i < 4; i += 1) {
        if (!/[&](?:lt|gt|amp|quot|#39|apos);/i.test(decoded)) break;
        textarea.innerHTML = decoded;
        const next = textarea.value;
        if (next === decoded) break;
        decoded = next;
    }
    return decoded;
}

function normalizeFrontendSource(value) {
    let text = decodeHtmlEntities(value)
        .replace(/\\u003c/gi, '<')
        .replace(/\\u003e/gi, '>')
        .replace(/\\u0026/gi, '&');
    if (/\\[nrt"]/.test(text)) {
        try {
            text = JSON.parse(`"${text.replace(/"/g, '\\"')}"`);
        } catch (_) {}
    }
    return decodeHtmlEntities(text).trim();
}

function sliceHtmlDocument(value) {
    const starts = ['<!doctype', '<html', '<head', '<body', '<div', '<section', '<article', '<style'];
    const lower = value.toLowerCase();
    const start = starts.reduce((best, marker) => {
        const index = lower.indexOf(marker);
        return index >= 0 && (best < 0 || index < best) ? index : best;
    }, -1);
    if (start < 0) return value;
    let html = value.slice(start).trim();
    const endMarkers = ['</html>', '</body>', '</head>'];
    for (const marker of endMarkers) {
        const index = html.toLowerCase().lastIndexOf(marker);
        if (index >= 0) return html.slice(0, index + marker.length).trim();
    }
    return html.replace(/[`'";\s]+$/g, '').trim();
}
