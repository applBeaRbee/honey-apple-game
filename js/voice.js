// ================= Voice input =================
import { showToast } from './ui.js';

export let isRecording = false;
let recognition = null;
let isSupported = false;
let finalTranscript = '';
let interimTranscript = '';
let activePointerId = null;

function updateVoiceButton(recording = isRecording) {
    const btn = document.getElementById('btnVoice');
    if (!btn) return;
    btn.classList.toggle('recording', recording);
    btn.setAttribute('aria-pressed', String(recording));
    btn.title = recording ? '松开结束语音输入' : '按住或点击开始语音输入';
}

function writeTranscript() {
    const input = document.getElementById('chatInput');
    if (!input) return;
    const text = `${finalTranscript}${interimTranscript}`.trim();
    if (!text) return;
    input.value = input.value.trim() ? `${input.value.trim()} ${text}` : text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    finalTranscript = '';
    interimTranscript = '';
}

function finishRecognition() {
    writeTranscript();
    isRecording = false;
    activePointerId = null;
    updateVoiceButton(false);
}

async function requestMicPermission() {
    if (!navigator.mediaDevices?.getUserMedia) return true;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        return true;
    } catch (error) {
        showToast('麦克风权限未开启，请在浏览器地址栏旁允许访问麦克风', 'warning', 5000);
        return false;
    }
}

export function setupVoiceEvents() {
    const btn = document.getElementById('btnVoice');
    if (!btn || btn.dataset.voiceBound === 'true') return;
    btn.dataset.voiceBound = 'true';
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        btn.disabled = true;
        btn.title = '当前浏览器不支持语音输入，请使用 Chrome 或 Edge';
        return;
    }
    isSupported = true;
    recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => { isRecording = true; updateVoiceButton(true); };
    recognition.onresult = event => {
        interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const text = event.results[i][0]?.transcript || '';
            if (event.results[i].isFinal) finalTranscript += text;
            else interimTranscript += text;
        }
        const input = document.getElementById('chatInput');
        if (input) input.placeholder = interimTranscript ? `识别中：${interimTranscript}` : '写下你的决定...';
    };
    recognition.onerror = event => {
        if (event.error !== 'aborted' && event.error !== 'no-speech') showToast(`语音输入失败：${event.error}`, 'warning', 4000);
        finishRecognition();
    };
    recognition.onend = () => { if (isRecording) finishRecognition(); };

    btn.addEventListener('pointerdown', event => {
        event.preventDefault();
        activePointerId = event.pointerId;
        btn.setPointerCapture?.(event.pointerId);
        startRecording();
    });
    btn.addEventListener('pointerup', event => {
        if (activePointerId !== event.pointerId) return;
        event.preventDefault();
        stopRecording();
    });
    btn.addEventListener('pointercancel', stopRecording);
    btn.addEventListener('lostpointercapture', () => { if (isRecording) stopRecording(); });
    btn.addEventListener('click', event => {
        if (event.detail === 0) isRecording ? stopRecording() : startRecording();
    });
}

export function startRecording() {
    if (!isSupported || !recognition || isRecording) return;
    finalTranscript = '';
    interimTranscript = '';
    requestMicPermission().then(ok => {
        if (!ok || isRecording) return;
        try {
            recognition.start();
            isRecording = true;
            updateVoiceButton(true);
        } catch (e) {
            if (e.name !== 'InvalidStateError') showToast('无法启动语音识别，请检查麦克风权限', 'warning');
        }
    });
}

export function stopRecording() {
    if (!recognition || !isRecording) return;
    writeTranscript();
    try { recognition.stop(); } catch (_) { finishRecognition(); }
    isRecording = false;
    updateVoiceButton(false);
    const input = document.getElementById('chatInput');
    if (input) input.placeholder = '写下你的决定...';
}

window.startRecording = startRecording;
window.stopRecording = stopRecording;
