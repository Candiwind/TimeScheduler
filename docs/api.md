# API 文档 — 四象限任务管理器

> 项目使用的所有外部 API 和接口文档。

---

## 1. GitHub Gist API

### 1.1 用途

云同步的核心——所有任务数据以一个 JSON 文件的形式存储在 GitHub Gist 中，支持双向读写。

### 1.2 API 端点

| 方法 | 端点 | 用途 |
|------|------|------|
| `GET` | `https://api.github.com/gists/{gist_id}` | 获取 Gist 元数据和文件内容 |
| `PATCH` | `https://api.github.com/gists/{gist_id}` | 更新 Gist 文件内容 |

---

### 1.3 获取 Gist（Pull）

**请求：**
```http
GET /gists/{gist_id} HTTP/1.1
Host: api.github.com
Accept: application/vnd.github.v3+json
Cache-Control: no-cache
Authorization: Bearer {token}    <!-- 可选：私有 Gist 必需 -->
```

**响应（200 OK）：**
```json
{
  "id": "abc123...",
  "files": {
    "quadrant_tasks_backup.json": {
      "filename": "quadrant_tasks_backup.json",
      "content": "{\"_version\":\"...\",\"dateData\":{...}}",
      "size": 12345
    }
  }
}
```

**错误处理：**

| 状态码 | 含义 | 处理方式 |
|--------|------|----------|
| 200 | 成功 | 解析 `files["quadrant_tasks_backup.json"].content` → `JSON.parse` → `importAllData` |
| 401 | Token 无效 | 提示用户重新输入 Token |
| 404 | Gist 不存在 | 提示用户检查 Gist ID |
| 403 | 限流 / 权限不足 | 提示稍后重试；公开 Gist 无需 Token 可拉取 |
| 网络错误 | 超时 / 断网 | 静默模式：闪烁 ⚠️ 图标；非静默：弹窗提示 |

**超时**：20 秒（通过 `AbortController` + `setTimeout` 实现）

**重试**：自动拉取失败时最多重试 2 次（`_autoPullWithRetry`），指数退避 2s → 4s

**特殊 Header**：
- `cache: 'no-cache'` — 防止浏览器/Service Worker 缓存 API 响应（双重保险）

---

### 1.4 更新 Gist（Push）

**请求：**
```http
PATCH /gists/{gist_id} HTTP/1.1
Host: api.github.com
Accept: application/vnd.github.v3+json
Authorization: Bearer {token}
Content-Type: application/json

{
  "files": {
    "quadrant_tasks_backup.json": {
      "content": "{...完整的 exportAllData() JSON...}"
    },
    "_sync_test_.json": null
  }
}
```

**`_sync_test_.json: null`** — 推送时清理诊断阶段创建的测试文件。

**响应（200 OK）：**
```json
{
  "id": "abc123...",
  "updated_at": "2026-07-12T10:30:00Z",
  "files": { ... }
}
```

**错误处理：**

| 状态码 | 含义 | 处理方式 |
|--------|------|----------|
| 200 | 成功 | 更新 `lastPush` 时间戳 |
| 401 | Token 无效或无写权限 | 提示用户检查 Token（公开 Gist 无法推送） |
| 403 | 限流 | 提示稍后重试 |
| 404 | Gist 不存在 | 提示用户检查 Gist ID |
| 422 | 校验失败 | 记录错误日志 |

**超时**：20 秒

**推送前诊断**（`diagnoseGistConnection`）：
1. 配置检查（Gist ID 存在？）
2. 网络连通性（GET gist → 是否可达）
3. 读权限（检查响应 status）
4. 写权限（PATCH `_sync_test_.json` 测试写入 → 验证成功）

**注意**：测试文件 `_sync_test_.json` 在诊断结束后不自动清理，而是在**下次真实推送**时通过 `"files": {"_sync_test_.json": null}` 移除。

---

### 1.5 Token 管理

- **Token 类型**：GitHub Personal Access Token（classic）
- **权限要求**：`gist` scope（读写 Gist）
- **存储位置**：`localStorage` key `cloudsync_github_gist_token`
- **安全说明**：
  - Token 明文存储在 localStorage（前端限制无法加密）
  - 建议使用专用 Token，仅授予 `gist` 权限
  - 公开 Gist **无需 Token 即可读取**（只读模式）
  - 无 Token 时无法推送（写操作需要认证）

### 1.6 限流

