# Vue 响应式组件改造 — 修改范围说明

本文档描述将本仓库做成 **Vue 响应式组件** 时的修改范围：Demo 改为使用源码中的新组件，组件**仅负责 PhotoSwipe 弹层（dialog）的渲染与行为**，以响应式 props 暴露库的 options、通过事件冒泡暴露库事件，且**不依赖 window 全局单例**。组件**不管理 gallery**（不提供容器、不绑定缩略图点击）。**与 Vue 的绑定**要求：**不在内部动态创建 dialog 根节点**，而是将 dialog 的 DOM **融入 Vue 的生命周期**——由组件模板提供挂载点或根节点，库只在该节点内挂载/创建子结构。

---

## 1. 目标

| 项目 | 说明 |
|------|------|
| **组件职责** | **仅负责 dialog**：只渲染/管理 PhotoSwipe 弹层（打开后的 overlay、幻灯片、关闭等），**不**提供 gallery 容器、**不**绑定缩略图或 `children`。 |
| **DOM 与 Vue 生命周期** | **不动态创建 dialog 根 DOM**：dialog 的根节点（或至少其挂载容器）由**组件模板**声明，由 Vue 创建与销毁；库**不**在内部 `createElement` 再 `appendChild` 到 body，而是挂载到 Vue 提供的节点上，使 dialog DOM 随组件经历 Vue 的挂载/卸载。 |
| **Demo 用法** | `demo/App.vue` 改为使用源码中新增的 Vue 组件；gallery 的 DOM 与点击逻辑由**父组件**负责，父组件在需要时调用组件的 `open(index, dataSource)`。 |
| **Options** | 组件的 options 以**响应式属性**（props）暴露（仅 dialog 相关，**不含** `gallery` / `children`），父组件更新后下次打开或运行时能生效。 |
| **事件** | 库的事件通过组件的 **emit 冒泡** 到父组件（如 `beforeOpen`、`change`、`close` 等）。 |
| **实例模型** | 组件**不是** window 全局单例：每个组件实例对应一个弹层实例，**不依赖 `window.pswp` 等 window 属性**。 |

---

## 2. 修改范围总览

| 区域 | 路径/说明 | 修改类型 |
|------|-----------|----------|
| **库：Core 支持挂载到已有节点** | `src/js/photoswipe.js` 的 `_createMainStructure` | 新增 `options.rootEl`，根节点由调用方提供 |
| **库：去掉 window 单例** | `src/js/lightbox/lightbox.js` | 可选；若组件仅用 Core 则可不改；若与 Lightbox 并存则建议改 |
| **源码：Vue 组件** | 新增 `src/PhotoSwipeDialog.vue`（仅 dialog，无 gallery；模板提供 dialog 根节点） | 新建 |
| **源码：组件入口** | `package.json` 的 `exports` 或 `src/index.js` | 导出 Vue 组件 |
| **Demo** | `demo/App.vue` | 保留 gallery DOM 与点击逻辑，使用组件仅作 dialog，传 options + 监听事件 + 调用 open() |

以下按上述顺序展开。

---

## 3. 库层：`src/js/photoswipe.js` — 支持挂载到 Vue 提供的根节点（rootEl）

为满足「内部不动态创建 dialog 根 DOM、融入 Vue 生命周期」，Core 需支持**使用调用方提供的已有元素**作为 PhotoSwipe 的根节点，而不是在库内 `createElement` 再 `appendChild` 到 body。

### 3.1 现状

- 在 **`_createMainStructure()`**（约 L733–761）中：
  - 根节点由库创建：`this.element = createElement('pswp', 'div');`
  - 随后在 `this.element` 上创建并挂载子结构（`bg`、`scrollWrap`、`container` 等）；
  - 最后执行 `(this.options.appendToEl || document.body).appendChild(this.element)`，即根节点始终由库创建并挂到某父节点。

### 3.2 修改方案

- 在 **PhotoSwipeOptions** 中新增可选属性 **`rootEl`**（`HTMLElement`）：若传入，表示调用方已提供根节点（由 Vue 在模板中创建），库应**复用该节点**，不再创建根 div，也不再将其 append 到 body/appendToEl。
- **逻辑**：
  - 若存在 `this.options.rootEl`：`this.element = this.options.rootEl`；不再执行 `createElement('pswp', 'div')` 和 `appendChild(this.element)`。
  - 在该 `this.element` 上**仅**创建并挂载**子结构**（bg、scrollWrap、container 等），与现有代码一致（这些子节点仍由库创建并 append 到 `this.element` 内）。
