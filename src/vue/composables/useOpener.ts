/**
 * 打开/关闭动画（fade/zoom/none），通过 OpenerCtx 访问所需元素。
 * 从 src/js/opener.js 移植，不导入 src/js。
 */

import type { Bounds, OpenerAPI, OpenerCtx, Point } from '../types';
import { setTransform, toTransformString, decodeImage } from '../utils/dom';

const MIN_OPACITY = 0.003;

export function useOpener(ctx: OpenerCtx): OpenerAPI {
  let isClosed = true;
  let isOpen = false;
  let isClosing = false;
  let isOpening = false;
  let _duration: number | false | undefined = undefined;
  let _useAnimation = false;
  let _croppedZoom = false;
  let _animateRootOpacity = false;
  let _animateBgOpacity = false;
  let _placeholder: HTMLElement | null | undefined = undefined;
  let _opacityElement: HTMLElement | null | undefined = undefined;
  let _cropContainer1: HTMLDivElement | undefined = undefined;
  let _cropContainer2: HTMLDivElement | null | undefined = undefined;
  let _thumbBounds: Bounds | undefined = undefined;
  /** 打开时延迟 _initiate 的 timer，用于在 close 中途取消时清除，避免后续再次触发 _initiate */
  let _openTimer1: ReturnType<typeof setTimeout> | undefined = undefined;
  let _openTimer2: ReturnType<typeof setTimeout> | undefined = undefined;
  /**
   * 动画轮次：每次 open / close 开一轮新的。被打断的旧动画在 destroy 里会同步回调
   * onComplete，若不按轮次作废，就会拿新一轮的状态收尾——例如关闭动画中途重新打开：
   * stopAll 让旧关闭动画按「打开完成」收尾（isOpening 被清掉），后面设置打开起始样式
   * 的分支被跳过，根节点停在关闭留下的 opacity 0，预览看不见却处于打开状态。
   */
  let _generation = 0;

  function _applyStartProps(): void {
    const options = ctx.getOptions();
    const slideView = ctx.slideView;
    const animType = options.showHideAnimationType ?? 'zoom';

    if (animType === 'fade') {
      (options as Record<string, unknown>).showHideOpacity = true;
      _thumbBounds = undefined;
    } else if (animType === 'none') {
      (options as Record<string, unknown>).showHideOpacity = false;
      _duration = 0;
      _thumbBounds = undefined;
    } else if (isOpening) {
      _thumbBounds = ctx.getInitialThumbBounds();
    } else {
      _thumbBounds = ctx.getInitialThumbBounds();
    }

    _placeholder = slideView.getPlaceholderElement() ?? undefined;

    ctx.animations.stopAllPan?.();
    if ('stopAll' in ctx.animations) {
      (ctx.animations as { stopAll(): void }).stopAll();
    }

    _useAnimation = Boolean(_duration && _duration > 50);
    const usePlaceholder =
      !!_thumbBounds &&
      !!_placeholder &&
      slideView.currentSlideUsesPlaceholder() &&
      (!isClosing || !ctx.slideView.isScrollShifted());
    if (!usePlaceholder) {
      _animateRootOpacity = true;
      if (isOpening) {
        slideView.zoomAndPanToInitial();
        slideView.applyCurrentSlideTransform();
      }
    } else {
      _animateRootOpacity = (options.showHideOpacity as boolean) ?? false;
    }
    _animateBgOpacity =
      !_animateRootOpacity && (options.bgOpacity as number) > MIN_OPACITY;
    _opacityElement = _animateRootOpacity ? ctx.rootEl : ctx.bgEl;

    if (!_useAnimation) {
      _duration = 0;
      _animateBgOpacity = false;
      _animateRootOpacity = true;
      if (isOpening) {
        if (ctx.rootEl) ctx.rootEl.style.opacity = String(MIN_OPACITY);
        ctx.applyBgOpacity(1);
      }
      return;
    }

    const innerRect = _thumbBounds?.innerRect;
    if (
      usePlaceholder &&
      _thumbBounds &&
      innerRect &&
      slideView.getCurrentSlideContainer()
    ) {
      _croppedZoom = true;
      _cropContainer1 = ctx.getContainerEl() as HTMLDivElement | undefined;
      _cropContainer2 = slideView.getCurrentSlideContainer();

      const container = ctx.getContainerEl();
      if (container) {
        const vp = ctx.getViewportSize();
        container.style.overflow = 'hidden';
        container.style.width = vp.x + 'px';
      }
    } else {
      _croppedZoom = false;
    }

    if (isOpening) {
      if (_animateRootOpacity) {
        if (ctx.rootEl) ctx.rootEl.style.opacity = String(MIN_OPACITY);
        ctx.applyBgOpacity(1);
      } else {
        if (_animateBgOpacity && ctx.bgEl) {
          ctx.bgEl.style.opacity = String(MIN_OPACITY);
        }
        if (ctx.rootEl) ctx.rootEl.style.opacity = '1';
      }
      if (usePlaceholder && _placeholder) {
        _placeholder.style.willChange = 'transform';
        _placeholder.style.opacity = String(MIN_OPACITY);
      }
    } else if (isClosing) {
      const holders = slideView.getHolderElements();
      if (holders[0]) holders[0].style.display = 'none';
      if (holders[2]) holders[2].style.display = 'none';
      if (_croppedZoom) {
        if (ctx.slideView.isScrollShifted()) {
          ctx.slideView.resetScrollPosition();
          ctx.slideView.resizeScroll();
        }
      }
    }
  }

  function _animateTo(
    target: HTMLElement,
    prop: 'transform' | 'opacity',
    propValue: string
  ): void {
    if (!_duration) {
      if (prop === 'transform') target.style.transform = propValue;
      else target.style.opacity = propValue;
      return;
    }
    const options = ctx.getOptions();
    const generation = _generation;
    const anims = ctx.animations as unknown as {
      activeAnimations: unknown[];
      startTransition(p: { target: HTMLElement; duration?: number; easing?: string; onComplete?: () => void; transform?: string; opacity?: string }): void;
    };
    anims.startTransition({
      target,
      duration: _duration,
      easing: (options.easing as string) ?? 'cubic-bezier(.4,0,.22,1)',
      [prop]: propValue,
      onComplete: () => {
        if (generation !== _generation) return;
        if (!anims.activeAnimations?.length) {
          _onAnimationComplete();
        }
      },
    });
  }

  function _setClosedStateZoomPan(animate?: boolean): void {
    if (!_thumbBounds) return;
    const { innerRect } = _thumbBounds;
    const viewportSize = ctx.getViewportSize();
    const currZoom = _thumbBounds.w / Math.max(1, ctx.slideView.getCurrentSlideWidth());
    const pan: Point = innerRect
      ? { x: innerRect.x, y: innerRect.y }
      : { x: _thumbBounds.x, y: _thumbBounds.y };

    if (
      _croppedZoom &&
      innerRect &&
      _cropContainer1 &&
      _cropContainer2
    ) {
      const containerOnePanX =
        -viewportSize.x + (_thumbBounds.x - innerRect.x) + innerRect.w;
      const containerOnePanY =
        -viewportSize.y + (_thumbBounds.y - innerRect.y) + innerRect.h;
      const containerTwoPanX = viewportSize.x - innerRect.w;
      const containerTwoPanY = viewportSize.y - innerRect.h;
      if (animate) {
        _animateTo(
          _cropContainer1,
          'transform',
          toTransformString(containerOnePanX, containerOnePanY)
        );
        _animateTo(
          _cropContainer2,
          'transform',
          toTransformString(containerTwoPanX, containerTwoPanY)
        );
      } else {
        setTransform(_cropContainer1, containerOnePanX, containerOnePanY);
        setTransform(_cropContainer2, containerTwoPanX, containerTwoPanY);
      }
    }

    ctx.slideView.setCurrentSlideZoomPan(pan, currZoom);
    if (animate) {
      _animateTo(
        ctx.slideView.getCurrentSlideContainer()!,
        'transform',
        ctx.slideView.getCurrentSlideTransform()
      );
    } else {
      ctx.slideView.applyCurrentSlideTransform();
    }
  }

  function _onAnimationComplete(): void {
    const wasOpening = isOpening;
    isOpen = isOpening;
    isClosed = isClosing;
    isOpening = false;
    isClosing = false;

    if (isClosed) {
      ctx.onClosingAnimationEnd();
    } else if (isOpen) {
      if (_croppedZoom) {
        const container = ctx.getContainerEl();
        if (container) {
          container.style.overflow = 'visible';
          container.style.width = '100%';
        }
      }
      ctx.slideView.applyCurrentSlideTransform();
      ctx.onOpeningAnimationEnd();
    }
  }

  function _animateToOpenState(): void {
    if (ctx.slideView.getCurrentSlideContainer()) {
      if (_croppedZoom && _cropContainer1 && _cropContainer2) {
        _animateTo(_cropContainer1, 'transform', 'translate3d(0,0,0)');
        _animateTo(_cropContainer2, 'transform', 'none');
      }
      ctx.slideView.zoomAndPanToInitial();
      _animateTo(
        ctx.slideView.getCurrentSlideContainer()!,
        'transform',
        ctx.slideView.getCurrentSlideTransform()
      );
    }
    const options = ctx.getOptions();
    if (_animateBgOpacity && ctx.bgEl) {
      _animateTo(ctx.bgEl, 'opacity', String(options.bgOpacity ?? 1));
    }
    if (_animateRootOpacity && ctx.rootEl) {
      _animateTo(ctx.rootEl, 'opacity', '1');
    }
  }

  function _animateToClosedState(): void {
    _setClosedStateZoomPan(true);
    if (_animateBgOpacity && ctx.bgOpacity > 0.01 && ctx.bgEl) {
      _animateTo(ctx.bgEl, 'opacity', '0');
    }
    if (_animateRootOpacity && ctx.rootEl) {
      _animateTo(ctx.rootEl, 'opacity', '0');
    }
  }

  function _initiate(): void {
    if (ctx.rootEl) {
      ctx.rootEl.style.setProperty('--pswp-transition-duration', _duration + 'ms');
    }
    if (isOpening) {
      ctx.onOpeningAnimationStart?.();
    }
    if (isOpening && _placeholder) {
      _placeholder.style.opacity = '1';
    }
    if (isOpening) {
      _animateToOpenState();
    } else if (isClosing) {
      _animateToClosedState();
    }
    if (!_useAnimation) {
      _onAnimationComplete();
    }
  }

  function _clearOpenTimers(): void {
    if (_openTimer1 !== undefined) {
      clearTimeout(_openTimer1);
      _openTimer1 = undefined;
    }
    if (_openTimer2 !== undefined) {
      clearTimeout(_openTimer2);
      _openTimer2 = undefined;
    }
  }

  function _start(): void {
    if (
      isOpening &&
      _useAnimation &&
      _placeholder &&
      _placeholder.tagName === 'IMG'
    ) {
      const img = _placeholder as HTMLImageElement;
      const generation = _generation;
      let decoded = false;
      let isDelaying = true;
      decodeImage(img)
        .finally(() => {
          decoded = true;
          // 解码回调不像两个 timer 能被 _clearOpenTimers 清掉，过期轮次只能在这里拦下。
          if (!isDelaying && generation === _generation) _initiate();
        })
        .catch(() => {});
      _openTimer1 = setTimeout(() => {
        _openTimer1 = undefined;
        isDelaying = false;
        if (decoded) _initiate();
      }, 50);
      _openTimer2 = setTimeout(() => {
        _openTimer2 = undefined;
        _initiate();
      }, 250);
    } else {
      _initiate();
    }
  }

  function _prepareOpen(): void {
    if (!isOpening) {
      _generation++;
      isOpening = true;
      isClosing = false;
      const options = ctx.getOptions();
      _duration =
        options.showAnimationDuration !== undefined
          ? (options.showAnimationDuration as number)
          : 333;
      const maxW = (options.maxWidthToAnimate as number) ?? 4000;
      const slideW = ctx.slideView.getCurrentSlideWidth();
      const initialZoom = ctx.slideView.getCurrentSlideInitialZoom();
      if (slideW * initialZoom >= maxW) _duration = 0;
      _applyStartProps();
    }
  }

  function open(): void {
    _prepareOpen();
    _start();
  }

  function close(): void {
    if (isClosing) return;

    // 尚未执行过 open() 就收到关闭（例如 nextTick(runInit) 前按返回）：直接收尾，避免僵尸挂载
    if (isClosed) {
      ctx.onClosingAnimationEnd?.();
      return;
    }

    const options = ctx.getOptions();
    const slideW = ctx.slideView.getCurrentSlideWidth();
    const maxW = (options.maxWidthToAnimate as number) ?? 4000;
    const initialZoom = ctx.slideView.getCurrentSlideInitialZoom();

    const wasOpening = isOpening;
    _generation++;
    isOpen = false;
    isOpening = false;
    isClosing = true;
    _duration =
      options.hideAnimationDuration !== undefined
        ? (options.hideAnimationDuration as number)
        : 333;
    if (slideW * initialZoom >= maxW) _duration = 0;

    if (wasOpening) {
      _clearOpenTimers();
      ctx.animations.stopAllPan?.();
      if ('stopAll' in ctx.animations) {
        (ctx.animations as { stopAll(): void }).stopAll();
      }
      // 打开动画中途关闭：不做关闭动画，直接收尾，保证能走到 onClosingAnimationEnd
      _duration = 0;
      _useAnimation = false;
    }

    _applyStartProps();
    const generation = _generation;
    setTimeout(() => {
      if (generation === _generation) _start();
    }, _croppedZoom ? 30 : 0);
  }

  return {
    get isOpen() {
      return isOpen;
    },
    get isOpening() {
      return isOpening;
    },
    get isClosing() {
      return isClosing;
    },
    get isClosed() {
      return isClosed;
    },
    open,
    close,
  };
}
