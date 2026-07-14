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
