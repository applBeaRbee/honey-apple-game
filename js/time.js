// ================= World time system =================
import { gameConfig } from './state.js';

const DEFAULT_TIME = { day: 1, hour: 8, minute: 0 };
const MINUTES_PER_DAY = 1440;
const MAX_JSON_ELAPSED_MINUTES = 30 * MINUTES_PER_DAY;
const MAX_NARRATIVE_ELAPSED_MINUTES = 7 * MINUTES_PER_DAY;
const MAX_ABSOLUTE_JUMP_MINUTES = 30 * MINUTES_PER_DAY;

const CN = {
    day: '\u5929',
    dateDay: '\u65e5',
    ordinal: '\u7b2c',
    am: '\u4e0a\u5348',
    pm: '\u4e0b\u5348',
    morning: '\u65e9\u4e0a',
    dawn: '\u6e05\u6668',
    noon: '\u4e2d\u5348',
    afternoon: '\u4e0b\u5348',
    evening: '\u665a\u4e0a',
    dusk: '\u508d\u665a',
    night: '\u591c\u665a',
    midnight: '\u6df1\u591c',
    earlyMorning: '\u51cc\u6668',
    half: '\u534a',
    hour: '\u5c0f\u65f6',
    clockHour: '\u65f6',
    minute: '\u5206\u949f',
    minuteShort: '\u5206',
    dayShort: '\u65e5'
};

const CN_DIGITS = '[0-9\\u96f6\\u3007\\u4e00\\u4e8c\\u4e24\\u5169\\u4e09\\u56db\\u4e94\\u516d\\u4e03\\u516b\\u4e5d\\u5341]+';
const PERIOD_PATTERN = '(\\u51cc\\u6668|\\u65e9\\u4e0a|\\u6e05\\u6668|\\u4e0a\\u5348|\\u4e2d\\u5348|\\u4e0b\\u5348|\\u508d\\u665a|\\u665a\\u4e0a|\\u591c\\u665a|\\u6df1\\u591c)?';
const CLOCK_MARK_PATTERN = '(?:[:\\uff1a]|\\u70b9|\\u65f6(?!\\u95f4|\\u5019|\\u957f|\\u5149|\\u95f4))';

