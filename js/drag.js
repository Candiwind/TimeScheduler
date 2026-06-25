// drag.js - 拖拽功能（HTML5 Drag & Drop API）

let draggedItem = null;
let dragSourceQuadrant = null;
let dragSourceBlockId = null;

function handleDragStart(e) {
  draggedItem = this;
  dragSourceQuadrant = this.dataset.quadrant;
  dragSourceBlockId = this.dataset.blockId || null;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', this.dataset.id);
  // Stop propagation so parent block's dragstart doesn't fire for subtasks
  e.stopPropagation();
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  clearAllHighlights();
  draggedItem = null;
  dragSourceQuadrant = null;
  dragSourceBlockId = null;
}

// Future task pool drag handlers
function handleFutureDragStart(e) {
  this.classList.add('dragging');
  draggedItem = this;
  dragSourceQuadrant = null;
  dragSourceBlockId = null;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', 'FUTURE:' + (this.dataset.ftId || '') + ':' + (this.dataset.stId || ''));
  window._dragFromFuture = {
    ftId: this.dataset.ftId || '',
    stId: this.dataset.stId || '',
    text: this.dataset.ftText || ''
  };
}

function handleFutureDragEnd(e) {
  this.classList.remove('dragging');
  draggedItem = null;
  dragSourceQuadrant = null;
  dragSourceBlockId = null;
  window._dragFromFuture = null;
}

function handleQuadrantDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const container = this.querySelector('.quadrant-tasks');
  if (!container || container === draggedItem) return;

  const taskBlocks = container.querySelectorAll('.task-block');
  taskBlocks.forEach(function(b) { b.classList.remove('drag-over-block'); });

  // Show before/after indicators for all drag types within the quadrant
  clearAllHighlights();
  container.classList.add('drag-over');
  const children = container.querySelectorAll('.task-item:not(.dragging), .task-block:not(.dragging)');
  var inserted = false;
  for (var i = 0; i < children.length; i++) {
    var rect = children[i].getBoundingClientRect();
    if (e.clientY < rect.top + rect.height / 2) {
      children[i].classList.add('drag-before');
      inserted = true;
      break;
    }
  }
  if (!inserted && children.length > 0) {
    children[children.length - 1].classList.add('drag-after');
  }
}

function handleQuadrantDragLeave(e) {
  const container = this.querySelector('.quadrant-tasks');
  if (container) {
    container.classList.remove('drag-over');
    clearAllHighlights();
  }
}

function handleQuadrantDrop(e) {
  e.preventDefault();
  const container = this.querySelector('.quadrant-tasks');
  if (!draggedItem || !dragSourceQuadrant) return;

  const targetKey = this.dataset.key;
  const itemType = draggedItem.dataset.type;

  // Capture drop position before clearing highlights
  var dropIndex = -1;
  if (container) {
    var beforeEl = container.querySelector('.drag-before');
    if (beforeEl) {
      dropIndex = Array.from(container.children).indexOf(beforeEl);
    } else {
      var afterEl = container.querySelector('.drag-after');
      if (afterEl) {
        dropIndex = Array.from(container.children).indexOf(afterEl) + 1;
      }
    }
  }

  if (container) container.classList.remove('drag-over');
  clearAllHighlights();

  if (itemType === 'task') {
    moveTaskAt(dragSourceQuadrant, draggedItem.dataset.id, targetKey, dropIndex);
  } else if (itemType === 'block') {
    moveBlockAt(dragSourceQuadrant, draggedItem.dataset.id, targetKey, dropIndex);
  } else if (itemType === 'subtask') {
    moveSubtaskOut(dragSourceQuadrant, dragSourceBlockId, draggedItem.dataset.id, targetKey, dropIndex);
  }
}

function handleTaskDragOver(e) {
  if (!draggedItem || draggedItem === this) return;
  if (draggedItem.dataset.type === 'block') return;

  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'move';
  this.classList.add('drag-over-task');
}

function handleTaskDragLeave(e) {
  this.classList.remove('drag-over-task');
}

