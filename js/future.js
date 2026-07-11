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
