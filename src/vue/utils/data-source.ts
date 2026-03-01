/**
 * DataSource 相关的工具函数
 * 仅支持数组形式，不支持 DOM gallery 解析
 */

import type { SlideData } from '../types';

export type DataSource = SlideData[];

/**
 * 从 dataSource 获取总数量
 */
export function getNumItems(dataSource: DataSource | undefined | null): number {
  if (!dataSource) return 0;
  return dataSource.length;
}

/**
 * 从 dataSource 获取指定 index 的数据
 */
export function getItemData(
  dataSource: DataSource | undefined | null,
  index: number
): SlideData {
  if (!dataSource || index < 0 || index >= dataSource.length) {
    return {};
  }
  return dataSource[index] || {};
}

/**
 * 将逻辑下标解析为真实下标。
 * - loop=true 时允许负数和越界，始终映射到 [0, numItems-1]
 * - loop=false 时越界返回 null
 */
export function resolveIndex(
  logicalIndex: number,
  numItems: number,
  loop: boolean
): number | null {
  if (numItems <= 0) return null;
  if (loop) {
    return ((logicalIndex % numItems) + numItems) % numItems;
  }
  if (logicalIndex < 0 || logicalIndex >= numItems) {
    return null;
  }
  return logicalIndex;
}

/**
 * 根据逻辑下标获取当前应展示的 slide 数据。
 */
export function getSlideDataByIndex(
  logicalIndex: number,
  items: SlideData[] | undefined | null,
  loop: boolean
): SlideData | null {
  if (!items || items.length === 0) {
    return null;
  }
  const resolvedIndex = resolveIndex(logicalIndex, items.length, loop);
  if (resolvedIndex === null) {
    return null;
  }
  return items[resolvedIndex] ?? null;
}
