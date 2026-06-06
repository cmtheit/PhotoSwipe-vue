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

type CacheableContent = ContentInstance & {
  index: number;
  data?: SlideData;
  isAttached?: boolean;
  hasSlide?: boolean;
  __pswpCacheKey?: string;
};

/** useContentLoader 所需的 host 最小接口 */
export interface ContentLoaderHost {
  getNumItems(): number;
  getLoopedIndex(index: number): number;
  getItemData(index: number): SlideData;
  getItemKey(index: number, data?: SlideData): string;
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

  function getContentCacheKey(content: ContentInstance): string {
    const cacheable = content as CacheableContent;
    const cachedKey = cacheable.__pswpCacheKey;
    if (cachedKey) return cachedKey;
    return host.getItemKey(cacheable.index, cacheable.data);
  }

  function setContentCacheKey(content: ContentInstance): void {
    const cacheable = content as CacheableContent;
    cacheable.__pswpCacheKey = host.getItemKey(cacheable.index, cacheable.data);
  }

  function getContentByIndex(index: number): ContentInstance | undefined {
    const key = host.getItemKey(index);
    return _cachedItems.find((c) => getContentCacheKey(c) === key);
  }

  function removeByIndex(index: number): void {
    const key = host.getItemKey(index);
    const i = _cachedItems.findIndex((c) => getContentCacheKey(c) === key);
    if (i !== -1) _cachedItems.splice(i, 1);
  }

  function addToCache(content: ContentInstance): void {
    setContentCacheKey(content);
    const key = getContentCacheKey(content);
    const i = _cachedItems.findIndex((c) => getContentCacheKey(c) === key);
    if (i !== -1) _cachedItems.splice(i, 1);
    _cachedItems.push(content);
    if (_cachedItems.length > limit) {
      const indexToRemove = _cachedItems.findIndex(
        (item) => {
          const cacheable = item as CacheableContent;
          return !cacheable.isAttached && !cacheable.hasSlide;
        }
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
    const key = host.getItemKey(slide.index, slide.data);
    let content = _cachedItems.find((c) => getContentCacheKey(c) === key);
    if (!content) {
      content = host.createContentFromData(slide.data, slide.index);
      addToCache(content);
    } else if (
      (content as CacheableContent).index !== slide.index ||
      (content as CacheableContent).data !== slide.data
    ) {
      content.updateData?.(slide.data, slide.index);
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
