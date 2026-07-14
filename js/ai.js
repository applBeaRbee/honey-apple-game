// ================= AI 通信模块 =================
import { appState, gameConfig, currentUser, isMailSending, setIsMailSending } from './state.js';
import { escapeHtml, safeParseJSON } from './constants.js';
import { showToast } from './ui.js';
import { saveLocalData } from './storage.js';
import { addWorldTime, animateTimePass, updateWorldTimeUI, getWorldTimeSnapshot, inferPassTime } from './time.js';
import { updateAmbientEnvironment } from './ambient.js';
import { renderGamePanelsUI, preserveSpecialPanels } from './panels.js';
import { renderActionBar } from './actions.js';
import { renderSidebarSessions } from './sessions.js';
import { formatMsgContent } from './chat.js';
import { checkMailRedDot } from './mailbox.js';
import { preloadTavernImage } from './image-gen.js';
import { buildMemoryContext, updateMemoryFromAIResponse, extractMemoryFromMessage } from './memory.js';
import { ensureLiyuanData, afterTurnBookkeeping, buildLiyuanContext, createDirectorCard, shouldSuggestDirectorCard, getOpenDirectorCards } from './world-state.js';

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
    gameConfig.history.push({
        role: "user",
        content: userText,
        isMail: isMail,
        worldTime: timeSnapshot
    });

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
            const query = `【法则】世界观:${gameConfig.worldSetting} 背景:${gameConfig.storyBackground} 主角:${gameConfig.charName}(${gameConfig.charInfo}) 守则:${gameConfig.systemPromptText}${loreStr}${memoryBlock}\n${isMail?'[信箱模式]仅回信，用new_mails返回。':'【面板】:'+JSON.stringify(gameConfig.panels)+'\n【行动】:'+userText+'\n【输出】末尾必须包含======DATA====== 后接纯JSON(含pass_time,panels,memory_db,new_mails等)。'}`;
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
            const format = `【最高指令】1.更新面板状态 2.末尾======DATA====== 后接纯JSON 3.时空平滑 4.支持new_mails,new_gallery,cg_cutin,pass_time,ambient,memory_db 5.若用户请求方向或场景存在重大分歧，可输出 director_card:{title,body,options,freeform}\n【当前面板】:${JSON.stringify(gameConfig.panels)}\n【融合世界状态】:${liyuanContext}`;

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
        let timePassed = inferPassTime(userText, raw, parsed);
        if (!isMail) {
            const timeChange = addWorldTime(timePassed);
            if (timePassed >= 60) {
                const txt = timePassed >= 1440 * 30 ? "修真无岁月，世上已千年..." :
                    (timePassed >= 1440 ? "几日之后..." : (timePassed >= 480 ? "一夜无话..." : "时光流转..."));
                document.getElementById('timePassText').innerText = txt;
                await animateTimePass(timePassed, timeChange?.before);
            }
        }

        // 解析 JSON 数据
        if (parsed) {
            let newP = parsed.panels || parsed;
            for (let k in gameConfig.panels) {
                if (newP[k] !== undefined) gameConfig.panels[k] = newP[k];
            }
            preserveSpecialPanels(gameConfig.panels);

            // 背景记忆
            if (parsed.backgroundMemory !== undefined) gameConfig.backgroundMemory = parsed.backgroundMemory;

            // 行动建议
            if (parsed.actions && Array.isArray(parsed.actions)) acts = parsed.actions;

            // 环境氛围
            if (parsed.ambient) {
                gameConfig.ambient = parsed.ambient;
                updateAmbientEnvironment(parsed.ambient);
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
            const wt = gameConfig.worldTime;
            timeTag.innerText = `🕒 第${wt.day}天 ${String(wt.hour).padStart(2,'0')}:${String(wt.minute).padStart(2,'0')}`;
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
            worldTime: getWorldTimeSnapshot()
        });
        gameConfig.lastUpdated = Date.now();
        afterTurnBookkeeping(gameConfig, { reason: isMail ? '信件' : '剧情回合' });
        saveLocalData();
        renderSidebarSessions();
    } catch (e) {
        if (!isMail && lid && document.getElementById(lid)) document.getElementById(lid).remove();
        gameConfig.history.pop();
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

export async function forceSyncPanels() {
    const isDify = appState.settings.engineType === 'dify';
    if (isDify && !appState.settings.difyApiKey) return showToast("未配置 Dify 密钥", "error");
    if (!isDify && !appState.settings.apiKey) return showToast("未配置 API 密钥", "error");
    if (!isDify && guardOpenCodeCooldown()) return;
    if (!gameConfig) return showToast("配置缺失", "error");

    showToast("强制洞察重构中...", "info", 4000);
    try {
        let answer = "";
        const recent = (gameConfig.history || []).slice(-12).map(m => `${m.role}: ${m.content || m.rawData || ''}`).join('\n');
        const prompt = `【强制洞察】忽略叙事，作为数据同步引擎，从近期聊天中补齐面板和记忆数据库。\n【当前面板】:${JSON.stringify(gameConfig.panels)}\n【当前记忆库】:${JSON.stringify(gameConfig.memoryDb || {})}\n【近期聊天】:\n${recent}\n【输出规则】:末尾======DATA====== 后接纯JSON，可包含 panels、memory_db、backgroundMemory、ambient、actions。保持已有顶层面板名，继承历史物品，理顺关系网和地点。`;
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
            const newPanels = parsed.panels || parsed;
            for (let k in gameConfig.panels) {
                if (newPanels[k] !== undefined) gameConfig.panels[k] = newPanels[k];
            }
            preserveSpecialPanels(gameConfig.panels);
            if (parsed.backgroundMemory !== undefined) gameConfig.backgroundMemory = parsed.backgroundMemory;
            updateMemoryFromAIResponse(parsed);
            if (parsed.ambient) {
                gameConfig.ambient = parsed.ambient;
                updateAmbientEnvironment(parsed.ambient);
            }
            renderGamePanelsUI();
            saveLocalData();
            showToast("强制洞察完成", "success");
        } else {
            showToast("面板重构响应格式异常", "error");
        }
    } catch (e) {
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
window.forceSyncPanels = forceSyncPanels;
