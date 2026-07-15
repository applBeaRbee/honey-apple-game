// ================= 世界时间系统 =================
import { gameConfig } from './state.js';

const DEFAULT_TIME = { day: 1, hour: 8, minute: 0 };

function clampInt(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.floor(n) : fallback;
}

export function normalizeWorldTime(value = {}) {
    let day = Math.max(1, clampInt(value.day, DEFAULT_TIME.day));
    let hour = clampInt(value.hour, DEFAULT_TIME.hour);
    let minute = clampInt(value.minute, DEFAULT_TIME.minute);
    let total = (day - 1) * 1440 + hour * 60 + minute;
    total = Math.max(0, total);
    return totalToWorldTime(total);
}

export function worldTimeToMinutes(value = DEFAULT_TIME) {
    const wt = normalizeWorldTime(value);
    return (wt.day - 1) * 1440 + wt.hour * 60 + wt.minute;
}

export function totalToWorldTime(totalMinutes) {
    const total = Math.max(0, Math.round(Number(totalMinutes) || 0));
    return {
        day: Math.floor(total / 1440) + 1,
        hour: Math.floor((total % 1440) / 60),
        minute: total % 60
    };
}

export function formatTimeDisplay(hour, minute) {
    const h = ((clampInt(hour, 8) % 24) + 24) % 24;
    const ampm = h >= 12 ? '下午' : '上午';
    const hh = h % 12 || 12;
    return `${ampm} ${hh}:${String(clampInt(minute, 0)).padStart(2, '0')}`;
}

export function formatTimeShort(day, hour, minute) {
    return `第${day ?? 1}天 ${formatTimeDisplay(hour ?? 8, minute ?? 0)}`;
}

export function formatWorldTime(value = getWorldTimeSnapshot()) {
    const wt = normalizeWorldTime(value);
    return `第${wt.day}天 ${String(wt.hour).padStart(2, '0')}:${String(wt.minute).padStart(2, '0')}`;
}

export function updateWorldTimeUI() {
    const el = document.getElementById('worldTimeDisplay');
    if (!gameConfig?.worldTime) {
        if (el) el.style.display = 'none';
        return;
    }
    gameConfig.worldTime = normalizeWorldTime(gameConfig.worldTime);
    el.innerText = `🕒 ${formatTimeShort(gameConfig.worldTime.day, gameConfig.worldTime.hour, gameConfig.worldTime.minute)}`;
    el.style.display = 'inline-block';
}

export function setWorldTime(nextTime) {
    if (!gameConfig) return null;
    const before = getWorldTimeSnapshot();
    gameConfig.worldTime = normalizeWorldTime(nextTime);
    updateWorldTimeUI();
    return {
        before,
        after: getWorldTimeSnapshot(),
        minutes: Math.max(0, worldTimeToMinutes(gameConfig.worldTime) - worldTimeToMinutes(before))
    };
}

export function addWorldTime(minutes) {
    if (!gameConfig?.worldTime) return null;
    const before = getWorldTimeSnapshot();
    const amount = normalizeMinutes(minutes, 0);
    const after = totalToWorldTime(worldTimeToMinutes(before) + amount);
    gameConfig.worldTime = after;
    updateWorldTimeUI();
    return { before, after: getWorldTimeSnapshot(), minutes: amount };
}

export function normalizeMinutes(value, fallback = 10) {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
    if (typeof value === 'string') {
        const text = value.trim();
        const day = text.match(/(\d+(?:\.\d+)?)\s*(天|日|day|d)/i);
        const hour = text.match(/(\d+(?:\.\d+)?)\s*(小时|钟头|时|hour|hr|h)/i);
        const minute = text.match(/(\d+(?:\.\d+)?)\s*(分钟|分|minute|min|m)/i);
        let total = 0;
        if (day) total += Number(day[1]) * 1440;
        if (hour) total += Number(hour[1]) * 60;
        if (minute) total += Number(minute[1]);
        if (total > 0) return Math.max(0, Math.round(total));
        const numeric = Number(text);
        if (Number.isFinite(numeric)) return Math.max(0, Math.round(numeric));
    }
    if (value && typeof value === 'object') {
        const total = (Number(value.days || value.day || 0) * 1440) +
            (Number(value.hours || value.hour || 0) * 60) +
            Number(value.minutes || value.minute || 0);
        if (Number.isFinite(total) && total > 0) return Math.round(total);
    }
    return fallback;
}

function parseClock(text) {
    if (!text) return null;
    const source = String(text);
    let match = source.match(/(?:第\s*)?(\d+)\s*天[^\d]{0,8}(\d{1,2})[:：点时](\d{1,2})?/);
    if (match) return normalizeWorldTime({ day: Number(match[1]), hour: Number(match[2]), minute: Number(match[3] || 0) });

    match = source.match(/(上午|早上|清晨|中午|下午|傍晚|晚上|夜晚|深夜)?\s*(\d{1,2})[:：点时](\d{1,2})?/);
    if (!match) return null;
    let hour = Number(match[2]);
    const minute = Number(match[3] || 0);
    const period = match[1] || '';
    if (/下午|傍晚|晚上|夜晚/.test(period) && hour < 12) hour += 12;
    if (/深夜/.test(period) && hour === 12) hour = 0;
    if (/中午/.test(period) && hour < 11) hour += 12;
    const current = getWorldTimeSnapshot();
    let candidate = normalizeWorldTime({ day: current.day, hour, minute });
    if (worldTimeToMinutes(candidate) + 30 < worldTimeToMinutes(current)) {
        candidate = normalizeWorldTime({ ...candidate, day: candidate.day + 1 });
    }
    return candidate;
}

