// ================= Fusion UI =================
// User-facing controls for worldlines, director cards, codex and uploads.

import { gameConfig } from './state.js';
import { escapeHtml } from './constants.js';
import { showToast, showConfirm } from './ui.js';
import { saveLocalData } from './storage.js';
import { rebuildChatHistoryUI } from './chat.js';
import { renderGamePanelsUI } from './panels.js';
import { updateWorldTimeUI } from './time.js';
import {
    ensureLiyuanData,
    createWorldlineSnapshot,
    restoreWorldlineSnapshot,
    forkWorldlineFromSave,
    createDirectorCard,
    resolveDirectorCard,
    getOpenDirectorCards,
    addCodexLibrary,
    addCodexEntry,
    registerUpload,
    formatWorldState,
    buildLiyuanContext
} from './world-state.js';

function activeSession() {
    return ensureLiyuanData(gameConfig);
}

export function openWorldlineModal() {
    const session = activeSession();
    if (!session) return showToast('请先进入一个冒险存档', 'warning');
    document.getElementById('worldlineModal').style.display = 'flex';
    renderWorldlineUI();
}

export function renderWorldlineUI() {
    const session = activeSession();
    const root = document.getElementById('worldlineContent');
    if (!session || !root) return;
    const current = session.worldline.currentLineId || 'main';
    let html = `<div class="fusion-state-preview"><div class="fusion-state-label">当前事实</div><pre>${escapeHtml(formatWorldState(session.worldState))}</pre></div>`;
    html += '<div class="fusion-line-list">';
    session.worldline.lines.forEach(line => {
        const saves = session.worldline.saves.filter(s => line.saveIds.includes(s.id)).sort((a, b) => a.createdAt - b.createdAt);
        html += `<section class="fusion-line ${line.id === current ? 'active' : ''}"><div class="fusion-line-header"><div><strong>${escapeHtml(line.name)}</strong><span>${line.id === current ? '当前世界线' : '分支世界线'}</span></div><em>${saves.length} 个节点</em></div>`;
        if (!saves.length) html += '<div class="fusion-empty">尚无手动存档，先钉下一个剧情节点。</div>';
        saves.forEach(save => {
            html += `<div class="fusion-save-item ${save.id === session.worldState.currentSaveId ? 'current' : ''}"><div class="fusion-save-main"><strong>${escapeHtml(save.name)}</strong><span>第 ${save.turnIndex} 轮 · ${new Date(save.createdAt).toLocaleString('zh-CN')}${save.auto ? ' · 自动' : ''}</span>${save.note ? `<p>${escapeHtml(save.note)}</p>` : ''}</div><div class="fusion-save-actions"><button onclick="restoreFusionSave('${save.id}')">回档</button><button onclick="forkFusionSave('${save.id}')">分支</button></div></div>`;
        });
        html += '</section>';
    });
    html += '</div>';
    root.innerHTML = html;
}

export function createManualWorldlineSave() {
    const session = activeSession();
    if (!session) return;
    const nameInput = document.getElementById('worldlineSaveName');
    const save = createWorldlineSnapshot(nameInput?.value || '', session, { note: '玩家手动存档' });
    if (nameInput) nameInput.value = '';
    saveLocalData();
    renderWorldlineUI();
    showToast(`🌿 已钉下「${save.name}」`, 'success');
}

export async function restoreFusionSave(saveId) {
    const session = activeSession();
    if (!session) return;
    if (!await showConfirm('回到这个节点后，当前后续剧情会被截断。确定回档吗？')) return;
    if (!restoreWorldlineSnapshot(saveId, session)) return showToast('存档不存在', 'error');
    saveLocalData();
    rebuildChatHistoryUI();
    renderGamePanelsUI();
    updateWorldTimeUI();
    renderWorldlineUI();
    showToast('已回到该世界线节点', 'success');
}

