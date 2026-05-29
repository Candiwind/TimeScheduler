// future.js - Plan task pool panel setup and operations (future/week/month)
var _futureTaskPanelInit = false;
var _weekTaskPanelInit = false;
var _monthTaskPanelInit = false;

function setupFutureTaskPanel() {
  if (_futureTaskPanelInit) return;
  _futureTaskPanelInit = true;

  document.getElementById('futureTaskPanelToggle').addEventListener('click', function() {
    document.getElementById('futureTaskPanel').classList.toggle('collapsed');
  });

  document.getElementById('btnAddFutureTask').addEventListener('click', addFutureTaskItem);
  document.getElementById('btnAddFutureBlock').addEventListener('click', addFutureBlockItem);
}

function setupWeekTaskPanel() {
  if (_weekTaskPanelInit) return;
  _weekTaskPanelInit = true;

  document.getElementById('weekTaskPanelToggle').addEventListener('click', function() {
    document.getElementById('weekTaskPanel').classList.toggle('collapsed');
  });

  document.getElementById('btnAddWeekTask').addEventListener('click', addWeekTaskItem);
  document.getElementById('btnAddWeekBlock').addEventListener('click', addWeekBlockItem);
}

function setupMonthTaskPanel() {
  if (_monthTaskPanelInit) return;
  _monthTaskPanelInit = true;

  document.getElementById('monthTaskPanelToggle').addEventListener('click', function() {
    document.getElementById('monthTaskPanel').classList.toggle('collapsed');
  });

  document.getElementById('btnAddMonthTask').addEventListener('click', addMonthTaskItem);
  document.getElementById('btnAddMonthBlock').addEventListener('click', addMonthBlockItem);
}

// ---- Add items for each pool ----

function addFutureTaskItem() {
  var text = prompt('待办任务内容：');
  if (!text) return;
  var task = {
    id: 'ft_' + generateId(),
    type: 'task',
    text: text,
    scheduledDate: '',
    targetQuadrant: ''
  };
  addFutureTask(task);
  renderFutureTaskPanel();
}

function addFutureBlockItem() {
  var name = prompt('待办任务块名称：');
  if (!name) return;
  var block = {
    id: 'ftb_' + generateId(),
    type: 'block',
    blockName: name,
    scheduledDate: '',
    targetQuadrant: '',
    tasks: []
  };
  addFutureTask(block);
  renderFutureTaskPanel();
}

function addWeekTaskItem() {
  var text = prompt('周计划任务内容：');
  if (!text) return;
  var task = {
    id: 'wt_' + generateId(),
    type: 'task',
    text: text,
    scheduledDate: '',
    targetQuadrant: ''
  };
  addWeekTask(task);
  renderWeekTaskPanel();
}

function addWeekBlockItem() {
  var name = prompt('周计划任务块名称：');
  if (!name) return;
  var block = {
    id: 'wb_' + generateId(),
    type: 'block',
    blockName: name,
    scheduledDate: '',
    targetQuadrant: '',
    tasks: []
  };
  addWeekTask(block);
  renderWeekTaskPanel();
}

function addMonthTaskItem() {
  var text = prompt('月计划任务内容：');
  if (!text) return;
  var task = {
    id: 'mt_' + generateId(),
    type: 'task',
    text: text,
    scheduledDate: '',
    targetQuadrant: ''
  };
  addMonthTask(task);
  renderMonthTaskPanel();
}

function addMonthBlockItem() {
  var name = prompt('月计划任务块名称：');
  if (!name) return;
  var block = {
    id: 'mb_' + generateId(),
    type: 'block',
    blockName: name,
    scheduledDate: '',
    targetQuadrant: '',
    tasks: []
  };
  addMonthTask(block);
  renderMonthTaskPanel();
}

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
  data['II'].push({
    id: generateId(),
    text: subtaskData.text,
    completed: false,
    progress: '100%',
    dueDate: '',
    bigTaskRef: { bigTaskId: btId, subtaskId: stId, milestoneId: msId }
  });
  saveDateData(today, data);
  renderAll(currentDate);
}
