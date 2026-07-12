// batch-delete.js — 批量删除功能
// 批次模式：进入后可多选同类型条目，一键批量删除

var batchMode = null; // null | 'quadrant' | 'planpool' | 'bigtask'
var batchContext = null; // { type, key?, pool?, container }

// ---- 进入/退出批次模式 ----

function enterQuadrantBatchMode(key) {
  if (batchMode) exitBatchMode();
  batchMode = 'quadrant';
  batchContext = { type: 'quadrant', key: key };

  var quadrant = document.getElementById('quadrant-' + key);
  var container = quadrant ? quadrant.querySelector('.quadrant-tasks') : null;
  if (!container) { exitBatchMode(); return; }
  batchContext.container = container;

  _addQuadrantCheckboxes(container, key);
  if (quadrant) quadrant.classList.add('batch-mode');
  _showBatchToolbar();
  _updateBatchCount();
}

function enterPlanPoolBatchMode() {
  if (batchMode) exitBatchMode();
  batchMode = 'planpool';
  batchContext = { type: 'planpool', pool: activePlanPool };

  var container = document.getElementById('planPoolList');
  if (!container) { exitBatchMode(); return; }
  batchContext.container = container;

  _addPlanPoolCheckboxes(container);
  container.classList.add('batch-mode');
  _showBatchToolbar();
  _updateBatchCount();
}

function enterBigTaskBatchMode() {
  if (batchMode) exitBatchMode();
  batchMode = 'bigtask';
  batchContext = { type: 'bigtask' };

  var container = document.getElementById('bigTaskList');
  if (!container) { exitBatchMode(); return; }
  batchContext.container = container;

  _addBigTaskCheckboxes(container);
  container.classList.add('batch-mode');
  _showBatchToolbar();
  _updateBatchCount();
}

function exitBatchMode() {
  if (!batchMode) return;

  // 移除所有批次复选框
  var allCbs = document.querySelectorAll('.batch-select-checkbox');
  for (var i = allCbs.length - 1; i >= 0; i--) {
    allCbs[i].remove();
  }

  // 移除工具栏
  _hideBatchToolbar();

  // 清理 class 和隐藏状态
  if (batchContext && batchContext.container) {
    batchContext.container.classList.remove('batch-mode');
  }
  if (batchContext && batchContext.type === 'quadrant' && batchContext.key) {
    var q = document.getElementById('quadrant-' + batchContext.key);
    if (q) q.classList.remove('batch-mode');
  }
  // 还原正常删除按钮
  var hidden = document.querySelectorAll('.batch-hidden');
  for (var j = hidden.length - 1; j >= 0; j--) {
    hidden[j].classList.remove('batch-hidden');
  }

  batchMode = null;
  batchContext = null;
}

// 确保批次模式在切换视图/日期/面板时退出（由外部调用）
function ensureBatchModeExited() {
  if (batchMode) exitBatchMode();
}

// ---- 复选框添加 ----

function _addQuadrantCheckboxes(container, key) {
  _addCbToItems(container, '.task-item', function(el) {
    return 'task:' + key + ':' + el.dataset.id;
  });
  _addCbToItems(container, '.subtask-item', function(el) {
    return 'subtask:' + key + ':' + el.dataset.blockId + ':' + el.dataset.id;
  });
  _addCbToItems(container, '.task-block', function(el) {
    return 'block:' + key + ':' + el.dataset.id;
  });
  _addCbToItems(container, '.subtask-stage-item', function(el) {
    if (el.dataset.taskId) {
      return 'task-stage:' + key + ':' + el.dataset.taskId + ':' + el.dataset.stageId;
    } else if (el.dataset.subtaskId) {
      return 'block-stage:' + key + ':' + el.dataset.blockId + ':' + el.dataset.subtaskId + ':' + el.dataset.stageId;
    }
    return null;
  });
}

