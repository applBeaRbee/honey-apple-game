// ================= 世界时间系统 =================
import { gameConfig } from './state.js';

export function formatTimeDisplay(hour, minute) {
    const h = hour % 24;
    const ampm = h >= 12 ? '下午' : '上午';
    const hh = h % 12 || 12;
    return `${ampm} ${hh}:${String(minute).padStart(2, '0')}`;
}

export function formatTimeShort(day, hour, minute) {
    return `第${day||1}天 ${formatTimeDisplay(hour||8, minute||0)}`;
}

export function updateWorldTimeUI() {
    const el = document.getElementById('worldTimeDisplay');
    if (!gameConfig?.worldTime) {
        if (el) el.style.display = 'none';
        return;
    }
    const wt = gameConfig.worldTime;
    el.innerText = `🕒 ${formatTimeShort(wt.day||1, wt.hour||8, wt.minute||0)}`;
    el.style.display = 'inline-block';
}

export function addWorldTime(minutes) {
    if (!gameConfig?.worldTime) return null;
    minutes = normalizeMinutes(minutes, 0);
    const wt = gameConfig.worldTime;
    const before = { ...wt };
    let total = (wt.day || 1) * 1440 + (wt.hour || 8) * 60 + (wt.minute || 0) + minutes;
    wt.day = Math.floor(total / 1440);
    total %= 1440;
    wt.hour = Math.floor(total / 60);
    wt.minute = total % 60;
    updateWorldTimeUI();
    return { before, after: { ...wt }, minutes };
}

export function normalizeMinutes(value, fallback = 10) {
    if (typeof value === 'number' && isFinite(value)) return Math.max(0, Math.round(value));
    if (typeof value === 'string') {
        const text = value.trim();
        const day = text.match(/(\d+(?:\.\d+)?)\s*(天|日|day)/i);
        const hour = text.match(/(\d+(?:\.\d+)?)\s*(小时|钟头|hour|h)/i);
        const minute = text.match(/(\d+(?:\.\d+)?)\s*(分钟|分|minute|min|m)/i);
        let total = 0;
        if (day) total += Number(day[1]) * 1440;
        if (hour) total += Number(hour[1]) * 60;
        if (minute) total += Number(minute[1]);
        if (total > 0) return Math.max(0, Math.round(total));
        const numeric = Number(text);
        if (isFinite(numeric)) return Math.max(0, Math.round(numeric));
    }
    if (value && typeof value === 'object') {
        const total = (Number(value.days || value.day || 0) * 1440) +
            (Number(value.hours || value.hour || 0) * 60) +
            Number(value.minutes || value.minute || 0);
        if (isFinite(total) && total > 0) return Math.round(total);
    }
    return fallback;
}

export function inferPassTime(userText = '', aiText = '', parsed = null) {
    const explicit = parsed?.pass_time ?? parsed?.time_passed ?? parsed?.elapsed_minutes;
    if (explicit !== undefined) return normalizeMinutes(explicit, 10);
    const text = `${userText}\n${aiText}`;
    if (/第二天|次日|翌日|一夜|睡到|过夜/.test(text)) return 480;
    if (/上午|下午|晚上|夜里|清晨|黄昏|放学|午休/.test(text)) return 60;
    if (/赶路|旅行|路程|长途|训练|上课|课程|社团活动/.test(text)) return 45;
    if (/等待|闲逛|休息|吃饭|洗澡|整理/.test(text)) return 20;
    if (/战斗|追逐|争吵|搜索|调查|潜入|谈话|聊天/.test(text)) return 10;
    return 5;
}

export function getWorldTimeSnapshot() {
    if (!gameConfig?.worldTime) return { day: 1, hour: 8, minute: 0 };
    return { ...gameConfig.worldTime };
}

export function animateTimePass(minutes, startSnapshot = null) {
    return new Promise((resolve) => {
        if (minutes < 60) { resolve(); return; }
        const overlay = document.getElementById('timePassOverlay');
        const hourHand = document.getElementById('clockHourHand');
        const minuteHand = document.getElementById('clockMinuteHand');
        overlay.style.display = 'flex';
        const duration = Math.min(2000, Math.max(300, minutes * 18));
        const start = Date.now();
        const wt = startSnapshot || gameConfig.worldTime;
        const startMin = (wt.hour || 8) * 60 + (wt.minute || 0);
        const totalMin = Math.max(0, Number(minutes) || 0);

        function animate() {
            const elapsed = Date.now() - start;
            const progress = Math.min(elapsed / duration, 1);
            const curMin = startMin + totalMin * progress;
            hourHand.style.transform = `translateX(-50%) rotate(${((curMin/60)%12)*30}deg)`;
            minuteHand.style.transform = `translateX(-50%) rotate(${(curMin%60)*6}deg)`;
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
