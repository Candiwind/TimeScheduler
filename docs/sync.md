# 云同步系统文档 — 四象限任务管理器

> **这是项目最高风险区域。** 任何修改都可能导致多端数据不一致或丢失。
> 修改同步相关代码前，必须完整阅读本文档并跑通 `test/test-cloudsync-merge.js` 和 `test/test-cloudsync-store-keys.js`。

---

## 1. 同步架构概览

```
┌──────────┐         ┌──────────────┐         ┌──────────┐
│  桌面端   │ ←──→  │ GitHub Gist  │  ←──→  │  手机端   │
│ (浏览器)  │  PUSH  │  (云端存储)   │  PULL  │ (PWA/App) │
└──────────┘         └──────────────┘         └──────────┘
      ↑                      ↑                      ↑
   localStorage          JSON File             localStorage
   _allDataCache      quadrant_tasks_          _allDataCache
                       backup.json
```

**核心机制**：所有数据打包为一个 JSON 文件，通过 GitHub Gist API 上传/下载。两端各自合并到本地 localStorage。

---

## 2. 数据导出格式（`exportAllData()`）

```json
{
  "_version": "2026-07-12-fix-sw-api-cache",
  "dateData": {
    "2026-07-11": { "I": [...], "II": [...], "III": [...], "IV": [...] },
    "2026-07-12": { ... }
  },
  "bigTasks": [ { "id": "bt_1", "milestones": [...] } ],
  "bigTaskCache": [ ... ],
  "principles": { "principles": [...], "priorityProblems": [...] },
  "futureTasks": [ ... ],
  "weekTasks": [ ... ],
  "monthTasks": [ ... ],
  "cachedDatesIndex": [ ... ]
}
```

`_version` 字段用于校验数据有效性（缺失则 `importAllData` 拒绝导入）。

---

## 3. 上传（Push）何时发生

### 3.1 触发条件

| 触发方式 | 时机 | 延迟 |
|----------|------|------|
| 自动推送 | `CloudSync.onDataChanged()` 被调用（store.js 每次 save 后触发） | **3 秒防抖** |
| 手动推送 | 用户在同步设置对话框点击"推送"按钮 | 立即 |

### 3.2 自动推送流程

```
用户编辑任务 → saveDateData()
  → CloudSync.onDataChanged()
    → debouncePushToGist()
      → 清除上次定时器
      → 设置 3s 定时器
        → pushToGist()
```

**防抖机制**：3 秒内多次 save 只触发一次推送，避免高频 Gist API 调用。

### 3.3 推送执行流程（`pushToGist()`）

```
1. diagnoseGistConnection(callback)
   ├── 检查 syncInfo 配置（Gist ID / Token）
   ├── 网络连通性诊断（testGistConnection → GET gist）
   ├── 读权限验证
   └── 写权限验证（PATCH _sync_test_.json → 测试文件）
   → callback("ok")
2. 构造 payload:
   - files["quadrant_tasks_backup.json"] = { content: exportAllData() }
   - files["_sync_test_.json"] = null  // 清理测试文件
3. PATCH https://api.github.com/gists/{gistId}
   - Headers: Authorization: Bearer {token}, cache: no-cache
   - AbortController 20s 超时
4. 成功 → setSyncIcon('idle') → 记录 lastPush
5. 失败 → setSyncIcon('error', msg) → 3s 后恢复
```

**诊断阶段独立测试文件**：使用 `_sync_test_.json` 而非正式文件名，防止测试数据覆盖云端数据（历史 Bug：诊断时用正式文件名写入 `{_test:true}`，推送失败后 Gist 残留无效数据）。

---

## 4. 下载（Pull）何时发生

### 4.1 触发条件

