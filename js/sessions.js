// ================= 会话管理 =================
import { appState, currentSessionId, gameConfig, currentUser, isLocalFile, isCloudAvailable, setCurrentSessionId, setGameConfig } from './state.js';
import { escapeHtml } from './constants.js';
import { showToast, showConfirm } from './ui.js';
import { saveLocalData, getLastCloudSaveTime, deleteSessionEverywhere } from './storage.js';
import { renderLibrary, renderAvatarHtml } from './cards.js';
import { updateWorldTimeUI, formatTimeShort } from './time.js';
import { updateAmbientEnvironment } from './ambient.js';
import { renderGamePanelsUI, drawRelationWeb, drawMapCanvas } from './panels.js';
import { rebuildChatHistoryUI } from './chat.js';
import { checkMailRedDot } from './mailbox.js';
import { renderActionBar } from './actions.js';
import { buildMemoryDbFromCard } from './card-importer.js';
import { ensureLiyuanData, createWorldlineSnapshot, updateMemoryTiers } from './world-state.js';

export function renderSidebarSessions(query = document.getElementById('sessionSearchInput')?.value || '') {
    const list = document.getElementById('sessionListUI');
    if (!list) return;
    const normalizedQuery = String(query || '').trim().toLowerCase();
    const sorted = [...appState.sessions].sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
    const sessions = sorted.filter(s => {
        if (!normalizedQuery) return true;
        const card = appState.cards.find(c => c.id === s.cardId);
        return `${s.name} ${card?.name || ''}`.toLowerCase().includes(normalizedQuery);
    });
    const count = document.getElementById('sessionCountUI');
    if (count) count.textContent = String(appState.sessions.length);
    list.innerHTML = '';
    if (!sessions.length) {
        list.innerHTML = `<div class="session-empty">${normalizedQuery ? '没有匹配的存档' : '还没有冒险存档'}</div>`;
        renderSidebarContext();
        return;
    }
    sessions.forEach(s => {
        const card = appState.cards.find(c => c.id === s.cardId);
        const avatar = s.avatar || s.avatarDataUrl || card?.avatarDataUrl || card?.avatar || '📜';
        const isActive = s.id === currentSessionId;
        const d = document.createElement('div');
        d.className = `session-item${isActive ? ' active' : ''}`;
        d.onclick = () => resumeSession(s.id);
        const time = s.lastUpdated ? formatSessionTime(s.lastUpdated) : '';
        const progress = Array.isArray(s.history) ? s.history.length : 0;
        d.innerHTML = `
            <div class="session-item-avatar">${renderAvatarHtml(avatar, '42px')}</div>
            <div class="session-item-main">
                <div class="session-item-name">${escapeHtml(s.name)}</div>
                <div class="session-item-card">${escapeHtml(card?.name || '未知卡片')}</div>
            </div>
            <div class="session-item-meta"><span>${progress ? `第 ${progress} 回合` : '尚未开始'}</span><time>${escapeHtml(time)}</time></div>
            <button class="session-del-btn" onclick="event.stopPropagation(); deleteSession('${s.id}')">✕</button>`;
        list.appendChild(d);
    });
    renderSidebarContext();
}

function formatSessionTime(timestamp) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function renderSidebarContext() {
    const root = document.getElementById('sidebarContextUI');
    if (!root) return;
    const session = appState.sessions.find(item => item.id === currentSessionId);
    const card = session ? appState.cards.find(item => item.id === session.cardId) : null;
    if (!session || !card) {
        root.innerHTML = '<div class="sidebar-section-label">当前冒险</div><div class="sidebar-context-empty">从卡片库进入一个世界，<br>这里会显示当前进度。</div>';
        return;
    }
    const avatar = session.avatar || session.avatarDataUrl || card.avatarDataUrl || card.avatar || '📜';
    root.innerHTML = `<div class="sidebar-section-label">当前冒险</div>
        <div class="sidebar-current-card">
            <div class="sidebar-current-avatar">${renderAvatarHtml(avatar, '34px')}</div>
            <div class="sidebar-current-mark">✦</div>
            <div class="sidebar-current-copy"><strong>${escapeHtml(session.name)}</strong><span>${escapeHtml(card.name)}</span></div>
            <button class="sidebar-current-open" onclick="resumeSession('${session.id}')" title="回到当前冒险">↗</button>
        </div>`;
}

export function openCurrentSessionSetup() {
    const card = currentSessionId ? appState.cards.find(item => item.id === appState.sessions.find(s => s.id === currentSessionId)?.cardId) : appState.cards[0];
    if (card && typeof window.openSessionSetup === 'function') window.openSessionSetup(card.id);
    else showToast('请先导入或创建一张剧本卡', 'warning');
}

