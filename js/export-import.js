// ================= 导出 / 导入系统 & API 设置 =================
import { appState, gameConfig } from './state.js';
import { escapeHtml, generateId } from './constants.js';
import { showToast, showConfirm, closeModal } from './ui.js';
import { saveLocalData } from './storage.js';
import { renderLibrary } from './cards.js';
import { renderSidebarSessions } from './sessions.js';

// ===== 预设 API 配置数据库 =====
export const API_PRESETS_LIST = [
    { name: '🔮 DeepSeek 官方', url: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat', note: 'DeepSeek 官方 API' },
    { name: '🧠 OpenCode Zen', url: 'https://opencode.ai/zen/v1/chat/completions', model: 'mimo-v2.5-free', note: '浏览器直连失败时会自动尝试 CORS 代理' },
    { name: '🌊 轨迹流动', url: 'https://guiji.ai/v1/chat/completions', model: 'deepseek-chat', note: '轨迹流动 API' },
    { name: '🔄 OpenRouter', url: 'https://openrouter.ai/api/v1/chat/completions', model: 'openrouter/auto', note: '多模型路由' },
    { name: '🔌 SiliconFlow', url: 'https://api.siliconflow.cn/v1/chat/completions', model: 'deepseek-v3', note: '硅基流动' },
    { name: '☁️ 腾讯混元', url: 'https://api.hunyuan.cloud.tencent.com/v1/chat/completions', model: 'hunyuan', note: '腾讯混元大模型' },
    { name: '⚡ 自定义', url: '', model: '', note: '手动填写' }
];

function normalizeStandardApiUrl(url) {
    if (!url) return '';
    const clean = url.trim().replace(/\/+$/, '');
    if (/\/chat\/completions$/i.test(clean)) return clean;
    if (/\/v\d+$/i.test(clean)) return clean + '/chat/completions';
    if (/opencode\.ai\/zen$/i.test(clean)) return clean + '/v1/chat/completions';
    if (/opencode\.ai\/zen\/v1$/i.test(clean)) return clean + '/chat/completions';
    return clean;
}

function resolveStandardApiUrl(url, useProxy = false, proxyUrl = '') {
    const normalized = normalizeStandardApiUrl(url);
    if (!useProxy) return normalized;
    const proxy = (proxyUrl || 'https://corsproxy.io/?').trim();
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

function isNetworkOrCorsError(error) {
    const msg = error?.message || String(error || '');
    return error?.name === 'TypeError'
        || msg.includes('Failed to fetch')
        || msg.includes('NetworkError')
        || msg.includes('Load failed')
        || msg.includes('CORS');
}

function extractStandardResponseText(data) {
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

function isUsableStandardResponse(data) {
    const choice = data?.choices?.[0];
    return Boolean(choice?.message || choice?.text !== undefined || extractStandardResponseText(data));
}

async function postStandardApiForTest(apiUrl, apiKey, model, useProxy, proxyUrl, signal) {
    const res = await fetch(resolveStandardApiUrl(apiUrl, useProxy, proxyUrl), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify({
            model: model || 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 8
        }),
        signal
    });
    let data;
    try { data = await res.json(); } catch (_) { data = {}; }
    return { res, data, usedProxy: useProxy };
}

// ===== 导出 =====
export function openExportModal() {
    const modal = document.getElementById('exportModal');
    if (!modal) return;
    const list = document.getElementById('exportCardList');
    if (!list) return;
    list.innerHTML = '';
    appState.cards.forEach(card => {
        const el = document.createElement('div');
        el.className = 'export-card-item';
        el.innerHTML = `
            <input type="checkbox" class="export-card-cb" checked data-id="${escapeHtml(card.id)}">
            <div class="card-info">
                <span class="card-avatar-sm">${escapeHtml(card.avatar||'📜')}</span>
                <span class="card-name-sm">${escapeHtml(card.name)}</span>
            </div>`;
        list.appendChild(el);
    });
    if (!appState.cards.length) {
        list.innerHTML = '<div style="color:var(--text-muted);padding:12px;text-align:center;">无卡片可导出</div>';
    }
    document.getElementById('exportIncludeSessions').checked = true;
    modal.style.display = 'flex';
}

export function toggleAllExportCards() {
    const cbs = document.querySelectorAll('.export-card-cb');
    if (!cbs.length) return;
    const all = Array.from(cbs).every(cb => cb.checked);
    cbs.forEach(cb => { cb.checked = !all; });
    const btn = document.getElementById('btnToggleAllCards');
    if (btn) btn.textContent = all ? '全选' : '取消全选';
}

export function executeExport() {
    const selected = [];
    document.querySelectorAll('.export-card-cb:checked').forEach(cb => {
        const card = appState.cards.find(c => c.id === cb.dataset.id);
        if (card) selected.push(card);
    });
    if (!selected.length) return showToast('请选择至少一个卡片', 'warning');
    const includeSessions = document.getElementById('exportIncludeSessions')?.checked;
    const exportData = { cards: selected, exportTime: Date.now(), version: '2.0' };
    if (includeSessions) {
        const sessionIds = selected.map(c => c.id);
        exportData.sessions = appState.sessions.filter(s => sessionIds.includes(s.cardId));
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `蜂蜜苹果_剧本包_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    closeModal('exportModal');
    showToast('📦 导出成功', 'success');
}

export function importData(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.cards || !data.cards.length) throw new Error('未找到卡片数据');
            let imported = 0;
            data.cards.forEach(card => {
                if (!appState.cards.find(c => c.name === card.name && c.storyBackground === card.storyBackground)) {
                    card.id = generateId('card');
                    card.created = Date.now();
                    appState.cards.unshift(card);
                    imported++;
                }
            });
            if (data.sessions) {
                data.sessions.forEach(s => {
                    s.id = generateId('sess');
                    if (!appState.sessions.find(x => x.name === s.name)) {
                        appState.sessions.unshift(s);
                    }
                });
            }
            saveLocalData();
            renderLibrary();
            renderSidebarSessions();
            showToast(`导入成功：${imported} 张卡片`, 'success');
        } catch (err) {
            showToast('导入失败：' + err.message, 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

export function exportDiary() {
    if (!window.gameConfig) return showToast('没有活跃会话', 'warning');
    const gc = window.gameConfig;
    let text = `# ${gc.name}\n\n`;
    text += `角色：${gc.charName} (${gc.charInfo || ''})\n`;
    text += `背景：${gc.storyBackground || ''}\n\n`;
    (gc.history || []).forEach(m => {
        const who = m.role === 'user' ? gc.charName : 'DM';
        const time = m.worldTime ? `[第${m.worldTime.day}天 ${String(m.worldTime.hour).padStart(2,'0')}:${String(m.worldTime.minute).padStart(2,'0')}]` : '';
        text += `${time} ${who}: ${m.content}\n\n`;
    });
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${gc.name}_冒险日志.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('📤 日志导出成功', 'success');
}

export function triggerImportDiary() {
    document.getElementById('diaryImportInput')?.click();
}

export function handleDiaryImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    showToast('日记导入功能: 将文本解析为聊天记录（开发中）', 'info');
    event.target.value = '';
}

// ===== API 设置 =====
export function openApiModal() {
    const modal = document.getElementById('apiModal');
    if (!modal) return;
    const presetSel = document.getElementById('cfgPreset');
    if (presetSel) {
        presetSel.innerHTML = '<option value="">— 选择预设 —</option>';
        API_PRESETS_LIST.forEach((p, i) => {
            const opt = document.createElement('option');
            opt.value = String(i);
            opt.textContent = p.name;
            presetSel.appendChild(opt);
        });
        presetSel.value = '';
    }
    document.getElementById('cfgProfileName').value = '';
    document.getElementById('cfgEngineType').value = appState.settings.engineType || 'standard';
    document.getElementById('cfgApiKey').value = appState.settings.apiKey || '';
    document.getElementById('cfgApiUrl').value = appState.settings.apiUrl || 'https://api.deepseek.com/chat/completions';
    document.getElementById('cfgModel').value = appState.settings.model || 'deepseek-chat';
    document.getElementById('cfgDifyKey').value = appState.settings.difyApiKey || '';
    document.getElementById('cfgDifyUrl').value = appState.settings.difyApiUrl || 'https://api.dify.ai/v1/chat-messages';
    document.getElementById('cfgImgUrl').value = appState.settings.imgApiUrl || '';
    document.getElementById('cfgImgKey').value = appState.settings.imgApiKey || '';
    document.getElementById('cfgImgModel').value = appState.settings.imgModel || '';
    // CORS 代理
    const proxyCb = document.getElementById('cfgUseCorsProxy');
    if (proxyCb) {
        proxyCb.checked = appState.settings.useCorsProxy || false;
        toggleCorsProxyInput();
    }
    const proxyUrl = document.getElementById('cfgCorsProxyUrl');
    if (proxyUrl) proxyUrl.value = appState.settings.corsProxyUrl || 'https://corsproxy.io/?';
    toggleApiConfigBlocks();
    renderSavedProfiles();
    modal.style.display = 'flex';
}

export function toggleApiConfigBlocks() {
    const mode = document.getElementById('cfgEngineType')?.value;
    const standardBlock = document.getElementById('standardApiConfig');
    const difyBlock = document.getElementById('difyApiConfig');
    if (standardBlock) standardBlock.style.display = mode === 'standard' ? 'block' : 'none';
    if (difyBlock) difyBlock.style.display = mode === 'dify' ? 'block' : 'none';
}

// ===== CORS 代理切换 =====
export function toggleCorsProxyInput() {
    const cb = document.getElementById('cfgUseCorsProxy');
    const input = document.getElementById('cfgCorsProxyUrl');
    if (cb && input) {
        input.style.display = cb.checked ? 'inline-block' : 'none';
    }
}

// ===== 获取经过 CORS 代理的实际请求地址 =====
export function resolveApiUrl(originalUrl) {
    if (!originalUrl) return '';
    const useProxy = document.getElementById('cfgUseCorsProxy')?.checked ||
                     appState.settings.useCorsProxy;
    if (!useProxy) return originalUrl;
    const proxyUrl = document.getElementById('cfgCorsProxyUrl')?.value ||
                     appState.settings.corsProxyUrl || 'https://corsproxy.io/?';
    // 避免重复套代理
    if (originalUrl.startsWith(proxyUrl)) return originalUrl;
    return proxyUrl + encodeURIComponent(originalUrl);
}

export function selectApiPreset() {
    const idx = parseInt(document.getElementById('cfgPreset')?.value);
    if (isNaN(idx) || idx < 0) return;
    const preset = API_PRESETS_LIST[idx];
    if (!preset) return;
    document.getElementById('cfgApiUrl').value = preset.url;
    document.getElementById('cfgModel').value = preset.model;
    const cleanName = preset.name.replace(/^[^\s]+\s/, '');
    document.getElementById('cfgProfileName').value = cleanName;
    showToast(`已选择: ${preset.name}`, 'info', 1500);
}

export function saveApiProfile() {
    const name = document.getElementById('cfgProfileName').value.trim();
    if (!name) return showToast('请输入配置名称', 'warning');
    if (!appState.settings.apiProfiles) appState.settings.apiProfiles = [];
    const profile = {
        id: Date.now().toString(36),
        name: name,
        engineType: document.getElementById('cfgEngineType').value,
        apiKey: document.getElementById('cfgApiKey').value.trim(),
        apiUrl: document.getElementById('cfgApiUrl').value.trim(),
        model: document.getElementById('cfgModel').value.trim(),
        difyApiKey: document.getElementById('cfgDifyKey').value.trim(),
        difyApiUrl: document.getElementById('cfgDifyUrl').value.trim(),
        imgApiUrl: document.getElementById('cfgImgUrl').value.trim(),
        imgApiKey: document.getElementById('cfgImgKey').value.trim(),
        imgModel: document.getElementById('cfgImgModel').value.trim(),
        useCorsProxy: document.getElementById('cfgUseCorsProxy')?.checked || false,
        corsProxyUrl: document.getElementById('cfgCorsProxyUrl')?.value.trim() || 'https://corsproxy.io/?'
    };
    const existIdx = appState.settings.apiProfiles.findIndex(p => p.name === name);
    if (existIdx >= 0) {
        appState.settings.apiProfiles[existIdx] = profile;
        showToast(`配置「${name}」已更新`, 'success');
    } else {
        appState.settings.apiProfiles.push(profile);
        showToast(`配置「${name}」已保存`, 'success');
    }
    appState.settings.activeProfile = name;
    renderSavedProfiles();
}

export function applyApiProfile(profileId) {
    const profiles = appState.settings.apiProfiles || [];
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;
    document.getElementById('cfgEngineType').value = profile.engineType || 'standard';
    document.getElementById('cfgApiKey').value = profile.apiKey || '';
    document.getElementById('cfgApiUrl').value = profile.apiUrl || '';
    document.getElementById('cfgModel').value = profile.model || '';
    document.getElementById('cfgDifyKey').value = profile.difyApiKey || '';
    document.getElementById('cfgDifyUrl').value = profile.difyApiUrl || '';
    document.getElementById('cfgImgUrl').value = profile.imgApiUrl || '';
    document.getElementById('cfgImgKey').value = profile.imgApiKey || '';
    document.getElementById('cfgImgModel').value = profile.imgModel || '';
    document.getElementById('cfgProfileName').value = profile.name;
    toggleApiConfigBlocks();
    showToast(`已加载配置: ${profile.name}`, 'info', 1500);
}

export function deleteApiProfile(profileId) {
    if (!appState.settings.apiProfiles) return;
    const profile = appState.settings.apiProfiles.find(p => p.id === profileId);
    if (!profile) return;
    appState.settings.apiProfiles = appState.settings.apiProfiles.filter(p => p.id !== profileId);
    if (appState.settings.activeProfile === profile.name) {
        appState.settings.activeProfile = null;
    }
    renderSavedProfiles();
    showToast(`配置「${profile.name}」已删除`, 'info');
}

function renderSavedProfiles() {
    const profiles = appState.settings.apiProfiles || [];
    const section = document.getElementById('savedProfilesSection');
    const list = document.getElementById('savedProfilesList');
    if (!section || !list) return;
    if (profiles.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';
    list.innerHTML = '';
    profiles.forEach(p => {
        const item = document.createElement('div');
        item.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 8px;background:var(--bg-card);border-radius:4px;border:1px solid var(--border-color);cursor:pointer;transition:all 0.2s;';
        item.onmouseover = () => item.style.borderColor = 'var(--color-primary)';
        item.onmouseout = () => item.style.borderColor = 'var(--border-color)';
        item.onclick = () => applyApiProfile(p.id);
        item.innerHTML = `
            <span style="flex:1;font-size:0.85rem;font-weight:bold;">${escapeHtml(p.name)}</span>
            <span style="font-size:0.7rem;color:var(--text-muted);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.apiUrl || p.model || '')}</span>
            <button class="list-item-btn del" onclick="event.stopPropagation(); deleteApiProfile('${p.id}')" style="width:22px;height:22px;font-size:0.65rem;">✕</button>
        `;
        list.appendChild(item);
    });
}

export function saveApiSettings() {
    appState.settings.engineType = document.getElementById('cfgEngineType').value;
    appState.settings.apiKey = document.getElementById('cfgApiKey').value.trim();
    appState.settings.apiUrl = normalizeStandardApiUrl(document.getElementById('cfgApiUrl').value);
    appState.settings.model = document.getElementById('cfgModel').value.trim();
    appState.settings.difyApiKey = document.getElementById('cfgDifyKey').value.trim();
    appState.settings.difyApiUrl = document.getElementById('cfgDifyUrl').value.trim();
    appState.settings.imgApiUrl = document.getElementById('cfgImgUrl').value.trim();
    appState.settings.imgApiKey = document.getElementById('cfgImgKey').value.trim();
    appState.settings.imgModel = document.getElementById('cfgImgModel').value.trim();
    appState.settings.useCorsProxy = document.getElementById('cfgUseCorsProxy')?.checked || false;
    appState.settings.corsProxyUrl = document.getElementById('cfgCorsProxyUrl')?.value.trim() || 'https://corsproxy.io/?';
    saveLocalData();
    closeModal('apiModal');
    showToast('API 设置已保存', 'success');
}

// ===== 🔌 测试 API 连接 =====
export async function testStandardApi() {
    const apiKey = document.getElementById('cfgApiKey').value.trim();
    const apiUrl = document.getElementById('cfgApiUrl').value.trim();
    const model = document.getElementById('cfgModel').value.trim();
    if (!apiKey) return showToast('请先填写 API Key', 'warning');
    if (!apiUrl) return showToast('请先填写 API 地址', 'warning');
    if (isOpenCodeRoute(apiUrl, model)) {
        const left = getOpenCodeCooldownRemaining();
        if (left > 0) return showToast(`OpenCode 正在限流冷却中，请约 ${left} 秒后再测试。`, 'warning', 6000);
    }

    const btn = document.querySelector('#standardApiConfig .action-btn.btn-outline');
    const origText = btn?.innerText;
    if (btn) { btn.disabled = true; btn.innerText = '⏳ 测试连接中...'; }
    showToast('正在测试连接，请稍候...', 'info', 10000);

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const useProxy = document.getElementById('cfgUseCorsProxy')?.checked || appState.settings.useCorsProxy;
        const proxyUrl = document.getElementById('cfgCorsProxyUrl')?.value.trim() || appState.settings.corsProxyUrl || 'https://corsproxy.io/?';
        let result;
        try {
            result = await postStandardApiForTest(apiUrl, apiKey, model, useProxy, proxyUrl, controller.signal);
        } catch (err) {
            if (!useProxy && isOpenCodeApiUrl(apiUrl) && isNetworkOrCorsError(err)) {
                result = await postStandardApiForTest(apiUrl, apiKey, model, true, proxyUrl, controller.signal);
                const proxyCb = document.getElementById('cfgUseCorsProxy');
                if (proxyCb) proxyCb.checked = true;
                appState.settings.useCorsProxy = true;
                appState.settings.corsProxyUrl = proxyUrl;
                saveLocalData();
            } else {
                throw err;
            }
        } finally {
            clearTimeout(timeout);
        }

        const { res, data, usedProxy } = result;

        if (res.status === 429) {
            const retryAfter = res.headers.get('retry-after');
            const seconds = setOpenCodeCooldown(retryAfter);
            showToast(`⚠️ OpenCode 触发速率限制${retryAfter ? `，约 ${retryAfter} 秒后重试` : ''}。这通常不是网页配置错误。`, 'warning', 8000);
        } else if (res.ok && isUsableStandardResponse(data)) {
            showToast('✅ API 连接成功！响应正常', 'success', 4000);
        } else if (data.error?.message) {
            showToast('❌ ' + data.error.message, 'error', 7000);
        } else if (res.status === 401 || res.status === 403) {
            showToast('❌ 认证失败 (HTTP ' + res.status + ')，请检查 API Key 是否正确', 'error', 6000);
        } else if (res.status === 404) {
            showToast('❌ 地址不存在 (404)，请检查 API 地址末尾是否包含 /chat/completions', 'error', 7000);
        } else {
            showToast('❌ 服务器返回异常 (HTTP ' + res.status + ')，请检查地址和密钥', 'error', 6000);
        }
    } catch (e) {
        const msg = e.message || String(e);
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('NetworkError')) {
            showToast('❌ 无法连接服务器。可能原因：\n① 页面需通过 Live Server (http://) 打开而非直接双击文件\n② API 地址末尾缺少 /chat/completions\n③ 服务器不支持浏览器跨域(CORS)请求\n请打开浏览器开发者工具(F12) → Console 查看详细错误', 'error', 10000);
        } else if (msg.includes('abort')) {
            showToast('❌ 连接超时（超过15秒），请检查 API 地址是否正确或网络是否通畅', 'error', 7000);
        } else {
            showToast('❌ 连接失败: ' + msg, 'error', 7000);
        }
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = origText || '🔌 测试连接'; }
    }
}

