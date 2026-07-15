// ================= Data persistence =================
import { appState, currentSessionId, gameConfig, isLocalFile, isCloudAvailable, tcbApp, tcbAuth, tcbDb, getStorageKey, getCloudKey, setCloudAvailable, setTcbApp, setTcbAuth, setTcbDb, setAppState } from './state.js';
import { DEFAULT_SETTINGS } from './constants.js';
import { showToast } from './ui.js';

// Save immutable snapshots in order. A slow older cloud request must not
// overwrite a newer conversation state.
let cloudSaveChain = Promise.resolve();

export function getLastCloudSaveTime() {
    const key = getStorageKey();
    return Number(localStorage.getItem('hat_last_cloud_save_' + key) || 0);
}

function publishCloudSaveStatus(status, detail = '') {
    window.dispatchEvent(new CustomEvent('hat-cloud-save-status', {
        detail: { status, detail, at: Date.now() }
    }));
}

export async function initCloudBase() {
    if (isLocalFile) {
        console.warn('file:// mode: cloud storage is disabled.');
        return;
    }
    try {
        if (typeof cloudbase !== 'undefined') {
            const app = cloudbase.init({ env: 'applbear-d7gnceygaed0ac177' });
            setTcbApp(app);
            setTcbAuth(app.auth({ persistence: 'local' }));
            setTcbDb(app.database());
            setCloudAvailable(true);
        } else {
            console.warn('CloudBase SDK is unavailable; using local storage.');
            setCloudAvailable(false);
        }
    } catch (e) {
        console.warn('CloudBase initialization failed; using local storage.', e);
        setCloudAvailable(false);
    }
}

export function normalizeCloudDocData(res) {
    if (!res) return null;
    if (Array.isArray(res.data)) return res.data[0] || null;
    if (res.data && typeof res.data === 'object') return res.data;
    return null;
}

function applyStoredData(parsed) {
    setAppState({
        cards: parsed.cards || [],
        sessions: parsed.sessions || [],
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) }
    });
}

function sessionBackupKey(sessionId) {
    return `hat_session_backup_${getStorageKey()}_${sessionId}`;
}

function buildSessionRecovery(session) {
    if (!session?.id) return null;
    const fields = [
        'id', 'cardId', 'name', 'avatar', 'avatarDataUrl', 'lastUpdated',
        'history', 'panels', 'originalPanels', 'customPanels', 'backgroundMemory',
        'memoryDb', 'memoryTiers', 'worldTime', 'ambient', 'mailbox', 'gallery',
        'worldState', 'worldline', 'undoStack', 'lorebook', 'difyConversationId',
        'authorsNote'
    ];
    const recovery = {};
    fields.forEach(field => {
        if (session[field] !== undefined) recovery[field] = session[field];
    });
    return recovery;
}

function saveSessionBackups(sessions = []) {
    sessions.forEach(session => {
        if (!session?.id) return;
        const recovery = buildSessionRecovery(session);
        if (!recovery) return;
        try {
            localStorage.setItem(sessionBackupKey(session.id), JSON.stringify({
                session: recovery,
                updatedAt: Number(session.lastUpdated || Date.now())
            }));
        } catch (error) {
            console.warn('Session backup failed:', error);
        }
    });
}

function liveSessionKey(sessionId) {
    return `hat_live_session_${getStorageKey()}_${sessionId}`;
}

function buildLiveSessionSnapshot(session) {
    if (!session?.id) return null;
    const fields = [
        'id', 'cardId', 'name', 'avatar', 'avatarDataUrl', 'lastUpdated',
        'history', 'panels', 'originalPanels', 'customPanels', 'backgroundMemory',
        'memoryDb', 'memoryTiers', 'worldTime', 'ambient', 'mailbox', 'gallery',
        'worldState', 'worldline', 'undoStack', 'lorebook', 'difyConversationId',
        'authorsNote', 'charName', 'charInfo', 'worldSetting', 'storyBackground', 'systemPromptText'
    ];
    const recovery = {};
    fields.forEach(field => {
        if (session[field] !== undefined) recovery[field] = session[field];
    });
    return recovery;
}

function saveLiveSessionSnapshot(session) {
    const recovery = buildLiveSessionSnapshot(session);
    if (!recovery) return;
    try {
        localStorage.setItem(liveSessionKey(session.id), JSON.stringify({
            session: recovery,
            updatedAt: Number(session.lastUpdated || Date.now())
        }));
    } catch (error) {
        console.warn('Live session snapshot failed:', error);
    }
}

function mergeLiveSessionSnapshots(sessions = []) {
    const byId = new Map(sessions.filter(Boolean).map(session => [session.id, session]));
    const prefix = `hat_live_session_${getStorageKey()}_`;
    for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (!key?.startsWith(prefix)) continue;
        try {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            const backup = JSON.parse(raw);
            const session = backup?.session;
            if (!session?.id) continue;
            const existing = byId.get(session.id);
            if (!existing || Number(backup.updatedAt || session.lastUpdated || 0) >= Number(existing.lastUpdated || 0)) {
                byId.set(session.id, session);
            }
        } catch (_) {}
    }
    return [...byId.values()];
}

