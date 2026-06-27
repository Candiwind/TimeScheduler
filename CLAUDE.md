# CLAUDE.md

> 四象限任务管理器（艾森豪威尔矩阵）— 原生 HTML/CSS/JS 网页应用 + PWA，可 Capacitor 打包成 App。
> 本文件只记录"代码读不出来、且历史上反复需要纠正"的约定，不重复代码本身能表达的内容。

## 硬约束
- 纯原生 JS，**不引入**框架 / 构建工具 / 打包器 / npm 依赖（除非用户明确要求）。
- 脚本在 [index.html](index.html) 末尾按固定顺序 `<script src>` 加载、全局挂载 window；**新增 JS 文件必须在此注册，且放在 [js/app.js](js/app.js)（入口 `initApp`）之前**。
- 代码风格沿用现有：`var` + `function` + 闭包，中文注释、中文 UI 文案。
- 配置常量（象限 `QUADRANTS` / 时段 `TIME_SLOTS` / 完成度选项）集中放 [js/config.js](js/config.js)，不在各模块硬编码。

## 数据与状态
- 所有业务数据读写走 [js/store.js](js/store.js)（`loadDateData`/`saveDateData`/`loadAllData`/`saveAllData`），**不直接**操作 `localStorage`。主键 `quadrant_task_data`（自动写 `_backup` 备份）。
- 改数据后必须 **save + 重新 render**，否则 UI 与持久化不一致。
- 当天数据**不会**自动进缓存库；只有用户点"缓存"才写入显式索引 `quadrant_cached_dates_index`（导入缓存对话框只列出这些日期）。

## 反复踩坑（高频回归区，改动务必小心）
- **时间视图（[js/render.js](js/render.js) 的 `renderTimeView` / `flattenChildren`）是最易错区域**：分布逻辑须守住不变量——无重复、无遗漏、时段正确。任何改动**必须跑** `node test/test-timeview-columns.js`、`test/test-timeview-distribution.js`、`test/test-timeview-grouping.js`。
- **新增任务/子任务/阶段的所有创建入口**（add* / split* / migrate / import / move 等）都要设默认 `timeSlot`，不能漏——历史曾漏 16 处导致时段分布错乱。
- **大任务子任务的增/删/迁**必须同步维护 `bigTaskRef` 与 `bigTaskSubtask.plannedDate`，否则 `migrateBigTaskSubtasks` 会重复导入或残留旧任务。
- 时间视图**不要用 `innerHTML` 清空** `.quadrant-grid`（会销毁四象限容器、导致切回象限视图失效），改用隐藏/显示。
- 统计/计数口径改动，需同步 [js/render.js](js/render.js) + [js/stats-ui.js](js/stats-ui.js) + [js/daily-report.js](js/daily-report.js) 三处。
- 新增/修改样式须同时覆盖**暗色模式**（`[data-theme="dark"]`）与**移动端**（≤600px 单列、触摸目标 ≥26px、时段块 `max-height: 30vh`）——历史上多次漏，导致暗色下看不清或手机上溢出。
- 渲染函数（`createTaskElement` / `createSubTaskElement` 等）里，**引用 DOM 变量前必须先创建**——曾因 `splitBtn` 在声明前被使用，导致整页初始化失败，反复出现过两次。

## 工作流（IMPORTANT）
1. 改前读 [repairing.txt](repairing.txt)。
2. 改核心逻辑后**新增/更新** `test/` 下回归测试，并 `node test/xxx.js` 跑通——这是本项目的一贯要求。
3. 本地用静态服务器预览（`python -m http.server`）；`file://` 下 service-worker 不生效，改前端后注意 [service-worker.js](service-worker.js) 的 `CACHE_NAME` 缓存（必要时升级版本或硬刷新）。
4. 完成后把修复写进 [repaired.txt](repaired.txt) 当前版本段，[repairing.txt](repairing.txt) 改回"暂无"。

## 版本号规则
- 没有指定版本要求时维持原版本（main 分支），**不要**自行添加新版本号（如 V1.3、V1.4 等）。
- 修改记录（repaired.txt）新条目归入当前最新版本段，不新建版本段落；commit message 也不含版本号，直接描述修改。

## Git 常用操作（gitee / github）
- 远程映射：`gitee` → gitee.com/candiwind/time-scheduler；`origin` → github.com/Candiwind/TimeScheduler。主分支 `main`。**先 gitee 后 github**——gitee 默认一定传，github 等网通后再传。
- 每次完成修改后按此序列提交推送（commit 用 `fix:`/`feat:` 前缀 + 中文描述，不含版本号）：

  ```bash
  git add -A
  git commit -m "fix: 中文描述修改内容"
  git push gitee main     # 先传，一定传
  git push origin main    # 后传，网通再传
  ```

- 归档分支、版本回退、补提交等详细操作见 [GitHub-Operations.md](GitHub-Operations.md)。

## 修复功能描述
- 查看 [repairing.txt](repairing.txt) 中的条目，在完成后加入到 [repaired.txt](repaired.txt) 对应版本的位置中。[repairing.txt](repairing.txt) 中写入"暂无"。
