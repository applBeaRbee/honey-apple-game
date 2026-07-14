// ================= 常量 & 工具函数 =================

export const DEFAULT_SETTINGS = {
    engineType: "standard",
    apiKey: "",
    apiUrl: "https://api.deepseek.com/chat/completions",
    model: "deepseek-chat",
    difyApiKey: "",
    difyApiUrl: "https://api.dify.ai/v1/chat-messages",
    imgApiUrl: "",
    imgApiKey: "",
    imgModel: "",
    useCorsProxy: false,
    corsProxyUrl: "https://corsproxy.io/?"
};

export function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export function safeParseJSON(str) {
    if (!str) return null;
    const regex = /={3,}\s*DATA\s*={3,}/i;
    if (regex.test(str)) {
        try {
            const parts = str.split(regex);
            if (parts.length >= 2) return JSON.parse(parts[parts.length - 1].trim());
        } catch (e) { /* fall through */ }
    }
    try {
        const match = str.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
    } catch (e) { /* fall through */ }
    return null;
}

export function generateId(prefix = 'id') {
    return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

// 面板类型检测
export function isRelationPanel(name) {
    return /关系|社交|羁绊/.test(name);
}

export function isMapPanel(name) {
    return /地图|区域/.test(name);
}

export function isInventoryPanel(name) {
    return /包裹|行囊|背包|物品/.test(name);
}

export function isQuestPanel(name) {
    return /任务|日记|日志/.test(name);
}

export function isCharacterPanel(name) {
    return /人物|角色|核心/.test(name);
}

// ===== 预设 API 配置 =====
export const API_PRESETS = [
    { name: '🔮 DeepSeek 官方', url: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat', note: 'DeepSeek 官方 API' },
    { name: '🧠 OpenCode Zen', url: 'https://opencode.ai/zen/v1/chat/completions', model: 'deepseek-v4-flash', note: 'OpenCode Zen 网关' },
    { name: '🌊 轨迹流动', url: 'https://guiji.ai/v1/chat/completions', model: 'deepseek-chat', note: '轨迹流动 API' },
    { name: '🔄 OpenRouter', url: 'https://openrouter.ai/api/v1/chat/completions', model: 'openrouter/auto', note: '多模型路由' },
    { name: '🔌 SiliconFlow', url: 'https://api.siliconflow.cn/v1/chat/completions', model: 'deepseek-v3', note: '硅基流动' },
    { name: '☁️ 腾讯混元', url: 'https://api.hunyuan.cloud.tencent.com/v1/chat/completions', model: 'hunyuan', note: '腾讯混元大模型' },
    { name: '⚡ 自定义', url: '', model: '', note: '手动填写' }
];

// 默认的 apiProfiles 结构
export const DEFAULT_API_PROFILES = {
    profiles: [],
    activeProfile: null
};

// ===== CORS 代理解析（供 ai.js 等模块使用）=====
export function resolveApiUrl(originalUrl, settings) {
    if (!originalUrl) return '';
    if (!settings?.useCorsProxy) return originalUrl;
    const proxyUrl = settings.corsProxyUrl || 'https://corsproxy.io/?';
    if (originalUrl.startsWith(proxyUrl)) return originalUrl;
    return proxyUrl + encodeURIComponent(originalUrl);
}
