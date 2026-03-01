/**
 * 缩略图边界计算（仅用 SlideData.element，不依赖 pswp 实例、不调用 applyFilters）
 */

import type { Bounds, SlideData } from '../types';

function getBoundsByElement(el: HTMLElement): Bounds {
  const rect = el.getBoundingClientRect();
  return { x: rect.left, y: rect.top, w: rect.width };
}

function getCroppedBoundsByElement(
  el: HTMLElement,
  imageWidth: number,
  imageHeight: number
): Bounds {
  const rect = el.getBoundingClientRect();
  const hRatio = rect.width / imageWidth;
  const vRatio = rect.height / imageHeight;
  const fillZoomLevel = hRatio > vRatio ? hRatio : vRatio;
  const offsetX = (rect.width - imageWidth * fillZoomLevel) / 2;
  const offsetY = (rect.height - imageHeight * fillZoomLevel) / 2;
  return {
    x: rect.left + offsetX,
    y: rect.top + offsetY,
    w: imageWidth * fillZoomLevel,
    innerRect: { w: rect.width, h: rect.height, x: offsetX, y: offsetY },
  };
}

/**
 * 根据 itemData.element 计算缩略图边界（用于打开/关闭过渡）
 * @param index 幻灯片索引（未使用，保留签名一致）
 * @param itemData 幻灯片数据，需含 element 或通过 thumbSelector 在 element 内查找
 * @param thumbSelector 缩略图选择器，默认 'img'；false 表示用 element 自身
 */
export function getThumbBounds(
  index: number,
  itemData: SlideData,
  thumbSelector?: string | false
): Bounds | undefined {
  const element = itemData.element;
  if (!element) return undefined;

  let thumb: HTMLElement | null = null;
  if (thumbSelector !== false) {
    const selector = thumbSelector || 'img';
    thumb = element.matches(selector) ? element : element.querySelector(selector);
  } else {
    thumb = element;
  }

  if (!thumb) return undefined;

  const w = itemData.width ?? itemData.w ?? 0;
  const h = itemData.height ?? itemData.h ?? 0;

  if (!itemData.thumbCropped) {
    return getBoundsByElement(thumb);
  }
  return getCroppedBoundsByElement(thumb, w, h);
}
