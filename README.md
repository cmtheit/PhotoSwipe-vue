# PhotoSwipe Reactive (Vue 3)

Vue 3 reactive component for PhotoSwipe-style lightbox: **data-driven slides**, touch gestures, zoom, and open/close animations. TypeScript-friendly.

**Forked from [PhotoSwipe](https://github.com/dimsemenov/PhotoSwipe) v5.4.4.** This package keeps the original Core and Lightbox scripts under `src/js/` and adds a **Vue 3 component** (`src/vue/`) that uses the same DOM/CSS and a reactive, props-down / events-up API.

---

## Install

In your Vue 3 project:

```bash
npm install photoswipe-vue
# or
bun add photoswipe-vue
```

If you use this package from a monorepo or local path:

```bash
npm install <path-to-photoswipe-vue>
# e.g. npm install ../packages/photoswipe-vue
```

Peer dependency: **Vue 3**. The package exposes the Vue component and source; your bundler (Vite, Vue CLI, etc.) will compile it.

---

## Example

**1. Minimal: single image, open/close**

```vue
<template>
  <button @click="open = true">Open</button>
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

**2. Gallery: thumbnails + open at clicked index**

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
  { src: '/img/1.jpg', width: 1200, height: 800, alt: 'Photo 1' },
  { src: '/img/2.jpg', width: 800, height: 1200, alt: 'Photo 2' },
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

**3. Open programmatically via ref**

```vue
<template>
  <button @click="lightboxRef?.open(2)">Open third image</button>
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

Slide data shape: `{ src, width, height, alt? }`. Optional `element` (thumb DOM node) for open/close position animation only; **no thumbnail image (msrc) or built-in placeholder** in the current version. See `src/vue/types.ts` for full `SlideData`.

---

## API (Props, Events, Expose)

Full types: `src/vue/types.ts` (`PhotoSwipeProps`, `PhotoSwipeEmits`, `PhotoSwipeExpose`).

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `dataSource` | `SlideData[]` | `[]` | Slide items (src, width, height, alt?, element? for animation). |
| `index` | `number` | `0` | Current slide index (0-based). Use `v-model:index` to sync. |
| `open` | `boolean` | `false` | Whether the lightbox is open. Use `v-model:open` to sync. |
| `loop` | `boolean` | `true` | Whether to loop when swiping past first/last slide. |
| `allowPanToNext` | `boolean` | `true` | Allow swipe to previous/next slide. |
| `pinchToClose` | `boolean` | `true` | Allow pinch gesture to close. |
| `closeOnVerticalDrag` | `boolean` | `true` | Allow vertical drag to close. |
| `clickToCloseNonZoomable` | `boolean` | `true` | Click to close when not zoomed. |
| `spacing` | `number` | `0.1` | Spacing ratio between slides (0–1). |
| `easing` | `string` | `'cubic-bezier(.4,0,.22,1)'` | Transition easing. |
| `zoomAnimationDuration` | `number \| false` | `333` | Zoom animation duration (ms); `false` to disable. |
| `preload` | `[number, number]` | `[1, 2]` | Number of slides to preload before/after current. |
| `bgOpacity` | `number` | `0.8` | Background overlay opacity (0–1). |
| `showAnimationDuration` | `number \| false` | `333` | Open animation duration (ms). |
| `hideAnimationDuration` | `number \| false` | `333` | Close animation duration (ms). |
| `showClose` | `boolean` | `true` | Show close button. |
| `showCounter` | `boolean` | `true` | Show counter (e.g. 1/5). |
| `indexIndicatorSep` | `string` | `' / '` | Counter separator. |
| `closeTitle` | `string` | — | Close button `title` and `aria-label`. |
| `showUiAtFirst` | `boolean` | `false` | Show UI (close, counter) on open; if false, tap image to toggle. |
| `closeOnBack` | `boolean` | `false` | Use history (pushState/popstate) so back button closes lightbox. |
| `appendTo` | `string \| HTMLElement` | `'body'` | Teleport target (selector or element). |
| `zIndex` | `number` | — | Root z-index; if not set, uses CSS var `--pswp-root-z-index` (100000). |
| `onVerticalDrag` | `function` | — | Called on vertical drag; payload has `panY` and `preventDefault()`. |
| `onBeforeClose` | `function` | — | Before close; return `false` to prevent closing. |

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `update:open` | `value: boolean` | v-model:open. |
| `update:index` | `value: number` | v-model:index. |
| `beforeOpen` | — | When `open` becomes true. |
| `afterInit` | — | After init and open animation ready. |
| `change` | `{ index: number }` | When current index changes. |
| `close` | — | When lightbox closes. |
| `destroy` | — | When close animation ends and component unmounts. |
| `verticalDrag` | `{ panY: number }` | During vertical drag (e.g. pull to close). |
| `uiVisibleChange` | `{ visible: boolean }` | When UI bar visibility toggles (e.g. tap to show/hide). |

### Expose (ref)

| Method | Signature | Description |
|--------|-----------|-------------|
| `open` | `open(index?: number)` | Open lightbox; optional index to show that slide. |
| `toggleUI` | `toggleUI()` | Toggle UI bar (close button, counter) visibility. |

---

## Repo structure

| Path | Description |
|------|-------------|
| `src/js/` | Original PhotoSwipe 5.x Core and Lightbox (unchanged) |
| `src/vue/` | Vue 3 component: `PhotoSwipe.vue`, composables, slide logic |
| `src/photoswipe.css` | Shared styles (unchanged from upstream) |
| `docs/` | Architecture and API notes (including Vue v2 plan) |
| `demo/` | Vue 3 + Vite demo app for local testing |

---

## Original (PhotoSwipe 5.4.4) vs this version

| Aspect | Original 5.4.4 | This package |
|--------|-----------------|--------------|
| **Usage** | Imperative JS: `new PhotoSwipe()`, options, DOM gallery or `items[]` | Declarative Vue: `<PhotoSwipe v-model:open :data-source="items" />` |
| **Data source** | DOM gallery (`gallery` / `children` / selectors) or `items[]` | **Data only**: `SlideData[]` via `dataSource` prop. No DOM gallery parsing. |
| **State** | Single `core` object with many fields | Component state + props down / events up |
| **UI / slide logic** | Tightly coupled via `core` | Decoupled: `PswpUI` and `PswpSlideView` communicate via props and emits |
| **Desktop features** | Keyboard, scroll wheel, ESC, arrows, focus trap, etc. | **Not implemented**; focused on touch and pointer gestures |
| **Thumbnails** | Optional msrc, placeholder in slide | **Not implemented**: no `msrc`, no built-in thumbnail/placeholder in the viewer; optional `SlideData.element` (thumb DOM node) only for open/close position animation |
| **CSS / DOM** | Same `.pswp` structure and classes | **Unchanged**; reuse `photoswipe.css` and same DOM shape |

So: same look and touch behavior, reactive API, data-only slides, no gallery mode, no desktop-only features.

### Vue 版 UI 与交互说明

- **无左右箭头、无放大镜按钮**：Vue 组件不提供顶部/侧边的上一张/下一张箭头按钮，也不提供放大镜（缩放）按钮；切换幻灯片仅支持左右滑动手势，缩放仅支持双指捏合等手势。
- **系统返回关闭遮罩**：在手机或浏览器中，打开遮罩时会 push 一条 history 记录，用户按**系统返回键**（Android 返回键）或**浏览器后退**时，会关闭遮罩而不离开当前页。

---

## Package outputs (build)

The library provides:

- **One JS entry for Vue**: `src/vue/index.ts` (or built `dist/vue.mjs` after `npm run build`)
- **One CSS file**: `src/photoswipe.css` (copied to `dist/photoswipe.css` on build)

**Exports:**

- `photoswipe-vue` → original Core (`src/js/photoswipe.js`)
- `photoswipe-vue/lightbox` → Lightbox (`src/js/lightbox/lightbox.js`)
- `photoswipe-vue/vue` → Vue component and types (`PhotoSwipe.vue` + `types`)
- `photoswipe-vue/photoswipe.css` or `photoswipe-vue/style.css` → `src/photoswipe.css`

---

## Build scripts

```bash
# Build Vue bundle (dist/vue.mjs) and copy CSS (dist/photoswipe.css)
npm run build

# Only copy CSS to dist/
npm run build:css

# Only build Vue lib to dist/vue.mjs
npm run build:vue
```

No Rollup/Uglify step for the original `src/js/`; that code is left as-is. Build focuses on one Vue bundle and one CSS file.

---

## Development and testing

### Install

```bash
npm install
# or
bun install
```

### Dev server (demo app)

```bash
npm run dev
```

- Dev server: `http://localhost:5173`
- Put images in `images/` (e.g. jpg, png, webp). The demo uses:
  - `GET /api/images` — list all images
  - `GET /api/images/random?count=N` — random images for “load more”

```bash
npm run dev:lan
```

- Same as above with `--host` for LAN access (e.g. mobile).

### Tests

```bash
npm run test        # run once
npm run test:watch  # watch mode
```

---

## License

MIT. Forked from PhotoSwipe v5.4.4 by Dmytro Semenov ([dimsemenov.com](https://dimsemenov.com)).