export async function testDifyApi() {
    const apiKey = document.getElementById('cfgDifyKey').value.trim();
    const apiUrl = document.getElementById('cfgDifyUrl').value.trim();
    if (!apiKey) return showToast('请先填写 Dify API Key', 'warning');
    if (!apiUrl) return showToast('请先填写 Dify API 地址', 'warning');
    if (isOpenCodeRoute(apiUrl)) {
        const left = getOpenCodeCooldownRemaining();
        if (left > 0) return showToast(`OpenCode 正在限流冷却中，请约 ${left} 秒后再测试。`, 'warning', 6000);
    }

    const btn = document.querySelector('#difyApiConfig .action-btn.btn-outline');
    const origText = btn?.innerText;
    if (btn) { btn.disabled = true; btn.innerText = '⏳ 测试连接中...'; }
    showToast('正在测试 Dify 连接，请稍候...', 'info', 10000);

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiKey
            },
            body: JSON.stringify({
                inputs: {},
                query: '你好',
                response_mode: 'blocking',
                user: 'tester'
            }),
            signal: controller.signal
        });
        clearTimeout(timeout);

        let data;
        try { data = await res.json(); } catch (_) { data = {}; }

        if (res.ok && (data.answer || data.message)) {
            showToast('✅ Dify 连接成功！响应正常', 'success', 4000);
        } else if (data.message) {
            showToast('❌ ' + data.message, 'error', 7000);
        } else if (res.status === 401 || res.status === 403) {
            showToast('❌ 认证失败 (HTTP ' + res.status + ')，请检查 Dify API Key', 'error', 6000);
        } else {
            showToast('❌ Dify 返回异常 (HTTP ' + res.status + ')，请检查地址和密钥', 'error', 6000);
        }
    } catch (e) {
        const msg = e.message || String(e);
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
            showToast('❌ 无法连接 Dify 服务器。可能原因：\n① 用 Live Server 打开页面而非直接双击文件\n② 服务器不支持跨域(CORS)\n打开 F12 → Console 查看详细错误', 'error', 10000);
        } else if (msg.includes('abort')) {
            showToast('❌ 连接超时（超过15秒）', 'error', 7000);
        } else {
            showToast('❌ 连接失败: ' + msg, 'error', 7000);
        }
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = origText || '🔌 测试连接'; }
    }
}

