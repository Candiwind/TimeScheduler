// quadrant-ops.js - Quadrant task CRUD operations
function addTask(quadrantKey) {
  var data = loadDateData(currentDate);
  var task = { id: generateId(), text: '新任务', completed: false, progress: '100%', dueDate: '' };
  data[quadrantKey].push(task);
  saveDateData(currentDate, data);
  renderQuadrantOnly(quadrantKey);
  setTimeout(function() {
    var container = document.querySelector('#quadrant-' + quadrantKey + ' .quadrant-tasks');
    if (container) {
      var tasks = container.querySelectorAll('.task-item .task-text');
      var last = tasks[tasks.length - 1];
      if (last) {
        startEdit(last, last.textContent, function(newVal) {
          updateTaskText(quadrantKey, task.id, newVal);
        });
      }
    }
  }, 100);
}

function addTaskBlock(quadrantKey) {
  var data = loadDateData(currentDate);
  var block = { id: generateId(), blockName: '新任务块', progress: '100%', tasks: [] };
  data[quadrantKey].push(block);
  saveDateData(currentDate, data);
  renderQuadrantOnly(quadrantKey);
}

function addSubTask(quadrantKey, blockId) {
  var data = loadDateData(currentDate);
  for (var i = 0; i < data[quadrantKey].length; i++) {
    if (data[quadrantKey][i].id === blockId && data[quadrantKey][i].blockName !== undefined) {
      if (!data[quadrantKey][i].tasks) data[quadrantKey][i].tasks = [];
      data[quadrantKey][i].tasks.push({ id: generateId(), text: '新子任务', completed: false });
      break;
    }
  }
  saveDateData(currentDate, data);
  renderQuadrantOnly(quadrantKey);
}

// ---- Delete with Undo ----

function deleteTaskWithUndo(quadrantKey, item, blockId) {
  deleteTaskDirect(quadrantKey, item.id, blockId);
  Toast.show('任务已删除', function() {
    var data = loadDateData(currentDate);
    if (blockId) {
      for (var i = 0; i < data[quadrantKey].length; i++) {
        if (data[quadrantKey][i].id === blockId && data[quadrantKey][i].blockName !== undefined) {
          if (!data[quadrantKey][i].tasks) data[quadrantKey][i].tasks = [];
          data[quadrantKey][i].tasks.push(item);
          break;
        }
      }
    } else {
      data[quadrantKey].push(item);
    }
    saveDateData(currentDate, data);
    renderAll(currentDate);
  });
}

function deleteBlockWithUndo(quadrantKey, block, _unused) {
  deleteBlockDirect(quadrantKey, block.id);
  Toast.show('任务块已删除', function() {
    var data = loadDateData(currentDate);
    data[quadrantKey].push(block);
    saveDateData(currentDate, data);
    renderAll(currentDate);
  });
}

function deleteTaskDirect(quadrantKey, taskId, blockId) {
  var data = loadDateData(currentDate);
  if (blockId) {
    for (var i = 0; i < data[quadrantKey].length; i++) {
      if (data[quadrantKey][i].id === blockId && data[quadrantKey][i].blockName !== undefined) {
        var tasks = data[quadrantKey][i].tasks || [];
        for (var j = 0; j < tasks.length; j++) {
          if (tasks[j].id === taskId) { tasks.splice(j, 1); break; }
        }
        break;
      }
    }
  } else {
    for (var k = 0; k < data[quadrantKey].length; k++) {
      if (data[quadrantKey][k].id === taskId && !data[quadrantKey][k].blockName) {
        data[quadrantKey].splice(k, 1);
        break;
      }
    }
  }
  saveDateData(currentDate, data);
  renderAll(currentDate);
}

function deleteBlockDirect(quadrantKey, blockId) {
  var data = loadDateData(currentDate);
  for (var i = 0; i < data[quadrantKey].length; i++) {
    if (data[quadrantKey][i].id === blockId && data[quadrantKey][i].blockName !== undefined) {
      data[quadrantKey].splice(i, 1);
      break;
    }
  }
  saveDateData(currentDate, data);
  renderAll(currentDate);
}

function deleteTask(quadrantKey, taskId) {
  var data = loadDateData(currentDate);
  var found = null;
  for (var i = 0; i < data[quadrantKey].length; i++) {
    if (data[quadrantKey][i].id === taskId && !data[quadrantKey][i].blockName) {
      found = data[quadrantKey].splice(i, 1)[0];
      break;
    }
  }
  if (found) {
    saveDateData(currentDate, data);
    renderAll(currentDate);
    Toast.show('任务已删除', function() {
      var d = loadDateData(currentDate);
      d[quadrantKey].push(found);
      saveDateData(currentDate, d);
      renderAll(currentDate);
    });
  }
}

function deleteBlock(quadrantKey, blockId) {
  var data = loadDateData(currentDate);
  var found = null;
  for (var i = 0; i < data[quadrantKey].length; i++) {
    if (data[quadrantKey][i].id === blockId && data[quadrantKey][i].blockName !== undefined) {
      found = data[quadrantKey].splice(i, 1)[0];
      break;
    }
  }
  if (found) {
    saveDateData(currentDate, data);
    renderAll(currentDate);
    Toast.show('任务块已删除', function() {
      var d = loadDateData(currentDate);
      d[quadrantKey].push(found);
      saveDateData(currentDate, d);
      renderAll(currentDate);
    });
  }
}

