// ================= 行动栏系统 =================
import { gameConfig } from './state.js';
import { saveLocalData } from './storage.js';
import { rebuildChatHistoryUI } from './chat.js';
import { renderGamePanelsUI } from './panels.js';
import { showToast, showConfirm } from './ui.js';
import { updateAmbientEnvironment } from './ambient.js';
import { updateWorldTimeUI } from './time.js';
import { renderSidebarSessions } from './sessions.js';

function cloneData(value) {
    return JSON.parse(JSON.stringify(value ?? null));
}

export function createStateSnapshot(label = 'turn') {
    if (!gameConfig) return null;
    return {
        label,
        createdAt: Date.now(),
        panels: cloneData(gameConfig.panels || {}),
        memoryDb: cloneData(gameConfig.memoryDb || {}),
        backgroundMemory: gameConfig.backgroundMemory || '',
        worldTime: cloneData(gameConfig.worldTime || { day: 1, hour: 8, minute: 0 }),
        ambient: cloneData(gameConfig.ambient || { time: '', weather: '' }),
        mailbox: cloneData(gameConfig.mailbox || []),
        gallery: cloneData(gameConfig.gallery || []),
        worldState: cloneData(gameConfig.worldState || null),
        memoryTiers: cloneData(gameConfig.memoryTiers || null),
        actions: cloneData(gameConfig.history?.[gameConfig.history.length - 1]?.actions || [])
    };
}

export function pushUndoSnapshot(label = 'manual') {
    if (!gameConfig) return null;
    const snapshot = createStateSnapshot(label);
    if (!snapshot) return null;
    if (!Array.isArray(gameConfig.undoStack)) gameConfig.undoStack = [];
    gameConfig.undoStack.push(snapshot);
    if (gameConfig.undoStack.length > 20) gameConfig.undoStack = gameConfig.undoStack.slice(-20);
    return snapshot;
}

export function restoreStateSnapshot(snapshot) {
    if (!gameConfig || !snapshot) return false;
    gameConfig.panels = cloneData(snapshot.panels || {});
    gameConfig.memoryDb = cloneData(snapshot.memoryDb || {});
    gameConfig.backgroundMemory = snapshot.backgroundMemory || '';
    gameConfig.worldTime = cloneData(snapshot.worldTime || { day: 1, hour: 8, minute: 0 });
    gameConfig.ambient = cloneData(snapshot.ambient || { time: '', weather: '' });
    gameConfig.mailbox = cloneData(snapshot.mailbox || []);
    gameConfig.gallery = cloneData(snapshot.gallery || []);
    if (snapshot.worldState) gameConfig.worldState = cloneData(snapshot.worldState);
    if (snapshot.memoryTiers) gameConfig.memoryTiers = cloneData(snapshot.memoryTiers);
    updateAmbientEnvironment(gameConfig.ambient);
    updateWorldTimeUI();
    return true;
}

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

function findLastTurnSnapshot() {
    const history = gameConfig?.history || [];
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i]?.role === 'user' && history[i].preTurnSnapshot) {
            return { index: i, snapshot: history[i].preTurnSnapshot };
        }
    }
    return null;
}

function refreshAfterUndo(actions = []) {
    saveLocalData();
    rebuildChatHistoryUI();
    renderGamePanelsUI();
    renderActionBar(actions);
    renderSidebarSessions();
}

export async function undoLastAction() {
    if (!gameConfig?.history || gameConfig.history.length < 2) return;
    const lastTurn = findLastTurnSnapshot();
    const lastSync = Array.isArray(gameConfig.undoStack) ? gameConfig.undoStack[gameConfig.undoStack.length - 1] : null;

    if (lastSync && (!lastTurn || lastSync.createdAt > lastTurn.snapshot.createdAt)) {
        const restore = await showConfirm('检测到最近一步是强制洞察/重构。是否同步回溯面板、数据库、时间和环境？');
        if (restore) {
            restoreStateSnapshot(lastSync);
            gameConfig.undoStack.pop();
            refreshAfterUndo(lastSync.actions || []);
            showToast('已回溯强制洞察造成的状态变化', 'success');
        }
        return;
    }

    const restoreState = lastTurn ? await showConfirm('是否同时回溯面板、记忆数据库、世界时间和环境？取消则只撤回聊天。') : false;
    if (lastTurn) {
        gameConfig.history = gameConfig.history.slice(0, lastTurn.index);
        if (restoreState) restoreStateSnapshot(lastTurn.snapshot);
    } else {
        gameConfig.history.pop();
        gameConfig.history.pop();
    }
    const latestActions = gameConfig.history?.length ? (gameConfig.history[gameConfig.history.length - 1].actions || []) : [];
    refreshAfterUndo(latestActions);
    showToast(restoreState ? '已完整回溯上一步' : '已撤回上一轮聊天', 'info');
}

// ===== 导出到 window =====
window.renderActionBar = renderActionBar;
window.quickAction = quickAction;
window.undoLastAction = undoLastAction;
