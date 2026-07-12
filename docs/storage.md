# 数据存储文档 — 四象限任务管理器

> 分析所有数据存储：localStorage 结构、Key 含义、数据模型、读写流程、备份机制。

---

## 1. 数据来源

| 来源 | 说明 |
|------|------|
| 用户输入 | 任务名称、完成状态、进度、截止日期、时段、高亮等 |
| 自动生成 | ID、时间戳、大任务进度计算、自动归档 |
| 云端拉取 | GitHub Gist pull → `importAllData()` 合并到本地 |
| JSON 导入 | 文件或粘贴 → `importAllDataFromJSON()` 合并/覆盖 |
| Markdown 导入 | 文件解析 → 象限数据对象 |
| 迁移 | `migrateFutureTasks`/`migrateWeekTasks`/`migrateMonthTasks`/`migrateBigTaskSubtasks` |
| 自动导入 | `runAutoImportsForDate()` 按星期自动导入置顶缓存 |

---

## 2. localStorage Key 完整清单

### 2.1 核心数据

| Key | 类型 | 说明 | 能否删除 |
|-----|------|------|---------|
| `quadrant_task_data` | `{ "2026-07-11": { I: [...], II: [...], III: [...], IV: [...] }, ... }` | **主数据**。所有日期的四象限任务 | ❌ 不可删除（丢失全部任务数据） |
| `quadrant_task_data_backup` | 同上 | 滚动备份 #0（最新） | ⚠️ 可删除但会失去恢复能力 |
| `quadrant_task_data_backup_1` | 同上 | 滚动备份 #1 | ⚠️ 同上 |
| `quadrant_task_data_backup_2` | 同上 | 滚动备份 #2 | ⚠️ 同上 |
| `quadrant_task_data_backup_3` | 同上 | 滚动备份 #3（最旧） | ⚠️ 同上 |
| `quadrant_schema_version` | `"1"` | 数据架构版本号 | ⚠️ 供未来迁移使用 |

### 2.2 大任务

| Key | 类型 | 说明 | 能否删除 |
|-----|------|------|---------|
| `quadrant_big_tasks` | `[{ id, name, targetDate, description, progress, milestones: [...], ... }]` | 活跃大任务列表（最多 5 个） | ❌ 不可删除（丢失大任务数据） |
| `quadrant_big_tasks_cache` | 同上（已完成归档） | 大任务完成缓存库 | ⚠️ 可删除（丢失历史记录） |
| `quadrant_big_tasks_deleted` | `[{ id, type, data, parentInfo, action, timestamp, pinned }]` | **大任务回收站**（上限 10 条） | ⚠️ 可删除（失去恢复能力） |
| `quadrant_bigtask_autoarchive_v1` | `"1"` | 一次性迁移标记 | 可删除（会重新执行自动归档） |

### 2.3 计划池

| Key | 类型 | 说明 | 能否删除 |
|-----|------|------|---------|
| `quadrant_future_tasks` | `[{ id, type, text, scheduledDate, targetQuadrant, stages?, tasks? }]` | 待办池 | ❌ 不可删除 |
| `quadrant_week_tasks` | 同上 | 本周池 | ❌ 不可删除 |
| `quadrant_month_tasks` | 同上 | 本月池 | ❌ 不可删除 |
| `quadrant_future_tasks_cache` | `[{ id, type, data, parentInfo, action, timestamp, pinned }]` | 待办池回收站（上限 10 条） | ⚠️ 可删除 |
| `quadrant_week_tasks_cache` | 同上 | 本周池回收站 | ⚠️ 可删除 |
| `quadrant_month_tasks_cache` | 同上 | 本月池回收站 | ⚠️ 可删除 |

### 2.4 依循与优先问题

| Key | 类型 | 说明 | 能否删除 |
|-----|------|------|---------|
| `quadrant_principles` | `{ id, startDate, endDate, principles: [{id, text}], priorityProblems: [{id, text}] }` | 依循原则 + 优先问题 | ❌ 不可删除 |
| `quadrant_principles_deleted` | `[{ id, type, data, deletedAt, pinned }]` | 原则回收站（上限 10 条） | ⚠️ 可删除 |
| `quadrant_priority_problems_deleted` | `[{ id, type, data, deletedAt, pinned }]` | 优先问题回收站（上限 10 条） | ⚠️ 可删除 |

