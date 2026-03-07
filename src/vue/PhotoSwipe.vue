<template>
  <Teleport :to="appendToTarget">
    <div
      v-if="isMounted"
      ref="rootRef"
      class="pswp"
      :class="rootClasses"
      :style="rootStyle"
      tabindex="-1"
      role="dialog"
    >
      <div ref="bgRef" class="pswp__bg" />
      <section ref="scrollWrapRef" class="pswp__scroll-wrap" aria-roledescription="carousel">
        <PswpSlideView
          ref="slideViewRef"
          :items="dataSource"
          :current-index="currentIndex"
          :loop="loop"
          :spacing="spacing"
          :allow-pan-to-next="allowPanToNext"
          :pinch-to-close="pinchToClose"
          :close-on-vertical-drag="closeOnVerticalDrag"
          :click-to-close-non-zoomable="clickToCloseNonZoomable"
          :easing="easing"
          :zoom-animation-duration="zoomAnimationDuration"
          :preload="preload"
          :opened="openerIsOpen"
          :on-vertical-drag="handleVerticalDrag"
          @update:current-index="onSlideIndexChange"
          @request-close="onRequestClose"
          @toggleUI="onToggleUI"
          @bg-opacity-change="onBgOpacityChange"
          @slide-complete="isSliding = false"
        />
        <PswpUI
          :current-index="currentIndex"
          :total-items="totalItems"
          :is-sliding="isSliding"
          :show-close="showClose"
          :show-counter="showCounter"
          :index-indicator-sep="indexIndicatorSep"
          :close-title="closeTitle"
          @close="handleClose"
        >
          <slot />
        </PswpUI>
      </section>
      <slot name="overlay" />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import type { PhotoSwipeProps, PhotoSwipeEmits, PhotoSwipeExpose, SlideData } from './types';

defineOptions({ inheritAttrs: false });
import { getViewportSize } from './utils/viewport';
import { getThumbBounds } from './utils/thumb-bounds';
import { Animations } from './core/animations';
import { useOpener } from './composables/useOpener';
import PswpSlideView from './components/PswpSlideView.vue';
import PswpUI from './components/PswpUI.vue';

const props = withDefaults(defineProps<PhotoSwipeProps>(), {
  dataSource: () => [],
  index: 0,
  open: false,
  loop: true,
  allowPanToNext: true,
  pinchToClose: true,
  closeOnVerticalDrag: true,
  clickToCloseNonZoomable: true,
  spacing: 0.1,
  easing: 'cubic-bezier(.4,0,.22,1)',
  zoomAnimationDuration: 333,
  preload: () => [1, 2],
  bgOpacity: 0.8,
  showAnimationDuration: 333,
  hideAnimationDuration: 333,
  showClose: true,
  showCounter: true,
  indexIndicatorSep: ' / ',
  showUiAtFirst: false,
  closeOnBack: false,
  appendTo: () => 'body',
  zIndex: 100000,
});

const emit = defineEmits<PhotoSwipeEmits>();

const rootRef = ref<HTMLElement | null>(null);
const bgRef = ref<HTMLElement | null>(null);
const slideViewRef = ref<InstanceType<typeof PswpSlideView> | null>(null);

const isMounted = ref(false);
const currentIndex = ref(0);
const currentSlideId = ref<string | null>(null);
const isSliding = ref(false);
const bgOpacityRef = ref(1);
/** 系统返回（手机/浏览器后退）时关闭遮罩：pushState + popstate */
let popstateUnsubscribe: (() => void) | null = null;

const openerIsOpen = ref(false);
const uiVisible = ref(false);
const animations = new Animations();

function onToggleUI() {
  uiVisible.value = !uiVisible.value;
  emit('uiVisibleChange', { visible: uiVisible.value });
}

const dataSource = computed<SlideData[]>(() => props.dataSource ?? []);
const totalItems = computed(() => dataSource.value.length);

function clampIndex(i: number): number {
  const n = totalItems.value;
  if (n <= 0) return 0;
  return Math.max(0, Math.min(i, n - 1));
}

function getSlideId(data: SlideData, index: number): string {
  return data.id ?? String(index);
}

