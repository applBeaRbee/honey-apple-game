// ================= 聊天 UI =================
import { gameConfig } from './state.js';
import { escapeHtml } from './constants.js';
import { formatTimeShort } from './time.js';

export function rebuildChatHistoryUI() {
    const history = document.getElementById('chatHistoryUI');
    if (!history) return;
    history.innerHTML = '';
    if (!gameConfig?.history) return;
    gameConfig.history.forEach((msg, idx) => {
        const isUser = msg.role === 'user';
        const avatar = isUser ? '👤' : '🍎';
        const row = document.createElement('div');
        row.className = 'chat-row' + (isUser ? ' row-user' : '');
        const content = isUser ? escapeHtml(msg.content) : formatMsgContent(msg.content || msg.rawData || '');
        row.innerHTML = `<div class="chat-avatar ${isUser ? '' : 'dm-avatar'}">${avatar}</div><div class="chat-message ${isUser ? 'msg-user' : 'msg-narrator'}">${content}</div>`;
        history.appendChild(row);
    });
    history.scrollTo({ top: history.scrollHeight, behavior: 'smooth' });
}

export function formatMsgContent(text) {
    if (!text) return '';
    let t = escapeHtml(text);
    // 处理代码块
    t = t.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
    // 处理行内代码
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    // 处理粗体
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // 处理斜体
    t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // 处理 think 块
    t = t.replace(/<details class="think-box">?/g, '<details class="think-box">');
    // 换行
    t = t.replace(/\n/g, '<br>');
    return t;
}

// ===== 导出到 window =====
window.rebuildChatHistoryUI = rebuildChatHistoryUI;
