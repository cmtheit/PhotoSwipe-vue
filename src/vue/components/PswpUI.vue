<template>
  <div class="pswp__top-bar pswp__hide-on-close">
    <div v-if="showCounter" class="pswp__counter">
      {{ counterText }}
    </div>
    <div class="pswp__preloader">
      <svg aria-hidden="true" class="pswp__icn" viewBox="0 0 32 32" width="32" height="32">
        <use class="pswp__icn-shadow" xlink:href="#pswp__icn-loading" />
        <path
          id="pswp__icn-loading"
          fill-rule="evenodd"
          clip-rule="evenodd"
          d="M21.2 16a5.2 5.2 0 1 1-5.2-5.2V8a8 8 0 1 0 8 8h-2.8Z"
        />
      </svg>
    </div>
    <button
      v-if="showClose"
      class="pswp__button pswp__button--close"
      type="button"
      :title="closeTitle"
      :aria-label="closeTitle || '关闭'"
      @click="emit('close')"
    >
      <svg aria-hidden="true" class="pswp__icn" viewBox="0 0 32 32" width="32" height="32">
        <use class="pswp__icn-shadow" xlink:href="#pswp__icn-close" />
        <path d="M24 10l-2-2-6 6-6-6-2 2 6 6-6 6 2 2 6-6 6 6 2-2-6-6z" id="pswp__icn-close" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { UIProps, UIEmits } from '../types';

const props = withDefaults(defineProps<UIProps>(), {
  isSliding: false,
  showClose: true,
  showCounter: true,
  indexIndicatorSep: ' / ',
});

const emit = defineEmits<UIEmits>();

const counterText = computed(
  () => `${props.currentIndex + 1}${props.indexIndicatorSep}${props.totalItems}`
);
</script>

<style scoped>
/* 移动端顶部安全区：控件（叉号、总数）不与之重叠 */
.pswp__top-bar {
  padding-top: env(safe-area-inset-top, 0px);
  min-height: calc(60px + env(safe-area-inset-top, 0px));
  box-sizing: border-box;
}
</style>
