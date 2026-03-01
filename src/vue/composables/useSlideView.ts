/**
 * 编排 useContentLoader、useMainScroll、useGestures，创建 SlideViewCtx，返回 init/destroy 与 expose。
 */

import type { Ref } from 'vue';
import { computed, reactive, watch, type WatchStopHandle } from 'vue';
import type {
  ContentLoaderAPI,
  ContentInstance,
  HolderSlot,
  ItemHolder,
  MainScrollAPI,
  Point,
  SlideData,
  SlideViewEmits,
  SlideViewExpose,
  SlideViewProps,
  SlideInstance,
  ZoomState,
} from '../types';
import { equalizePoints } from '../utils/math';
import { getViewportSize } from '../utils/viewport';
import { Eventable } from '../core/eventable';
import { DOMEvents } from '../core/dom-events';
import { Animations } from '../core/animations';
import { useContentLoader, type ContentLoaderHost } from './useContentLoader';
import { useMainScroll, type MainScrollHost } from './useMainScroll';
import { useGestures, type GesturesHost } from './useGestures';
import { Content } from '../slide/content';
import { Slide } from '../slide/slide';
import { getSlideDataByIndex, resolveIndex } from '../utils/data-source';

const DEFAULT_PRELOAD: [number, number] = [1, 2];

export interface UseSlideViewDomRefs {
  containerEl: Ref<HTMLElement | null>;
  holderEls: Ref<HTMLDivElement[]>;
  zoomWrapEls: Ref<HTMLDivElement[]>;
  imgEls: Ref<HTMLImageElement[]>;
  htmlEls: Ref<HTMLDivElement[]>;
  scrollWrapEl: Ref<HTMLElement | null>;
}

