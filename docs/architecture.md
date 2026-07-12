# 项目架构文档 — 四象限任务管理器

> 艾森豪威尔矩阵任务管理应用，纯原生 HTML/CSS/JS 网页应用 + PWA，可通过 Capacitor 打包为 App。

---

## 1. 项目目标

- **核心功能**：按艾森豪威尔矩阵（紧急/重要 四象限）管理每日任务
- **辅助功能**：大任务规划（里程碑/子任务/阶段）、计划池（待办/本周/本月）、依循原则、优先问题
- **跨平台**：浏览器 PWA（支持离线）、GitHub Pages 部署、Capacitor 原生 App
- **多端同步**：通过 GitHub Gist API 实现手机端 ↔ 电脑端数据同步

---

## 2. 技术栈

| 层面 | 技术 |
|------|------|
| 页面结构 | 单个 `index.html`，所有 JS 按序 `<script defer>` 加载 |
| 样式 | 单个 `css/style.css`，CSS 变量主题系统，暗色模式 + 移动端适配 |
| 脚本 | 纯原生 JS（24 个文件），`var` + `function` + IIFE 闭包，全局挂载 `window` |
| 数据 | `localStorage` 持久化，内存缓存层避免重复 JSON.parse |
| 离线 | Service Worker（Cache First + Stale-While-Revalidate），版本化缓存 |
| 云同步 | GitHub Gist REST API（GET 拉取、PATCH 推送） |
| 测试 | Node.js 脚本（`test/*.js`），纯函数可直接 node 运行 |
| 构建 | 无。零依赖，不引入框架/打包器/npm |

---

## 3. 文件职责一览

### 3.1 HTML（1 个文件）

| 文件 | 职责 |
|------|------|
| `index.html` | 完整 DOM 结构（Header、Toolbar、大任务面板、依循面板、四象限网格、时间视图容器、计划池面板、Toast 容器）+ SW 注册 + 按序加载所有 JS |

### 3.2 CSS（1 个文件）

| 文件 | 职责 |
|------|------|
| `css/style.css` | 全局样式（~1870 行），CSS 变量主题、暗色模式、≤600px / ≤1000px / ≤1200px 三档响应式 |

### 3.3 JS — 基础设施层（最先加载）

| 文件 | 行数 | 职责 |
|------|------|------|
| `js/util.js` | ~95 | `Util.escHtml` HTML 转义、`Util.calcDaysLeft` 剩余天数、`Util.walkLeafItems` 树遍历 |
| `js/config.js` | ~30 | 常量定义：`QUADRANTS` 四象限、`TIME_SLOTS` 时段、`COMPLETION_OPTIONS` 完成度 |

### 3.4 JS — 数据层

| 文件 | 行数 | 职责 |
|------|------|------|
| `js/store.js` | ~2100 | **最核心模块**。所有 localStorage 读写、内存缓存、备份轮转、数据迁移、回收站引擎。**严禁绕过** |

### 3.5 JS — UI 交互层

| 文件 | 行数 | 职责 |
|------|------|------|
| `js/edit.js` | ~50 | 行内编辑：文本 `<input>` 和百分比 `<select>` |
| `js/toast.js` | ~60 | 撤销 Toast 通知（5 秒自动消失） |
| `js/highlight.js` | ~120 | 文本高亮（全文高亮 + 选区高亮 Ctrl+Q） |
| `js/timeslot.js` | ~80 | 时间段选择（默认时段计算 + 时段更新） |
| `js/drag.js` | ~650 | **HTML5 拖拽系统**（象限间/块进出/子任务/阶段/大任务池 全部拖拽操作） |
| `js/shortcuts.js` | ~30 | 键盘快捷键（Ctrl+D/F/S/Q、Escape、N） |

### 3.6 JS — 渲染层

| 文件 | 行数 | 职责 |
|------|------|------|
| `js/render.js` | ~650 | **渲染引擎**。象限视图、时间视图、搜索过滤、任务/块/子任务/阶段 DOM 创建。**最易出错的模块** |

### 3.7 JS — 业务操作层

| 文件 | 行数 | 职责 |
|------|------|------|
| `js/quadrant-ops.js` | ~550 | 象限任务 CRUD：增删改、完成切换、阶段拆分、`bigTaskRef` 解绑 |
| `js/defer.js` | ~120 | 任务推迟（退回计划池/大任务 + 日期+1）、超额完成标记 |
| `js/future.js` | ~250 | 计划池管理（三 Tab）+ 多种导入函数（单项/批块/大任务池 → Q-II） |
| `js/bigtask.js` | ~1455 | **最大模块**。大任务面板、卡片渲染、里程碑/子任务/阶段 CRUD、今日任务池、完成缓存、回收站、AI 规划弹窗 |

### 3.8 JS — 导入导出层

| 文件 | 行数 | 职责 |
|------|------|------|
| `js/markdown.js` | ~120 | Markdown 导出/导入（按象限格式） |
| `js/json-io.js` | ~100 | JSON 导入/导出（文件选择器 + 粘贴文本，合并/覆盖两种模式） |
| `js/cache-ui.js` | ~250 | 缓存日期管理（保存/导入/重命名/置顶/自动导入/导出单日 JSON） |

