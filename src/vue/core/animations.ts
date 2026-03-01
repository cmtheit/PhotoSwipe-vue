/**
 * 弹簧缓动、弹簧动画、CSS 过渡、动画管理器（合并单文件，不依赖 src/js）
 */

import { setTransitionStyle, removeTransitionStyle } from '../utils/dom';

const DEFAULT_EASING = 'cubic-bezier(.4,0,.22,1)';
const DEFAULT_NATURAL_FREQUENCY = 12;
const DEFAULT_DAMPING_RATIO = 0.75;

// ─── SpringEaser ───

export class SpringEaser {
  velocity: number;
  private _dampingRatio: number;
  private _naturalFrequency: number;
  private _dampedFrequency: number;

  constructor(
    initialVelocity: number,
    dampingRatio = DEFAULT_DAMPING_RATIO,
    naturalFrequency = DEFAULT_NATURAL_FREQUENCY
  ) {
    this.velocity = initialVelocity * 1000;
    this._dampingRatio = dampingRatio;
    this._naturalFrequency = naturalFrequency;
    this._dampedFrequency = naturalFrequency;
    if (this._dampingRatio < 1) {
      this._dampedFrequency *= Math.sqrt(1 - this._dampingRatio * this._dampingRatio);
    }
  }

  easeFrame(deltaPosition: number, deltaTime: number): number {
    let displacement = 0;
    let coeff: number;
    deltaTime /= 1000;
    const naturalDumpingPow = Math.E ** (-this._dampingRatio * this._naturalFrequency * deltaTime);

    if (this._dampingRatio === 1) {
      coeff = this.velocity + this._naturalFrequency * deltaPosition;
      displacement = (deltaPosition + coeff * deltaTime) * naturalDumpingPow;
      this.velocity = displacement * -this._naturalFrequency + coeff * naturalDumpingPow;
    } else if (this._dampingRatio < 1) {
      coeff =
        (1 / this._dampedFrequency) *
        (this._dampingRatio * this._naturalFrequency * deltaPosition + this.velocity);
      const dumpedFCos = Math.cos(this._dampedFrequency * deltaTime);
      const dumpedFSin = Math.sin(this._dampedFrequency * deltaTime);
      displacement = naturalDumpingPow * (deltaPosition * dumpedFCos + coeff * dumpedFSin);
      this.velocity =
        displacement * -this._naturalFrequency * this._dampingRatio +
        naturalDumpingPow *
          (-this._dampedFrequency * deltaPosition * dumpedFSin +
            this._dampedFrequency * coeff * dumpedFCos);
    }
    return displacement;
  }
}

// ─── SharedAnimationProps ───

export interface SharedAnimationProps {
  name?: string;
  isPan?: boolean;
  isMainScroll?: boolean;
  onComplete?: () => void;
  onFinish?: () => void;
}

// ─── SpringAnimation ───

export interface SpringAnimationProps extends SharedAnimationProps {
  start: number;
  end: number;
  velocity: number;
  dampingRatio?: number;
  naturalFrequency?: number;
  onUpdate: (end: number) => void;
}

export class SpringAnimation {
  props: SpringAnimationProps;
  onFinish!: () => void;
  private _raf = 0;

  constructor(props: SpringAnimationProps) {
    this.props = props;
    const { start, end, velocity, onUpdate, onComplete, onFinish = () => {}, dampingRatio, naturalFrequency } = props;
    this.onFinish = onFinish;
    const easer = new SpringEaser(velocity, dampingRatio, naturalFrequency);
    let prevTime = Date.now();
    let deltaPosition = start - end;

    const loop = () => {
      if (this._raf === 0) return;
      deltaPosition = easer.easeFrame(deltaPosition, Date.now() - prevTime);
      if (Math.abs(deltaPosition) < 1 && Math.abs(easer.velocity) < 50) {
        onUpdate(end);
        onComplete?.();
        this.onFinish();
      } else {
        prevTime = Date.now();
        onUpdate(deltaPosition + end);
        this._raf = requestAnimationFrame(loop);
      }
    };
    this._raf = requestAnimationFrame(loop);
  }

