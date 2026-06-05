/**
 * Content：单张幻灯片内容（图片加载、error、append、setDisplayedSize）
 * 算法参考 src/js/slide/content.js，不导入 src/js。
 */

import type {
  ContentHost,
  ContentInstance,
  DispatchResult,
  HolderSlot,
  SlideData,
  SlideInstance,
} from '../types';
import { isSafari, LOAD_STATE } from '../utils/dom';
import type { LoadState } from '../utils/dom';

export class Content implements ContentInstance {
  data: SlideData;
  index: number;
  element: HTMLImageElement | HTMLVideoElement | HTMLDivElement | undefined;
  slide: SlideInstance | undefined;

  displayedImageWidth = 0;
  displayedImageHeight = 0;
  width: number;
  height: number;

  isAttached = false;
  hasSlide = false;
  isDecoding = false;
  state: LoadState = LOAD_STATE.IDLE;
  type: 'image' | 'html' | string;
  private _largestUsedSize = 0;

  private _host: ContentHost;

  constructor(itemData: SlideData, host: ContentHost, index: number) {
    this._host = host;
    this.data = itemData;
    this.index = index;

    this.width = Number(this.data.w) || Number(this.data.width) || 0;
    this.height = Number(this.data.h) || Number(this.data.height) || 0;

    if (this.data.type) {
      this.type = this.data.type;
    } else if (this.data.src) {
      this.type = 'image';
    } else {
      this.type = 'html';
    }

    host.dispatch('contentInit', { content: this });
  }

  setSlide(slide: SlideInstance): void {
    this.slide = slide;
    this.hasSlide = true;
    this._host = (slide as unknown as { host: ContentHost }).host;
  }

  updateData(newData: SlideData, newIndex?: number): void {
    const prevType = this.type;
    const prevSrc = this.data.src;
    const prevSrcset = this.data.srcset;
    const prevHtml = this.data.html;
    const prevPoster = this.data.poster;
    const prevMime = this.data.mime;

    this.data = newData;
    if (typeof newIndex === 'number') {
      this.index = newIndex;
    }
    this.width = Number(this.data.w) || Number(this.data.width) || 0;
    this.height = Number(this.data.h) || Number(this.data.height) || 0;

    if (this.data.type) {
      this.type = this.data.type;
    } else if (this.data.src) {
      this.type = 'image';
    } else {
      this.type = 'html';
    }

    const slot = this._getSlot();
    if (!slot) {
      return;
    }

    slot.contentType = this.type;
    if (this.isImageContent()) {
      slot.imgSrc = this.data.src ?? '';
      slot.imgSrcset = this.data.srcset ?? '';
      slot.imgAlt = this.data.alt ?? '';
    } else if (this.isVideoContent()) {
      this.syncVideoSlot(slot);
    } else {
      slot.htmlContent = this.data.html ?? '';
    }

    const contentChanged =
      prevType !== this.type ||
      prevSrc !== this.data.src ||
      prevSrcset !== this.data.srcset ||
      prevHtml !== this.data.html ||
      prevPoster !== this.data.poster ||
      prevMime !== this.data.mime;

    if (contentChanged) {
      this.state = LOAD_STATE.IDLE;
      this.element = undefined;
      this.load(false, true);
    } else if (this.slide) {
      (this.slide as unknown as { updateContentSize(force?: boolean): void }).updateContentSize(true);
    }
  }

  load(isLazy: boolean, reload?: boolean): void {
    if (this.element && !reload && this.state !== LOAD_STATE.ERROR) return;

    if ((this._host.dispatch('contentLoad', { content: this, isLazy }) as DispatchResult).defaultPrevented) {
      return;
    }

    const slot = this._getSlot();
    if (slot) {
      slot.isError = false;
      slot.errorHtml = '';
      if (!reload) {
        slot.contentAttached = false;
      }
    }

    if (this.isImageContent()) {
      if (slot) {
        slot.contentType = 'image';
      }
      this.element = this._getImageElement() ?? undefined;
      if (this.displayedImageWidth) {
        this.loadImage(isLazy);
      }
    } else if (this.isVideoContent()) {
      if (slot) {
        slot.contentType = 'video';
        this.syncVideoSlot(slot);
      }
      this.element = this._getVideoElement() ?? undefined;
      this.state = LOAD_STATE.LOADED;
    } else {
      if (slot) {
        slot.contentType = 'html';
        slot.htmlContent = this.data.html ?? '';
      }
      this.element = this._getHtmlElement() ?? undefined;
    }

    if (reload && this.slide) {
      (this.slide as unknown as { updateContentSize(force?: boolean): void }).updateContentSize(true);
    }
  }

  loadImage(isLazy: boolean): void {
    if (
      !this.isImageContent() ||
      (this._host.dispatch('contentLoadImage', { content: this, isLazy }) as DispatchResult).defaultPrevented
    ) {
      return;
    }

    const imageElement = this._getImageElement();
    this.element = imageElement ?? undefined;
    this.updateSrcsetSizes();

    const slot = this._getSlot();
    if (slot) {
      slot.contentType = 'image';
      slot.imgSrcset = this.data.srcset ?? '';
      slot.imgSrc = this.data.src ?? '';
      slot.imgAlt = this.data.alt ?? '';
    }

    this.state = LOAD_STATE.LOADING;

    if (imageElement?.complete && imageElement.naturalWidth > 0) {
      this.onLoaded();
    }
  }