- **根节点要求**：调用方提供的 `rootEl` 需具备库依赖的语义与可访问性（如 `tabindex="-1"`、`role="dialog"`、class `pswp` 等），可在组件模板中写死，或由组件在挂载后统一设置。
- **destroy 行为**：当使用了 `rootEl` 时，PhotoSwipe 在 **destroy** 时**不应**将 `this.element`（即 rootEl）从 DOM 中移除（因该节点由 Vue 拥有）；仅移除其**子节点**、解绑事件、释放引用等，根节点由 Vue 在组件卸载时统一移除。当前实现中约 **L531** 有 `this.element?.remove()`，在 `rootEl` 场景下需改为：若本次实例使用了 `options.rootEl`，则**不**执行 `this.element.remove()`，仅清空其子节点（或由调用方在组件卸载前自行清空）。

### 3.3 涉及位置

- **类型**：`src/js/photoswipe.js` 中 `PreparedPhotoSwipeOptions` 的 JSDoc 增加 `@prop {HTMLElement} [rootEl]`。
- **实现**：`_createMainStructure()` 开头分支：有 `rootEl` 时赋值 `this.element = options.rootEl`，并跳过创建根与 append；无 `rootEl` 时保持现有逻辑（createElement + appendToEl/body）。**destroy()**（约 L515–538）：若存在 `this.options.rootEl`，则不对 `this.element` 调用 `remove()`，仅清空子节点并执行其余销毁逻辑。

这样，Vue 组件在模板中声明一个根元素（如 `<div ref="pswpRoot" class="pswp" tabindex="-1" role="dialog">`），将该 ref 作为 `options.rootEl` 传入；该节点由 Vue 创建与销毁，库只在其内部挂载子结构，实现「不动态创建根 DOM、融入 Vue 生命周期」。

---

## 4. 库层：`src/js/lightbox/lightbox.js` — 去掉对 window 的依赖（可选）

- **本 Vue 组件** 仅负责 dialog，直接使用 **PhotoSwipe Core** 在 `open(index, dataSource)` 时 `new PhotoSwipe(options)`，**不**使用 PhotoSwipeLightbox，因此**不依赖**对 `lightbox.js` 的修改即可实现多实例、无 window 单例。
- 若项目中**仍会使用 PhotoSwipeLightbox**（例如其它页面或第三方用法），建议对 `lightbox.js` 做以下修改，避免多 Lightbox 共享 `window.pswp` 且依赖全局。

### 4.1 现状

- `window.pswp` 被用来表示“当前是否有 PhotoSwipe 正在打开”，并在三处使用：
  - **L80**：`onThumbnailsClick` 中若 `window.pswp` 为真则直接 return，不处理点击。
  - **L154**：`loadAndOpen` 中若 `window.pswp` 为真则不再打开。
  - **L245**：`_openPhotoswipe` 中若 `window.pswp` 为真则不再创建新实例。
- **L259**：打开时执行 `window.pswp = pswp`。
- **L285**：`destroy` 回调中执行 `delete window.pswp`。

### 4.2 修改方案（与 Lightbox 并存时建议做）

- 用 **`this.pswp`** 替代 **`window.pswp`** 做“是否已打开”判断（L80、L154、L245）。
- 可选：完全移除对 `window.pswp` 的赋值与删除（L259、L285），以符合“不依赖 window 属性判断”。

### 4.3 涉及行号（便于定位）

- 约 79–81 行：`onThumbnailsClick` 内判断。
- 约 153–156 行：`loadAndOpen` 内判断。
- 约 244–247 行：`_openPhotoswipe` 内判断。
- 约 258–260 行：赋值 `window.pswp = pswp`。
- 约 282–286 行：`pswp.on('destroy', ...)` 中 `delete window.pswp`。

---

## 5. 源码：新增 Vue 组件（仅 dialog，无 gallery；DOM 融入 Vue 生命周期）

### 5.1 文件位置与命名

- 建议路径：**`src/PhotoSwipeDialog.vue`**（或 `src/components/PhotoSwipeDialog.vue`），以体现“仅弹层、不包含 gallery”。
- 需保证 demo 与对外包能正确 resolve 该路径（如通过 `package.json` exports 或 `src/index.js` 再导出）。

### 5.2 组件职责（去掉 gallery + DOM 由 Vue 拥有）

