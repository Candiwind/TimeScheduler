# TimeScheduler 同步可靠性深度重构 + 性能优化 — 实施规格

> 版本：2026-07-11  
> 决策确认：GitHub Gist 后端 / 逐任务 LWW 合并 / 聚焦同步+性能深度重构 / node 测试 + 真实 Token 实测

---

## 一、已确认的致命缺陷（必须修复）

| # | 缺陷 | 位置 | 触发场景 | 严重度 |
|---|------|------|----------|--------|
| 1 | 计划池 key 完全错配：云同步读/写 `quadrant_pool_*`，store.js 实际用 `quadrant_future_tasks` 等 | cloud-sync.js:113,497 ↔ store.js:810-812 | 待办/周/月计划池**永远不同步** | 致命 |
| 2 | 大任务缓存库 key 单复数错配：导入写 `quadrant_big_task_cache`（单数），store.js 读 `quadrant_big_tasks_cache`（复数） | cloud-sync.js:511 ↔ store.js:376 | 归档大任务拉取后**隐形丢失** | 致命 |
| 3 | 每日象限数据整日覆盖：`existing[date] = data.dateData[date]` | cloud-sync.js:481-484 | 同日跨端编辑互相**抹除** | 致命 |
| 4 | 启动时静默 autoPull 覆盖本地未推送修改 | cloud-sync.js:66-68, 539 | 离线编辑后开 App，本地改动被云端旧版覆盖 | 致命 |
| 5 | 诊断阶段用测试负载 PATCH 整个 Gist，真推失败则**云端被毒化** | cloud-sync.js:280-297 | push 诊断写 `{_test:true}`，后续真推失败 → 云端变垃圾 | 致命 |
| 6 | `onDataChanged` 只挂在 `saveDateData`/`saveDateDataDeferred`；大任务/计划池/原则编辑**永远不触发自动推送** | store.js:399-405,412-443,824-830,1162-1165 | 只改大任务里程碑 → 永远不自动上云 | 严重 |
| 7 | 首次配置 Gist 同步立即 `pullFromGist(false)`，用云端覆盖本地 | cloud-sync.js:164,180,188,206,220 | 有本地数据的设备首次连同步 → 本地新数据被旧云端覆盖 | 严重 |
| 8 | 原则导入全量覆盖、无合并 | cloud-sync.js:502-504 | 两端各加一条原则，后拉者只保留自己的 | 严重 |
| 9 | 活跃大任务导入全量覆盖、无合并 | cloud-sync.js:507-509 | 两端各改不同大任务，后拉者覆盖全部 | 严重 |
| 10 | SW 对 JS/CSS 纯 cache-first，手机可能长期跑旧同步代码 | service-worker.js:90-99 | 修完 Bug 但手机 SW 没更新 → "修了等于没修" | 严重 |
| 11 | Gist PATCH 整文件覆盖，无乐观并发/版本检测 | cloud-sync.js:366-374 | 两端同时推送 → 最后写赢，中间数据丢失 | 严重 |
| 12 | 防抖推送定时器为模块内变量，刷新即丢失待推送改动 | cloud-sync.js:548 | 编辑后 3s 内刷新 → 改动未推，紧接着 autoPull 可能覆盖 | 一般 |

---

## 二、性能热点（已量化）

| 热点 | 位置 | 现状 | 优化方向 |
|------|------|------|----------|
| 全量 DOM 重建 + listener 爆炸 | render.js | 每次 renderAll 清空 innerHTML，50 任务 ≈ 1050 个闭包 listener；无事件委托 | 引入 render debounce；减少全量重建；事件委托（二期） |
| `loadAllData` 零缓存 | store.js:15 | 每次调用都 `JSON.parse` 整个历史大对象 | 内存缓存层，读取 O(1) |
| `saveDateData` = 2×parse + 1×stringify + 5×写盘 | store.js:94-102 | 单日改一个 checkbox 都序列化整库 + 轮转 4 份备份 | 写入防抖批处理；备份轮转限频 |
| `renderAll` 滥用为万能刷新 | 全工程 ~50 处调用 | 每次调用跑 4 个 migrate（各解析整库）+ 3 个面板重渲 + 原 renderAll | migrate 按日期短路；renderAll debounce |
| `renderTimeView` 重复 loadDateData | render.js:151 | renderAll L12 已 load，timeView 内部又 load 一次 | 参数传递已加载数据 |
| `updateStatsBar` 多次遍历叶子项 | render.js:1411/1425 | 单次 renderAll 对全部叶子项遍历 ≥3 遍 | 合并为一次遍历 |

