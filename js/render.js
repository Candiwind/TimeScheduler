// render.js - UI 渲染（创建 DOM 元素）

var currentDate = '';
var searchTerm = '';

function getCurrentDate() { return currentDate; }

function renderAll(date) {
  currentDate = date;
  var data = loadDateData(date);
  QUADRANT_KEYS.forEach(function(key) {
    renderQuadrant(key, data[key] || []);
  });
  updateDateDisplay(date);
  updateStatsBar(data);
  syncQuadrantRowHeights();
}

// Sync quadrant heights within the same row so they match the taller one
function syncQuadrantRowHeights() {
  var row1 = [document.getElementById('quadrant-I'), document.getElementById('quadrant-II')];
  var row2 = [document.getElementById('quadrant-III'), document.getElementById('quadrant-IV')];

  syncRowHeight(row1);
  syncRowHeight(row2);
}

function syncRowHeight(quads) {
  // Reset to auto first to measure natural height
  quads.forEach(function(q) { if (q) q.style.minHeight = ''; });
  // Measure natural heights
  var maxH = 0;
  quads.forEach(function(q) {
    if (q) {
      var h = q.getBoundingClientRect().height;
      if (h > maxH) maxH = h;
    }
  });
  // Apply the taller height as min-height to both
  quads.forEach(function(q) {
    if (q) q.style.minHeight = maxH + 'px';
  });
}

// Render single quadrant only (no stats/date update) - for targeted updates
function renderQuadrantOnly(key) {
  var data = loadDateData(currentDate);
  renderQuadrant(key, data[key] || []);
  updateStatsBar(data);
}

function renderQuadrant(key, items) {
  var container = document.querySelector('#quadrant-' + key + ' .quadrant-tasks');
  if (!container) return;

  // Update count badge — show a/b c% (done/total rate%)
  var countEl = document.getElementById('count-' + key);
  var qc = calcQuadrantCompletion(items);
  if (countEl) {
    countEl.textContent = qc.done + '/' + qc.total + ' ' + Math.round(qc.rate * 100) + '%';
    countEl.style.display = qc.total > 0 ? '' : 'none';
  }
  // Toggle has-tasks class for footer auto-hide (point 7)
  var quadrant = document.getElementById('quadrant-' + key);
  if (quadrant) quadrant.classList.toggle('has-tasks', qc.total > 0);

  // Sort by timeSlot: tasks ordered by time slot, blocks/unset last
  var slotOrder = ['early_morn','forenoon','noon','afternoon','dusk','night'];
  items.sort(function(a, b) {
    var aSlot = (a.blockName === undefined) ? (a.timeSlot || '') : '';
    var bSlot = (b.blockName === undefined) ? (b.timeSlot || '') : '';
    var ai = slotOrder.indexOf(aSlot); var bi = slotOrder.indexOf(bSlot);
    if (ai === -1) ai = 99; if (bi === -1) bi = 99;
    return ai - bi;
  });

  // Filter by search term
  var filtered = items;
  if (searchTerm) {
    filtered = filterItems(items, searchTerm.toLowerCase());
  }

  // Use DocumentFragment for batch DOM insertion
  var frag = document.createDocumentFragment();

  if (!filtered || filtered.length === 0) {
    var empty = document.createElement('div');
    empty.className = 'empty-hint';
    empty.textContent = searchTerm ? '无匹配任务' : '拖拽任务到此处，或点击下方按钮添加';
    frag.appendChild(empty);
  } else {
    filtered.forEach(function(item, index) {
      if (item.blockName !== undefined) {
        frag.appendChild(createTaskBlockElement(item, key, index));
      } else {
        frag.appendChild(createTaskElement(item, key, index));
      }
    });
  }

  container.innerHTML = '';
  container.appendChild(frag);
}

function filterItems(items, term) {
  return items.filter(function(item) {
    if (item.blockName !== undefined) {
      if (item.blockName.toLowerCase().indexOf(term) !== -1) return true;
      if (item.tasks) {
        return item.tasks.some(function(t) { return t.text && t.text.toLowerCase().indexOf(term) !== -1; });
      }
      return false;
    }
    return item.text && item.text.toLowerCase().indexOf(term) !== -1;
  });
}

function countAllTasks(items) {
  var count = 0;
  items.forEach(function(item) {
    if (item.blockName !== undefined) {
      if (item.tasks) {
        item.tasks.forEach(function(t) {
          if (t.stages && t.stages.length > 0) {
            count += t.stages.length;
          } else {
            count++;
          }
        });
      }
    } else {
      if (item.stages && item.stages.length > 0) {
        count += item.stages.length;
      } else {
        count++;
      }
    }
  });
  return count;
}