function getOptions(): Record<string, unknown> {
  return {
    showAnimationDuration: props.showAnimationDuration ?? 333,
    hideAnimationDuration: props.hideAnimationDuration ?? 333,
    bgOpacity: props.bgOpacity ?? 0.8,
    easing: props.easing ?? 'cubic-bezier(.4,0,.22,1)',
    maxWidthToAnimate: 4000,
    showHideAnimationType: 'zoom',
    showHideOpacity: false,
  };
}

function getInitialItemData(): SlideData | null {
  const items = dataSource.value;
  const i = clampIndex(currentIndex.value);
  return items[i] ?? null;
}

function getInitialThumbBounds() {
  const data = getInitialItemData();
  if (!data) return undefined;
  return getThumbBounds(currentIndex.value, data);
}

const openerCtx = {
  get rootEl() {
    return rootRef.value;
  },
  get bgEl() {
    return bgRef.value;
  },
  getContainerEl(): HTMLElement | null {
    return slideViewRef.value?.getContainerElement() ?? null;
  },
  getOptions,
  getViewportSize(): { x: number; y: number } {
    return getViewportSize(getOptions());
  },
  getInitialItemData,
  getInitialThumbBounds,
  get slideView() {
    const sv = slideViewRef.value;
    if (!sv) {
      return {
        getCurrentSlideContainer: () => null,
        getCurrentSlideTransform: () => '',
        setCurrentSlideZoomPan: () => {},
        zoomAndPanToInitial: () => {},
        applyCurrentSlideTransform: () => {},
        getPlaceholderElement: () => null,
        currentSlideUsesPlaceholder: () => false,
        getCurrentSlideWidth: () => 0,
        getCurrentSlideInitialZoom: () => 1,
        isScrollShifted: () => false,
        resetScrollPosition: () => {},
        resizeScroll: () => {},
        getHolderElements: () => [],
      };
    }
    return {
      getCurrentSlideContainer: () => sv.getCurrentSlideContainer(),
      getCurrentSlideTransform: () => sv.getCurrentSlideTransform(),
      setCurrentSlideZoomPan: (pan: { x: number; y: number }, zoom: number) =>
        sv.setCurrentSlideZoomPan(pan, zoom),
      zoomAndPanToInitial: () => sv.zoomAndPanToInitial(),
      applyCurrentSlideTransform: () => sv.applyCurrentSlideTransform(),
      getPlaceholderElement: () => sv.getPlaceholderElement(),
      currentSlideUsesPlaceholder: () => sv.currentSlideUsesPlaceholder(),
      getCurrentSlideWidth: () => sv.getCurrentSlideWidth(),
      getCurrentSlideInitialZoom: () => sv.getCurrentSlideInitialZoom(),
      isScrollShifted: () => sv.isScrollShifted(),
      resetScrollPosition: () => sv.resetScrollPosition(),
      resizeScroll: () => sv.resizeScroll(),
      getHolderElements: () => sv.getHolderElements(),
    };
  },
  animations,
  get bgOpacity() {
    return bgOpacityRef.value;
  },
  applyBgOpacity(opacity: number) {
    bgOpacityRef.value = opacity;
    if (bgRef.value) {
      const finalOpacity = (props.bgOpacity ?? 0.8) * opacity;
      bgRef.value.style.opacity = String(finalOpacity);
    }
  },
  onOpeningAnimationStart() {
    uiVisible.value = !!props.showUiAtFirst;
    slideViewRef.value?.setOpenerOpen?.(true);
    slideViewRef.value?.appendHeavy?.();
  },
  onOpeningAnimationEnd() {
    openerIsOpen.value = true;  // 仍保留 for Vue rendering
    uiVisible.value = !!props.showUiAtFirst;
    slideViewRef.value?.completeOpen?.();  // 替代原来的 handleResize + appendHeavy
  },
  onClosingAnimationEnd() {
    openerIsOpen.value = false;
    uiVisible.value = false;
    isMounted.value = false;
    emit('update:open', false);
    emit('close');
    emit('destroy');
    slideViewRef.value?.destroy?.();
  },
};

const opener = useOpener(openerCtx);

const rootClasses = computed(() => ({
  'pswp--open': isMounted.value,
  'pswp--touch': false,
  'pswp--ui-visible': uiVisible.value,
  'pswp--one-slide': totalItems.value <= 1,
  'pswp--has_mouse': true,
}));

const rootStyle = computed(() =>
  props.zIndex != null ? { zIndex: props.zIndex } : undefined
);