// ===== 游戏设置 =====
export function openGameSettingsModal() {
    const modal = document.getElementById('gameSettingsModal');
    if (!modal || !gameConfig) return;
    document.getElementById('gsAuthorsNote').value = gameConfig.authorsNote || '';
    modal.style.display = 'flex';
}

export function saveGameSettings() {
    if (!gameConfig) return;
    gameConfig.authorsNote = document.getElementById('gsAuthorsNote').value.trim();
    saveLocalData();
    closeModal('gameSettingsModal');
    showToast('设置已保存', 'success');
}

// ===== 图鉴 =====
export function openLorebookModal() {
    const modal = document.getElementById('lorebookModal');
    if (!modal || !gameConfig) return;
    let text = '';
    if (gameConfig.lorebook) {
        for (let k in gameConfig.lorebook) {
            text += k + ' = ' + gameConfig.lorebook[k] + '\n';
        }
    }
    document.getElementById('lorebookEditor').value = text;
    modal.style.display = 'flex';
}

export function saveLorebook() {
    if (!gameConfig) return;
    const text = document.getElementById('lorebookEditor').value.trim();
    const lb = {};
    text.split('\n').forEach(line => {
        const idx = line.indexOf('=');
        if (idx > 0) {
            const k = line.substring(0, idx).trim();
            const v = line.substring(idx + 1).trim();
            if (k && v) lb[k] = v;
        }
    });
    gameConfig.lorebook = lb;
    saveLocalData();
    closeModal('lorebookModal');
    showToast('图鉴已保存', 'success');
}

