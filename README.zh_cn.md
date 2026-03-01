# PhotoSwipe Reactive (Vue 3)

基于 Vue 3 的响应式 PhotoSwipe 风格灯箱：**数据驱动的幻灯片**、触摸手势、缩放与开关动画，并支持 TypeScript。

**Fork 自 [PhotoSwipe](https://github.com/dimsemenov/PhotoSwipe) v5.4.4。** 本包保留原有 Core 与 Lightbox 脚本（`src/js/`），并新增 **Vue 3 组件**（`src/vue/`），沿用相同 DOM/CSS，提供 props 下行 / 事件上行的响应式 API。

---

## 安装

在 Vue 3 项目中安装：

```bash
npm install photoswipe-vue
# 或
bun add photoswipe-vue
```

若从本仓库或本地路径使用（如 monorepo）：

```bash
npm install <本包路径>
# 例如：npm install ../packages/photoswipe-reactive
```

依赖：**Vue 3**。包内为 Vue 组件与源码，由你的构建工具（Vite、Vue CLI 等）参与编译。

---

## 示例

**1. 最简：单图开关**

```vue
<template>
  <button @click="open = true">打开</button>
  <PhotoSwipe
    v-model:open="open"
    :data-source="items"
    :index="0"
    @close="open = false"
  />
</template>

<script setup>
import { ref } from 'vue';
import { PhotoSwipe } from 'photoswipe-vue/vue';
import 'photoswipe-vue/photoswipe.css';

const open = ref(false);
const items = ref([
  { src: '/path/to/image.jpg', width: 1920, height: 1080 },
]);
</script>
```

**2. 图库：缩略图 + 点击打开对应索引**

```vue
<template>
  <div class="gallery">
    <a
      v-for="(item, index) in items"
      :key="item.src"
      href="#"
      @click.prevent="openAt(index)"
    >
      <img :src="item.src" :alt="item.alt" loading="lazy" />
    </a>
  </div>
  <PhotoSwipe
    v-model:open="pswpOpen"
    v-model:index="pswpIndex"
    :data-source="items"
    :loop="true"
    :show-close="true"
    :show-arrow-prev="true"
    :show-arrow-next="true"
    :show-counter="true"
    @change="onChange"
    @close="pswpOpen = false"
  />
</template>

<script setup>
import { ref } from 'vue';
import { PhotoSwipe } from 'photoswipe-vue/vue';
import 'photoswipe-vue/photoswipe.css';

const items = ref([
  { src: '/img/1.jpg', width: 1200, height: 800, alt: '图 1' },
  { src: '/img/2.jpg', width: 800, height: 1200, alt: '图 2' },
]);

const pswpOpen = ref(false);
const pswpIndex = ref(0);

function openAt(index) {
  pswpIndex.value = index;
  pswpOpen.value = true;
}

function onChange({ index }) {
  pswpIndex.value = index;
}
</script>

<style scoped>
.gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
.gallery img { width: 100%; height: 100px; object-fit: cover; }
</style>
```

**3. 通过 ref 编程打开（例如打开第三张）**

```vue
<template>
  <button @click="lightboxRef?.open(2)">打开第三张</button>
  <PhotoSwipe ref="lightboxRef" :data-source="items" />
</template>

<script setup>
import { ref } from 'vue';
import { PhotoSwipe } from 'photoswipe-vue/vue';
import 'photoswipe-vue/photoswipe.css';

const lightboxRef = ref(null);
const items = ref([/* SlideData[] */]);
</script>
```

幻灯片数据格式：`{ src, width, height, alt? }`。可选 `element`（缩略图 DOM）仅用于开关位置动画；**当前版本无缩略图图片（msrc）及内置占位图**。完整 `SlideData` 见 `src/vue/types.ts`。

---

## 仓库结构

| 路径 | 说明 |
|------|------|
| `src/js/` | 原版 PhotoSwipe 5.x Core 与 Lightbox（未改） |
| `src/vue/` | Vue 3 组件：`PhotoSwipe.vue`、composables、幻灯片逻辑 |
| `src/photoswipe.css` | 共用样式（与上游一致） |
| `docs/` | 架构与 API 说明（含 Vue v2 方案） |
| `demo/` | Vue 3 + Vite 示例，用于本地测试 |

---

## 原版 (PhotoSwipe 5.4.4) 与本版差异

| 方面 | 原版 5.4.4 | 本包 |
|--------|------------|------|
| **使用方式** | 命令式 JS：`new PhotoSwipe()`、options、DOM 画廊或 `items[]` | 声明式 Vue：`<PhotoSwipe v-model:open :data-source="items" />` |
| **数据来源** | DOM 画廊（`gallery` / `children` / 选择器）或 `items[]` | **仅数据**：通过 `dataSource` 传入 `SlideData[]`，不从 DOM 解析画廊 |
| **状态** | 单一 `core` 对象，字段众多 | 组件状态 + props 下行 / 事件上行 |
| **UI / 幻灯片** | 通过 `core` 强耦合 | 解耦：`PswpUI` 与 `PswpSlideView` 通过 props 与 emit 通信 |
| **桌面特性** | 键盘、滚轮、ESC、方向键、焦点陷阱等 | **未实现**；侧重触摸与指针手势 |
| **缩略图** | 可选 msrc、幻灯片内占位图 | **未实现**：无 `msrc`、无内置缩略图/占位图；仅可选传入 `SlideData.element`（缩略图 DOM）用于开关位置动画 |
| **CSS / DOM** | 固定 `.pswp` 结构与类名 | **不变**；复用 `photoswipe.css` 与相同 DOM 结构 |

总结：外观与触摸行为一致，API 响应式、仅数据驱动幻灯片、无画廊模式、无桌面专用功能。

---

## 包产出（构建）

- **一个 Vue 用 JS 入口**：`src/vue/index.ts`（或构建后 `dist/vue.mjs`）
- **一个 CSS 文件**：`src/photoswipe.css`（构建时复制为 `dist/photoswipe.css`）

**导出：**

- `photoswipe-vue` → 原版 Core（`src/js/photoswipe.js`）
- `photoswipe-vue/lightbox` → Lightbox（`src/js/lightbox/lightbox.js`）
- `photoswipe-vue/vue` → Vue 组件与类型（`PhotoSwipe.vue` + `types`）
- `photoswipe-vue/photoswipe.css` 或 `photoswipe-vue/style.css` → `src/photoswipe.css`

---

## 构建脚本

```bash
# 构建 Vue 产物（dist/vue.mjs）并复制 CSS（dist/photoswipe.css）
npm run build

# 仅复制 CSS 到 dist/
npm run build:css

# 仅构建 Vue 库到 dist/vue.mjs
npm run build:vue
```

原版 `src/js/` 不做 Rollup/压缩，构建只产出**一个 Vue 包**和**一个 CSS 文件**。

---

## 开发与测试

### 安装

```bash
npm install
# 或
bun install
```

### 开发服务器（示例应用）

```bash
npm run dev
```

- 地址：`http://localhost:5173`
- 将图片放入 `images/`（如 jpg、png、webp）。示例会调用：
  - `GET /api/images` — 列出图片
  - `GET /api/images/random?count=N` — 随机图片（用于“加载更多”）

```bash
npm run dev:lan
```

- 同上并加 `--host`，便于局域网（如手机）访问。

### 测试

```bash
npm run test        # 运行一次
npm run test:watch  # 监听模式
```

---

## 许可证

MIT。Fork 自 Dmytro Semenov 的 PhotoSwipe v5.4.4（[dimsemenov.com](https://dimsemenov.com)）。
