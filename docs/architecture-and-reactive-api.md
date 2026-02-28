# PhotoSwipe 架构总结与动态 DataSource API 设计

本文档总结 photoswipe-reactive fork 的架构，便于设计「打开后动态更新 dataSource」的 API。

---

## 1. 整体分层

```
┌─────────────────────────────────────────────────────────────────┐
│  PhotoSwipeLightbox (lightbox/lightbox.js)                       │
│  - options 持有 dataSource / index / 其它配置                     │
│  - loadAndOpen(index, dataSource?) → preload() → _openPhotoswipe │
│  - 打开时：options.dataSource = dataSource，new PhotoSwipe(options)│
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  PhotoSwipe (photoswipe.js) — Core 单次会话                      │
│  - 继承 PhotoSwipeBase，持有 options（含 dataSource）             │
│  - mainScroll, contentLoader, gestures, opener, UI...            │
│  - init() 后 isOpen=true；close() → destroy()                    │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  PhotoSwipeBase (core/base.js) — 数据访问层                       │
│  - getNumItems()、getItemData(index) 每次从 options.dataSource 读 │
│  - 支持 DataSource 为数组或 { gallery, items }                   │
│  - numItems / itemData 过滤器可改写数量与单条数据                  │
└─────────────────────────────────────────────────────────────────┘
```

- **Lightbox**：负责「何时打开、用哪份 dataSource 打开」；每次 `loadAndOpen` 可传新的 `dataSource`，写入 `options.dataSource` 后创建新的 PhotoSwipe 实例。
- **Core (PhotoSwipe)**：一次打开对应一个实例，负责 DOM、手势、切换、缩放、关闭；**不拷贝 dataSource**，始终通过 base 从 `options.dataSource` 读。
- **Base**：唯一的数据源读入口；**无内部缓存**，每次 `getNumItems()` / `getItemData(index)` 都查 `this.options?.dataSource`。

---

## 2. 数据流（DataSource → Slide → Content）

- **dataSource**  
  - 类型：`SlideData[]` 或 `{ gallery: HTMLElement, items?: HTMLElement[] }`。  
  - 存放位置：**仅** `this.options.dataSource`（Lightbox 与 Core 共用同一 options 引用）。

- **getNumItems()**（base.js）  
  - 每次从 `options.dataSource` 计算长度（数组用 `length`，DOM 用 `dataSource.items.length`）。  
  - 再经 `numItems` 过滤器返回。  
  - 被调用于：init 时 sanitize index、goTo/getLoopedIndex、mainScroll.moveIndexBy、canBeSwiped、canLoop、UI（counter、arrow、single-slide class）等。

- **getItemData(index)**（base.js）  
  - 每次从 `options.dataSource` 取第 `index` 项（数组直接取，DOM 用 `dataSource.items[index]`）；若为 DOM 元素则 `_domElementToItemData` 转成 SlideData。  
  - 再经 `itemData` 过滤器返回。  
  - 被调用于：`setContent(holder, index)`、`refreshSlideContent` 的重新绑定、loader 的 `lazyLoadSlide(index)`。

- **setContent(holder, index [, force])**（photoswipe.js）  
  - 若 holder 已有 slide 且 index 未变且未 force，则直接 return。  
  - 否则 destroy 旧 slide，`itemData = this.getItemData(index)`，`holder.slide = new Slide(itemData, index, this)`，再 `append(holder.el)`。  
  - 即：**每次 setContent 都会重新 getItemData(index)**，没有对「当前 dataSource」的快照。

- **ContentLoader**（slide/loader.js）  
  - 按 **index** 缓存 `Content` 对象（`_cachedItems`），避免同一 index 重复创建。  
  - `getContentBySlide(slide)`：若缓存有该 index 的 Content 则复用，否则 `createContentFromData(slide.data, slide.index)` 并加入缓存。  
  - **注意**：Slide 构造时 `this.data = data` 是创建时的一次快照；若之后 dataSource 更新，已存在的 Slide/Content 不会自动更新，需要通过 `refreshSlideContent(slideIndex)` 或重新 `setContent` 触发。

- **MainScroll**（main-scroll.js）  
  - **固定 3 个 ItemHolder**（prev / curr / next），通过 `_currPositionIndex`、`_containerShiftIndex` 和旋转 itemHolders 实现无限滑动。  
  - 切换时 `updateCurrItem()` → 对需要更新的 holder 调用 `pswp.setContent(holder, index)`，index 由当前 currIndex 与方向算出。  
  - 所有「当前有多少张」「某 index 对应什么数据」都通过 `pswp.getNumItems()` / `pswp.getItemData(index)` 实时拿。

