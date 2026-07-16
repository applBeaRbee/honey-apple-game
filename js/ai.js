// ================= AI 通信模块 =================
import { appState, gameConfig, currentUser, isMailSending, setIsMailSending } from './state.js';
import { escapeHtml, safeParseJSON } from './constants.js';
import { showToast } from './ui.js';
import { saveLocalData } from './storage.js';
import { animateTimePass, getWorldTimeSnapshot, applyTurnTime, describeTimePass, formatWorldTime, parseWorldTime } from './time.js';
import { updateAmbientEnvironment } from './ambient.js';
import { renderGamePanelsUI, preserveSpecialPanels } from './panels.js';
import { renderActionBar, createStateSnapshot, pushUndoSnapshot, restoreStateSnapshot } from './actions.js';
import { renderSidebarSessions } from './sessions.js';
import { formatMsgContent } from './chat.js';
import { checkMailRedDot } from './mailbox.js';
import { preloadTavernImage } from './image-gen.js';
import { buildMemoryContext, updateMemoryFromAIResponse, extractMemoryFromMessage, recordConversationTurn } from './memory.js';
import { ensureLiyuanData, afterTurnBookkeeping, buildLiyuanContext, createDirectorCard, shouldSuggestDirectorCard, getOpenDirectorCards } from './world-state.js';

let forceSyncBusy = false;

function normalizeChatApiUrl(url) {
    if (!url) return '';
    let clean = url.trim().replace(/\/+$/, '');
    if (/\/chat\/completions$/i.test(clean)) return clean;
    if (/\/v\d+$/i.test(clean)) return clean + '/chat/completions';
    if (/opencode\.ai\/zen$/i.test(clean)) return clean + '/v1/chat/completions';
    if (/opencode\.ai\/zen\/v1$/i.test(clean)) return clean + '/chat/completions';
    return clean;
}

function resolveChatApiUrl(url) {
    const normalized = normalizeChatApiUrl(url);
    if (!normalized) return '';
    if (!appState.settings.useCorsProxy) return normalized;
    const proxy = (appState.settings.corsProxyUrl || 'https://corsproxy.io/?').trim();
    if (!proxy || normalized.startsWith(proxy)) return normalized;
    return proxy + encodeURIComponent(normalized);
}

function isOpenCodeApiUrl(url) {
    return /opencode\.ai\/zen/i.test(url || '');
}

function isOpenCodeRoute(url, model = '') {
    return isOpenCodeApiUrl(url)
        || /honey-apple-ai-proxy|workers\.dev/i.test(url || '')
        || /mimo-v2\.5-free/i.test(model || '');
}

