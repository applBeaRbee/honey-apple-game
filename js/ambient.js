// ================= 环境氛围系统 =================
export function updateAmbientEnvironment(ambient) {
    const layer = document.getElementById('ambientLayer');
    if (!layer) return;
    // 移除所有环境类
    layer.className = 'ambient-layer';
    if (ambient?.time) {
        const timeMap = { '清晨': 'time-morning', '早晨': 'time-morning', '早上': 'time-morning', '黄昏': 'time-dusk', '傍晚': 'time-dusk', '夜晚': 'time-night', '夜间': 'time-night', '深夜': 'time-night' };
        for (const [k, v] of Object.entries(timeMap)) {
            if (ambient.time.includes(k)) { layer.classList.add(v); break; }
        }
        if (ambient.time.includes('雨') || ambient.time.includes('暴雨')) layer.classList.add('weather-rain');
        if (ambient.time.includes('雾')) layer.classList.add('weather-fog');
    }
    if (ambient?.weather) {
        if (ambient.weather.includes('雨')) layer.classList.add('weather-rain');
        if (ambient.weather.includes('雾')) layer.classList.add('weather-fog');
    }
    layer.style.opacity = layer.className === 'ambient-layer' ? '0' : '1';
}
