# 数据流文档 — 四象限任务管理器

> 使用 Mermaid 描述整个项目的数据流，涵盖用户操作到持久化到云端的完整链路。

---

## 1. 顶层数据流

```mermaid
flowchart TD
    User[👤 用户操作]
    UI[🎨 UI 交互层<br/>click / drag / keydown]
    Biz[📦 业务逻辑层<br/>quadrant-ops / bigtask / future / drag / defer]
    Store[💾 数据层 store.js<br/>loadDateData / saveDateData / loadBigTasks / ...]
    LS[(localStorage<br/>quadrant_task_data + 20+ keys)]
    Sync[☁️ 同步模块 cloud-sync.js<br/>exportAllData / importAllData]
    Gist[(GitHub Gist<br/>quadrant_tasks_backup.json)]
    Render[🖼️ 渲染层 render.js<br/>renderAll / renderQuadrant / renderQuadrantOnly]
    DOM[📄 DOM]

    User -->|点击/拖拽/快捷键| UI
    UI -->|调用函数| Biz
    Biz -->|读写数据| Store
    Store -->|序列化/反序列化| LS
    Store -->|onDataChanged| Sync
    Sync -->|PATCH / GET| Gist
    Gist -->|JSON 响应| Sync
    Sync -->|importAllData 合并| Store
    Biz -->|renderAll / renderQuadrantOnly| Render
    Render -->|createElement / innerHTML| DOM
```

---

## 2. 初始化数据流

```mermaid
sequenceDiagram
    participant Browser as 浏览器
    participant SW as Service Worker
    participant App as app.js initApp()
    participant Store as store.js
    participant LS as localStorage
    participant Sync as cloud-sync.js
    participant Render as render.js
    participant DOM as DOM

    Browser->>SW: 请求 index.html
    SW-->>Browser: 缓存命中 → 返回 (Stale-While-Revalidate)

    Browser->>App: DOMContentLoaded → initApp()
    App->>Sync: CloudSync.init()
    Sync->>Store: loadAllData() ← 恢复同步配置
    Sync->>Sync: autoPullFromGist() (静默)
    Sync->>Sync: startPeriodicPull() (60s 定时)

    App->>App: loadTheme() / setupButtons() / setup*()

    App->>Store: migrateFutureTasks(today)
    Store->>LS: loadPlanTasks("quadrant_future_tasks")
    Store->>LS: loadDateData(today)
    Store->>LS: saveDateData(today, merged)

    App->>Store: migrateWeekTasks / migrateMonthTasks

    App->>Render: renderAll(today)
    Render->>Store: loadDateData(today)
    Store->>LS: getItem("quadrant_task_data")
    LS-->>Store: JSON string
    Store->>Store: JSON.parse + 内存缓存
    Store-->>Render: { I: [...], II: [...], III: [...], IV: [...] }
    Render->>DOM: 创建象限 DOM 元素
    DOM-->>Browser: 首次渲染完成
```

---

## 3. 用户添加任务数据流

```mermaid
sequenceDiagram
    participant User as 👤 用户
    participant DOM as DOM (quadrant-I)
    participant Ops as quadrant-ops.js
    participant Store as store.js
    participant LS as localStorage
    participant Sync as cloud-sync.js
    participant Render as render.js

    User->>DOM: 点击 "＋" 按钮 (quadrant-I)
    DOM->>Ops: addTask('I')
    Ops->>Ops: var text = prompt('输入任务名称')
    Ops->>Ops: var task = { id: generateId(), text, completed: false, timeSlot: getDefaultTimeSlot() }
    Ops->>Store: loadDateData(currentDate)
    Store->>LS: getItem("quadrant_task_data")
    LS-->>Store: JSON
    Store-->>Ops: data = { I: [task, ...], II: [...], ... }
    Ops->>Ops: data['I'].push(task)
    Ops->>Store: saveDateData(currentDate, data)
    Store->>LS: setItem("quadrant_task_data", JSON)
    Store->>Store: 更新 _allDataCache
    Store->>Store: _rotateRollingBackups(json)
    Store->>Sync: CloudSync.onDataChanged()
    Sync->>Sync: debouncePushToGist() (3s 防抖)
    Ops->>Render: renderQuadrantOnly('I')
    Render->>Store: loadDateData(currentDate) ← 缓存命中
    Render->>DOM: 重新创建象限 I 的 DOM
    DOM-->>User: 新任务出现在象限 I

    Note over Sync: 3 秒后...
    Sync->>Sync: pushToGist()
    Sync->>Sync: exportAllData() → JSON
    Sync->>Sync: PATCH api.github.com/gists/{id}
```

