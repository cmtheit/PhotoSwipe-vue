/**
 * CSS 过渡动画（vue 纯 TypeScript，从 src/js/util/css-animation.js 翻译）
 */

import { setTransitionStyle, removeTransitionStyle } from '../utils/dom';

const DEFAULT_EASING = 'cubic-bezier(.4,0,.22,1)';

export interface CSSAnimationProps {
  name?: string;
  isPan?: boolean;
  isMainScroll?: boolean;
  target: HTMLElement;
  duration?: number;
  easing?: string;
  transform?: string;
  opacity?: string;
  onPropertyUpdate?: (value: string) => void;
  onComplete?: () => void;
  onFinish?: () => void;
}

export class CSSAnimation {
  props: CSSAnimationProps;
  onFinish: () => void;
  private _target: HTMLElement;
  private _onComplete?: () => void;
  private _finished = false;
  private _helperTimeout: ReturnType<typeof setTimeout> | undefined;

  constructor(props: CSSAnimationProps) {
    this.props = props;
    const {
      target,
      onComplete,
      transform,
      onFinish = () => {},
      duration = 333,
      easing = DEFAULT_EASING,
      onPropertyUpdate,
    } = props;
    this.onFinish = onFinish;
    this._target = target;
    this._onComplete = onComplete;

    const prop = transform ? 'transform' : 'opacity';
    const propValue = (props as any)[prop] ?? '';

    this._helperTimeout = setTimeout(() => {
      setTransitionStyle(target, prop, duration, easing);
      this._helperTimeout = setTimeout(() => {
        target.addEventListener('transitionend', this._onTransitionEnd, false);
        target.addEventListener('transitioncancel', this._onTransitionEnd, false);
        this._helperTimeout = setTimeout(() => {
          this._finalizeAnimation();
        }, duration + 500);
        if (onPropertyUpdate) {
          onPropertyUpdate(propValue);
        } else {
          (target.style as any)[prop] = propValue;
        }
      }, 30);
    }, 0);
  }

  private _onTransitionEnd = (e: TransitionEvent): void => {
    if (e.target === this._target) {
      this._finalizeAnimation();
    }
  };

  private _finalizeAnimation(): void {
    if (!this._finished) {
      this._finished = true;
      this.onFinish();
      this._onComplete?.();
    }
  }

  destroy(): void {
    if (this._helperTimeout !== undefined) {
      clearTimeout(this._helperTimeout);
    }
    removeTransitionStyle(this._target);
    this._target.removeEventListener('transitionend', this._onTransitionEnd, false);
    this._target.removeEventListener('transitioncancel', this._onTransitionEnd, false);
    if (!this._finished) {
      this._finalizeAnimation();
    }
  }
}
