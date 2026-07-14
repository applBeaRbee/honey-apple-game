const DEFAULT_BASE_URL = 'https://opencode.ai/zen/v1';
const DEFAULT_MODEL = 'mimo-v2.5-free';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Max-Age': '86400'
};

function jsonResponse(body, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json; charset=utf-8',
            ...extraHeaders
        }
    });
}

function getBearerToken(request) {
    const auth = request.headers.get('Authorization') || '';
    const match = auth.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : '';
}

function normalizeBaseUrl(baseUrl) {
    return (baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
}

function upstreamUrl(env) {
    const baseUrl = normalizeBaseUrl(env.OPENAI_BASE_URL);
    if (/\/chat\/completions$/i.test(baseUrl)) return baseUrl;
    if (/\/v\d+$/i.test(baseUrl)) return `${baseUrl}/chat/completions`;
    return `${baseUrl}/v1/chat/completions`;
}

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: CORS_HEADERS });
        }

        if (request.method !== 'POST') {
            return jsonResponse({ error: { message: 'Only POST is supported.' } }, 405);
        }

        const proxyToken = env.PROXY_TOKEN || '';
        if (proxyToken && getBearerToken(request) !== proxyToken) {
            return jsonResponse({ error: { message: 'Invalid proxy token.' } }, 401);
        }

        if (!env.OPENAI_API_KEY) {
            return jsonResponse({ error: { message: 'Worker missing OPENAI_API_KEY.' } }, 500);
        }

        let payload;
        try {
            payload = await request.json();
        } catch (_) {
            return jsonResponse({ error: { message: 'Invalid JSON body.' } }, 400);
        }

        payload.model = payload.model || env.OPENAI_MODEL || DEFAULT_MODEL;

        const upstream = await fetch(upstreamUrl(env), {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const headers = {
            ...CORS_HEADERS,
            'Content-Type': upstream.headers.get('Content-Type') || 'application/json; charset=utf-8'
        };
        const retryAfter = upstream.headers.get('retry-after');
        if (retryAfter) headers['retry-after'] = retryAfter;

        return new Response(await upstream.text(), {
            status: upstream.status,
            headers
        });
    }
};
