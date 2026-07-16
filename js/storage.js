// ================= Data persistence =================
import { appState, currentSessionId, gameConfig, isLocalFile, isCloudAvailable, tcbApp, tcbAuth, tcbDb, getStorageKey, getCloudKey, setCloudAvailable, setTcbApp, setTcbAuth, setTcbDb, setAppState } from './state.js';
import { DEFAULT_SETTINGS } from './constants.js';
import { showToast } from './ui.js';

// Save immutable snapshots in order. A slow older cloud request must not
// overwrite a newer conversation state.
let cloudSaveChain = Promise.resolve();
let cloudSaveScheduled = false;
let cloudSaveRunning = false;
let pendingCloudPayload = null;
let pendingCloudKey = '';
let pendingStorageKey = '';
let cloudFailureCount = 0;
let lastCloudErrorToastAt = 0;
const CLOUD_SAVE_DEBOUNCE_MS = 900;
const CLOUD_SAVE_RETRY_DELAYS = [1200, 3000];
const CLOUD_SAVE_BACKGROUND_RETRY_MS = 15000;
const IDB_NAME = 'honey_apple_storage';
const IDB_STORE = 'saves';
const IDB_VERSION = 1;
const CLOUD_SPLIT_MODE = 'split-docs-v2';
const CLOUD_HISTORY_CHUNK_SIZE = 80;

export function getLastCloudSaveTime() {
    const key = getStorageKey();
    return Number(localStorage.getItem('hat_last_cloud_save_' + key) || 0);
}

function publishCloudSaveStatus(status, detail = '') {
    window.dispatchEvent(new CustomEvent('hat-cloud-save-status', {
        detail: { status, detail, at: Date.now() }
    }));
}

function isQuotaError(error) {
    return error?.name === 'QuotaExceededError' || /quota/i.test(error?.message || String(error || ''));
}

function safeSetLocalStorage(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (error) {
        if (!isQuotaError(error)) throw error;
        return false;
    }
}

function pruneStorageKeys(prefix, keep = 6) {
    const items = [];
    for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (!key?.startsWith(prefix)) continue;
        let updatedAt = 0;
        try {
            updatedAt = Number(JSON.parse(localStorage.getItem(key) || '{}')?.updatedAt || 0);
        } catch (_) {}
        items.push({ key, updatedAt });
    }
    items.sort((a, b) => b.updatedAt - a.updatedAt).slice(keep).forEach(item => localStorage.removeItem(item.key));
}

function pruneUserBackups() {
    pruneStorageKeys(`hat_live_session_${getStorageKey()}_`, 4);
    pruneStorageKeys(`hat_session_backup_${getStorageKey()}_`, 6);
}

function openSaveDb() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
            reject(new Error('IndexedDB is unavailable.'));
            return;
        }
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('Could not open IndexedDB.'));
    });
}

async function idbSet(key, value) {
    const db = await openSaveDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(value, key);
        tx.oncomplete = () => { db.close(); resolve(true); };
        tx.onerror = () => { db.close(); reject(tx.error || new Error('IndexedDB write failed.')); };
    });
}

async function idbGet(key) {
    const db = await openSaveDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = () => resolve(req.result || null);
        tx.oncomplete = () => db.close();
        tx.onerror = () => { db.close(); reject(tx.error || new Error('IndexedDB read failed.')); };
    });
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function shouldToastCloudError() {
    const now = Date.now();
    if (cloudFailureCount < 2 && now - lastCloudErrorToastAt < 60000) return false;
    lastCloudErrorToastAt = now;
    return true;
}

async function ensureCloudLogin() {
    if (!tcbAuth?.hasLoginState()) {
        await tcbAuth.anonymousAuthProvider().signIn();
    }
}