function handleTaskDrop(e) {
  if (!draggedItem) return;
  if (draggedItem.dataset.type === 'block') return;

  e.preventDefault();
  e.stopPropagation();
  this.classList.remove('drag-over-task');

  var targetQuadrant = this.dataset.quadrant;
  var targetId = this.dataset.id;

  if (draggedItem.dataset.type === 'task') {
    moveTaskAfter(dragSourceQuadrant, draggedItem.dataset.id, targetQuadrant, targetId);
  } else if (draggedItem.dataset.type === 'subtask') {
    moveSubtaskToAfter(dragSourceQuadrant, dragSourceBlockId, draggedItem.dataset.id, targetQuadrant, targetId);
  }
}

function handleBlockDragOver(e) {
  if (!draggedItem || draggedItem === this) return;

  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  if (draggedItem.dataset.type === 'block') {
    // Don't highlight block as drop target for another block,
    // but allow propagation so quadrant shows before/after indicators
    return;
  }

  this.classList.add('drag-over-block');

  // For subtask drags, do NOT stopPropagation so the quadrant can also
  // show before/after indicators for extraction (dragging subtask out of block)
  // For task drags, stopPropagation since block is a valid drop target
  if (draggedItem.dataset.type !== 'subtask') {
    e.stopPropagation();
  }
}

function handleBlockDragLeave(e) {
  this.classList.remove('drag-over-block');
}

function handleBlockDrop(e) {
  e.preventDefault();
  this.classList.remove('drag-over-block');

  if (!draggedItem) return;

  // If a block is being dragged over another block, let it bubble to quadrant
  if (draggedItem.dataset.type === 'block') {
    return;
  }

  e.stopPropagation();

  var targetQuadrant = this.dataset.quadrant;
  var targetBlockId = this.dataset.id;

  if (draggedItem.dataset.type === 'task') {
    moveTaskIntoBlock(dragSourceQuadrant, draggedItem.dataset.id, targetQuadrant, targetBlockId);
  } else if (draggedItem.dataset.type === 'subtask') {
    if (dragSourceBlockId !== targetBlockId) {
      moveSubtaskBetweenBlocks(dragSourceQuadrant, dragSourceBlockId, draggedItem.dataset.id, targetQuadrant, targetBlockId);
    } else {
      // Same block: reorder dragged subtask to end of block's subtask list
      reorderSubtaskToEnd(targetQuadrant, targetBlockId, draggedItem.dataset.id);
    }
  }
}

function handleSubtaskDragOver(e) {
  if (!draggedItem || draggedItem === this) return;
  if (draggedItem.dataset.type !== 'subtask') return;

  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'move';

  // Clear all subtask highlights in the same block before showing new indicator
  var block = this.closest('.task-block');
  if (block) {
    block.querySelectorAll('.subtask-item').forEach(function(el) {
      el.classList.remove('drag-over-task', 'drag-before', 'drag-after');
    });
  }

  // Show before/after indicator based on cursor position
  var rect = this.getBoundingClientRect();
  if (e.clientY < rect.top + rect.height / 2) {
    this.classList.add('drag-before');
  } else {
    this.classList.add('drag-after');
  }
}

function handleSubtaskDragLeave(e) {
  this.classList.remove('drag-over-task', 'drag-before', 'drag-after');
}

function handleSubtaskDrop(e) {
  if (!draggedItem || draggedItem.dataset.type !== 'subtask') return;

  e.preventDefault();
  e.stopPropagation();

  var isBefore = this.classList.contains('drag-before');
  this.classList.remove('drag-over-task', 'drag-before', 'drag-after');

  var targetQuadrant = this.dataset.quadrant;
  var targetBlockId = this.dataset.blockId;
  var targetId = this.dataset.id;

  if (dragSourceBlockId === targetBlockId) {
    reorderSubtasks(targetQuadrant, targetBlockId, draggedItem.dataset.id, targetId, isBefore);
  } else {
    moveSubtaskBetweenBlocksAfter(dragSourceQuadrant, dragSourceBlockId, draggedItem.dataset.id, targetQuadrant, targetBlockId, targetId, isBefore);
  }
}

