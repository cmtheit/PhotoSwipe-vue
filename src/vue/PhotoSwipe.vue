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
          :get-items="getItems"
          :current-index="currentIndex"
          :use-slide-slot="hasSlideSlot"
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
          @video-double-tap="emit('videoDoubleTap')"
          @bg-opacity-change="onBgOpacityChange"
          @slide-complete="isSliding = false"
          @reach-boundary="onReachBoundary"
          @swipe="onSwipe"
        >
          <template v-if="hasSlideSlot" #slide="slotProps">
            <slot name="slide" v-bind="slotProps" />
          </template>
        </PswpSlideView>
        <Transition name="pswp-ui-fade">
          <PswpUI
            v-if="uiVisible"
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
        </Transition>
      </section>
      <slot name="overlay" />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount, useSlots } from 'vue';
import type { PhotoSwipeProps, PhotoSwipeEmits, PhotoSwipeExpose, SlideData } from './types';

defineOptions({ inheritAttrs: false });

const slots = useSlots();
/** 消费方是否提供了 #slide 作用域插槽（自定义每张幻灯片渲染） */
const hasSlideSlot = computed(() => !!slots.slide);

watch(hasSlideSlot,() => {
  console.log('has slide slot', hasSlideSlot.value)
}, {
  immediate: true
})

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
/** runInit 之后到关闭动画结束之前为 true：slideView 已按本轮数据初始化，可以重定位 / 导航 */
let slidesReady = false;
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
/** 交给 slideView 读实时数据源：本组件 watcher 里重定位 / 导航时它的 items prop 还没更新 */
const getItems = () => dataSource.value;
const totalItems = computed(() => dataSource.value.length);
const currentItem = computed(() => dataSource.value[currentIndex.value] ?? null);

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
    slidesReady = false;
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

const rootStyle = computed(() => {
  if (props.zIndex == null) return undefined;
  return {
    zIndex: props.zIndex,
    '--pswp-root-z-index': String(props.zIndex),
  } as Record<string, string | number>;
});

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
  slidesReady = true;
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
      // 关闭动画途中重新打开：旧一轮的 slideView 状态作废，等 runInit 按新 index 重新初始化
      slidesReady = false;
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

/**
 * dataSource 与 index 是一个受控状态（「这份列表 + 当前是第几张」），合在一个 watcher 里按固定顺序收敛：
 * 1. 先按当前幻灯片的 id 在新列表里重定位（relocate：不导航、保留缩放）；找不到就原地换成
 *    index 指向的那张。
 * 2. 再导航到 index。
 * 上层常把两者一起换掉（如滑动窗口平移）。拆成两个 watcher 时谁先跑取决于 prop 赋值顺序，
 * index 先跑会在旧列表的坐标系里 goTo，带动画倒退一张。合并后上层回设的状态与当前显示一致时整轮是 no-op。
 *
 * 用户手势翻页还没结算时不导航：此刻上层还没收到 swipe，index 必然是旧的，强行收敛会把
 * 用户刚滑出去的那张拉回来；结算后上层回设，再走这里收敛。
 */
watch(
  [dataSource, () => props.index],
  () => {
    if (!isMounted.value || !slidesReady) return; // 未初始化：runInit 会直接按 index 打开
    const list = dataSource.value;
    if (list.length === 0) {
      handleClose();
      return;
    }
    const target = clampIndex(props.index);

    const foundIndex = currentSlideId.value
      ? list.findIndex((item, idx) => getSlideId(item, idx) === currentSlideId.value)
      : -1;
    // relocate 下标有变化时自己会经 update:currentIndex 走 onSlideIndexChange
    if (foundIndex !== -1) {
      slideViewRef.value?.relocate(foundIndex);
    } else {
      // 当前这张已不在列表里：原地换成上层指定的那张，不做翻页动画
      slideViewRef.value?.relocate(target);
      if (currentSlideId.value !== getSlideId(list[target]!, target)) onSlideIndexChange(target, 'reset');
    }

    if (!props.open || slideViewRef.value?.hasPendingUserMove?.()) return;
    slideViewRef.value?.goTo(target); // 已在 / 正前往 target 时 goTo 自身是 no-op
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
      return;
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

function onReachBoundary(payload: { direction: 'prev' | 'next'; index: number }) {
  emit('reachBoundary', payload);
}

function onSwipe(payload: { direction: 'prev' | 'next'; index: number }) {
  emit('swipe', payload);
}

function handleClose() {
  slideViewRef.value?.pauseAllVideos?.();
  slideViewRef.value?.stopAllAnimations?.();
  opener.close();
}

function recoverFromVerticalDrag() {
  slideViewRef.value?.stopAllAnimations?.();
  bgOpacityRef.value = 1;
  if (bgRef.value) {
    bgRef.value.style.opacity = String(props.bgOpacity ?? 0.8);
  }
  slideViewRef.value?.zoomAndPanToInitial?.();
  slideViewRef.value?.applyCurrentSlideTransform?.();
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
  recoverFromVerticalDrag,
});
</script>

<style scoped>
.pswp-ui-fade-enter-active,
.pswp-ui-fade-leave-active {
  transition: opacity var(--pswp-transition-duration, 333ms) cubic-bezier(0.4, 0, 0.22, 1);
}

.pswp-ui-fade-enter-from,
.pswp-ui-fade-leave-to {
  opacity: 0.005;
}

.pswp-ui-fade-enter-to,
.pswp-ui-fade-leave-from {
  opacity: 1;
}
</style>