export function updateUserUI() {
    const avatarEl = document.getElementById('uiAvatar');
    const nameEl = document.getElementById('uiUsername');
    const badgeEl = document.getElementById('uiSyncBadge');
    if (!avatarEl || !nameEl || !badgeEl) return;
    const isLocal = isLocalFile || !isCloudAvailable;
    const lastCloudSave = getLastCloudSaveTime();
    const status = document.body.dataset.cloudSaveStatus || (isLocal ? 'local' : (lastCloudSave ? 'saved' : 'syncing'));
    const statusText = status === 'saved' ? '云端已保存' : status === 'syncing' ? '同步中' : '仅本地保存';
    badgeEl.dataset.status = status;
    const displayStatusText = status === 'saved' ? '\u4e91\u7aef\u5df2\u4fdd\u5b58' : status === 'syncing' ? '\u540c\u6b65\u4e2d' : '\u4ec5\u672c\u5730\u4fdd\u5b58';
    badgeEl.title = displayStatusText;
    badgeEl.title = status === 'error' ? '云端保存失败，当前内容已保存在本地' : statusText;
    if (currentUser) {
        avatarEl.innerText = currentUser.charAt(0).toUpperCase();
        nameEl.innerText = currentUser;
        badgeEl.innerText = isLocal ? "💾 本地多账号" : "☁️ 云端同步";
        badgeEl.className = "cloud-sync-badge";
        badgeEl.innerText = displayStatusText;
        if (isLocal) {
            badgeEl.style.borderColor = "var(--color-info)";
            badgeEl.style.color = "var(--color-info)";
        } else {
            badgeEl.style.borderColor = "";
            badgeEl.style.color = "";
        }
    } else {
        avatarEl.innerText = "G";
        nameEl.innerText = "游客身份";
        badgeEl.innerText = isLocal ? "离线沙盒" : "云端就绪";
        badgeEl.className = "cloud-sync-badge offline";
        badgeEl.innerText = displayStatusText;
    }
}

export function switchMainView(view) {
    const libView = document.getElementById('libraryView');
    const gameView = document.getElementById('gameView');
    if (libView) libView.style.display = view === 'library' ? 'flex' : 'none';
    if (gameView) gameView.style.display = view === 'game' ? 'flex' : 'none';
    if (view === 'library') {
        setCurrentSessionId(null);
        setGameConfig(null);
        renderSidebarSessions();
    }
}

export function toggleSidebar() {
    document.getElementById('globalSidebar')?.classList.toggle('open');
    document.getElementById('sidebarBackdrop')?.classList.toggle('open');
}

export function toggleGameToolsMenu(event) {
    event?.stopPropagation();
    const menu = document.getElementById('topToolsMenu');
    const toggle = document.querySelector('.top-more-toggle');
    if (!menu) return;
    const open = menu.classList.toggle('open');
    toggle?.setAttribute('aria-expanded', String(open));
}

export function openSessionSetup(cardId) {
    const card = appState.cards.find(c => c.id === cardId);
    if (!card) return;
    const modal = document.getElementById('sessionSetupModal');
    if (!modal) return;
    const avatar = card.avatarDataUrl || card.avatar || '📜';
    document.getElementById('setupCardId').value = card.id;
    document.getElementById('setupCardInfo').innerHTML =
        `<strong>${escapeHtml(card.avatar||'📜')} ${escapeHtml(card.name)}</strong><br><span style="color:var(--text-muted);font-size:0.8rem;">${escapeHtml(card.description||'')}</span>`;
    document.getElementById('setupCardInfo').innerHTML =
        `<div class="setup-card-preview">${renderAvatarHtml(avatar, '58px')}<div><strong>${escapeHtml(card.name)}</strong><br><span style="color:var(--text-muted);font-size:0.8rem;">${escapeHtml(card.description||'')}</span></div></div>`;
    document.getElementById('setupCharName').value = card.defaultCharName || '';
    document.getElementById('setupCharInfo').value = card.defaultCharInfo || '';
    modal.style.display = 'flex';
}

export function startSessionFromSetup() {
    const cardId = document.getElementById('setupCardId').value;
    const card = appState.cards.find(c => c.id === cardId);
    if (!card) return;
    const charName = document.getElementById('setupCharName').value.trim() || card.defaultCharName || '无名氏';
    let panels = {};
    try { panels = JSON.parse((card.panelTemplate || '{}').replace(/\{charName\}/g, charName)); } catch (e) {
        panels = { "人物核心": { "姓名": charName } };
    }
    const session = {
        id: 'sess_' + Date.now(),
        cardId: card.id,
        avatar: card.avatarDataUrl || card.avatar || '📜',
        avatarDataUrl: card.avatarDataUrl || (String(card.avatar || '').startsWith('data:') ? card.avatar : null),
        name: `${charName} 的冒险`,
        panels: panels,
        originalPanels: JSON.parse(JSON.stringify(panels)),
        customPanels: [],
        history: [],
        lorebook: JSON.parse(JSON.stringify(card.lorebook || {})),
        worldSetting: card.worldSetting || '',
        storyBackground: card.storyBackground || '',
        charName: charName,
        charInfo: document.getElementById('setupCharInfo').value.trim(),
        systemPromptText: card.systemPrompt || '',
        authorsNote: card.authorsNote || '',
        openingText: (card.openingText || "").replace(/\{charName\}/g, charName),
        lastUpdated: Date.now(),
        mailbox: [],
        gallery: [],
        ambient: { time: "", weather: "" },
        difyConversationId: "",
        worldTime: { day: 1, hour: 8, minute: 0 },
        backgroundMemory: '',
        memoryDb: buildMemoryDbFromCard(card)
    };
    ensureLiyuanData(session);
    createWorldlineSnapshot('初始节点', session, { note: '冒险开始', auto: false });
    
    appState.sessions.unshift(session);
    saveLocalData();
    document.getElementById('sessionSetupModal').style.display = 'none';
    renderSidebarSessions();
    resumeSession(session.id);
}