| 触发方式 | 时机 | 模式 |
|----------|------|------|
| 启动自动拉取 | `CloudSync.init()` → `autoPullFromGist()` | 静默（silent=true） |
| 定时拉取 | 每 60 秒 `setInterval` | 静默（silent=true） |
| 可见性恢复 | `visibilitychange` 事件：hidden→visible | 静默（silent=true） |
| 手动拉取 | 用户在同步设置对话框点击"拉取"按钮 | 非静默（显示结果） |
| 连接成功后 | `setupGistSync` 连接 Gist 成功 → `onConnectSuccess()` | 非静默 |

### 4.2 自动拉取重试机制

```
autoPullFromGist()
  → _autoPullWithRetry(attempt=0)
    → pullFromGist(true)
      ┌─ 成功 → 刷新视图
      ├─ _lastAutoPullError = true（数据无效）
      │   → 若 attempt < 2 → 延迟重试
      └─ 网络错误
          → 若 attempt < 2 → 延迟重试
```

**重试策略**：最多 2 次，指数退避 `(attempt+1) × 2000ms`（即 2s → 4s）。

### 4.3 定时拉取与可见性

```
startPeriodicPull()
  → _periodicTimer = setInterval(pullFromGist(true), 60000)
  → document.addEventListener('visibilitychange', _onVisibilityChange)

页面隐藏（切到后台/锁屏）：
  → clearInterval(_periodicTimer)  // 暂停定时，省电省流量

页面恢复可见：
  → pullFromGist(true)             // 立即拉取一次
  → 重新 setInterval               // 恢复定时
```

### 4.4 静默模式 vs 非静默模式

| 行为 | silent=true | silent=false |
|------|-------------|--------------|
| 显示合并统计 toast | ❌ 不显示 | ✅ 显示 |
| 网络错误 toast | ⚠️ 闪烁图标 3s | ✅ 弹窗 |
| 数据无效 toast | ⚠️ 闪烁图标 3s | ✅ 弹窗 |

---

## 5. 合并策略（`importAllData()`）

> **核心原则：本地优先，云端补充。不覆盖本地已有的数据。**

### 5.1 逐集合合并规则

| 数据集 | 策略 | 详细说明 |
|--------|------|----------|
| dateData（象限任务） | **按 ID 合并** | 本地任务保留不变；云端任务若 ID 不在本地 → 追加到对应日期/象限 |
| futureTasks / weekTasks / monthTasks | **按 ID 合并** | 同上，按条目 ID 去重 |
| bigTasks（大任务活跃列表） | **按 ID 合并** | 同上 |
| bigTaskCache（大任务缓存库） | **按 ID 合并** | 同上（去重：不在本地缓存中的云端条目才追加） |
| principles（依循原则） | **按 ID 合并** | principles 数组 + priorityProblems 数组分别按 ID 合并 |
| cachedDatesIndex（缓存索引） | **并集** | 两端日期的 Set Union，排序 |

### 5.2 合并代码逻辑（简化版）

```javascript
// 以 dateData 为例：
Object.keys(data.dateData).forEach(function(date) {
  var local = existing[date] || { I: [], II: [], III: [], IV: [] };
  var cloud = data.dateData[date];
  ['I', 'II', 'III', 'IV'].forEach(function(qk) {
    // 收集本地已有 ID
    var localIds = {};
    local[qk].forEach(function(t) {
      localIds[t.id] = true;
      if (t.tasks) t.tasks.forEach(function(st) { localIds[st.id] = true; });
    });
    // 追加云端不在本地的条目
    cloud[qk].forEach(function(ct) {
      if (!localIds[ct.id]) { local[qk].push(ct); }
    });
  });
  existing[date] = local;
});
```

### 5.3 哪些情况保留本地

- 本地有的条目（按 ID 匹配）**永不覆盖** — 本地编辑总是胜出
- 本地删除的条目不会被云端复活（云端条目 ID 本地不存在时才追加，不是恢复）

### 5.4 哪些情况保留云端

- 云端有而本地没有的条目（新条目）→ 追加到本地
- 云端有而本地没有的整个日期 → 新增日期

### 5.5 哪些情况覆盖本地

