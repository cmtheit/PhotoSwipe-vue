<template>
  <div
    ref="containerRef"
    class="pswp__container"
    aria-live="off"
    id="pswp__items"
  >
    <div
      v-for="(slot, i) in holderSlots"
      :key="i"
      ref="holderRefs"
      class="pswp__item"
      role="group"
      aria-roledescription="slide"
      :aria-hidden="slot.ariaHidden ? 'true' : 'false'"
      :style="{ display: slot.visible ? 'block' : 'none' }"
    >
      <div
        ref="zoomWrapRefs"
        class="pswp__zoom-wrap"
        style="transform-origin: 0 0"
        :style="{ transform: slot.transformStyle, display: slot.hasSlide ? 'block' : 'none' }"
      >
        <img
          ref="imgRefs"
          class="pswp__img"
          :src="slot.imgSrc || undefined"
          :srcset="slot.imgSrcset || undefined"
          :sizes="slot.imgSizes || undefined"
          :alt="slot.imgAlt"
          :style="{ width: `${slot.contentWidth}px`, height: `${slot.contentHeight}px`, display: slot.contentType === 'image' && slot.contentAttached ? 'block' : 'none' }"
          @load="onImgLoad(i)"
          @error="onImgError(i)"
        >
        <div
          ref="htmlRefs"
          class="pswp__content"
          :style="{ width: `${slot.contentWidth}px`, height: `${slot.contentHeight}px`, display: slot.contentType !== 'image' && slot.contentAttached ? 'block' : 'none' }"
          v-html="slot.htmlContent"
        />
        <div
          v-if="slot.isError"
          class="pswp__content pswp__error-msg-container"
          :style="{ width: `${slot.contentWidth}px`, height: `${slot.contentHeight}px` }"
        >
          <div class="pswp__error-msg">{{ slot.errorHtml }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { SlideViewProps, SlideViewEmits } from '../types';
import { useSlideView } from '../composables/useSlideView';

const props = withDefaults(
  defineProps<SlideViewProps>(),
  {
    loop: true,
    spacing: 0.1,
    allowPanToNext: true,
    pinchToClose: true,
    closeOnVerticalDrag: true,
    clickToCloseNonZoomable: true,
    preload: () => [1, 2],
  }
);

const emit = defineEmits<SlideViewEmits>();

const containerRef = ref<HTMLElement | null>(null);
const holderRefs = ref<HTMLDivElement[]>([]);
const zoomWrapRefs = ref<HTMLDivElement[]>([]);
const imgRefs = ref<HTMLImageElement[]>([]);
const htmlRefs = ref<HTMLDivElement[]>([]);
const scrollWrapRef = ref<HTMLElement | null>(null);

onMounted(() => {
  scrollWrapRef.value = containerRef.value?.parentElement ?? null;
});

const {
  holderSlots,
  onImgLoad,
  onImgError,
  init,
  destroy,
  completeOpen,
  expose,
} = useSlideView(props, emit as (e: string, ...args: any[]) => void, {
  containerEl: containerRef,
  holderEls: holderRefs,
  zoomWrapEls: zoomWrapRefs,
  imgEls: imgRefs,
  htmlEls: htmlRefs,
  scrollWrapEl: scrollWrapRef,
});

defineExpose({
  init,
  destroy,
  completeOpen,
  ...expose,
});
</script>
