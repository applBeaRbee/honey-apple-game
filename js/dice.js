// ================= 骰子系统 =================
import { showToast } from './ui.js';

export function rollD20() {
    const result = Math.floor(Math.random() * 20) + 1;
    let flavor = '普通';
    if (result === 20) flavor = '🎉 大成功！';
    else if (result >= 15) flavor = '成功';
    else if (result >= 10) flavor = '尚可';
    else if (result >= 5) flavor = '不妙';
    else flavor = '💀 大失败...';
    showToast(`🎲 D20 = ${result} (${flavor})`, result >= 15 ? 'success' : (result <= 5 ? 'error' : 'info'), 3000);
    return result;
}

export function rollDice(sides = 6) {
    return Math.floor(Math.random() * sides) + 1;
}

// ===== 导出到 window =====
window.rollD20 = rollD20;
