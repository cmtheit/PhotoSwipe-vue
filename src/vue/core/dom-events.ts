/**
 * DOM 事件绑定池（独立实现，不依赖 src/js）
 */

let supportsPassive = false;
try {
  window.addEventListener(
    'test',
    null,
    Object.defineProperty({}, 'passive', { get: () => { supportsPassive = true; return true; } })
  );
} catch {
  // ignore
}

type Target = HTMLElement | Window | Document | undefined | null;
type Listener = EventListenerOrEventListenerObject;

interface PoolItem {
  target: Target;
  type: string;
  listener: Listener;
  passive?: boolean;
}

export class DOMEvents {
  private _pool: PoolItem[] = [];

  add(target: Target, type: string, listener: Listener, passive?: boolean): void {
    this._toggle(target, type, listener, passive, false);
  }

  remove(target: Target, type: string, listener: Listener, passive?: boolean): void {
    this._toggle(target, type, listener, passive, true);
  }

  removeAll(): void {
    this._pool.forEach((item) => {
      this._toggle(item.target, item.type, item.listener, item.passive, true, true);
    });
    this._pool = [];
  }

  private _toggle(
    target: Target,
    type: string,
    listener: Listener,
    passive?: boolean,
    unbind?: boolean,
    skipPool?: boolean
  ): void {
    if (!target) return;
    const method = unbind ? 'removeEventListener' : 'addEventListener';
    const types = type.split(' ');
    for (const t of types) {
      if (!t) continue;
      if (!skipPool) {
        if (unbind) {
          this._pool = this._pool.filter(
            (p) => !(p.type === t && p.listener === listener && p.target === target)
          );
        } else {
          this._pool.push({ target, type: t, listener, passive });
        }
      }
      const options = supportsPassive ? { passive: passive ?? false } : false;
      (target as EventTarget)[method](t, listener, options);
    }
  }
}