function reorderSubtaskToEnd(quadrantKey, blockId, taskId) {
  var data = loadDateData(currentDate);
  for (var i = 0; i < data[quadrantKey].length; i++) {
    if (data[quadrantKey][i].id === blockId && data[quadrantKey][i].blockName !== undefined) {
      var tasks = data[quadrantKey][i].tasks || [];
      var found = null;
      for (var j = 0; j < tasks.length; j++) {
        if (tasks[j].id === taskId) {
          found = tasks.splice(j, 1)[0];
          break;
        }
      }
      if (!found) return;
      tasks.push(found);
      break;
    }
  }
  saveDateData(currentDate, data);
  renderAll(currentDate);
}

function clearAllHighlights() {
  document.querySelectorAll('.drag-over, .drag-over-task, .drag-over-block, .drag-before, .drag-after, .subtask-drop-hint')
    .forEach(function(el) { el.classList.remove('drag-over', 'drag-over-task', 'drag-over-block', 'drag-before', 'drag-after'); });
  document.querySelectorAll('.subtask-drop-hint').forEach(function(el) { el.remove(); });
}

// --- Data manipulation functions ---

function moveTask(fromKey, taskId, toKey) {
  moveTaskAt(fromKey, taskId, toKey, -1);
}

function moveTaskAt(fromKey, taskId, toKey, insertAt) {
  var data = loadDateData(currentDate);
  var found = null;
  for (var i = 0; i < data[fromKey].length; i++) {
    if (data[fromKey][i].id === taskId && !data[fromKey][i].blockName) {
      found = data[fromKey].splice(i, 1)[0];
      break;
    }
  }
  if (found) {
    if (insertAt >= 0 && insertAt <= data[toKey].length) {
      data[toKey].splice(insertAt, 0, found);
    } else {
      data[toKey].push(found);
    }
    saveDateData(currentDate, data);
    renderAll(currentDate);
  }
}

function moveTaskAfter(fromKey, taskId, toKey, afterId) {
  var data = loadDateData(currentDate);
  var found = null;
  for (var i = 0; i < data[fromKey].length; i++) {
    if (data[fromKey][i].id === taskId && !data[fromKey][i].blockName) {
      found = data[fromKey].splice(i, 1)[0];
      break;
    }
  }
  if (!found) return;
  var insertAt = data[toKey].length;
  for (var j = 0; j < data[toKey].length; j++) {
    if (data[toKey][j].id === afterId) {
      insertAt = j + 1;
      break;
    }
  }
  data[toKey].splice(insertAt, 0, found);
  saveDateData(currentDate, data);
  renderAll(currentDate);
}

function moveBlock(fromKey, blockId, toKey) {
  moveBlockAt(fromKey, blockId, toKey, -1);
}

function moveBlockAt(fromKey, blockId, toKey, insertAt) {
  var data = loadDateData(currentDate);
  var found = null;
  for (var i = 0; i < data[fromKey].length; i++) {
    if (data[fromKey][i].id === blockId && data[fromKey][i].blockName !== undefined) {
      found = data[fromKey].splice(i, 1)[0];
      break;
    }
  }
  if (found) {
    if (insertAt >= 0 && insertAt <= data[toKey].length) {
      data[toKey].splice(insertAt, 0, found);
    } else {
      data[toKey].push(found);
    }
    saveDateData(currentDate, data);
    renderAll(currentDate);
  }
}

function moveTaskIntoBlock(fromKey, taskId, toKey, blockId) {
  var data = loadDateData(currentDate);
  var found = null;
  for (var i = 0; i < data[fromKey].length; i++) {
    if (data[fromKey][i].id === taskId && !data[fromKey][i].blockName) {
      found = data[fromKey].splice(i, 1)[0];
      break;
    }
  }
  if (!found) return;
  for (var j = 0; j < data[toKey].length; j++) {
    if (data[toKey][j].id === blockId && data[toKey][j].blockName !== undefined) {
      var taskItem = { id: found.id, text: found.text, completed: found.completed, progress: found.progress };
      // Preserve bigTaskRef and timeSlot when moving into block
      if (found.bigTaskRef) taskItem.bigTaskRef = found.bigTaskRef;
      if (found.timeSlot) taskItem.timeSlot = found.timeSlot;
      if (found.highlights) taskItem.highlights = found.highlights;
      if (!data[toKey][j].tasks) data[toKey][j].tasks = [];
      data[toKey][j].tasks.push(taskItem);
      break;
    }
  }
  saveDateData(currentDate, data);
  renderAll(currentDate);
}