function _addPlanPoolCheckboxes(container) {
  var pool = activePlanPool;
  // 顶层任务
  _addCbToItems(container, '.planpool-item', function(el) {
    var ftId = el.dataset.ftId;
    if (!ftId) return null;
    // 排除块内的子任务（.planpool-subtask-item 也是 .planpool-item 的子类，但我们用更精确选择器）
    if (el.classList.contains('planpool-subtask-item')) return null;
    return 'pp-task:' + pool + ':' + ftId;
  });
  // 任务块
  _addCbToItems(container, '.planpool-block', function(el) {
    var ftId = _findBlockFtId(el);
    return ftId ? 'pp-block:' + pool + ':' + ftId : null;
  });
  // 块内子任务
  _addCbToItems(container, '.planpool-subtask-item', function(el) {
    var ftId = el.dataset.ftId;
    var stId = el.dataset.stId;
    return (ftId && stId) ? 'pp-subtask:' + pool + ':' + ftId + ':' + stId : null;
  });
  // 任务阶段（顶层任务）
  container.querySelectorAll('.planpool-stages .planpool-stage-item').forEach(function(el) {
    var ftId = el.dataset.ftId;
    var stageId = el.dataset.stageId;
    var stId = el.dataset.stId; // may be present for block subtask stages
    if (!ftId || !stageId) return;
    var batchKey;
    if (stId) {
      batchKey = 'pp-subtask-stage:' + pool + ':' + ftId + ':' + stId + ':' + stageId;
    } else {
      batchKey = 'pp-task-stage:' + pool + ':' + ftId + ':' + stageId;
    }
    var cb = _createBatchCb(batchKey);
    el.insertBefore(cb, el.firstChild);
  });
}

function _addBigTaskCheckboxes(container) {
  // 大任务卡片
  _addCbToItems(container, '.bigtask-card', function(el) {
    var btn = el.querySelector('.bigtask-delete-btn');
    return btn ? 'bt-card:' + btn.dataset.bigTaskId : null;
  });
  // 里程碑
  _addCbToItems(container, '.bigtask-milestone', function(el) {
    var btn = el.querySelector('.ms-delete-btn');
    return btn ? 'bt-ms:' + btn.dataset.btId + ':' + btn.dataset.msId : null;
  });
  // 子任务
  _addCbToItems(container, '.bigtask-subtask', function(el) {
    return 'bt-st:' + el.dataset.btId + ':' + el.dataset.msId + ':' + el.dataset.stId;
  });
  // 阶段
  container.querySelectorAll('.bigtask-subtask-stage').forEach(function(el) {
    var delBtn = el.querySelector('.bt-stage-del');
    if (!delBtn) return;
    var batchKey = 'bt-stage:' + delBtn.dataset.btId + ':' + delBtn.dataset.stId + ':' + delBtn.dataset.stageId;
    var cb = _createBatchCb(batchKey);
    el.insertBefore(cb, el.firstChild);
  });
}

// 通用：给容器内匹配选择器的元素添加复选框
function _addCbToItems(container, selector, keyFn) {
  container.querySelectorAll(selector).forEach(function(el) {
    var batchKey = keyFn(el);
    if (!batchKey) return;
    var cb = _createBatchCb(batchKey);
    // 找到合适的插入位置
    var targetParent = el;
    // 对于 .task-item / .subtask-item / .subtask-stage-item：插入到 .task-left 之前
    var leftEl = el.querySelector('.task-left');
    // 对于 .task-block：插入到 .block-header 开头
    var headerEl = el.querySelector('.block-header');
    // 对于 .planpool-block：插入到 .planpool-block-header 开头
    var ppHeaderEl = el.querySelector('.planpool-block-header');
    // 对于 .bigtask-card：插入到 .bigtask-card-header 开头
    var btHeaderEl = el.querySelector('.bigtask-card-header');
    // 对于 .bigtask-milestone：插入到 .bigtask-milestone-header 开头
    var msHeaderEl = el.querySelector('.bigtask-milestone-header');

    if (headerEl) {
      headerEl.insertBefore(cb, headerEl.firstChild);
    } else if (ppHeaderEl) {
      ppHeaderEl.insertBefore(cb, ppHeaderEl.firstChild);
    } else if (btHeaderEl) {
      btHeaderEl.insertBefore(cb, btHeaderEl.firstChild);
    } else if (msHeaderEl) {
      msHeaderEl.insertBefore(cb, msHeaderEl.firstChild);
    } else if (leftEl) {
      el.insertBefore(cb, leftEl);
    } else {
      el.insertBefore(cb, el.firstChild);
    }
  });
}