结论：**数据源事实上的唯一真相是 `options.dataSource`；getNumItems/getItemData 无缓存。** 唯一「缓存」是 ContentLoader 的 `_cachedItems`（按 index 的 Content）和 3 个 holder 上已创建的 Slide 实例。要支持动态更新，只需：更新 `options.dataSource`、修正 currIndex、清掉或刷新与当前可见相关的缓存/ holder 内容即可。

---

## 3. 关键模块与职责

| 模块 | 文件 | 职责 |
|------|------|------|
| **PhotoSwipeBase** | core/base.js | getNumItems、getItemData、createContentFromData、lazyLoadData；DOM dataSource 的 gallery/children 解析。 |
| **PhotoSwipe** | photoswipe.js | 单次会话：init、goTo、setContent、refreshSlideContent、updateSize、close、destroy；创建 MainScroll、ContentLoader、Gestures、Opener、UI。 |
| **MainScroll** | main-scroll.js | 3 个 ItemHolder、moveIndexBy、updateCurrItem、getCurrSlideX、resize；所有「当前页」与左右页的 setContent 驱动。 |
| **ContentLoader** | slide/loader.js | 按 index 缓存 Content；updateLazy、loadSlideByIndex、getContentBySlide、removeByIndex、addToCache。 |
| **Slide** | slide/slide.js | 单张的 data、zoom、pan、content、bounds；append、resize、destroy。 |
| **Content** | slide/content.js | 单张的图片/HTML 加载与展示，持有 slide.data 的副本（构造时）。 |
| **Lightbox** | lightbox/lightbox.js | 绑定 gallery 点击、loadAndOpen(index, dataSource)、preload；在 open 前写 `options.dataSource = dataSource`。 |

---

## 4. 与「动态 DataSource」相关的调用链

- **数量**：凡用 `getNumItems()` 的地方都会立即反映新长度（只要先更新 `options.dataSource`）。  
  - init 里 sanitize：`this.currIndex >= this.getNumItems()` → 会归 0。  
  - goTo / getLoopedIndex / canLoop / canBeSwiped / UI 等同理。

- **某 index 的数据**：凡用 `getItemData(index)` 的地方都会拿到新数据。  
  - setContent(holder, index) 会 `getItemData(index)` 再 `new Slide(itemData, index, this)`，所以**只要先更新 options.dataSource，再触发 setContent/refreshSlideContent，就会用新数据**。

- **需要额外处理的两点**：  
  1. **currIndex / potentialIndex**：若新 dataSource 长度变短，必须 clamp 到 `[0, newLength-1]`，否则 getItemData 可能越界或行为异常。  
  2. **ContentLoader 缓存**：`_cachedItems` 里按 index 缓存的 Content 可能对应旧数据；若 dataSource 整体替换或某几项被替换，应清空缓存或对受影响 index 调用 `removeByIndex`，让下次 getContentBySlide 用新 itemData 创建 Content。

---

## 5. 细粒度 Reactive API 设计（推荐）

粗粒度 `setDataSource(items)` 会清空整表缓存并刷新 3 个 holder，不利于「只改一两项」时的优化。下面按粒度从细到粗设计，调用方可按需选择。

**约定**：以下 API 均假定 `options.dataSource` 为数组（`SlideData[]`）。调用前由调用方保证类型。

---

### 5.1 单条更新（最细）

只更新某一个 index 的数据，只失效该 index 的缓存、仅当该 index 正在某 holder 显示时才重设该 holder。

```js
/**
 * 更新某一项的数据并刷新（若该 index 正在显示）。
 * 不碰其它 index 的缓存与 holder，适合单张数据变更（如尺寸回填、src 更新）。
 *
 * @param {number} index
 * @param {SlideData} itemData
 */
updateItem(index, itemData) {
  const arr = this.options.dataSource;
  if (!Array.isArray(arr) || index < 0 || index >= arr.length) return;
  arr[index] = itemData;
  this.invalidateItem(index);
}

/**
 * 仅失效某 index 的 Content 缓存，并在其正在某 holder 显示时刷新该 holder。
 * 不修改 dataSource，调用方需先改 options.dataSource[index]。
 *
 * @param {number} index
 */
invalidateItem(index) {
  this.contentLoader.removeByIndex(index);
  this._refreshHolderIfShowing(index);
}
```

`_refreshHolderIfShowing(index)`：遍历 `mainScroll.itemHolders`，若某 holder 的 `holder.slide?.index === index`，则 `this.setContent(holder, index, true)`。这样只刷新「正在显示的那一格」，不重建另外两个 holder。

---

### 5.2 区间增删（splice）

在数组上做 splice，只失效「受影响的 index」的缓存，并做必要的 index clamp 与 holder 刷新。

- 受影响范围：被删的 `[start, start+deleteCount)`，以及「下标 ≥ start 且因 splice 发生位移」的项（即缓存里所有 `index >= start` 的 Content 在 splice 后下标都变了，应全部失效）。
- 实现上：对 ContentLoader 中所有 `content.index >= start` 的项 destroy 并从 `_cachedItems` 移除；然后 clamp `currIndex` / `potentialIndex`，再刷新 3 个 holder。

