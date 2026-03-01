/**
 * Slide：单张幻灯片的 zoom/pan/resize/append/destroy
 * 使用 zoom-calc、pan-calc 纯函数，不导入 src/js。
 */

import type {
  ContentInstance,
  HolderSlot,
  ItemHolder,
  Point,
  SlideData,
  SlideHost,
  SlideInstance,
  ZoomLevels,
} from '../types';
import { toTransformString } from '../utils/dom';
import { equalizePoints, roundPoint, clamp } from '../utils/math';
import { getPanAreaSize } from '../utils/viewport';
import { calculateZoomLevels } from '../utils/zoom-calc';
import {
  createPanBounds,
  updatePanBounds,
  type SlideInfo,
  type ViewportOptions,
} from '../utils/pan-calc';
import { Content } from './content';

export class Slide implements SlideInstance {
  data: SlideData;
  index: number;
  readonly host: SlideHost;

  isActive: boolean;
  currentResolution = 0;
  panAreaSize: Point = { x: 0, y: 0 };
  pan: Point = { x: 0, y: 0 };

  content: ContentInstance;
  container: HTMLDivElement | null = null;
  holder: ItemHolder;
  holderElement: HTMLElement | null = null;
  slot: HolderSlot;

  zoomLevels!: ZoomLevels;
  bounds: ReturnType<typeof createPanBounds>;

  currZoomLevel = 1;
  width: number;
  height: number;
  heavyAppended = false;

  prevDisplayedWidth = -1;
  prevDisplayedHeight = -1;

  isFirstSlide: boolean;
  private _getContainerEl: () => HTMLDivElement | null;
  private _getImageEl: () => HTMLImageElement | null;
  private _getHtmlEl: () => HTMLDivElement | null;

  constructor(
    data: SlideData,
    index: number,
    host: SlideHost,
    slot: HolderSlot,
    domRefs: {
      getContainerEl: () => HTMLDivElement | null;
      getImageEl: () => HTMLImageElement | null;
      getHtmlEl: () => HTMLDivElement | null;
    }
  ) {
    this.data = data;
    this.index = index;
    this.host = host;
    this.slot = slot;
    this.isActive = index === (host.currSlide?.index ?? -1);
    this.bounds = createPanBounds();
    this._getContainerEl = domRefs.getContainerEl;
    this._getImageEl = domRefs.getImageEl;
    this._getHtmlEl = domRefs.getHtmlEl;

    host.dispatch('gettingData', { slide: this, data: this.data, index: this.index });

    this.content = host.contentLoader.getContentBySlide(this);
    (this.content as Content).setSlide(this);

    this.width = this.content.width ?? 0;
    this.height = this.content.height ?? 0;
    this.holder = { el: null, slot }; // 由 append(holderElement) 赋值

    this.isFirstSlide = this.isActive && !host.opener?.isOpen;

    this.calculateSize();

    host.dispatch('slideInit', { slide: this });
  }

  setIsActive(isActive: boolean): void {
    if (isActive && !this.isActive) {
      this.activate();
    } else if (!isActive && this.isActive) {
      this.deactivate();
    }
  }

  append(holderElement: HTMLDivElement): void {
    this.container = this._getContainerEl();
    this.holderElement = holderElement;
    this.holder = { el: holderElement, slide: this, slot: this.slot };
    this.slot.hasSlide = true;
    this.slot.ariaHidden = !this.isActive;
    if (this.container) {
      this.container.style.transformOrigin = '0 0';
    }

    if (!this.data) return;

    this.calculateSize();
    this.load();
    this.updateContentSize();
    this.appendHeavy();

    this.zoomAndPanToInitial();
    this.host.dispatch('firstZoomPan', { slide: this });
    this.applyCurrentZoomPan();
    this.host.dispatch('afterSetContent', { slide: this });

    if (this.isActive) {
      this.activate();
    }
  }

  load(): void {
    this.content.load?.(false);
    this.host.dispatch('slideLoad', { slide: this });
  }

  appendHeavy(): void {
    const appendHeavyNearby = true;

    if (
      this.heavyAppended ||
      !this.host.opener?.isOpen ||
      this.host.mainScroll.isShifted() ||
      (!this.isActive && !appendHeavyNearby)
    ) {
      return;
    }

    if (this.host.dispatch('appendHeavy', { slide: this }).defaultPrevented) {
      return;
    }

    this.heavyAppended = true;
    this.content.append();
    this.host.dispatch('appendHeavyContent', { slide: this });
  }