export function useSlideView(
  props: SlideViewProps,
  emit: (e: string, ...args: any[]) => void,
  domRefs: UseSlideViewDomRefs
): {
  holderSlots: HolderSlot[];
  onImgLoad(slotIndex: number): void;
  onImgError(slotIndex: number): void;
  init(initialIndex: number): void;
  destroy(): void;
  completeOpen(): void;
  expose: SlideViewExpose;
} {
  const eventable = new Eventable();
  const events = new DOMEvents();
  const animations = new Animations();

  const viewportSize: Point = { x: 0, y: 0 };
  const offset: Point = { x: 0, y: 0 };
  let currSlide: SlideInstance | null = null;
  let currIndex = 0;
  let potentialIndex = 0;
  let bgOpacity = 1;
  let contentLoader: ContentLoaderAPI;
  let mainScroll: MainScrollAPI;
  let gesturesBind: { bindEvents(): void; unbind(): void } | null = null;
  let initialized = false;
  let resizeHandler: (() => void) | null = null;
  let itemHolders: ItemHolder[] = [];
  const holderLogicalIndices = reactive<number[]>([0, 0, 0]);
  const holderEnabled = reactive<boolean[]>([false, false, false]);
  const holderWatchStops: WatchStopHandle[] = [];
  let _openerIsOpen = false;
  const holderSlots = reactive<HolderSlot[]>(
    Array.from({ length: 3 }).map(() => ({
      visible: false,
      ariaHidden: true,
      hasSlide: false,
      transformStyle: '',
      contentType: 'image',
      contentAttached: false,
      imgSrc: '',
      imgSrcset: '',
      imgAlt: '',
      imgSizes: '',
      contentWidth: 0,
      contentHeight: 0,
      htmlContent: '',
      isError: false,
      errorHtml: '',
    }))
  );

  const options = (): Record<string, any> => ({
    spacing: props.spacing ?? 0.1,
    easing: props.easing ?? 'cubic-bezier(.4,0,.22,1)',
    zoomAnimationDuration: props.zoomAnimationDuration ?? 333,
    preload: props.preload ?? DEFAULT_PRELOAD,
    allowPanToNext: props.allowPanToNext ?? true,
    pinchToClose: props.pinchToClose ?? true,
    closeOnVerticalDrag: props.closeOnVerticalDrag ?? true,
    clickToCloseNonZoomable: props.clickToCloseNonZoomable ?? true,
    imageClickAction: 'zoom-or-close',
    bgClickAction: 'close',
    tapAction: 'toggle-controls',
    doubleTapAction: 'zoom',
  });

  function getNumItems(): number {
    return props.items?.length ?? 0;
  }
  function getLoopedIndex(index: number): number {
    const n = getNumItems();
    if (n <= 0) return 0;
    return ((index % n) + n) % n;
  }
  function canLoop(): boolean {
    return props.loop ?? true;
  }
  function getItemData(index: number): SlideData {
    const i = getLoopedIndex(index);
    return props.items[i];
  }
  function getResolvedIndex(logicalIndex: number): number | null {
    return resolveIndex(logicalIndex, getNumItems(), canLoop());
  }
  function getHolderBySlotIndex(slotIndex: number): ItemHolder | undefined {
    return itemHolders.find((holder) => holder.slotIndex === slotIndex);
  }
  function getViewportCenterPoint(): Point {
    return { x: viewportSize.x / 2, y: viewportSize.y / 2 };
  }
  function updateOffset(): void {
    const el = domRefs.scrollWrapEl?.value ?? domRefs.containerEl?.value;
    if (el) {
      const r = el.getBoundingClientRect();
      offset.x = r.left + (window.scrollX ?? window.pageXOffset);
      offset.y = r.top + (window.scrollY ?? window.pageYOffset);
    }
  }
  function updateSize(force?: boolean): void {
    const opts = options();
    equalizePoints(viewportSize, getViewportSize(opts));
    updateOffset();
    mainScroll?.resize(force);
  }
  function createSlideForHolder(holder: ItemHolder, logicalIndex: number, force?: boolean): void {
    const index = getResolvedIndex(logicalIndex);
    if (index === null) {
      if (holder.slide) {
        holder.slide.destroy();
        holder.slide = undefined;
      }
      return;
    }

    const data = getItemData(index);
    if (!data) {
      return;
    }

    const slot = holder.slot;
    const slotIndex = holder.slotIndex ?? 0;
    if (!slot) return;

    if (holder.slide) {
      if (holder.slide.index === index && !force) {
        return;
      }
      holder.slide.destroy();
      holder.slide = undefined;
    }

    const slide = new Slide(data, index, ctx as any, slot, {
      getContainerEl: () => domRefs.zoomWrapEls.value?.[slotIndex] ?? null,
      getImageEl: () => domRefs.imgEls.value?.[slotIndex] ?? null,
      getHtmlEl: () => domRefs.htmlEls.value?.[slotIndex] ?? null,
    });
    if (index === currIndex) {
      ctx.currSlide = slide;
    }
    if (holder.el) {
      slide.append(holder.el);
    }
    holder.slide = slide;
  }
  function setHolderLogicalIndex(slotIndex: number, logicalIndex: number): void {
    holderLogicalIndices[slotIndex] = logicalIndex;
  }
  function bindHolderDataWatchers(): void {
    holderWatchStops.forEach((stop) => stop());
    holderWatchStops.length = 0;

    const itemCountStop = watch(
      () => props.items?.length ?? 0,
      (newLen) => {
        if (!initialized || newLen === 0) return;

        if (currIndex >= newLen) {
          currIndex = newLen - 1;
          emit('update:currentIndex', currIndex);
          for (let pos = 0; pos < itemHolders.length; pos += 1) {
            const holder = itemHolders[pos];
            if (holder && holder.slotIndex !== undefined) {
              setHolderLogicalIndex(holder.slotIndex, currIndex + pos - 1);
            }
          }
        }
      }
    );
    holderWatchStops.push(itemCountStop);

    for (let slotIndex = 0; slotIndex < 3; slotIndex += 1) {
      const resolvedState = computed(() => {
        if (!holderEnabled[slotIndex]) {
          return {
            data: null as SlideData | null,
            resolvedIndex: null as number | null,
          };
        }
        const resolvedIndex = getResolvedIndex(holderLogicalIndices[slotIndex]);
        const data = getSlideDataByIndex(
          holderLogicalIndices[slotIndex],
          props.items,
          canLoop()
        );
        return {
          data,
          resolvedIndex,
        };
      });

      const stop = watch(
        resolvedState,
        (newState, oldState) => {
          const holder = getHolderBySlotIndex(slotIndex);
          if (!holder) return;

          const { data, resolvedIndex } = newState;
          if (!data || resolvedIndex === null) {
            if (holder.slide) {
              holder.slide.destroy();
              holder.slide = undefined;
            }
            return;
          }

          if (oldState && oldState.data === data && oldState.resolvedIndex === resolvedIndex) {
            return;
          }

          if (!holder.slide) {
            createSlideForHolder(holder, holderLogicalIndices[slotIndex], true);
            return;
          }

          (holder.slide as Slide).updateData(data, resolvedIndex);
        },
        { immediate: true, deep: true }
      );
      holderWatchStops.push(stop);
    }
  }
  function createContentFromData(data: SlideData, index: number): ContentInstance {
    return new Content(data, ctx as any, index);
  }
  function applyBgOpacity(opacity: number): void {
    bgOpacity = opacity;
    emit('bgOpacityChange', opacity);
  }
  function appendHeavy(): void {
    itemHolders.forEach((holder) => {
      if (holder.slide) {
        (holder.slide as any).appendHeavy?.();
      }
    });
  }
  function emitZoomStateFromCurrSlide(): void {
    const slide = currSlide as any;
    if (!slide) return;
    const zoomedIn = slide.currZoomLevel > slide.zoomLevels?.initial;
    const zoomAllowed = !!slide?.isZoomable?.();
    const clickToZoom = zoomAllowed && slide.zoomLevels?.secondary !== slide.zoomLevels?.initial;
    emit('zoomStateChange', { zoomedIn, zoomAllowed, clickToZoom });
  }

  const ctx = {
    get viewportSize() {
      return viewportSize;
    },
    get offset() {
      return offset;
    },
    get currSlide() {
      return currSlide;
    },
    set currSlide(v: SlideInstance | null) {
      currSlide = v;
      emitZoomStateFromCurrSlide();
    },
    get currIndex() {
      return currIndex;
    },
    set currIndex(v: number) {
      currIndex = v;
      emit('update:currentIndex', v);
    },
    get potentialIndex() {
      return potentialIndex;
    },
    set potentialIndex(v: number) {
      potentialIndex = v;
    },
    get options() {
      return options();
    },
    getNumItems,
    getLoopedIndex,
    canLoop,
    getItemData,
    getViewportCenterPoint,
    setContent: createSlideForHolder,
    setHolderLogicalIndex,
    createContentFromData,
    applyBgOpacity,
    appendHeavy,
    updateSize,
    get containerEl() {
      return domRefs.containerEl;
    },
    get scrollWrapEl() {
      return domRefs.scrollWrapEl;
    },
    animations,
    events,
    on: eventable.on.bind(eventable),
    off: eventable.off.bind(eventable),
    dispatch: eventable.dispatch.bind(eventable),
    applyFilters: eventable.applyFilters.bind(eventable),
    emitIndexChange: (i: number) => emit('update:currentIndex', i),
    emitRequestClose: () => emit('requestClose'),
    emitZoomStateChange: (s: ZoomState) => emit('zoomStateChange', s),
    get opener() {
      return { isOpen: _openerIsOpen };
    },
    get contentLoader() {
      return contentLoader;
    },
    get mainScroll() {
      return mainScroll;
    },
    set contentLoader(v: ContentLoaderAPI) {
      (ctx as any)._contentLoader = v;
    },
    set mainScroll(v: MainScrollAPI) {
      (ctx as any)._mainScroll = v;
    },
    get bgOpacity() {
      return bgOpacity;
    },
  };

  const contentLoaderHost: ContentLoaderHost = {
    getNumItems,
    getLoopedIndex,
    getItemData,
    createContentFromData,
    dispatch: eventable.dispatch.bind(eventable),
    get options() {
      return { preload: options().preload ?? DEFAULT_PRELOAD };
    },
    get currIndex() {
      return currIndex;
    },
  };
  contentLoader = useContentLoader(contentLoaderHost);

  const mainScrollHost: MainScrollHost = {
    getViewportSize: () => viewportSize,
    getSpacing: () => options().spacing ?? 0.1,
    setContent: createSlideForHolder,
    setHolderLogicalIndex,
    getNumItems,
    canLoop,
    getLoopedIndex,
    getCurrIndex: () => currIndex,
    setCurrIndex: (v) => { currIndex = v; emit('update:currentIndex', v); },
    getPotentialIndex: () => potentialIndex,
    setPotentialIndex: (v) => { potentialIndex = v; },
    getCurrSlide: () => currSlide as any,
    setCurrSlide: (v) => { currSlide = v as SlideInstance | null; emitZoomStateFromCurrSlide(); },
    animations,
    appendHeavy,
    get contentLoader() {
      return contentLoader;
    },
    dispatch: (name, d) => eventable.dispatch(name, d),
  };
  mainScroll = useMainScroll(mainScrollHost);

  (ctx as any).contentLoader = contentLoader;
  (ctx as any).mainScroll = mainScroll;

  const gesturesHost: GesturesHost = {
    getScrollWrapEl: () => domRefs.scrollWrapEl?.value ?? null,
    getOffset: () => offset,
    getCurrSlide: () => currSlide as any,
    mainScroll,
    getOptions: options,
    animations,
    dispatch: (name, d) => eventable.dispatch(name, d ?? {}),
    applyFilters: eventable.applyFilters.bind(eventable),
    applyBgOpacity,
    getViewportSize: () => viewportSize,
    getOpenerIsOpen: () => _openerIsOpen,
    emitRequestClose: () => emit('requestClose'),
    toggleUI: () => emit('toggleUI'),
    events,
  };
  Object.defineProperty(gesturesHost, 'bgOpacity', { get: () => bgOpacity });
  gesturesBind = useGestures(gesturesHost);

  function init(initialIndex: number): void {
    if (initialized) return;
    const n = getNumItems();
    const idx = n > 0 ? Math.max(0, Math.min(initialIndex, n - 1)) : 0;
    currIndex = idx;
    potentialIndex = idx;
    const holders: ItemHolder[] = (domRefs.holderEls?.value ?? []).map((el, i) => ({
      el,
      slide: undefined,
      slot: holderSlots[i],
      slotIndex: i,
    }));
    itemHolders = holders;
    holders.forEach((h) => {
      if (h.slot) {
        h.slot.visible = true;
      }
    });
    holderEnabled[0] = true;
    holderEnabled[1] = true;
    holderEnabled[2] = true;
    setHolderLogicalIndex(0, idx - 1);
    setHolderLogicalIndex(1, idx);
    setHolderLogicalIndex(2, idx + 1);
    mainScroll.setItemHolders(holders);
    updateSize();
    bindHolderDataWatchers();
    const middleHolder = holders[1];
    const slide = middleHolder?.slide;
    if (slide) {
      ctx.currSlide = slide;
      (slide as any).zoomAndPanToInitial?.();
      eventable.dispatch('firstZoomPan', { slide });
      (slide as any).applyCurrentZoomPan?.();
      eventable.dispatch('afterSetContent', { slide });
    }

    resizeHandler = () => updateSize(true);
    window.addEventListener('resize', resizeHandler);
    eventable.dispatch('bindEvents');
    gesturesBind?.bindEvents();

    initialized = true;
  }

  // 新增：opener 动画结束后调用
  function completeOpen(): void {
    _openerIsOpen = true;
    appendHeavy();
    contentLoader.updateLazy(0);
  }

  function destroy(): void {
    if (!initialized) return;
    itemHolders.forEach((holder) => {
      holder.slide?.destroy?.();
      holder.slide = undefined;
      if (holder.slot) {
        holder.slot.visible = false;
        holder.slot.hasSlide = false;
        holder.slot.transformStyle = '';
        holder.slot.contentAttached = false;
        holder.slot.ariaHidden = true;
      }
    });
    holderEnabled[0] = false;
    holderEnabled[1] = false;
    holderEnabled[2] = false;
    holderWatchStops.forEach((stop) => stop());
    holderWatchStops.length = 0;
    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler);
      resizeHandler = null;
    }
    gesturesBind?.unbind();
    gesturesBind = null;
    contentLoader?.destroy?.();
    mainScroll?.resetPosition?.();
    initialized = false;
  }

  function onImgLoad(slotIndex: number): void {
    const holder = itemHolders.find((h) => h.slotIndex === slotIndex);
    const content = holder?.slide?.content as { onImageLoad?: () => void; syncCurrentElements?: () => void } | undefined;
    content?.syncCurrentElements?.();
    content?.onImageLoad?.();
  }

  function onImgError(slotIndex: number): void {
    const holder = itemHolders.find((h) => h.slotIndex === slotIndex);
    const content = holder?.slide?.content as { onImageError?: () => void; syncCurrentElements?: () => void } | undefined;
    content?.syncCurrentElements?.();
    content?.onImageError?.();
  }

  const expose: SlideViewExpose = {
    getCurrentSlideContainer() {
      return currSlide ? (currSlide as unknown as { container: HTMLDivElement | null }).container : null;
    },
    getCurrentSlideTransform() {
      return currSlide ? (currSlide as any).getCurrentTransform?.() ?? '' : '';
    },
    getCurrentSlideData() {
      return currSlide?.data ?? null;
    },
    setCurrentSlideZoomPan(pan: Point, zoom: number) {
      if (!currSlide) return;
      (currSlide as any).pan.x = pan.x;
      (currSlide as any).pan.y = pan.y;
      (currSlide as any).setZoomLevel?.(zoom);
      (currSlide as any).applyCurrentZoomPan?.();
    },
    zoomAndPanToInitial() {
      currSlide && (currSlide as any).zoomAndPanToInitial?.();
    },
    applyCurrentSlideTransform() {
      currSlide && (currSlide as any).applyCurrentZoomPan?.();
    },
    getPlaceholderElement() {
      return currSlide ? (currSlide as any).getPlaceholderElement?.() : null;
    },
    currentSlideUsesPlaceholder() {
      return !!currSlide && !!(currSlide as any).getPlaceholderElement?.();
    },
    getCurrentSlideWidth() {
      return (currSlide as any)?.width ?? 0;
    },
    getCurrentSlideInitialZoom() {
      return (currSlide as any)?.zoomLevels?.initial ?? 1;
    },
    handleResize() {
      updateSize(true);
    },
    toggleZoom(centerPoint?: Point) {
      (currSlide as any)?.toggleZoom?.(centerPoint);
    },
    goTo(index: number) {
      const n = getNumItems();
      const i = Math.max(0, Math.min(index, n - 1));
      const diff = i - potentialIndex;
      mainScroll?.moveIndexBy(diff, true, undefined, () => emit('slideComplete'));
    },
    getContainerElement() {
      return domRefs.containerEl?.value ?? null;
    },
    getHolderElements() {
      return domRefs.holderEls?.value ?? [];
    },
    isScrollShifted() {
      return mainScroll?.isShifted?.() ?? false;
    },
    resetScrollPosition() {
      mainScroll?.resetPosition?.();
    },
    resizeScroll() {
      mainScroll?.resize?.(true);
    },
    appendHeavy() {
      itemHolders.forEach((holder) => {
        if (holder.slide) {
          (holder.slide as any).appendHeavy?.();
        }
      });
    },
    setOpenerOpen(value: boolean) {
      _openerIsOpen = value;
    },
  };

  return { holderSlots, onImgLoad, onImgError, init, destroy, completeOpen, expose };
}
