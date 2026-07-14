/**
 * 3-holder 轮转、moveTo、moveIndexBy、resize、updateCurrItem
 * 参考 src/js/main-scroll.js，不导入 src/js。holder 元素由 Vue 模板提供，init 时赋给 itemHolders。
 */

import type { ItemHolder, MainScrollAPI } from '../types';
import { setTransform } from '../utils/dom';
import { Animations } from '../core/animations';

const MAIN_SCROLL_END_FRICTION = 0.35;

/** useMainScroll 所需的 host 接口 */
export interface MainScrollHost {
  getViewportSize(): { x: number; y: number };
  getSpacing(): number;
  setContent(holder: ItemHolder, index: number, force?: boolean): void;
  setHolderLogicalIndex(slotIndex: number, logicalIndex: number): void;
  getNumItems(): number;
  canLoop(): boolean;
  getLoopedIndex(index: number): number;
  getCurrIndex(): number;
  setCurrIndex(v: number): void;
  getPotentialIndex(): number;
  setPotentialIndex(v: number): void;
  getCurrSlide(): { pan: { x: number; y: number }; applyCurrentZoomPan(): void } | null;
  setCurrSlide(slide: unknown): void;
  animations: Animations;
  appendHeavy(): void;
  contentLoader: { updateLazy(diff: number): void };
  dispatch(name: string, details?: any): void;
}