function createTaskElement(item, quadrantKey, index) {
  var el = document.createElement('div');
  el.className = 'task-item';
  if (item.completed) el.classList.add('completed');
  el.draggable = true;
  el.dataset.type = 'task';
  el.dataset.quadrant = quadrantKey;
  el.dataset.index = index;
  el.dataset.id = item.id;

  var left = document.createElement('div');
  left.className = 'task-left';

  var checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'task-checkbox';
  checkbox.checked = item.completed;
  checkbox.addEventListener('change', function(e) {
    e.stopPropagation();
    toggleTaskComplete(quadrantKey, item.id, checkbox.checked);
  });
  checkbox.addEventListener('dragstart', function(e) { e.preventDefault(); e.stopPropagation(); });
  left.appendChild(checkbox);

  var textSpan = document.createElement('span');
  textSpan.className = 'task-text';
  textSpan.innerHTML = renderTaskText(item.text || '新任务', item.highlights);
  textSpan.dataset.rawText = item.text || '新任务';
  textSpan.addEventListener('dblclick', function(e) {
    e.stopPropagation();
    var rawText = item.text || '新任务';
    startEdit(textSpan, rawText, function(newVal) {
      updateTaskText(quadrantKey, item.id, newVal);
    });
  });
  // Selection tracking for highlight
  textSpan.addEventListener('mouseup', function(e) {
    trackTextSelection(textSpan, quadrantKey, item.id, null);
  });
  textSpan.addEventListener('contextmenu', function(e) {
    showHighlightContextMenu(e, textSpan, quadrantKey, item.id, null);
  });
  left.appendChild(textSpan);

  el.appendChild(left);

  // Big task reference for defer
  if (item.bigTaskRef) {
    el.dataset.bigTaskId = item.bigTaskRef.bigTaskId;
    el.dataset.bigSubtaskId = item.bigTaskRef.subtaskId;
  }

  // Highlight toggle (star button - highlights entire task text)
  var hlBtn = document.createElement('button');
  hlBtn.className = 'task-extra-btn';
  hlBtn.innerHTML = (item.highlights && item.highlights.length > 0) ? '⭐' : '☆';
  hlBtn.title = '高亮/取消高亮整个任务';
  hlBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    toggleTaskHighlight(quadrantKey, item.id, null);
  });
  el.appendChild(hlBtn);

  // Bonus (extra completed) toggle
  var bonusBtn = document.createElement('button');
  bonusBtn.className = 'task-extra-btn';
  bonusBtn.style.color = item.extraCompleted ? '#f0ad4e' : '';
  bonusBtn.innerHTML = '🎁';
  bonusBtn.title = '标记/取消为额外完成';
  bonusBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    toggleTaskExtra(quadrantKey, item.id, null);
  });
  el.appendChild(bonusBtn);

  // Defer button
  var deferBtn = document.createElement('button');
  deferBtn.className = 'task-defer-btn';
  deferBtn.innerHTML = '&#9209;';
  deferBtn.title = '推迟：来自大任务→回到大任务池(日期+1)，其他→待办任务池';
  deferBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    handleDeferTask(quadrantKey, item.id, null);
  });
  el.appendChild(deferBtn);

  // Time slot selector icon
  var timeSlotBtn = createTimeSlotBtn(item.timeSlot || '', quadrantKey, item.id, null);
  el.appendChild(timeSlotBtn);

  var delBtn = document.createElement('button');
  delBtn.className = 'task-delete-btn';
  delBtn.innerHTML = '&times;';
  delBtn.title = '删除任务';
  delBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    deleteTaskWithUndo(quadrantKey, item, null);
  });
  el.appendChild(delBtn);

  var hasStages = item.stages && item.stages.length > 0;

  // When stages exist, hide action buttons — they belong to stages
  if (hasStages) {
    hlBtn.style.display = 'none';
    bonusBtn.style.display = 'none';
    deferBtn.style.display = 'none';
    timeSlotBtn.style.display = 'none';
    // Make checkbox auto-derived
    left.querySelector('input[type=checkbox]').style.pointerEvents = 'none';
    left.querySelector('input[type=checkbox]').style.opacity = '0.5';
  }

  // Prevent inner interactive elements from capturing drag
  [hlBtn, bonusBtn, deferBtn, timeSlotBtn, delBtn].forEach(function(innerEl) {
    if (innerEl) innerEl.addEventListener('dragstart', function(e) { e.preventDefault(); e.stopPropagation(); });
  });

  // Split into stages button
  var splitBtn = document.createElement('button');
  splitBtn.className = 'split-stages-btn';
  splitBtn.innerHTML = '⊞';
  splitBtn.title = '拆分为阶段';
  splitBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    splitTaskIntoStages(quadrantKey, item.id);
  });
  splitBtn.addEventListener('dragstart', function(e) { e.preventDefault(); e.stopPropagation(); });
  el.appendChild(splitBtn);

  // Stages container
  if (item.stages && item.stages.length > 0) {
    var slotOrder = ['early_morn','forenoon','noon','afternoon','dusk','night'];
    item.stages.sort(function(a, b) {
      var ai = slotOrder.indexOf(a.timeSlot || '');
      var bi = slotOrder.indexOf(b.timeSlot || '');
      if (ai === -1) ai = 99; if (bi === -1) bi = 99;
      return ai - bi;
    });
    var stagesContainer = document.createElement('div');
    stagesContainer.className = 'subtask-stages';
    el.classList.add('has-stages');
    var allStagesDone = item.stages.every(function(s) { return s.completed; });
    if (item.completed !== allStagesDone) {
      item.completed = allStagesDone;
      checkbox.checked = allStagesDone;
      if (allStagesDone) { el.classList.add('completed'); } else { el.classList.remove('completed'); }
    }
    item.stages.forEach(function(stage) {
      var stageEl = createStageElementForTask(stage, quadrantKey, item.id);
      stagesContainer.appendChild(stageEl);
    });
    var addStageBtn = document.createElement('button');
    addStageBtn.className = 'add-stage-btn';
    addStageBtn.innerHTML = '+ 阶段';
    addStageBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      addTaskStage(quadrantKey, item.id);
    });
    addStageBtn.addEventListener('dragstart', function(e) { e.preventDefault(); e.stopPropagation(); });
    stagesContainer.appendChild(addStageBtn);
    el.appendChild(stagesContainer);
  }

  // Bind drag handlers directly
  el.addEventListener('dragstart', handleDragStart);
  el.addEventListener('dragend', handleDragEnd);
  el.addEventListener('dragover', handleTaskDragOver);
  el.addEventListener('dragleave', handleTaskDragLeave);
  el.addEventListener('drop', handleTaskDrop);

  return el;
}

function createTaskBlockElement(block, quadrantKey, index) {
  var el = document.createElement('div');
  el.className = 'task-block';
  el.draggable = true;
  el.dataset.type = 'block';
  el.dataset.quadrant = quadrantKey;
  el.dataset.index = index;
  el.dataset.id = block.id;

  var header = document.createElement('div');
  header.className = 'block-header';

  var nameSpan = document.createElement('span');
  nameSpan.className = 'block-name';
  nameSpan.textContent = block.blockName || '任务块';
  nameSpan.addEventListener('dblclick', function(e) {
    e.stopPropagation();
    startEdit(nameSpan, nameSpan.textContent, function(newVal) {
      updateBlockName(quadrantKey, block.id, newVal);
    });
  });
  header.appendChild(nameSpan);

  // Block progress - auto-calculated from subtasks
  var subTotal = (block.tasks && block.tasks.length) || 0;
  var subDone = 0;
  if (block.tasks) {
    block.tasks.forEach(function(t) { if (t.completed) subDone++; });
  }
  var autoPct = subTotal > 0 ? Math.round((subDone / subTotal) * 100) : 0;
  var hasManual = block.progress && block.progress !== '100%' && subTotal === 0;
  var displayPct = subTotal > 0 ? autoPct : (parseInt(block.progress) || 0);

  var progressBtn = document.createElement('button');
  progressBtn.className = 'task-progress-btn';
  progressBtn.textContent = subTotal > 0 ? (subDone + '/' + subTotal + ' ' + autoPct + '%') : (displayPct + '%');
  progressBtn.title = subTotal > 0 ? '子任务完成进度（自动计算）' : '点击设置完成度';
  if (subTotal > 0 && autoPct === 100) {
    progressBtn.style.color = '#5cb85c';
    progressBtn.style.fontWeight = '600';
  }
  progressBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    startSelectEdit(progressBtn, displayPct + '%', COMPLETION_OPTIONS, function(newVal) {
      updateBlockProgress(quadrantKey, block.id, newVal);
    });
  });
  // Prevent button from capturing drag events
  progressBtn.addEventListener('dragstart', function(e) { e.preventDefault(); e.stopPropagation(); });
  header.appendChild(progressBtn);

  var delBlockBtn = document.createElement('button');
  delBlockBtn.className = 'task-delete-btn';
  delBlockBtn.innerHTML = '&times;';
  delBlockBtn.title = '删除任务块';
  delBlockBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    deleteBlockWithUndo(quadrantKey, block, null);
  });
  // Prevent button from capturing drag events
  delBlockBtn.addEventListener('dragstart', function(e) { e.preventDefault(); e.stopPropagation(); });
  header.appendChild(delBlockBtn);

  el.appendChild(header);

  var tasksContainer = document.createElement('div');
  tasksContainer.className = 'block-tasks';
  // Prevent block-tasks area from triggering block drag (subtasks have their own drag)
  tasksContainer.addEventListener('dragstart', function(e) { e.stopPropagation(); });

  if (block.tasks && block.tasks.length > 0) {
    // Sort subtasks by timeSlot
    var slotOrder = ['early_morn','forenoon','noon','afternoon','dusk','night'];
    block.tasks.sort(function(a, b) {
      var ai = slotOrder.indexOf(a.timeSlot || '');
      var bi = slotOrder.indexOf(b.timeSlot || '');
      if (ai === -1) ai = 99; if (bi === -1) bi = 99;
      return ai - bi;
    });
    block.tasks.forEach(function(task) {
      tasksContainer.appendChild(createSubTaskElement(task, quadrantKey, block.id));
    });
  }

  el.appendChild(tasksContainer);

  var addBtn = document.createElement('button');
  addBtn.className = 'add-subtask-btn';
  addBtn.textContent = '+ 添加子任务';
  addBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    addSubTask(quadrantKey, block.id);
  });
  // Prevent add-subtask button from triggering block drag
  addBtn.addEventListener('dragstart', function(e) { e.preventDefault(); e.stopPropagation(); });
  el.appendChild(addBtn);

  // Bind drag handlers directly
  el.addEventListener('dragstart', handleDragStart);
  el.addEventListener('dragend', handleDragEnd);
  el.addEventListener('dragover', handleBlockDragOver);
  el.addEventListener('dragleave', handleBlockDragLeave);
  el.addEventListener('drop', handleBlockDrop);

  return el;
}