function moveSubtaskOut(fromKey, blockId, taskId, toKey, dropIndex) {
  var data = loadDateData(currentDate);
  var found = null;
  for (var i = 0; i < data[fromKey].length; i++) {
    if (data[fromKey][i].id === blockId && data[fromKey][i].blockName !== undefined) {
      var tasks = data[fromKey][i].tasks || [];
      for (var j = 0; j < tasks.length; j++) {
        if (tasks[j].id === taskId) {
          found = tasks.splice(j, 1)[0];
          break;
        }
      }
      break;
    }
  }
  if (!found) return;
  var newTask = { id: found.id, text: found.text, completed: found.completed, progress: found.progress };
  // Preserve bigTaskRef, timeSlot, stages, and highlights when moving out
  if (found.bigTaskRef) newTask.bigTaskRef = found.bigTaskRef;
  if (found.timeSlot) newTask.timeSlot = found.timeSlot;
  if (found.stages) newTask.stages = found.stages;
  if (found.highlights) newTask.highlights = found.highlights;
  if (dropIndex >= 0 && dropIndex <= data[toKey].length) {
    data[toKey].splice(dropIndex, 0, newTask);
  } else {
    data[toKey].push(newTask);
  }
  saveDateData(currentDate, data);
  renderAll(currentDate);
}

function moveSubtaskToAfter(fromKey, blockId, taskId, toKey, afterId) {
  var data = loadDateData(currentDate);
  var found = null;
  for (var i = 0; i < data[fromKey].length; i++) {
    if (data[fromKey][i].id === blockId && data[fromKey][i].blockName !== undefined) {
      var tasks = data[fromKey][i].tasks || [];
      for (var j = 0; j < tasks.length; j++) {
        if (tasks[j].id === taskId) {
          found = tasks.splice(j, 1)[0];
          break;
        }
      }
      break;
    }
  }
  if (!found) return;
  var newTask = { id: found.id, text: found.text, completed: found.completed, progress: found.progress };
  // Preserve bigTaskRef, timeSlot, stages, and highlights when moving out
  if (found.bigTaskRef) newTask.bigTaskRef = found.bigTaskRef;
  if (found.timeSlot) newTask.timeSlot = found.timeSlot;
  if (found.stages) newTask.stages = found.stages;
  if (found.highlights) newTask.highlights = found.highlights;
  var insertAt = data[toKey].length;
  for (var k = 0; k < data[toKey].length; k++) {
    if (data[toKey][k].id === afterId) {
      insertAt = k + 1;
      break;
    }
  }
  data[toKey].splice(insertAt, 0, newTask);
  saveDateData(currentDate, data);
  renderAll(currentDate);
}

function moveSubtaskBetweenBlocks(fromKey, fromBlockId, taskId, toKey, toBlockId) {
  var data = loadDateData(currentDate);
  var found = null;
  for (var i = 0; i < data[fromKey].length; i++) {
    if (data[fromKey][i].id === fromBlockId && data[fromKey][i].blockName !== undefined) {
      var tasks = data[fromKey][i].tasks || [];
      for (var j = 0; j < tasks.length; j++) {
        if (tasks[j].id === taskId) {
          found = tasks.splice(j, 1)[0];
          break;
        }
      }
      break;
    }
  }
  if (!found) return;
  for (var k = 0; k < data[toKey].length; k++) {
    if (data[toKey][k].id === toBlockId && data[toKey][k].blockName !== undefined) {
      if (!data[toKey][k].tasks) data[toKey][k].tasks = [];
      data[toKey][k].tasks.push(found);
      break;
    }
  }
  saveDateData(currentDate, data);
  renderAll(currentDate);
}

