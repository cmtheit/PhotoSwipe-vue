/**
 * 视口尺寸与 padding 工具
 * 不依赖 src/js，无 Vue。
 */

import type { Point, SlideData } from '../types';

export function getViewportSize(options: Record<string, any> = {}): Point {
  if (typeof options.getViewportSizeFn === 'function') {
    const result = options.getViewportSizeFn(options);
    if (result && typeof result.x === 'number' && typeof result.y === 'number') {
      return result;
    }
  }
  return {
    x: document.documentElement.clientWidth,
    y: window.innerHeight,
  };
}

export function parsePaddingOption(
  prop: 'left' | 'top' | 'bottom' | 'right',
  options: Record<string, any>,
  viewportSize: Point,
  itemData: SlideData,
  index: number
): number {
  let paddingValue = 0;
  if (typeof options.paddingFn === 'function') {
    const o = options.paddingFn(viewportSize, itemData, index);
    paddingValue = o?.[prop] ?? 0;
  } else if (options.padding && typeof options.padding[prop] === 'number') {
    paddingValue = options.padding[prop];
  } else {
    const legacyPropName = 'padding' + prop[0].toUpperCase() + prop.slice(1);
    const v = (options as Record<string, number>)[legacyPropName];
    if (typeof v === 'number') paddingValue = v;
  }
  return Number(paddingValue) || 0;
}

export function getPanAreaSize(
  options: Record<string, any>,
  viewportSize: Point,
  itemData: SlideData,
  index: number
): Point {
  return {
    x:
      viewportSize.x -
      parsePaddingOption('left', options, viewportSize, itemData, index) -
      parsePaddingOption('right', options, viewportSize, itemData, index),
    y:
      viewportSize.y -
      parsePaddingOption('top', options, viewportSize, itemData, index) -
      parsePaddingOption('bottom', options, viewportSize, itemData, index),
  };
}
