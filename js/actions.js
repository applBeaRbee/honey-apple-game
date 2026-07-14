// ================= 行动栏系统 =================
import { gameConfig } from './state.js';
import { escapeHtml } from './constants.js';
import { saveLocalData } from './storage.js';
import { rebuildChatHistoryUI } from './chat.js';
import { renderGamePanelsUI } from './panels.js';
import { showToast } from './ui.js';

export function renderActionBar(actions) {
    const bar = document.getElementById('actionBar');
    if (!bar) return;
    if (!actions || !actions.length) {
        bar.style.display = 'none';
        return;
    }
    bar.innerHTML = '';
    actions.forEach(a => {
        const text = typeof a === 'string' ? a : (a.text || a.name || '');
        const chip = document.createElement('div');
        chip.className = 'action-chip';
        chip.innerText = text;
        chip.onclick = () => quickAction(text);
        bar.appendChild(chip);
    });
    bar.style.display = 'flex';
}

export function quickAction(text) {
    const input = document.getElementById('chatInput');
    if (input) {
        input.value = text;
        const sendBtn = document.getElementById('btnSend');
        if (sendBtn && !sendBtn.disabled) {
            if (typeof window.sendToAI === 'function') window.sendToAI();
        }
    }
}

export function undoLastAction() {
    if (!gameConfig?.history || gameConfig.history.length < 2) return;
    gameConfig.history.pop();
    gameConfig.history.pop();
    saveLocalData();
    rebuildChatHistoryUI();
    renderGamePanelsUI();
    showToast('已撤销上一步', 'info');
}

// ===== 导出到 window =====
window.renderActionBar = renderActionBar;
window.quickAction = quickAction;
window.undoLastAction = undoLastAction;
