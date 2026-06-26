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
    bigTaskRef: { bigTaskId: btId, subtaskId: stId, milestoneId: msId }
  };
  var copiedStages = copyBigSubtaskStages(subtaskData);
  if (copiedStages) newTask.stages = copiedStages;
  data['II'].push(newTask);
  saveDateData(today, data);
  renderAll(currentDate);
}