function getOpenCodeCooldownRemaining() {
    const until = Number(appState.settings.openCodeCooldownUntil || 0);
    return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

function setOpenCodeCooldown(retryAfter) {
    const seconds = Math.max(30, Number.parseInt(retryAfter, 10) || 90);
    appState.settings.openCodeCooldownUntil = Date.now() + seconds * 1000;
    saveLocalData();
    return seconds;
}

function guardOpenCodeCooldown() {
    if (!isOpenCodeRoute(appState.settings.apiUrl, appState.settings.model)) return false;
    const left = getOpenCodeCooldownRemaining();
    if (left <= 0) return false;
    showToast(`OpenCode 正在限流冷却中，请约 ${left} 秒后再试。`, "warning", 6000);
    return true;
}

function proxyChatApiUrl(url) {
    const normalized = normalizeChatApiUrl(url);
    const proxy = (appState.settings.corsProxyUrl || 'https://corsproxy.io/?').trim();
    if (!proxy || normalized.startsWith(proxy)) return normalized;
    return proxy + encodeURIComponent(normalized);
}

function isNetworkOrCorsError(error) {
    const msg = error?.message || String(error || '');
    return error?.name === 'TypeError'
        || msg.includes('Failed to fetch')
        || msg.includes('NetworkError')
        || msg.includes('Load failed')
        || msg.includes('CORS');
}

function extractCompletionText(data) {
    const choice = data?.choices?.[0];
    const message = choice?.message || {};
    const parts = [];
    if (typeof message.content === 'string' && message.content.trim()) parts.push(message.content);
    if (typeof message.reasoning === 'string' && message.reasoning.trim()) parts.push(message.reasoning);
    if (Array.isArray(message.reasoning_details)) {
        message.reasoning_details.forEach(item => {
            if (typeof item?.text === 'string' && item.text.trim()) parts.push(item.text);
        });
    }
    if (typeof choice?.text === 'string' && choice.text.trim()) parts.push(choice.text);
    return parts.join('\n').trim();
}

function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function mergeValue(existing, incoming) {
    if (incoming === undefined || incoming === null) return existing;
    if (typeof incoming === 'string' && incoming.trim() === '') return existing;
    if (Array.isArray(incoming)) return mergeArray(existing, incoming);
    if (isPlainObject(incoming)) {
        const base = isPlainObject(existing) ? { ...existing } : {};
        for (const [key, val] of Object.entries(incoming)) {
            base[key] = mergeValue(base[key], val);
        }
        return base;
    }
    return incoming;
}

function mergeArray(existing, incoming) {
    if (!incoming.length) return Array.isArray(existing) ? existing : [];
    if (!Array.isArray(existing) || !existing.length) return incoming;

    const merged = [...existing];
    for (const item of incoming) {
        if (isPlainObject(item)) {
            const key = item.id || item.name || item.title || item.subject;
            const idx = key ? merged.findIndex(old => isPlainObject(old) && ((old.id || old.name || old.title || old.subject) === key)) : -1;
            if (idx >= 0) merged[idx] = mergeValue(merged[idx], item);
            else merged.push(item);
        } else if (!merged.includes(item)) {
            merged.push(item);
        }
    }
    return merged;
}

function looksLikePanelPatch(parsed) {
    if (!isPlainObject(parsed)) return false;
    const metaKeys = new Set([
        'pass_time', 'time_passed', 'elapsed_minutes', 'elapsedMinutes',
        'world_time', 'worldTime', 'current_time', 'currentTime',
        'memory_db', 'memoryDb', 'backgroundMemory', 'ambient', 'actions',
        'new_mails', 'new_mails_count', 'new_gallery', 'cg_cutin', 'director_card',
        'active_characters', 'nearby_characters', 'activeCharacters', 'nearbyCharacters',
        'panel_order', 'panelOrder', 'relation_web', 'map_data', 'mapData',
        'updates', 'changes', 'patch', 'data'
    ]);
    return Object.keys(parsed).some(key => !metaKeys.has(key));
}

function extractPanelPatch(parsed) {
    if (!isPlainObject(parsed)) return null;
    const containers = [
        parsed.panels,
        parsed.panel_updates,
        parsed.panelUpdates,
        parsed.panel_patch,
        parsed.panelPatch,
        parsed.updates?.panels,
        parsed.updates?.panel_updates,
        parsed.changes?.panels,
        parsed.changes?.panel_updates,
        parsed.patch?.panels,
        parsed.patch?.panel_updates,
        parsed.data?.panels,
        parsed.data?.panel_updates,
        parsed.data?.panelUpdates,
        parsed.data?.updates?.panels,
        parsed.data?.changes?.panels,
        parsed['面板'],
        parsed['面板更新'],
        parsed['面板增量'],
        parsed['新增面板'],
        parsed['新增内容'],
        parsed['更新']?.panels,
        parsed['更新']?.['面板'],
        parsed['变更']?.panels,
        parsed['变更']?.['面板'],
        parsed['面板'],
        parsed['面板更新'],
        parsed['面板增量']
    ];
    for (const candidate of containers) {
        if (isPlainObject(candidate)) return candidate;
    }
    for (const wrapper of [parsed.updates, parsed.changes, parsed.patch, parsed.data]) {
        if (isPlainObject(wrapper) && looksLikePanelPatch(wrapper)) return wrapper;
    }
    return looksLikePanelPatch(parsed) ? parsed : null;
}

function mergePanelUpdates(panelPatch, options = {}) {
    if (!isPlainObject(panelPatch) || !gameConfig?.panels) return false;
    let changed = false;
    const metaKeys = new Set([
        'pass_time', 'time_passed', 'elapsed_minutes', 'elapsedMinutes',
        'world_time', 'worldTime', 'current_time', 'currentTime',
        'memory_db', 'memoryDb', 'backgroundMemory', 'ambient', 'actions',
        'new_mails', 'new_mails_count', 'new_gallery', 'cg_cutin', 'director_card',
        'active_characters', 'nearby_characters', 'activeCharacters', 'nearbyCharacters',
        'panel_order', 'panelOrder', 'relation_web', 'map_data', 'mapData',
        'updates', 'changes', 'patch', 'data'
    ]);
    for (const [panelName, patch] of Object.entries(panelPatch)) {
        if (metaKeys.has(panelName)) continue;
        if (patch === undefined || patch === null) continue;
        const safeName = String(panelName || '').trim();
        if (!safeName) continue;
        if (!gameConfig.panels[safeName]) {
            gameConfig.panels[safeName] = patch;
            changed = true;
            continue;
        }
        const current = gameConfig.panels[safeName];
        if (Array.isArray(current) && Array.isArray(patch)) {
            gameConfig.panels[safeName] = mergeArray(current, patch);
        } else if (isPlainObject(current) && isPlainObject(patch)) {
            gameConfig.panels[safeName] = mergeValue(current, patch);
        } else {
            gameConfig.panels[safeName] = patch;
        }
        changed = true;
    }
    if (changed && options.preserve !== false) preserveSpecialPanels(gameConfig.panels);
    return changed;
}

function normalizeTimeLike(value) {
    const parsed = parseWorldTime(value, { source: 'json' }) || parseWorldTime(value, { source: 'manual' });
    return parsed || null;
}

function buildForceSyncTranscript() {
    const lines = (gameConfig.history || []).map((m, index) => {
        const time = m.worldTime ? formatWorldTime(m.worldTime) : '时间未知';
        const role = m.role === 'user' ? '玩家' : 'AI';
        const content = String(m.content || m.rawData || '').slice(0, 3000);
        return `#${index + 1} [${time}] ${role}: ${content}`;
    });
    const full = lines.join('\n\n');
    if (full.length <= 120000) return full;
    return `${full.slice(0, 30000)}\n\n【中间过长，已保留开头与最近全文】\n\n${full.slice(-90000)}`;
}

async function fetchChatCompletion(apiUrl, options) {
    try {
        return await fetchJson(resolveChatApiUrl(apiUrl), options);
    } catch (error) {
        const shouldRetryWithProxy = isOpenCodeApiUrl(apiUrl)
            && !appState.settings.useCorsProxy
            && !error.status
            && isNetworkOrCorsError(error);
        if (!shouldRetryWithProxy) throw error;

        const data = await fetchJson(proxyChatApiUrl(apiUrl), options);
        appState.settings.useCorsProxy = true;
        appState.settings.corsProxyUrl = appState.settings.corsProxyUrl || 'https://corsproxy.io/?';
        saveLocalData();
        return data;
    }
}

async function fetchJson(url, options) {
    const res = await fetch(url, options);
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) {
        const retryAfter = res.headers.get('retry-after');
        const detail = data.error?.message || data.message || `HTTP ${res.status}`;
        const suffix = res.status === 429
            ? `。服务商限流${retryAfter ? `，建议 ${retryAfter} 秒后重试` : '，建议等待 30-120 秒后重试'}`
            : '';
        const error = new Error(detail + suffix);
        error.status = res.status;
        error.retryAfter = retryAfter;
        throw error;
    }
    return data;
}

