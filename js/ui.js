// ================= UI 工具函数 =================
import { escapeHtml } from './constants.js';

// Toast 通知
export function showToast(msg, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    toast.innerHTML = `${icons[type] || 'ℹ️'} ${escapeHtml(msg)}`;
    if (type === 'error') toast.style.borderLeftColor = 'var(--color-danger)';
    else if (type === 'success') toast.style.borderLeftColor = 'var(--color-success)';
    else if (type === 'warning') toast.style.borderLeftColor = '#f39c12';
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300); }, duration);
}

// 自定义确认对话框
export function showConfirm(msg) {
    return new Promise((resolve) => {
        const modal = document.getElementById('customConfirmModal');
        const msgEl = document.getElementById('customConfirmMsg');
        const btnYes = document.getElementById('btnConfirmYes');
        const btnNo = document.getElementById('btnConfirmNo');
        if (!modal || !msgEl || !btnYes || !btnNo) { resolve(false); return; }
        msgEl.innerHTML = escapeHtml(msg).replace(/\n/g, '<br>');
        modal.style.display = 'flex';
        const cleanup = () => { modal.style.display = 'none';
            btnYes.onclick = null;
            btnNo.onclick = null; };
        btnYes.onclick = () => { cleanup();
            resolve(true); };
        btnNo.onclick = () => { cleanup();
            resolve(false); };
    });
}

// 关闭模态框
export function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
}

// 打开模态框
export function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex';
}

// 显示加载状态
export function showLoading(elementId, text = '加载中...') {
    const el = document.getElementById(elementId);
    if (el) {
        el.disabled = true;
        el.dataset.originalText = el.innerText;
        el.innerText = text;
    }
}

// 移除加载状态
export function hideLoading(elementId) {
    const el = document.getElementById(elementId);
    if (el && el.dataset.originalText) {
        el.disabled = false;
        el.innerText = el.dataset.originalText;
        delete el.dataset.originalText;
    }
}

// ===== 导出到 window（支持 onclick 事件） =====
window.showToast = showToast;
window.showConfirm = showConfirm;
window.closeModal = closeModal;