---

## 三、分阶段实施计划

### Phase 1：修复同步数据丢失缺陷（关键路径，最先做）

#### 1.1 修复 key 名错配
- **cloud-sync.js `exportAllData`**：计划池读取键改为 `quadrant_future_tasks` / `quadrant_week_tasks` / `quadrant_month_tasks`
- **cloud-sync.js `importAllData`**：计划池写入键同上；大任务缓存写入键改为 `quadrant_big_tasks_cache`（复数）
- **测试**：`test/test-cloudsync-store-keys.js` 验证所有导出/导入键与 store.js 一致

#### 1.2 修复诊断写毒化云端
- `diagnoseGistConnection` **不再 PATCH 写测试负载**到 Gist 主文件
- 改为：直接执行真实 PATCH（带真实数据），失败则在 catch 中回显错误；或先 HEAD 检测连通性
- 如果保留诊断，诊断与真实推送合并为**一次 PATCH**，不在中间写测试数据

#### 1.3 修复首次配置即覆盖本地
- `setupGistSync` 成功连接后，若本地已有数据（`loadAllData` 非空 或 `loadBigTasks` 非空），**不自动 pull**
- 改为 toast 提示："连接成功。云端数据为空 / 有 X 天记录。点击 📥 拉取可合并云端数据。"

#### 1.4 修复 onDataChanged 遗漏
- `saveBigTasks`、`saveBigTaskCache`、`savePlanTasks`、`savePrinciples` 末尾统一调用 `CloudSync.onDataChanged()`
- 加回归测试验证每个 save* 函数都会触发同步回调（通过 mock）

---

### Phase 2：实现可靠合并同步引擎

#### 2.1 数据模型增强（向后兼容）
- 为所有可同步实体添加 `updatedAt: ISOString`：
  - 每日象限：task（含 block 顶层）、subtask、stage
  - 大任务：bigTask、milestone、subtask、stage
  - 计划池：task、subtask（block 内）
  - 原则：principle、priorityProblem
- 删除改为**软删除**：加 `_deleted: true` + `updatedAt`
- 导出格式升级到 `_version: 4`，保留 `_version: 3` 读取兼容（无 `updatedAt` 的旧数据视为极旧）
- 所有 `generateId` 生成的实体在创建时即带 `updatedAt: new Date().toISOString()`

#### 2.2 合并算法（纯函数，node 可测）
新建 `js/sync-merge.js`（在 app.js 之前加载）：

- `mergeArrayById(localArr, remoteArr, opts)`
  - 对本地和远程数组按 `id` 建索引
  - 合并规则：
    - ID 只存在于一端 → 保留
    - ID 两端都存在 → 比较 `updatedAt`，新者赢
    - 一方是 tombstone（`_deleted: true`）且 `updatedAt` 更新 → 删除
    - 都无 `updatedAt`（旧数据）→ 取本地（保守）
  - 递归合并子数组（block.tasks / bigTask.milestones / subtask.stages）

- `mergeDateData(localDateData, remoteDateData)`
  - 对四个象限分别调 `mergeArrayById`
  - block 内子任务递归合并
  - 返回合并后的 dateData

- `mergeAllData(localAll, remoteAll)`
  - 对每个日期调 `mergeDateData`
  - 本地独有日期保留

- `mergeBigTasks(localArr, remoteArr)` / `mergePrinciples(local, remote)` / `mergePlanPools(...)`
  - 同样基于 `mergeArrayById`

- **测试**：`test/test-cloudsync-merge.js`（≥10 个场景）