export function useMainScroll(host: MainScrollHost): MainScrollAPI {
  let scrollX = 0;
  let slideWidth = 0;
  let pendingDiff = 0;
  let itemHolders: ItemHolder[] = [];

  function applyTransforms(): void {
    itemHolders.forEach((holder, i) => {
      if (holder.el) {
        setTransform(holder.el, (i - 1) * slideWidth + scrollX);
      }
    });
  }

  // 对齐上游 main-scroll.js 的 getCurrSlideX（slideWidth * _currPositionIndex）语义：
  // moveIndexBy 之后、updateCurrItem 结算之前，“当前逻辑位置”的静止 X 已是 pending 目标
  // （本坐标系下为 -pendingDiff * slideWidth），而非 0。dragEnd 的 currentSlideVisibilityRatio、
  // dragChange 的 mainScrollShiftDiff、moveTo 的边界摩擦、isShifted 都以它为基准——
  // 若恒为 0，点按冻结结算动画后 dragEnd 会以旧幻灯片为基准把在途的一步再计一次
  // （pendingDiff 累到 ±2，触发无动画直跳下下张）。
  function getCurrSlideX(): number {
    return -pendingDiff * slideWidth;
  }

  function moveTo(newX: number, dragging?: boolean): void {
    if (!host.canLoop() && dragging && slideWidth > 0) {
      const newSlideIndexOffset =
        (getCurrSlideX() - newX) / slideWidth + host.getCurrIndex();
      const delta = Math.round(newX - scrollX);
      const numItems = host.getNumItems();
      if (
        (newSlideIndexOffset < 0 && delta > 0) ||
        (newSlideIndexOffset >= numItems - 1 && delta < 0)
      ) {
        newX = scrollX + delta * MAIN_SCROLL_END_FRICTION;
      }
    }
    scrollX = newX;
    applyTransforms();
    host.dispatch('moveMainScroll', { x: newX, dragging: dragging ?? false });
  }

  function resize(resizeSlides?: boolean): void {
    const viewport = host.getViewportSize();
    const newSlideWidth = Math.round(viewport.x + viewport.x * host.getSpacing());
    const slideWidthChanged = newSlideWidth !== slideWidth;
    if (slideWidthChanged) {
      slideWidth = newSlideWidth;
      applyTransforms();
    }
    itemHolders.forEach((holder, index) => {
      if (holder.el) {
        if (resizeSlides && holder.slide) {
          (holder.slide as unknown as { resize(): void }).resize();
        }
      }
    });
  }

  function resetPosition(): void {
    scrollX = 0;
    slideWidth = 0;
    pendingDiff = 0;
  }

  function updateCurrItem(): void {
    const positionDifference = pendingDiff;
    if (!positionDifference) return;

    // 重定基而非清零：scrollX 改为相对新 curr 静止位（动画完成时恰为 0）。
    // 提前结算（moveIndexBy 的 |pendingDiff| >= 2 路径）时保留剩余视觉位移，
    // 轮转前后各 holder 的视觉位置不变，结算后动画可无缝继续补完。
    scrollX += positionDifference * slideWidth;
    pendingDiff = 0;

    host.setCurrIndex(host.getPotentialIndex());

    let diffAbs = Math.abs(positionDifference);
    let tempHolder: ItemHolder | undefined;

    if (diffAbs >= 3) {
      itemHolders.forEach((h) => {
        h.slide?.destroy?.();
        h.slide = undefined;
      });
      if (itemHolders[0]?.slotIndex !== undefined) {
        host.setHolderLogicalIndex(itemHolders[0].slotIndex, host.getCurrIndex() - 1);
      }
      if (itemHolders[1]?.slotIndex !== undefined) {
        host.setHolderLogicalIndex(itemHolders[1].slotIndex, host.getCurrIndex());
      }
      if (itemHolders[2]?.slotIndex !== undefined) {
        host.setHolderLogicalIndex(itemHolders[2].slotIndex, host.getCurrIndex() + 1);
      }
    } else {
      for (let i = 0; i < diffAbs; i++) {
        if (positionDifference > 0) {
          tempHolder = itemHolders.shift();
          if (tempHolder) {
            itemHolders.push(tempHolder);
            if (tempHolder.slotIndex !== undefined) {
              host.setHolderLogicalIndex(tempHolder.slotIndex, host.getCurrIndex() - diffAbs + i + 2);
            }
          }
        } else {
          tempHolder = itemHolders.pop();
          if (tempHolder) {
            itemHolders.unshift(tempHolder);
            if (tempHolder.slotIndex !== undefined) {
              host.setHolderLogicalIndex(tempHolder.slotIndex, host.getCurrIndex() + diffAbs - i - 2);
            }
          }
        }
      }
    }

    host.animations.stopAllPan?.();

    itemHolders.forEach((holder, i) => {
      if (holder.slide) {
        (holder.slide as unknown as { setIsActive(v: boolean): void }).setIsActive(i === 1);
      }
    });

    host.setCurrSlide(itemHolders[1]?.slide ?? null);
    host.contentLoader.updateLazy(positionDifference);

    const curr = host.getCurrSlide();
    if (curr) curr.applyCurrentZoomPan();
    host.dispatch('change');
    applyTransforms();
  }

  function moveIndexBy(diff: number, animate?: boolean, velocityX?: number, onSlideComplete?: () => void): boolean {
    const requestedDiff = diff;
    let newIndex = host.getPotentialIndex() + diff;
    const numSlides = host.getNumItems();

    if (host.canLoop()) {
      newIndex = host.getLoopedIndex(newIndex);
      const distance = (diff + numSlides) % numSlides;
      diff = distance <= numSlides / 2 ? distance : distance - numSlides;
    } else {
      newIndex = Math.max(0, Math.min(numSlides - 1, newIndex));
      diff = newIndex - host.getPotentialIndex();
    }

    host.setPotentialIndex(newIndex);
    host.animations.stopMainScroll?.();

    if (!diff) {
      if (!host.canLoop() && requestedDiff !== 0) {
        host.dispatch('reachBoundary', {
          direction: requestedDiff > 0 ? 'next' : 'prev',
          index: host.getPotentialIndex(),
        });
      }
      // 可能存在未结算的 pendingDiff（上一次动画被本次打断）：目标位置按累计量走，
      // 完成后 updateCurrItem 结算（pendingDiff=0 时其为 no-op）。
      const destinationX = -pendingDiff * slideWidth;
      if (!animate) {
        moveTo(destinationX);
        updateCurrItem();
        onSlideComplete?.();
      } else {
        host.animations.startSpring({
          isMainScroll: true,
          start: scrollX,
          end: destinationX,
          velocity: velocityX ?? 0,
          naturalFrequency: 30,
          dampingRatio: 1,
          onUpdate: (newX) => moveTo(newX),
          onComplete: () => {
            updateCurrItem();
            host.appendHeavy();
            onSlideComplete?.();
          },
        });
      }
      return false;
    }

    // 累积未结算位移（对齐上游 main-scroll.js 的 `_currPositionIndex -= diff` 语义）。
    // 覆盖式赋值（pendingDiff = diff）是错的：快速连划时第二次 moveIndexBy 在上一次动画
    // settle 前到达，potentialIndex 已累积（如 20→21→22），若 pendingDiff 只记最后一次的 1，
    // updateCurrItem 会把 currIndex 直接跳到 potentialIndex（+2）却只轮转 1 个 holder ——
    // holder 逻辑索引与 currIndex 从此永久错位，后续每次轮转把错位复制成相邻重复
    // （实测:中位滞留 curr-1，左右 swipe 渲染同一张图）。
    // 累积后恒有 pendingDiff === potentialIndex - currIndex，结算轮转数与索引跳变一致。
    pendingDiff += diff;
    let destinationX = -pendingDiff * slideWidth;
    if (Math.abs(pendingDiff) >= 2) {
      // 快速连滑（在途 1 步 + 新 1 步）或跨多张跳转：提前结算轮转 holder
      // （对齐上游 |currDiff| > 1 时在动画途中 force updateCurrItem），
      // updateCurrItem 重定基后 scrollX 保留剩余位移，动画继续补完而非瞬时直跳。
      updateCurrItem();
      destinationX = 0;
    }
    if (!animate) {
      moveTo(destinationX);
      updateCurrItem();
      onSlideComplete?.();
    } else {
      host.animations.startSpring({
        isMainScroll: true,
        start: scrollX,
        end: destinationX,
        velocity: velocityX ?? 0,
        naturalFrequency: 30,
        dampingRatio: 1,
        onUpdate: (newX) => moveTo(newX),
        onComplete: () => {
          updateCurrItem();
          host.appendHeavy();
          onSlideComplete?.();
        },
      });
    }
    return Boolean(diff);
  }

  function isShifted(): boolean {
    return scrollX !== getCurrSlideX();
  }

  function cancelPending(): void {
    pendingDiff = 0;
    scrollX = 0;
    applyTransforms();
  }

  function setItemHolders(holders: ItemHolder[]): void {
    itemHolders = holders;
    applyTransforms();
  }

  return {
    resize,
    resetPosition,
    moveTo,
    moveIndexBy,
    getCurrSlideX,
    getX: () => scrollX,
    isShifted,
    updateCurrItem,
    cancelPending,
    setItemHolders,
  };
}
