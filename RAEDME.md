# Zippping

面向求职材料的 macOS 批量图片压缩器。支持将 JPG、PNG、WEBP、GIF、BMP、TIFF、HEIC、AVIF 和 PDF 拖入窗口，统一输出 JPG，并保证单个文件不超过设定大小。

## 推荐方式：网页点击下载 Mac 安装包

源码压缩包不能直接双击运行。因为里面没有 Mac 专用的 Electron 和原生图片处理组件；如果直接把这个文件夹发给朋友，他还需要安装开发环境并执行命令。

项目已经配置好 GitHub 自动打包。操作一次后，你和朋友都可以用网页点击下载：

1. 在 GitHub 新建一个仓库，把这个项目文件夹上传进去（不要上传 `node_modules` 文件夹）。
2. 打开仓库的 `Actions` 页面，选择 `Build Zippping for macOS`。
3. 点击右侧的 `Run workflow`，再点击绿色的 `Run workflow`。
4. 等待构建完成，点进这次运行记录，在底部 `Artifacts` 区域点击 `Zippping-macOS` 下载。
5. 下载后会得到一个压缩包，里面有 `Zippping-...dmg` 和 `Zippping-...zip`。把 `.dmg` 发给朋友最方便：朋友双击 `.dmg`，再把 Zippping 拖到 `Applications` 文件夹即可。

以后只要在 GitHub 网页上重复第 2-4 步，就能重新生成可点击下载的 Mac 版本，不需要打开命令行。

首次打开未签名应用时，如果 macOS 提示无法验证开发者：右键 Zippping，选择“打开”，再确认一次即可。正式公开分发时可以再配置 Apple Developer 签名和公证。

## 开发者本地运行

```bash
npm install
npm run dev
```

本地构建可分发的 macOS 安装包：

```bash
npm run build:mac
```

应用完全在本机处理文件。压缩策略会先在原始分辨率上寻找尽可能高的 JPEG 质量；仅当最低质量仍然超过限制时，才逐步缩小图片尺寸。PDF 会逐页生成 `文件名-page-01.jpg` 等文件。

> 说明：`electron-builder --mac` 需要在 macOS 上运行；上面的 GitHub Actions 会自动提供一台 macOS 构建机。
