// ================= 数据持久化 =================
import { appState, currentUser, isLocalFile, isCloudAvailable, tcbApp, tcbAuth, tcbDb, getStorageKey, getCloudKey, setCloudAvailable, setTcbApp, setTcbAuth, setTcbDb, setAppState } from './state.js';
import { DEFAULT_SETTINGS } from './constants.js';
import { showToast } from './ui.js';

export async function initCloudBase() {
    if (isLocalFile) { console.warn("file:// 协议运行，禁用云端，沙盒模式。"); return; }
    try {
        if (typeof cloudbase !== 'undefined') {
            const app = cloudbase.init({ env: 'applbear-d7gnceygaed0ac177' });
            setTcbApp(app);
            setTcbAuth(app.auth({ persistence: 'local' }));
            setTcbDb(app.database());
            setCloudAvailable(true);
        } else {
            console.warn("CloudBase SDK 未加载，降级本地沙盒。");
            setCloudAvailable(false);
        }
    } catch (e) {
        console.warn("云环境初始化失败，降级本地沙盒:", e);
        setCloudAvailable(false);
    }
}

export function normalizeCloudDocData(res) {
    if (!res) return null;
    if (Array.isArray(res.data)) return res.data[0] || null;
    if (res.data && typeof res.data === 'object') return res.data;
    return null;
}

export async function loadLocalData() {
    let loadedFromCloud = false;
    const key = getStorageKey();
    if (isCloudAvailable && tcbAuth && tcbDb) {
        try {
            if (!tcbAuth.hasLoginState()) {
                await tcbAuth.anonymousAuthProvider().signIn().catch(err => { throw new Error("匿名登录未开启"); });
            }
            const cloudKey = getCloudKey();
            const res = await tcbDb.collection('hat_saves').doc(cloudKey).get();
            const doc = normalizeCloudDocData(res);
            if (doc?.gameData) {
                const parsed = doc.gameData;
                setAppState({
                    cards: parsed.cards || [],
                    sessions: parsed.sessions || [],
                    settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) }
                });
                loadedFromCloud = true;
            }
        } catch (e) {
            console.error("云端加载失败:", e);
            setCloudAvailable(false);
            showToast('云端同步失败，降级本地', 'error');
        }
    }
    if (!loadedFromCloud) {
        const saved = localStorage.getItem('hat_data_' + key);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setAppState({
                    cards: parsed.cards || [],
                    sessions: parsed.sessions || [],
                    settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) }
                });
            } catch (e) {
                setAppState({ cards: [], sessions: [], settings: { ...DEFAULT_SETTINGS } });
            }
        } else {
            setAppState({ cards: [], sessions: [], settings: { ...DEFAULT_SETTINGS } });
        }
    }
    // 返回 true 表示加载完成，由调用方后续执行 UI 渲染
    return true;
}

export async function saveLocalData() {
    const key = getStorageKey();
    try {
        localStorage.setItem('hat_data_' + key, JSON.stringify(appState));
    } catch (e) {
        console.error("本地保存失败:", e);
    }
    if (isCloudAvailable && tcbAuth && tcbDb) {
        try {
            if (!tcbAuth.hasLoginState()) {
                await tcbAuth.anonymousAuthProvider().signIn();
            }
            const cloudKey = getCloudKey();
            await tcbDb.collection('hat_saves').doc(cloudKey).set({
                gameData: JSON.parse(JSON.stringify(appState)),
                updateTime: Date.now()
            });
        } catch (e) {
            console.error('云端保存失败:', e);
            setCloudAvailable(false);
        }
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
        status.message = '当前是 file:// 打开，云端存储会被禁用。请用 http://localhost 访问。';
        return status;
    }
    if (!status.sdkLoaded) {
        status.message = 'CloudBase SDK 未加载，可能是网络或脚本 CDN 被拦截。';
        return status;
    }
    if (!tcbAuth || !tcbDb) {
        status.message = 'CloudBase 尚未初始化。';
        return status;
    }
    try {
        if (!tcbAuth.hasLoginState()) await tcbAuth.anonymousAuthProvider().signIn();
        const docId = '__health_check';
        const payload = { ping: Date.now(), source: 'hat_health_check' };
        await tcbDb.collection('hat_saves').doc(docId).set(payload);
        const res = await tcbDb.collection('hat_saves').doc(docId).get();
        const doc = normalizeCloudDocData(res);
        status.ok = !!doc && doc.source === payload.source;
        status.message = status.ok ? '云端读写正常。' : '云端写入后读取结果异常。';
    } catch (error) {
        status.ok = false;
        status.message = error.message || String(error);
    }
    return status;
}

window.checkCloudStorageStatus = checkCloudStorageStatus;
