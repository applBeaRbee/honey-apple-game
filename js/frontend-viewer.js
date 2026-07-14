import { appState, currentSessionId } from './state.js';
import { escapeHtml } from './constants.js';
import { showToast } from './ui.js';
import { renderFrontendAssetsHtml } from './cards.js';
import { saveLocalData } from './storage.js';
import { extractFrontendAssets } from './card-importer.js';

function getCurrentCard() {
    const session = appState.sessions.find(item => item.id === currentSessionId);
    return session ? appState.cards.find(item => item.id === session.cardId) : null;
}

export function openCurrentFrontendModal() {
    const modal = document.getElementById('frontendModal');
    const title = document.getElementById('frontendModalTitle');
    const content = document.getElementById('frontendModalContent');
    if (!modal || !content) return;

    const card = getCurrentCard();
    const assets = getFrontendAssets(card);
    if (!card) {
        showToast('请先进入一个冒险存档', 'warning');
        return;
    }

    if (title) title.textContent = `${card.name || '当前角色卡'} · 内置前端`;
    content.innerHTML = assets.length
        ? renderFrontendAssetsHtml(assets)
        : `<div class="frontend-empty-state"><strong>${escapeHtml(card.name || '当前角色卡')}</strong><span>这张卡没有解析到内置前端。</span></div>`;
    modal.style.display = 'flex';
}

function getFrontendAssets(card) {
    if (!card) return [];
    const rawData = card.rawCardData?.data || card.rawCardData;
    if (rawData?.extensions?.regex_scripts?.length) {
        const extracted = extractFrontendAssets(rawData);
        if (extracted.length) {
            const current = JSON.stringify(card.frontendAssets || []);
            const next = JSON.stringify(extracted);
            if (current !== next) {
                card.frontendAssets = extracted;
                saveLocalData();
            }
            return extracted;
        }
    }
    return Array.isArray(card.frontendAssets) ? card.frontendAssets : [];
}

window.openCurrentFrontendModal = openCurrentFrontendModal;