### 2.5 缓存日期索引

| Key | 类型 | 说明 | 能否删除 |
|-----|------|------|---------|
| `quadrant_cached_dates_index` | `[{ id, date, label, pinned, cachedAt, autoWorkday, autoSaturday, autoSunday }]` | 用户手动缓存的日期索引（V4 格式） | ⚠️ 可删除（丢失缓存列表，源数据仍在 `quadrant_task_data` 中） |
| `quadrant_auto_import_tracker` | `{ "2026-07-12": { "cache_xxx": true } }` | 自动导入追踪（每个 `(entryId, targetDate)` 对只导一次） | ⚠️ 可删除（会导致已导入的缓存被重新导入） |

### 2.6 UI 状态

| Key | 类型 | 说明 | 能否删除 |
|-----|------|------|---------|
| `quadrant_view_mode` | `"quadrant"` 或 `"time"` | 当前视图模式 | ✅ 可安全删除（默认为 quadrant） |
| `quadrant_theme` | `"light"` 或 `"dark"` | 主题 | ✅ 可安全删除（默认为 light） |
| `quadrant_stages_collapsed` | `{ "taskId_or_pp-stages-ftId": true }` | 阶段折叠状态 | ✅ 可安全删除（默认全部展开） |
| `quadrant_cache_toggle_state` | `{ "bigTaskDeletedCache": true }` | 回收站面板展开/收起状态 | ✅ 可安全删除（默认全部收起） |
| `hint_bar_dismissed` | `"1"` | 提示栏已关闭标记 | ✅ 可安全删除（提示栏重新显示） |

### 2.7 云同步配置

| Key | 类型 | 说明 | 能否删除 |
|-----|------|------|---------|
| `cloudsync_mode` | `"github-gist"` 等 | 当前同步模式 | ⚠️ 可删除（同步禁用） |
| `cloudsync_github_gist_id` | string | GitHub Gist ID | ⚠️ 可删除（需重配同步） |
| `cloudsync_github_gist_token` | string | GitHub Personal Access Token | ⚠️ 可删除（降级为公开只读） |
| `cloudsync_github_gist_desc` | string | Gist 描述信息 | ✅ 可安全删除 |

### 2.8 源码编辑器

| Key | 类型 | 说明 | 能否删除 |
|-----|------|------|---------|
| `source_editor_html` | string | 用户编辑后的 HTML | ✅ 可安全删除 |
| `source_editor_css` | string | 用户编辑后的 CSS | ✅ 可安全删除 |
| `source_editor_js` | string | 用户编辑后的 JS | ✅ 可安全删除 |

---

## 3. 核心数据模型

### 3.1 `quadrant_task_data` — 主数据

```json
{
  "2026-07-11": {
    "I": [
      {
        "id": "id_1752000000000_abc123def",
        "text": "完成报告",
        "completed": false,
        "progress": "100%",
        "dueDate": "2026-07-15",
        "timeSlot": "forenoon",
        "bigTaskRef": { "bigTaskId": "bt_xxx", "subtaskId": "st_yyy", "milestoneId": "ms_zzz" },
        "stages": [
          { "id": "s1", "text": "收集数据", "completed": true, "timeSlot": "forenoon" },
          { "id": "s2", "text": "撰写分析", "completed": false, "timeSlot": "afternoon" }
        ],
        "highlights": [{ "start": 0, "end": 4 }],
        "extraCompleted": false
      },
      {
        "id": "block_xxx",
        "blockName": "项目 A",
        "tasks": [
          { "id": "st_1", "text": "子任务 1", "completed": false, "progress": "100%",
            "timeSlot": "forenoon", "stages": [...], "highlights": [...] }
        ]
      }
    ],
    "II": [ ... ],
    "III": [ ... ],
    "IV": [ ... ],
    "_deferred": 2
  },
  "2026-07-12": { ... }
}
```