1. **模板：提供 dialog 根节点，不动态创建**
   - **不提供** gallery 容器、**不提供** 缩略图插槽、**不**绑定 `options.gallery` / `options.children`。
   - **必须**在模板中声明 **dialog 的根节点**，由 Vue 创建与销毁，例如：  
     `<div ref="pswpRoot" class="pswp" tabindex="-1" role="dialog" aria-modal="true">`  
     该节点即作为 Core 的 **`options.rootEl`** 传入；库**不再**在内部创建根 div，只在此节点内挂载子结构（bg、scrollWrap、container 等）。这样 dialog 的根 DOM 随组件挂载而存在、随组件卸载而移除，**融入 Vue 生命周期**。
   - 若使用 `v-if`/`v-show` 控制“未打开时是否渲染根节点”，需与 `open()` 的调用时机、库对 `rootEl` 的读写时机协调（例如未打开时仍保留根节点在 DOM 中但隐藏，或仅在首次 open 前确保 rootEl 已挂载）。

2. **打开方式：仅程序化**
   - 通过 **defineExpose** 暴露 **`open(index, dataSource)`**（或 `openAt(index, dataSource)`）。父组件自行管理 gallery DOM 与点击逻辑，在需要打开时调用 `dialogRef.open(index, dataSource)`。
   - 组件内部**直接使用 PhotoSwipe Core**，在 `open(index, dataSource)` 被调用时：用当前 props 拼出 `options`（含 **`rootEl: pswpRoot.value`**、`index`、`dataSource` 及其余 dialog 相关配置），`new PhotoSwipe(options)` 后 `pswp.init()`。**不使用** PhotoSwipeLightbox。

3. **Options 响应式（仅 dialog 相关）**
   - 以 **props** 暴露的仅为与 **dialog 行为** 相关的 options，**不**暴露 `gallery`、`children`；**必须**传入 **`rootEl`**（组件 ref 指向的模板根节点），不传 `appendToEl`（根已在 Vue 树中）。
   - 暴露项示例：`pswpModule`、`bgOpacity`、`spacing`、`loop`、`pinchToClose`、`closeOnVerticalDrag`、动画时长、键盘/焦点、点击行为、`mainClass` 等；`index` 与 `dataSource` 由每次 `open(index, dataSource)` 传入。
   - 每次 `open()` 时用**当前 props** 拼 options，响应式体现在**下次打开时使用最新 props**。

4. **生命周期**
   - **onMounted**：无需创建 Lightbox；确保模板中的 `pswpRoot` 已挂载，供后续 `open()` 时作为 `rootEl` 传入。
   - **onUnmounted**：若当前有已打开的 PhotoSwipe 实例，则调用其 `destroy()`；Vue 卸载时组件根节点（即 dialog 根）随组件一起移除，库在 destroy 时不应再移除 rootEl（因 rootEl 由 Vue 拥有），需确认 Core 的 destroy 逻辑对 `rootEl` 场景的处理（仅清空子节点或移除监听，不 remove rootEl 本身）。

5. **事件冒泡**
   - 在每次 `new PhotoSwipe(...)` 后，对该实例 `pswp.on(...)` 订阅库事件，在回调里对父组件 **emit** 同名或 kebab-case 事件（如 `@before-open`、`@close`），并传递库提供的事件参数。
   - 建议在组件文档中提供「库事件名 → 组件 emit 名」对照表。

6. **不依赖 window**
   - 组件内部**不读取、不写入** `window.pswp`；是否已打开由组件内部持有的当前 PhotoSwipe 实例引用判断。

### 5.3 Options 与事件列表参考（仅 dialog）

- **Options（不包含 gallery/children）**：见 `src/js/photoswipe.js` 中 `PreparedPhotoSwipeOptions`，排除 `gallery`、`gallerySelector`、`children`、`childSelector`、`thumbSelector`；**新增** `rootEl` 并由组件传入；`dataSource`/`index` 由 `open(index, dataSource)` 传入；其它如 `pswpModule`、`bgOpacity`、`spacing`、`loop`、`pinchToClose`、`closeOnVerticalDrag`、动画相关、键盘/焦点、点击行为、`mainClass` 等以 props 或一个 `options` 对象 prop 透传。
- **事件**：见 `src/js/core/eventable.js` 中 `PhotoSwipeEventsMap` 及 `docs/events.md`，组件对需要暴露的事件做转发并 emit 即可。

---

## 6. 源码：组件导出入口

- 在 **`src/index.js`**（若有）中 **export** 新 Vue 组件，便于 `import { PhotoSwipeDialog } from 'photoswipe'` 或 `from 'photoswipe/vue'`。
- 在 **`package.json`** 的 **`exports`** 中增加对 Vue 组件的导出，例如：
  - `"./vue": { "import": "./src/PhotoSwipeDialog.vue", ... }`。

