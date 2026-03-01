/**
 * Vue v2 类型定义（§1 接口 + 内部用类型）
 * 无 Vue 依赖，纯 TypeScript。
 */

// ─── §1.1 数据类型 ───

export interface Point {
  x: number;
  y: number;
  id?: string | number;
}

export type Axis = 'x' | 'y';

/** 幻灯片数据。只支持直接传入数据，不支持从 DOM 画廊解析。 */
export interface SlideData {
  src?: string;
  srcset?: string;
  width?: number;
  height?: number;
  /** @deprecated 使用 width */
  w?: number;
  /** @deprecated 使用 height */
  h?: number;
  alt?: string;
  thumbCropped?: boolean;
  html?: string;
  type?: 'image' | 'html' | string;
  /** 缩略图元素，仅用于打开/关闭过渡动画的位置计算 */
  element?: HTMLElement;
  [key: string]: any;
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  innerRect?: { w: number; h: number; x: number; y: number };
}

export interface ZoomLevels {
  fit: number;
  fill: number;
  vFill: number;
  initial: number;
  secondary: number;
  max: number;
  min: number;
  elementSize?: Point | null;
  panAreaSize?: Point | null;
}

export interface ZoomState {
  zoomedIn: boolean;
  zoomAllowed: boolean;
  clickToZoom: boolean;
}

// ─── §1.2 PswpSlideView ───

export interface SlideViewProps {
  items: SlideData[];
  currentIndex: number;
  loop?: boolean;
  spacing?: number;
  allowPanToNext?: boolean;
  pinchToClose?: boolean;
  closeOnVerticalDrag?: boolean;
  clickToCloseNonZoomable?: boolean;
  easing?: string;
  zoomAnimationDuration?: number | false;
  preload?: [number, number];
  opened?: boolean;
}

export interface SlideViewEmits {
  'update:currentIndex': [index: number];
  requestClose: [];
  toggleUI: [];
  zoomStateChange: [state: ZoomState];
  bgOpacityChange: [opacity: number];
  slideComplete: [];
}

export interface SlideViewExpose {
  getCurrentSlideContainer(): HTMLDivElement | null;
  getCurrentSlideTransform(): string;
  getCurrentSlideData(): SlideData | null;
  setCurrentSlideZoomPan(pan: Point, zoom: number): void;
  zoomAndPanToInitial(): void;
  applyCurrentSlideTransform(): void;
  getPlaceholderElement(): HTMLElement | null | undefined;
  currentSlideUsesPlaceholder(): boolean;
  getCurrentSlideWidth(): number;
  getCurrentSlideInitialZoom(): number;
  handleResize(): void;
  toggleZoom(centerPoint?: Point): void;
  goTo(index: number): void;
  getContainerElement(): HTMLElement | null;
  getHolderElements(): HTMLDivElement[];
  isScrollShifted(): boolean;
  resetScrollPosition(): void;
  resizeScroll(): void;
  appendHeavy(): void;
  setOpenerOpen(value: boolean): void;
}

// ─── §1.3 PswpUI ───

export interface UIProps {
  currentIndex: number;
  totalItems: number;
  isSliding?: boolean;
  showClose?: boolean;
  showCounter?: boolean;
  indexIndicatorSep?: string;
  closeTitle?: string;
}

export interface UIEmits {
  close: [];
}

// ─── §1.4 PhotoSwipe.vue ───

export interface PhotoSwipeProps {
  dataSource?: SlideData[];
  index?: number;
  open?: boolean;
  loop?: boolean;
  allowPanToNext?: boolean;
  pinchToClose?: boolean;
  closeOnVerticalDrag?: boolean;
  clickToCloseNonZoomable?: boolean;
  spacing?: number;
  easing?: string;
  zoomAnimationDuration?: number | false;
  preload?: [number, number];
  bgOpacity?: number;
  showAnimationDuration?: number | false;
  hideAnimationDuration?: number | false;
  showClose?: boolean;
  showCounter?: boolean;
  indexIndicatorSep?: string;
  closeTitle?: string;
  appendTo?: string | HTMLElement;
}

export interface PhotoSwipeEmits {
  'update:open': [value: boolean];
  'update:index': [value: number];
  beforeOpen: [];
  afterInit: [];
  change: [payload: { index: number }];
  close: [];
  destroy: [];
}

export interface PhotoSwipeExpose {
  open(index?: number): void;
}

// ─── 内部用（Slide / Content / Eventable）────

export interface ItemHolder {
  el: HTMLDivElement | null;
  slot?: HolderSlot;
  slotIndex?: number;
  slide?: SlideInstance;
}

/** 每个 holder 对应的响应式渲染状态 */
export interface HolderSlot {
  visible: boolean;
  ariaHidden: boolean;
  hasSlide: boolean;
  transformStyle: string;
  contentType: 'image' | 'html' | string;
  contentAttached: boolean;
  imgSrc: string;
  imgSrcset: string;
  imgAlt: string;
  imgSizes: string;
  contentWidth: number;
  contentHeight: number;
  htmlContent: string;
  isError: boolean;
  errorHtml: string;
}