- **不会覆盖**。当前合并策略完全以本地为主（Local-Wins）。
- 唯一的"覆盖"发生在 `importAllDataFromJSON(json, merge=false)` — 用户选择覆盖导入时，整个 `quadrant_task_data` 被替换。

---

## 6. 备用合并引擎：`SyncMerge`（LWW）

`js/sync-merge.js` 提供了一套更复杂的 **Last-Write-Wins** 合并引擎，支持：

- 逐条目按 `updatedAt` 时间戳比较（新者胜出）
- **墓碑（Tombstone）机制**：标记 `_deleted: true` 的条目在合并时被删除（而非复活）
- **递归合并**：子任务（`tasks[]`）、阶段（`stages[]`）、里程碑（`milestones[]`）逐层合并
- **纯函数设计**：浏览器/Node 通用，可独立测试（25 个测试用例）

> ⚠️ **当前状态**：`SyncMerge` 已加载但 `cloud-sync.js` **未使用它**，仍用自己的简化合并。
> 这是未来的升级方向，如需启用，需要：
> 1. 在所有写入操作中添加 `updatedAt` 时间戳
> 2. 替换 `importAllData` 中的合并逻辑为 `SyncMerge.mergeAllDateData`
> 3. 全面测试两端同时编辑的冲突场景

---

## 7. 同步设置对话框

`openSyncSettings()` 创建的模态框包含：

- **GitHub Gist 配置区**：
  - Gist ID 输入框
  - Token 输入框（可选，公开 Gist 免 Token 可拉取）
  - 连接 / 推送 / 拉取 / 禁用 四个按钮
  - 连接状态指示器
- **状态显示**：上次推送/拉取时间、数据大小

---

## 8. GitHub Pages 环境注意事项

### 8.1 关键问题

GitHub Pages 站点（`https://candiwind.github.io/TimeScheduler/`）访问 Gist API 时有以下特殊性：

1. **Service Worker 缓存陷阱（已修复）**：
   - 原始 SW 使用 Cache First 策略，所有 GET 请求（包括 api.github.com）被缓存
   - 第一次 API 调用成功后，后续永远返回缓存的旧数据
   - **修复**：SW `fetch` handler 中 `api.github.com` 直接 bypass → `fetch(event.request)`

2. **缓存版本号同步（已修复）**：
   - 改了 JS/CSS 代码但忘记升级 `index.html` 的 `?v=N` 和 SW 的 `CACHE_VERSION`
   - 用户永远拿不到修复代码（SW 返回旧版本）
   - **规则**：每次改代码 → 同步升级 `?v=N` 全部 `<script>` + SW `CACHE_VERSION`

3. **`cache: 'no-cache'` 双重保险**：
   - 所有 Gist GET 请求添加 `cache: 'no-cache'`，即使 SW 绕过失效也能保证不走浏览器缓存

### 8.2 GitHub Pages 部署机制

- `https://candiwind.github.io/TimeScheduler/` 直接从 main 分支根目录部署
- **任何 push 到 main 都会立即生效到线上**
- ⚠️ 推送前确保代码无严重 Bug（因为 GitHub Pages 用户立刻受影响）

---

## 9. 手机端与电脑端同步流程

### 9.1 电脑端 → 手机端

```
电脑端编辑 → saveDateData → CloudSync.onDataChanged()
  → 3s 防抖 → pushToGist() → PATCH Gist

手机端打开页面 → initApp → autoPullFromGist()
  → GET Gist → importAllData() → 合并到手机 localStorage
  → renderAll → 显示合并后数据

手机端持续使用 → 每 60s 自动拉取（或页面恢复可见时）
```

### 9.2 手机端 → 电脑端

```
手机端编辑 → saveDateData → CloudSync.onDataChanged()
  → 3s 防抖 → pushToGist() → PATCH Gist

电脑端可见时 → 每 60s 自动拉取 GET Gist
  → importAllData() → 合并到电脑 localStorage
  → renderAll → 显示合并后数据
```

### 9.3 Capacitor App 特殊路径