function restoreSessionBackups(sessions = []) {
    const byId = new Map(sessions.filter(Boolean).map(session => [session.id, session]));
    const prefix = `hat_session_backup_${getStorageKey()}_`;
    for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (!key?.startsWith(prefix)) continue;
        try {
            const backup = JSON.parse(localStorage.getItem(key) || '');
            const session = backup?.session;
            if (!session?.id) continue;
            const existing = byId.get(session.id);
            if (!existing || Number(backup.updatedAt || session.lastUpdated || 0) > Number(existing.lastUpdated || 0)) {
                byId.set(session.id, session);
            }
        } catch (_) {
            // Ignore damaged backups and continue restoring other sessions.
        }
    }
    return [...byId.values()];
}

export async function loadLocalData() {
    let loadedFromCloud = false;
    const key = getStorageKey();
    const localSaved = localStorage.getItem('hat_data_' + key);
    const localUpdatedAt = Number(localStorage.getItem('hat_data_meta_' + key) || 0);
    let localParsed = null;
    if (localSaved) {
        try { localParsed = JSON.parse(localSaved); } catch (e) { localParsed = null; }
    }
    if (isCloudAvailable && tcbAuth && tcbDb) {
        try {
            if (!tcbAuth.hasLoginState()) await tcbAuth.anonymousAuthProvider().signIn();
            const res = await tcbDb.collection('hat_saves').doc(getCloudKey()).get();
            const doc = normalizeCloudDocData(res);
            if (doc?.gameData && Number(doc.updateTime || 0) >= localUpdatedAt) {
                applyStoredData(doc.gameData);
                loadedFromCloud = true;
            }
        } catch (e) {
            console.error('Cloud load failed:', e);
            showToast('云端读取失败，将继续保留重试能力：' + (e.message || String(e)), 'warning', 6000);
        }
    }
    if (!loadedFromCloud) {
        if (localParsed) {
            localParsed.sessions = mergeLiveSessionSnapshots(restoreSessionBackups(localParsed.sessions || []));
            applyStoredData(localParsed);
        } else {
            setAppState({ cards: [], sessions: [], settings: { ...DEFAULT_SETTINGS } });
        }
    }
    if (loadedFromCloud) {
        const recoveredSessions = mergeLiveSessionSnapshots(restoreSessionBackups(appState.sessions || []));
        if (recoveredSessions.some((session, index) => session !== appState.sessions[index]) || recoveredSessions.length !== appState.sessions.length) {
            appState.sessions = recoveredSessions;
        }
    }
    return true;
}

function snapshotAppState() {
    try {
        return JSON.parse(JSON.stringify(appState));
    } catch (e) {
        console.error('Could not snapshot app state:', e);
        return null;
    }
}

function stripHugeText(value, limit = 12000) {
    if (typeof value !== 'string') return value;
    return value.length > limit ? value.slice(0, limit) : value;
}

function slimFrontendAsset(asset) {
    if (!asset || typeof asset !== 'object') return asset;
    const slim = {
        id: asset.id,
        name: asset.name,
        disabled: asset.disabled,
        markdownOnly: asset.markdownOnly,
        sourceUrl: asset.sourceUrl,
        placement: Array.isArray(asset.placement) ? asset.placement : []
    };
    if (typeof asset.html === 'string' && asset.html.length <= 12000) {
        slim.html = asset.html;
    }
    return slim;
}

function slimHistoryEntry(entry) {
    if (!entry || typeof entry !== 'object') return entry;
    const slim = { ...entry };
    delete slim.rawData;
    delete slim.preTurnSnapshot;
    delete slim.panelsSnapshot;
    delete slim.memorySnapshot;
    if (typeof slim.content === 'string') slim.content = stripHugeText(slim.content, 8000);
    return slim;
}

function slimCardForCloud(card) {
    if (!card || typeof card !== 'object') return card;
    const slim = { ...card };
    delete slim.rawCardData;
    if (typeof slim.avatarDataUrl === 'string' && slim.avatarDataUrl.length > 12000) {
        slim.avatarDataUrl = null;
    }
    if (Array.isArray(slim.frontendAssets)) {
        slim.frontendAssets = slim.frontendAssets.map(slimFrontendAsset);
    }
    if (slim.lorebook && typeof slim.lorebook === 'object') {
        Object.keys(slim.lorebook).forEach(key => {
            slim.lorebook[key] = stripHugeText(String(slim.lorebook[key] || ''), 2000);
        });
    }
    slim.systemPrompt = stripHugeText(slim.systemPrompt, 12000);
    slim.openingText = stripHugeText(slim.openingText, 8000);
    slim.storyBackground = stripHugeText(slim.storyBackground, 8000);
    return slim;
}

