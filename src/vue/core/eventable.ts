/**
 * 可派发事件与过滤器的基类（独立实现，不依赖 src/js）
 */

import type { DispatchResult } from '../types';

type Listener = (event: DispatchResult & { type: string }) => void;
type FilterFn = (...args: any[]) => any;

interface FilterEntry {
  fn: FilterFn;
  priority: number;
}

export class Eventable {
  protected _listeners: Record<string, Listener[]> = {};
  protected _filters: Record<string, FilterEntry[]> = {};

  on(name: string, fn: Listener): void {
    if (!this._listeners[name]) this._listeners[name] = [];
    this._listeners[name].push(fn);
  }

  off(name: string, fn: Listener): void {
    if (!this._listeners[name]) return;
    this._listeners[name] = this._listeners[name].filter((l) => l !== fn);
  }

  dispatch(name: string, details?: Record<string, any>): DispatchResult {
    const event: DispatchResult & { type: string; preventDefault: () => void } = {
      type: name,
      defaultPrevented: false,
      ...details,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };
    this._listeners[name]?.slice().forEach((listener) => {
      listener.call(this, event);
    });
    return event;
  }

  addFilter(name: string, fn: FilterFn, priority = 100): void {
    if (!this._filters[name]) this._filters[name] = [];
    this._filters[name].push({ fn, priority });
    this._filters[name].sort((a, b) => a.priority - b.priority);
  }

  removeFilter(name: string, fn: FilterFn): void {
    if (!this._filters[name]) return;
    this._filters[name] = this._filters[name].filter((e) => e.fn !== fn);
  }

  applyFilters<T>(name: string, value: T, ...args: any[]): T {
    let current: any = value;
    this._filters[name]?.forEach((entry) => {
      current = entry.fn.call(this, current, ...args);
    });
    return current as T;
  }
}