**关键字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 全局唯一，`generateId()` 生成（`id_` + 时间戳 + 随机串） |
| `text` | string | 任务文本 |
| `completed` | boolean | 是否完成（勾选） |
| `progress` | string | 完成度下拉选项（`"<50%"` ~ `"100%"`） |
| `dueDate` | string | 截止日期 `YYYY-MM-DD` |
| `timeSlot` | string | 时段 key（`"forenoon"`/`"afternoon"`/`"dusk"` 等） |
| `bigTaskRef` | object | 大任务关联 `{ bigTaskId, subtaskId, milestoneId? }` |
| `stages` | array | 阶段拆分列表 |
| `highlights` | array | 文本高亮区间 `[{ start, end }]` |
| `extraCompleted` | boolean | 超额完成标记 |
| `blockName` | string | 存在此字段 → 该条目是"任务块"（其 `tasks[]` 为块内子任务） |
| `_deferred` | number | 当天推迟任务计数 |

### 3.2 大任务 `quadrant_big_tasks`

```json
[{
  "id": "bt_1752000000000_xyz",
  "name": "学习 React",
  "targetDate": "2026-08-01",
  "description": "掌握 React 核心概念",
  "progress": 60,
  "completedDate": null,
  "suppressAutoArchive": false,
  "milestones": [{
    "id": "ms_1",
    "name": "基础阶段",
    "tasks": [{
      "id": "st_1",
      "text": "学习 JSX",
      "completed": true,
      "timeSlot": "forenoon",
      "plannedDate": "2026-07-12",
      "stages": [
        { "id": "sg_1", "text": "阅读文档", "completed": true, "timeSlot": "forenoon" }
      ]
    }]
  }]
}]
```

### 3.3 计划池条目

```json
{
  "id": "ft_xxx",
  "type": "task",           // "task" | "block"
  "text": "写周报",
  "scheduledDate": "2026-07-15",
  "targetQuadrant": "II",
  "bigTaskRef": { ... },     // 可选，推迟时保留
  "stages": [ ... ],         // 可选
  "blockName": "...",        // type=block 时存在
  "tasks": [ ... ]           // type=block 时存在（子任务列表）
}
```

### 3.4 回收站条目（通用格式）

```json
{
  "id": "原条目ID",
  "type": "task" | "block" | "subtask" | "stage" | "bigtask" | "milestone" | "principle" | "priorityProblem",
  "data": { /* 原条目完整深拷贝 */ },
  "parentInfo": { "ftId": "...", "ftName": "..." },  // 子条目恢复时验证父条目存在
  "action": "deleted" | "completed",
  "timestamp": 1752000000000,
  "pinned": false
}
```

---

## 4. 保存流程

```
saveDateData(date, quadrantData)
  → loadAllData()              // 从 localStorage + 内存缓存读取全部数据
  → all[date] = quadrantData   // 覆盖该日期的四象限数据
  → saveAllData(all)           // 序列化写入
    → JSON.stringify(all)
    → localStorage.setItem("quadrant_task_data", json)
    → _allDataCache 更新       // 内存缓存
    → _rotateRollingBackups(json)  // 轮转备份（限频 30s）
      → backup → backup_1, backup_1 → backup_2, backup_2 → backup_3
      → 新 json → backup
    → localStorage.setItem("quadrant_schema_version", "1")
  → CloudSync.onDataChanged()  // 通知同步模块（触发防抖推送）
```

**限频机制**：备份轮转 30 秒内不重复执行（高频保存跳过备份以提升性能）。

---

## 5. 读取流程

```
loadDateData(date)
  → loadAllData()
    → 检查 _allDataCacheDirty 标记
    → 缓存有效？ → 直接返回 _fastDeepClone(_allDataCache)
    → 缓存失效？
      → localStorage.getItem("quadrant_task_data")
      → JSON.parse(raw)
      → _allDataCache = 解析结果
      → _allDataCacheDirty = false
      → 返回 _fastDeepClone(_allDataCache)
    → 解析失败？
      → 尝试恢复：backup → backup_1 → backup_2 → backup_3
      → 找到有效备份 → 恢复为主数据 → 更新缓存 → 返回
      → 全部失败 → 返回 {}
  → 返回 all[date] || { I: [], II: [], III: [], IV: [] }
```

