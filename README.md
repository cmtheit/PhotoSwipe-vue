**FEEDBACK NEEDED** I am developing the new version - PhotoSwipe v6, please [read about upcoming changes and leave feedback](https://github.com/dimsemenov/PhotoSwipe/discussions/2170).



PhotoSwipe v5 — JavaScript image gallery and lightbox

**[Demo](https://photoswipe.com)** | **[Documentation](https://photoswipe.com/getting-started/)**

[![Sponsor via OpenCollective](https://img.shields.io/opencollective/all/photoswipe?label=Sponsor%20via%20OpenCollective)](https://opencollective.com/photoswipe)
[![Follow on Twitter](https://img.shields.io/twitter/follow/photoswipe?style=social)](https://twitter.com/intent/user?screen_name=photoswipe)


### Repo structure

- `src/` - 源码 JS 与 CSS
  - `src/js/photoswipe.js` - PhotoSwipe Core 入口
  - `src/js/lightbox/lightbox.js` - PhotoSwipe Lightbox 入口
- `docs/` - 文档（含架构与响应式 API 说明）
- `demo/` - Vue 3 示例（Vite），用于本地测试图库与响应式数据源
- `images/` - 本地开发时放置图片的目录（支持子目录，格式：jpg / png / gif / webp / avif / svg）
- `vite.config.js` - Vite 配置（Vue 插件、图片 API 中间件、局域网 host）
- `index.html` - 示例入口页

### 本地开发与 Vue 示例

本项目使用 **Vite + Vue 3** 做本地开发与示例，通过一个 HTML 页面测试 PhotoSwipe 与动态图源。

1. **安装依赖**（在仓库根目录）  
   `npm install` 或 `bun install`

2. **准备图片**  
   将图片放入根目录下的 `images/` 文件夹（可建子目录）。开发服务器会扫描该目录并对外提供接口与静态访问。

3. **启动开发服务器**  
   - `npm run dev` — 启动 Vite，默认 `http://localhost:5173`
   - `npm run dev:lan` — 使用 `--host`，可在局域网内用本机 IP 访问（例如手机测试）

4. **图片接口（开发时由 Vite 中间件提供）**  
   - `GET /api/images` — 返回全部图片列表，每项为 `{ id, src, width, height }`（宽高由服务端读取）
   - `GET /api/images/random?count=N&exclude=id1,id2,...` — 随机返回 N 张未在 `exclude` 中的图片，同样带 `width`/`height`

5. **示例页功能**  
   - 首屏随机展示约 20 张图片  
   - 点击缩略图用 PhotoSwipe 打开大图  
   - 「自动加载更多」：按可配置间隔（默认 5 秒）与每次张数，从接口随机拉取尚未显示的图片并追加到图库

### 构建（可选）

若要构建 JS 和 CSS 到 `dist/` 目录，在仓库根目录执行 `npm run build`（依赖现有 rollup 等配置）。

### Older versions

Documentation for the old version (v4) can be found [here](https://photoswipe.com/v4-docs/getting-started.html) and [the code for 4.1.3 is here](https://github.com/dimsemenov/PhotoSwipe/tree/v4.1.3).

[![Stand With Ukraine](https://raw.githubusercontent.com/vshymanskyy/StandWithUkraine/main/banner-direct.svg)](https://savelife.in.ua/en/)

---

This project is tested with [BrowserStack](https://www.browserstack.com/).
