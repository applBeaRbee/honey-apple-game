// ================= Mailbox =================
import { gameConfig, isMailSending, setIsMailSending } from './state.js';
import { escapeHtml } from './constants.js';
import { showToast } from './ui.js';
import { saveLocalData } from './storage.js';

let currentMailNpc = null;

function getMailboxMessages(npc) {
    return (gameConfig?.mailbox || []).filter(message =>
        message.from === npc || message.npc === npc || message.to === npc
    );
}

function collectMailContacts() {
    const contacts = new Set();
    (gameConfig?.mailbox || []).forEach(message => {
        [message.from, message.to, message.npc].forEach(value => {
            if (value) contacts.add(String(value));
        });
    });
    Object.entries(gameConfig?.panels || {}).forEach(([name, panel]) => {
        if (!/关系|社交/.test(name) || !Array.isArray(panel?.nodes)) return;
        panel.nodes.forEach(node => { if (node?.name && node.type !== '主角') contacts.add(String(node.name)); });
    });
    return [...contacts].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function renderMailConversation(npc) {
    const scroll = document.getElementById('mailChatScroll');
    if (!scroll) return;
    const messages = getMailboxMessages(npc);
    scroll.innerHTML = `<div class="mail-thread-title">与 ${escapeHtml(npc)} 的通信</div>`;
    if (!messages.length) {
        scroll.innerHTML += '<div class="mail-empty">暂无消息，写下第一封信吧。</div>';
    }
    messages.forEach(message => {
        const outgoing = message.from === gameConfig.charName;
        const time = message.time || '';
        scroll.insertAdjacentHTML('beforeend', `
            <div class="mail-message ${outgoing ? 'outgoing' : 'incoming'}">
                <div class="mail-message-meta">${escapeHtml(message.from || '')} → ${escapeHtml(message.to || npc)}${time ? ` · ${escapeHtml(time)}` : ''}</div>
                <div>${escapeHtml(message.text || message.content || '')}</div>
            </div>`);
    });
    scroll.scrollTop = scroll.scrollHeight;
}

function selectMailNpc(npc) {
    currentMailNpc = npc;
    document.querySelectorAll('#mailSidebarUI [data-mail-npc]').forEach(element => {
        const active = element.dataset.mailNpc === npc;
        element.classList.toggle('active', active);
    });
    getMailboxMessages(npc).forEach(message => {
        if (message.from === npc || message.npc === npc) message.read = true;
    });
    renderMailConversation(npc);
    checkMailRedDot();
    saveLocalData();
}

export function openMailboxModal() {
    const modal = document.getElementById('mailboxModal');
    const sidebar = document.getElementById('mailSidebarUI');
    if (!modal || !sidebar || !gameConfig) return;
    const contacts = collectMailContacts();
    sidebar.innerHTML = contacts.length ? '' : '<div class="mail-empty">暂无联系人</div>';
    contacts.forEach(npc => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'mail-contact';
        item.dataset.mailNpc = npc;
        item.innerHTML = `<span class="mail-contact-icon">✉</span><span>${escapeHtml(npc)}</span>`;
        item.onclick = () => selectMailNpc(npc);
        sidebar.appendChild(item);
    });
    const first = currentMailNpc && contacts.includes(currentMailNpc) ? currentMailNpc : contacts[0];
    if (first) selectMailNpc(first);
    else document.getElementById('mailChatScroll').innerHTML = '<div class="mail-empty">选择一个联系人开始通信</div>';
    modal.style.display = 'flex';
    checkMailRedDot();
}

export function sendMail() {
    const input = document.getElementById('mailReplyInput');
    const text = input?.value.trim();
    if (!gameConfig || !input || !currentMailNpc || !text) return;
    if (isMailSending) return showToast('正在等待上一封回信，请稍候', 'warning');
    setIsMailSending(true);
    gameConfig.mailbox ||= [];
    gameConfig.mailbox.push({
        id: `mail_${Date.now().toString(36)}`,
        from: gameConfig.charName || '玩家',
        to: currentMailNpc,
        npc: currentMailNpc,
        text,
        time: new Date().toLocaleTimeString('zh-CN'),
        read: true
    });
    input.value = '';
    renderMailConversation(currentMailNpc);
    saveLocalData();
    const request = typeof window.sendToAI === 'function'
        ? window.sendToAI({ npc: currentMailNpc, text })
        : Promise.resolve();
    Promise.resolve(request).catch(() => {}).finally(() => setIsMailSending(false));
}

export function checkMailRedDot() {
    const btn = document.getElementById('btnMailbox');
    if (!btn || !gameConfig) return;
    btn.classList.toggle('active', (gameConfig.mailbox || []).some(message => message.read === false));
}

window.openMailboxModal = openMailboxModal;
window.sendMail = sendMail;
window.checkMailRedDot = checkMailRedDot;