  onLoaded(): void {
    this.state = LOAD_STATE.LOADED;

    if (this.slide && this.element) {
      this._host.dispatch('loadComplete', { slide: this.slide, content: this });

      const slide = this.slide as unknown as { isActive?: boolean; heavyAppended?: boolean; updateContentSize(force?: boolean): void };
      const slot = this._getSlot();
      if (slide.isActive && slide.heavyAppended && slot && !slot.contentAttached) {
        this.append();
      }
      if (this.slide) {
        (this.slide as unknown as { updateContentSize(force?: boolean): void }).updateContentSize(true);
      }
    }
  }

  onError(): void {
    this.state = LOAD_STATE.ERROR;

    if (this.slide) {
      this.displayError();
      this._host.dispatch('loadComplete', { slide: this.slide, isError: true, content: this });
      this._host.dispatch('loadError', { slide: this.slide, content: this });
    }
  }

  isLoading(): boolean {
    return this._host.applyFilters(
      'isContentLoading',
      this.state === LOAD_STATE.LOADING,
      this
    ) as boolean;
  }

  isError(): boolean {
    return this.state === LOAD_STATE.ERROR;
  }

  isImageContent(): boolean {
    return this.type === 'image';
  }

  isVideoContent(): boolean {
    return this.type === 'video';
  }

  setDisplayedSize(width: number, height: number): void {
    if (
      (this._host.dispatch('contentResize', { content: this, width, height }) as DispatchResult).defaultPrevented
    ) {
      return;
    }

    const slot = this._getSlot();
    if (slot) {
      slot.contentWidth = width;
      slot.contentHeight = height;
    }

    if (this.isImageContent() && !this.isError()) {
      const isInitialSizeUpdate = !this.displayedImageWidth && !!width;

      this.displayedImageWidth = width;
      this.displayedImageHeight = height;

      if (isInitialSizeUpdate) {
        this.loadImage(false);
      } else {
        this.updateSrcsetSizes();
      }

      if (this.slide) {
        this._host.dispatch('imageSizeChange', {
          slide: this.slide,
          width,
          height,
          content: this,
        });
      }
    }
  }

  isZoomable(): boolean {
    return this._host.applyFilters(
      'isContentZoomable',
      this.isImageContent() && this.state !== LOAD_STATE.ERROR,
      this
    ) as boolean;
  }

  updateSrcsetSizes(): void {
    if (!this.isImageContent() || !this.data.srcset) return;
    const sizesWidth = this._host.applyFilters(
      'srcsetSizesWidth',
      this.displayedImageWidth,
      this
    ) as number;

    if (sizesWidth > this._largestUsedSize) {
      this._largestUsedSize = sizesWidth;
      const slot = this._getSlot();
      if (slot) {
        slot.imgSizes = `${sizesWidth}px`;
      }
    }
  }

  lazyLoad(): void {
    if ((this._host.dispatch('contentLazyLoad', { content: this }) as DispatchResult).defaultPrevented) {
      return;
    }
    this.load(true);
  }

  destroy(): void {
    const videoElement = this.isVideoContent() ? this._getVideoElement() : null;
    if (videoElement) {
      videoElement.pause();
    }

    this.hasSlide = false;
    this.slide = undefined;

    if ((this._host.dispatch('contentDestroy', { content: this }) as DispatchResult).defaultPrevented) {
      return;
    }

    this.remove();

    if (this.isVideoContent()) {
      if (videoElement) {
        videoElement.removeAttribute('src');
        videoElement.load();
      }
      this.element = undefined;
    } else if (this.isImageContent() && this.element) {
      this.element = undefined;
    }
  }

  displayError(): void {
    if (!this.slide) return;
    const slot = this._getSlot();
    if (!slot) return;
    slot.isError = true;
    slot.contentType = 'html';
    slot.contentAttached = true;
    slot.htmlContent = '';
    slot.errorHtml = this._host.options?.errorMsg ?? '';
    const slide = this.slide as unknown as { updateContentSize(force?: boolean): void };
    slide.updateContentSize(true);
  }

