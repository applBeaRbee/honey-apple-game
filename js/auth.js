// ================= 账号系统 =================
import { currentUser, isCloudAvailable, tcbAuth, tcbDb, setCurrentUser } from './state.js';
import { escapeHtml } from './constants.js';
import { showToast, closeModal, showConfirm } from './ui.js';
import { loadLocalData, saveLocalData, normalizeCloudDocData } from './storage.js';
import { getCloudKey } from './state.js';
import { renderLibrary } from './cards.js';
import { renderSidebarSessions, updateUserUI, switchMainView } from './sessions.js';

export function openAuthModal() {
    if (currentUser) {
        showConfirm(`当前账号：${escapeHtml(currentUser)}\n是否注销返回游客模式？`).then(res => {
            if (res) guestMode();
        });
        return;
    }
    document.getElementById('registerModal').style.display = 'none';
    document.getElementById('authModal').style.display = 'flex';
}

export function openRegisterModal() {
    document.getElementById('authModal').style.display = 'none';
    document.getElementById('registerModal').style.display = 'flex';
}

export function guestMode() {
    closeModal('authModal');
    closeModal('registerModal');
    if (currentUser) {
        setCurrentUser(null);
        loadLocalData().then(() => {
            renderLibrary();
            renderSidebarSessions();
            updateUserUI();
            switchMainView('library');
            showToast('已切换游客模式', 'info');
        });
    } else {
        showToast('游客模式', 'info');
    }
}

export async function doLogin() {
    const u = document.getElementById('authUsername').value.trim();
    const p = document.getElementById('authPassword').value.trim();
    if (!u || !p) return showToast('请填写完整', 'error');
    const btn = document.getElementById('btnLoginBtn');
    const orig = btn.innerText;
    btn.disabled = true;
    btn.innerText = "验证中...";
    try {
        if (isCloudAvailable && tcbAuth && tcbDb) {
            if (!tcbAuth.hasLoginState()) await tcbAuth.anonymousAuthProvider().signIn();
            const cloudKey = getCloudKey(u);
            const res = await tcbDb.collection('hat_users').doc(cloudKey).get();
            const doc = normalizeCloudDocData(res);
            if (!doc) throw new Error("账号不存在，请注册");
            if (doc.password !== p) throw new Error("密码错误");
        } else {
            let localUsers = JSON.parse(localStorage.getItem('hat_local_users') || '{}');
            if (!localUsers[u]) throw new Error("本地账号不存在");
            if (localUsers[u] !== p) throw new Error("本地密码错误");
        }
        setCurrentUser(u);
        closeModal('authModal');
        document.getElementById('authPassword').value = '';
        await loadLocalData();
        renderLibrary();
        renderSidebarSessions();
        updateUserUI();
        switchMainView('library');
        showToast('登录成功！', 'success');
    } catch (err) {
        showToast(err.message || '登录失败', 'error', 5000);
    } finally {
        btn.disabled = false;
        btn.innerText = orig;
    }
}

export async function doRegister() {
    const u = document.getElementById('regUsername').value.trim();
    const p = document.getElementById('regPassword').value.trim();
    const p2 = document.getElementById('regPasswordConfirm').value.trim();
    if (!u || !p || !p2) return showToast('请填写完整', 'error');
    if (p.length < 6 || !/[a-z]/.test(p) || !/[A-Z]/.test(p)) return showToast('密码至少6位含大小写字母', 'error');
    if (p !== p2) return showToast('两次密码不一致', 'error');
    const btn = document.getElementById('btnRegBtn');
    const orig = btn.innerText;
    btn.disabled = true;
    btn.innerText = "注册中...";
    try {
        if (isCloudAvailable && tcbAuth && tcbDb) {
            if (!tcbAuth.hasLoginState()) await tcbAuth.anonymousAuthProvider().signIn();
            const cloudKey = getCloudKey(u);
            const existing = await tcbDb.collection('hat_users').doc(cloudKey).get();
            if (normalizeCloudDocData(existing)) throw new Error("账号已存在");
            await tcbDb.collection('hat_users').doc(cloudKey).set({ username: u, password: p, created: Date.now() });
        } else {
            let localUsers = JSON.parse(localStorage.getItem('hat_local_users') || '{}');
            if (localUsers[u]) throw new Error("本地账号已存在");
            localUsers[u] = p;
            localStorage.setItem('hat_local_users', JSON.stringify(localUsers));
        }
        setCurrentUser(u);
        closeModal('registerModal');
        document.getElementById('regPassword').value = '';
        document.getElementById('regPasswordConfirm').value = '';
        await loadLocalData();
        renderLibrary();
        renderSidebarSessions();
        updateUserUI();
        switchMainView('library');
        showToast('注册成功！', 'success');
    } catch (err) {
        showToast(err.message || '注册失败', 'error', 5000);
    } finally {
        btn.disabled = false;
        btn.innerText = orig;
    }
}

// ===== 导出到 window =====
window.openAuthModal = openAuthModal;
window.openRegisterModal = openRegisterModal;
window.guestMode = guestMode;
window.doLogin = doLogin;
window.doRegister = doRegister;