export async function sendToAI(mailData = null) {
    const isDify = appState.settings.engineType === 'dify';
    if (isDify && !appState.settings.difyApiKey) return showToast("未配置 Dify 密钥", "error");
    if (!isDify && !appState.settings.apiKey) return showToast("未配置 API 密钥", "error");
    if (!isDify && guardOpenCodeCooldown()) return;
    if (!gameConfig) return showToast("游戏配置缺失", "error");
    ensureLiyuanData(gameConfig);

    const input = document.getElementById('chatInput');
    const history = document.getElementById('chatHistoryUI');
    let isMail = mailData !== null;
    let userText = "";

    if (isMail) {
        userText = `[飞鸽传书给 ${mailData.npc}]：${mailData.text}`;
    } else {
        userText = input.value.trim();
        if (!userText) return;
        history.innerHTML += `<div class="chat-row row-user"><div class="chat-avatar">👤</div><div class="chat-message msg-user">${escapeHtml(userText)}</div></div>`;
        input.value = '';
        history.scrollTo({ top: history.scrollHeight, behavior: 'smooth' });
    }
    document.getElementById('btnSend').disabled = true;

    // ===== 动态图鉴 =====
    let activeLore = [];
    if (gameConfig.lorebook) {
        for (let kw in gameConfig.lorebook) {
            if (userText.includes(kw)) activeLore.push(`- 【${kw}】：${gameConfig.lorebook[kw]}`);
        }
    }
    const loreStr = activeLore.length ? `\n\n【动态图鉴】\n${activeLore.join('\n')}` : '';

    if (!gameConfig.history) gameConfig.history = [];
    // 记录消息时附带时间戳
    const timeSnapshot = getWorldTimeSnapshot();
    const preTurnSnapshot = createStateSnapshot(isMail ? 'mail-turn' : 'chat-turn');
    gameConfig.history.push({
        role: "user",
        content: userText,
        isMail: isMail,
        worldTime: timeSnapshot,
        preTurnSnapshot
    });
    gameConfig.lastUpdated = Date.now();
    const session = appState.sessions?.find(item => item.id === gameConfig.id);
    if (session) session.lastUpdated = gameConfig.lastUpdated;
    saveLocalData();

    // ===== 从用户输入提取记忆 =====
    extractMemoryFromMessage(userText, '');

    let lid = null, answer = "";
    try {
        if (!isMail) {
            lid = "load-" + Date.now();
            const txt = isDify ? "Dify 知识库推演中" : "标准模型推演中";
            history.innerHTML += `<div id="${lid}" class="chat-row"><div class="chat-avatar dm-avatar">🍎</div><div class="chat-message msg-loading loading-dots">${txt}</div></div>`;
            history.scrollTo({ top: history.scrollHeight, behavior: 'smooth' });
        }

        // ===== 构建记忆上下文 =====
        const memoryContext = buildMemoryContext();
        const liyuanContext = buildLiyuanContext(gameConfig);
        const memoryStr = [memoryContext ? `【世界观数据库】\n${memoryContext}` : '', liyuanContext].filter(Boolean).join('\n\n');
        const memoryBlock = memoryStr ? `\n\n${memoryStr}` : '';

        if (isDify) {
            const query = `【法则】世界观:${gameConfig.worldSetting} 背景:${gameConfig.storyBackground} 主角:${gameConfig.charName}(${gameConfig.charInfo}) 守则:${gameConfig.systemPromptText}${loreStr}${memoryBlock}\n${isMail?'[信箱模式]仅回信，用new_mails返回。':'【面板】:'+JSON.stringify(gameConfig.panels)+'\n【行动】:'+userText+'\n【输出】末尾必须包含======DATA====== 后接纯JSON(含current_time,pass_time,panels,memory_db,new_mails等)，其中 current_time 必须是本轮回复结束后的世界时间。'}`;
            let difyBody = {
                inputs: {},
                query: query,
                user: currentUser || "player_guest",
                response_mode: "blocking"
            };
            if (gameConfig.difyConversationId) {
                difyBody.conversation_id = gameConfig.difyConversationId;
            }
            const res = await fetch(appState.settings.difyApiUrl || "https://api.dify.ai/v1/chat-messages", {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${appState.settings.difyApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(difyBody)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Dify 响应异常");
            if (data.conversation_id) gameConfig.difyConversationId = data.conversation_id;
            answer = data.answer || "";
        } else {
            // ===== 标准 OpenAI 格式 =====
            const base = `【核心指令】硬核DM。回复末尾必须包含======DATA====== 后接纯JSON。\n世界观:${gameConfig.worldSetting}\n背景:${gameConfig.storyBackground}\n主角:${gameConfig.charName}(${gameConfig.charInfo})\n守则:${gameConfig.systemPromptText}${loreStr}${memoryBlock}`;
            const format = `【最高指令】1.更新面板状态 2.末尾======DATA====== 后接纯JSON 3.每次回复都必须输出 current_time:{day,hour,minute}，如果发生时间推进可同时写 pass_time(分钟)，不要让正文时间与JSON时间矛盾 4.支持new_mails,new_gallery,cg_cutin,pass_time,current_time,ambient,memory_db 5.若用户请求方向或场景存在重大分歧，可输出 director_card:{title,body,options,freeform}\n【当前时间】:${formatWorldTime(gameConfig.worldTime)}\n【当前面板】:${JSON.stringify(gameConfig.panels)}\n【融合世界状态】:${liyuanContext}`;

            let msgs = [{ role: "system", content: base }];

            // 构建上下文：最近N条历史 + 背景记忆
            const maxHistoryTokens = 12;
            const hist = (gameConfig.history || []).slice(-maxHistoryTokens);
            hist.forEach(m => msgs.push({ role: m.role, content: m.rawData || m.content }));

            // 注入背景记忆（长期记忆）
            if (gameConfig.backgroundMemory) {
                msgs.push({ role: "system", content: `[背景记忆]: ${gameConfig.backgroundMemory}` });
            }

            if (gameConfig.authorsNote) {
                msgs.push({ role: "system", content: `[导演备注]: ${gameConfig.authorsNote}` });
            }

            if (isMail) {
                msgs.push({ role: "system", content: "[信箱模式]仅回信，用new_mails。" });
            }

            msgs.push({ role: "system", content: format });
            msgs.push({ role: "user", content: userText });

            const d = await fetchChatCompletion(appState.settings.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${appState.settings.apiKey}`
                },
                body: JSON.stringify({
                    model: appState.settings.model,
                    messages: msgs
                })
            });
            answer = extractCompletionText(d);
            if (!answer) throw new Error('API 响应为空');
        }

        // ===== 处理响应 =====
        if (!isMail && lid && document.getElementById(lid)) document.getElementById(lid).remove();
        let raw = answer;
        const dataRegex = /={3,}\s*DATA\s*={3,}/i;
        if (dataRegex.test(raw)) raw = raw.split(dataRegex)[0];
        raw = raw.replace(/\`\`\`[\s\S]*?\`\`\`/g, '').trim();

        let acts = [];
        const parsed = safeParseJSON(answer);

        // 时间处理
        const turnTime = applyTurnTime(userText, raw, parsed, { advance: !isMail });
        if (!isMail && turnTime.minutes >= 60) {
            document.getElementById('timePassText').innerText = describeTimePass(turnTime.minutes);
            await animateTimePass(turnTime.minutes, turnTime.before);
        }

        // 解析 JSON 数据
        if (parsed) {
            const newP = extractPanelPatch(parsed);
            mergePanelUpdates(newP);

            // 背景记忆
            if (parsed.backgroundMemory !== undefined) gameConfig.backgroundMemory = parsed.backgroundMemory;

            // 行动建议
            if (parsed.actions && Array.isArray(parsed.actions)) acts = parsed.actions;

            // 环境氛围
            if (parsed.ambient) {
                gameConfig.ambient = mergeValue(gameConfig.ambient || {}, parsed.ambient);
                updateAmbientEnvironment(gameConfig.ambient);
            }

            if (parsed.current_time || parsed.currentTime || parsed.world_time || parsed.worldTime) {
                const nextTime = parsed.current_time || parsed.currentTime || parsed.world_time || parsed.worldTime;
                const normalizedTime = normalizeTimeLike(nextTime);
                if (normalizedTime) {
                    gameConfig.worldTime = normalizedTime;
                    document.getElementById('timePassText').innerText = `当前时间：${formatWorldTime(normalizedTime)}`;
                    window.updateWorldTimeUI?.();
                }
            }

            // 新邮件
            if (parsed.new_mails) {
                parsed.new_mails.forEach(m => {
                    gameConfig.mailbox.push({ ...m, read: false, time: new Date().toLocaleTimeString() });
                });
                checkMailRedDot();
                showToast("✉️ 收到新信件", "info");
            }

            // 画廊
            if (parsed.new_gallery) {
                parsed.new_gallery.forEach(g => {
                    gameConfig.gallery.push(g);
                    showToast(`📸 收录: ${g.name}`, "info");
                });
            }

            // CG 切入
            if (parsed.cg_cutin?.prompt) {
                const container = document.getElementById('cgCutinContainer');
                const img = document.getElementById('cgCutinImg');
                document.getElementById('cgCutinText').innerText = parsed.cg_cutin.desc || "高光降临";
                container.style.display = 'flex';
                preloadTavernImage(img, 'cgCutinContainer', parsed.cg_cutin.prompt, 'wide');
                gameConfig.gallery.push({
                    name: parsed.cg_cutin.desc || "高光时刻",
                    prompt: parsed.cg_cutin.prompt,
                    type: "scene"
                });
            }

            if (parsed.director_card?.title && Array.isArray(parsed.director_card.options)) {
                const card = createDirectorCard(parsed.director_card, gameConfig);
                window.renderDirectorUI?.();
                showToast(`🎭 ${card.title}：请打开决策卡选择`, 'info', 6000);
            } else if (!isMail && shouldSuggestDirectorCard(userText)) {
                const card = createDirectorCard({
                    title: '下一步怎么走',
                    body: '你把决定权交给了剧情。先选一个方向，系统会把选择留痕并带回下一轮。',
                    options: acts.length ? acts.slice(0, 4) : ['谨慎观察局势', '主动交涉试探', '推进当前目标', '暂时后撤整理线索'],
                    freeform: true
                }, gameConfig);
                window.renderDirectorUI?.();
                showToast(`🎭 已生成决策卡「${card.title}」`, 'info', 6000);
            }

            // ===== 更新记忆数据库 =====
            updateMemoryFromAIResponse(parsed);
            recordConversationTurn(userText, raw, parsed, { before: turnTime.before, after: parsed.current_time || parsed.currentTime || parsed.world_time || parsed.worldTime || turnTime.after });
            // 从AI回复中提取记忆
            extractMemoryFromMessage('', raw);
        } else if (answer.includes("======DATA======")) {
            showToast("数据格式损坏，部分状态未更新", "error");
        }

        // 渲染更新
        renderGamePanelsUI();
        renderActionBar(acts);

        if (!isMail) {
            const mid = 'msg-' + Date.now();
            history.innerHTML += `<div class="chat-row"><div class="chat-avatar dm-avatar">🍎</div><div class="chat-message msg-narrator" id="${mid}">${formatMsgContent(raw)}</div></div>`;
            // 添加时间标签
            const timeTag = document.createElement('div');
            timeTag.className = 'chat-time-tag';
            const wt = turnTime.after || getWorldTimeSnapshot();
            timeTag.innerText = `🕒 ${formatWorldTime(wt)}`;
            document.getElementById(mid)?.appendChild(timeTag);
            setTimeout(() => history.scrollTo({ top: history.scrollHeight, behavior: 'smooth' }), 50);
        }

        const snap = JSON.parse(JSON.stringify(gameConfig.panels || {}));
        gameConfig.history.push({
            role: "assistant",
            content: raw,
            rawData: answer,
            panelsSnapshot: snap,
            memorySnapshot: gameConfig.backgroundMemory,
            actions: acts,
            isMail: isMail,
            worldTime: turnTime.after || getWorldTimeSnapshot()
        });
        gameConfig.lastUpdated = Date.now();
        afterTurnBookkeeping(gameConfig, { reason: isMail ? '信件' : '剧情回合' });
        await saveLocalData();
        renderSidebarSessions();
    } catch (e) {
        if (!isMail && lid && document.getElementById(lid)) document.getElementById(lid).remove();
        gameConfig.history.pop();
        restoreStateSnapshot(preTurnSnapshot);
        saveLocalData();
        if (e.status === 429) {
            const seconds = setOpenCodeCooldown(e.retryAfter);
            showToast(`OpenCode 当前触发速率限制，请约 ${seconds} 秒后再试。免费模型高峰期很容易这样。`, "warning", 8000);
        } else {
            showToast("通信异常: " + e.message, "error");
        }
    }
    document.getElementById('btnSend').disabled = false;
    if (!isMail) {
        document.getElementById('chatInput').focus();
    } else {
        setIsMailSending(false);
        // 邮箱 UI 更新由窗口事件触发
    }
}

async function forceSyncPanelsInternal() {
    if (forceSyncBusy) return showToast('强刷正在进行中，请等待当前检查完成', 'warning');
    const isDify = appState.settings.engineType === 'dify';
    if (isDify && !appState.settings.difyApiKey) return showToast("未配置 Dify 密钥", "error");
    if (!isDify && !appState.settings.apiKey) return showToast("未配置 API 密钥", "error");
    if (!isDify && guardOpenCodeCooldown()) return;
    if (!gameConfig) return showToast("配置缺失", "error");

    forceSyncBusy = true;
    const syncSnapshot = createStateSnapshot('force-sync');
    showToast("强制洞察全文检查中...", "info", 5000);
    try {
        let answer = "";
        const transcript = buildForceSyncTranscript();
        const prompt = `【强制洞察：全文增量同步】
你是游戏数据审计器。请读取完整聊天记录，检查当前面板和记忆数据库有没有遗漏、需要新增、或已有字段需要更新的地方。

【重要约束】
1. 只输出增量补丁，不要重写整份面板。
2. 不要删除、清空、改名已有面板和已有字段。
3. 如果某个原有字段没有新变化，就不要输出它。
4. 数组只在确实发现新增/修正时输出，不能输出空数组覆盖旧数据。
5. 如果需要新增面板，可以在 panels 中新增顶层面板名。
6. 如果聊天记录很长，优先补齐人物、地点、关系、物品、任务、当前状态和重要事实。

【当前面板快照】
${JSON.stringify(gameConfig.panels || {}, null, 2)}

【当前记忆库快照】
${JSON.stringify(gameConfig.memoryDb || {}, null, 2)}

【全文聊天记录】
${transcript}

【输出规则】
末尾必须包含 ======DATA====== 后接纯 JSON。JSON 只能包含需要增量更新的内容：
{
  "panels": { "面板名": { "字段": "新值或修正值" } },
  "memory_db": { "characters": {}, "locations": {}, "events": [], "facts": [], "quests": [], "sections": {} },
  "backgroundMemory": "可选，仅在需要补充摘要时输出",
  "ambient": { "time": "可选", "weather": "可选" },
  "actions": []
}`;
        if (isDify) {
            let difyBody = {
                inputs: {},
                query: prompt,
                user: currentUser || "player_guest",
                response_mode: "blocking"
            };
            if (gameConfig.difyConversationId) difyBody.conversation_id = gameConfig.difyConversationId;
            const res = await fetch(appState.settings.difyApiUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${appState.settings.difyApiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(difyBody)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Dify 异常");
            if (data.conversation_id) gameConfig.difyConversationId = data.conversation_id;
            answer = data.answer || "";
        } else {
            const d = await fetchChatCompletion(appState.settings.apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${appState.settings.apiKey}` },
                body: JSON.stringify({
                    model: appState.settings.model,
                    messages: [
                        { role: "system", content: `世界观:${gameConfig.worldSetting} 主角:${gameConfig.charName}` },
                        { role: "user", content: prompt }
                    ]
                })
            });
            answer = extractCompletionText(d);
            if (!answer) throw new Error('API 响应为空');
        }
        const parsed = safeParseJSON(answer);
        if (parsed) {
            pushUndoSnapshot('force-sync');
            const newPanels = extractPanelPatch(parsed);
            const panelChanged = mergePanelUpdates(newPanels);
            if (parsed.backgroundMemory !== undefined) gameConfig.backgroundMemory = parsed.backgroundMemory;
            updateMemoryFromAIResponse(parsed);
            if (parsed.ambient) {
                gameConfig.ambient = mergeValue(gameConfig.ambient || {}, parsed.ambient);
                updateAmbientEnvironment(gameConfig.ambient);
            }
            renderGamePanelsUI();
            gameConfig.lastUpdated = Date.now();
            await saveLocalData();
            showToast(panelChanged ? "强制洞察完成，已合并面板更新" : "强制洞察完成，未检测到新面板", "success");
        } else {
            showToast("面板重构响应格式异常", "error");
        }
    } catch (e) {
        if (syncSnapshot) {
            restoreStateSnapshot(syncSnapshot);
            renderGamePanelsUI();
            await saveLocalData();
        }
        if (e.status === 429) {
            const seconds = setOpenCodeCooldown(e.retryAfter);
            showToast(`OpenCode 当前触发速率限制，请约 ${seconds} 秒后再试。`, "warning", 8000);
        } else {
            showToast("强制同步异常: " + e.message, "error");
        }
    }
}

// ===== 瀵煎嚭鍒?window =====
window.sendToAI = sendToAI;
export async function forceSyncPanels() {
    if (forceSyncBusy) return showToast('强刷正在进行中，请等待当前检查完成', 'warning');
    try {
        return await forceSyncPanelsInternal();
    } finally {
        forceSyncBusy = false;
    }
}

window.forceSyncPanels = forceSyncPanels;