  activate(): void {
    this.isActive = true;
    this.appendHeavy();
    this.content.activate?.();
    this.host.dispatch('slideActivate', { slide: this });
  }

  deactivate(): void {
    this.isActive = false;
    this.content.deactivate?.();

    if (this.currZoomLevel !== this.zoomLevels.initial) {
      this.calculateSize();
    }

    this.currentResolution = 0;
    this.zoomAndPanToInitial();
    this.applyCurrentZoomPan();
    this.updateContentSize();
    this.host.dispatch('slideDeactivate', { slide: this });
  }

  updateData(newData: SlideData, newIndex?: number): void {
    const prevWidth = this.width;
    const prevHeight = this.height;

    this.data = newData;
    if (typeof newIndex === 'number') {
      this.index = newIndex;
    }
    this.width = Number(newData.w) || Number(newData.width) || 0;
    this.height = Number(newData.h) || Number(newData.height) || 0;

    (this.content as Content).updateData(newData, this.index);
    this.calculateSize();
    this.zoomAndPanToInitial();
    this.applyCurrentZoomPan();
    this.updateContentSize(this.width !== prevWidth || this.height !== prevHeight);
  }

  destroy(): void {
    (this.content as Content).hasSlide = false;
    (this.content as Content).resetSlotState?.();
    this.content.remove?.();
    this.host.dispatch('slideDestroy', { slide: this });
  }

  resize(): void {
    if (this.currZoomLevel === this.zoomLevels.initial || !this.isActive) {
      this.calculateSize();
      this.currentResolution = 0;
      this.zoomAndPanToInitial();
      this.applyCurrentZoomPan();
      this.updateContentSize();
    } else {
      this.calculateSize();
      updatePanBounds(
        this.bounds,
        this._slideInfo(),
        this.currZoomLevel,
        this._viewportOptions()
      );
      this.panTo(this.pan.x, this.pan.y);
    }
  }

  updateContentSize(force?: boolean): void {
    const scaleMultiplier = this.currentResolution || this.zoomLevels.initial;
    if (!scaleMultiplier) return;

    const width =
      Math.round(this.width * scaleMultiplier) || this.host.viewportSize.x;
    const height =
      Math.round(this.height * scaleMultiplier) || this.host.viewportSize.y;

    if (!this.sizeChanged(width, height) && !force) return;
    this.content.setDisplayedSize(width, height);
  }

  sizeChanged(width: number, height: number): boolean {
    if (width !== this.prevDisplayedWidth || height !== this.prevDisplayedHeight) {
      this.prevDisplayedWidth = width;
      this.prevDisplayedHeight = height;
      return true;
    }
    return false;
  }

  getPlaceholderElement(): HTMLImageElement | HTMLDivElement | null | undefined {
    return null;
  }

  zoomTo(
    destZoomLevel: number,
    centerPoint?: Point,
    transitionDuration?: number | false,
    ignoreBounds?: boolean
  ): void {
    if (
      !this.isZoomable() ||
      this.host.mainScroll.isShifted()
    ) {
      return;
    }

    this.host.dispatch('beforeZoomTo', {
      destZoomLevel,
      centerPoint,
      transitionDuration,
    });

    this.host.animations.stopAllPan();

    const point = centerPoint ?? this.host.getViewportCenterPoint();
    const prevZoomLevel = this.currZoomLevel;

    if (!ignoreBounds) {
      destZoomLevel = clamp(
        destZoomLevel,
        this.zoomLevels.min,
        this.zoomLevels.max
      );
    }

    this.setZoomLevel(destZoomLevel);
    this.pan.x = this.calculateZoomToPanOffset('x', point, prevZoomLevel);
    this.pan.y = this.calculateZoomToPanOffset('y', point, prevZoomLevel);
    roundPoint(this.pan);

    const finishTransition = () => {
      this._setResolution(destZoomLevel);
      this.applyCurrentZoomPan();
    };

    if (!transitionDuration) {
      finishTransition();
    } else {
      const containerEl = this.container ?? this._getContainerEl();
      if (!containerEl) {
        finishTransition();
        return;
      }
      this.host.animations.startTransition({
        isPan: true,
        name: 'zoomTo',
        target: containerEl,
        transform: this.getCurrentTransform(),
        onPropertyUpdate: (value) => {
          this.slot.transformStyle = value;
        },
        onComplete: finishTransition,
        duration: transitionDuration,
        easing: this.host.options.easing,
      });
    }
  }

