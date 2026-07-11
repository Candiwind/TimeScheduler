// future.js - Unified Plan Pool panel setup (tabs: 待办/周/月)
var _planPoolPanelInit = false;

function setupPlanPoolPanel() {
  if (_planPoolPanelInit) return;
  _planPoolPanelInit = true;

  document.getElementById('planPoolPanelToggle').addEventListener('click', function() {
    document.getElementById('planPoolPanel').classList.toggle('collapsed');
  });

  document.querySelectorAll('.planpool-tab').forEach(function(tab) {
    tab.addEventListener('click', function(e) {
      e.stopPropagation();
      switchPlanPoolTab(this.dataset.pool);
    });
  });

  document.getElementById('btnAddPlanTask').addEventListener('click', function() {
    var names = { future: '待办', week: '周计划', month: '月计划' };
    var text = prompt('添加' + (names[activePlanPool] || '') + '任务：');
    if (!text) return;
    var idPrefix = { future: 'ft_', week: 'wt_', month: 'mt_' };
    var addFn = { future: addFutureTask, week: addWeekTask, month: addMonthTask };
    var task = {
      id: (idPrefix[activePlanPool] || 'pt_') + generateId(),
      type: 'task',
      text: text,
      completed: false,
      scheduledDate: '',
      targetQuadrant: ''
    };
    (addFn[activePlanPool] || addFutureTask)(task);
    renderPlanPoolPanel();
  });

  document.getElementById('btnAddPlanBlock').addEventListener('click', function() {
    var names = { future: '待办', week: '周计划', month: '月计划' };
    var name = prompt('添加' + (names[activePlanPool] || '') + '任务块名称：');
    if (!name) return;
    var idPrefix = { future: 'ftb_', week: 'wb_', month: 'mb_' };
    var addFn = { future: addFutureTask, week: addWeekTask, month: addMonthTask };
    var block = {
      id: (idPrefix[activePlanPool] || 'pb_') + generateId(),
      type: 'block',
      blockName: name,
      scheduledDate: '',
      targetQuadrant: '',
      tasks: []
    };
    (addFn[activePlanPool] || addFutureTask)(block);
    renderPlanPoolPanel();
  });
}

// Backward compat stubs
function setupFutureTaskPanel() { setupPlanPoolPanel(); }
function setupWeekTaskPanel() { /* handled by setupPlanPoolPanel */ }
function setupMonthTaskPanel() { /* handled by setupPlanPoolPanel */ }

// ---- Import Big Task Subtask to Today ----

function importBigSubtaskToToday(btId, msId, stId) {
  var bigTasks = loadBigTasks();
  var subtaskData = null;
  for (var i = 0; i < bigTasks.length; i++) {
    if (bigTasks[i].id === btId && bigTasks[i].milestones) {
      for (var j = 0; j < bigTasks[i].milestones.length; j++) {
        if (bigTasks[i].milestones[j].id === msId && bigTasks[i].milestones[j].tasks) {
          for (var k = 0; k < bigTasks[i].milestones[j].tasks.length; k++) {
            if (bigTasks[i].milestones[j].tasks[k].id === stId) {
              subtaskData = bigTasks[i].milestones[j].tasks[k];
              break;
            }
          }
        }
      }
      break;
    }
  }
  if (!subtaskData || subtaskData.completed) return;

  var today = currentDate;
  var data = loadDateData(today);
  if (!data['II']) data['II'] = [];
  var newTask = {
    id: generateId(),
    text: subtaskData.text,
    completed: false,
    progress: '100%',
    dueDate: '',
    timeSlot: (subtaskData && subtaskData.timeSlot) || getDefaultTimeSlot(),
    bigTaskRef: { bigTaskId: btId, subtaskId: stId, milestoneId: msId }
  };
  var copiedStages = copyBigSubtaskStages(subtaskData);
  if (copiedStages) newTask.stages = copiedStages;
  data['II'].push(newTask);
  saveDateData(today, data);
  renderAll(currentDate);
}

// ---- Import a big task's "today pool" to today (card-level one-click) ----

// 纯函数：计算某大任务"今日任务池"的导入计划（去重）。
// 逻辑与 migrateBigTaskSubtasks 的去重一致，但限定单个大任务，便于测试与复用。
// 返回 { poolCount, toImport: [{t, ms}], alreadyCount }
function planBigTaskTodayImport(bt, dateData, btId, date) {
  var poolItems = [];
  if (bt && bt.milestones) {
    bt.milestones.forEach(function(ms) {
      if (ms.tasks) ms.tasks.forEach(function(t) {
        if (t.plannedDate === date && !t.completed) poolItems.push({ t: t, ms: ms });
      });
    });
  }
  var toImport = [];
  var alreadyCount = 0;
  poolItems.forEach(function(it) {
    var alreadyImported = false;
    QUADRANT_KEYS.forEach(function(key) {
      (dateData[key] || []).forEach(function(task) {
        if (task.bigTaskRef && task.bigTaskRef.bigTaskId === btId && task.bigTaskRef.subtaskId === it.t.id) {
          alreadyImported = true;
        }
        if (task.blockName !== undefined && task.tasks) {
          task.tasks.forEach(function(st) {
            if (st.bigTaskRef && st.bigTaskRef.bigTaskId === btId && st.bigTaskRef.subtaskId === it.t.id) {
              alreadyImported = true;
            }
          });
        }
      });
    });
    if (alreadyImported) alreadyCount++;
    else toImport.push(it);
  });
  return { poolCount: poolItems.length, toImport: toImport, alreadyCount: alreadyCount };
}