export async function forkFusionSave(saveId) {
    const name = prompt('给新世界线起个名字：', '新的可能');
    if (name === null) return;
    const line = forkWorldlineFromSave(saveId, name, activeSession());
    if (!line) return showToast('分支失败：找不到存档', 'error');
    saveLocalData();
    renderWorldlineUI();
    showToast(`已切换到「${line.name}」`, 'success');
}

export function openDirectorModal() {
    const session = activeSession();
    if (!session) return showToast('请先进入一个冒险存档', 'warning');
    document.getElementById('directorModal').style.display = 'flex';
    renderDirectorUI();
}

export function renderDirectorUI() {
    const session = activeSession();
    const root = document.getElementById('directorContent');
    if (!session || !root) return;
    const cards = [...(session.directorCards || [])].reverse();
    if (!cards.length) {
        root.innerHTML = '<div class="fusion-empty large">还没有决策卡。对 AI 说“给我几个选项”或在剧情出现重大分歧时，系统会把选择留在这里。</div>';
        return;
    }
    root.innerHTML = cards.map(card => {
        const options = (card.options || []).map((option, index) => {
            const text = typeof option === 'string' ? option : (option.label || option.title || option.text || JSON.stringify(option));
            return `<button class="director-option" ${card.status !== 'open' ? 'disabled' : ''} onclick="resolveFusionChoice('${card.id}', ${index})"><span>${index + 1}</span>${escapeHtml(text)}</button>`;
        }).join('');
        return `<article class="director-card-ui ${card.status !== 'open' ? 'resolved' : ''}"><div class="director-card-kicker">${card.status === 'open' ? '待你拍板' : '已留痕'}</div><h4>${escapeHtml(card.title)}</h4><p>${escapeHtml(card.body || '剧情在此处停笔，等你决定下一步。')}</p>${card.status === 'open' ? `<div class="director-options">${options}</div>${card.freeform ? `<div class="director-freeform"><input id="freeform_${card.id}" class="form-input" placeholder="或者写下你自己的走法"><button onclick="resolveFusionFreeform('${card.id}')">采用</button></div>` : ''}` : `<div class="director-answer">你的选择：${escapeHtml(card.answer || '未记录')}</div>`}<div class="director-card-time">第 ${card.turnIndex || 0} 轮 · ${new Date(card.createdAt).toLocaleString('zh-CN')}</div></article>`;
    }).join('');
}

export function resolveFusionChoice(cardId, index) {
    const session = activeSession();
    const card = session?.directorCards.find(c => c.id === cardId);
    if (!card) return;
    const option = card.options?.[index];
    const answer = typeof option === 'string' ? option : (option?.label || option?.title || option?.text || JSON.stringify(option));
    resolveDirectorCard(cardId, answer, session);
    saveLocalData();
    renderDirectorUI();
    injectDirectorAnswer(answer);
}

export function resolveFusionFreeform(cardId) {
    const input = document.getElementById('freeform_' + cardId);
    const answer = input?.value.trim();
    if (!answer) return showToast('请写下你的走法', 'warning');
    resolveDirectorCard(cardId, answer, activeSession());
    saveLocalData();
    renderDirectorUI();
    injectDirectorAnswer(answer);
}

function injectDirectorAnswer(answer) {
    const input = document.getElementById('chatInput');
    if (input) {
        input.value = answer;
        input.focus();
    }
    showToast('选择已留痕，按发送继续剧情', 'success');
}

export function openCodexModal() {
    const session = activeSession();
    if (!session) return showToast('请先进入一个冒险存档', 'warning');
    document.getElementById('codexModal').style.display = 'flex';
    renderCodexUI();
}