具体字段名与路径以项目现有构建与使用方式为准。

---

## 7. Demo：`demo/App.vue` 改造

### 7.1 当前用法摘要

- 直接 `import PhotoSwipeLightbox`、`import PhotoSwipe`，用 `galleryRef` 作为 gallery 容器，在 `onMounted` / `watch(items.length)` 里 `new PhotoSwipeLightbox({ pswpModule, gallery: galleryRef.value, children: 'a' })` 并 `lightbox.init()`。
- 点击缩略图时 `openAt(index)` 调用 `lightbox.loadAndOpen(index, dataSource)`。
- `onUnmounted` 里 `lightbox.destroy()`。

### 7.2 修改后用法（目标形态：组件仅 dialog，gallery 留在父组件）

- **引入**：`import PhotoSwipeDialog from '../src/PhotoSwipeDialog.vue'`（或 `photoswipe/vue`）。
- **模板**：
  - **Gallery 仍由 App.vue 完全拥有**：保留现有 `<div class="gallery" ref="galleryRef">` 及其中的 `v-for` 缩略图 `<a>`，**不**用组件包裹 gallery；缩略图点击仍由父组件处理（如 `@click.prevent="openAt(index)"`）。
  - **仅增加一个 dialog 组件**：在页面某处放置 `<PhotoSwipeDialog ref="dialogRef" :pswp-module="PhotoSwipe" @close="..." />`（或其它 dialog 相关 props），**不**传 `gallery` / `children`。
- **打开逻辑**：`openAt(index)` 改为调用 dialog 组件暴露的方法，例如 `dialogRef.value.open(index, dataSource)`，其中 `dataSource` 仍由当前 `items` 转成库需要的格式；组件内部用 Core 打开弹层。
- **事件**：在 `<PhotoSwipeDialog>` 上监听 `@before-open`、`@change`、`@close` 等，用于调试或 UI 反馈。
- **生命周期**：删除对 `PhotoSwipeLightbox` 的 `init()` / `destroy()` 以及 `galleryRef` 与 lightbox 的绑定；dialog 的创建与销毁由组件内部在 `open()` 与关闭时处理。

这样，Demo 中 gallery 的 DOM 与交互完全在父组件，组件只负责“弹层的渲染与行为”。

### 7.3 可选的响应式验证

- 在 Demo 中为 dialog 组件传入**可变的 options**（如 `loop`、`pinchToClose` 等），通过表单修改对应 props，再次打开弹层时确认行为随 props 更新。

---

## 8. 小结表

| 项目 | 修改内容 |
|------|----------|
| **photoswipe.js (Core)** | 新增 **`options.rootEl`**：若传入则复用该节点为 `this.element`，不再 createElement 根节点、不 append 到 body；仅在其内挂载子结构。destroy 时若为 rootEl 则不移除根节点，仅清理子节点与事件。 |
| **lightbox.js** | **可选**。若仅用本组件（Core 直用）、不用 Lightbox，可不改；若与 Lightbox 并存，建议将 `window.pswp` 改为 `this.pswp`，并可选移除对 `window.pswp` 的赋值与删除。 |
| **新 Vue 组件** | 新增 `src/PhotoSwipeDialog.vue`，**仅负责 dialog**：**模板中声明 dialog 根节点**（如 `<div ref="pswpRoot" class="pswp" ...>`），作为 `options.rootEl` 传入，**不动态创建根 DOM**，融入 Vue 生命周期；不提供 gallery；用 Core 在 `open(index, dataSource)` 时挂载弹层子结构；options 为 props、事件 emit、不依赖 window；**defineExpose** 暴露 **`open(index, dataSource)`**。 |
| **导出** | `package.json` exports 和/或 `src/index.js` 中导出 Vue 组件（如 `PhotoSwipeDialog`）。 |
| **demo/App.vue** | gallery 保留在父组件；增加 `<PhotoSwipeDialog ref="dialogRef" ... />`，通过 ref 调用 `dialogRef.open(index, dataSource)` 打开弹层，通过 @event 监听事件；删除对 PhotoSwipeLightbox 的 init/destroy 与 gallery 绑定。 |

以上即为「仅负责 dialog、去掉 gallery 支持、内部不动态创建 DOM 且 dialog 融入 Vue 生命周期」的 Vue 响应式组件修改范围说明；实现时组件在模板中提供根节点并传入 Core 的 `rootEl`，组件直接使用 PhotoSwipe Core，不依赖 Lightbox 与 window。