// ===== 导出到 window =====
window.openExportModal = openExportModal;
window.toggleAllExportCards = toggleAllExportCards;
window.executeExport = executeExport;
window.importData = importData;
window.exportDiary = exportDiary;
window.triggerImportDiary = triggerImportDiary;
window.handleDiaryImport = handleDiaryImport;
window.openApiModal = openApiModal;
window.toggleApiConfigBlocks = toggleApiConfigBlocks;
window.selectApiPreset = selectApiPreset;
window.saveApiProfile = saveApiProfile;
window.applyApiProfile = applyApiProfile;
window.deleteApiProfile = deleteApiProfile;
window.saveApiSettings = saveApiSettings;
window.testStandardApi = testStandardApi;
window.testDifyApi = testDifyApi;
window.toggleCorsProxyInput = toggleCorsProxyInput;
window.openGameSettingsModal = openGameSettingsModal;
window.saveGameSettings = saveGameSettings;
window.openLorebookModal = openLorebookModal;
window.saveLorebook = saveLorebook;

// Robust import handlers kept separate from the legacy parser above.
async function importDataV2(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
        const data = JSON.parse(await file.text());
        if (!data || !Array.isArray(data.cards) || !data.cards.length) throw new Error('文件中没有可导入的卡片');
        const cardIdMap = new Map();
        let imported = 0;
        data.cards.forEach(source => {
            if (!source || typeof source !== 'object' || !source.name) return;
            const existing = appState.cards.find(card => card.name === source.name && card.storyBackground === source.storyBackground);
            if (existing) {
                if (source.id) cardIdMap.set(source.id, existing.id);
                return;
            }
            const card = { ...source, id: generateId('card'), created: source.created || Date.now(), updated: Date.now() };
            if (source.id) cardIdMap.set(source.id, card.id);
            appState.cards.unshift(card);
            imported++;
        });
        let sessionsImported = 0;
        if (Array.isArray(data.sessions)) data.sessions.forEach(source => {
            const cardId = cardIdMap.get(source?.cardId) || source?.cardId;
            if (!source || !cardId || !appState.cards.some(card => card.id === cardId)) return;
            if (appState.sessions.some(session => session.name === source.name && session.cardId === cardId)) return;
            appState.sessions.unshift({ ...source, id: generateId('sess'), cardId, lastUpdated: source.lastUpdated || Date.now() });
            sessionsImported++;
        });
        await saveLocalData();
        renderLibrary();
        renderSidebarSessions();
        showToast(`导入成功：${imported} 张卡片${sessionsImported ? `，${sessionsImported} 个存档` : ''}`, 'success');
    } catch (error) {
        showToast('导入失败：' + error.message, 'error');
    } finally {
        event.target.value = '';
    }
}

