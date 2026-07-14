// ================= 面板主题系统 =================
// 基于 ACU 可视化前端的主题系统

export const THEMES = [
    { id: 'default', name: '白瓷朱砂', icon: '🍎', desc: '克制、明亮、适合长期阅读' },
    { id: 'sakura', name: '浅粉落樱', icon: '🌸', desc: '樱花粉渐变与柔和玻璃面板' },
    { id: 'aurora', name: '极光幻境', icon: '🌌', desc: '深色极光、适合夜间沉浸' },
    { id: 'modern', name: '现代清爽', icon: '✨', desc: '高对比信息面板与轻量控件' },
    { id: 'dark', name: '极夜深空', icon: '🌙', desc: '低亮度阅读与深色控制台' },
    { id: 'forest', name: '森之物语', icon: '🌲', desc: '自然绿、安静柔和' },
    { id: 'ocean', name: '深海幽蓝', icon: '🌊', desc: '冷静蓝绿、适合探索地图' },
    { id: 'sunset', name: '日落沙滩', icon: '🌅', desc: '暖橙粉、轻松剧情氛围' },
    { id: 'starship', name: '星际迷航', icon: '🚀', desc: '科幻深蓝与霓虹边界' },
    { id: 'retro', name: '复古羊皮', icon: '📜', desc: '旧卷轴风格，适合奇幻档案' },
    { id: 'cyber', name: '赛博霓虹', icon: '💜', desc: '高饱和霓虹实验主题' }
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
    root.dataset.theme = themeId || 'default';
    // 添加当前主题
    if (themeId && themeId !== 'default') {
        root.classList.add('theme-' + themeId);
    }
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
        const previewStyles = THEME_PREVIEWS;
        item.innerHTML = `
            <div class="theme-preview" style="background: ${previewStyles[t.id] || previewStyles.default};"></div>
            <div class="theme-name"><span>${t.icon}</span>${t.name}</div>
            <div class="theme-desc">${t.desc || ''}</div>
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

const THEME_PREVIEWS = {
    default: 'linear-gradient(135deg, #fffdfa 0%, #f4eee6 58%, #b74d32 100%)',
    sakura: 'linear-gradient(135deg, #fff7fb 0%, #ffd7e8 48%, #a86bd1 100%)',
    aurora: 'linear-gradient(135deg, #101827 0%, #215c72 45%, #b26be8 100%)',
    modern: 'linear-gradient(135deg, #ffffff 0%, #e9edf2 56%, #43708b 100%)',
    dark: 'linear-gradient(135deg, #111111 0%, #2b2522 50%, #d15f3d 100%)',
    forest: 'linear-gradient(135deg, #f5fbf1 0%, #cfe8c2 55%, #4f7e46 100%)',
    ocean: 'linear-gradient(135deg, #f2fbff 0%, #b9e7f0 52%, #2d7f9d 100%)',
    sunset: 'linear-gradient(135deg, #fff7e8 0%, #ffd39c 45%, #ee8aac 100%)',
    starship: 'linear-gradient(135deg, #14143a 0%, #3447b3 45%, #20d5da 100%)',
    retro: 'linear-gradient(135deg, #f3ead7 0%, #d7c4a4 58%, #7b6041 100%)',
    cyber: 'linear-gradient(135deg, #06070b 0%, #39126d 46%, #00ffd1 100%)'
};

// ===== 导出到 window =====
window.openThemeModal = openThemeModal;
window.setTheme = setTheme;
