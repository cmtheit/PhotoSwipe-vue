/**
 * 指针/触摸事件 → 拖拽、缩放、点击
 * 参考 src/js/gestures/*.js，不导入 src/js。仅 pointer/touch，无纯 mouse 分支。
 */

import type { Point, ZoomState } from '../types';
import { equalizePoints, pointsEqual, getDistanceBetween, roundPoint, clamp } from '../utils/math';
import { DOMEvents } from '../core/dom-events';

const AXIS_SWIPE_HYSTERISIS = 10;
const DOUBLE_TAP_DELAY = 300;
const MIN_TAP_DISTANCE = 25;
const PAN_END_FRICTION = 0.35;
const VERTICAL_DRAG_FRICTION = 0.6;
const MIN_RATIO_TO_CLOSE = 0.4;
const MIN_NEXT_SLIDE_SPEED = 0.5;
const UPPER_ZOOM_FRICTION = 0.05;
const LOWER_ZOOM_FRICTION = 0.15;

function project(initialVelocity: number, decelerationRate: number): number {
  return (initialVelocity * decelerationRate) / (1 - decelerationRate);
}

function getZoomPointsCenter(
  out: Point,
  p1: Point,
  p2: Point
): Point {
  out.x = (p1.x + p2.x) / 2;
  out.y = (p1.y + p2.y) / 2;
  return out;
}

/** useGestures 所需的 host 接口 */
export interface GesturesHost {
  getScrollWrapEl(): HTMLElement | null;
  getOffset(): Point;
  getCurrSlide(): SlideLike | null;
  mainScroll: { moveTo(x: number, dragging?: boolean): void; getCurrSlideX(): number; getX(): number; isShifted(): boolean; moveIndexBy(diff: number, animate?: boolean, velocityX?: number): boolean };
  getOptions(): Record<string, any>;
  animations: { stopAll(): void; stopAllPan(): void; startSpring(props: SpringLike): void };
  dispatch(name: string, details?: any): { defaultPrevented?: boolean };
  applyFilters(name: string, value: any, ...args: any[]): any;
  applyBgOpacity(opacity: number): void;
  getViewportSize(): Point;
  getOpenerIsOpen(): boolean;
  emitRequestClose(): void;
  /** 点击/轻触时若 action 为 toggle-controls 则调用，用于切换 UI 显示 */
  toggleUI?(): void;
  emitZoomStateChange?(state: ZoomState): void;
  events: DOMEvents;
}

interface SlideLike {
  pan: Point;
  bounds: { center: Point; min: Point; max: Point; correctPan(axis: 'x' | 'y', v: number): number };
  currZoomLevel: number;
  zoomLevels: { fit: number; initial: number; max: number; min: number };
  setZoomLevel(z: number): void;
  applyCurrentZoomPan(): void;
  isPannable(): boolean;
  isZoomable(): boolean;
  toggleZoom(centerPoint?: Point): void;
  _setResolution?(z: number): void;
}

interface SpringLike {
  isPan?: boolean;
  start: number;
  end: number;
  velocity: number;
  dampingRatio?: number;
  naturalFrequency?: number;
  onUpdate: (v: number) => void;
  onComplete?: () => void;
}