const appendToTarget = computed(() => {
  const to = props.appendTo;
  if (typeof to === 'string') return to;
  if (to && typeof to === 'object' && 'appendChild' in to) return to as HTMLElement;
  return 'body';
});

function runInit() {
  const idx = clampIndex(props.index);
  currentIndex.value = idx;
  const data = dataSource.value[idx];
  if (data) {
    currentSlideId.value = getSlideId(data, idx);
  }
  slideViewRef.value?.init(idx);
  opener.open();
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      if (props.closeOnBack !== false && typeof history !== 'undefined' && history.pushState) {
        history.pushState({ photoswipe: true }, '');
        if (!popstateUnsubscribe) {
          const handler = () => {
            if (props.open) handleClose();
          };
          window.addEventListener('popstate', handler);
          popstateUnsubscribe = () => {
            window.removeEventListener('popstate', handler);
            popstateUnsubscribe = null;
          };
        }
      }
      emit('beforeOpen');
      isMounted.value = true;
      nextTick(() => {
        runInit();
        emit('afterInit');
        emit('change', { index: currentIndex.value });
      });
    } else {
      if (popstateUnsubscribe) {
        popstateUnsubscribe();
      }
      opener.close();
    }
  }
);

onBeforeUnmount(() => {
  if (popstateUnsubscribe) popstateUnsubscribe();
});

watch(
  () => props.index,
  (newIndex) => {
    if (props.open && isMounted.value) {
      const idx = clampIndex(newIndex);
      currentIndex.value = idx;
      slideViewRef.value?.goTo(idx);
    }
  }
);

watch(
  dataSource,
  () => {
    if (!currentSlideId.value || dataSource.value.length === 0) {
      return;
    }

    // 在新 dataSource 中查找之前持有的 slide ID
    const newDataSource = dataSource.value;
    const foundIndex = newDataSource.findIndex((item, idx) => getSlideId(item, idx) === currentSlideId.value);

    if (foundIndex !== -1) {
      // 找到且 index 变化
      if (foundIndex !== currentIndex.value) {
        slideViewRef.value?.goTo(foundIndex);
        onSlideIndexChange(foundIndex, 'id-relocated');
      }
      // 找到且 index 不变：不做操作
    } else {
      // 没找到
      if (newDataSource.length === 0) {
        // 列表为空：关闭预览
        handleClose();
      } else if (newDataSource.length <= currentIndex.value) {
        // 超出边界：导航到最后一张
        const lastIndex = newDataSource.length - 1;
        slideViewRef.value?.goTo(lastIndex);
        onSlideIndexChange(lastIndex, 'bounds-exceeded');
      } else {
        // 在边界内：保持 index，更新 currentSlideId
        const data = newDataSource[currentIndex.value];
        if (data) {
          currentSlideId.value = getSlideId(data, currentIndex.value);
        }
      }
    }
  },
  { deep: true }
);

function onSlideIndexChange(index: number, reason?: string) {
  currentIndex.value = index;
  const data = dataSource.value[index];
  if (data) {
    currentSlideId.value = getSlideId(data, index);
  }
  emit('update:index', index);
  emit('change', { index, reason });
}

function onRequestClose(source?: string) {
  if (props.onBeforeClose) {
    const result = props.onBeforeClose(source);
    if (result === false) {
      return; // 拦截关闭
    }
  }
  handleClose();
}

function handleVerticalDrag(payload: { panY: number; preventDefault: () => void }) {
  emit('verticalDrag', { panY: payload.panY });
  if (props.onVerticalDrag) {
    props.onVerticalDrag(payload);
  }
}

function onBgOpacityChange(opacity: number) {
  bgOpacityRef.value = opacity;
  if (bgRef.value) {
    const finalOpacity = (props.bgOpacity ?? 0.8) * opacity;
    bgRef.value.style.opacity = String(finalOpacity);
  }
}

function handleClose() {
  opener.close();
}

function open(index?: number) {
  if (index !== undefined) {
    currentIndex.value = clampIndex(index);
    emit('update:index', currentIndex.value);
  }
  emit('update:open', true);
}

function toggleUI() {
  onToggleUI();
}

function setUiVisible(visible: boolean) {
  if (uiVisible.value !== visible) {
    uiVisible.value = visible;
    emit('uiVisibleChange', { visible: uiVisible.value });
  }
}

defineExpose<PhotoSwipeExpose>({
  open,
  toggleUI,
  setUiVisible,
});
</script>