export function parseWorldTime(value) {
    if (!value) return null;
    if (typeof value === 'object') {
        if (value.day !== undefined || value.hour !== undefined || value.minute !== undefined) return normalizeWorldTime(value);
        if (value.date || value.time) return parseWorldTime(`${value.date || ''} ${value.time || ''}`);
    }
    return parseClock(value);
}

export function extractAbsoluteWorldTime(parsed = null, aiText = '') {
    const candidates = [
        parsed?.world_time,
        parsed?.worldTime,
        parsed?.current_time,
        parsed?.currentTime,
        parsed?.time_state,
        parsed?.timeState
    ];
    for (const item of candidates) {
        const parsedTime = parseWorldTime(item);
        if (parsedTime) return parsedTime;
    }

    const textTime = parseWorldTime(aiText);
    if (!textTime) return null;
    const now = worldTimeToMinutes(getWorldTimeSnapshot());
    const next = worldTimeToMinutes(textTime);
    if (next >= now && next - now <= 1440 * 3) return textTime;
    return null;
}

export function inferPassTime(userText = '', aiText = '', parsed = null) {
    const explicit = parsed?.pass_time ?? parsed?.time_passed ?? parsed?.elapsed_minutes ?? parsed?.elapsedMinutes;
    if (explicit !== undefined) return normalizeMinutes(explicit, 0);
    const absolute = extractAbsoluteWorldTime(parsed, '');
    if (absolute) return Math.max(0, worldTimeToMinutes(absolute) - worldTimeToMinutes(getWorldTimeSnapshot()));

    const text = String(userText || '');
    if (/第二天|次日|翌日|一觉睡到|过夜|天亮/.test(text)) return 480;
    const elapsed = text.match(/(?:经过|过去|持续|花了|耗时)\s*(\d+(?:\.\d+)?)\s*(天|日|小时|时|分钟|分)/);
    if (elapsed) return normalizeMinutes(`${elapsed[1]}${elapsed[2]}`, 0);
    return 0;
}

export function applyTurnTime(userText = '', aiText = '', parsed = null, options = {}) {
    if (!gameConfig?.worldTime) return { before: DEFAULT_TIME, after: DEFAULT_TIME, minutes: 0, changed: false };
    gameConfig.worldTime = normalizeWorldTime(gameConfig.worldTime);
    const before = getWorldTimeSnapshot();
    if (options.advance === false) return { before, after: before, minutes: 0, changed: false };

    const absolute = extractAbsoluteWorldTime(parsed, '');
    if (absolute) {
        const delta = Math.max(0, worldTimeToMinutes(absolute) - worldTimeToMinutes(before));
        gameConfig.worldTime = normalizeWorldTime(absolute);
        updateWorldTimeUI();
        return { before, after: getWorldTimeSnapshot(), minutes: delta, changed: delta > 0, source: 'absolute' };
    }

    const minutes = inferPassTime(userText, aiText, parsed);
    const change = addWorldTime(minutes);
    return { ...(change || { before, after: before, minutes: 0 }), changed: minutes > 0, source: 'elapsed' };
}

export function describeTimePass(minutes) {
    if (minutes >= 1440 * 30) return '修真无岁月，世上已千年...';
    if (minutes >= 1440) return '几日之后...';
    if (minutes >= 480) return '一夜无话...';
    return '时光流转...';
}

export function getWorldTimeSnapshot() {
    if (!gameConfig?.worldTime) return { ...DEFAULT_TIME };
    return normalizeWorldTime(gameConfig.worldTime);
}

export function animateTimePass(minutes, startSnapshot = null) {
    return new Promise((resolve) => {
        if (minutes < 60) { resolve(); return; }
        const overlay = document.getElementById('timePassOverlay');
        const hourHand = document.getElementById('clockHourHand');
        const minuteHand = document.getElementById('clockMinuteHand');
        if (!overlay || !hourHand || !minuteHand) { resolve(); return; }
        overlay.style.display = 'flex';
        const duration = Math.min(2000, Math.max(300, minutes * 18));
        const start = Date.now();
        const wt = startSnapshot || gameConfig.worldTime || DEFAULT_TIME;
        const startMin = (wt.hour || 8) * 60 + (wt.minute || 0);
        const totalMin = Math.max(0, Number(minutes) || 0);

        function animate() {
            const elapsed = Date.now() - start;
            const progress = Math.min(elapsed / duration, 1);
            const curMin = startMin + totalMin * progress;
            hourHand.style.transform = `translateX(-50%) rotate(${((curMin / 60) % 12) * 30}deg)`;
            minuteHand.style.transform = `translateX(-50%) rotate(${(curMin % 60) * 6}deg)`;
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                overlay.style.opacity = '0';
                setTimeout(() => {
                    overlay.style.display = 'none';
                    overlay.style.opacity = '1';
                    resolve();
                }, 400);
            }
        }
        animate();
    });
}

// ===== 导出到 window =====
window.updateWorldTimeUI = updateWorldTimeUI;
window.addWorldTime = addWorldTime;