function createSubTaskElement(task, quadrantKey, blockId) {
  var el = document.createElement('div');
  el.className = 'subtask-item';
  if (task.completed) el.classList.add('completed');
  el.draggable = true;
  el.dataset.type = 'subtask';
  el.dataset.quadrant = quadrantKey;
  el.dataset.blockId = blockId;
  el.dataset.id = task.id;

  var hasStages = task.stages && task.stages.length > 0;

  var checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'task-checkbox';
  checkbox.checked = task.completed;
  checkbox.addEventListener('change', function(e) {
    e.stopPropagation();
    toggleSubTaskComplete(quadrantKey, blockId, task.id, checkbox.checked);
  });
  checkbox.addEventListener('dragstart', function(e) { e.preventDefault(); e.stopPropagation(); });

  var textSpan = document.createElement('span');
  textSpan.className = 'task-text';
  textSpan.innerHTML = renderTaskText(task.text || '新任务', task.highlights);
  textSpan.dataset.rawText = task.text || '新任务';
  textSpan.addEventListener('dblclick', function(e) {
    e.stopPropagation();
    var rawText = task.text || '新任务';
    startEdit(textSpan, rawText, function(newVal) {
      updateSubTaskText(quadrantKey, blockId, task.id, newVal);
    });
  });
  // Selection tracking for highlight
  textSpan.addEventListener('mouseup', function(e) {
    trackTextSelection(textSpan, quadrantKey, task.id, blockId);
  });
  textSpan.addEventListener('contextmenu', function(e) {
    showHighlightContextMenu(e, textSpan, quadrantKey, task.id, blockId);
  });

  // Big task reference for defer
  if (task.bigTaskRef) {
    el.dataset.bigTaskId = task.bigTaskRef.bigTaskId;
    el.dataset.bigSubtaskId = task.bigTaskRef.subtaskId;
  }

  // Highlight toggle (star button - highlights entire task text)
  var hlBtn = document.createElement('button');
  hlBtn.className = 'task-extra-btn';
  hlBtn.innerHTML = (task.highlights && task.highlights.length > 0) ? '⭐' : '☆';
  hlBtn.title = '高亮/取消高亮整个任务';
  hlBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    toggleTaskHighlight(quadrantKey, task.id, blockId);
  });

  // Bonus (extra completed) toggle
  var bonusBtn = document.createElement('button');
  bonusBtn.className = 'task-extra-btn';
  bonusBtn.style.color = task.extraCompleted ? '#f0ad4e' : '';
  bonusBtn.innerHTML = '🎁';
  bonusBtn.title = '标记/取消为额外完成';
  bonusBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    toggleSubtaskExtra(quadrantKey, blockId, task.id);
  });

  // Defer button
  var deferBtn = document.createElement('button');
  deferBtn.className = 'task-defer-btn';
  deferBtn.innerHTML = '&#9209;';
  deferBtn.title = '推迟：来自大任务→回到大任务池(日期+1)，其他→待办任务池';
  deferBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    handleDeferSubtask(quadrantKey, blockId, task.id);
  });

  var delBtn = document.createElement('button');
  delBtn.className = 'task-delete-btn';
  delBtn.innerHTML = '&times;';
  delBtn.title = '删除子任务';
  delBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    deleteSubTask(quadrantKey, blockId, task.id);
  });

  // Time slot selector icon
  var timeSlotBtn2 = createTimeSlotBtn(task.timeSlot || '', quadrantKey, task.id, blockId);

  el.appendChild(checkbox);
  el.appendChild(textSpan);
  el.appendChild(hlBtn);
  el.appendChild(bonusBtn);
  el.appendChild(deferBtn);
  el.appendChild(timeSlotBtn2);
  el.appendChild(delBtn);

  // When stages exist, hide action buttons — they belong to stages
  if (hasStages) {
    hlBtn.style.display = 'none';
    bonusBtn.style.display = 'none';
    deferBtn.style.display = 'none';
    timeSlotBtn2.style.display = 'none';
    checkbox.style.pointerEvents = 'none';
    checkbox.style.opacity = '0.5';
  }

  // Prevent inner interactive elements from capturing drag
  [checkbox, hlBtn, bonusBtn, deferBtn, timeSlotBtn2, delBtn].forEach(function(innerEl) {
    if (innerEl) innerEl.addEventListener('dragstart', function(e) { e.preventDefault(); e.stopPropagation(); });
  });

  // Drag handlers directly on the subtask-item
  el.addEventListener('dragstart', handleDragStart);
  el.addEventListener('dragend', handleDragEnd);
  el.addEventListener('dragover', handleSubtaskDragOver);
  el.addEventListener('dragleave', handleSubtaskDragLeave);
  el.addEventListener('drop', handleSubtaskDrop);

  // Split into stages button
  var splitBtn = document.createElement('button');
  splitBtn.className = 'split-stages-btn';
  splitBtn.innerHTML = '⊞';
  splitBtn.title = '拆分为阶段';
  splitBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    splitSubtaskIntoStages(quadrantKey, blockId, task.id);
  });
  splitBtn.addEventListener('dragstart', function(e) { e.preventDefault(); e.stopPropagation(); });
  el.appendChild(splitBtn);

  // Stages container (rendered below the subtask row)
  if (task.stages && task.stages.length > 0) {
    var slotOrder2 = ['early_morn','forenoon','noon','afternoon','dusk','night'];
    task.stages.sort(function(a, b) {
      var ai = slotOrder2.indexOf(a.timeSlot || '');
      var bi = slotOrder2.indexOf(b.timeSlot || '');
      if (ai === -1) ai = 99; if (bi === -1) bi = 99;
      return ai - bi;
    });
    var stagesContainer = document.createElement('div');
    stagesContainer.className = 'subtask-stages';
    el.classList.add('has-stages');
    var allStagesDone = task.stages.every(function(s) { return s.completed; });
    if (task.completed !== allStagesDone) {
      task.completed = allStagesDone;
      // Update checkbox to match
      checkbox.checked = allStagesDone;
      if (allStagesDone) { el.classList.add('completed'); } else { el.classList.remove('completed'); }
    }
    task.stages.forEach(function(stage) {
      var stageEl = createStageElement(stage, quadrantKey, blockId, task.id);
      stagesContainer.appendChild(stageEl);
    });
    // Add stage button
    var addStageBtn = document.createElement('button');
    addStageBtn.className = 'add-stage-btn';
    addStageBtn.innerHTML = '+ 阶段';
    addStageBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      addStage(quadrantKey, blockId, task.id);
    });
    addStageBtn.addEventListener('dragstart', function(e) { e.preventDefault(); e.stopPropagation(); });
    stagesContainer.appendChild(addStageBtn);
    el.appendChild(stagesContainer);
  }

  return el;
}