function _findBlockFtId(blockEl) {
  // planpool-block 的 ft-id 可以从 delete 按钮获取
  var delBtn = blockEl.querySelector('.planpool-delete-btn');
  if (delBtn && delBtn.dataset.ftId) return delBtn.dataset.ftId;
  // 也可以从 block-name 获取
  var nameEl = blockEl.querySelector('.planpool-block-name');
  if (nameEl && nameEl.dataset.ftId) return nameEl.dataset.ftId;
  return null;
}

function _createBatchCb(batchKey) {
  var cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'batch-select-checkbox';
  cb.setAttribute('data-batch-key', batchKey);
  cb.addEventListener('change', function() {
    _updateBatchCount();
  });
  cb.addEventListener('click', function(e) {
    e.stopPropagation();
  });
  return cb;
}

// ---- 工具栏 ----

function _showBatchToolbar() {
  _hideBatchToolbar();
  var bar = document.createElement('div');
  bar.className = 'batch-toolbar';
  bar.id = 'batchToolbar';
  bar.innerHTML = '<span class="batch-toolbar-count" id="batchToolbarCount">已选择 0 项</span>'
    + '<button class="batch-toolbar-btn" id="batchSelectAll">全选</button>'
    + '<button class="batch-toolbar-btn" id="batchInvert">反选</button>'
    + '<button class="batch-toolbar-btn batch-toolbar-danger" id="batchDelete">删除选中</button>'
    + '<button class="batch-toolbar-btn" id="batchCancel">取消</button>';
  document.body.appendChild(bar);

  document.getElementById('batchSelectAll').addEventListener('click', batchSelectAll);
  document.getElementById('batchInvert').addEventListener('click', batchInvertSelection);
  document.getElementById('batchDelete').addEventListener('click', batchExecuteDelete);
  document.getElementById('batchCancel').addEventListener('click', exitBatchMode);

  // 移动端适配：底部留出工具栏高度
  _adjustBodyPadding();
}

function _hideBatchToolbar() {
  var bar = document.getElementById('batchToolbar');
  if (bar) bar.remove();
  _restoreBodyPadding();
}

function _updateBatchCount() {
  var countEl = document.getElementById('batchToolbarCount');
  var delBtn = document.getElementById('batchDelete');
  if (!countEl || !delBtn) return;
  var cbs = document.querySelectorAll('.batch-select-checkbox:checked');
  var n = cbs.length;
  countEl.textContent = '已选择 ' + n + ' 项';
  delBtn.textContent = n > 0 ? '删除选中 (' + n + ')' : '删除选中';
  delBtn.disabled = n === 0;
}

function _adjustBodyPadding() {
  // 为底部固定工具栏预留空间
  var toolbarH = 56; // 默认高度
  if (window.innerWidth <= 600) toolbarH = 64; // 移动端更高
  document.body.style.paddingBottom = toolbarH + 'px';
}

function _restoreBodyPadding() {
  document.body.style.paddingBottom = '';
}

// ---- 选择操作 ----

function batchSelectAll() {
  document.querySelectorAll('.batch-select-checkbox').forEach(function(cb) {
    cb.checked = true;
  });
  _updateBatchCount();
}

function batchInvertSelection() {
  document.querySelectorAll('.batch-select-checkbox').forEach(function(cb) {
    cb.checked = !cb.checked;
  });
  _updateBatchCount();
}

// ---- 批量删除执行 ----