function clampInt(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function cloneTime(value) {
    return { day: value.day, hour: value.hour, minute: value.minute };
}

export function normalizeWorldTime(value = {}) {
    const day = Math.max(1, clampInt(value.day, DEFAULT_TIME.day));
    const hour = clampInt(value.hour, DEFAULT_TIME.hour);
    const minute = clampInt(value.minute, DEFAULT_TIME.minute);
    return totalToWorldTime(Math.max(0, (day - 1) * MINUTES_PER_DAY + hour * 60 + minute));
}

export function worldTimeToMinutes(value = DEFAULT_TIME) {
    const wt = normalizeWorldTime(value);
    return (wt.day - 1) * MINUTES_PER_DAY + wt.hour * 60 + wt.minute;
}

export function totalToWorldTime(totalMinutes) {
    const total = Math.max(0, Math.round(Number(totalMinutes) || 0));
    return {
        day: Math.floor(total / MINUTES_PER_DAY) + 1,
        hour: Math.floor((total % MINUTES_PER_DAY) / 60),
        minute: total % 60
    };
}

function parseChineseNumberToken(token) {
    if (token === undefined || token === null) return null;
    const raw = String(token).trim();
    if (!raw) return null;
    if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
    if (raw === '\u534a') return 0.5;

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

function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function capMinutes(minutes, maxMinutes) {
    if (!Number.isFinite(minutes) || minutes <= 0) return 0;
    return Math.min(Math.round(minutes), maxMinutes);
}

export function formatTimeDisplay(hour, minute) {
    const h = ((clampInt(hour, 8) % 24) + 24) % 24;
    const label = h >= 12 ? CN.pm : CN.am;
    const hh = h % 12 || 12;
    return `${label} ${hh}:${String(clampInt(minute, 0)).padStart(2, '0')}`;
}

export function formatTimeShort(day, hour, minute) {
    return `${CN.ordinal}${day ?? 1}${CN.day} ${formatTimeDisplay(hour ?? 8, minute ?? 0)}`;
}

export function formatWorldTime(value = getWorldTimeSnapshot()) {
    const wt = normalizeWorldTime(value);
    return `${CN.ordinal}${wt.day}${CN.day} ${String(wt.hour).padStart(2, '0')}:${String(wt.minute).padStart(2, '0')}`;
}

export function updateWorldTimeUI() {
    const el = document.getElementById('worldTimeDisplay');
    if (!gameConfig?.worldTime) {
        if (el) el.style.display = 'none';
        return;
    }
    gameConfig.worldTime = normalizeWorldTime(gameConfig.worldTime);
    if (el) {
        el.innerText = `\u{1f552} ${formatTimeShort(gameConfig.worldTime.day, gameConfig.worldTime.hour, gameConfig.worldTime.minute)}`;
        el.style.display = 'inline-block';
    }
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
    const amount = normalizeMinutes(minutes, 0, MAX_JSON_ELAPSED_MINUTES);
    if (amount <= 0) return { before, after: before, minutes: 0 };
    gameConfig.worldTime = totalToWorldTime(worldTimeToMinutes(before) + amount);
    updateWorldTimeUI();
    return { before, after: getWorldTimeSnapshot(), minutes: amount };
}

export function normalizeMinutes(value, fallback = 10, maxMinutes = MAX_JSON_ELAPSED_MINUTES) {
    if (typeof value === 'number') return capMinutes(value, maxMinutes) || fallback;
    if (typeof value === 'string') {
        const parsed = parseElapsedMinutes(value, { requireTrigger: false, maxMinutes });
        if (parsed > 0) return parsed;
        const numeric = Number(value.trim());
        if (Number.isFinite(numeric)) return capMinutes(numeric, maxMinutes) || fallback;
    }
    if (isPlainObject(value)) {
        const total = Number(value.days ?? value.day ?? 0) * MINUTES_PER_DAY
            + Number(value.hours ?? value.hour ?? 0) * 60
            + Number(value.minutes ?? value.minute ?? 0);
        return capMinutes(total, maxMinutes) || fallback;
    }
    return fallback;
}

function normalizeHourByPeriod(hour, period = '') {
    let h = Number(hour);
    if (!Number.isFinite(h)) return null;
    if (/\u4e0b\u5348|\u508d\u665a|\u665a\u4e0a|\u591c\u665a/.test(period) && h < 12) h += 12;
    if (/\u6df1\u591c|\u51cc\u6668/.test(period) && h === 12) h = 0;
    if (/\u4e2d\u5348/.test(period) && h < 11) h += 12;
    if (h === 24) h = 0;
    return h >= 0 && h <= 23 ? h : null;
}

function buildAbsoluteTime({ dayToken, period, hourToken, minuteToken, explicitDay }) {
    const rawHour = parseChineseNumberToken(hourToken);
    if (!Number.isFinite(rawHour)) return null;
    const hour = normalizeHourByPeriod(rawHour, period);
    if (!Number.isFinite(hour)) return null;

    let minute = 0;
    if (minuteToken) {
        if (minuteToken === '\u534a') minute = 30;
        else {
            const parsedMinute = parseChineseNumberToken(minuteToken);
            minute = Number.isFinite(parsedMinute) ? parsedMinute : 0;
        }
    }
    if (minute < 0 || minute >= 60) return null;

    const current = getWorldTimeSnapshot();
    const parsedDay = parseChineseNumberToken(dayToken);
    let candidate = normalizeWorldTime({
        day: Number.isFinite(parsedDay) && parsedDay > 0 ? parsedDay : current.day,
        hour,
        minute
    });

    if (!explicitDay && worldTimeToMinutes(candidate) + 30 < worldTimeToMinutes(current)) {
        candidate = normalizeWorldTime({ ...candidate, day: candidate.day + 1 });
    }
    return candidate;
}

function parseWorldTimeObject(value) {
    if (!isPlainObject(value)) return null;
    if (value.day !== undefined || value.hour !== undefined || value.minute !== undefined) {
        return normalizeWorldTime(value);
    }
    const nested = value.world_time ?? value.worldTime ?? value.current_time ?? value.currentTime ?? value.time;
    if (nested) return parseWorldTime(nested, { source: 'json' });
    if (value.date || value.clock) return parseWorldTime(`${value.date || ''} ${value.clock || ''}`, { source: 'json' });
    return null;
}

function hasCurrentTimeIntent(text) {
    return /\u73b0\u5728|\u6b64\u523b|\u5f53\u524d|\u8fd9\u65f6|\u6b64\u65f6|\u65f6\u95f4|\u65f6\u949f|\u949f\u8868|\u5929\u8272|\u5df2\u662f|\u6765\u5230|\u5230\u4e86/.test(text);
}

function hasExplicitClockContext(text) {
    return /\u624b\u673a|\u95f9\u949f|\u949f\u8868|\u65f6\u949f|\u5c4f\u5e55|\u8868\u76d8|\u770b\u4e86\u4e00\u773c|\u65f6\u95f4/.test(text)
        || /\*\*\s*\d{1,2}[:\uff1a]\d{1,2}\s*\*\*/.test(text);
}

function parseAbsoluteFromText(text, options = {}) {
    if (!text) return null;
    const source = String(text);
    const sourceType = options.source || 'narrative';
    const allowLoose = sourceType === 'json' || sourceType === 'manual';
    const labelPattern = '(?:\u5f53\u524d\u65f6\u95f4|\u4e16\u754c\u65f6\u95f4|\u73b0\u5728\u65f6\u95f4|\u76ee\u524d\u65f6\u95f4|\u65f6\u95f4\u72b6\u6001|\u65f6\u95f4)';
    const hasTimeLabel = new RegExp(labelPattern).test(source);

    if (sourceType === 'narrative' && !hasTimeLabel && !hasExplicitClockContext(source)) return null;

    const timePrefix = hasTimeLabel ? labelPattern + '\\s*[:：]?\\s*' : '';
    const dayPattern = new RegExp(timePrefix + '(?:\\u7b2c\\s*)?(' + CN_DIGITS + ')\\s*(?:\\u5929|\\u65e5)[\\s\\S]{0,24}?' + PERIOD_PATTERN + '\\s*(' + CN_DIGITS + ')' + CLOCK_MARK_PATTERN + '\\s*(' + CN_DIGITS + '|\\u534a)?');
    let match = source.match(dayPattern);
    if (match) {
        return buildAbsoluteTime({ dayToken: match[1], period: match[2], hourToken: match[3], minuteToken: match[4], explicitDay: true });
    }

    const digitalPattern = new RegExp(timePrefix + PERIOD_PATTERN + '\\s*(\\d{1,2})\\s*[:\\uff1a]\\s*(\\d{1,2})');
    match = source.match(digitalPattern);
    if (match && (allowLoose || hasCurrentTimeIntent(source) || hasExplicitClockContext(source) || match[1])) {
        return buildAbsoluteTime({ period: match[1], hourToken: match[2], minuteToken: match[3], explicitDay: false });
    }

    const clockPattern = new RegExp(timePrefix + PERIOD_PATTERN + '\\s*(' + CN_DIGITS + ')' + CLOCK_MARK_PATTERN + '\\s*(' + CN_DIGITS + '|\\u534a)?');
    match = source.match(clockPattern);
    if (!match) return null;
    if (!allowLoose && !hasCurrentTimeIntent(source) && !hasExplicitClockContext(source) && !match[1]) return null;
    return buildAbsoluteTime({ period: match[1], hourToken: match[2], minuteToken: match[3], explicitDay: false });
}

export function parseWorldTime(value, options = {}) {
    if (!value) return null;
    if (isPlainObject(value)) return parseWorldTimeObject(value);
    return parseAbsoluteFromText(String(value), options);
}

function getParsedAbsoluteTime(parsed = null) {
    const candidates = [
        parsed?.world_time,
        parsed?.worldTime,
        parsed?.current_time,
        parsed?.currentTime,
        parsed?.time_state,
        parsed?.timeState,
        parsed?.time
    ];
    for (const candidate of candidates) {
        const parsedTime = parseWorldTime(candidate, { source: 'json' });
        if (parsedTime) return parsedTime;
    }
    return null;
}

function validateAbsoluteCandidate(candidate, before, source = 'json') {
    if (!candidate) return null;
    const now = worldTimeToMinutes(before);
    const next = worldTimeToMinutes(candidate);
    const delta = next - now;
    if (delta < 0) return null;
    if (delta > MAX_ABSOLUTE_JUMP_MINUTES && source !== 'json') return null;
    if (delta > MAX_JSON_ELAPSED_MINUTES) return null;
    return { time: candidate, minutes: delta };
}

export function extractAbsoluteWorldTime(parsed = null, aiText = '') {
    const before = getWorldTimeSnapshot();
    const jsonTime = validateAbsoluteCandidate(getParsedAbsoluteTime(parsed), before, 'json');
    const narrativeTime = validateAbsoluteCandidate(parseWorldTime(aiText, { source: 'narrative' }), before, 'narrative');
    if (narrativeTime && (!jsonTime || narrativeTime.minutes > jsonTime.minutes)) return narrativeTime.time;
    if (jsonTime) return jsonTime.time;
    return narrativeTime?.time || null;
}

function parseElapsedMinutes(text, options = {}) {
    if (!text) return 0;
    const source = String(text);
    const requireTrigger = options.requireTrigger !== false;
    const maxMinutes = options.maxMinutes || MAX_NARRATIVE_ELAPSED_MINUTES;
    const trigger = '(?:\\u65f6\\u95f4\\u63a8\\u8fdb|\\u7ecf\\u8fc7|\\u8fc7\\u53bb|\\u8fc7\\u4e86|\\u53c8\\u8fc7|\\u6301\\u7eed|\\u82b1\\u4e86|\\u8017\\u65f6|\\u7b49\\u4e86|\\u804a\\u4e86|\\u7761\\u4e86|\\u4f11\\u606f\\u4e86)';
    const prefix = requireTrigger ? trigger + '[\\s\\S]{0,8}?' : '[\\s\\S]{0,8}?';
    const units = [
        { pattern: '(?:\\u5929|\\u65e5|day|days|d)', scale: MINUTES_PER_DAY },
        { pattern: '(?:\\u5c0f\\u65f6|\\u949f\\u5934|hour|hours|hr|hrs|h)', scale: 60 },
        { pattern: '(?:\\u5206\\u949f|\\u5206|min|mins|minute|minutes|m)', scale: 1 }
    ];

    if (new RegExp(prefix + '\\u534a\\s*(?:\\u4e2a)?\\s*(?:\\u5c0f\\u65f6|hour|h)', 'i').test(source)) {
        return capMinutes(30, maxMinutes);
    }

    const vagueElapsed = [
        { pattern: /\u8fc7\u4e86?\u4e00\u4f1a\u513f|\u4e00\u4f1a\u513f\u540e|\u7247\u523b\u540e|\u7a0d\u540e|\u4e0d\u4e45\u540e/, minutes: 10 },
        { pattern: /\u8bb8\u4e45\u540e|\u826f\u4e45|\u534a\u664c|\u8fc7\u4e86?\u5f88\u4e45/, minutes: 30 },
        { pattern: /\u534a\u5929\u540e|\u5927\u534a\u5929/, minutes: 360 }
    ];
    for (const item of vagueElapsed) {
        if (item.pattern.test(source)) return capMinutes(item.minutes, maxMinutes);
    }

    const halfFuture = source.match(new RegExp('\\u534a\\s*(?:\\u4e2a)?\\s*(?:\\u5c0f\\u65f6|hour|h)\\s*(?:\\u540e|\\u4e4b\\u540e|\\u4ee5\\u540e)', 'i'));
    if (halfFuture) return capMinutes(30, maxMinutes);

    for (const unit of units) {
        const future = source.match(new RegExp('(' + CN_DIGITS + '|\\d+(?:\\.\\d+)?)\\s*' + unit.pattern + '\\s*(?:\\u540e|\\u4e4b\\u540e|\\u4ee5\\u540e|\\u8fc7\\u53bb)', 'i'));
        if (future) {
            const amount = parseChineseNumberToken(future[1]);
            const minutes = Number.isFinite(amount) ? amount * unit.scale : 0;
            const capped = capMinutes(minutes, maxMinutes);
            if (capped > 0) return capped;
        }

        const match = source.match(new RegExp(prefix + '(' + CN_DIGITS + '|\\d+(?:\\.\\d+)?)\\s*' + unit.pattern, 'i'));
        if (!match) continue;
        const amount = parseChineseNumberToken(match[1]);
        const minutes = Number.isFinite(amount) ? amount * unit.scale : 0;
        const capped = capMinutes(minutes, maxMinutes);
        if (capped > 0) return capped;
    }
    return 0;
}

function inferNarrativeDayJump(text) {
    if (!text) return 0;
    if (/\u7b2c\u4e8c\u5929|\u6b21\u65e5|\u7fcc\u65e5|\u8fc7\u591c|\u5929\u4eae|\u4e00\u89c9\u7761\u5230/.test(text)) return 480;
    return 0;
}

export function inferPassTime(userText = '', aiText = '', parsed = null) {
    const explicit = parsed?.pass_time ?? parsed?.time_passed ?? parsed?.elapsed_minutes ?? parsed?.elapsedMinutes ?? parsed?.passTime;
    if (explicit !== undefined) return normalizeMinutes(explicit, 0, MAX_JSON_ELAPSED_MINUTES);

    const absolute = extractAbsoluteWorldTime(parsed, aiText);
    if (absolute) return Math.max(0, worldTimeToMinutes(absolute) - worldTimeToMinutes(getWorldTimeSnapshot()));

    const text = `${userText || ''}\n${aiText || ''}`;
    const elapsed = parseElapsedMinutes(text, { requireTrigger: true, maxMinutes: MAX_NARRATIVE_ELAPSED_MINUTES });
    if (elapsed > 0) return elapsed;
    return inferNarrativeDayJump(text);
}

export function applyTurnTime(userText = '', aiText = '', parsed = null, options = {}) {
    if (!gameConfig?.worldTime) return { before: cloneTime(DEFAULT_TIME), after: cloneTime(DEFAULT_TIME), minutes: 0, changed: false, source: 'disabled' };
    gameConfig.worldTime = normalizeWorldTime(gameConfig.worldTime);
    const before = getWorldTimeSnapshot();
    if (options.advance === false) return { before, after: before, minutes: 0, changed: false, source: 'skipped' };

    const jsonAbsolute = validateAbsoluteCandidate(getParsedAbsoluteTime(parsed), before, 'json');
    const narrativeAbsolute = validateAbsoluteCandidate(parseWorldTime(aiText, { source: 'narrative' }), before, 'narrative');
    const preferredAbsolute = narrativeAbsolute && (!jsonAbsolute || narrativeAbsolute.minutes > jsonAbsolute.minutes)
        ? { ...narrativeAbsolute, source: 'narrative-absolute' }
        : (jsonAbsolute ? { ...jsonAbsolute, source: 'json-absolute' } : null);
    if (preferredAbsolute) {
        gameConfig.worldTime = normalizeWorldTime(preferredAbsolute.time);
        updateWorldTimeUI();
        return { before, after: getWorldTimeSnapshot(), minutes: preferredAbsolute.minutes, changed: preferredAbsolute.minutes > 0, source: preferredAbsolute.source };
    }

    const explicit = parsed?.pass_time ?? parsed?.time_passed ?? parsed?.elapsed_minutes ?? parsed?.elapsedMinutes ?? parsed?.passTime;
    if (explicit !== undefined) {
        const minutes = normalizeMinutes(explicit, 0, MAX_JSON_ELAPSED_MINUTES);
        const change = addWorldTime(minutes);
        return { ...(change || { before, after: before, minutes: 0 }), changed: minutes > 0, source: 'json-elapsed' };
    }

    const minutes = inferPassTime(userText, aiText, null);
    const change = addWorldTime(minutes);
    return { ...(change || { before, after: before, minutes: 0 }), changed: minutes > 0, source: minutes > 0 ? 'narrative-elapsed' : 'none' };
}

export function describeTimePass(minutes) {
    if (minutes >= 1440 * 30) return '\u4fee\u771f\u65e0\u5c81\u6708\uff0c\u4e16\u4e0a\u5df2\u5343\u5e74...';
    if (minutes >= 1440) return '\u51e0\u65e5\u4e4b\u540e...';
    if (minutes >= 480) return '\u4e00\u591c\u65e0\u8bdd...';
    return '\u65f6\u5149\u6d41\u8f6c...';
}

export function getWorldTimeSnapshot() {
    if (!gameConfig?.worldTime) return cloneTime(DEFAULT_TIME);
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

window.updateWorldTimeUI = updateWorldTimeUI;
window.addWorldTime = addWorldTime;