function createStageElement(stage, quadrantKey, blockId, subtaskId) {
  var stageRow = document.createElement('div');
  stageRow.className = 'subtask-stage-item';
  if (stage.completed) stageRow.classList.add('completed');
  stageRow.draggable = true;
  stageRow.dataset.type = 'stage';
  stageRow.dataset.quadrant = quadrantKey;
  stageRow.dataset.blockId = blockId;
  stageRow.dataset.subtaskId = subtaskId;
  stageRow.dataset.stageId = stage.id;

  var stageCheckbox = document.createElement('input');
  stageCheckbox.type = 'checkbox';
  stageCheckbox.className = 'task-checkbox stage-checkbox';
  stageCheckbox.checked = stage.completed;
  stageCheckbox.addEventListener('change', function(e) {
    e.stopPropagation();
    toggleStageComplete(quadrantKey, blockId, subtaskId, stage.id, stageCheckbox.checked);
  });
  stageCheckbox.addEventListener('dragstart', function(e) { e.preventDefault(); e.stopPropagation(); });

  var stageText = document.createElement('span');
  stageText.className = 'task-text stage-text';
  stageText.innerHTML = renderTaskText(stage.text || '', stage.highlights);
  stageText.dataset.rawText = stage.text || '';
  stageText.addEventListener('dblclick', function(e) {
    e.stopPropagation();
    startEdit(stageText, stageText.dataset.rawText, function(newVal) {
      updateStageText(quadrantKey, blockId, subtaskId, stage.id, newVal);
    });
  });

  // Highlight button
  var hlBtn = document.createElement('button');
  hlBtn.className = 'task-extra-btn';
  hlBtn.innerHTML = (stage.highlights && stage.highlights.length > 0) ? '⭐' : '☆';
  hlBtn.title = '高亮/取消高亮';
  hlBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    toggleSubtaskStageHighlight(quadrantKey, blockId, subtaskId, stage.id);
  });

  // Bonus button
  var bonusBtn = document.createElement('button');
  bonusBtn.className = 'task-extra-btn';
  bonusBtn.style.color = stage.extraCompleted ? '#f0ad4e' : '';
  bonusBtn.innerHTML = '🎁';
  bonusBtn.title = '标记/取消为额外完成';
  bonusBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    toggleSubtaskStageExtra(quadrantKey, blockId, subtaskId, stage.id);
  });

  // Defer button
  var deferBtn = document.createElement('button');
  deferBtn.className = 'task-defer-btn';
  deferBtn.innerHTML = '&#9209;';
  deferBtn.title = '推迟';
  deferBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    deferSubtaskStage(quadrantKey, blockId, subtaskId, stage.id);
  });

  // Time slot button
  var timeSlotBtn = createTimeSlotBtn(stage.timeSlot || '', quadrantKey, null, null, {
    setFn: function(slotKey) { setSubtaskStageTimeSlot(quadrantKey, blockId, subtaskId, stage.id, slotKey); }
  });

  var delBtn = document.createElement('button');
  delBtn.className = 'task-delete-btn stage-del-btn';
  delBtn.innerHTML = '&times;';
  delBtn.title = '删除阶段';
  delBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    deleteStage(quadrantKey, blockId, subtaskId, stage.id);
  });
  delBtn.addEventListener('dragstart', function(e) { e.preventDefault(); e.stopPropagation(); });

  [stageCheckbox, hlBtn, bonusBtn, deferBtn, timeSlotBtn, delBtn].forEach(function(innerEl) {
    if (innerEl) innerEl.addEventListener('dragstart', function(e) { e.preventDefault(); e.stopPropagation(); });
  });

  stageRow.appendChild(stageCheckbox);
  stageRow.appendChild(stageText);
  stageRow.appendChild(hlBtn);
  stageRow.appendChild(bonusBtn);
  stageRow.appendChild(deferBtn);
  if (timeSlotBtn) stageRow.appendChild(timeSlotBtn);
  stageRow.appendChild(delBtn);

  // Drag handlers for stage
  stageRow.addEventListener('dragstart', handleStageDragStart);
  stageRow.addEventListener('dragend', handleStageDragEnd);
  stageRow.addEventListener('dragover', handleStageDragOver);
  stageRow.addEventListener('dragleave', handleStageDragLeave);
  stageRow.addEventListener('drop', handleStageDrop);

  return stageRow;
}

function createStageElementForTask(stage, quadrantKey, taskId) {
  var stageRow = document.createElement('div');
  stageRow.className = 'subtask-stage-item';
  if (stage.completed) stageRow.classList.add('completed');
  stageRow.draggable = true;
  stageRow.dataset.type = 'stage';
  stageRow.dataset.quadrant = quadrantKey;
  stageRow.dataset.taskId = taskId;
  stageRow.dataset.stageId = stage.id;

  var stageCheckbox = document.createElement('input');
  stageCheckbox.type = 'checkbox';
  stageCheckbox.className = 'task-checkbox stage-checkbox';
  stageCheckbox.checked = stage.completed;
  stageCheckbox.addEventListener('change', function(e) {
    e.stopPropagation();
    toggleTaskStageComplete(quadrantKey, taskId, stage.id, stageCheckbox.checked);
  });
  stageCheckbox.addEventListener('dragstart', function(e) { e.preventDefault(); e.stopPropagation(); });

  var stageText = document.createElement('span');
  stageText.className = 'task-text stage-text';
  stageText.innerHTML = renderTaskText(stage.text || '', stage.highlights);
  stageText.dataset.rawText = stage.text || '';
  stageText.addEventListener('dblclick', function(e) {
    e.stopPropagation();
    startEdit(stageText, stageText.dataset.rawText, function(newVal) {
      updateTaskStageText(quadrantKey, taskId, stage.id, newVal);
    });
  });

  var hlBtn = document.createElement('button');
  hlBtn.className = 'task-extra-btn';
  hlBtn.innerHTML = (stage.highlights && stage.highlights.length > 0) ? '⭐' : '☆';
  hlBtn.title = '高亮/取消高亮';
  hlBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    toggleTaskStageHighlight(quadrantKey, taskId, stage.id);
  });

  var bonusBtn = document.createElement('button');
  bonusBtn.className = 'task-extra-btn';
  bonusBtn.style.color = stage.extraCompleted ? '#f0ad4e' : '';
  bonusBtn.innerHTML = '🎁';
  bonusBtn.title = '标记/取消为额外完成';
  bonusBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    toggleTaskStageExtra(quadrantKey, taskId, stage.id);
  });

  var deferBtn = document.createElement('button');
  deferBtn.className = 'task-defer-btn';
  deferBtn.innerHTML = '&#9209;';
  deferBtn.title = '推迟';
  deferBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    deferTaskStage(quadrantKey, taskId, stage.id);
  });

  var timeSlotBtn = createTimeSlotBtn(stage.timeSlot || '', quadrantKey, null, null, {
    setFn: function(slotKey) { setTaskStageTimeSlot(quadrantKey, taskId, stage.id, slotKey); }
  });

  var delBtn = document.createElement('button');
  delBtn.className = 'task-delete-btn stage-del-btn';
  delBtn.innerHTML = '&times;';
  delBtn.title = '删除阶段';
  delBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    deleteTaskStage(quadrantKey, taskId, stage.id);
  });
  delBtn.addEventListener('dragstart', function(e) { e.preventDefault(); e.stopPropagation(); });

  [stageCheckbox, hlBtn, bonusBtn, deferBtn, timeSlotBtn, delBtn].forEach(function(innerEl) {
    if (innerEl) innerEl.addEventListener('dragstart', function(e) { e.preventDefault(); e.stopPropagation(); });
  });

  stageRow.appendChild(stageCheckbox);
  stageRow.appendChild(stageText);
  stageRow.appendChild(hlBtn);
  stageRow.appendChild(bonusBtn);
  stageRow.appendChild(deferBtn);
  if (timeSlotBtn) stageRow.appendChild(timeSlotBtn);
  stageRow.appendChild(delBtn);

  stageRow.addEventListener('dragstart', handleStageDragStart);
  stageRow.addEventListener('dragend', handleStageDragEnd);
  stageRow.addEventListener('dragover', handleStageDragOver);
  stageRow.addEventListener('dragleave', handleStageDragLeave);
  stageRow.addEventListener('drop', handleStageDrop);

  return stageRow;
}

