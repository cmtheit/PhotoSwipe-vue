/**
 * DOM 工具函数
 * 不依赖 src/js，无 Vue。
 */

export function createElement<T extends keyof HTMLElementTagNameMap>(
  className: string,
  tagName: T,
  appendToEl?: Node
): HTMLElementTagNameMap[T] {
  const el = document.createElement(tagName);
  if (className) {
    el.className = className;
  }
  if (appendToEl) {
    appendToEl.appendChild(el);
  }
  return el;
}

export function toTransformString(x: number, y?: number, scale?: number): string {
  let propValue = `translate3d(${x}px,${y ?? 0}px,0)`;
  if (scale !== undefined) {
    propValue += ` scale3d(${scale},${scale},1)`;
  }
  return propValue;
}

export function setTransform(el: HTMLElement, x: number, y?: number, scale?: number): void {
  el.style.transform = toTransformString(x, y, scale);
}

const defaultCSSEasing = 'cubic-bezier(.4,0,.22,1)';

export function setTransitionStyle(
  el: HTMLElement,
  prop?: string,
  duration?: number,
  ease?: string
): void {
  el.style.transition = prop
    ? `${prop} ${duration}ms ${ease || defaultCSSEasing}`
    : 'none';
}

export function removeTransitionStyle(el: HTMLElement): void {
  setTransitionStyle(el);
}

export function setWidthHeight(el: HTMLElement, w: string | number, h: string | number): void {
  el.style.width = typeof w === 'number' ? `${w}px` : w;
  el.style.height = typeof h === 'number' ? `${h}px` : h;
}

export function decodeImage(img: HTMLImageElement): Promise<HTMLImageElement | void> {
  if ('decode' in img) {
    return img.decode().catch(() => {});
  }
  if (img.complete) {
    return Promise.resolve(img);
  }
  return new Promise((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = reject;
  });
}

export const LOAD_STATE = {
  IDLE: 'idle',
  LOADING: 'loading',
  LOADED: 'loaded',
  ERROR: 'error',
} as const;

export type LoadState = (typeof LOAD_STATE)[keyof typeof LOAD_STATE];

export function isSafari(): boolean {
  return !!(navigator.vendor && navigator.vendor.match(/apple/i));
}