function deleteSubTask(quadrantKey, blockId, taskId) {
  if (!confirm('确定删除该子任务？')) return;
  var data = loadDateData(currentDate);
  for (var i = 0; i < data[quadrantKey].length; i++) {
    if (data[quadrantKey][i].id === blockId && data[quadrantKey][i].blockName !== undefined) {
      var tasks = data[quadrantKey][i].tasks || [];
      for (var j = 0; j < tasks.length; j++) {
        if (tasks[j].id === taskId) { tasks.splice(j, 1); break; }
      }
      break;
    }
  }
  saveDateData(currentDate, data);
  renderAll(currentDate);
}

// ---- Toggle Complete ----

function toggleTaskComplete(quadrantKey, taskId, completed) {
  var data = loadDateData(currentDate);
  var taskRef = null;
  for (var i = 0; i < data[quadrantKey].length; i++) {
    if (data[quadrantKey][i].id === taskId && !data[quadrantKey][i].blockName) {
      data[quadrantKey][i].completed = completed;
      if (completed) data[quadrantKey][i].highlights = [];
      taskRef = data[quadrantKey][i].bigTaskRef;
      break;
    }
  }
  saveDateData(currentDate, data);
  if (taskRef) {
    toggleBigSubtaskComplete(taskRef.bigTaskId, taskRef.subtaskId, completed);
  }
  renderAll(currentDate);
}

function toggleSubTaskComplete(quadrantKey, blockId, taskId, completed) {
  var data = loadDateData(currentDate);
  for (var i = 0; i < data[quadrantKey].length; i++) {
    if (data[quadrantKey][i].id === blockId && data[quadrantKey][i].blockName !== undefined) {
      var tasks = data[quadrantKey][i].tasks || [];
      for (var j = 0; j < tasks.length; j++) {
        if (tasks[j].id === taskId) {
          tasks[j].completed = completed;
          if (completed) tasks[j].highlights = [];
          break;
        }
      }
      break;
    }
  }
  saveDateData(currentDate, data);
  renderAll(currentDate);
}

// ---- Update Text / Progress / Due ----

function updateTaskText(quadrantKey, taskId, newText) {
  var data = loadDateData(currentDate);
  for (var i = 0; i < data[quadrantKey].length; i++) {
    if (data[quadrantKey][i].id === taskId && !data[quadrantKey][i].blockName) {
      data[quadrantKey][i].text = newText;
      break;
    }
  }
  saveDateData(currentDate, data);
  renderQuadrantOnly(quadrantKey);
}

function updateSubTaskText(quadrantKey, blockId, taskId, newText) {
  var data = loadDateData(currentDate);
  for (var i = 0; i < data[quadrantKey].length; i++) {
    if (data[quadrantKey][i].id === blockId && data[quadrantKey][i].blockName !== undefined) {
      var tasks = data[quadrantKey][i].tasks || [];
      for (var j = 0; j < tasks.length; j++) {
        if (tasks[j].id === taskId) { tasks[j].text = newText; break; }
      }
      break;
    }
  }
  saveDateData(currentDate, data);
  renderQuadrantOnly(quadrantKey);
}

function updateBlockName(quadrantKey, blockId, newName) {
  var data = loadDateData(currentDate);
  for (var i = 0; i < data[quadrantKey].length; i++) {
    if (data[quadrantKey][i].id === blockId && data[quadrantKey][i].blockName !== undefined) {
      data[quadrantKey][i].blockName = newName;
      break;
    }
  }
  saveDateData(currentDate, data);
  renderQuadrantOnly(quadrantKey);
}

function updateTaskProgress(quadrantKey, taskId, progress) {
  var data = loadDateData(currentDate);
  for (var i = 0; i < data[quadrantKey].length; i++) {
    if (data[quadrantKey][i].id === taskId && !data[quadrantKey][i].blockName) {
      data[quadrantKey][i].progress = progress;
      break;
    }
  }
  saveDateData(currentDate, data);
  renderQuadrantOnly(quadrantKey);
}

function updateBlockProgress(quadrantKey, blockId, progress) {
  var data = loadDateData(currentDate);
  for (var i = 0; i < data[quadrantKey].length; i++) {
    if (data[quadrantKey][i].id === blockId && data[quadrantKey][i].blockName !== undefined) {
      data[quadrantKey][i].progress = progress;
      break;
    }
  }
  saveDateData(currentDate, data);
  renderQuadrantOnly(quadrantKey);
}

function updateTaskDueDate(quadrantKey, taskId, dueDate) {
  var data = loadDateData(currentDate);
  for (var i = 0; i < data[quadrantKey].length; i++) {
    if (data[quadrantKey][i].id === taskId && !data[quadrantKey][i].blockName) {
      data[quadrantKey][i].dueDate = dueDate;
      break;
    }
  }
  saveDateData(currentDate, data);
  renderQuadrantOnly(quadrantKey);
}