function updateDateDisplay(date) {
  var picker = document.getElementById('datePicker');
  if (picker) picker.value = date;
  document.title = '四象限任务管理器 - ' + date;
}

// Weighted completion: all tasks have equal weight, auto-adjusts with task count
// Each task weight = 100/N%, when all completed weighted sum = 100%

function calcQuadrantCompletion(items) {
  var total = 0, done = 0;
  items.forEach(function(item) {
    if (item.blockName !== undefined) {
      if (item.tasks) {
        item.tasks.forEach(function(t) {
          if (t.stages && t.stages.length > 0) {
            t.stages.forEach(function(s) { total++; if (s.completed) done++; });
          } else {
            total++;
            if (t.completed) done++;
          }
        });
      }
    } else {
      if (item.stages && item.stages.length > 0) {
        item.stages.forEach(function(s) { total++; if (s.completed) done++; });
      } else {
        total++;
        if (item.completed) done++;
      }
    }
  });
  return { total: total, done: done, rate: total > 0 ? done / total : 0 };
}

function calcWeightedCompletion(data) {
  var totalAll = 0, doneAll = 0;
  var quadRates = {};
  QUADRANT_KEYS.forEach(function(key) {
    var qc = calcQuadrantCompletion(data[key] || []);
    quadRates[key] = qc;
    totalAll += qc.total;
    doneAll += qc.done;
  });
  // Equal weight per task: each task contributes 1/N of total
  // Weight auto-adjusts as task count changes; all done = 100%
  var weightedRate = totalAll > 0 ? Math.round((doneAll / totalAll) * 100) : 0;
  return {
    total: totalAll,
    done: doneAll,
    simpleRate: weightedRate,
    weightedRate: weightedRate,
    quadRates: quadRates
  };
}

// Time slot completion: group by pairs
function calcTimeSlotCompletion(data) {
  var groups = {
    '早晨 + 上午': { total: 0, done: 0, icons: '🌄🕘' },
    '中午 + 下午': { total: 0, done: 0, icons: '☀️🕒' },
    '傍晚 + 晚上': { total: 0, done: 0, icons: '🌇🌙' }
  };
  var slotToGroup = {
    'early_morn': '早晨 + 上午',
    'forenoon': '早晨 + 上午',
    'noon': '中午 + 下午',
    'afternoon': '中午 + 下午',
    'dusk': '傍晚 + 晚上',
    'night': '傍晚 + 晚上'
  };
  QUADRANT_KEYS.forEach(function(key) {
    var items = data[key] || [];
    items.forEach(function(item) {
      if (item.blockName !== undefined) {
        if (item.tasks) {
          item.tasks.forEach(function(t) {
            if (t.stages && t.stages.length > 0) {
              t.stages.forEach(function(s) {
                var g = slotToGroup[s.timeSlot];
                if (g) { groups[g].total++; if (s.completed) groups[g].done++; }
              });
            } else {
              var g = slotToGroup[t.timeSlot];
              if (g) { groups[g].total++; if (t.completed) groups[g].done++; }
            }
          });
        }
      } else {
        if (item.stages && item.stages.length > 0) {
          item.stages.forEach(function(s) {
            var g = slotToGroup[s.timeSlot];
            if (g) { groups[g].total++; if (s.completed) groups[g].done++; }
          });
        } else {
          var g = slotToGroup[item.timeSlot];
          if (g) { groups[g].total++; if (item.completed) groups[g].done++; }
        }
      }
    });
  });
  return groups;
}

function updateStatsBar(data) {
  var stats = calcWeightedCompletion(data);
  var hcDone = document.getElementById('hcDone');
  var hcTotal = document.getElementById('hcTotal');
  var hcRate = document.getElementById('hcRate');
  if (hcDone) hcDone.textContent = stats.done;
  if (hcTotal) hcTotal.textContent = stats.total;
  if (hcRate) hcRate.textContent = stats.weightedRate + '%';
  var deferCount = data._deferred || 0;
  var hcEl = document.getElementById('headerCompletion');
  if (hcEl) {
    hcEl.title = '今日整体完成情况';
  }

  // Time slot breakdown in header — each group in a pill badge
  var slotStats = calcTimeSlotCompletion(data);
  var slotEl = document.getElementById('headerSlotBreakdown');
  if (!slotEl) return;
  var slotGroupKeys = ['早晨 + 上午', '中午 + 下午', '傍晚 + 晚上'];
  var parts = [];
  slotGroupKeys.forEach(function(gk) {
    var gd = slotStats[gk];
    var rate = gd.total > 0 ? Math.round((gd.done / gd.total) * 100) : 0;
    parts.push('<span class="header-slot-badge" title="' + gk + '">' + gd.icons + ' <span>' + gd.done + '/' + gd.total + ' ' + rate + '%</span></span>');
  });
  if (deferCount > 0) {
    parts.push('<span class="header-slot-badge" title="今日推迟任务数">⏩ <span>' + deferCount + '推迟</span></span>');
  }
  slotEl.style.display = '';
  slotEl.innerHTML = parts.join('');
}

function setSearchTerm(term) {
  searchTerm = term;
  renderAll(currentDate);
}

function refreshCurrentView() {
  renderAll(currentDate);
}

// Shared helper: render task text with highlight ranges
function renderTaskText(text, highlights) {
  if (!text) return '';
  var escaped = escHtml(text);
  if (!highlights || highlights.length === 0) return escaped;

  // Sort highlights by start position, merge overlapping
  var sorted = highlights.slice().sort(function(a, b) { return a.start - b.start; });
  var merged = [];
  sorted.forEach(function(h) {
    if (merged.length > 0 && h.start <= merged[merged.length - 1].end) {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, h.end);
    } else {
      merged.push({ start: h.start, end: h.end });
    }
  });

  // Build result with <mark> tags
  var result = '';
  var pos = 0;
  merged.forEach(function(h) {
    // Ensure positions are within bounds
    var s = Math.max(0, Math.min(h.start, escaped.length));
    var e = Math.max(s, Math.min(h.end, escaped.length));
    if (s > pos) result += escaped.substring(pos, s);
    if (e > s) result += '<mark>' + escaped.substring(s, e) + '</mark>';
    pos = e;
  });
  result += escaped.substring(pos);
  return result;
}