```js
/**
 * 对 dataSource 数组做 splice，并失效受影响缓存、clamp 当前 index、刷新可见 holder。
 * 适合尾部追加、中间删除、批量插入等。
 *
 * @param {number} start
 * @param {number} deleteCount
 * @param {...SlideData} items
 */
spliceDataSource(start, deleteCount, ...items) {
  const arr = this.options.dataSource;
  if (!Array.isArray(arr)) return;
  const oldLen = arr.length;
  arr.splice(start, deleteCount, ...items);
  const numItems = this.getNumItems();

  // Clamp 当前 index（若落在被删区间或越界）
  if (this.currIndex >= numItems) {
    this.currIndex = Math.max(0, numItems - 1);
    this.potentialIndex = this.currIndex;
  }
  if (this.potentialIndex >= numItems) {
    this.potentialIndex = Math.max(0, numItems - 1);
  }
  if (this.currIndex >= start && this.currIndex < start + deleteCount) {
    this.currIndex = Math.min(start, numItems - 1);
    this.potentialIndex = this.currIndex;
  }

  // 只失效 index >= start 的缓存（被删的 + 下标位移的）
  this._invalidateCacheFromIndex(start);
  this._refreshVisibleHolders();
  this.dispatch('change');
}
```

- `_invalidateCacheFromIndex(start)`：遍历 `_cachedItems`，对 `content.index >= start` 的项 `content.destroy()` 并从数组移除。
- `_refreshVisibleHolders()`：根据当前 `currIndex` 与 `getNumItems()` 对 3 个 holder 分别 `setContent(holder, index, true)`（与现有 refreshSlideContent 对 3 格的逻辑一致）。

这样只动「从 start 起」的缓存和当前可见的 3 格，其余缓存可继续复用。

---

### 5.3 整表替换（粗粒度，保留但不推荐高频用）

需要整表替换时再调用，会清空全部 Content 缓存并刷新 3 个 holder：

```js
/**
 * 整表替换 dataSource。会清空 Content 缓存并刷新所有可见 holder。
 * 适合初次注入或极少发生的全量替换；频繁更新请用 updateItem / spliceDataSource。
 *
 * @param {SlideData[]} items
 */
setDataSource(items) {
  if (!Array.isArray(items)) return;
  this.options.dataSource = items;
  const numItems = this.getNumItems();
  this.currIndex = Math.min(this.currIndex, Math.max(0, numItems - 1));
  this.potentialIndex = Math.min(this.potentialIndex, Math.max(0, numItems - 1));

  this.contentLoader._cachedItems.forEach(c => c.destroy());
  this.contentLoader._cachedItems = [];
  this._refreshVisibleHolders();
  this.dispatch('change');
}
```

---

### 5.4 内部辅助（不对外）

- `_refreshHolderIfShowing(index)`：仅当某 holder 正在显示该 index 时，对该 holder 执行 `setContent(holder, index, true)`。
- `_invalidateCacheFromIndex(start)`：销毁并移除 ContentLoader 中所有 `content.index >= start` 的项。
- `_refreshVisibleHolders()`：按当前 currIndex 与 numItems 对 3 个 holder 重新 setContent，并同步 currSlide（可复用现有 `refreshSlideContent` 里对 3 格的循环逻辑，或抽成共用方法）。

---

### 5.5 使用建议

| 场景 | 推荐 API | 原因 |
|------|----------|------|
| 单张数据变更（如尺寸、src） | `updateItem(index, itemData)` 或先改 `dataSource[index]` 再 `invalidateItem(index)` | 只动 1 个 index 的缓存和可能 1 个 holder |
| 尾部追加若干张 | `spliceDataSource(oldLen, 0, ...newItems)` | 只失效 `index >= oldLen`（通常无缓存），不碰已有缓存 |
| 中间删除/插入 | `spliceDataSource(start, deleteCount, ...items)` | 只失效 `index >= start`，clamp 一次 |
| 整表替换（如切相册） | `setDataSource(items)` | 全量替换时再清全缓存 |

---

## 6. 小结

- **数据源**：唯一来源是 `options.dataSource`；base 层每次 `getNumItems()` / `getItemData(index)` 都直接读，无内部拷贝。  
- **缓存**：只有 ContentLoader 的 `_cachedItems` 和 3 个 ItemHolder 上的 Slide；细粒度更新时只失效「受影响」的 index 或从某 start 起的一段。  
- **API 粒度**：优先提供 `updateItem` / `invalidateItem`（单条）和 `spliceDataSource`（区间增删），整表替换保留 `setDataSource` 供少量场景使用，便于优化。