function batchExecuteDelete() {
  var checked = document.querySelectorAll('.batch-select-checkbox:checked');
  if (checked.length === 0) return;

  if (!confirm('确定删除选中的 ' + checked.length + ' 项？此操作不可撤销。')) return;

  var batchKeys = [];
  checked.forEach(function(cb) {
    batchKeys.push(cb.getAttribute('data-batch-key'));
  });

  var deleted = 0;
  var needSaveDate = false;
  var needSavePlan = {};
  var needSaveBig = false;
  var needSavePrinciples = false;

  var today = currentDate;
  var dateData = needSaveDate ? loadDateData(today) : null;

  // 按类型分组处理
  var groups = {};
  batchKeys.forEach(function(key) {
    var parts = key.split(':');
    var type = parts[0];
    if (!groups[type]) groups[type] = [];
    groups[type].push(parts);
  });

  // 处理象限任务删除
  if (groups['task'] || groups['block'] || groups['subtask'] || groups['task-stage'] || groups['block-stage']) {
    if (!dateData) dateData = loadDateData(today);
    needSaveDate = true;
  }

  // 象限任务
  (groups['task'] || []).forEach(function(p) {
    var quadrantKey = p[1], taskId = p[2];
    var arr = dateData[quadrantKey];
    if (!arr) return;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === taskId && arr[i].blockName === undefined) {
        var removed = arr.splice(i, 1)[0];
        if (removed && removed.bigTaskRef) _unlinkBigTaskRefSafe(removed);
        deleted++;
        break;
      }
    }
  });

  // 象限任务块
  (groups['block'] || []).forEach(function(p) {
    var quadrantKey = p[1], blockId = p[2];
    var arr = dateData[quadrantKey];
    if (!arr) return;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === blockId && arr[i].blockName !== undefined) {
        var removed = arr.splice(i, 1)[0];
        if (removed && removed.tasks) _unlinkBigTaskRefsSafe(removed.tasks);
        deleted++;
        break;
      }
    }
  });

  // 象限块内子任务
  (groups['subtask'] || []).forEach(function(p) {
    var quadrantKey = p[1], blockId = p[2], taskId = p[3];
    var arr = dateData[quadrantKey];
    if (!arr) return;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === blockId && arr[i].blockName !== undefined && arr[i].tasks) {
        for (var j = 0; j < arr[i].tasks.length; j++) {
          if (arr[i].tasks[j].id === taskId) {
            var removed = arr[i].tasks.splice(j, 1)[0];
            if (removed && removed.bigTaskRef) _unlinkBigTaskRefSafe(removed);
            deleted++;
            break;
          }
        }
        break;
      }
    }
  });

  // 象限任务下的阶段
  (groups['task-stage'] || []).forEach(function(p) {
    var quadrantKey = p[1], taskId = p[2], stageId = p[3];
    var arr = dateData[quadrantKey];
    if (!arr) return;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === taskId && arr[i].stages) {
        for (var j = 0; j < arr[i].stages.length; j++) {
          if (arr[i].stages[j].id === stageId) {
            arr[i].stages.splice(j, 1);
            if (arr[i].stages.length === 0) {
              delete arr[i].stages;
              arr[i].completed = false;
            }
            deleted++;
            break;
          }
        }
        break;
      }
    }
  });

  // 象限块内子任务的阶段
  (groups['block-stage'] || []).forEach(function(p) {
    var quadrantKey = p[1], blockId = p[2], subtaskId = p[3], stageId = p[4];
    var arr = dateData[quadrantKey];
    if (!arr) return;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === blockId && arr[i].blockName !== undefined && arr[i].tasks) {
        for (var j = 0; j < arr[i].tasks.length; j++) {
          if (arr[i].tasks[j].id === subtaskId && arr[i].tasks[j].stages) {
            for (var k = 0; k < arr[i].tasks[j].stages.length; k++) {
              if (arr[i].tasks[j].stages[k].id === stageId) {
                arr[i].tasks[j].stages.splice(k, 1);
                if (arr[i].tasks[j].stages.length === 0) {
                  delete arr[i].tasks[j].stages;
                  arr[i].tasks[j].completed = false;
                }
                deleted++;
                break;
              }
            }
            break;
          }
        }
        break;
      }
    }
  });

  // 处理计划池删除（通过回收站缓存）
  // pp-task / pp-block / pp-subtask：委托 _extractAndCachePlanPoolItem
  (groups['pp-task'] || []).forEach(function(p) {
    var pool = p[1], ftId = p[2];
    var cfg = PLAN_POOL_CONFIGS[pool];
    if (!cfg) return;
    var entry = _extractAndCachePlanPoolItem(cfg.poolKey, cfg.saveFn, ftId, null, 'deleted');
    if (entry) deleted++;
  });
  (groups['pp-block'] || []).forEach(function(p) {
    var pool = p[1], ftId = p[2];
    var cfg = PLAN_POOL_CONFIGS[pool];
    if (!cfg) return;
    var entry = _extractAndCachePlanPoolItem(cfg.poolKey, cfg.saveFn, ftId, null, 'deleted');
    if (entry) deleted++;
  });
  (groups['pp-subtask'] || []).forEach(function(p) {
    var pool = p[1], ftId = p[2], stId = p[3];
    var cfg = PLAN_POOL_CONFIGS[pool];
    if (!cfg) return;
    var entry = _extractAndCachePlanPoolItem(cfg.poolKey, cfg.saveFn, ftId, stId, 'deleted');
    if (entry) deleted++;
  });
  // pp-task-stage / pp-subtask-stage：_extractAndCachePlanPoolItem 不支持阶段，手动缓存
  (groups['pp-task-stage'] || []).forEach(function(p) {
    var pool = p[1], ftId = p[2], stageId = p[3];
    var cfg = PLAN_POOL_CONFIGS[pool];
    if (!cfg) return;
    var tasks = cfg.loadFn();
    var cacheKey = getPlanPoolCacheKey(cfg.poolKey);
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].id === ftId && tasks[i].stages) {
        for (var j = 0; j < tasks[i].stages.length; j++) {
          if (tasks[i].stages[j].id === stageId) {
            var removed = tasks[i].stages.splice(j, 1)[0];
            var entry = { id: stageId, type: 'stage', data: JSON.parse(JSON.stringify(removed)),
              parentInfo: { ftId: ftId, ftName: tasks[i].text || tasks[i].blockName || '' },
              action: 'deleted', timestamp: Date.now(), pinned: false };
            if (addToCache(cacheKey, entry)) {
              if (tasks[i].stages.length === 0) delete tasks[i].stages;
              cfg.saveFn(tasks);
              deleted++;
            }
            break;
          }
        }
        break;
      }
    }
  });
  (groups['pp-subtask-stage'] || []).forEach(function(p) {
    var pool = p[1], ftId = p[2], stId = p[3], stageId = p[4];
    var cfg = PLAN_POOL_CONFIGS[pool];
    if (!cfg) return;
    var tasks = cfg.loadFn();
    var cacheKey = getPlanPoolCacheKey(cfg.poolKey);
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].id === ftId && tasks[i].type === 'block' && tasks[i].tasks) {
        for (var j = 0; j < tasks[i].tasks.length; j++) {
          if (tasks[i].tasks[j].id === stId && tasks[i].tasks[j].stages) {
            for (var k = 0; k < tasks[i].tasks[j].stages.length; k++) {
              if (tasks[i].tasks[j].stages[k].id === stageId) {
                var removed = tasks[i].tasks[j].stages.splice(k, 1)[0];
                var entry = { id: stageId, type: 'stage', data: JSON.parse(JSON.stringify(removed)),
                  parentInfo: { ftId: ftId, ftName: tasks[i].text || tasks[i].blockName || '' },
                  action: 'deleted', timestamp: Date.now(), pinned: false };
                if (addToCache(cacheKey, entry)) {
                  if (tasks[i].tasks[j].stages.length === 0) delete tasks[i].tasks[j].stages;
                  cfg.saveFn(tasks);
                  deleted++;
                }
                break;
              }
            }
            break;
          }
        }
        break;
      }
    }
  });

  // 处理大任务删除（通过回收站缓存 + 进度重算）
  // bt-card / bt-ms / bt-st：委托 _extractAndCacheBigTaskItem
  (groups['bt-card'] || []).forEach(function(p) {
    var entry = _extractAndCacheBigTaskItem(p[1]);
    if (entry) deleted++;
  });
  (groups['bt-ms'] || []).forEach(function(p) {
    var entry = _extractAndCacheBigTaskItem(p[1], p[2]);
    if (entry) deleted++;
  });
  (groups['bt-st'] || []).forEach(function(p) {
    var entry = _extractAndCacheBigTaskItem(p[1], p[2], p[3]);
    if (entry) deleted++;
  });
  // bt-stage：batch key 不含 msId，手动查找并缓存
  (groups['bt-stage'] || []).forEach(function(p) {
    var btId = p[1], stId = p[2], stageId = p[3];
    var bigTasks = loadBigTasks();
    for (var i = 0; i < bigTasks.length; i++) {
      if (bigTasks[i].id === btId && bigTasks[i].milestones) {
        for (var j = 0; j < bigTasks[i].milestones.length; j++) {
          var ms = bigTasks[i].milestones[j];
          if (ms.tasks) {
            for (var k = 0; k < ms.tasks.length; k++) {
              if (ms.tasks[k].id === stId && ms.tasks[k].stages) {
                for (var l = 0; l < ms.tasks[k].stages.length; l++) {
                  if (ms.tasks[k].stages[l].id === stageId) {
                    var removed = ms.tasks[k].stages.splice(l, 1)[0];
                    var entry = { id: stageId, type: 'stage', data: JSON.parse(JSON.stringify(removed)),
                      parentInfo: { bigTaskId: btId, milestoneId: ms.id, milestoneName: ms.name || '', subtaskId: stId, subtaskName: ms.tasks[k].text || '' },
                      action: 'deleted', timestamp: Date.now(), pinned: false };
                    if (addToCache(BIG_TASKS_DELETED_KEY, entry)) {
                      if (ms.tasks[k].stages.length === 0) { delete ms.tasks[k].stages; ms.tasks[k].completed = false; }
                      else { ms.tasks[k].completed = ms.tasks[k].stages.every(function(s) { return s.completed; }); }
                      recalcBigTaskProgress(bigTasks[i]);
                      saveBigTasks(bigTasks);
                      deleted++;
                    }
                    break;
                  }
                }
                break;
              }
            }
          }
        }
        break;
      }
    }
  });

  // 保存数据
  if (needSaveDate && dateData) {
    saveDateData(today, dateData);
  }

  // 退出批次模式
  exitBatchMode();

  // Toast 提示
  if (typeof Toast !== 'undefined') {
    Toast.show('已删除 ' + deleted + ' 项');
  }

  // 重新渲染
  if (typeof renderAll === 'function') {
    renderAll(currentDate);
  }
  if (typeof renderBigTaskPanel === 'function') {
    renderBigTaskPanel();
  }
  if (typeof renderPlanPoolPanel === 'function') {
    renderPlanPoolPanel();
  }
}

// ---- bigTaskRef 安全解绑 ----

function _unlinkBigTaskRefSafe(item) {
  if (!item || !item.bigTaskRef) return;
  try {
    if (typeof _unlinkBigTaskRef === 'function') {
      _unlinkBigTaskRef(item);
    }
  } catch(e) { /* 静默 */ }
}

function _unlinkBigTaskRefsSafe(items) {
  if (!items) return;
  for (var i = 0; i < items.length; i++) {
    _unlinkBigTaskRefSafe(items[i]);
  }
}