---

## 4. 拖拽任务数据流（跨象限）

```mermaid
sequenceDiagram
    participant User as 👤 用户
    participant Drag as drag.js
    participant Store as store.js
    participant LS as localStorage
    participant Render as render.js

    User->>Drag: dragstart (任务 A，象限 I)
    Drag->>Drag: draggedItem = el, dragSourceQuadrant = 'I'

    User->>Drag: dragover (象限 III)
    Drag->>Drag: 显示放置指示器

    User->>Drag: drop (象限 III，位置 2)
    Drag->>Drag: handleQuadrantDrop(e)
    Drag->>Drag: moveTaskAt('I', taskId, 'III', 2)
    Drag->>Store: loadDateData(currentDate)
    Store-->>Drag: data
    Drag->>Drag: 从 data['I'] 中 splice 任务 A
    Drag->>Drag: 插入 data['III'][2]
    Drag->>Store: saveDateData(currentDate, data)
    Store->>LS: setItem("quadrant_task_data", JSON)
    Store->>Sync: CloudSync.onDataChanged()
    Drag->>Render: renderAll(currentDate) (或 quadOnly)
    Render->>DOM: 任务 A 出现在象限 III，从象限 I 消失
```

---

## 5. 云同步完整数据流

```mermaid
flowchart TD
    subgraph Push[推送流程]
        P1[saveDateData 等] --> P2[CloudSync.onDataChanged]
        P2 --> P3[debouncePushToGist<br/>3秒防抖]
        P3 --> P4[diagnoseGistConnection<br/>配置/网络/读/写四步诊断]
        P4 -->|ok| P5[exportAllData<br/>组装完整 JSON]
        P5 --> P6[PATCH api.github.com/gists]
        P6 -->|200| P7[更新 lastPush 时间]
        P6 -->|error| P8[setSyncIcon error<br/>3s后恢复]
    end

    subgraph Pull[拉取流程]
        L1[定时/启动/手动/可见性恢复] --> L2[GET api.github.com/gists<br/>cache: no-cache]
        L2 -->|200| L3[解析 JSON]
        L3 --> L4{_version 字段?}
        L4 -->|有| L5[importAllData<br/>按集合逐条合并]
        L4 -->|无| L6[拒绝导入<br/>标记 _lastAutoPullError]
        L5 --> L7[refreshAllViews<br/>renderAll + 全部面板]
        L2 -->|error| L8{attempt < 2?}
        L8 -->|是| L9[延迟重试<br/>2s→4s 指数退避]
        L9 --> L2
        L8 -->|否| L10[setSyncIcon warning]
    end

    subgraph Merge[合并策略 - importAllData]
        M1[dateData] --> M1a[按象限按 ID 合并<br/>本地优先，云端补充]
        M2[bigTasks] --> M2a[按 ID 合并]
        M3[计划池] --> M3a[按 ID 合并]
        M4[principles] --> M4a[按 ID 合并]
        M5[cachedDatesIndex] --> M5a[并集去重]
    end

    L5 --> Merge
```

---

## 6. 大任务完成 → 自动归档数据流

