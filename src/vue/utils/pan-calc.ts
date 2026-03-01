/**
 * Pan 边界计算（纯函数）
 * 算法参考 src/js/slide/pan-bounds.js，不导入 src/js。
 */

import type { Axis, PanBoundsState, Point, SlideData } from '../types';
import { clamp } from './math';
import { parsePaddingOption } from './viewport';

export interface SlideInfo {
  width: number;
  height: number;
  data: SlideData;
  index: number;
  panAreaSize: Point;
}

export interface ViewportOptions {
  viewportSize: Point;
  options: Record<string, any>;
}

function updateAxis(
  axis: Axis,
  center: Point,
  max: Point,
  min: Point,
  slideInfo: SlideInfo,
  currZoomLevel: number,
  viewportOptions: ViewportOptions
): void {
  const { viewportSize, options } = viewportOptions;
  const elSize = axis === 'x' ? slideInfo.width * currZoomLevel : slideInfo.height * currZoomLevel;
  const paddingProp = axis === 'x' ? 'left' : 'top';
  const padding = parsePaddingOption(
    paddingProp,
    options,
    viewportSize,
    slideInfo.data,
    slideInfo.index
  );
  const panAreaSize = slideInfo.panAreaSize[axis];

  center[axis] = Math.round((panAreaSize - elSize) / 2) + padding;
  if (elSize > panAreaSize) {
    max[axis] = Math.round(panAreaSize - elSize) + padding;
    min[axis] = padding;
  } else {
    max[axis] = center[axis];
    min[axis] = center[axis];
  }
}

/** 创建空的 pan 边界状态（可被 updatePanBounds 更新） */
export function createPanBounds(): PanBoundsState {
  const center: Point = { x: 0, y: 0 };
  const max: Point = { x: 0, y: 0 };
  const min: Point = { x: 0, y: 0 };
  return {
    center,
    max,
    min,
    currZoomLevel: 1,
    correctPan(axis: Axis, panOffset: number): number {
      return clamp(panOffset, this.max[axis], this.min[axis]);
    },
  };
}

/** 根据当前缩放与 slide 信息更新 pan 边界 */
export function updatePanBounds(
  bounds: PanBoundsState,
  slideInfo: SlideInfo,
  zoomLevel: number,
  viewportOptions: ViewportOptions
): void {
  if (!slideInfo.width || !slideInfo.height) {
    bounds.center.x = 0;
    bounds.center.y = 0;
    bounds.max.x = 0;
    bounds.max.y = 0;
    bounds.min.x = 0;
    bounds.min.y = 0;
    bounds.currZoomLevel = zoomLevel;
    return;
  }
  bounds.currZoomLevel = zoomLevel;
  updateAxis('x', bounds.center, bounds.max, bounds.min, slideInfo, zoomLevel, viewportOptions);
  updateAxis('y', bounds.center, bounds.max, bounds.min, slideInfo, zoomLevel, viewportOptions);
}