  destroy(): void {
    if (this._raf !== 0) {
      cancelAnimationFrame(this._raf);
    }
    this._raf = 0;
  }
}

// ─── CSSAnimation ───

export interface CssAnimationProps extends SharedAnimationProps {
  target: HTMLElement;
  duration?: number;
  easing?: string;
  transform?: string;
  opacity?: string;
  onPropertyUpdate?: (value: string) => void;
}

export class CSSAnimation {
  props: CssAnimationProps;
  onFinish!: () => void;
  private _target: HTMLElement;
  private _onComplete?: () => void;
  private _finished = false;
  private _helperTimeout: ReturnType<typeof setTimeout> | undefined;
  private _onTransitionEnd = (e: TransitionEvent): void => {
    if (e.target === this._target) this._finalize();
  };

  constructor(props: CssAnimationProps) {
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
    const prop = transform !== undefined ? 'transform' : 'opacity';
    const propValue = prop === 'transform' ? (props.transform ?? '') : (props.opacity ?? '');

    this._helperTimeout = setTimeout(() => {
      setTransitionStyle(this._target, prop, duration, easing);
      this._helperTimeout = setTimeout(() => {
        this._target.addEventListener('transitionend', this._onTransitionEnd as EventListener, false);
        this._target.addEventListener('transitioncancel', this._onTransitionEnd as EventListener, false);
        this._helperTimeout = setTimeout(() => this._finalize(), duration + 500);
        if (onPropertyUpdate) {
          onPropertyUpdate(propValue);
        } else {
          if (prop === 'transform') {
            this._target.style.transform = propValue;
          } else {
            this._target.style.opacity = propValue;
          }
        }
      }, 30);
    }, 0);
  }

  private _finalize(): void {
    if (this._finished) return;
    this._finished = true;
    this.onFinish();
    this._onComplete?.();
  }

  destroy(): void {
    if (this._helperTimeout !== undefined) {
      clearTimeout(this._helperTimeout);
    }
    removeTransitionStyle(this._target);
    this._target.removeEventListener('transitionend', this._onTransitionEnd as EventListener, false);
    this._target.removeEventListener('transitioncancel', this._onTransitionEnd as EventListener, false);
    if (!this._finished) this._finalize();
  }
}

// ─── Animations ───

export type Animation = SpringAnimation | CSSAnimation;
export type AnimationProps = SpringAnimationProps | CssAnimationProps;

export class Animations {
  activeAnimations: Animation[] = [];

  startSpring(props: SpringAnimationProps): SpringAnimation {
    return this._start(props, true) as SpringAnimation;
  }

  startTransition(props: CssAnimationProps): CSSAnimation {
    return this._start(props, false) as CSSAnimation;
  }

  private _start(props: AnimationProps, isSpring: boolean): Animation {
    const animation = isSpring
      ? new SpringAnimation(props as SpringAnimationProps)
      : new CSSAnimation(props as CssAnimationProps);
    this.activeAnimations.push(animation);
    animation.onFinish = () => this.stop(animation);
    return animation;
  }

  stop(animation: Animation): void {
    animation.destroy();
    const i = this.activeAnimations.indexOf(animation);
    if (i > -1) this.activeAnimations.splice(i, 1);
  }

  stopAll(): void {
    this.activeAnimations.forEach((a) => a.destroy());
    this.activeAnimations = [];
  }

  stopAllPan(): void {
    this.activeAnimations = this.activeAnimations.filter((a) => {
      if (a.props.isPan) {
        a.destroy();
        return false;
      }
      return true;
    });
  }

  stopMainScroll(): void {
    this.activeAnimations = this.activeAnimations.filter((a) => {
      if (a.props.isMainScroll) {
        a.destroy();
        return false;
      }
      return true;
    });
  }

  isPanRunning(): boolean {
    return this.activeAnimations.some((a) => a.props.isPan);
  }
}