async function writeCloudPayload(payload, cloudKey) {
    let lastError = null;
    for (let attempt = 0; attempt <= CLOUD_SAVE_RETRY_DELAYS.length; attempt++) {
        try {
            await ensureCloudLogin();
            if (payload?.storageMode === CLOUD_SPLIT_MODE) {
                for (const item of payload.cardDocs || []) {
                    await tcbDb.collection('hat_saves').doc(item.key).set(item.payload);
                }
                for (const item of payload.historyDocs || []) {
                    await tcbDb.collection('hat_saves').doc(item.key).set(item.payload);
                }
                for (const item of payload.sessionDocs || []) {
                    await tcbDb.collection('hat_saves').doc(item.key).set(item.payload);
                }
                await tcbDb.collection('hat_saves').doc(cloudKey).set({
                    gameData: payload.gameData,
                    updateTime: payload.updateTime,
                    storageMode: CLOUD_SPLIT_MODE
                });
            } else {
                await tcbDb.collection('hat_saves').doc(cloudKey).set(payload);
            }
            return;
        } catch (error) {
            lastError = error;
            if (attempt < CLOUD_SAVE_RETRY_DELAYS.length) {
                await delay(CLOUD_SAVE_RETRY_DELAYS[attempt]);
            }
        }
    }
    throw lastError;
}

async function flushCloudSaveQueue() {
    cloudSaveScheduled = false;
    if (cloudSaveRunning) return;
    cloudSaveRunning = true;
    try {
        while (pendingCloudPayload) {
            const payload = pendingCloudPayload;
            const cloudKey = pendingCloudKey;
            const storageKey = pendingStorageKey;
            pendingCloudPayload = null;
            pendingCloudKey = '';
            pendingStorageKey = '';
            try {
                await writeCloudPayload(payload, cloudKey);
                if (payload.updateTime) {
                    localStorage.setItem('hat_last_cloud_save_' + storageKey, String(payload.updateTime));
                }
                cloudFailureCount = 0;
                publishCloudSaveStatus('saved');
            } catch (e) {
                cloudFailureCount += 1;
                console.error('Cloud save failed:', e);
                publishCloudSaveStatus('error', e.message || String(e));
                if (shouldToastCloudError()) {
                    showToast('\u4e91\u7aef\u4fdd\u5b58\u5931\u8d25\uff0c\u5df2\u4fdd\u5b58\u5728\u672c\u5730\u3002\u7cfb\u7edf\u4f1a\u7ee7\u7eed\u81ea\u52a8\u91cd\u8bd5\uff1a' + (e.message || String(e)), 'warning', 7000);
                }
                if (!pendingCloudPayload) {
                    pendingCloudPayload = payload;
                    pendingCloudKey = cloudKey;
                    pendingStorageKey = storageKey;
                }
                break;
            }
        }
    } finally {
        cloudSaveRunning = false;
        if (pendingCloudPayload && !cloudSaveScheduled) {
            cloudSaveScheduled = true;
            cloudSaveChain = cloudSaveChain.catch(() => {}).then(() => delay(CLOUD_SAVE_BACKGROUND_RETRY_MS)).then(flushCloudSaveQueue);
        }
    }
}

function queueCloudSave(payload, cloudKey, storageKey) {
    pendingCloudPayload = payload;
    pendingCloudKey = cloudKey;
    pendingStorageKey = storageKey;
    publishCloudSaveStatus('syncing');
    if (!cloudSaveScheduled && !cloudSaveRunning) {
        cloudSaveScheduled = true;
        cloudSaveChain = cloudSaveChain.catch(() => {}).then(() => delay(CLOUD_SAVE_DEBOUNCE_MS)).then(flushCloudSaveQueue);
    }
    return cloudSaveChain;
}