// 大任务卡片级一键导入：把该大任务"今日任务池"（plannedDate=当前查看日期 且未完成）
// 的全部子任务导入今日 Q-II，已导入的自动跳过（去重），含阶段的一并深拷贝。
function importBigTaskTodayPoolToToday(btId) {
  var date = currentDate;
  var bigTasks = loadBigTasks();
  var bt = null;
  for (var i = 0; i < bigTasks.length; i++) {
    if (bigTasks[i].id === btId) { bt = bigTasks[i]; break; }
  }
  var data = loadDateData(date);
  if (!data['II']) data['II'] = [];

  var plan = planBigTaskTodayImport(bt, data, btId, date);

  if (plan.poolCount === 0) {
    Toast.show('该大任务今日任务池为空（无计划日期=今日 的子任务）');
    return;
  }

  var imported = 0;
  plan.toImport.forEach(function(it) {
    var newTask = {
      id: generateId(),
      text: it.t.text,
      completed: false,
      progress: '100%',
      dueDate: '',
      timeSlot: it.t.timeSlot || getDefaultTimeSlot(),
      bigTaskRef: { bigTaskId: btId, subtaskId: it.t.id, milestoneId: it.ms.id }
    };
    var copiedStages = copyBigSubtaskStages(it.t);
    if (copiedStages) newTask.stages = copiedStages;
    data['II'].push(newTask);
    imported++;
  });
  if (imported > 0) saveDateData(date, data);

  if (imported > 0) {
    Toast.show('已导入 ' + imported + ' 条到今日 Q-II' + (plan.alreadyCount > 0 ? '（另 ' + plan.alreadyCount + ' 条已存在）' : ''));
  } else {
    Toast.show('今日任务池 ' + plan.poolCount + ' 条均已导入，无需重复');
  }
  renderAll(currentDate);
  renderBigTaskPanel();
}

// ---- Import Plan Pool Item to Today ----

// 导入计划池任务（无阶段）到今日 Q-II
function importPlanPoolItemToToday(ftId, stId, text) {
  var today = currentDate;
  var data = loadDateData(today);
  if (!data['II']) data['II'] = [];

  if (stId) {
    // 块内子任务
    var cfg = PLAN_POOL_CONFIGS[activePlanPool];
    var tasks = cfg.loadFn();
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].id === ftId && tasks[i].type === 'block' && tasks[i].tasks) {
        for (var j = 0; j < tasks[i].tasks.length; j++) {
          if (tasks[i].tasks[j].id === stId) {
            var st = tasks[i].tasks[j];
            data['II'].push({
              id: generateId(),
              text: st.text,
              completed: false,
              progress: '100%',
              dueDate: '',
              timeSlot: st.timeSlot || getDefaultTimeSlot(),
              planPoolRef: { pool: activePlanPool, ftId: ftId, stId: stId }
            });
            break;
          }
        }
        break;
      }
    }
  } else {
    // 顶层任务
    data['II'].push({
      id: generateId(),
      text: text,
      completed: false,
      progress: '100%',
      dueDate: '',
      timeSlot: getDefaultTimeSlot(),
      planPoolRef: { pool: activePlanPool, ftId: ftId }
    });
  }

  saveDateData(today, data);
  renderAll(today);
}

// 导入计划池任务（含全部阶段）到今日 Q-II
function importPlanPoolItemWithStagesToToday(ftId, stId, text) {
  var today = currentDate;
  var data = loadDateData(today);
  if (!data['II']) data['II'] = [];

  var cfg = PLAN_POOL_CONFIGS[activePlanPool];
  var tasks = cfg.loadFn();
  var sourceTask = null;

  if (stId) {
    // 块内子任务
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].id === ftId && tasks[i].type === 'block' && tasks[i].tasks) {
        for (var j = 0; j < tasks[i].tasks.length; j++) {
          if (tasks[i].tasks[j].id === stId) { sourceTask = tasks[i].tasks[j]; break; }
        }
        break;
      }
    }
  } else {
    // 顶层任务
    for (var k = 0; k < tasks.length; k++) {
      if (tasks[k].id === ftId) { sourceTask = tasks[k]; break; }
    }
  }

  if (!sourceTask) return;

  var newTask = {
    id: generateId(),
    text: sourceTask.text,
    completed: false,
    progress: '100%',
    dueDate: '',
    timeSlot: sourceTask.timeSlot || getDefaultTimeSlot(),
    planPoolRef: { pool: activePlanPool, ftId: ftId, stId: stId || undefined }
  };

  if (sourceTask.stages && sourceTask.stages.length > 0) {
    newTask.stages = sourceTask.stages.map(function(s) {
      return {
        id: generateId(),
        text: s.text,
        completed: s.completed || false,
        timeSlot: s.timeSlot || getDefaultTimeSlot(),
        highlights: s.highlights ? s.highlights.slice() : undefined,
        extraCompleted: s.extraCompleted || false
      };
    });
  }

  data['II'].push(newTask);
  saveDateData(today, data);
  renderAll(today);
}
