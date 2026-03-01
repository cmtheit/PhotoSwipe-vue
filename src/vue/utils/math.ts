/**
 * 数学/点运算工具（纯函数）
 * 不依赖 src/js，无 Vue。
 */

import type { Point } from '../types';

export function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

export function equalizePoints(p1: Point, p2: Point): Point {
  p1.x = p2.x;
  p1.y = p2.y;
  if (p2.id !== undefined) {
    p1.id = p2.id;
  }
  return p1;
}

export function pointsEqual(p1: Point, p2: Point): boolean {
  return p1.x === p2.x && p1.y === p2.y;
}

export function getDistanceBetween(p1: Point, p2: Point): number {
  const x = Math.abs(p1.x - p2.x);
  const y = Math.abs(p1.y - p2.y);
  return Math.sqrt(x * x + y * y);
}

export function roundPoint(p: Point): void {
  p.x = Math.round(p.x);
  p.y = Math.round(p.y);
}
