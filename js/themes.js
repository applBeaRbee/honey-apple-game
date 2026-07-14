// ================= 面板主题系统 =================
// 基于 ACU 可视化前端的主题系统

export const THEMES = [
    { id: 'default', name: '默认经典', icon: '🎨' },
    { id: 'retro', name: '复古羊皮', icon: '📜' },
    { id: 'dark', name: '极夜深空', icon: '🌙' },
    { id: 'modern', name: '现代清爽', icon: '✨' },
    { id: 'forest', name: '森之物语', icon: '🌲' },
    { id: 'ocean', name: '深海幽蓝', icon: '🌊' },
    { id: 'cyber', name: '赛博霓虹', icon: '💜' },
    { id: 'sakura', name: '浅粉落樱', icon: '🌸' },
    { id: 'aurora', name: '极光幻境', icon: '🌌' },
    { id: 'sunset', name: '日落沙滩', icon: '🌅' },
    { id: 'starship', name: '星际迷航', icon: '🚀' }
];

const STORAGE_KEY = 'hat_panel_theme';

export function getCurrentTheme() {
    return localStorage.getItem(STORAGE_KEY) || 'default';
}

export function setTheme(themeId) {
    localStorage.setItem(STORAGE_KEY, themeId);
    applyTheme(themeId);
}

export function applyTheme(themeId) {
    const root = document.documentElement;
    // 移除所有主题类
    THEMES.forEach(t => root.classList.remove('theme-' + t.id));
    // 添加当前主题
    if (themeId && themeId !== 'default') {
        root.classList.add('theme-' + themeId);
    }
    // 保存到设置
    try {
        const { appState } = require('./state.js');
        if (appState?.settings) {
            appState.settings.panelTheme = themeId;
        }
    } catch (_) {}
}

// 初始化主题
export function initTheme() {
    const saved = getCurrentTheme();
    applyTheme(saved);
}

// 打开主题选择模态框
export function openThemeModal() {
    const modal = document.getElementById('themeModal');
    if (!modal) return;
    
    const current = getCurrentTheme();
    const grid = document.getElementById('themeGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    THEMES.forEach(t => {
        const item = document.createElement('div');
        item.className = 'theme-item' + (t.id === current ? ' active' : '');
        // 预览样式
        const previewStyles = {
            'default': 'linear-gradient(135deg, #f5f0e6, #efe6d5)',
            'retro': 'linear-gradient(135deg, #e6e2d3, #d6ccbc)',
            'dark': 'linear-gradient(135deg, #1e1e1e, #2d2d2d)',
            'modern': 'linear-gradient(135deg, #f8f9fa, #e9ecef)',
            'forest': 'linear-gradient(135deg, #e8f5e9, #c8e6c9)',
            'ocean': 'linear-gradient(135deg, #f0f9ff, #bae6fd)',
            'cyber': 'linear-gradient(135deg, #0a0a0a, #1a1a2e)',
            'sakura': 'linear-gradient(135deg, #fff9fb, #fce4ec)',
            'aurora': 'linear-gradient(135deg, #0f172a, #1e293b)',
            'sunset': 'linear-gradient(135deg, #fffaf0, #fef3c7)',
            'starship': 'linear-gradient(135deg, #1e1b4b, #312e81)'
        };
        item.innerHTML = `
            <div class="theme-preview" style="background: ${previewStyles[t.id] || '#f5f0e6'};"></div>
            <div class="theme-name">${t.icon} ${t.name}</div>
        `;
        item.onclick = () => {
            setTheme(t.id);
            document.querySelectorAll('.theme-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            showToast('主题已切换: ' + t.name, 'info', 2000);
        };
        grid.appendChild(item);
    });
    
    modal.style.display = 'flex';
}

// ===== 导出到 window =====
window.openThemeModal = openThemeModal;
window.setTheme = setTheme;
