<template>
  <div class="demo">
    <header class="header">
      <h1>PhotoSwipe 图库对比</h1>

      <!-- Tab 切换 -->
      <div class="tabs">
        <button
          class="tab"
          :class="{ active: activeTab === 'old' }"
          @click="activeTab = 'old'"
        >
          📦 旧实现 (Lightbox)
        </button>
        <button
          class="tab"
          :class="{ active: activeTab === 'new' }"
          @click="activeTab = 'new'"
        >
          ⚡ 新实现 (Vue 组件)
        </button>
      </div>

      <div class="tab-description">
        <p v-if="activeTab === 'old'">
          <strong>旧实现：</strong>使用 PhotoSwipeLightbox + PhotoSwipe Core，基于 JS 类 + 命令式 DOM 操作
        </p>
        <p v-else>
          <strong>新实现：</strong>使用 Vue 组件 + Composables，响应式 props，TypeScript 支持
        </p>
      </div>

      <div class="controls">
        <label>
          间隔（秒）
          <input v-model.number="intervalSec" type="number" min="1" max="120" />
        </label>
        <label>
          每次张数
          <input v-model.number="fetchCount" type="number" min="1" max="20" />
        </label>
        <button type="button" class="btn" @click="toggleAuto">
          {{ autoRunning ? '停止自动加载' : '自动加载更多' }}
        </button>
      </div>
    </header>

    <div v-if="loading" class="loading">加载中…</div>
    <div v-else-if="items.length === 0" class="empty">
      <p>暂无图片，请将图片放入项目根目录的 <code>images</code> 文件夹。</p>
    </div>
    <div
      v-else
      class="gallery"
      ref="galleryRef"
    >
      <a
        v-for="(item, index) in items"
        :key="item.id"
        :href="item.src"
        :data-pswp-width="item.width"
        :data-pswp-height="item.height"
        @click.prevent="openAt(index)"
      >
        <img :src="item.src" :alt="item.alt || item.id" loading="lazy" />
      </a>
    </div>

    <!-- 新的 Vue 组件实现：使用 v-model:open 与组件约定的 open/update:open 一致 -->
    <PhotoSwipe
      v-model:open="pswpOpen"
      :data-source="pswpDataSource"
      :index="pswpIndex"
      :loop="true"
      :show-close="true"
      :show-counter="true"
      @change="onPswpChange"
      @close="onPswpClose"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted, computed } from 'vue';
import PhotoSwipeLightbox from '../src/js/lightbox/lightbox.js';
import PhotoSwipeCore from '../src/js/photoswipe.js';
import PhotoSwipe from '../src/vue/PhotoSwipe.vue';
import type { SlideData } from '../src/vue/types';

const INITIAL_COUNT = 20;
const DEFAULT_INTERVAL_SEC = 5;
const DEFAULT_FETCH_COUNT = 1;

const activeTab = ref<'old' | 'new'>('old');
const galleryRef = ref<HTMLElement | null>(null);
const loading = ref(true);
const items = ref<SlideData[]>([]);
const intervalSec = ref(DEFAULT_INTERVAL_SEC);
const fetchCount = ref(DEFAULT_FETCH_COUNT);
const autoRunning = ref(false);
let timerId: number | null = null;
let lightbox: PhotoSwipeLightbox | null = null;

// 新实现的 PhotoSwipe 组件状态
const pswpOpen = ref(false);
const pswpIndex = ref(0);
const pswpDataSource = computed(() => items.value);

function toSlideData(apiItem: any): SlideData {
  return {
    id: apiItem.id,
    src: apiItem.src,
    width: apiItem.width ?? 1920,
    height: apiItem.height ?? 1080,
    alt: apiItem.id,
  };
}