  toggleZoom(centerPoint?: Point): void {
    this.zoomTo(
      this.currZoomLevel === this.zoomLevels.initial
        ? this.zoomLevels.secondary
        : this.zoomLevels.initial,
      centerPoint,
      this.host.options.zoomAnimationDuration as number | undefined
    );
  }

  setZoomLevel(currZoomLevel: number): void {
    this.currZoomLevel = currZoomLevel;
    updatePanBounds(
      this.bounds,
      this._slideInfo(),
      this.currZoomLevel,
      this._viewportOptions()
    );
  }

  calculateZoomToPanOffset(
    axis: 'x' | 'y',
    point?: Point,
    prevZoomLevel?: number
  ): number {
    const totalPanDistance = this.bounds.max[axis] - this.bounds.min[axis];
    if (totalPanDistance === 0) {
      return this.bounds.center[axis];
    }

    const p = point ?? this.host.getViewportCenterPoint();
    const prev = prevZoomLevel ?? this.zoomLevels.initial;
    const zoomFactor = this.currZoomLevel / prev;
    return this.bounds.correctPan(
      axis,
      (this.pan[axis] - p[axis]) * zoomFactor + p[axis]
    );
  }

  panTo(panX: number, panY: number): void {
    this.pan.x = this.bounds.correctPan('x', panX);
    this.pan.y = this.bounds.correctPan('y', panY);
    this.applyCurrentZoomPan();
  }

  isPannable(): boolean {
    return !!this.width && this.currZoomLevel > this.zoomLevels.fit;
  }

  isZoomable(): boolean {
    return !!this.width && (this.content as Content).isZoomable();
  }

  applyCurrentZoomPan(): void {
    this._applyZoomTransform(this.pan.x, this.pan.y, this.currZoomLevel);
    if (this === this.host.currSlide) {
      this.host.dispatch('zoomPanUpdate', { slide: this });
    }
  }

  zoomAndPanToInitial(): void {
    this.currZoomLevel = this.zoomLevels.initial;
    updatePanBounds(
      this.bounds,
      this._slideInfo(),
      this.currZoomLevel,
      this._viewportOptions()
    );
    equalizePoints(this.pan, this.bounds.center);
    this.host.dispatch('initialZoomPan', { slide: this });
  }

  _applyZoomTransform(x: number, y: number, zoom: number): void {
    const resolution = this.currentResolution || this.zoomLevels.initial;
    const scale = zoom / resolution;
    this.slot.transformStyle = toTransformString(x, y, scale);
  }

  calculateSize(): void {
    equalizePoints(
      this.panAreaSize,
      getPanAreaSize(
        this.host.options,
        this.host.viewportSize,
        this.data,
        this.index
      )
    );

    this.zoomLevels = calculateZoomLevels(
      this.host.options,
      this.data,
      this.width,
      this.height,
      this.panAreaSize
    );

    this.host.dispatch('calcSlideSize', { slide: this });
  }

  getCurrentTransform(): string {
    const resolution = this.currentResolution || this.zoomLevels.initial;
    const scale = this.currZoomLevel / resolution;
    return toTransformString(this.pan.x, this.pan.y, scale);
  }

  _setResolution(newResolution: number): void {
    if (newResolution === this.currentResolution) return;

    this.currentResolution = newResolution;
    this.updateContentSize();
    this.host.dispatch('resolutionChanged');
  }

  getImageElement(): HTMLImageElement | null {
    return this._getImageEl();
  }

  getHtmlElement(): HTMLDivElement | null {
    return this._getHtmlEl();
  }

  private _slideInfo(): SlideInfo {
    return {
      width: this.width,
      height: this.height,
      data: this.data,
      index: this.index,
      panAreaSize: this.panAreaSize,
    };
  }

  private _viewportOptions(): ViewportOptions {
    return {
      viewportSize: this.host.viewportSize,
      options: this.host.options,
    };
  }
}