  append(): void {
    if (this.isAttached) return;

    this.isAttached = true;

    if (this.state === LOAD_STATE.ERROR) {
      this.displayError();
      return;
    }

    if ((this._host.dispatch('contentAppend', { content: this }) as DispatchResult).defaultPrevented) {
      return;
    }

    if (this.isImageContent()) {
      const imageElement = this._getImageElement();
      this.element = imageElement ?? undefined;
      const supportsDecode = !!imageElement && 'decode' in imageElement;
      const slide = this.slide as unknown as { isActive?: boolean };
      if (supportsDecode && slide && imageElement && (!slide.isActive || isSafari())) {
        this.isDecoding = true;
        imageElement
          .decode()
          .catch(() => {})
          .finally(() => {
            this.isDecoding = false;
            this.appendImage();
          });
      } else {
        this.appendImage();
      }
    } else if (this.isVideoContent()) {
      const slot = this._getSlot();
      if (slot) {
        slot.contentType = 'video';
        this.syncVideoSlot(slot);
        slot.contentAttached = true;
      }
      const video = this._getVideoElement();
      this.element = video ?? undefined;
      const slide = this.slide as unknown as { isActive?: boolean };
      if (video && slide?.isActive && this.data.autoplay) {
        void video.play().catch(() => {});
      }
    } else {
      const slot = this._getSlot();
      if (slot) {
        slot.contentAttached = true;
      }
    }
  }

  activate(): void {
    if (
      (this._host.dispatch('contentActivate', { content: this }) as DispatchResult).defaultPrevented ||
      !this.slide
    ) {
      return;
    }

    const slide = this.slide as unknown as { holderElement?: HTMLElement };
    if (this.isImageContent() && this.isDecoding && !isSafari()) {
      this.appendImage();
    } else if (this.isError()) {
      this.load(false, true);
    }

    if (slide.holderElement) {
      slide.holderElement.setAttribute('aria-hidden', 'false');
    }
    const slot = this._getSlot();
    if (slot) {
      slot.ariaHidden = false;
    }
    if (this.isVideoContent() && this.data.autoplay) {
      const video = this._getVideoElement();
      if (video) {
        void video.play().catch(() => {});
      }
    }
  }

  deactivate(): void {
    this._host.dispatch('contentDeactivate', { content: this });
    if (this.isVideoContent()) {
      this.pauseVideo();
    }
    const slide = this.slide as unknown as { holderElement?: HTMLElement };
    if (slide?.holderElement) {
      slide.holderElement.setAttribute('aria-hidden', 'true');
    }
    const slot = this._getSlot();
    if (slot) {
      slot.ariaHidden = true;
    }
  }

  remove(): void {
    this.isAttached = false;
    if (this.isVideoContent()) {
      this.pauseVideo();
    }

    if ((this._host.dispatch('contentRemove', { content: this }) as DispatchResult).defaultPrevented) {
      return;
    }

    const slot = this._getSlot();
    if (slot) {
      slot.contentAttached = false;
    }
  }

  appendImage(): void {
    if (!this.isAttached) return;

    if (
      (this._host.dispatch('contentAppendImage', { content: this }) as DispatchResult).defaultPrevented
    ) {
      return;
    }

    const slot = this._getSlot();
    if (slot) {
      slot.contentAttached = true;
    }
  }

  private _getSlot(): HolderSlot | null {
    return (this.slide as unknown as { slot?: HolderSlot })?.slot ?? null;
  }

  private _getImageElement(): HTMLImageElement | null {
    return (this.slide as unknown as { getImageElement?: () => HTMLImageElement | null })
      ?.getImageElement?.() ?? null;
  }

  private _getVideoElement(): HTMLVideoElement | null {
    return (this.slide as unknown as { getVideoElement?: () => HTMLVideoElement | null })
      ?.getVideoElement?.() ?? null;
  }

  private _getHtmlElement(): HTMLDivElement | null {
    return (this.slide as unknown as { getHtmlElement?: () => HTMLDivElement | null })
      ?.getHtmlElement?.() ?? null;
  }

  private syncVideoSlot(slot: HolderSlot): void {
    slot.videoSrc = this.data.src ?? '';
    slot.videoPoster = this.data.poster ?? '';
    slot.videoMime = this.data.mime ?? '';
    slot.videoAutoplay = !!this.data.autoplay;
    slot.videoControls = this.data.controls !== false;
    slot.videoPlaysInline = this.data.playsInline !== false;
  }

  pauseVideo(): void {
    const video = this._getVideoElement();
    if (!video) return;
    video.pause();
  }

  onImageLoad(): void {
    this.onLoaded();
  }

  onImageError(): void {
    this.onError();
  }

  resetSlotState(): void {
    const slot = this._getSlot();
    if (!slot) return;
    slot.hasSlide = false;
    slot.transformStyle = '';
    slot.contentAttached = false;
    slot.imgSrc = '';
    slot.imgSrcset = '';
    slot.imgAlt = '';
    slot.imgSizes = '';
    slot.videoSrc = '';
    slot.videoPoster = '';
    slot.videoMime = '';
    slot.videoAutoplay = false;
    slot.videoControls = true;
    slot.videoPlaysInline = true;
    slot.contentWidth = 0;
    slot.contentHeight = 0;
    slot.htmlContent = '';
    slot.isError = false;
    slot.errorHtml = '';
    slot.ariaHidden = true;
  }

  syncCurrentElements(): void {
    if (this.isImageContent()) {
      this.element = this._getImageElement() ?? undefined;
    } else if (this.isVideoContent()) {
      this.element = this._getVideoElement() ?? undefined;
    } else {
      this.element = this._getHtmlElement() ?? undefined;
    }
  }
}