// Shared helper: create a text-based date input (avoids native date input typing issues)
function createDateTextInput(value, onChange, onBlur) {
  var input = document.createElement('input');
  input.type = 'text';
  input.className = 'inline-edit-input';
  input.placeholder = 'YYYY-MM-DD';
  input.value = value || '';
  input.style.width = '130px';
  var datePattern = /^\d{4}-\d{2}-\d{2}$/;
  input.addEventListener('change', function() {
    if (datePattern.test(input.value.trim())) {
      onChange(input.value.trim());
    }
  });
  input.addEventListener('blur', function() {
    if (datePattern.test(input.value.trim())) {
      onChange(input.value.trim());
    }
    if (onBlur) onBlur();
  });
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      if (datePattern.test(input.value.trim())) {
        onChange(input.value.trim());
      }
      if (onBlur) onBlur();
    }
    if (e.key === 'Escape') {
      if (onBlur) onBlur();
    }
  });
  return input;
}

// Shared helper: create time-slot selector button
function createTimeSlotBtn(currentKey, quadrantKey, taskId, blockId, opts) {
  var slot = TIME_SLOTS.find(function(s) { return s.key === currentKey; }) || TIME_SLOTS[0];
  var btn = document.createElement('button');
  btn.className = 'task-timeslot-btn';
  btn.title = slot.title;
  btn.innerHTML = slot.icon;
  btn.setAttribute('data-slot-key', slot.key);
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (opts && opts.setFn) {
      showTimeSlotPickerCustom(btn, opts.setFn);
    } else {
      showTimeSlotPicker(btn, quadrantKey, taskId, blockId);
    }
  });
  return btn;
}

function showTimeSlotPickerCustom(anchorEl, setFn) {
  var existing = document.getElementById('timeslotPicker');
  if (existing) existing.remove();
  var picker = document.createElement('div');
  picker.id = 'timeslotPicker';
  picker.className = 'timeslot-picker';
  TIME_SLOTS.forEach(function(slot) {
    var opt = document.createElement('div');
    opt.className = 'timeslot-option';
    if (slot.key === (anchorEl.getAttribute('data-slot-key') || '')) {
      opt.classList.add('active');
    }
    opt.innerHTML = '<span class="timeslot-icon">' + slot.icon + '</span><span class="timeslot-label">' + slot.label + '</span>';
    opt.addEventListener('click', function(ev) {
      ev.stopPropagation();
      setFn(slot.key);
      anchorEl.innerHTML = slot.icon;
      anchorEl.setAttribute('data-slot-key', slot.key);
      anchorEl.title = slot.title;
      picker.remove();
    });
    picker.appendChild(opt);
  });
  // Position near the button
  var rect = anchorEl.getBoundingClientRect();
  picker.style.position = 'fixed';
  picker.style.top = (rect.bottom + 4) + 'px';
  picker.style.left = Math.min(rect.left, window.innerWidth - 200) + 'px';
  document.body.appendChild(picker);
  setTimeout(function() {
    document.addEventListener('click', function closePicker() {
      if (picker.parentNode) picker.remove();
      document.removeEventListener('click', closePicker);
    });
  }, 0);
}

function showTimeSlotPicker(anchorEl, quadrantKey, taskId, blockId) {
  // Remove existing picker
  var existing = document.getElementById('timeslotPicker');
  if (existing) existing.remove();

  var picker = document.createElement('div');
  picker.id = 'timeslotPicker';
  picker.className = 'timeslot-picker';

  TIME_SLOTS.forEach(function(slot) {
    var opt = document.createElement('div');
    opt.className = 'timeslot-option';
    if (slot.key === (anchorEl.getAttribute('data-slot-key') || '')) {
      opt.classList.add('active');
    }
    opt.innerHTML = '<span class="timeslot-icon">' + slot.icon + '</span><span class="timeslot-label">' + slot.label + '</span>';
    opt.addEventListener('click', function(ev) {
      ev.stopPropagation();
      updateTaskTimeSlot(quadrantKey, taskId, blockId, slot.key);
      anchorEl.innerHTML = slot.icon;
      anchorEl.setAttribute('data-slot-key', slot.key);
      anchorEl.title = slot.title;
      picker.remove();
    });
    picker.appendChild(opt);
  });

  // Position near the anchor
  var rect = anchorEl.getBoundingClientRect();
  picker.style.left = rect.left + 'px';
  picker.style.top = (rect.bottom + 4) + 'px';

  document.body.appendChild(picker);

  // Close on outside click
  setTimeout(function() {
    document.addEventListener('click', function closePicker(ev) {
      if (!picker.contains(ev.target) && ev.target !== anchorEl) {
        if (picker.parentNode) picker.remove();
      }
      document.removeEventListener('click', closePicker);
    }, { once: true });
  }, 10);
}

// ============ Unified Plan Pool Panel (tab切换: 待办/周/月) ============

var activePlanPool = 'future';

var PLAN_POOL_CONFIGS = {
  future: {
    poolKey: FUTURE_TASK_KEY,
    emptyText: '暂无待办任务，点击下方按钮添加。设定日期和象限后，到期自动加入日程表。',
    deleteConfirm: '确定删除该待办任务？',
    loadFn: loadFutureTasks,
    updateFn: updateFutureTask,
    deleteFn: deleteFutureTask,
    editSubFn: editFutureSubtaskField,
    deleteSubFn: deleteFutureSubtask,
    addSubFn: addFutureSubtask
  },
  week: {
    poolKey: WEEK_TASK_KEY,
    emptyText: '暂无周计划任务，点击下方按钮添加。设定日期和象限后，当周自动加入日程表。',
    deleteConfirm: '确定删除该周计划任务？',
    loadFn: loadWeekTasks,
    updateFn: updateWeekTask,
    deleteFn: deleteWeekTask,
    editSubFn: editWeekSubtaskField,
    deleteSubFn: deleteWeekSubtask,
    addSubFn: addWeekSubtask
  },
  month: {
    poolKey: MONTH_TASK_KEY,
    emptyText: '暂无月计划任务，点击下方按钮添加。设定日期和象限后，当月自动加入日程表。',
    deleteConfirm: '确定删除该月计划任务？',
    loadFn: loadMonthTasks,
    updateFn: updateMonthTask,
    deleteFn: deleteMonthTask,
    editSubFn: editMonthSubtaskField,
    deleteSubFn: deleteMonthSubtask,
    addSubFn: addMonthSubtask
  }
};

