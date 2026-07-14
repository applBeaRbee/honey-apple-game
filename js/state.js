// ================= 全局共享状态 =================
// 这是所有模块共享的状态中心

import { DEFAULT_SETTINGS } from './constants.js';

export let appState = { cards: [], sessions: [], settings: { ...DEFAULT_SETTINGS } };
export let currentSessionId = null;
export let gameConfig = null;
export let currentUser = localStorage.getItem('hat_current_user') || null;

export let tcbApp, tcbAuth, tcbDb;
export let isCloudAvailable = false;
export const isLocalFile = window.location.protocol === 'file:';

// 邮箱发送状态
export let isMailSending = false;

// Canvas 引用
export let relationCanvasEl = null;
export let mapCanvasEl = null;
export let relationWrapperEl = null;
export let mapWrapperEl = null;
export let relObserver = null;
export let mapObserver = null;
export let mapAnimReq = null;

// 状态更新函数
export function setAppState(newState) {
    appState = newState;
}

export function setCurrentSessionId(id) {
    currentSessionId = id;
}

export function setGameConfig(config) {
    gameConfig = config;
}

export function setCurrentUser(user) {
    currentUser = user;
    if (user) {
        localStorage.setItem('hat_current_user', user);
    } else {
        localStorage.removeItem('hat_current_user');
    }
}

export function setCloudAvailable(val) {
    isCloudAvailable = val;
}

export function setTcbApp(app) { tcbApp = app; }
export function setTcbAuth(auth) { tcbAuth = auth; }
export function setTcbDb(db) { tcbDb = db; }

export function setIsMailSending(val) {
    isMailSending = val;
}

// Canvas 引用更新
export function setRelationCanvasEl(el) { relationCanvasEl = el; }
export function setMapCanvasEl(el) { mapCanvasEl = el; }
export function setRelationWrapperEl(el) { relationWrapperEl = el; }
export function setMapWrapperEl(el) { mapWrapperEl = el; }
export function setRelObserver(obs) { relObserver = obs; }
export function setMapObserver(obs) { mapObserver = obs; }
export function setMapAnimReq(req) { mapAnimReq = req; }

export function getStorageKey() {
    return currentUser ? `user_${currentUser}` : 'user_guest';
}

export function getCloudKey(username) {
    const name = username || currentUser;
    return name ? 'u_' + encodeURIComponent(name).replace(/%/g, '_') : 'user_guest';
}