function moveSubtaskBetweenBlocksAfter(fromKey, fromBlockId, taskId, toKey, toBlockId, targetId, before) {
  var data = loadDateData(currentDate);
  var found = null;
  for (var i = 0; i < data[fromKey].length; i++) {
    if (data[fromKey][i].id === fromBlockId && data[fromKey][i].blockName !== undefined) {
      var tasks = data[fromKey][i].tasks || [];
      for (var j = 0; j < tasks.length; j++) {
        if (tasks[j].id === taskId) {
          found = tasks.splice(j, 1)[0];
          break;
        }
      }
      break;
    }
  }
  if (!found) return;
  for (var k = 0; k < data[toKey].length; k++) {
    if (data[toKey][k].id === toBlockId && data[toKey][k].blockName !== undefined) {
      if (!data[toKey][k].tasks) data[toKey][k].tasks = [];
      var insertAt = data[toKey][k].tasks.length;
      for (var m = 0; m < data[toKey][k].tasks.length; m++) {
        if (data[toKey][k].tasks[m].id === targetId) {
          insertAt = before ? m : m + 1;
          break;
        }
      }
      data[toKey][k].tasks.splice(insertAt, 0, found);
      break;
    }
  }
  saveDateData(currentDate, data);
  renderAll(currentDate);
}

function reorderSubtasks(quadrantKey, blockId, taskId, targetId, before) {
  var data = loadDateData(currentDate);
  for (var i = 0; i < data[quadrantKey].length; i++) {
    if (data[quadrantKey][i].id === blockId && data[quadrantKey][i].blockName !== undefined) {
      var tasks = data[quadrantKey][i].tasks || [];
      var found = null;
      for (var j = 0; j < tasks.length; j++) {
        if (tasks[j].id === taskId) {
          found = tasks.splice(j, 1)[0];
          break;
        }
      }
      if (!found) return;
      var insertAt = tasks.length;
      for (var k = 0; k < tasks.length; k++) {
        if (tasks[k].id === targetId) {
          insertAt = before ? k : k + 1;
          break;
        }
      }
      tasks.splice(insertAt, 0, found);
      break;
    }
  }
  saveDateData(currentDate, data);
  renderAll(currentDate);
}

// ============ Big Task Subtask Drag Handlers ============

function handleBigtaskSubDragStart(e) {
  this.classList.add('dragging');
  draggedItem = this;
  dragSourceQuadrant = null;
  dragSourceBlockId = null;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', 'BTSUB:' + this.dataset.btId + ':' + this.dataset.msId + ':' + this.dataset.stId);
  window._dragFromBigtask = {
    btId: this.dataset.btId,
    msId: this.dataset.msId,
    stId: this.dataset.stId,
    text: this.dataset.stText
  };
}

function handleBigtaskSubDragEnd(e) {
  this.classList.remove('dragging');
  draggedItem = null;
  dragSourceQuadrant = null;
  dragSourceBlockId = null;
  window._dragFromBigtask = null;
  document.querySelectorAll('.bigtask-subtask').forEach(function(el) {
    el.classList.remove('drag-before', 'drag-after');
  });
}

function handleBigtaskSubDragOver(e) {
  e.preventDefault();
  if (!draggedItem || draggedItem.dataset.type !== 'bigtask-subtask') return;
  var target = e.currentTarget;
  if (target === draggedItem) return;
  if (target.dataset.btId !== draggedItem.dataset.btId) return;
  target.classList.remove('drag-before', 'drag-after');
  var rect = target.getBoundingClientRect();
  var mid = rect.top + rect.height / 2;
  if (e.clientY < mid) {
    target.classList.add('drag-before');
  } else {
    target.classList.add('drag-after');
  }
}

function handleBigtaskSubDragLeave(e) {
  e.currentTarget.classList.remove('drag-before', 'drag-after');
}

function handleBigtaskSubDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  if (!draggedItem || draggedItem.dataset.type !== 'bigtask-subtask') return;
  var sourceBtId = draggedItem.dataset.btId;
  var sourceMsId = draggedItem.dataset.msId;
  var sourceStId = draggedItem.dataset.stId;
  var target = e.currentTarget;
  var targetBtId = target.dataset.btId;
  var targetMsId = target.dataset.msId;
  var targetStId = target.dataset.stId;
  document.querySelectorAll('.bigtask-subtask').forEach(function(el) {
    el.classList.remove('drag-before', 'drag-after');
  });
  if (sourceBtId !== targetBtId) return;
  if (sourceMsId === targetMsId && sourceStId === targetStId) return;
  var rect = target.getBoundingClientRect();
  var mid = rect.top + rect.height / 2;
  var before = e.clientY < mid;
  if (sourceMsId === targetMsId) {
    reorderBigtaskSubtasks(sourceBtId, sourceMsId, sourceStId, targetStId, before);
  } else {
    moveBigtaskSubBetweenMilestones(sourceBtId, sourceMsId, sourceStId, targetMsId, targetStId, before);
  }
  draggedItem = null;
  dragSourceQuadrant = null;
  dragSourceBlockId = null;
  window._dragFromBigtask = null;
}

function reorderBigtaskSubtasks(btId, msId, stId, targetStId, before) {
  var tasks = loadBigTasks();
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === btId && tasks[i].milestones) {
      for (var j = 0; j < tasks[i].milestones.length; j++) {
        var ms = tasks[i].milestones[j];
        if (ms.id === msId && ms.tasks) {
          var srcIdx = -1;
          for (var k = 0; k < ms.tasks.length; k++) {
            if (ms.tasks[k].id === stId) { srcIdx = k; break; }
          }
          if (srcIdx < 0) return;
          var found = ms.tasks.splice(srcIdx, 1)[0];
          var insertAt = ms.tasks.length;
          for (var m = 0; m < ms.tasks.length; m++) {
            if (ms.tasks[m].id === targetStId) { insertAt = before ? m : m + 1; break; }
          }
          ms.tasks.splice(insertAt, 0, found);
          recalcBigTaskProgress(tasks[i]);
          saveBigTasks(tasks);
          renderBigTaskPanel();
          return;
        }
      }
    }
  }
}

function moveBigtaskSubBetweenMilestones(btId, fromMsId, stId, toMsId, targetStId, before) {
  var tasks = loadBigTasks();
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === btId && tasks[i].milestones) {
      var fromMs = null, toMs = null;
      for (var j = 0; j < tasks[i].milestones.length; j++) {
        if (tasks[i].milestones[j].id === fromMsId) fromMs = tasks[i].milestones[j];
        if (tasks[i].milestones[j].id === toMsId) toMs = tasks[i].milestones[j];
      }
      if (!fromMs || !toMs) return;
      var srcIdx = -1;
      if (fromMs.tasks) {
        for (var k = 0; k < fromMs.tasks.length; k++) {
          if (fromMs.tasks[k].id === stId) { srcIdx = k; break; }
        }
      }
      if (srcIdx < 0) return;
      var found = fromMs.tasks.splice(srcIdx, 1)[0];
      if (!toMs.tasks) toMs.tasks = [];
      var insertAt = toMs.tasks.length;
      for (var m = 0; m < toMs.tasks.length; m++) {
        if (toMs.tasks[m].id === targetStId) { insertAt = before ? m : m + 1; break; }
      }
      toMs.tasks.splice(insertAt, 0, found);
      recalcBigTaskProgress(tasks[i]);
      saveBigTasks(tasks);
      renderBigTaskPanel();
      return;
    }
  }
}

