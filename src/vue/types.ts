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
  onVerticalDrag?: (payload: { panY: number; preventDefault: () => void }) => void;
}

export interface SlideViewEmits {
  'update:currentIndex': [index: number];
  requestClose: [source?: string];
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
  /** 幻灯片数据源，默认 [] */
  dataSource?: SlideData[];
  /** 当前显示的幻灯片索引（从 0 开始），支持 v-model:index，默认 0 */
  index?: number;
  /** 是否打开预览，支持 v-model:open，默认 false */
  open?: boolean;
  /** 是否循环滑动，默认 true */
  loop?: boolean;
  /** 是否允许滑动到下一张/上一张，默认 true */
  allowPanToNext?: boolean;
  /** 是否支持双指捏合关闭，默认 true */
  pinchToClose?: boolean;
  /** 是否支持垂直拖动关闭，默认 true */
  closeOnVerticalDrag?: boolean;
  /** 未放大时点击是否关闭，默认 true */
  clickToCloseNonZoomable?: boolean;
  /** 幻灯片之间的间距比例（0–1），默认 0.1 */
  spacing?: number;
  /** 过渡缓动函数，默认 'cubic-bezier(.4,0,.22,1)' */
  easing?: string;
  /** 缩放动画时长（ms），false 关闭动画，默认 333 */
  zoomAnimationDuration?: number | false;
  /** 预加载前后张数 [前, 后]，默认 [1, 2] */
  preload?: [number, number];
  /** 背景遮罩不透明度（0–1），默认 0.8 */
  bgOpacity?: number;
  /** 打开动画时长（ms），默认 333 */
  showAnimationDuration?: number | false;
  /** 关闭动画时长（ms），默认 333 */
  hideAnimationDuration?: number | false;
  /** 是否显示关闭按钮，默认 true */
  showClose?: boolean;
  /** 是否显示计数（如 1/5），默认 true */
  showCounter?: boolean;
  /** 计数分隔符，默认 ' / ' */
  indexIndicatorSep?: string;
  /** 关闭按钮的 title 与 aria-label */
  closeTitle?: string;
  /** 是否在打开时先展示控件栏；为 false 时需点击图片切换出控件，默认 false */
  showUiAtFirst?: boolean;
  /** 是否用 history（pushState + popstate）实现返回键/浏览器后退关闭，默认 false */
  closeOnBack?: boolean;
  /** 挂载目标：CSS 选择器字符串或 HTMLElement，默认 'body' */
  appendTo?: string | HTMLElement;
  /** 根节点 z-index，未传时使用 CSS 变量 --pswp-root-z-index（默认 100000） */
  zIndex?: number;
  /** 垂直拖动时回调，可调用 preventDefault 阻止默认关闭 */
  onVerticalDrag?: (payload: { panY: number; preventDefault: () => void }) => void;
  /** 关闭前钩子，返回 false 可阻止关闭 */
  onBeforeClose?: (source?: string) => boolean | void;
}

export interface PhotoSwipeEmits {
  /** v-model:open 更新 */
  'update:open': [value: boolean];
  /** v-model:index 更新 */
  'update:index': [value: number];
  /** 打开前触发（open 变为 true 时） */
  beforeOpen: [];
  /** 初始化与打开动画就绪后触发 */
  afterInit: [];
  /** 当前索引变化时触发 */
  change: [payload: { index: number }];
  /** 关闭时触发 */
  close: [];
  /** 关闭动画结束、组件即将卸载时触发 */
  destroy: [];
  /** 垂直拖动时触发（如下拉关闭） */
  verticalDrag: [payload: { panY: number }];
  /** 控件栏显示/隐藏切换时触发（如点击图片切换顶部栏），便于安卓单图时联动显示 ActionSheet */
  uiVisibleChange: [payload: { visible: boolean }];
}

export interface PhotoSwipeExpose {
  /** 打开预览，可传索引跳转到指定张 */
  open(index?: number): void;
  /** 切换控件栏显示/隐藏 */
  toggleUI(): void;
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