### 3.9 JS — 统计与报告

| 文件 | 行数 | 职责 |
|------|------|------|
| `js/stats-ui.js` | ~120 | 统计面板（完成率/象限分布/时段分布/7 日历史） |
| `js/daily-report.js` | ~250 | 日报生成（Markdown/HTML 预览 + 复制 + 下载） |

### 3.10 JS — 同步系统

| 文件 | 行数 | 职责 |
|------|------|------|
| `js/cloud-sync.js` | ~650 | GitHub Gist 云同步（推送/拉取/诊断/定时/可见性切换/自动重试） |
| `js/sync-merge.js` | ~200 | LWW 合并引擎（按 `updatedAt` 时间戳逐条目合并，支持墓碑删除） |

### 3.11 JS — 高级功能

| 文件 | 行数 | 职责 |
|------|------|------|
| `js/batch-delete.js` | ~580 | 批量删除（三区域：象限/计划池/大任务，含工具栏、全选/反选） |
| `js/source-editor.js` | ~300 | 手机端源码编辑器（HTML/CSS/JS 三 Tab + 沙箱预览 + 持久化 + 导出） |

### 3.12 JS — 入口

| 文件 | 行数 | 职责 |
|------|------|------|
| `js/app.js` | ~380 | **入口文件**。`initApp()` 初始化全部模块、绑定事件、触发迁移、启动渲染 |

### 3.13 配置与服务

| 文件 | 职责 |
|------|------|
| `service-worker.js` | PWA 离线缓存（v19），api.github.com 绕过，37 个预缓存资源 |
| `manifest.json` | PWA 清单 |
| `CLAUDE.md` | AI 辅助开发规则 |
| `repairing.txt` / `repaired.txt` | 待修复 / 已修复记录 |

---

## 4. 模块调用关系图

```
                    ┌─────────────────────────────────────┐
                    │            index.html                │
                    │   (DOM 结构 + 24 个 <script defer>)  │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │           js/app.js                  │
                    │       initApp() — 入口               │
                    │  注册事件、触发迁移、启动渲染         │
                    └──────────────┬──────────────────────┘
                                   │
        ┌──────────────┬───────────┼───────────┬──────────────┐
        ▼              ▼           ▼           ▼              ▼
   ┌─────────┐  ┌──────────┐ ┌──────────┐ ┌─────────┐  ┌──────────┐
   │ config  │  │  store   │ │  render  │ │  drag   │  │  cloud-  │
   │ (常量)  │  │ (数据层) │ │ (渲染)   │ │ (拖拽)  │  │  sync    │
   └─────────┘  └────┬─────┘ └────┬─────┘ └────┬────┘  └────┬─────┘
                     │            │            │            │
          ┌──────────┼────────────┼────────────┼────────────┘
          ▼          ▼            ▼            ▼
   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
   │ quadrant │ │ bigtask  │ │  future  │ │  defer   │
   │  -ops    │ │  (大任务) │ │ (计划池)  │ │ (推迟)   │
   └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘
        │            │            │            │
        └────────────┴────────────┴────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
   ┌─────────┐ ┌──────────┐ ┌──────────┐
   │  edit   │ │  toast   │ │highlight │
   │ (编辑)  │ │ (通知)   │ │ (高亮)   │
   └─────────┘ └──────────┘ └──────────┘

   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
   │markdown  │ │ json-io  │ │cache-ui  │ │ batch-   │
   │(MD导入出)│ │(JSON导入出)│ │(缓存UI)  │ │ delete   │
   └──────────┘ └──────────┘ └──────────┘ └──────────┘

   ┌──────────┐ ┌──────────┐ ┌──────────┐
   │stats-ui  │ │ daily-   │ │ source-  │
   │(统计)    │ │ report   │ │ editor   │
   └──────────┘ └──────────┘ └──────────┘
```

**核心依赖链**：`store.js` ← `render.js` ← 所有业务模块 ← `app.js`

**所有数据读写必须经过 `store.js`**，不允许直接操作 `localStorage`。

---

## 5. 初始化流程（`initApp()` 执行顺序）