#### 2.3 推送流程重构（pull-merge-push）
`pushToGist()` 改为：
1. 检查 in-flight 锁，若在进行中则排队（或跳过）
2. 导出本地数据（含 `updatedAt`）
3. **静默拉取**远程 Gist（GET）
4. 若远程有数据：用 merge 函数合并远程到本地（逐集合）
5. 若发生了实质合并 → 保存合并结果 + 重新渲染（避免推送旧覆盖）
6. 将合并后的完整数据 PATCH 到 Gist
7. 更新 `lastSync` 和 `_syncEtag`（取 Gist `history[0].version`）
8. 解锁

- 保留 20s timeout + AbortController
- 失败时 toast/alert，不更新 lastSync

#### 2.4 拉取流程重构（非破坏性合并）
`pullFromGist(silent)` 改为：
1. GET Gist
2. 解析数据（兼容 v3/v4）
3. 对本地每个集合执行 merge（不是覆盖）
4. 保存合并结果（dateData 走 `saveAllData`，其余走对应 save*）
5. 重新渲染
6. 更新 `lastSync`

`autoPullFromGist()` 同样走合并流程（静默）。

**防覆盖策略**：
- `init()` 中，若本地 `lastLocalEdit`（新增跟踪）> `lastSync`，说明本地有未推送改动 → **跳过 autoPull**，改为显示 "⚠️ 本地有未同步改动，点击推送" 提示；或先 push 再 pull。
- 新增 `lastLocalEdit` 跟踪：每次 `saveDateData` / `saveBigTasks` / `savePlanTasks` / `savePrinciples` 时写入 `localStorage.setItem('quadrant_last_local_edit', Date.now())`

#### 2.5 竞态控制
- `var _syncInFlight = false`：推送/拉取期间上锁，新的 push/pull 若冲突则排队一次（或 toast 提示"同步进行中，请稍候"）
- 防抖推送（3s）在触发时检查 `_syncInFlight`，有则把 `_pendingPush = true`，当前同步完成后自动再 push 一次
- `beforeunload` + `visibilitychange`：若 `_pendingPush` 为 true，尝试立即 flush（用同步 XHR 不可行，但可设置 `localStorage.setItem('quadrant_push_needed', '1')`，下次 `init()` 检测到后优先 push）

---

### Phase 3：性能优化

#### 3.1 store.js 内存缓存层
- `var _allDataCache = null; var _allDataCacheDirty = true;`
- `loadAllData()`：若 `!_allDataCacheDirty` 且缓存存在，返回 `_deepClone(_allDataCache)`（或返回引用但要求调用方不修改；为安全返回深拷贝）
- `saveAllData(data)`：写入 localStorage 后，`_allDataCache = _deepClone(data); _allDataCacheDirty = false;`
- 首次加载后缓存即命中，后续读取零 parse 开销

#### 3.2 写入防抖/批处理
- 将 `saveDateDataDeferred` 复活为真正的多日期队列：
  - `_pendingSaves = {}`（按日期索引）
  - `_pendingSaveTimer` = setTimeout 100ms
  - flush 时：一次性 `loadAllData()` → 合并所有 pending 日期 → `saveAllData(all)` → 一次通知云同步
- 或者更稳妥：保留现有 `saveDateData` 调用点，仅在 `saveAllData` 层加 100ms debounce，合并同 tick 的多次写入

#### 3.3 renderAll 优化
- **migrate 短路**：在 `app.js` 的 `renderAll` override 中，增加内存标记 `_migratedToday = {}`（按日期）。若今日已执行过 4 个 migrate，跳过。切日期时清除标记。
- **renderAll debounce**：加 50ms debounce（`_renderTimer`），避免连续操作（如拖拽排序中多次触发）导致多次全量渲染
- **renderTimeView 去重 load**：`renderTimeView` 不再内部调用 `loadDateData`，改由调用方（`renderAll`）传入已加载数据

#### 3.4 备份轮转限频
- `_rotateRollingBackups` 增加：仅当距离上次轮转 > 30 秒时才执行
- 降低高频小操作（快速勾选、拖拽）的备份成本，保留数据安全

#### 3.5 统计计算优化
- `updateStatsBar` 中的 `calcWeightedCompletion` + `calcTimeSlotCompletion` + `calcQuadrantCompletion` 合并为一次 `walkLeafItems` 遍历，同时算出三个指标

---

### Phase 4：Service Worker 与缓存策略

