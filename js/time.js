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

function inferElapsedMinutesSmart(text) {
    if (!text) return 0;
    const source = String(text);
    const num = '[0-9\\u96f6\\u3007\\u4e00\\u4e8c\\u4e24\\u5169\\u4e09\\u56db\\u4e94\\u516d\\u4e03\\u516b\\u4e5d\\u5341]+';
    const trigger = '(?:\\u7ecf\\u8fc7|\\u8fc7\\u53bb|\\u8fc7\\u4e86|\\u6301\\u7eed|\\u82b1\\u4e86|\\u8017\\u65f6|\\u7b49\\u4e86|\\u804a\\u4e86)';

    if (new RegExp(trigger + '[\\s\\S]{0,6}\\u534a\\s*(?:\\u4e2a)?\\s*\\u5c0f\\u65f6').test(source)) return 30;

    const unitMap = [
        { pattern: '(?:\\u5929|\\u65e5)', scale: 1440 },
        { pattern: '(?:\\u5c0f\\u65f6|\\u949f\\u5934)', scale: 60 },
        { pattern: '(?:\\u5206\\u949f|\\u5206)', scale: 1 }
    ];
    for (const unit of unitMap) {
        const match = source.match(new RegExp(trigger + '[\\s\\S]{0,8}?(' + num + ')\\s*' + unit.pattern));
        if (!match) continue;
        const amount = parseChineseNumberToken(match[1]);
        if (Number.isFinite(amount) && amount > 0) return Math.round(amount * unit.scale);
    }
    return 0;
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

function parseChineseNumberToken(token) {
    if (token === undefined || token === null) return null;
    const raw = String(token).trim();
    if (!raw) return null;
    if (/^\d+$/.test(raw)) return Number(raw);
    if (raw === '\u534a') return 30;
    const map = {
        '\u96f6': 0, '\u3007': 0, '\u4e00': 1, '\u4e8c': 2, '\u4e24': 2, '\u5169': 2,
        '\u4e09': 3, '\u56db': 4, '\u4e94': 5, '\u516d': 6, '\u4e03': 7, '\u516b': 8, '\u4e5d': 9
    };
    if (raw.length === 1 && map[raw] !== undefined) return map[raw];
    if (raw.includes('\u5341')) {
        const [left, right] = raw.split('\u5341');
        const tens = left ? map[left] : 1;
        const ones = right ? map[right] : 0;
        if (tens !== undefined && ones !== undefined) return tens * 10 + ones;
    }
    let value = 0;
    for (const ch of raw) {
        if (map[ch] === undefined) return null;
        value = value * 10 + map[ch];
    }
    return value;
}

function normalizeClockParts(dayToken, period, hourToken, minuteToken) {
    let hour = parseChineseNumberToken(hourToken);
    if (!Number.isFinite(hour)) return null;
    let minute = minuteToken ? parseChineseNumberToken(minuteToken) : 0;
    if (!Number.isFinite(minute)) minute = 0;
    if (minuteToken === '\u534a') minute = 30;
    if (hour < 0 || hour > 24 || minute < 0 || minute >= 60) return null;

    const p = period || '';
    if (/\u4e0b\u5348|\u508d\u665a|\u665a\u4e0a|\u591c\u665a/.test(p) && hour < 12) hour += 12;
    if (/\u6df1\u591c|\u51cc\u6668/.test(p) && hour === 12) hour = 0;
    if (/\u4e2d\u5348/.test(p) && hour < 11) hour += 12;
    if (hour === 24) hour = 0;

    const current = getWorldTimeSnapshot();
    const parsedDay = parseChineseNumberToken(dayToken);
    let candidate = normalizeWorldTime({
        day: Number.isFinite(parsedDay) && parsedDay > 0 ? parsedDay : current.day,
        hour,
        minute
    });
    if (!Number.isFinite(parsedDay) && worldTimeToMinutes(candidate) + 30 < worldTimeToMinutes(current)) {
        candidate = normalizeWorldTime({ ...candidate, day: candidate.day + 1 });
    }
    return candidate;
}

function parseClockSmart(text) {
    if (!text) return null;
    const source = String(text);
    const num = '[0-9\\u96f6\\u3007\\u4e00\\u4e8c\\u4e24\\u5169\\u4e09\\u56db\\u4e94\\u516d\\u4e03\\u516b\\u4e5d\\u5341]+';
    const period = '(\\u51cc\\u6668|\\u65e9\\u4e0a|\\u6e05\\u6668|\\u4e0a\\u5348|\\u4e2d\\u5348|\\u4e0b\\u5348|\\u508d\\u665a|\\u665a\\u4e0a|\\u591c\\u665a|\\u6df1\\u591c)?';
    const clockMark = '(?:[:\\uff1a]|\\u70b9|\\u65f6(?!\\u95f4|\\u5019|\\u957f|\\u5149))';

    let match = source.match(new RegExp('(?:\\u7b2c\\s*)?(' + num + ')\\s*(?:\\u5929|\\u65e5)[\\s\\S]{0,16}?' + period + '\\s*(' + num + ')' + clockMark + '\\s*(' + num + '|\\u534a)?'));
    if (match) return normalizeClockParts(match[1], match[2], match[3], match[4]);

    match = source.match(new RegExp(period + '\\s*(' + num + ')' + clockMark + '\\s*(' + num + '|\\u534a)?'));
    if (!match) return null;
    return normalizeClockParts(null, match[1], match[2], match[3]);
}

export function parseWorldTime(value) {
    if (!value) return null;
    if (typeof value === 'object') {
        if (value.day !== undefined || value.hour !== undefined || value.minute !== undefined) return normalizeWorldTime(value);
        if (value.date || value.time) return parseWorldTime(`${value.date || ''} ${value.time || ''}`);
    }
    return parseClockSmart(value) || parseClock(value);
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
    const absolute = extractAbsoluteWorldTime(parsed, aiText);
    if (absolute) return Math.max(0, worldTimeToMinutes(absolute) - worldTimeToMinutes(getWorldTimeSnapshot()));

    const text = `${userText || ''}\n${aiText || ''}`;
    const smartElapsed = inferElapsedMinutesSmart(text);
    if (smartElapsed > 0) return smartElapsed;
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

    const absolute = extractAbsoluteWorldTime(parsed, aiText);
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