```mermaid
sequenceDiagram
    participant User as 👤 用户
    participant BT as bigtask.js
    participant Store as store.js
    participant LS as localStorage

    User->>BT: 勾选大任务最后一个子任务
    BT->>Store: toggleBigSubtaskComplete(btId, stId, true)
    Store->>LS: loadBigTasks()
    Store->>Store: 找到子任务 → t.completed = true
    Store->>Store: recalcBigTaskProgress(bt)
    Store->>Store: progress = 100, completedDate = today
    Store->>Store: saveBigTasks(tasks)
    Store->>Store: progress >= 100 → 移入 toArchive
    Store->>LS: loadBigTaskCache()
    Store->>Store: 检查缓存中是否已存在 → 不存在则添加
    Store->>LS: saveBigTaskCache(cache)
    Store->>LS: saveBigTasks(active) ← 仅保留活跃任务
    Store->>Sync: CloudSync.onDataChanged()
    BT->>BT: renderBigTaskPanel()
    BT->>BT: flushArchiveToasts()
    BT->>Toast: Toast.show("大任务已自动归档")
```

---

## 7. 计划池 → 今日 Q-II 迁移数据流

```mermaid
sequenceDiagram
    participant App as app.js
    participant Store as store.js
    participant LS as localStorage

    App->>Store: migrateFutureTasks(today)
    Store->>LS: loadPlanTasks("quadrant_future_tasks")
    Store->>LS: loadDateData(today)
    Store->>Store: 遍历池任务
    Store->>Store: ft.scheduledDate === today → 匹配
    Store->>Store: 创建新任务 { id, text, timeSlot }
    Store->>Store: data[ft.targetQuadrant].push(newTask)
    Store->>Store: remaining.push(ft) ← 未匹配的保留在池中
    Store->>LS: saveDateData(today, data)
    Store->>LS: savePlanTasks("quadrant_future_tasks", remaining)
```

---

## 8. 搜索过滤数据流

```mermaid
sequenceDiagram
    participant User as 👤 用户
    participant App as app.js
    participant Render as render.js
    participant DOM as DOM

    User->>DOM: 在搜索框输入关键词
    DOM->>App: input 事件 → 150ms 防抖
    App->>App: setSearchTerm(term)
    App->>Render: renderAll(currentDate) (或 filterItems)
    Render->>Render: filterItems(items, term.toLowerCase())
    Render->>Render: 递归匹配 text / blockName / tasks[].text / stages[].text
    Render->>DOM: 只渲染匹配的条目
    App->>App: updateSearchResult() → 更新计数显示
```

---

## 9. 批量删除数据流

```mermaid
sequenceDiagram
    participant User as 👤 用户
    participant Batch as batch-delete.js
    participant Store as store.js
    participant Render as render.js

    User->>Batch: 点击 "🗑️ 批删" (quadrant-I)
    Batch->>Batch: enterQuadrantBatchMode('I')
    Batch->>DOM: 每行添加 checkbox，底部出现工具栏

    User->>Batch: 勾选 3 个任务 + 1 个阶段
    User->>Batch: 点击 "删除选中 (4)"
    Batch->>Batch: batchExecuteDelete()
    Batch->>Batch: 解析 batch-key → 分组
    Batch->>Store: loadDateData(currentDate)
    Batch->>Batch: splice 移除选中条目
    Batch->>Batch: _unlinkBigTaskRefSafe(条目) ← 清理大任务关联
    Batch->>Store: saveDateData(currentDate, data)
    Batch->>Batch: exitBatchMode()
    Batch->>Toast: Toast.show("已删除 4 项")
    Batch->>Render: renderAll(currentDate)
```

---

## 10. JSON 跨设备导入数据流

```mermaid
sequenceDiagram
    participant PC as 💻 电脑端
    participant User as 👤 用户
    participant Phone as 📱 手机端
    participant Store as store.js
    participant LS as localStorage

    PC->>PC: 点击 "📦 导出JSON"
    PC->>PC: exportAllDataAsJSON()
    PC->>PC: showJsonExportModal(json) ← 弹出可复制文本
    User->>User: 复制 JSON 文本 → 发送到手机

    Phone->>Phone: 点击 "📥 导入JSON"
    Phone->>Phone: showJsonImportModal()
    Phone->>Phone: 粘贴 JSON → 点击 "合并导入"
    Phone->>Store: importAllDataFromJSON(json, merge=true)
    Store->>LS: loadAllData() → current
    Store->>Store: Object.keys(imported).forEach → current[date] = imported[date]
    Store->>LS: saveAllData(current)
    Phone->>Phone: renderAll(currentDate) → 数据合并完成
```
