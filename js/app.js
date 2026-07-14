// ================= 应用入口 =================
// 导入所有模块以注册其功能
import { appState, gameConfig, currentUser } from './state.js';
import { loadLocalData, initCloudBase, saveLocalData } from './storage.js';
import { renderLibrary, createDefaultCard, openCardEditor, saveCardEditor, deleteCard, duplicateCard } from './cards.js';
import { renderSidebarSessions, updateUserUI, switchMainView, toggleSidebar, switchMobileGameTab, openSessionSetup, startSessionFromSetup, resumeSession, deleteSession, openSessionEditModal } from './sessions.js';
import { renderGamePanelsUI, switchGamePanelTab, deleteCustomPanel, addListItem, removeListItem, openAddPropertyModal, confirmAddProperty, openEditPropertyModal, confirmEditProperty, deleteProperty, openEditListItemModal, confirmEditListItem, openAddCustomPanelModal, confirmAddCustomPanel, openLegendaryItem } from './panels.js';
import { rebuildChatHistoryUI, formatMsgContent } from './chat.js';
import { sendToAI, forceSyncPanels } from './ai.js';
import { openMemoryModal, buildMemoryContext, getMemoryDb } from './memory.js';
import { initTheme, openThemeModal, getCurrentTheme } from './themes.js';
import { doLogin, doRegister, guestMode, openAuthModal, openRegisterModal } from './auth.js';
import { openGalleryModal } from './gallery.js';
import { openMailboxModal, sendMail, checkMailRedDot } from './mailbox.js';
import { renderActionBar, quickAction, undoLastAction } from './actions.js';
import { rollD20, rollDice } from './dice.js';
import { setupVoiceEvents } from './voice.js';
import { updateAmbientEnvironment } from './ambient.js';
import { openExportModal, toggleAllExportCards, executeExport, importData, exportDiary, triggerImportDiary, handleDiaryImport, openApiModal, toggleApiConfigBlocks, saveApiSettings, testStandardApi, testDifyApi, openGameSettingsModal, saveGameSettings, openLorebookModal, saveLorebook } from './export-import.js';
import { updateWorldTimeUI, animateTimePass, addWorldTime, formatTimeDisplay, formatTimeShort } from './time.js';

// ===== 初始化 =====
window.onload = async function() {
    await initCloudBase();
    await loadLocalData();

    // 确保有默认卡片
    if (appState.cards.length === 0) {
        appState.cards.push(createDefaultCard());
        await saveLocalData();
    }

    renderLibrary();
    renderSidebarSessions();
    updateUserUI();
    setupVoiceEvents();

    if (window.innerWidth <= 850) {
        const mobileNav = document.getElementById('mobileGameNav');
        if (mobileNav) mobileNav.style.display = 'flex';
        switchMobileGameTab('chat');
    }

    if (gameConfig) updateWorldTimeUI();
    
    // 初始化主题
    initTheme();

    window.addEventListener('resize', () => {
        const mobileNav = document.getElementById('mobileGameNav');
        if (mobileNav) {
            if (window.innerWidth <= 850) {
                mobileNav.style.display = 'flex';
            } else {
                mobileNav.style.display = 'none';
            }
        }
    });

    console.log('🍎 蜂蜜苹果酒馆 v2.0 - 模块化重构完成');
    console.log(`📚 ${appState.cards.length} 张卡片, ${appState.sessions.length} 个存档`);
};

// 导出关键模块到 window 以便调试
window.__appState = appState;
window.__modules = {
    cards: { renderLibrary, createDefaultCard },
    sessions: { renderSidebarSessions, switchMainView },
    memory: { buildMemoryContext, getMemoryDb, openMemoryModal },
    time: { formatTimeShort, addWorldTime }
};
