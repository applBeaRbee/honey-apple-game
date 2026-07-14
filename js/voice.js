// ================= 语音输入系统 =================
export let isRecording = false;
let recognition = null;
let onResultCallback = null;

export function setupVoiceEvents() {
    const btn = document.getElementById('btnVoice');
    if (!btn) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        btn.disabled = true;
        btn.title = '浏览器不支持语音输入';
        return;
    }
    recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const input = document.getElementById('chatInput');
        if (input) {
            input.value = transcript;
            if (onResultCallback) onResultCallback(transcript);
        }
        stopRecording();
    };
    recognition.onerror = () => stopRecording();
    recognition.onend = () => {
        if (isRecording) stopRecording();
    };

    // 按住录音
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); startRecording(); });
    btn.addEventListener('mouseup', (e) => { e.preventDefault(); stopRecording(); });
    btn.addEventListener('mouseleave', () => stopRecording());
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); startRecording(); }, { passive: false });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); stopRecording(); }, { passive: false });
}

export function startRecording() {
    if (!recognition || isRecording) return;
    try {
        recognition.start();
        isRecording = true;
        const btn = document.getElementById('btnVoice');
        if (btn) btn.classList.add('recording');
    } catch (e) { /* ignore */ }
}

export function stopRecording() {
    if (!recognition || !isRecording) return;
    try { recognition.stop(); } catch (e) { /* ignore */ }
    isRecording = false;
    const btn = document.getElementById('btnVoice');
    if (btn) btn.classList.remove('recording');
}

export function setVoiceResultCallback(callback) {
    onResultCallback = callback;
}
