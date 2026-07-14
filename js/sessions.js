// ================= 会话管理 =================
import { appState, currentSessionId, gameConfig, currentUser, isLocalFile, isCloudAvailable, setCurrentSessionId, setGameConfig } from './state.js';
import { escapeHtml } from './constants.js';
import { showToast, showConfirm } from './ui.js';
import { saveLocalData } from './storage.js';
import { renderLibrary } from './cards.js';
import { updateWorldTimeUI, formatTimeShort } from './time.js';
import { updateAmbientEnvironment } from './ambient.js';
import { renderGamePanelsUI, drawRelationWeb, drawMapCanvas } from './panels.js';
import { rebuildChatHistoryUI } from './chat.js';
import { checkMailRedDot } from './mailbox.js';
import { renderActionBar } from './actions.js';
import { buildMemoryDbFromCard } from './card-importer.js';

export function renderSidebarSessions() {
    const list = document.getElementById('sessionListUI');
    if (!list) return;
    list.innerHTML = '<div class="session-title-bar">📜 冒险存档</div>';
    appState.sessions.forEach(s => {
        const card = appState.cards.find(c => c.id === s.cardId);
        const isActive = s.id === currentSessionId;
        const d = document.createElement('div');
        d.className = `session-item${isActive ? ' active' : ''}`;
        d.onclick = () => resumeSession(s.id);
        const time = s.lastUpdated ? new Date(s.lastUpdated).toLocaleString('zh-CN') : '';
        d.innerHTML = `
            <div class="session-item-name">${escapeHtml(s.name)}</div>
            <div class="session-item-card">${escapeHtml(card?.name || '未知卡片')}</div>
            <div class="session-item-time">${escapeHtml(time)}</div>
            <button class="session-del-btn" onclick="event.stopPropagation(); deleteSession('${s.id}')">✕</button>`;
        list.appendChild(d);
    });
}

export function updateUserUI() {
    const avatarEl = document.getElementById('uiAvatar');
    const nameEl = document.getElementById('uiUsername');
    const badgeEl = document.getElementById('uiSyncBadge');
    if (!avatarEl || !nameEl || !badgeEl) return;
    const isLocal = isLocalFile || !isCloudAvailable;
    if (currentUser) {
        avatarEl.innerText = currentUser.charAt(0).toUpperCase();
        nameEl.innerText = currentUser;
        badgeEl.innerText = isLocal ? "💾 本地多账号" : "☁️ 云端同步";
        badgeEl.className = "cloud-sync-badge";
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

export function openSessionSetup(cardId) {
    const card = appState.cards.find(c => c.id === cardId);
    if (!card) return;
    const modal = document.getElementById('sessionSetupModal');
    if (!modal) return;
    document.getElementById('setupCardId').value = card.id;
    document.getElementById('setupCardInfo').innerHTML =
        `<strong>${escapeHtml(card.avatar||'📜')} ${escapeHtml(card.name)}</strong><br><span style="color:var(--text-muted);font-size:0.8rem;">${escapeHtml(card.description||'')}</span>`;
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
        appState.sessions = appState.sessions.filter(s => s.id !== id);
        saveLocalData();
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
