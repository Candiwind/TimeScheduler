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

// ============ Subtask Stage Operations ============

function splitSubtaskIntoStages(quadrantKey, blockId, subtaskId) {
  var data = loadDateData(currentDate);
  var subtask = null;
  for (var i = 0; i < data[quadrantKey].length; i++) {
    if (data[quadrantKey][i].id === blockId && data[quadrantKey][i].blockName !== undefined) {
      var tasks = data[quadrantKey][i].tasks || [];
      for (var j = 0; j < tasks.length; j++) {
        if (tasks[j].id === subtaskId) { subtask = tasks[j]; break; }
      }
      break;
    }
  }
  if (!subtask) return;
  if (subtask.stages && subtask.stages.length > 0) {
    alert('该子任务已拆分为阶段');
    return;
  }
  var input = prompt('请输入阶段名称（用逗号分隔，如"设计,编码,测试"）：\n原任务名：' + (subtask.text || ''));
  if (!input) return;
  var stageNames = input.split(/[,，]/).map(function(s) { return s.trim(); }).filter(Boolean);
  if (stageNames.length < 2) { alert('请至少输入2个阶段名称'); return; }
  subtask.stages = stageNames.map(function(name) {
    return { id: generateId(), text: name, completed: false };
  });
  // Auto-sync completed state
  subtask.completed = false;
  saveDateData(currentDate, data);
  renderAll(currentDate);
}

function toggleStageComplete(quadrantKey, blockId, subtaskId, stageId, completed) {
  var data = loadDateData(currentDate);
  for (var i = 0; i < data[quadrantKey].length; i++) {
    if (data[quadrantKey][i].id === blockId && data[quadrantKey][i].blockName !== undefined) {
      var tasks = data[quadrantKey][i].tasks || [];
      for (var j = 0; j < tasks.length; j++) {
        if (tasks[j].id === subtaskId && tasks[j].stages) {
          tasks[j].stages.forEach(function(s) {
            if (s.id === stageId) { s.completed = completed; }
          });
          // Auto-sync parent subtask
          tasks[j].completed = tasks[j].stages.every(function(s) { return s.completed; });
          break;
        }
      }
      break;
    }
  }
  saveDateData(currentDate, data);
  renderAll(currentDate);
}

function addStage(quadrantKey, blockId, subtaskId) {
  var text = prompt('请输入新阶段名称：');
  if (!text) return;
  var data = loadDateData(currentDate);
  for (var i = 0; i < data[quadrantKey].length; i++) {
    if (data[quadrantKey][i].id === blockId && data[quadrantKey][i].blockName !== undefined) {
      var tasks = data[quadrantKey][i].tasks || [];
      for (var j = 0; j < tasks.length; j++) {
        if (tasks[j].id === subtaskId) {
          if (!tasks[j].stages) tasks[j].stages = [];
          tasks[j].stages.push({ id: generateId(), text: text, completed: false });
          tasks[j].completed = false;
          break;
        }
      }
      break;
    }
  }
  saveDateData(currentDate, data);
  renderAll(currentDate);
}

function deleteStage(quadrantKey, blockId, subtaskId, stageId) {
  if (!confirm('确定删除该阶段？')) return;
  var data = loadDateData(currentDate);
  for (var i = 0; i < data[quadrantKey].length; i++) {
    if (data[quadrantKey][i].id === blockId && data[quadrantKey][i].blockName !== undefined) {
      var tasks = data[quadrantKey][i].tasks || [];
      for (var j = 0; j < tasks.length; j++) {
        if (tasks[j].id === subtaskId && tasks[j].stages) {
          tasks[j].stages = tasks[j].stages.filter(function(s) { return s.id !== stageId; });
          if (tasks[j].stages.length === 0) {
            delete tasks[j].stages;
            tasks[j].completed = false;
          } else {
            tasks[j].completed = tasks[j].stages.every(function(s) { return s.completed; });
          }
          break;
        }
      }
      break;
    }
  }
  saveDateData(currentDate, data);
  renderAll(currentDate);
}