function renderPlanPoolPanel() {
  var cfg = PLAN_POOL_CONFIGS[activePlanPool];
  if (!cfg) return;
  var ptasks = cfg.loadFn();
  var listEl = document.getElementById('planPoolList');
  var countEl = document.getElementById('planPoolTotalCount');
  var emptyEl = document.getElementById('planPoolEmpty');

  var allCount = loadFutureTasks().length + loadWeekTasks().length + loadMonthTasks().length;
  if (countEl) countEl.textContent = allCount;

  if (!listEl) return;

  if (ptasks.length === 0) {
    listEl.innerHTML = '';
    if (emptyEl) { listEl.appendChild(emptyEl); emptyEl.textContent = cfg.emptyText; }
    return;
  }

  // Panel collapse state is user-controlled — no auto-expand
  var html = '';
  ptasks.forEach(function(ft) {
    if (ft.type === 'block') {
      html += _renderPlanBlockHTML(ft);
    } else {
      html += _renderPlanTaskHTML(ft);
    }
  });
  listEl.innerHTML = html;

  listEl.querySelectorAll('.planpool-item-text').forEach(function(el) {
    el.addEventListener('dblclick', function(e) {
      e.stopPropagation();
      var ftId = this.dataset.ftId;
      startEdit(this, this.textContent, function(newVal) {
        cfg.updateFn(ftId, { text: newVal });
        renderPlanPoolPanel();
      });
    });
  });

  listEl.querySelectorAll('.planpool-item-date').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      var ftId = this.dataset.ftId;
      var input = createDateTextInput(this.dataset.value, function(newVal) {
        cfg.updateFn(ftId, { scheduledDate: newVal });
      }, function() { renderPlanPoolPanel(); });
      this.innerHTML = ''; this.appendChild(input); input.focus();
    });
  });

  listEl.querySelectorAll('.planpool-item-quad').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      var ftId = this.dataset.ftId;
      var curVal = this.dataset.value || '';
      startSelectEdit(this, curVal || '选择象限', ['I', 'II', 'III', 'IV', '（未指定）'], function(newVal) {
        var quadKey = newVal === '（未指定）' ? '' : newVal;
        cfg.updateFn(ftId, { targetQuadrant: quadKey });
        renderPlanPoolPanel();
      });
    });
  });

  listEl.querySelectorAll('.planpool-delete-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (confirm(cfg.deleteConfirm)) {
        cfg.deleteFn(this.dataset.ftId);
        renderPlanPoolPanel();
      }
    });
  });

  listEl.querySelectorAll('.planpool-block-name').forEach(function(el) {
    el.addEventListener('dblclick', function(e) {
      e.stopPropagation();
      var ftId = this.dataset.ftId;
      startEdit(this, this.textContent, function(newVal) {
        cfg.updateFn(ftId, { blockName: newVal });
        renderPlanPoolPanel();
      });
    });
  });

  listEl.querySelectorAll('.pp-block-date, .pp-block-quad').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      var ftId = this.dataset.ftId;
      var field = this.classList.contains('pp-block-date') ? 'scheduledDate' : 'targetQuadrant';
      if (field === 'scheduledDate') {
        var input = createDateTextInput(this.dataset.value, function(newVal) {
          cfg.updateFn(ftId, { scheduledDate: newVal });
        }, function() { renderPlanPoolPanel(); });
        this.innerHTML = ''; this.appendChild(input); input.focus();
      } else {
        var curVal = this.dataset.value || '';
        startSelectEdit(this, curVal || '选择象限', ['I', 'II', 'III', 'IV', '（未指定）'], function(newVal) {
          var quadKey = newVal === '（未指定）' ? '' : newVal;
          cfg.updateFn(ftId, { targetQuadrant: quadKey });
          renderPlanPoolPanel();
        });
      }
    });
  });

  listEl.querySelectorAll('.planpool-subtask-text').forEach(function(el) {
    el.addEventListener('dblclick', function(e) {
      e.stopPropagation();
      var ftId = this.dataset.ftId;
      var stId = this.dataset.stId;
      startEdit(this, this.textContent, function(newVal) {
        cfg.editSubFn(ftId, stId, 'text', newVal);
        renderPlanPoolPanel();
      });
    });
  });

  listEl.querySelectorAll('.pp-st-date').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      var ftId = this.dataset.ftId;
      var stId = this.dataset.stId;
      var input = createDateTextInput(this.dataset.value, function(newVal) {
        cfg.editSubFn(ftId, stId, 'scheduledDate', newVal);
      }, function() { renderPlanPoolPanel(); });
      this.innerHTML = ''; this.appendChild(input); input.focus();
    });
  });

  listEl.querySelectorAll('.pp-st-quad').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      var ftId = this.dataset.ftId;
      var stId = this.dataset.stId;
      var curVal = this.dataset.value || '';
      startSelectEdit(this, curVal || '选择象限', ['I', 'II', 'III', 'IV', '（未指定）'], function(newVal) {
        var quadKey = newVal === '（未指定）' ? '' : newVal;
        cfg.editSubFn(ftId, stId, 'targetQuadrant', quadKey);
        renderPlanPoolPanel();
      });
    });
  });

  listEl.querySelectorAll('.pp-st-delete-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (!confirm('删除该子任务？')) return;
      cfg.deleteSubFn(this.dataset.ftId, this.dataset.stId);
      renderPlanPoolPanel();
    });
  });

  listEl.querySelectorAll('.pp-add-st-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var ftId = this.dataset.ftId;
      var text = prompt('子任务内容：');
      if (!text) return;
      cfg.addSubFn(ftId, text);
      renderPlanPoolPanel();
    });
  });

  listEl.querySelectorAll('.planpool-draggable').forEach(function(el) {
    el.addEventListener('dragstart', handleFutureDragStart);
    el.addEventListener('dragend', handleFutureDragEnd);
  });
}

function switchPlanPoolTab(poolName) {
  if (activePlanPool === poolName) return;
  activePlanPool = poolName;
  var tabs = document.querySelectorAll('.planpool-tab');
  tabs.forEach(function(t) {
    t.classList.toggle('active', t.dataset.pool === poolName);
  });
  renderPlanPoolPanel();
}

function renderFutureTaskPanel() { if (activePlanPool === 'future') renderPlanPoolPanel(); }
function renderWeekTaskPanel() { if (activePlanPool === 'week') renderPlanPoolPanel(); }
function renderMonthTaskPanel() { if (activePlanPool === 'month') renderPlanPoolPanel(); }

function _renderPlanTaskHTML(ft) {
  var dateDisplay = ft.scheduledDate || '📅 设定日期';
  var quadDisplay = QUADRANTS[ft.targetQuadrant] ? QUADRANTS[ft.targetQuadrant].icon + ' ' + QUADRANTS[ft.targetQuadrant].label : '选择象限';
  var quadClass = ft.targetQuadrant ? ' set' : '';
  var today = new Date().toISOString().split('T')[0];
  var dateClass = (ft.scheduledDate && ft.scheduledDate === today) ? ' arrived' : '';

  return '<div class="planpool-item planpool-draggable" draggable="true" data-ft-id="' + ft.id + '" data-ft-text="' + escHtml(ft.text || '') + '">' +
    '<span class="planpool-item-text" data-ft-id="' + ft.id + '" title="双击编辑内容">' + renderTaskText(ft.text || '新任务') + '</span>' +
    '<span class="planpool-item-date' + dateClass + '" data-ft-id="' + ft.id + '" data-value="' + (ft.scheduledDate || '') + '" title="点击设定日期">' + dateDisplay + '</span>' +
    '<span class="planpool-item-quad' + quadClass + '" data-ft-id="' + ft.id + '" data-value="' + (ft.targetQuadrant || '') + '" title="点击选择象限">' + quadDisplay + '</span>' +
    '<button class="task-delete-btn planpool-delete-btn" data-ft-id="' + ft.id + '" title="删除">&times;</button>' +
    '</div>';
}