async function handleDiaryImportV2(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!gameConfig) {
        event.target.value = '';
        return showToast('请先进入一个存档再导入日志', 'warning');
    }
    try {
        const imported = [];
        let pendingTime = null;
        const text = (await file.text()).replace(/\r/g, '');
        text.split('\n').forEach(rawLine => {
            let line = rawLine.trim();
            if (!line) return;
            const timeMatch = line.match(/^\[?第?\s*(\d+)\s*天[^\d]*(\d{1,2}):(\d{2})\]?\s*/);
            if (timeMatch) {
                pendingTime = { day: Number(timeMatch[1]), hour: Number(timeMatch[2]), minute: Number(timeMatch[3]) };
                line = line.slice(timeMatch[0].length).trim();
            }
            if (!line) return;
            const match = line.match(/^(玩家|我|AI|DM|旁白|[^:：]{1,30})\s*[:：]\s*(.+)$/);
            const role = match && /^(AI|DM|旁白)$/i.test(match[1]) ? 'assistant' : 'user';
            const content = match ? match[2].trim() : line;
            if (content) imported.push({ role, content, ...(pendingTime ? { worldTime: { ...pendingTime } } : {}) });
        });
        if (!imported.length) throw new Error('没有识别到有效的日志内容');
        gameConfig.history ||= [];
        gameConfig.history.push(...imported);
        gameConfig.lastUpdated = Date.now();
        await saveLocalData();
        window.rebuildChatHistoryUI?.();
        renderSidebarSessions();
        showToast(`日志导入成功：${imported.length} 条消息`, 'success');
    } catch (error) {
        showToast('日志导入失败：' + error.message, 'error');
    } finally {
        event.target.value = '';
    }
}

window.importData = importDataV2;
window.handleDiaryImport = handleDiaryImportV2;
