// ================= 画廊系统 =================
import { gameConfig } from './state.js';
import { escapeHtml } from './constants.js';
import { showToast, closeModal } from './ui.js';
import { preloadTavernImage } from './image-gen.js';

export function openGalleryModal() {
    const modal = document.getElementById('galleryModal');
    if (!modal) return;
    const grid = document.getElementById('galleryGridUI');
    if (!grid) return;
    grid.innerHTML = '';
    if (!gameConfig?.gallery?.length) {
        grid.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:30px;">暂无收藏</div>';
    } else {
        gameConfig.gallery.forEach(g => {
            const item = document.createElement('div');
            item.className = 'gallery-item';
            item.innerHTML =
                `<img src="https://image.pollinations.ai/prompt/${encodeURIComponent(g.prompt || g.name)}?width=200&height=200&seed=${Math.random()}" alt="${escapeHtml(g.name)}" loading="lazy"><div class="gallery-item-name">${escapeHtml(g.name)}</div>`;
            const prompt = g.prompt || g.name;
            item.onclick = () => {
                const container = document.getElementById('cgCutinContainer');
                const img = document.getElementById('cgCutinImg');
                document.getElementById('cgCutinText').innerText = g.name;
                container.style.display = 'flex';
                preloadTavernImage(img, 'cgCutinContainer', prompt, 'portrait');
            };
            grid.appendChild(item);
        });
    }
    modal.style.display = 'flex';
}

export function checkGalleryRedDot() {
    // Could add red dot indicator on gallery button
}

// ===== 导出到 window =====
window.openGalleryModal = openGalleryModal;