function moveBigtaskSubToQuadrant(quadrantKey, dragData) {
  var data = loadDateData(currentDate);
  if (!data[quadrantKey]) data[quadrantKey] = [];
  // Check if task with same bigTaskRef already exists — move it instead of duplicating
  var existingKey = null, existingIndex = -1, existingBlockIndex = -1, existingInBlock = false;
  QUADRANT_KEYS.forEach(function(key) {
    var items = data[key] || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].bigTaskRef && items[i].bigTaskRef.bigTaskId === dragData.btId && items[i].bigTaskRef.subtaskId === dragData.stId) {
        existingKey = key; existingIndex = i; return;
      }
      if (items[i].blockName !== undefined && items[i].tasks) {
        for (var j = 0; j < items[i].tasks.length; j++) {
          if (items[i].tasks[j].bigTaskRef && items[i].tasks[j].bigTaskRef.bigTaskId === dragData.btId && items[i].tasks[j].bigTaskRef.subtaskId === dragData.stId) {
            existingKey = key; existingIndex = i;
            existingBlockIndex = j; existingInBlock = true;
            return;
          }
        }
      }
    }
  });
  if (existingKey && existingIndex >= 0) {
    if (existingInBlock && existingBlockIndex >= 0) {
      var blockItem = data[existingKey][existingIndex];
      var subtask = blockItem.tasks.splice(existingBlockIndex, 1)[0];
      data[quadrantKey].push({
        id: subtask.id || generateId(),
        text: subtask.text,
        completed: false,
        progress: '100%',
        bigTaskRef: subtask.bigTaskRef
      });
    } else {
      var existing = data[existingKey].splice(existingIndex, 1)[0];
      data[quadrantKey].push(existing);
    }
  } else {
    var st = getBigSubtaskData(dragData.btId, dragData.stId);
    data[quadrantKey].push({
      id: generateId(),
      text: (st ? st.text : dragData.text),
      completed: false,
      progress: '100%',
      dueDate: '',
      bigTaskRef: { bigTaskId: dragData.btId, subtaskId: dragData.stId }
    });
  }
  saveDateData(currentDate, data);
  renderAll(currentDate);
}

function getBigSubtaskData(btId, stId) {
  var tasks = loadBigTasks();
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === btId && tasks[i].milestones) {
      for (var j = 0; j < tasks[i].milestones.length; j++) {
        var ms = tasks[i].milestones[j];
        if (ms.tasks) {
          for (var k = 0; k < ms.tasks.length; k++) {
            if (ms.tasks[k].id === stId) return ms.tasks[k];
          }
        }
      }
    }
  }
  return null;
}

// ============ Stage Drag Handlers ============

function handleStageDragStart(e) {
  this.classList.add('dragging');
  draggedItem = this;
  dragSourceQuadrant = this.dataset.quadrant;
  dragSourceBlockId = this.dataset.blockId || null;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', 'STAGE:' + this.dataset.stageId);
}

function handleStageDragEnd(e) {
  this.classList.remove('dragging');
  draggedItem = null;
  dragSourceQuadrant = null;
  dragSourceBlockId = null;
  document.querySelectorAll('.subtask-stage-item').forEach(function(el) {
    el.classList.remove('drag-before', 'drag-after');
  });
}

function handleStageDragOver(e) {
  e.preventDefault();
  if (!draggedItem || draggedItem.dataset.type !== 'stage') return;
  var target = e.currentTarget;
  if (target === draggedItem) return;
  target.classList.remove('drag-before', 'drag-after');
  var rect = target.getBoundingClientRect();
  if (e.clientY < rect.top + rect.height / 2) {
    target.classList.add('drag-before');
  } else {
    target.classList.add('drag-after');
  }
}

function handleStageDragLeave(e) {
  e.currentTarget.classList.remove('drag-before', 'drag-after');
}

function handleStageDrop(e) {
  if (!draggedItem || draggedItem.dataset.type !== 'stage') return;
  e.preventDefault();
  e.stopPropagation();
  var source = draggedItem;
  var target = e.currentTarget;
  document.querySelectorAll('.subtask-stage-item').forEach(function(el) {
    el.classList.remove('drag-before', 'drag-after');
  });
  // Only reorder within same parent
  if (source.dataset.blockId !== target.dataset.blockId ||
      source.dataset.subtaskId !== target.dataset.subtaskId ||
      source.dataset.taskId !== target.dataset.taskId) return;
  var rect = target.getBoundingClientRect();
  var before = e.clientY < rect.top + rect.height / 2;
  var qKey = source.dataset.quadrant;
  if (source.dataset.blockId) {
    reorderStages(qKey, source.dataset.blockId, source.dataset.subtaskId, source.dataset.stageId, target.dataset.stageId, before);
  } else if (source.dataset.taskId) {
    reorderTaskStages(qKey, source.dataset.taskId, source.dataset.stageId, target.dataset.stageId, before);
  }
  draggedItem = null;
  dragSourceQuadrant = null;
  dragSourceBlockId = null;
}