export function useGestures(host: GesturesHost): { bindEvents(): void; unbind(): void } {
  const p1: Point = { x: 0, y: 0 };
  const p2: Point = { x: 0, y: 0 };
  const prevP1: Point = { x: 0, y: 0 };
  const prevP2: Point = { x: 0, y: 0 };
  const startP1: Point = { x: 0, y: 0 };
  const startP2: Point = { x: 0, y: 0 };
  const velocity: Point = { x: 0, y: 0 };
  const _lastStartP1: Point = { x: 0, y: 0 };
  const _intervalP1: Point = { x: 0, y: 0 };
  const _ongoingPointers: Point[] = [];

  let dragAxis: 'x' | 'y' | null = null;
  let _numActivePoints = 0;
  let _intervalTime = 0;
  let _velocityCalculated = false;
  let isMultitouch = false;
  let isDragging = false;
  let isZooming = false;
  let raf: number | null = null;
  let _tapTimer: ReturnType<typeof setTimeout> | null = null;

  const _pointerEventEnabled = !!(typeof window !== 'undefined' && window.PointerEvent);
  const _touchEventEnabled = typeof window !== 'undefined' && 'ontouchstart' in window;

  // ─── Drag handler (closure) ───
  const startPan: Point = { x: 0, y: 0 };
  function dragStart(): void {
    const curr = host.getCurrSlide();
    if (curr) equalizePoints(startPan, curr.pan);
    host.animations.stopAll();
  }
  function getVerticalDragRatio(panY: number): number {
    const curr = host.getCurrSlide();
    const centerY = curr?.bounds?.center?.y ?? 0;
    const vh = host.getViewportSize().y / 3;
    return (panY - centerY) / vh;
  }
  function setPanWithFriction(axis: 'x' | 'y', potentialPan: number, customFriction?: number): void {
    const curr = host.getCurrSlide();
    if (!curr) return;
    const { pan, bounds } = curr;
    const corrected = bounds.correctPan(axis, potentialPan);
    if (corrected !== potentialPan || customFriction !== undefined) {
      const delta = Math.round(potentialPan - pan[axis]);
      pan[axis] += delta * (customFriction ?? PAN_END_FRICTION);
    } else {
      pan[axis] = potentialPan;
    }
  }
  function dragChange(): void {
    const curr = host.getCurrSlide();
    const opts = host.getOptions();
    if (dragAxis === 'y' && opts.closeOnVerticalDrag && curr && curr.currZoomLevel <= curr.zoomLevels.fit && !isMultitouch) {
      const panY = curr.pan.y + (p1.y - prevP1.y);
      if (!host.dispatch('verticalDrag', { panY }).defaultPrevented) {
        setPanWithFriction('y', panY, VERTICAL_DRAG_FRICTION);
        const bgOpacity = 1 - Math.abs(getVerticalDragRatio(curr.pan.y));
        host.applyBgOpacity(bgOpacity);
        curr.applyCurrentZoomPan();
      }
    } else {
      const deltaX = p1.x - prevP1.x;
      const mainScrollX = host.mainScroll.getX();
      const currSlideMainScrollX = host.mainScroll.getCurrSlideX();
      const newMainScrollX = mainScrollX + deltaX;
      let mainScrollChanged = false;
      if (curr && opts.allowPanToNext && dragAxis === 'x' && !isMultitouch) {
        const mainScrollShiftDiff = mainScrollX - currSlideMainScrollX;
        const newPanX = curr.pan.x + deltaX;
        const bounds = curr.bounds;
        if (newPanX > bounds.min.x && deltaX > 0) {
          const wasAtMin = bounds.min.x <= startPan.x;
          if (wasAtMin) {
            host.mainScroll.moveTo(newMainScrollX, true);
            mainScrollChanged = true;
          } else setPanWithFriction('x', newPanX);
        } else if (newPanX < bounds.max.x && deltaX < 0) {
          const wasAtMax = startPan.x <= bounds.max.x;
          if (wasAtMax) {
            host.mainScroll.moveTo(newMainScrollX, true);
            mainScrollChanged = true;
          } else setPanWithFriction('x', newPanX);
        } else if (mainScrollShiftDiff !== 0) {
          if (mainScrollShiftDiff > 0) {
            host.mainScroll.moveTo(Math.max(newMainScrollX, currSlideMainScrollX), true);
          } else {
            host.mainScroll.moveTo(Math.min(newMainScrollX, currSlideMainScrollX), true);
          }
          mainScrollChanged = true;
        } else setPanWithFriction('x', newPanX);
      } else if (curr && !curr.isPannable() && !isMultitouch && deltaX !== 0) {
        host.mainScroll.moveTo(newMainScrollX, true);
        mainScrollChanged = true;
      }
      if (!mainScrollChanged && curr) {
        setPanWithFriction('y', curr.pan.y + (p1.y - prevP1.y));
        setPanWithFriction('x', curr.pan.x + deltaX);
        roundPoint(curr.pan);
        curr.applyCurrentZoomPan();
      }
    }
  }
  function dragEnd(): void {
    host.animations.stopAll();
    const curr = host.getCurrSlide();
    let indexDiff = 0;
    if (host.mainScroll.isShifted()) {
      const mainScrollX = host.mainScroll.getX();
      const currSlideX = host.mainScroll.getCurrSlideX();
      const mainScrollShiftDiff = mainScrollX - currSlideX;
      const currentSlideVisibilityRatio = mainScrollShiftDiff / host.getViewportSize().x;
      if ((velocity.x < -MIN_NEXT_SLIDE_SPEED && currentSlideVisibilityRatio < 0) || (velocity.x < 0.1 && currentSlideVisibilityRatio < -0.5)) {
        indexDiff = 1;
        velocity.x = Math.min(velocity.x, 0);
      } else if ((velocity.x > MIN_NEXT_SLIDE_SPEED && currentSlideVisibilityRatio > 0) || (velocity.x > -0.1 && currentSlideVisibilityRatio > 0.5)) {
        indexDiff = -1;
        velocity.x = Math.max(velocity.x, 0);
      }
      host.mainScroll.moveIndexBy(indexDiff, true, velocity.x);
    }
    if ((curr && curr.currZoomLevel > curr.zoomLevels.max) || isMultitouch) {
      zoomCorrectZoomPan(true);
    } else if (curr) {
      finishPanGestureForAxis('x');
      finishPanGestureForAxis('y');
    }
  }
  function finishPanGestureForAxis(axis: 'x' | 'y'): void {
    const curr = host.getCurrSlide();
    if (!curr) return;
    const panPos = curr.pan[axis];
    const restoreBgOpacity = axis === 'y' && (host as { bgOpacity?: number }).bgOpacity !== undefined && (host as { bgOpacity: number }).bgOpacity < 1;
    const decelerationRate = 0.995;
    const projectedPosition = panPos + project(velocity[axis], decelerationRate);
    if (restoreBgOpacity) {
      const vDragRatio = getVerticalDragRatio(panPos);
      const projectedVDragRatio = getVerticalDragRatio(projectedPosition);
      if ((vDragRatio < 0 && projectedVDragRatio < -MIN_RATIO_TO_CLOSE) || (vDragRatio > 0 && projectedVDragRatio > MIN_RATIO_TO_CLOSE)) {
        host.emitRequestClose();
        return;
      }
    }
    const correctedPanPosition = curr.bounds.correctPan(axis, projectedPosition);
    if (panPos === correctedPanPosition) return;
    const dampingRatio = correctedPanPosition === projectedPosition ? 1 : 0.82;
    const initialBgOpacity = (host as { bgOpacity?: number }).bgOpacity ?? 1;
    const totalPanDist = correctedPanPosition - panPos;
    host.animations.startSpring({
      isPan: true,
      name: 'panGesture' + axis,
      start: panPos,
      end: correctedPanPosition,
      velocity: velocity[axis],
      dampingRatio,
      onUpdate: (pos: number) => {
        if (restoreBgOpacity && (host as { bgOpacity?: number }).bgOpacity !== undefined && (host as { bgOpacity: number }).bgOpacity < 1) {
          const animationProgressRatio = 1 - (correctedPanPosition - pos) / totalPanDist;
          host.applyBgOpacity(clamp(initialBgOpacity + (1 - initialBgOpacity) * animationProgressRatio, 0, 1));
        }
        curr.pan[axis] = Math.floor(pos);
        curr.applyCurrentZoomPan();
      },
    });
  }

  // ─── Zoom handler (closure) ───
  const _startPan: Point = { x: 0, y: 0 };
  const _startZoomPoint: Point = { x: 0, y: 0 };
  const _zoomPoint: Point = { x: 0, y: 0 };
  let _wasOverFitZoomLevel = false;
  let _startZoomLevel = 1;
  function zoomStart(): void {
    const curr = host.getCurrSlide();
    if (curr) {
      _startZoomLevel = curr.currZoomLevel;
      equalizePoints(_startPan, curr.pan);
    }
    host.animations.stopAllPan();
    _wasOverFitZoomLevel = false;
  }
  function zoomChange(): void {
    const curr = host.getCurrSlide();
    if (!curr || !curr.isZoomable() || host.mainScroll.isShifted()) return;
    const minZ = curr.zoomLevels.min;
    const maxZ = curr.zoomLevels.max;
    getZoomPointsCenter(_startZoomPoint, startP1, startP2);
    getZoomPointsCenter(_zoomPoint, p1, p2);
    const distStart = getDistanceBetween(startP1, startP2) || 1;
    let currZoomLevel = (1 / distStart) * getDistanceBetween(p1, p2) * _startZoomLevel;
    if (currZoomLevel > curr.zoomLevels.initial + curr.zoomLevels.initial / 15) _wasOverFitZoomLevel = true;
    if (currZoomLevel < minZ) {
      if (host.getOptions().pinchToClose && !_wasOverFitZoomLevel && _startZoomLevel <= curr.zoomLevels.initial) {
        const bgOpacity = 1 - (minZ - currZoomLevel) / (minZ / 1.2);
        if (!host.dispatch('pinchClose', { bgOpacity }).defaultPrevented) host.applyBgOpacity(bgOpacity);
      } else {
        currZoomLevel = minZ - (minZ - currZoomLevel) * LOWER_ZOOM_FRICTION;
      }
    } else if (currZoomLevel > maxZ) {
      currZoomLevel = maxZ + (currZoomLevel - maxZ) * UPPER_ZOOM_FRICTION;
    }
    curr.pan.x = _zoomPoint.x - ((_startZoomPoint.x - _startPan.x) * (currZoomLevel / _startZoomLevel));
    curr.pan.y = _zoomPoint.y - ((_startZoomPoint.y - _startPan.y) * (currZoomLevel / _startZoomLevel));
    curr.setZoomLevel(currZoomLevel);
    curr.applyCurrentZoomPan();
  }
  function zoomCorrectZoomPan(ignoreGesture?: boolean): void {
    const curr = host.getCurrSlide();
    if (!curr?.isZoomable()) return;
    let destinationZoomLevel: number;
    let currZoomLevelNeedsChange = true;
    const prevZoomLevel = curr.currZoomLevel;
    if (prevZoomLevel < curr.zoomLevels.initial) destinationZoomLevel = curr.zoomLevels.initial;
    else if (prevZoomLevel > curr.zoomLevels.max) destinationZoomLevel = curr.zoomLevels.max;
    else {
      currZoomLevelNeedsChange = false;
      destinationZoomLevel = prevZoomLevel;
    }
    const initialBgOpacity = (host as { bgOpacity?: number }).bgOpacity ?? 1;
    const restoreBgOpacity = initialBgOpacity < 1;
    const initialPan = { x: curr.pan.x, y: curr.pan.y };
    let destinationPan = { x: initialPan.x, y: initialPan.y };
    let zoomPointX = _zoomPoint.x;
    let zoomPointY = _zoomPoint.y;
    let startZoomPointX = _startZoomPoint.x;
    let startZoomPointY = _startZoomPoint.y;
    let startZoomLevel = _startZoomLevel;
    if (ignoreGesture) {
      zoomPointX = zoomPointY = startZoomPointX = startZoomPointY = 0;
      startZoomLevel = prevZoomLevel;
      equalizePoints(_startPan, initialPan);
    }
    if (currZoomLevelNeedsChange) {
      const zoomFactor = destinationZoomLevel / startZoomLevel;
      destinationPan = {
        x: zoomPointX - (startZoomPointX - _startPan.x) * zoomFactor,
        y: zoomPointY - (startZoomPointY - _startPan.y) * zoomFactor,
      };
    }
    curr.setZoomLevel(destinationZoomLevel);
    destinationPan = {
      x: curr.bounds.correctPan('x', destinationPan.x),
      y: curr.bounds.correctPan('y', destinationPan.y),
    };
    curr.setZoomLevel(prevZoomLevel);
    const panNeedsChange = destinationPan.x !== initialPan.x || destinationPan.y !== initialPan.y;
    if (!panNeedsChange && !currZoomLevelNeedsChange && !restoreBgOpacity) {
      if (curr._setResolution) curr._setResolution(destinationZoomLevel);
      curr.applyCurrentZoomPan();
      return;
    }
    host.animations.stopAllPan();
    host.animations.startSpring({
      isPan: true,
      start: 0,
      end: 1000,
      velocity: 0,
      dampingRatio: 1,
      naturalFrequency: 40,
      onUpdate: (now: number) => {
        const t = now / 1000;
        if (panNeedsChange || currZoomLevelNeedsChange) {
          if (panNeedsChange) {
            curr.pan.x = initialPan.x + (destinationPan.x - initialPan.x) * t;
            curr.pan.y = initialPan.y + (destinationPan.y - initialPan.y) * t;
          }
          if (currZoomLevelNeedsChange) {
            curr.setZoomLevel(prevZoomLevel + (destinationZoomLevel - prevZoomLevel) * t);
          }
          curr.applyCurrentZoomPan();
        }
        if (restoreBgOpacity) host.applyBgOpacity(clamp(initialBgOpacity + (1 - initialBgOpacity) * t, 0, 1));
      },
      onComplete: () => {
        if (curr._setResolution) curr._setResolution(destinationZoomLevel);
        curr.applyCurrentZoomPan();
      },
    });
  }
  function zoomEnd(): void {
    const curr = host.getCurrSlide();
    const opts = host.getOptions();
    if ((!curr || curr.currZoomLevel < curr.zoomLevels.initial) && !_wasOverFitZoomLevel && opts.pinchToClose) {
      host.emitRequestClose();
    } else {
      zoomCorrectZoomPan();
    }
  }

  // ─── Tap handler ───
  function doClickOrTapAction(actionName: string, point: Point, originalEvent: Event): void {
    const opts = host.getOptions();
    const actionFullName = actionName + 'Action';
    const optionValue = opts[actionFullName];
    if (host.dispatch(actionFullName, { point, originalEvent }).defaultPrevented) return;
    if (typeof optionValue === 'function') {
      optionValue(point, originalEvent);
      return;
    }
    const curr = host.getCurrSlide();
    switch (optionValue) {
      case 'close':
      case 'next':
        if (optionValue === 'close') host.emitRequestClose();
        else host.mainScroll.moveIndexBy(1, true);
        break;
      case 'zoom':
        curr?.toggleZoom(point);
        break;
      case 'zoom-or-close':
        if (curr?.isZoomable() && curr.zoomLevels.secondary !== curr.zoomLevels.initial) curr.toggleZoom(point);
        else if (opts.clickToCloseNonZoomable) host.emitRequestClose();
        break;
      case 'toggle-controls':
        host.toggleUI?.();
        break;
      default:
        break;
    }
  }
  function tapClick(point: Point, e: Event): void {
    const target = (e.target as HTMLElement);
    const isImageClick = target.classList?.contains('pswp__img');
    const isBgClick = target.classList?.contains('pswp__item') || target.classList?.contains('pswp__zoom-wrap');
    if (isImageClick) doClickOrTapAction('imageClick', point, e);
    else if (isBgClick) doClickOrTapAction('bgClick', point, e);
  }
  function tapTap(point: Point, e: Event): void {
    const target = (e.target as HTMLElement).closest?.('.pswp__container');
    if (target) doClickOrTapAction('tap', point, e);
  }
  function tapDoubleTap(point: Point, e: Event): void {
    const target = (e.target as HTMLElement).closest?.('.pswp__container');
    if (target) doClickOrTapAction('doubleTap', point, e);
  }

  // ─── Pointer/touch handling ───
  function _convertEventPosToPoint(e: { pageX: number; pageY: number; pointerId?: number; identifier?: number }, out: Point): Point {
    const offset = host.getOffset();
    out.x = e.pageX - offset.x;
    out.y = e.pageY - offset.y;
    if ('pointerId' in e) out.id = e.pointerId;
    else if ('identifier' in e) out.id = (e as { identifier: number }).identifier;
    return out;
  }
  function _updatePoints(e: PointerEvent | TouchEvent, pointerType: 'up' | 'down' | 'move'): void {
    if (_pointerEventEnabled) {
      const pe = e as PointerEvent;
      const pointerIndex = _ongoingPointers.findIndex((p) => p.id === pe.pointerId);
      if (pointerType === 'up' && pointerIndex > -1) _ongoingPointers.splice(pointerIndex, 1);
      else if (pointerType === 'down' && pointerIndex === -1) {
        const pt: Point = { x: 0, y: 0 };
        _convertEventPosToPoint(pe, pt);
        _ongoingPointers.push(pt);
      } else if (pointerIndex > -1) _convertEventPosToPoint(pe, _ongoingPointers[pointerIndex]);
      _numActivePoints = _ongoingPointers.length;
      if (_numActivePoints > 0) equalizePoints(p1, _ongoingPointers[0]);
      if (_numActivePoints > 1) equalizePoints(p2, _ongoingPointers[1]);
    } else {
      _numActivePoints = 0;
      const te = e as TouchEvent;
      if (te.touches?.length > 0) {
        _convertEventPosToPoint(te.touches[0], p1);
        _numActivePoints++;
        if (te.touches.length > 1) {
          _convertEventPosToPoint(te.touches[1], p2);
          _numActivePoints++;
        }
      }
      if (pointerType === 'up') _numActivePoints = 0;
    }
  }
  function _calculateDragDirection(): void {
    if (host.mainScroll.isShifted()) dragAxis = 'x';
    else {
      const diff = Math.abs(p1.x - startP1.x) - Math.abs(p1.y - startP1.y);
      if (diff !== 0) {
        const axisToCheck = diff > 0 ? 'x' : 'y';
        if (Math.abs(p1[axisToCheck] - startP1[axisToCheck]) >= AXIS_SWIPE_HYSTERISIS) dragAxis = axisToCheck;
      }
    }
  }
  function _updatePrevPoints(): void {
    equalizePoints(prevP1, p1);
    equalizePoints(prevP2, p2);
  }
  function _updateStartPoints(): void {
    equalizePoints(startP1, p1);
    equalizePoints(startP2, p2);
    _updatePrevPoints();
  }
  function _updateVelocity(force?: boolean): void {
    const time = Date.now();
    const duration = time - _intervalTime;
    if (duration < 50 && !force) return;
    velocity.x = Math.abs(p1.x - _intervalP1.x) > 1 && duration > 5 ? (p1.x - _intervalP1.x) / duration : 0;
    velocity.y = Math.abs(p1.y - _intervalP1.y) > 1 && duration > 5 ? (p1.y - _intervalP1.y) / duration : 0;
    _intervalTime = time;
    equalizePoints(_intervalP1, p1);
    _velocityCalculated = true;
  }
  function _rafRenderLoop(): void {
    if (!isDragging && !isZooming) return;
    _updateVelocity();
    if (isDragging && !pointsEqual(p1, prevP1)) dragChange();
    else if (isZooming && (!pointsEqual(p1, prevP1) || !pointsEqual(p2, prevP2))) zoomChange();
    _updatePrevPoints();
    raf = requestAnimationFrame(_rafRenderLoop);
  }
  function _rafStopLoop(): void {
    if (raf !== null) {
      cancelAnimationFrame(raf);
      raf = null;
    }
  }
  function _clearTapTimer(): void {
    if (_tapTimer) {
      clearTimeout(_tapTimer);
      _tapTimer = null;
    }
  }
  function _finishDrag(): void {
    if (!isDragging) return;
    isDragging = false;
    if (!_velocityCalculated) _updateVelocity(true);
    dragEnd();
    dragAxis = null;
  }
  function _finishTap(e: Event): void {
    if (host.mainScroll.isShifted()) {
      host.mainScroll.moveIndexBy(0, true);
      return;
    }
    if ((e.type as string).indexOf('cancel') > 0) return;
    const ev = e as PointerEvent;
    if (ev.type === 'mouseup' || ev.pointerType === 'mouse') {
      tapClick(startP1, e);
      return;
    }
    const tapDelay = host.getOptions().doubleTapAction ? DOUBLE_TAP_DELAY : 0;
    if (_tapTimer) {
      _clearTapTimer();
      if (getDistanceBetween(_lastStartP1, startP1) < MIN_TAP_DISTANCE) tapDoubleTap(startP1, e);
    } else {
      equalizePoints(_lastStartP1, startP1);
      _tapTimer = setTimeout(() => {
        tapTap(startP1, e);
        _clearTapTimer();
      }, tapDelay);
    }
  }

  const onPointerDown = (e: PointerEvent | TouchEvent): void => {
    const isMouse = (e as PointerEvent).pointerType === 'mouse' || (e as PointerEvent).type === 'mousedown';
    if (isMouse && (e as PointerEvent).button > 0) return;
    if (!host.getOpenerIsOpen()) {
      e.preventDefault();
      return;
    }
    if (host.dispatch('pointerDown', { originalEvent: e }).defaultPrevented) return;
    if (isMouse) {
      const prevent = host.applyFilters('preventPointerEvent', true, e, 'down');
      if (prevent) e.preventDefault();
    }
    host.animations.stopAll();
    _updatePoints(e, 'down');
    if (_numActivePoints === 1) {
      dragAxis = null;
      equalizePoints(startP1, p1);
    }
    if (_numActivePoints > 1) _clearTapTimer();
    else isMultitouch = false;
  };

  const onPointerMove = (e: PointerEvent | TouchEvent): void => {
    (e as PointerEvent).preventDefault?.();
    if (!_numActivePoints) return;
    _updatePoints(e, 'move');
    if (host.dispatch('pointerMove', { originalEvent: e }).defaultPrevented) return;
    if (_numActivePoints === 1 && !isDragging) {
      if (!dragAxis) _calculateDragDirection();
      if (dragAxis && !isDragging) {
        if (isZooming) {
          isZooming = false;
          zoomEnd();
        }
        isDragging = true;
        _clearTapTimer();
        _updateStartPoints();
        _intervalTime = Date.now();
        _velocityCalculated = false;
        equalizePoints(_intervalP1, p1);
        velocity.x = velocity.y = 0;
        dragStart();
        _rafStopLoop();
        _rafRenderLoop();
      }
    } else if (_numActivePoints > 1 && !isZooming) {
      _finishDrag();
      isZooming = true;
      _updateStartPoints();
      zoomStart();
      _rafStopLoop();
      _rafRenderLoop();
    }
  };

  const onPointerUp = (e: PointerEvent | TouchEvent): void => {
    if (!_numActivePoints) return;
    _updatePoints(e, 'up');
    if (host.dispatch('pointerUp', { originalEvent: e }).defaultPrevented) return;
    if (_numActivePoints === 0) {
      _rafStopLoop();
      if (isDragging) _finishDrag();
      else if (!isZooming && !isMultitouch) _finishTap(e);
    }
    if (_numActivePoints < 2 && isZooming) {
      isZooming = false;
      zoomEnd();
      if (_numActivePoints === 1) {
        dragAxis = null;
        _updateStartPoints();
      }
    }
  };

  const onClick = (e: MouseEvent): void => {
    if (host.mainScroll.isShifted()) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  let bound = false;
  const listeners: { target: EventTarget; type: string; listener: EventListener; passive?: boolean }[] = [];
  function add(target: EventTarget, type: string, listener: EventListener, passive?: boolean): void {
    host.events.add(target as HTMLElement, type, listener, passive);
    listeners.push({ target, type, listener, passive });
  }
  function removeAllListeners(): void {
    listeners.forEach(({ target, type, listener, passive }) => {
      host.events.remove(target as HTMLElement, type, listener, passive);
    });
    listeners.length = 0;
  }
  function bindEvents(): void {
    const el = host.getScrollWrapEl();
    if (!el || bound) return;
    bound = true;
    const clickListener = onClick as EventListener;
    const downListener = onPointerDown as EventListener;
    const moveListener = onPointerMove as EventListener;
    const upListener = onPointerUp as EventListener;
    add(el, 'click', clickListener);
    if (_pointerEventEnabled) {
      add(el, 'pointerdown', downListener);
      add(window, 'pointermove', moveListener);
      add(window, 'pointerup', upListener);
      add(el, 'pointercancel', upListener);
    } else if (_touchEventEnabled) {
      add(el, 'touchstart', downListener);
      add(window, 'touchmove', moveListener, true);
      add(window, 'touchend', upListener);
      add(el, 'touchcancel', upListener);
      (el as unknown as { ontouchmove?: () => void }).ontouchmove = () => {};
      (el as unknown as { ontouchend?: () => void }).ontouchend = () => {};
    }
  }
  function unbind(): void {
    if (!bound) return;
    bound = false;
    _rafStopLoop();
    _clearTapTimer();
    removeAllListeners();
  }
  return { bindEvents, unbind };
}
