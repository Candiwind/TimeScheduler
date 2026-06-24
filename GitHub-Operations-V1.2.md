# GitHub 操作流程文档 — TimeScheduler V1.2

> **日期**：2026-06-24  
> **仓库**：[Candiwind/TimeScheduler](https://github.com/Candiwind/TimeScheduler)  
> **操作摘要**：将 V1.1 归档至独立分支，V1.2 新版推送至 main 分支

---

## 1. 背景说明

- **V1.1**：包含 40 项已完成修改（基础功能 23 项 + UI优化 7 项 + UI迭代8轮 + 工程2项）
- **V1.2**：在 V1.1 基础上，修正加权计算逻辑——将象限固定权重（I×0.35 + II×0.3 + III×0.2 + IV×0.15）改为所有任务权重均等，单项权重随任务数量自动调整（权重 = 100% ÷ 任务总数）

---

## 2. 操作步骤

### 2.1 创建归档分支 v1.1

在 `main` 分支的最新提交（`9c63a31`）处创建 `v1.1` 分支，将当前稳定版本归档：

```bash
git branch v1.1
```

此命令在当前 HEAD 处创建一个名为 `v1.1` 的新分支，不会切换当前分支。

### 2.2 修改代码（V1.2 核心变更）

在 `main` 分支上修改以下文件：

| 文件 | 修改内容 |
|------|----------|
| `js/render.js` | 移除 `QUADRANT_WEIGHTS` 固定权重对象；`calcWeightedCompletion()` 改为等权重计算（每任务贡献 1/N）；更新 tooltip 文案 |
| `js/stats-ui.js` | 移除 `baseWeights`（I:4/II:3/III:2/IV:1）逻辑；象限显示"加权 X%" → "任务占比 X%"；单任务占比统一为 `100/N%` |
| `js/daily-report.js` | 日报中加权完成率公式文案更新（去掉旧权重公式） |
| `repair.txt` | 所有旧修改标记为 V1.1；新增第 41 项 V1.2 修改记录 |

### 2.3 暂存并提交

```bash
git add js/render.js js/stats-ui.js js/daily-report.js repair.txt
git commit -m "V1.2: 加权计算逻辑修正——所有任务权重均等，自动合计100%"
```

### 2.4 推送至 GitHub

```bash
# 推送 v1.1 归档分支
git push origin v1.1

# 推送 main 分支（V1.2 新版）
git push origin main
```

### 2.5 验证

- 访问 https://github.com/Candiwind/TimeScheduler/branches 确认 `main` 和 `v1.1` 两个分支均存在
- `main` 分支包含 V1.2 加权修正
- `v1.1` 分支保留 V1.1 旧版加权逻辑（象限固定权重）

---

## 3. 分支策略

```
main  ─── ● ─── ● ─── ● (9c63a31) ─── ● (V1.2提交)
               │                        ▲
               └── v1.1 ────────────────┘
                    (归档点)
```

| 分支 | 用途 | 版本 |
|------|------|------|
| `main` | 主开发分支，存放最新版本 | V1.2+ |
| `v1.1` | 归档分支，保留 V1.1 历史版本 | V1.1 |

---

## 4. 版本差异

### V1.1 → V1.2 加权计算逻辑变化

**V1.1（旧逻辑）**：
```
加权完成率 = 象限I完成率×0.35 + 象限II完成率×0.30 + 象限III完成率×0.20 + 象限IV完成率×0.15
```
- 象限固定权重，I 象限权重最高（35%），IV 象限权重最低（15%）
- 象限内任务数不影响总权重的分配

**V1.2（新逻辑）**：
```
每个任务权重 = 100% ÷ N（N = 总任务数）
加权完成率 = 已完成任务数 ÷ N × 100%
```
- 所有任务权重均等，不受象限影响
- 全部完成后加权总和 = 100%
- 单项权重随任务数量增减自动调整

---

## 5. 如何回退

如需回退到 V1.1 版本：

```bash
# 切换到 v1.1 分支查看旧版代码
git checkout v1.1

# 或将 main 回退到归档点
git checkout main
git reset --hard v1.1
git push --force origin main   # ⚠️ 谨慎使用 force push
```

---

## 6. 相关文件索引

| 文件 | 说明 |
|------|------|
| `js/render.js:451-488` | 加权完成率核心计算函数 |
| `js/stats-ui.js:27-48` | 统计面板展示逻辑 |
| `js/daily-report.js:86` | 日报加权率文案 |
| `repair.txt` | 修改记录清单 |
| `GitHub-Operations-V1.2.md` | 本文档 |
