/**
 * 缩放级别计算（纯函数）
 * 算法参考 src/js/slide/zoom-level.js，不导入 src/js。
 */

import type { Point, SlideData, ZoomLevels } from '../types';

const MAX_IMAGE_WIDTH = 4000;

type ZoomLevelOption = number | 'fit' | 'fill' | ((z: ZoomLevels) => number) | undefined;

function parseZoomLevelOption(
  options: Record<string, any>,
  prefix: 'initial' | 'secondary' | 'max',
  levels: ZoomLevels
): number | undefined {
  const key = prefix + 'ZoomLevel';
  const value = options[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'function') return value(levels);
  if (value === 'fill') return levels.fill;
  if (value === 'fit') return levels.fit;
  return Number(value);
}

export function calculateZoomLevels(
  options: Record<string, any>,
  itemData: SlideData,
  width: number,
  height: number,
  panAreaSize: Point
): ZoomLevels {
  const elementSize: Point = { x: width, y: height };
  const hRatio = panAreaSize.x / elementSize.x;
  const vRatio = panAreaSize.y / elementSize.y;

  const fit = Math.min(1, hRatio < vRatio ? hRatio : vRatio);
  const fill = Math.min(1, hRatio > vRatio ? hRatio : vRatio);
  const vFill = Math.min(1, vRatio);

  const initial = parseZoomLevelOption(options, 'initial', { fit, fill, vFill, initial: 0, secondary: 0, max: 0, min: 0 }) ?? fit;

  let secondary = parseZoomLevelOption(options, 'secondary', { fit, fill, vFill, initial, secondary: 0, max: 0, min: 0 });
  if (secondary === undefined) {
    secondary = Math.min(1, fit * 3);
    if (elementSize.x * secondary > MAX_IMAGE_WIDTH) {
      secondary = MAX_IMAGE_WIDTH / elementSize.x;
    }
  }

  const maxZoom = parseZoomLevelOption(options, 'max', { fit, fill, vFill, initial, secondary, max: 0, min: 0 }) ?? Math.max(1, fit * 4);
  const max = Math.max(initial, secondary, maxZoom);
  const min = Math.min(fit, initial, secondary);

  return {
    fit,
    fill,
    vFill,
    initial,
    secondary,
    max,
    min,
    elementSize,
    panAreaSize,
  };
}