/** Content 实例最小接口（slide/content 用） */
export interface ContentInstance {
  append(): void;
  setDisplayedSize(width: number, height: number): void;
  updateData?(data: SlideData, index?: number): void;
  load?(isLazy?: boolean, reload?: boolean): void;
  destroy?: () => void;
  width?: number;
  height?: number;
  [key: string]: any;
}

/** Slide 实例最小接口（mainScroll / gestures 用） */
export interface SlideInstance {
  data: SlideData;
  index: number;
  holder: ItemHolder;
  content?: ContentInstance;
  zoomLevels?: ZoomLevels;
  /** 当前平移位置 (x, y) */
  pan?: Point;
  /** Pan 边界状态（pan-calc 返回 / Slide 持有） */
  bounds?: PanBoundsState;
  setIsActive?(value: boolean): void;
  updateData?(data: SlideData, index?: number): void;
  [key: string]: any;
}

/** Pan 边界状态（pan-calc 返回 / Slide 持有） */
export interface PanBoundsState {
  center: Point;
  max: Point;
  min: Point;
  currZoomLevel: number;
  correctPan(axis: Axis, panOffset: number): number;
}

/** Eventable.dispatch 返回值 */
export interface DispatchResult {
  defaultPrevented?: boolean;
  [key: string]: any;
}

// ─── Step 2：Content / Slide 的 host 最小接口 ───

/** Content 构造函数接收的 host 最小接口 */
export interface ContentHost {
  options: Record<string, any>;
  dispatch(name: string, details?: any): DispatchResult;
  applyFilters(name: string, value: any, ...args: any[]): any;
  createContentFromData?(data: SlideData, index: number): ContentInstance;
}

/** Slide 构造函数接收的 host 最小接口 */
export interface SlideHost {
  options: Record<string, any>;
  viewportSize: Point;
  offset: Point;
  dispatch(name: string, details?: any): DispatchResult;
  applyFilters(name: string, value: any, ...args: any[]): any;
  contentLoader: { getContentBySlide(slide: SlideInstance): ContentInstance };
  animations: AnimationsLike;
  mainScroll: { isShifted(): boolean };
  getViewportCenterPoint(): Point;
  opener?: { isOpen: boolean };
  currSlide: SlideInstance | null;
}

/** Animations 最小接口（Slide 仅需 startTransition、stopAllPan） */
export interface AnimationsLike {
  startTransition(options: TransitionOptions): void;
  stopAllPan(): void;
}

export interface TransitionOptions {
  isPan?: boolean;
  name?: string;
  target: HTMLElement;
  transform: string;
  onPropertyUpdate?: (value: string) => void;
  onComplete?: () => void;
  duration: number;
  easing?: string;
}

// ─── Step 3：ContentLoader / MainScroll API（composables 暴露）────

export interface ContentLoaderAPI {
  updateLazy(diff?: number): void;
  getContentBySlide(slide: SlideInstance): ContentInstance;
  getContentByIndex(index: number): ContentInstance | undefined;
  addToCache(content: ContentInstance): void;
  removeByIndex(index: number): void;
  loadSlideByIndex(initialIndex: number): void;
  destroy(): void;
}

export interface MainScrollAPI {
  resize(resizeSlides?: boolean): void;
  resetPosition(): void;
  moveTo(x: number, dragging?: boolean): void;
  moveIndexBy(diff: number, animate?: boolean, velocityX?: number, onSlideComplete?: () => void): boolean;
  getCurrSlideX(): number;
  getX(): number;
  isShifted(): boolean;
  updateCurrItem(): void;
  setItemHolders(holders: ItemHolder[]): void;
}

// ─── Step 4：useOpener ───

/** useOpener 所需的上下文，不依赖 PswpCore */
export interface OpenerCtx {
  rootEl: HTMLElement | null;
  bgEl: HTMLElement | null;
  getContainerEl(): HTMLElement | null;
  getOptions(): Record<string, any>;
  getViewportSize(): Point;
  getInitialItemData(): SlideData | null;
  getInitialThumbBounds(): Bounds | undefined;
  slideView: {
    getCurrentSlideContainer(): HTMLDivElement | null;
    getCurrentSlideTransform(): string;
    setCurrentSlideZoomPan(pan: Point, zoom: number): void;
    zoomAndPanToInitial(): void;
    applyCurrentSlideTransform(): void;
    getPlaceholderElement(): HTMLElement | null | undefined;
    currentSlideUsesPlaceholder(): boolean;
    getCurrentSlideWidth(): number;
    getCurrentSlideInitialZoom(): number;
    isScrollShifted(): boolean;
    resetScrollPosition(): void;
    resizeScroll(): void;
    getHolderElements(): HTMLDivElement[];
  };
  animations: AnimationsLike;
  bgOpacity: number;
  applyBgOpacity(opacity: number): void;
  onOpeningAnimationStart?(): void;
  onOpeningAnimationEnd(): void;
  onClosingAnimationEnd(): void;
}

export interface OpenerAPI {
  isOpen: boolean;
  isOpening: boolean;
  isClosing: boolean;
  isClosed: boolean;
  open(): void;
  close(): void;
}
