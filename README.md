# 本地视频压缩工具

这是一个基于 Vue、Vite 和 ffmpeg.wasm 的浏览器本地视频压缩网页。页面参考在线视频压缩工具的操作流程，但所有视频处理都在当前浏览器中完成，不上传服务器。

## 功能

- 拖拽或选择多个视频文件。
- 队列串行压缩，避免多个转码任务同时占满内存。
- 输出 MP4、MOV、MKV、WebM，支持 H.264、H.265、VP9、VP8 编码预设。
- 支持目标大小、最大宽度、压缩强度和音频保留设置。
- 单文件失败不会阻塞后续队列。
- 适配 GitHub Pages 静态部署。

## 开发

```bash
npm install
npm run dev
```

如果系统 npm 缓存目录没有权限，可以把缓存放到仓库内：

```bash
npm_config_cache=.npm-cache npm install
```

## 构建

```bash
npm run build
```

构建前会把 `@ffmpeg/core` 的单线程 wasm 资源复制到 `public/ffmpeg-core/`，再由 Vite 输出到 `dist/`。

## GitHub Pages

仓库包含 `.github/workflows/pages.yml`。推送到 `main` 后，GitHub Actions 会安装依赖、构建 `dist`，并发布到 GitHub Pages。

Vite 的 `base` 已设置为 `/Offline_video_encoding_tools/`。如果仓库名变化，需要同步修改 `vite.config.ts`。

## 说明

首版使用 ffmpeg.wasm 单线程核心，原因是 GitHub Pages 不能像自托管服务那样灵活配置跨源隔离响应头。长视频压缩会比较慢，建议先用短视频验证参数。