function _renderPlanBlockHTML(ft) {
  var dateDisplay = ft.scheduledDate || '📅 设定日期';
  var quadDisplay = QUADRANTS[ft.targetQuadrant] ? QUADRANTS[ft.targetQuadrant].icon + ' ' + QUADRANTS[ft.targetQuadrant].label : '选择象限';
  var today = new Date().toISOString().split('T')[0];
  var dateClass = (ft.scheduledDate && ft.scheduledDate === today) ? ' arrived' : '';

  var h = '<div class="planpool-block">';
  h += '<div class="planpool-block-header">';
  h += '<span class="planpool-block-name" data-ft-id="' + ft.id + '" title="双击编辑名称">📦 ' + escHtml(ft.blockName || '新任务块') + '</span>';
  h += '<div class="planpool-block-meta">';
  h += '<span class="planpool-item-date pp-block-date' + dateClass + '" data-ft-id="' + ft.id + '" data-value="' + (ft.scheduledDate || '') + '" title="点击设定日期">' + dateDisplay + '</span>';
  h += '<span class="planpool-item-quad pp-block-quad" data-ft-id="' + ft.id + '" data-value="' + (ft.targetQuadrant || '') + '" title="点击选择象限">' + quadDisplay + '</span>';
  h += '</div>';
  h += '<button class="task-delete-btn planpool-delete-btn" data-ft-id="' + ft.id + '" title="删除">&times;</button>';
  h += '</div>';

  h += '<div class="planpool-block-tasks">';
  if (ft.tasks && ft.tasks.length > 0) {
    ft.tasks.forEach(function(st) {
      var stDateDisplay = st.scheduledDate || '📅';
      var stQuadDisplay = QUADRANTS[st.targetQuadrant] ? QUADRANTS[st.targetQuadrant].icon : '';
      h += '<div class="planpool-subtask-item planpool-draggable" draggable="true" data-ft-id="' + ft.id + '" data-st-id="' + st.id + '" data-ft-text="' + escHtml(st.text || '') + '">';
      h += '<span class="planpool-subtask-text" data-ft-id="' + ft.id + '" data-st-id="' + st.id + '" title="双击编辑内容">' + renderTaskText(st.text) + '</span>';
      h += '<span class="planpool-item-date pp-st-date" data-ft-id="' + ft.id + '" data-st-id="' + st.id + '" data-value="' + (st.scheduledDate || '') + '" title="点击设定日期">' + stDateDisplay + '</span>';
      h += '<span class="planpool-item-quad pp-st-quad" data-ft-id="' + ft.id + '" data-st-id="' + st.id + '" data-value="' + (st.targetQuadrant || '') + '" title="点击选择象限">' + (stQuadDisplay || '选择象限') + '</span>';
      h += '<button class="task-delete-btn pp-st-delete-btn" data-ft-id="' + ft.id + '" data-st-id="' + st.id + '" title="删除子任务" style="width:18px;height:18px;font-size:12px;">&times;</button>';
      h += '</div>';
    });
  } else {
    h += '<div style="font-size:11px;color:var(--text3);padding:4px;">（无子任务）</div>';
  }
  h += '<button class="add-subtask-btn pp-add-st-btn" data-ft-id="' + ft.id + '" style="border-radius:6px;margin-top:2px;">+ 添加子任务</button>';
  h += '</div>';
  h += '</div>';
  return h;
}

function _editPlanSubtaskField(poolKey, saveFn, ftId, stId, field, value) {
  var tasks = loadPlanTasks(poolKey);
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === ftId && tasks[i].tasks) {
      for (var j = 0; j < tasks[i].tasks.length; j++) {
        if (tasks[i].tasks[j].id === stId) {
          tasks[i].tasks[j][field] = value;
          saveFn(tasks);
          return;
        }
      }
    }
  }
}

function _deletePlanSubtask(poolKey, saveFn, ftId, stId) {
  var tasks = loadPlanTasks(poolKey);
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === ftId && tasks[i].tasks) {
      tasks[i].tasks = tasks[i].tasks.filter(function(st) { return st.id !== stId; });
      saveFn(tasks);
      return;
    }
  }
}

function _addPlanSubtask(poolKey, saveFn, ftId, text) {
  var tasks = loadPlanTasks(poolKey);
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === ftId) {
      if (!tasks[i].tasks) tasks[i].tasks = [];
      tasks[i].tasks.push({
        id: 'fst_' + generateId(),
        text: text,
        scheduledDate: '',
        targetQuadrant: ''
      });
      saveFn(tasks);
      return;
    }
  }
}

function editFutureSubtaskField(ftId, stId, field, value) { _editPlanSubtaskField(FUTURE_TASK_KEY, saveFutureTasks, ftId, stId, field, value); }
function deleteFutureSubtask(ftId, stId) { _deletePlanSubtask(FUTURE_TASK_KEY, saveFutureTasks, ftId, stId); }
function addFutureSubtask(ftId, text) { _addPlanSubtask(FUTURE_TASK_KEY, saveFutureTasks, ftId, text); }

function editWeekSubtaskField(ftId, stId, field, value) { _editPlanSubtaskField(WEEK_TASK_KEY, saveWeekTasks, ftId, stId, field, value); }
function deleteWeekSubtask(ftId, stId) { _deletePlanSubtask(WEEK_TASK_KEY, saveWeekTasks, ftId, stId); }
function addWeekSubtask(ftId, text) { _addPlanSubtask(WEEK_TASK_KEY, saveWeekTasks, ftId, text); }

function editMonthSubtaskField(ftId, stId, field, value) { _editPlanSubtaskField(MONTH_TASK_KEY, saveMonthTasks, ftId, stId, field, value); }
function deleteMonthSubtask(ftId, stId) { _deletePlanSubtask(MONTH_TASK_KEY, saveMonthTasks, ftId, stId); }
function addMonthSubtask(ftId, text) { _addPlanSubtask(MONTH_TASK_KEY, saveMonthTasks, ftId, text); }

// ============ Principles Panel Render ============

function renderPrinciplesPanel() {
  var data = loadPrinciples();
  var countEl = document.getElementById('principlesCount');
  if (countEl) countEl.textContent = data.principles.length;

  var dateDisplay = document.getElementById('principlesDateDisplay');
  if (dateDisplay) {
    var hasDates = data.startDate && data.endDate;
    dateDisplay.textContent = hasDates ? data.startDate + ' ~ ' + data.endDate : '未设置日期范围';
    dateDisplay.style.color = hasDates ? '' : 'var(--text3)';
  }

  var listEl = document.getElementById('principlesList');
  var emptyEl = document.getElementById('principlesEmpty');
  if (!listEl) return;

  // Remove existing items but keep emptyEl reference
  listEl.querySelectorAll('.principle-item').forEach(function(el) { el.remove(); });

  if (data.principles.length === 0) {
    if (emptyEl) emptyEl.style.display = '';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';

  data.principles.forEach(function(p, idx) {
    var el = document.createElement('div');
    el.className = 'principle-item';
    el.innerHTML = '<span class="principle-index">' + (idx + 1) + '.</span>' +
      '<span class="principle-text">' + Util.escHtml(p.text) + '</span>' +
      '<button class="task-delete-btn principle-del-btn" data-pid="' + p.id + '">&times;</button>';
    listEl.appendChild(el);
  });

  // Bind edit on dblclick
  listEl.querySelectorAll('.principle-text').forEach(function(el) {
    el.addEventListener('dblclick', function() {
      var pid = this.parentElement.querySelector('.principle-del-btn').dataset.pid;
      startEdit(this, this.textContent, function(newVal) {
        updatePrinciple(pid, newVal);
        renderPrinciplesPanel();
      });
    });
  });

  // Bind delete
  listEl.querySelectorAll('.principle-del-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (!confirm('删除该原则？')) return;
      deletePrinciple(this.dataset.pid);
      renderPrinciplesPanel();
    });
  });
}