// Stage out → standalone task
function moveStageOutToTask(quadrantKey, blockId, subtaskId, taskId, stageId) {
  var data = loadDateData(currentDate);
  var stageObj = null;
  for (var i = 0; i < data[quadrantKey].length; i++) {
    var item = data[quadrantKey][i];
    if (blockId && item.id === blockId && item.blockName !== undefined) {
      var tasks = item.tasks || [];
      for (var j = 0; j < tasks.length; j++) {
        if (tasks[j].id === subtaskId && tasks[j].stages) {
          var idx = -1;
          for (var k = 0; k < tasks[j].stages.length; k++) {
            if (tasks[j].stages[k].id === stageId) { stageObj = tasks[j].stages.splice(k, 1)[0]; break; }
          }
          if (tasks[j].stages.length === 0) delete tasks[j].stages;
          tasks[j].completed = tasks[j].stages ? tasks[j].stages.every(function(s) { return s.completed; }) : false;
          break;
        }
      }
      break;
    }
    if (taskId && item.id === taskId && !item.blockName && item.stages) {
      var idx2 = -1;
      for (var k2 = 0; k2 < item.stages.length; k2++) {
        if (item.stages[k2].id === stageId) { stageObj = item.stages.splice(k2, 1)[0]; break; }
      }
      if (item.stages.length === 0) delete item.stages;
      item.completed = item.stages ? item.stages.every(function(s) { return s.completed; }) : false;
      break;
    }
  }
  if (!stageObj) return;
  data[quadrantKey].push({
    id: generateId(),
    text: stageObj.text || '',
    completed: stageObj.completed || false,
    progress: '100%',
    dueDate: '',
    highlights: stageObj.highlights || undefined,
    timeSlot: stageObj.timeSlot || ''
  });
  saveDateData(currentDate, data);
  renderAll(currentDate);
}

// Reorder stages within same subtask
function reorderStages(quadrantKey, blockId, subtaskId, srcStageId, targetStageId, before) {
  var data = loadDateData(currentDate);
  for (var i = 0; i < data[quadrantKey].length; i++) {
    if (data[quadrantKey][i].id === blockId && data[quadrantKey][i].blockName !== undefined) {
      var tasks = data[quadrantKey][i].tasks || [];
      for (var j = 0; j < tasks.length; j++) {
        if (tasks[j].id === subtaskId && tasks[j].stages) {
          var stages = tasks[j].stages;
          var srcIdx = -1, tgtIdx = -1;
          for (var k = 0; k < stages.length; k++) {
            if (stages[k].id === srcStageId) srcIdx = k;
            if (stages[k].id === targetStageId) tgtIdx = k;
          }
          if (srcIdx < 0 || tgtIdx < 0) return;
          var found = stages.splice(srcIdx, 1)[0];
          var insertAt = before ? tgtIdx : tgtIdx + 1;
          if (srcIdx < tgtIdx && !before) insertAt--;
          stages.splice(insertAt, 0, found);
          break;
        }
      }
      break;
    }
  }
  saveDateData(currentDate, data);
  renderAll(currentDate);
}

// Reorder stages within same standalone task
function reorderTaskStages(quadrantKey, taskId, srcStageId, targetStageId, before) {
  var data = loadDateData(currentDate);
  for (var i = 0; i < data[quadrantKey].length; i++) {
    if (data[quadrantKey][i].id === taskId && !data[quadrantKey][i].blockName && data[quadrantKey][i].stages) {
      var stages = data[quadrantKey][i].stages;
      var srcIdx = -1, tgtIdx = -1;
      for (var k = 0; k < stages.length; k++) {
        if (stages[k].id === srcStageId) srcIdx = k;
        if (stages[k].id === targetStageId) tgtIdx = k;
      }
      if (srcIdx < 0 || tgtIdx < 0) return;
      var found = stages.splice(srcIdx, 1)[0];
      var insertAt = before ? tgtIdx : tgtIdx + 1;
      if (srcIdx < tgtIdx && !before) insertAt--;
      stages.splice(insertAt, 0, found);
      break;
    }
  }
  saveDateData(currentDate, data);
  renderAll(currentDate);
}