export function renderCodexUI() {
    const session = activeSession();
    const root = document.getElementById('codexContent');
    if (!session || !root) return;
    if (!session.codexLibraries.length) {
        root.innerHTML = '<div class="fusion-empty large">还没有独立知识库。角色卡世界书已经作为检索资产自动接入。</div>';
        return;
    }
    root.innerHTML = session.codexLibraries.map(lib => `<section class="codex-library"><div class="codex-library-header"><div><strong>${escapeHtml(lib.name)}</strong><span>${lib.mounted ? '已挂载' : '未挂载'}</span></div><em>${lib.entries.length} 条</em></div>${lib.entries.length ? lib.entries.map(entry => `<div class="codex-entry"><strong>${escapeHtml(entry.title)}</strong><p>${escapeHtml(entry.content)}</p><small>${(entry.tags || []).map(escapeHtml).join(' · ')}</small></div>`).join('') : '<div class="fusion-empty">空库</div>'}<div class="codex-add"><input id="codexTitle_${lib.id}" class="form-input" placeholder="条目标题"><input id="codexText_${lib.id}" class="form-input" placeholder="条目内容"><button onclick="addCodexEntryFromUI('${lib.id}')">写入</button></div></section>`).join('');
}

export function createCodexLibraryFromUI() {
    const input = document.getElementById('codexLibraryName');
    const name = input?.value.trim();
    if (!name) return showToast('请输入知识库名', 'warning');
    addCodexLibrary(name, activeSession());
    if (input) input.value = '';
    saveLocalData();
    renderCodexUI();
    showToast(`📚 已创建知识库「${name}」`, 'success');
}

export function addCodexEntryFromUI(libraryId) {
    const title = document.getElementById('codexTitle_' + libraryId)?.value.trim();
    const content = document.getElementById('codexText_' + libraryId)?.value.trim();
    if (!title || !content) return showToast('标题和内容不能为空', 'warning');
    addCodexEntry(libraryId, { title, content }, activeSession());
    saveLocalData();
    renderCodexUI();
}

export function openUploadsModal() {
    const session = activeSession();
    if (!session) return showToast('请先进入一个冒险存档', 'warning');
    document.getElementById('uploadsModal').style.display = 'flex';
    renderUploadsUI();
}

export function renderUploadsUI() {
    const session = activeSession();
    const root = document.getElementById('uploadsContent');
    if (!session || !root) return;
    root.innerHTML = session.uploads.length ? session.uploads.slice().reverse().map(file => `<div class="upload-entry"><div><strong>${escapeHtml(file.name)}</strong><span>${escapeHtml(file.type || '素材')}</span></div><p>${escapeHtml(file.url || file.note || '已登记为剧情素材')}</p><small>${new Date(file.createdAt).toLocaleString('zh-CN')}</small></div>`).join('') : '<div class="fusion-empty large">素材库为空。这里保存的是图片、地图、笔记等引用，不会把大文件塞进聊天上下文。</div>';
}

export function registerUploadFromUI() {
    const nameInput = document.getElementById('uploadName');
    const urlInput = document.getElementById('uploadUrl');
    const name = nameInput?.value.trim();
    if (!name) return showToast('请输入素材名', 'warning');
    registerUpload({ name, url: urlInput?.value.trim() || '' }, activeSession());
    nameInput.value = '';
    urlInput.value = '';
    saveLocalData();
    renderUploadsUI();
}

window.openWorldlineModal = openWorldlineModal;
window.renderWorldlineUI = renderWorldlineUI;
window.createManualWorldlineSave = createManualWorldlineSave;
window.restoreFusionSave = restoreFusionSave;
window.forkFusionSave = forkFusionSave;
window.openDirectorModal = openDirectorModal;
window.renderDirectorUI = renderDirectorUI;
window.resolveFusionChoice = resolveFusionChoice;
window.resolveFusionFreeform = resolveFusionFreeform;
window.openCodexModal = openCodexModal;
window.renderCodexUI = renderCodexUI;
window.createCodexLibraryFromUI = createCodexLibraryFromUI;
window.addCodexEntryFromUI = addCodexEntryFromUI;
window.openUploadsModal = openUploadsModal;
window.renderUploadsUI = renderUploadsUI;
window.registerUploadFromUI = registerUploadFromUI;
window.getOpenDirectorCards = getOpenDirectorCards;
window.buildLiyuanContext = buildLiyuanContext;