export async function waitForCloudSave() {
    if (!(isCloudAvailable && tcbAuth && tcbDb)) return false;
    await cloudSaveChain.catch(() => {});
    if (pendingCloudPayload) await flushCloudSaveQueue();
    return !pendingCloudPayload && getLastCloudSaveTime() > 0;
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
        'id', 'cardId', 'name', 'lastUpdated',
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
        const recovery = stripDisposableSessionData(buildSessionRecovery(session));
        if (!recovery) return;
        try {
            const ok = safeSetLocalStorage(sessionBackupKey(session.id), JSON.stringify({
                session: recovery,
                updatedAt: Number(session.lastUpdated || Date.now())
            }));
            if (!ok) {
                pruneUserBackups();
                safeSetLocalStorage(sessionBackupKey(session.id), JSON.stringify({
                    session: recovery,
                    updatedAt: Number(session.lastUpdated || Date.now())
                }));
            }
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
        'id', 'cardId', 'name', 'lastUpdated',
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
    const recovery = stripDisposableSessionData(buildLiveSessionSnapshot(session));
    if (!recovery) return;
    try {
        const ok = safeSetLocalStorage(liveSessionKey(session.id), JSON.stringify({
            session: recovery,
            updatedAt: Number(session.lastUpdated || Date.now())
        }));
        if (!ok) {
            pruneUserBackups();
            safeSetLocalStorage(liveSessionKey(session.id), JSON.stringify({
                session: recovery,
                updatedAt: Number(session.lastUpdated || Date.now())
            }));
        }
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
    const idbSaved = await idbGet('hat_data_' + key).catch(error => {
        console.warn('IndexedDB load failed:', error);
        return null;
    });
    const localSaved = idbSaved || localStorage.getItem('hat_data_' + key);
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
                const cloudData = doc.storageMode === CLOUD_SPLIT_MODE
                    ? await hydrateSplitCloudData(doc.gameData)
                    : doc.gameData;
                applyStoredData(cloudData);
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
            if (!idbSaved) saveSnapshotToLocal(key, localParsed).catch(error => console.warn('IndexedDB migration failed:', error));
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

function dropLargeDataUrl(value) {
    return typeof value === 'string' && value.startsWith('data:') && value.length > 12000 ? null : value;
}

function slimHistoryEntry(entry) {
    if (!entry || typeof entry !== 'object') return entry;
    const slim = { ...entry };
    delete slim.rawData;
    delete slim.preTurnSnapshot;
    delete slim.panelsSnapshot;
    delete slim.memorySnapshot;
    return slim;
}

function stripHistorySnapshots(history = []) {
    if (!Array.isArray(history)) return [];
    return history.map(slimHistoryEntry);
}

function stripDisposableCardData(card) {
    if (!card || typeof card !== 'object') return card;
    const slim = { ...card };
    delete slim.rawCardData;
    delete slim.frontendAssets;
    delete slim.avatarDataUrl;
    if (typeof slim.avatar === 'string' && slim.avatar.startsWith('data:') && slim.avatar.length > 12000) {
        slim.avatar = '📜';
    }
    return slim;
}

function stripDisposableSessionData(session) {
    if (!session || typeof session !== 'object') return session;
    const slim = { ...session };
    slim.history = stripHistorySnapshots(session.history);
    slim.cards = undefined;
    slim.preTurnSnapshot = undefined;
    delete slim.avatarDataUrl;
    if (typeof slim.avatar === 'string' && slim.avatar.startsWith('data:') && slim.avatar.length > 12000) {
        slim.avatar = '📜';
    }
    return slim;
}

function buildCardSummary(card) {
    if (!card || typeof card !== 'object') return card;
    return stripDisposableCardData({
        id: card.id,
        name: card.name,
        description: stripHugeText(card.description || '', 500),
        avatar: typeof card.avatar === 'string' && card.avatar.startsWith('data:') ? '馃摐' : card.avatar,
        tags: card.tags,
        updatedAt: card.updatedAt,
        lastUpdated: card.lastUpdated
    });
}

function buildSessionSummary(session) {
    if (!session || typeof session !== 'object') return session;
    return stripDisposableSessionData({
        id: session.id,
        cardId: session.cardId,
        name: session.name,
        avatar: typeof session.avatar === 'string' && session.avatar.startsWith('data:') ? '馃摐' : session.avatar,
        lastUpdated: session.lastUpdated,
        worldTime: session.worldTime,
        historyCount: Array.isArray(session.history) ? session.history.length : 0
    });
}

function chunkArray(items = [], size = CLOUD_HISTORY_CHUNK_SIZE) {
    const chunks = [];
    for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
    return chunks;
}

function cloudDocKey(cloudKey, type, id, suffix = '') {
    const safeId = encodeURIComponent(String(id || 'unknown')).replace(/%/g, '_');
    return `${cloudKey}__${type}__${safeId}${suffix}`;
}

function buildSessionCloudDocs(session, cloudKey, updateTime) {
    const clean = stripDisposableSessionData(session);
    const history = Array.isArray(clean.history) ? clean.history : [];
    const chunks = chunkArray(history);
    const historyKeys = chunks.map((_, index) => cloudDocKey(cloudKey, 'history', session.id, `__${index}`));
    const sessionBody = { ...clean, history: undefined, historyChunkKeys: historyKeys };
    return {
        sessionDoc: {
            key: cloudDocKey(cloudKey, 'session', session.id),
            payload: { session: sessionBody, updateTime, storageMode: CLOUD_SPLIT_MODE }
        },
        historyDocs: chunks.map((chunk, index) => ({
            key: historyKeys[index],
            payload: { sessionId: session.id, index, history: chunk, updateTime, storageMode: CLOUD_SPLIT_MODE }
        }))
    };
}

function buildSplitCloudPayload(snapshot, cloudKey, updateTime) {
    const stored = JSON.parse(JSON.stringify(snapshot));
    const cardDocs = [];
    const sessionDocs = [];
    const historyDocs = [];

    stored.cards = Array.isArray(stored.cards) ? stored.cards.map(card => {
        const summary = buildCardSummary(card);
        const key = cloudDocKey(cloudKey, 'card', card.id || card.name);
        cardDocs.push({ key, payload: { card: stripDisposableCardData(card), updateTime, storageMode: CLOUD_SPLIT_MODE } });
        return { ...summary, cloudDocKey: key };
    }) : [];

    stored.sessions = Array.isArray(stored.sessions) ? stored.sessions.map(session => {
        const summary = buildSessionSummary(session);
        const docs = buildSessionCloudDocs(session, cloudKey, updateTime);
        sessionDocs.push(docs.sessionDoc);
        historyDocs.push(...docs.historyDocs);
        return { ...summary, cloudDocKey: docs.sessionDoc.key, historyChunkKeys: docs.sessionDoc.payload.session.historyChunkKeys };
    }) : [];

    return {
        storageMode: CLOUD_SPLIT_MODE,
        updateTime,
        gameData: stored,
        cardDocs,
        sessionDocs,
        historyDocs
    };
}

async function readCloudDoc(key) {
    if (!key) return null;
    const doc = normalizeCloudDocData(await tcbDb.collection('hat_saves').doc(key).get());
    return doc || null;
}

async function hydrateSplitCloudData(indexData = {}) {
    const hydrated = JSON.parse(JSON.stringify(indexData));
    hydrated.cards = await Promise.all((hydrated.cards || []).map(async card => {
        try {
            const doc = await readCloudDoc(card.cloudDocKey);
            return doc?.card ? { ...doc.card, cloudDocKey: card.cloudDocKey } : card;
        } catch (error) {
            console.warn('Cloud card hydrate failed:', card.cloudDocKey, error);
            return card;
        }
    }));

    hydrated.sessions = await Promise.all((hydrated.sessions || []).map(async session => {
        try {
            const doc = await readCloudDoc(session.cloudDocKey);
            const full = doc?.session ? { ...session, ...doc.session } : session;
            const historyKeys = full.historyChunkKeys || session.historyChunkKeys || [];
            const chunks = await Promise.all(historyKeys.map(async key => {
                try {
                    const chunkDoc = await readCloudDoc(key);
                    return Array.isArray(chunkDoc?.history) ? chunkDoc.history : [];
                } catch (error) {
                    console.warn('Cloud history hydrate failed:', key, error);
                    return [];
                }
            }));
            full.history = chunks.flat();
            return full;
        } catch (error) {
            console.warn('Cloud session hydrate failed:', session.cloudDocKey, error);
            return session;
        }
    }));
    return hydrated;
}

function buildStorageSnapshot(snapshot) {
    const stored = JSON.parse(JSON.stringify(snapshot));
    stored.cards = Array.isArray(stored.cards) ? stored.cards.map(stripDisposableCardData) : [];
    stored.sessions = Array.isArray(stored.sessions) ? stored.sessions.map(stripDisposableSessionData) : [];
    return stored;
}

function buildCloudSnapshot(snapshot, cloudKey, updateTime) {
    return buildSplitCloudPayload(snapshot, cloudKey, updateTime);
}

async function saveSnapshotToLocal(key, snapshot) {
    const dataKey = 'hat_data_' + key;
    const metaKey = 'hat_data_meta_' + key;
    const storedSnapshot = buildStorageSnapshot(snapshot);
    try {
        await idbSet(dataKey, JSON.stringify(storedSnapshot));
        localStorage.setItem(metaKey, String(Date.now()));
        return true;
    } catch (error) {
        console.warn('IndexedDB save failed, falling back to localStorage:', error);
    }

    pruneUserBackups();
    if (safeSetLocalStorage(dataKey, JSON.stringify(storedSnapshot))) {
        localStorage.setItem(metaKey, String(Date.now()));
        return true;
    }
    return false;
}

export async function saveLocalData() {
    const key = getStorageKey();
    const snapshot = snapshotAppState();
    if (!snapshot) return;
    const activeSession = snapshot.sessions?.find(session => session.id === currentSessionId) || gameConfig;
    if (activeSession) saveLiveSessionSnapshot(activeSession);

    if (!(await saveSnapshotToLocal(key, snapshot))) {
        console.error('Local save failed: storage quota exceeded after compaction.');
        showToast('\u672c\u5730\u5b58\u50a8\u7a7a\u95f4\u4e0d\u8db3\uff0c\u5df2\u5c1d\u8bd5\u538b\u7f29\u5b58\u6863\u3002\u8bf7\u5bfc\u51fa\u5907\u4efd\u540e\u6e05\u7406\u8fc7\u65e7\u5b58\u6863\u3002', 'error', 9000);
    }

    if (!(isCloudAvailable && tcbAuth && tcbDb)) {
        publishCloudSaveStatus('local');
        return;
    }
    const cloudKey = getCloudKey();
    const updateTime = Date.now();
    const payload = buildCloudSnapshot(snapshot, cloudKey, updateTime);
    return queueCloudSave(payload, cloudKey, key);
}

// Synchronous fallback for pagehide/beforeunload, where async work may be cut off.
export function flushLocalData() {
    const key = getStorageKey();
    const snapshot = snapshotAppState();
    if (!snapshot) return;
    const activeSession = snapshot.sessions?.find(session => session.id === currentSessionId) || gameConfig;
    if (activeSession) saveLiveSessionSnapshot(activeSession);
    const storedSnapshot = buildStorageSnapshot(snapshot);
    idbSet('hat_data_' + key, JSON.stringify(storedSnapshot)).catch(error => console.warn('IndexedDB flush failed:', error));
    if (safeSetLocalStorage('hat_data_' + key, JSON.stringify(storedSnapshot))) {
        localStorage.setItem('hat_data_meta_' + key, String(Date.now()));
    } else {
        pruneUserBackups();
        console.warn('Local flush fallback skipped because localStorage is full; IndexedDB save is pending.');
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