**关键点**：
- `loadAllData()` 返回的是深拷贝，调用方修改不影响缓存
- 内存缓存避免每次渲染都执行完整 JSON.parse（尤其数据量大时）
- 多标签页通过 `storage` 事件监听失效缓存：其他标签改了数据 → 本标签自动标记 dirty

---

## 6. 更新流程（按粒度）

| 操作 | 函数 | 读 | 写 |
|------|------|----|----|
| 修改单日数据 | `saveDateData` | loadAllData | saveAllData |
| 修改大任务 | `saveBigTasks` | - | localStorage.setItem + CloudSync |
| 修改计划池 | `savePlanTasks` | - | localStorage.setItem + CloudSync |
| 修改依循 | `savePrinciples` | - | localStorage.setItem + CloudSync |
| 修改缓存索引 | `saveCachedDatesIndex` | - | localStorage.setItem |
| 全部覆盖 | `importAllDataFromJSON(merge=false)` | - | saveAllData |
| 合并导入 | `importAllDataFromJSON(merge=true)` | loadAllData | saveAllData |

---

## 7. 备份与恢复机制

### 7.1 滚动备份

```
quadrant_task_data              ← 主数据（每次 saveAllData 写入）
quadrant_task_data_backup       ← 上一次主数据
quadrant_task_data_backup_1     ← 上上次
quadrant_task_data_backup_2     ← 上上上次
quadrant_task_data_backup_3     ← 最旧（最多保留 3 个历史快照）
```

**轮转逻辑**：每次保存时 `backup→backup_1, backup_1→backup_2, backup_2→backup_3, 新 json→backup`。

**恢复逻辑**：主数据 JSON.parse 失败时，按 `backup → backup_1 → backup_2 → backup_3` 顺序尝试，首个成功解析的备份自动恢复为主数据。

**限频**：30 秒内不重复轮转（避免高频保存产生大量无意义备份）。

### 7.2 多标签页同步

```javascript
window.addEventListener('storage', function(e) {
  if (e.key === STORAGE_KEY || e.key === STORAGE_BACKUP_KEY) {
    invalidateDataCache();  // 标记缓存失效，下次读取重新从 localStorage 加载
  }
});
```

### 7.3 存储空间监测

`estimateQuotaPct()` 估算 localStorage 使用率（总字符数 / 5MB），`saveAllData` 写入失败时提示用户清理。

---

## 8. 删除安全指南

### 可以安全删除
- `quadrant_*_cache` 系列 — 回收站数据
- `quadrant_cached_dates_index` — 仅缓存索引，源数据在 `quadrant_task_data` 中
- `quadrant_auto_import_tracker` — 重新导入已删除任务是低风险操作
- 所有 UI 状态 key（`quadrant_view_mode`、`quadrant_theme` 等）
- `source_editor_*` — 编辑器草稿

### 绝对不能手动删除
- `quadrant_task_data` — 全部任务数据
- `quadrant_big_tasks` — 全部大任务数据
- `quadrant_future_tasks` / `quadrant_week_tasks` / `quadrant_month_tasks` — 计划池
- `quadrant_principles` — 依循原则
- 所有 `*_backup*` 备份 — 删除会失去恢复能力

---

## 9. 新增数据存储指南

如果以后需要新增数据：

1. **新 localStorage key**：命名遵循 `quadrant_` 前缀，避免与其他库冲突
2. **现有对象新增字段**：在 `loadXxx()` 函数中添加向后兼容初始化（如 `data.newField = data.newField || defaultValue`）
3. **主数据结构扩展**：在 `quadrant_task_data[date][quadrantKey]` 数组中给条目新增字段，需在 `loadDateData` 返回后做兼容
4. **写入通知**：如果新数据需要同步，在 save 函数中调用 `CloudSync.onDataChanged()`
5. **导出/导入**：在 `cloud-sync.js` 的 `exportAllData()` 和 `importAllData()` 中添加对应字段