export function resumeSession(sessionId) {
    const session = appState.sessions.find(s => s.id === sessionId);
    if (!session) return;
    setCurrentSessionId(sessionId);
    setGameConfig(session);
    if (!gameConfig.customPanels) gameConfig.customPanels = [];
    if (!gameConfig.mailbox) gameConfig.mailbox = [];
    if (!gameConfig.gallery) gameConfig.gallery = [];
    if (!gameConfig.difyConversationId) gameConfig.difyConversationId = "";
    if (!gameConfig.worldTime) gameConfig.worldTime = { day: 1, hour: 8, minute: 0 };
    if (!gameConfig.backgroundMemory) gameConfig.backgroundMemory = '';
    if (!gameConfig.memoryDb) gameConfig.memoryDb = { characters: {}, locations: {}, events: [], facts: [], quests: [] };
    ensureLiyuanData(gameConfig);
    updateMemoryTiers(gameConfig);
    document.getElementById('gameTitle').innerText = gameConfig.name;
    switchMainView('game');
    renderSidebarSessions();
    renderGamePanelsUI();
    rebuildChatHistoryUI();
    checkMailRedDot();
    updateAmbientEnvironment(gameConfig.ambient || { time: "", weather: "" });
    updateWorldTimeUI();
    const acts = gameConfig.history?.length ? (gameConfig.history[gameConfig.history.length - 1].actions || []) : [];
    renderActionBar(acts);
    if (window.innerWidth <= 850) switchMobileGameTab('chat');
}

export async function deleteSession(id) {
    if (await showConfirm("确定删除此存档？")) {
        const deletedSession = appState.sessions.find(s => s.id === id) || (gameConfig?.id === id ? gameConfig : null);
        appState.sessions = appState.sessions.filter(s => s.id !== id);
        await deleteSessionEverywhere(deletedSession || id);
        await saveLocalData();
        renderSidebarSessions();
        if (currentSessionId === id) {
            setCurrentSessionId(null);
            setGameConfig(null);
            switchMainView('library');
        }
    }
}

export function switchMobileGameTab(tab) {
    const mainArea = document.getElementById('gameMainArea');
    if (!mainArea) return;
    const btnChat = document.getElementById('mbtn-chat');
    const btnPanel = document.getElementById('mbtn-panel');
    if (btnChat) btnChat.className = tab === 'chat' ? 'active' : '';
    if (btnPanel) btnPanel.className = tab === 'panel' ? 'active' : '';
    mainArea.className = 'game-main-area show-' + tab;
    if (tab === 'panel' && gameConfig && gameConfig.panels) {
        for (let k in gameConfig.panels) {
            const el = document.getElementById('gpanel-' + k);
            if (el?.classList.contains('active')) {
                if (/关系|社交/.test(k)) requestAnimationFrame(() => drawRelationWeb(k));
                if (/地图|区域/.test(k)) requestAnimationFrame(() => drawMapCanvas(k));
            }
        }
    }
}

export function openSessionEditModal() {
    if (typeof window.openSessionCardEditor === 'function') {
        window.openSessionCardEditor();
        return;
    }
    // Placeholder for session editing if needed
    showToast("会话编辑功能开发中", "info");
}

// ===== 导出到 window =====
window.switchMainView = switchMainView;
window.toggleSidebar = toggleSidebar;
window.switchMobileGameTab = switchMobileGameTab;
window.openSessionSetup = openSessionSetup;
window.startSessionFromSetup = startSessionFromSetup;
window.resumeSession = resumeSession;
window.deleteSession = deleteSession;
window.renderSidebarSessions = renderSidebarSessions;
window.updateUserUI = updateUserUI;
window.openSessionEditModal = openSessionEditModal;
window.openCurrentSessionSetup = openCurrentSessionSetup;
window.toggleGameToolsMenu = toggleGameToolsMenu;

window.addEventListener('hat-cloud-save-status', event => {
    document.body.dataset.cloudSaveStatus = event.detail?.status || 'local';
    updateUserUI();
});

document.addEventListener('click', event => {
    const menu = document.getElementById('topToolsMenu');
    if (!menu?.classList.contains('open')) return;
    if (!event.target.closest('.top-more-wrap')) {
        menu.classList.remove('open');
        document.querySelector('.top-more-toggle')?.setAttribute('aria-expanded', 'false');
    }
});