```
App 导出：exportAllDataAsJSON()
  → Filesystem.writeFile(Documents/quadrant_tasks_backup.json)
  → 同时写入日期文件名和固定 SYNC_FILENAME

App 启动：autoSyncFromDevice()
  → Filesystem.readFile(Documents/quadrant_tasks_backup.json)
  → 检测到更多日期 → 询问用户是否导入
```

---

## 10. 历史踩坑记录

> 详见 `repaired.txt` 中所有同步相关条目（#29–31 V1.6 + #35–59 同步重构 + #72 手机端修复）。

| # | 问题 | 根因 | 修复 | 严重程度 |
|----|------|------|------|----------|
| 1 | 计划池数据导不出 | `exportAllData` 读 key 从 `quadrant_pool_*` 改为 `quadrant_*_tasks`（拼写不匹配 store.js） | 修正 key 名 | 🔴 致命 |
| 2 | 大任务缓存导入失效 | `importAllData` 写 key `quadrant_big_task_cache` 单数 vs store.js 复数 | 修正为复数 | 🔴 致命 |
| 3 | 诊断覆盖正式数据 | `diagnoseGistConnection` 拿正式文件做读写测试 | 改用 `_sync_test_.json` | 🔴 致命 |
| 4 | 静默失败无感知 | `autoPullFromGist` 错误仅 console.error | 静默模式也闪烁 ⚠️ 图标 | 🟡 中等 |
| 5 | 无重试机制 | 自动拉取失败不重试 | 2 次指数退避重试 | 🟡 中等 |
| 6 | SW 缓存 API 响应 | Cache First 策略缓存 api.github.com | bypass SW + no-cache | 🔴 致命 |
| 7 | 拉取覆盖本地数据 | `importAllData` 全量覆盖 | 改为按 ID 合并（本地优先） | 🔴 致命 |
| 8 | 桌面端从不拉取 | 无定时拉取机制 | 60s 定时 + visibility 切换 | 🔴 致命 |
| 9 | 连接成功不自动拉取 | `setupGistSync` 连上后不拉数据 | `onConnectSuccess` → 立即 pull | 🟡 中等 |
| 10 | Capacitor 导出文件名不匹配 | 导出用日期名，读取用固定名 | 同时写入两个文件名 | 🟡 中等 |
| 11 | 缓存版本号不同步 | 改代码不升级 `?v=N` | 规则：同步升级所有版本号 | 🔴 致命 |

---

## 11. 哪些逻辑不要轻易修改

| 逻辑 | 理由 |
|------|------|
| `exportAllData()` 的 JSON 结构 | 云端已有历史数据，改结构导致旧版本无法读取 |
| `importAllData()` 的合并策略 | 当前"本地优先"是用户期望的行为；改为"云端覆盖"会丢失本地编辑 |
| `pushToGist()` 的诊断流程 | 写权限验证用独立测试文件，改回用正式文件会导致数据损坏 |
| `pullFromGist()` 的 `cache: 'no-cache'` | 去掉可能导致浏览器缓存旧响应 |
| SW 的 `api.github.com` 绕过 | 去掉会导致同步永久失效 |
| `_autoPullWithRetry` 的重试次数 | 减少可能导致同步失败不恢复；增加可能导致 API 限流 |
| 定时拉取间隔（60s） | 太短导致 API 限流，太长导致同步延迟 |
| `_version` 校验 | 去掉可能导致无效数据覆盖本地 |

---

## 12. 调试与诊断

### 12.1 诊断工具

`diagnoseGistConnection(callback)` — 四步诊断：
1. 配置检查（Gist ID 是否已设置）
2. 网络连通性（`testGistConnection` → GET gist → 返回 true/false）
3. 读权限（GET gist → 检查响应）
4. 写权限（PATCH `_sync_test_.json`）

诊断通过后返回 `"ok"`，失败返回详细错误描述和排查建议。

### 12.2 手动测试

```bash
# 测试合并引擎
node test/test-cloudsync-merge.js

# 测试 store key 一致性
node test/test-cloudsync-store-keys.js
```
