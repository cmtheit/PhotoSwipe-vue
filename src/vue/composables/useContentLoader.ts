/**
 * 内容缓存与懒加载
 * 参考 src/js/slide/loader.js，不导入 src/js。
 */

import type {
  ContentInstance,
  ContentLoaderAPI,
  DispatchResult,
  SlideData,
  SlideInstance,
} from '../types';

const MIN_SLIDES_TO_CACHE = 5;

/** useContentLoader 所需的 host 最小接口 */
export interface ContentLoaderHost {
  getNumItems(): number;
  getLoopedIndex(index: number): number;
  getItemData(index: number): SlideData;
  createContentFromData(data: SlideData, index: number): ContentInstance;
  dispatch(name: string, details?: any): DispatchResult;
  options: { preload: [number, number] };
  currIndex: number;
}

export function useContentLoader(host: ContentLoaderHost): ContentLoaderAPI {
  const limit = Math.max(
    host.options.preload[0] + host.options.preload[1] + 1,
    MIN_SLIDES_TO_CACHE
  );
  const _cachedItems: ContentInstance[] = [];

  function getContentByIndex(index: number): ContentInstance | undefined {
    return _cachedItems.find((c) => (c as { index: number }).index === index);
  }

  function removeByIndex(index: number): void {
    const i = _cachedItems.findIndex((c) => (c as { index: number }).index === index);
    if (i !== -1) _cachedItems.splice(i, 1);
  }

  function addToCache(content: ContentInstance): void {
    const idx = (content as { index: number }).index;
    removeByIndex(idx);
    _cachedItems.push(content);
    if (_cachedItems.length > limit) {
      const indexToRemove = _cachedItems.findIndex(
        (item) => !(item as { isAttached: boolean }).isAttached && !(item as { hasSlide: boolean }).hasSlide
      );
      if (indexToRemove !== -1) {
        const removed = _cachedItems.splice(indexToRemove, 1)[0];
        removed.destroy?.();
      }
    }
  }

  function loadSlideByIndex(initialIndex: number): void {
    const index = host.getLoopedIndex(initialIndex);
    let content = getContentByIndex(index);
    if (!content) {
      const itemData = host.getItemData(index);
      if (host.dispatch('lazyLoadSlide', { index, itemData }).defaultPrevented) return;
      content = host.createContentFromData(itemData, index);
      addToCache(content);
    }
    (content as { lazyLoad?: () => void }).lazyLoad?.();
  }

  function getContentBySlide(slide: SlideInstance): ContentInstance {
    let content = getContentByIndex(slide.index);
    if (!content) {
      content = host.createContentFromData(slide.data, slide.index);
      addToCache(content);
    }
    (content as { setSlide?: (s: SlideInstance) => void }).setSlide?.(slide);
    return content;
  }

  function updateLazy(diff?: number): void {
    if (host.dispatch('lazyLoad', {}).defaultPrevented) return;
    const preload = host.options.preload;
    const isForward = diff === undefined ? true : diff >= 0;
    for (let i = 0; i <= preload[1]; i++) {
      loadSlideByIndex(host.currIndex + (isForward ? i : -i));
    }
    for (let i = 1; i <= preload[0]; i++) {
      loadSlideByIndex(host.currIndex + (isForward ? -i : i));
    }
  }

  function destroy(): void {
    _cachedItems.forEach((c) => c.destroy?.());
    _cachedItems.length = 0;
  }

  return {
    updateLazy,
    getContentBySlide,
    getContentByIndex,
    addToCache,
    removeByIndex,
    loadSlideByIndex,
    destroy,
  };
}
