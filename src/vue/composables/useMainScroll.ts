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

  function getCurrSlideX(): number {
    return 0;
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

    scrollX = 0;
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
      const destinationX = getCurrSlideX();
      if (!animate) {
        moveTo(destinationX);
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
            host.appendHeavy();
            onSlideComplete?.();
          },
        });
      }
      return false;
    }

    pendingDiff = diff;
    if (Math.abs(diff) >= 2) {
      moveTo(0);
      updateCurrItem();
      host.appendHeavy();
      onSlideComplete?.();
      return true;
    }

    const destinationX = -diff * slideWidth;
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