function updateStageText(quadrantKey, blockId, subtaskId, stageId, newText) {
  var data = loadDateData(currentDate);
  for (var i = 0; i < data[quadrantKey].length; i++) {
    if (data[quadrantKey][i].id === blockId && data[quadrantKey][i].blockName !== undefined) {
      var tasks = data[quadrantKey][i].tasks || [];
      for (var j = 0; j < tasks.length; j++) {
        if (tasks[j].id === subtaskId && tasks[j].stages) {
          tasks[j].stages.forEach(function(s) {
            if (s.id === stageId) { s.text = newText; }
          });
          break;
        }
      }
      break;
    }
  }
  saveDateData(currentDate, data);
  renderQuadrantOnly(quadrantKey);
}

// ============ Task-level Stage Operations ============

function splitTaskIntoStages(quadrantKey, taskId) {
  var data = loadDateData(currentDate);
  var task = null;
  for (var i = 0; i < data[quadrantKey].length; i++) {
    if (data[quadrantKey][i].id === taskId && !data[quadrantKey][i].blockName) {
      task = data[quadrantKey][i]; break;
    }
  }
  if (!task) return;
  if (task.stages && task.stages.length > 0) { alert('该任务已拆分为阶段'); return; }
  var input = prompt('请输入阶段名称（用逗号分隔，如"设计,编码,测试"）：\n原任务名：' + (task.text || ''));
  if (!input) return;
  var stageNames = input.split(/[,，]/).map(function(s) { return s.trim(); }).filter(Boolean);
  if (stageNames.length < 2) { alert('请至少输入2个阶段名称'); return; }
  task.stages = stageNames.map(function(name) {
    return { id: generateId(), text: name, completed: false };
  });
  task.completed = false;
  saveDateData(currentDate, data);
  renderAll(currentDate);
}

function toggleTaskStageComplete(quadrantKey, taskId, stageId, completed) {
  var data = loadDateData(currentDate);
  for (var i = 0; i < data[quadrantKey].length; i++) {
    if (data[quadrantKey][i].id === taskId && !data[quadrantKey][i].blockName && data[quadrantKey][i].stages) {
      data[quadrantKey][i].stages.forEach(function(s) {
        if (s.id === stageId) { s.completed = completed; }
      });
      data[quadrantKey][i].completed = data[quadrantKey][i].stages.every(function(s) { return s.completed; });
      break;
    }
  }
  saveDateData(currentDate, data);
  renderAll(currentDate);
}

function addTaskStage(quadrantKey, taskId) {
  var text = prompt('请输入新阶段名称：');
  if (!text) return;
  var data = loadDateData(currentDate);
  for (var i = 0; i < data[quadrantKey].length; i++) {
    if (data[quadrantKey][i].id === taskId && !data[quadrantKey][i].blockName) {
      if (!data[quadrantKey][i].stages) data[quadrantKey][i].stages = [];
      data[quadrantKey][i].stages.push({ id: generateId(), text: text, completed: false });
      data[quadrantKey][i].completed = false;
      break;
    }
  }
  saveDateData(currentDate, data);
  renderAll(currentDate);
}

function deleteTaskStage(quadrantKey, taskId, stageId) {
  if (!confirm('确定删除该阶段？')) return;
  var data = loadDateData(currentDate);
  for (var i = 0; i < data[quadrantKey].length; i++) {
    if (data[quadrantKey][i].id === taskId && !data[quadrantKey][i].blockName && data[quadrantKey][i].stages) {
      data[quadrantKey][i].stages = data[quadrantKey][i].stages.filter(function(s) { return s.id !== stageId; });
      if (data[quadrantKey][i].stages.length === 0) {
        delete data[quadrantKey][i].stages;
        data[quadrantKey][i].completed = false;
      } else {
        data[quadrantKey][i].completed = data[quadrantKey][i].stages.every(function(s) { return s.completed; });
      }
      break;
    }
  }
  saveDateData(currentDate, data);
  renderAll(currentDate);
}

function updateTaskStageText(quadrantKey, taskId, stageId, newText) {
  var data = loadDateData(currentDate);
  for (var i = 0; i < data[quadrantKey].length; i++) {
    if (data[quadrantKey][i].id === taskId && !data[quadrantKey][i].blockName && data[quadrantKey][i].stages) {
      data[quadrantKey][i].stages.forEach(function(s) {
        if (s.id === stageId) { s.text = newText; }
      });
      break;
    }
  }
  saveDateData(currentDate, data);
  renderQuadrantOnly(quadrantKey);
}