- **GitHub API 限制**：未认证 60 次/小时，已认证 5000 次/小时
- **项目防抖**：推送 3 秒防抖，避免高频 PATCH
- **拉取间隔**：60 秒定时 + 页面隐藏时暂停（减少不必要的请求）
- **Token 推荐**：始终使用 Token 以避免限流（即使公开 Gist）

---

## 2. Service Worker API

### 2.1 缓存策略

| 资源类型 | 策略 | 说明 |
|----------|------|------|
| HTML/CSS/JS（静态资源） | Cache First + Stale-While-Revalidate | 缓存命中立即返回，后台更新 |
| `api.github.com` | Network Only（绕过 SW） | 永不缓存 API 响应 |
| 其他 GET 请求 | Cache First + Network Fallback | 缓存命中返回，未命中请求网络并缓存 |

### 2.2 缓存版本管理

- 版本号：`CACHE_VERSION = 'v19'`（定义在 `service-worker.js`）
- 缓存名：`quadrant-tasks-v19`
- 更新流程：修改 `CACHE_VERSION` → 新 SW 安装 → `skipWaiting()` → 激活时清旧缓存 → `clients.claim()`
- **强制规则**：修改任何 JS/CSS 内容后，**必须同步升级**：
  - `service-worker.js` 的 `CACHE_VERSION`
  - `index.html` 中所有 `<script src="...?v=N">` 和 `<link href="...?v=N">`

---

## 3. Web App Manifest

**文件**：`manifest.json`

```json
{
  "name": "四象限任务管理器",
  "short_name": "任务管理",
  "start_url": ".",
  "display": "standalone",
  "background_color": "#f0f2f5",
  "theme_color": "#4a90d9",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

---

## 4. Capacitor Filesystem API（原生 App）

### 4.1 用途

在 Capacitor 打包的原生 App 中，通过设备文件系统实现数据导出/导入/自动同步。

### 4.2 导出

```javascript
Capacitor.Plugins.Filesystem.writeFile({
  path: 'Documents/quadrant_tasks_backup.json',
  data: jsonString,
  directory: 'DOCUMENTS'
})
```

同时写入两个文件：
- `quadrant_tasks_backup_{YYYY-MM-DD}.json` — 用户可识别的日期文件名
- `quadrant_tasks_backup.json` — 固定文件名（`autoSyncFromDevice` 读取）

### 4.3 自动同步（启动时）

```javascript
Capacitor.Plugins.Filesystem.readFile({
  path: 'Documents/quadrant_tasks_backup.json',
  directory: 'DOCUMENTS'
})
```

- 仅在导入数据比本地多时才提示（`Object.keys(imported).length > Object.keys(current).length`）
- 合并导入（不覆盖本地）

### 4.4 检测方法

```javascript
function isCapacitorNative() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}
```

---

## 5. IndexedDB（文件句柄持久化）

### 5.1 用途

存储 Baidu Disk 同步的 `FileSystemDirectoryHandle`（已废弃功能，代码保留）。

**数据库名**：`quadrant-cloud-sync`
**版本**：v1
**Object Store**：`handles`

> ⚠️ **备注**：Baidu Disk 同步功能已于 v1.5 移除，IndexedDB 相关代码仅保留向后兼容，不再活跃使用。

---

## 6. 接口注意事项汇总

| 注意点 | 说明 |
|--------|------|
| **SW 绕过** | `api.github.com` 必须在 SW 中 bypass，否则被缓存导致同步失效 |
| **双重 no-cache** | SW 绕过 + fetch `cache: 'no-cache'` 双重保险 |
| **限流保护** | 3s 推送防抖 + 60s 拉取间隔 + hidden 暂停 |
| **Token 明文** | localStorage 中的 Token 是明文的，提醒用户使用专用 Token |
| **超时** | 所有 Gist API 调用都有 20s AbortController 超时 |
| **重试** | 自动拉取有 2 次指数退避重试，推送不自动重试（下次 save 会触发新一轮防抖） |
| **诊断分离** | 写权限测试用独立文件，不污染正式数据 |
| **版本校验** | `_version` 字段防止无效数据导入 |
| **Gist 文件上限** | GitHub Gist 单文件理论上无硬限制，但超大文件影响 API 性能 |
| **离线模式** | SW 提供离线 HTML/CSS/JS 缓存，但 Gist API 在离线时不可用 |
| **多端冲突** | 当前合并策略是 Local-Wins（本地优先），两端同时编辑时最后推送的改动不会覆盖已拉取的数据 |