async function fetchRandom(count: number, excludeIds: string[] = []): Promise<SlideData[]> {
  const exclude = excludeIds.length ? `&exclude=${excludeIds.join(',')}` : '';
  const res = await fetch(`/api/images/random?count=${count}${exclude}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.map((item: any) => toSlideData(item));
}

async function loadInitial() {
  loading.value = true;
  try {
    const list = await fetchRandom(INITIAL_COUNT);
    items.value = list;
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  const ids = items.value.map((i) => String(i.id || ''));
  const more = await fetchRandom(fetchCount.value, ids);
  if (more.length) {
    items.value = [...items.value, ...more];
  }
}

function openAt(index: number) {
  if (activeTab.value === 'old') {
    // 旧实现：使用 Lightbox
    const dataSource = items.value.map(({ src, width, height, alt }) => ({
      src,
      width: width ?? 1920,
      height: height ?? 1080,
      alt,
    }));
    lightbox?.loadAndOpen(index, dataSource);
  } else {
    // 新实现：使用 Vue 组件
    pswpIndex.value = index;
    pswpOpen.value = true;
  }
}

function toggleAuto() {
  if (autoRunning.value) {
    if (timerId) clearInterval(timerId);
    timerId = null;
    autoRunning.value = false;
    return;
  }
  autoRunning.value = true;
  const run = () => {
    loadMore();
  };
  run();
  timerId = window.setInterval(run, intervalSec.value * 1000);
}

function initLightbox() {
  if (lightbox || !galleryRef.value) return;
  lightbox = new PhotoSwipeLightbox({
    pswpModule: PhotoSwipeCore,
    gallery: galleryRef.value,
    children: 'a',
  });
  lightbox.init();
}

// 新实现的回调
function onPswpChange(payload: { index: number }) {
  pswpIndex.value = payload.index;
}

function onPswpClose() {
  pswpOpen.value = false;
}

// 监听 items 变化，初始化 Lightbox（仅旧实现需要）
watch(
  () => items.value.length,
  async (len) => {
    if (len > 0 && activeTab.value === 'old') {
      await nextTick();
      initLightbox();
    }
  },
);

// 切换 tab 时：在新实现下销毁旧 Lightbox（避免同一点击同时打开两套预览）；在旧实现下重新初始化
watch(activeTab, (newTab) => {
  if (newTab === 'new') {
    if (lightbox) {
      lightbox.destroy();
      lightbox = null;
    }
  } else if (newTab === 'old' && items.value.length > 0) {
    nextTick(() => {
      initLightbox();
    });
  }
});

onMounted(async () => {
  await loadInitial();
  await nextTick();
  if (activeTab.value === 'old') {
    initLightbox();
  }
});

onUnmounted(() => {
  if (timerId) clearInterval(timerId);
  if (lightbox) lightbox.destroy();
});
</script>

<style scoped>
.demo {
  min-height: 100vh;
  padding: 1rem;
  box-sizing: border-box;
}
.header {
  margin-bottom: 1rem;
}
.header h1 {
  margin: 0 0 0.75rem;
  font-size: 1.5rem;
}

/* Tab 样式 */
.tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  border-bottom: 2px solid #eee;
}

.tab {
  padding: 0.5rem 1rem;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-size: 0.9rem;
  color: #666;
  transition: all 0.2s;
  margin-bottom: -2px;
}

.tab:hover {
  color: #333;
  background: #f5f5f5;
}

.tab.active {
  color: #007bff;
  border-bottom-color: #007bff;
  font-weight: 500;
}

.tab-description {
  margin: 0.75rem 0;
  padding: 0.75rem;
  background: #f8f9fa;
  border-radius: 4px;
  font-size: 0.9rem;
  color: #555;
}

.tab-description p {
  margin: 0;
}

.tab-description strong {
  color: #333;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  margin-top: 1rem;
}
.controls label {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.controls input {
  width: 4rem;
  padding: 0.25rem;
}
.btn {
  padding: 0.5rem 1rem;
  cursor: pointer;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
}
.btn:hover {
  background: #0056b3;
}
.loading,
.empty {
  padding: 2rem;
  text-align: center;
  color: #666;
}
.empty code {
  background: #eee;
  padding: 0.2em 0.4em;
  border-radius: 4px;
}
.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.5rem;
}
.gallery a {
  display: block;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.2s;
}
.gallery a:hover {
  transform: scale(1.05);
}
.gallery img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>
