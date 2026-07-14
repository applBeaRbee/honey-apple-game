# Honey Apple Game

一个静态网页剧情游戏项目，可直接通过 GitHub Pages 发布。

## 本地预览

在项目根目录运行：

```powershell
py -m http.server 4174
```

然后打开：

```text
http://localhost:4174/
```

## GitHub Pages 发布

1. 将代码推送到 GitHub 仓库的 `main` 分支。
2. 打开仓库页面的 `Settings`。
3. 进入 `Pages`。
4. 在 `Build and deployment` 中选择：
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/ (root)`
5. 保存后等待 GitHub Pages 部署完成。

## 目录说明

- `index.html`: 页面入口。
- `css/`: 样式文件。
- `js/`: 游戏逻辑和前端模块。
- `.nojekyll`: 禁用 GitHub Pages 的 Jekyll 处理，确保静态资源按原路径发布。

## 发布注意

本项目使用相对路径加载本地资源，适合直接发布到 GitHub Pages。云端存储或第三方 API 服务如果限制域名，发布后需要把 GitHub Pages 域名加入对应服务的允许列表。
## Cloudflare Worker AI 代理

项目内置了一个 OpenAI-compatible 后端代理示例，适合把 GitHub Pages 前端连接到 OpenCode，避免浏览器 CORS 和公共代理共享 IP 限流。

代理文件：`worker/opencode-proxy.js`

部署步骤：

```powershell
cd worker
copy wrangler.example.toml wrangler.toml
npm create cloudflare@latest
wrangler login
wrangler secret put OPENAI_API_KEY
wrangler secret put PROXY_TOKEN
wrangler deploy
```

密钥说明：

- `OPENAI_API_KEY`：你的 OpenCode API Key，只保存在 Cloudflare Worker，不要提交到 Git。
- `PROXY_TOKEN`：你自己随便生成的一串访问密码，前端 API Key 填这个，不填真实 OpenCode Key。
- `OPENAI_BASE_URL`：默认是 `https://opencode.ai/zen/v1`。
- `OPENAI_MODEL`：默认是 `mimo-v2.5-free`。

网页里这样填：

- API 地址：Worker 部署后的地址，例如 `https://honey-apple-ai-proxy.xxx.workers.dev`
- API Key：`PROXY_TOKEN`
- 模型名：`mimo-v2.5-free`
- 不要勾选 CORS 代理

如果 Worker 返回 `Invalid proxy token`，说明网页里填的 API Key 和 Worker 的 `PROXY_TOKEN` 不一致。若返回 OpenCode 的 `429`，说明上游免费模型仍在限流，需要等待或换更高额度模型。
