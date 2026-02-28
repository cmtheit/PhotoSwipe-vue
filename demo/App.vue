<template>
  <div class="demo">
    <header class="header">
      <h1>PhotoSwipe 图库</h1>
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

  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import PhotoSwipeLightbox from '../src/js/lightbox/lightbox.js';
import PhotoSwipe from '../src/js/photoswipe.js';

const INITIAL_COUNT = 20;
const DEFAULT_INTERVAL_SEC = 5;
const DEFAULT_FETCH_COUNT = 1;

const galleryRef = ref(null);
const pswpRef = ref(null);
const loading = ref(true);
const items = ref([]);
const intervalSec = ref(DEFAULT_INTERVAL_SEC);
const fetchCount = ref(DEFAULT_FETCH_COUNT);
const autoRunning = ref(false);
let timerId = null;
let lightbox = null;

function toSlideData(apiItem) {
  return {
    id: apiItem.id,
    src: apiItem.src,
    width: apiItem.width ?? 1920,
    height: apiItem.height ?? 1080,
    alt: apiItem.id,
  };
}

async function fetchRandom(count, excludeIds = []) {
  const exclude = excludeIds.length ? `&exclude=${excludeIds.join(',')}` : '';
  const res = await fetch(`/api/images/random?count=${count}${exclude}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.map((item) => toSlideData(item));
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
  const ids = items.value.map((i) => i.id);
  const more = await fetchRandom(fetchCount.value, ids);
  if (more.length) {
    items.value = [...items.value, ...more];
  }
}

function openAt(index) {
  const dataSource = items.value.map(({ src, width, height, alt }) => ({
    src,
    width: width ?? 1920,
    height: height ?? 1080,
    alt,
  }));
  lightbox.loadAndOpen(index, dataSource);
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
  timerId = setInterval(run, intervalSec.value * 1000);
}

function initLightbox() {
  if (lightbox || !galleryRef.value) return;
  lightbox = new PhotoSwipeLightbox({
    pswpModule: PhotoSwipe,
    gallery: galleryRef.value,
    children: 'a',
  });
  lightbox.init();
}

watch(
  () => items.value.length,
  async (len) => {
    if (len > 0) {
      await nextTick();
      initLightbox();
    }
  },
);

onMounted(async () => {
  await loadInitial();
  await nextTick();
  initLightbox();
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
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
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
}
.gallery img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>
