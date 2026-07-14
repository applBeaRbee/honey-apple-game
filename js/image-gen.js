// ================= 图片生成系统 =================
import { appState } from './state.js';
import { showToast } from './ui.js';

export function preloadTavernImage(imgElement, containerId, prompt, style = 'portrait') {
    if (!imgElement || !prompt) return;
    const container = document.getElementById(containerId);
    if (container) {
        const skeleton = container.querySelector('.img-skeleton');
        if (skeleton) skeleton.style.display = 'flex';
    }
    const loadingText = document.getElementById('cgLoadingText');
    if (loadingText) loadingText.innerText = '正在凝聚高光幻影...';

    // 尝试自定义 API
    const imgApiUrl = appState.settings.imgApiUrl;
    const imgApiKey = appState.settings.imgApiKey;
    const imgModel = appState.settings.imgModel;

    if (imgApiUrl && imgApiKey) {
        // 使用自定义 API
        fetch(imgApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${imgApiKey}` },
            body: JSON.stringify({
                model: imgModel || 'default',
                prompt: prompt,
                n: 1,
                size: style === 'wide' ? '1024x768' : '768x1024'
            })
        }).then(r => r.json()).then(data => {
            const url = data.data?.[0]?.url || data.url || data.image_url || data.data?.[0]?.image_url;
            if (url) { showImage(imgElement, containerId, url); return; }
            throw new Error('No URL');
        }).catch(() => {
            // 回退到 Pollinations
            fallbackPollinations(imgElement, containerId, prompt, style);
        });
    } else {
        // 直接使用 Pollinations
        fallbackPollinations(imgElement, containerId, prompt, style);
    }
}

export async function generateNpcPortrait(name, info, containerId) {
    try { name = decodeURIComponent(name); } catch (_) {}
    try { info = decodeURIComponent(info); } catch (_) {}
    const container = document.getElementById(containerId);
    if (!container) return;
    const prompt = `anime character portrait, polished visual novel NPC, ${name}, ${info || 'distinctive appearance'}, clean face, expressive eyes, soft studio lighting, detailed background, no text, no watermark`;
    container.classList.add('is-generating');
    container.innerHTML = '<span class="portrait-loading">生成中...</span>';

    try {
        const imgApiUrl = appState.settings.imgApiUrl?.trim();
        const imgApiKey = appState.settings.imgApiKey?.trim();
        let url = '';
        if (imgApiUrl && imgApiKey) {
            const response = await fetch(imgApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${imgApiKey}` },
                body: JSON.stringify({
                    model: appState.settings.imgModel || 'black-forest-labs/FLUX.1-schnell',
                    prompt,
                    n: 1,
                    size: '768x1024'
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error?.message || data.message || `HTTP ${response.status}`);
            url = data.data?.[0]?.url || data.data?.[0]?.image_url || data.url || data.image_url || '';
        }
        if (!url) {
            url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=flux&width=768&height=1024&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;
        }
        container.style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`;
        container.innerHTML = '<span class="portrait-ready">肖像</span>';
        container.classList.remove('is-generating');
        container.classList.add('has-portrait');
    } catch (error) {
        container.classList.remove('is-generating');
        container.innerHTML = '<span class="portrait-error">生成失败</span>';
        showToast(`NPC 肖像生成失败: ${error.message}`, 'error', 4000);
    }
}

function fallbackPollinations(imgElement, containerId, prompt, style) {
    const width = style === 'wide' ? 1024 : 768;
    const height = style === 'wide' ? 768 : 1024;
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${Math.floor(Math.random()*10000)}`;
    showImage(imgElement, containerId, url);
}

function showImage(imgElement, containerId, url) {
    const container = document.getElementById(containerId);
    if (container) {
        const skeleton = container.querySelector('.img-skeleton');
        if (skeleton) skeleton.style.display = 'none';
        container.classList.add('loaded');
    }
    imgElement.onload = () => {
        imgElement.style.display = 'block';
        const loadingText = document.getElementById('cgLoadingText');
        if (loadingText) loadingText.innerText = '✨ 幻影凝聚完成';
        setTimeout(() => {
            const cgLoading = document.getElementById('cgLoading');
            if (cgLoading) cgLoading.style.display = 'none';
        }, 500);
    };
    imgElement.onerror = () => {
        showToast('🖼️ 图像加载失败', 'error');
        if (container) container.style.display = 'none';
    };
    imgElement.src = url;
}

// ===== 导出到 window =====
window.preloadTavernImage = preloadTavernImage;
window.generateNpcPortrait = generateNpcPortrait;
