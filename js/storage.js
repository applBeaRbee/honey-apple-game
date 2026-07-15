// ================= Data persistence =================
import { appState, isLocalFile, isCloudAvailable, tcbApp, tcbAuth, tcbDb, getStorageKey, getCloudKey, setCloudAvailable, setTcbApp, setTcbAuth, setTcbDb, setAppState } from './state.js';
import { DEFAULT_SETTINGS } from './constants.js';
import { showToast } from './ui.js';

// Save immutable snapshots in order. A slow older cloud request must not
// overwrite a newer conversation state.
let cloudSaveChain = Promise.resolve();

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
            setCloudAvailable(false);
            showToast('Cloud sync failed; switched to local storage.', 'error');
        }
    }
    if (!loadedFromCloud) {
        if (localParsed) {
            applyStoredData(localParsed);
        } else {
            setAppState({ cards: [], sessions: [], settings: { ...DEFAULT_SETTINGS } });
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

export async function saveLocalData() {
    const key = getStorageKey();
    const snapshot = snapshotAppState();
    if (!snapshot) return;

    try {
        localStorage.setItem('hat_data_' + key, JSON.stringify(snapshot));
        localStorage.setItem('hat_data_meta_' + key, String(Date.now()));
    } catch (e) {
        console.error('Local save failed:', e);
    }

    if (!(isCloudAvailable && tcbAuth && tcbDb)) return;
    const payload = { gameData: snapshot, updateTime: Date.now() };
    const cloudKey = getCloudKey();
    cloudSaveChain = cloudSaveChain.catch(() => {}).then(async () => {
        if (!isCloudAvailable || !tcbAuth || !tcbDb) return;
        try {
            if (!tcbAuth.hasLoginState()) await tcbAuth.anonymousAuthProvider().signIn();
            await tcbDb.collection('hat_saves').doc(cloudKey).set(payload);
        } catch (e) {
            console.error('Cloud save failed:', e);
            setCloudAvailable(false);
        }
    });
    return cloudSaveChain;
}

// Synchronous fallback for pagehide/beforeunload, where async work may be cut off.
export function flushLocalData() {
    const key = getStorageKey();
    const snapshot = snapshotAppState();
    if (!snapshot) return;
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