function slimSessionForCloud(session) {
    if (!session || typeof session !== 'object') return session;
    const slim = { ...session };
    slim.history = Array.isArray(session.history) ? session.history.map(slimHistoryEntry) : [];
    slim.cards = undefined;
    slim.preTurnSnapshot = undefined;
    if (typeof slim.backgroundMemory === 'string') slim.backgroundMemory = stripHugeText(slim.backgroundMemory, 6000);
    if (typeof slim.storyBackground === 'string') slim.storyBackground = stripHugeText(slim.storyBackground, 8000);
    if (typeof slim.systemPromptText === 'string') slim.systemPromptText = stripHugeText(slim.systemPromptText, 12000);
    if (typeof slim.openingText === 'string') slim.openingText = stripHugeText(slim.openingText, 8000);
    if (typeof slim.charInfo === 'string') slim.charInfo = stripHugeText(slim.charInfo, 6000);
    if (typeof slim.worldSetting === 'string') slim.worldSetting = stripHugeText(slim.worldSetting, 6000);
    return slim;
}

function buildCloudSnapshot(snapshot) {
    const cloud = JSON.parse(JSON.stringify(snapshot));
    cloud.cards = Array.isArray(cloud.cards) ? cloud.cards.map(slimCardForCloud) : [];
    cloud.sessions = Array.isArray(cloud.sessions) ? cloud.sessions.map(slimSessionForCloud) : [];
    return cloud;
}

export async function saveLocalData() {
    const key = getStorageKey();
    const snapshot = snapshotAppState();
    if (!snapshot) return;
    const activeSession = snapshot.sessions?.find(session => session.id === currentSessionId) || gameConfig;
    if (activeSession) saveLiveSessionSnapshot(activeSession);

    try {
        localStorage.setItem('hat_data_' + key, JSON.stringify(snapshot));
        localStorage.setItem('hat_data_meta_' + key, String(Date.now()));
    } catch (e) {
        console.error('Local save failed:', e);
    }

    if (!(isCloudAvailable && tcbAuth && tcbDb)) {
        publishCloudSaveStatus('local');
        return;
    }
    const cloudSnapshot = buildCloudSnapshot(snapshot);
    const payload = { gameData: cloudSnapshot, updateTime: Date.now() };
    const cloudKey = getCloudKey();
    publishCloudSaveStatus('syncing');
    cloudSaveChain = cloudSaveChain.catch(() => {}).then(async () => {
        if (!isCloudAvailable || !tcbAuth || !tcbDb) return;
        try {
            if (!tcbAuth.hasLoginState()) await tcbAuth.anonymousAuthProvider().signIn();
            await tcbDb.collection('hat_saves').doc(cloudKey).set(payload);
            if (payload.updateTime) {
                localStorage.setItem('hat_last_cloud_save_' + key, String(payload.updateTime));
            }
            publishCloudSaveStatus('saved');
        } catch (e) {
            console.error('Cloud save failed:', e);
            publishCloudSaveStatus('error', e.message || String(e));
            showToast('云端保存失败，已只保存在本地：' + (e.message || String(e)), 'warning', 6000);
        }
    });
    return cloudSaveChain;
}

// Synchronous fallback for pagehide/beforeunload, where async work may be cut off.
export function flushLocalData() {
    const key = getStorageKey();
    const snapshot = snapshotAppState();
    if (!snapshot) return;
    const activeSession = snapshot.sessions?.find(session => session.id === currentSessionId) || gameConfig;
    if (activeSession) saveLiveSessionSnapshot(activeSession);
    try {
        localStorage.setItem('hat_data_' + key, JSON.stringify(snapshot));
        localStorage.setItem('hat_data_meta_' + key, String(Date.now()));
    } catch (e) {
        console.error('Local flush failed:', e);
    }
}

export async function checkCloudStorageStatus() {
    const status = {
        protocol: window.location.protocol,
        sdkLoaded: typeof cloudbase !== 'undefined',
        cloudAvailable: isCloudAvailable,
        hasApp: !!tcbApp,
        hasAuth: !!tcbAuth,
        hasDb: !!tcbDb,
        ok: false,
        message: ''
    };
    if (isLocalFile) {
        status.message = 'file:// mode disables cloud storage.';
        return status;
    }
    if (!status.sdkLoaded) {
        status.message = 'CloudBase SDK is unavailable.';
        return status;
    }
    if (!tcbAuth || !tcbDb) {
        status.message = 'CloudBase is not initialized.';
        return status;
    }
    try {
        if (!tcbAuth.hasLoginState()) await tcbAuth.anonymousAuthProvider().signIn();
        const docId = '__health_check';
        const payload = { ping: Date.now(), source: 'hat_health_check' };
        await tcbDb.collection('hat_saves').doc(docId).set(payload);
        const doc = normalizeCloudDocData(await tcbDb.collection('hat_saves').doc(docId).get());
        status.ok = !!doc && doc.source === payload.source;
        status.message = status.ok ? 'Cloud read/write is working.' : 'Cloud verification failed.';
    } catch (error) {
        status.message = error.message || String(error);
    }
    return status;
}

window.checkCloudStorageStatus = checkCloudStorageStatus;