#### 4.1 资源缓存刷新
- `service-worker.js`：`CACHE_VERSION` 升级到 `'v20'`
- `index.html` 中所有 `<script src>` 和 `<link rel="stylesheet">` 加上 `?v=20` 查询参数做缓存刷新
- SW fetch handler：对带 `?v=` 的请求仍正常缓存（cache key 含 query string），确保新资源被新 SW 缓存

#### 4.2 更新检测增强
- 保留 `updatefound` + 3s reload 机制
- 增加：新 SW `postMessage` 发送 `APP_VERSION`，页面收到后若不一致立即 reload（比固定 3s 更可靠）

---

### Phase 5：验证计划

#### 5.1 Node 回归测试（我负责）
- 跑通所有现有 6 个测试
- 新增 `test/test-cloudsync-store-keys.js`：验证所有 localStorage 键导出导入一致
- 新增 `test/test-cloudsync-merge.js`（≥10 个场景）：
  - 手机加任务A，电脑加任务B，合并后两者都在
  - 两端编辑同一任务，updatedAt 新者赢
  - 一端删除任务（tombstone），另一端未改，删除同步
  - 一端删除，另一端在同一任务上更新（updatedAt 比较）
  - 旧版 v3 数据导入兼容性
  - 大任务/计划池/原则的逐 ID 合并
- 新增 `test/test-store-cache.js`：内存缓存正确性（脏标记、深拷贝）
- 新增 `test/test-render-debounce.js`（若可测）：验证 50ms debounce 合并多次 render

#### 5.2 端到端实测（你负责，我提供清单与指导）
- **预置条件**：提供一个 GitHub Gist Token（仅需 gist 权限，可在 github.com/settings/tokens 创建）
- **场景 A（基础同步）**：电脑创建任务 → 手机拉取 → 确认可见
- **场景 B（并发合并）**：手机编辑任务A、电脑编辑任务B（同一天）→ 两端各推拉一次 → 确认 A/B 都在且无丢失
- **场景 C（删除同步）**：手机删除任务 → 电脑拉取 → 确认已删；反之亦然
- **场景 D（离线重连）**：手机断网编辑 → 电脑在线编辑并推送 → 手机联网打开 → 确认合并正确（两端改动都保留）
- **场景 E（非日期数据自动推送）**：只改大任务里程碑 / 只改计划池 / 只改原则 → 确认 3 秒后自动推送触发，电脑能拉到
- **场景 F（SW 更新）**：手机确认加载了新代码（控制台打印 `[云同步] 代码版本` 与电脑一致）

**必须由你亲自完成的环节（不可代劳）**：
1. 创建/提供 GitHub Token（涉及你的私人凭据）
2. 在真实手机浏览器（Safari/Chrome）中打开 PWA、配置 Gist ID、执行推拉操作
3. 观察手机端控制台的版本号与网络请求（需 Safari 开发者工具 或 Chrome 远程调试）
4. 验证离线-重连场景（需手动开关手机飞行模式）

**失误可能造成的高额损失风险**：
- 若用生产 Gist（已有真实备份数据）直接测试，push 失败或合并 Bug 可能**覆盖/损坏云端唯一备份**。
- **缓解**：建议先用一个**全新空 Gist**做测试，确认无误后再切回生产 Gist；或先在电脑端导出 JSON 本地备份。

---

## 四、风险与回退

1. **数据格式 v4 向后兼容**：旧版 App（未更新的手机）仍能读取 v4 的 `_version` 和 `dateData`（只是不理解 `updatedAt`，会把它当普通字段保留，不影响功能）。
2. **Gist 同步故障**：用户始终可禁用同步，数据完全在 localStorage，不受云端影响。
3. **备份轮转保留**：任何写入错误最多损失一次编辑，历史备份仍在。
4. **分阶段回退**：Phase 1 只做 Bug 修复，不改动数据格式，风险最低；Phase 2 才引入 `updatedAt` 和合并引擎；若 Phase 2 出问题，可单独回滚 `cloud-sync.js` 到 Phase 1 版本（修复了 key 错配的基础版）。
5. **建议**：先在测试 Gist 验证 Phase 2 的合并逻辑，确认无误后再用于日常数据。