// ================= 信箱系统 =================
import { gameConfig, isMailSending, setIsMailSending } from './state.js';
import { escapeHtml } from './constants.js';
import { showToast, closeModal } from './ui.js';

let currentMailNpc = null;

export function openMailboxModal() {
    const modal = document.getElementById('mailboxModal');
    if (!modal || !gameConfig) return;
    const sidebar = document.getElementById('mailSidebarUI');
    if (!sidebar) return;
    sidebar.innerHTML = '';
    const npcs = new Set();
    (gameConfig.mailbox || []).forEach(m => {
        if (m.from) npcs.add(m.from);
        if (m.to) npcs.add(m.to);
        if (m.npc) npcs.add(m.npc);
    });
    // Also add known NPCs from panel data
    if (gameConfig.panels) {
        for (let k in gameConfig.panels) {
            if (/关系|社交/.test(k) && gameConfig.panels[k]?.nodes) {
                gameConfig.panels[k].nodes.forEach(n => {
                    if (n.type !== '主角') npcs.add(n.name);
                });
            }
        }
    }
    if (npcs.size === 0) {
        sidebar.innerHTML = '<div style="color:var(--text-muted);padding:12px;text-align:center;">暂无联系人</div>';
    } else {
        npcs.forEach(npc => {
            const el = document.createElement('div');
            el.innerText = `📬 ${npc}`;
            el.style.cssText = 'padding:8px 12px;cursor:pointer;border-left:3px solid transparent;transition:all 0.2s;';
            el.onmouseover = () => el.style.background = 'rgba(211,118,92,0.1)';
            el.onmouseout = () => el.style.background = '';
            el.onclick = () => selectMailNpc(npc);
            sidebar.appendChild(el);
        });
    }
    document.getElementById('mailChatScroll').innerHTML =
        '<div style="color:var(--text-muted);text-align:center;padding:20px;">选择一个联系人开始通信</div>';
    modal.style.display = 'flex';
    checkMailRedDot();
}

function selectMailNpc(npc) {
    currentMailNpc = npc;
    document.querySelectorAll('#mailSidebarUI > div').forEach(el => {
        el.style.background = el.innerText.includes(npc) ? 'var(--bg-card)' : '';
        el.style.borderLeftColor = el.innerText.includes(npc) ? 'var(--color-primary)' : 'transparent';
    });
    const scroll = document.getElementById('mailChatScroll');
    if (!scroll) return;
    scroll.innerHTML = `<div style="padding:8px;font-weight:bold;color:var(--text-sub);border-bottom:1px solid var(--border-color);margin-bottom:8px;">✉️ 与 ${escapeHtml(npc)} 的通信</div>`;
    (gameConfig.mailbox || []).filter(m => m.from === npc || m.npc === npc || m.to === npc).forEach(m => {
        scroll.innerHTML +=
            `<div style="margin-bottom:6px;padding:8px 10px;background:${m.from === gameConfig.charName ? 'var(--bg-chat-user)' : 'var(--bg-panel)'};border-radius:4px;border:1px solid var(--border-color);"><div style="font-size:0.7rem;color:var(--text-muted);">${escapeHtml(m.from||'')} → ${escapeHtml(m.to||'')}</div><div>${escapeHtml(m.text||m.content||'')}</div></div>`;
    });
    scroll.scrollTop = scroll.scrollHeight;
}

export function sendMail() {
    const input = document.getElementById('mailReplyInput');
    if (!input || !currentMailNpc || !input.value.trim()) return;
    if (!gameConfig) return;
    gameConfig.mailbox.push({
        from: gameConfig.charName || '玩家',
        to: currentMailNpc,
        npc: currentMailNpc,
        text: input.value.trim(),
        time: new Date().toLocaleTimeString(),
        read: true
    });
    input.value = '';
    selectMailNpc(currentMailNpc);
    // Trigger AI mail response
    if (typeof window.sendToAI === 'function') {
        window.sendToAI({ npc: currentMailNpc, text: `回复给 ${currentMailNpc}：${input.value}` });
    }
}

export function checkMailRedDot() {
    const btn = document.getElementById('btnMailbox');
    if (!btn || !gameConfig) return;
    const hasUnread = (gameConfig.mailbox || []).some(m => m.read === false);
    btn.classList.toggle('active', hasUnread);
}

// ===== 导出到 window =====
window.openMailboxModal = openMailboxModal;
window.sendMail = sendMail;
window.checkMailRedDot = checkMailRedDot;