```
1. 设置 currentDate = 今天
2. SourceEditor._initLazy = true（延迟初始化）
3. CloudSync.init()（恢复同步配置、自动拉取、启动定时轮询）
4. 恢复 viewMode（localStorage → viewMode 全局变量）
5. loadTheme()（应用暗色/亮色主题）
6. applyBigTaskDropOverrides()（Monkey-patch 拖拽处理器）
7. setupQuadrantContainers()（为每个象限容器绑定 dragover/drop）
8. setupDatePicker()（日期选择器）
9. setupButtons()（≈30 个按钮的事件绑定）
10. setupDropZone()（全页文件拖放导入）
11. setupCacheButtons()（缓存按钮）
12. setupKeyboardShortcuts()（键盘快捷键）
13. setupSearchInput()（搜索输入防抖 150ms）
14. setupJsonButtons()（JSON 导入导出按钮）
15. setupStatsButton()（统计面板按钮）
16. setupDailyReport()（日报按钮）
17. setupBigTaskPanel()（大任务面板折叠/添加/AI规划）
18. setupPlanPoolPanel()（计划池面板折叠/Tab切换/添加）
19. setupPrinciplesPanel()（依循面板折叠/添加/日期范围）
20. setupHintBar()（提示栏关闭）
21. setTimeout(0): 执行数据迁移（migrateFutureTasks/WeekTasks/MonthTasks + 种子缓存 + 大任务自动归档）
22. renderAll(today) → 首次渲染
23. 视图切换按钮绑定
24. setTimeout(800ms): autoSyncFromDevice()（Capacitor 设备同步）
25. resize 事件监听（重算象限行高）
```

---

## 6. 页面生命周期

```
页面加载
  → DOMContentLoaded → initApp()
  → 首次渲染 renderAll(today)
  → 用户交互（点击/拖拽/编辑/快捷键）
    → 业务模块 → store.js 读写 → saveDateData → CloudSync.onDataChanged()
    → renderAll / renderQuadrantOnly → DOM 更新
  → 定时任务（60s 自动拉取、3s 防抖推送）
  → 页面隐藏/可见切换（暂停/恢复定时拉取）
  → 关闭页面（数据已在每次 save 时持久化）
```

## 7. 哪些模块最核心（修改影响面最大）

| 优先级 | 模块 | 理由 |
|--------|------|------|
| ⭐⭐⭐ | `store.js` | 所有数据读写唯一入口，改错会导致数据丢失或损坏 |
| ⭐⭐⭐ | `render.js` | 渲染引擎，时间视图极易出 bug（历史 16+ 处遗漏） |
| ⭐⭐⭐ | `cloud-sync.js` | 同步系统，bug 会导致多端数据不一致或丢失 |
| ⭐⭐ | `drag.js` | 涉及 30+ 个数据移动函数，改错导致任务丢失 |
| ⭐⭐ | `bigtask.js` | 最大模块（1455 行），复杂度高 |
| ⭐⭐ | `app.js` | 入口初始化，事件绑定错漏导致功能不可用 |
| ⭐ | `quadrant-ops.js` | 象限 CRUD，每次改动要检查 stage/subtask 完整性 |
| ⭐ | `service-worker.js` | 缓存策略改动影响所有用户（需清缓存才生效） |

---

## 8. 哪些模块不能轻易修改

- **`store.js` 的 localStorage key 名称** — 改名会丢失所有用户历史数据；向后兼容迁移代码极其复杂
- **`cloud-sync.js` 的 API 请求格式** — 线上已在使用的 Gist 文件格式不能变
- **`render.js` 的时间视图 `flattenChildren`** — 分布逻辑牵一发动全身，任何改动必须跑 3 个测试
- **`service-worker.js` 的 API 绕过规则** — 历史上曾因 SW 缓存 API 响应导致同步永久失效
- **`index.html` 的 `<script>` 加载顺序** — 顺序错会导致 `undefined` 错误
- **`config.js` 的 `QUADRANT_KEYS` / `TIME_SLOTS` 结构** — 大量代码硬依赖其字段名

---

## 9. 推荐阅读源码的顺序

**第一次接触项目，按此顺序阅读：**

1. `CLAUDE.md` — 了解项目规则和约束
2. `index.html` — 了解 DOM 结构和 JS 加载顺序
3. `js/config.js` — 理解常量定义
4. `js/util.js` — 理解通用工具函数
5. `js/store.js`（前半部分） — 理解核心数据模型和 `loadAllData`/`saveAllData`
6. `js/app.js` — 理解初始化流程
7. `js/render.js`（前 100 行） — 理解 `renderAll`、`renderQuadrant` 核心渲染
8. `js/quadrant-ops.js` — 理解最常用的 CRUD 操作
9. `js/drag.js` — 理解数据移动系统
10. `js/cloud-sync.js` — 理解同步系统
11. `js/bigtask.js` — 理解最复杂的功能模块
12. `js/future.js` — 理解计划池
13. 其余模块按需阅读
14. `repaired.txt` — 了解历史踩坑记录

---

## 10. 关键设计决策

- **为什么用 `var` 而不是 `let/const`**：保持全局作用域、跨模块引用无 TDZ 问题
- **为什么不使用 ES Module**：兼容 Capacitor WebView 旧版本，避免 `file://` 下 CORS 问题
- **为什么数据全部存一个 `quadrant_task_data` key**：简化同步，一个 JSON 文件包含所有日期
- **为什么备份用轮转**：防止一次错误保存同时破坏主数据和单备份
- **为什么 Cache First 但绕过 API**：静态资源需离线可用，API 响应绝不能缓存
- **为什么 `SyncMerge` 和 `cloud-sync.js` 重复实现合并**：`SyncMerge` 是计划的升级版（LWW + 墓碑），但目前 `cloud-sync.js` 仍用自己的简化合并（本地优先补充云端）
