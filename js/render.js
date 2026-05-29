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

  // Update count badge
  var countEl = document.getElementById('count-' + key);
  if (countEl) {
    var totalCount = countAllTasks(items);
    countEl.textContent = totalCount;
    countEl.style.display = totalCount > 0 ? '' : 'none';
  }

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
      count += (item.tasks ? item.tasks.length : 0);
    } else {
      count++;
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

  // Prevent inner interactive elements from capturing drag
  [hlBtn, bonusBtn, deferBtn, timeSlotBtn, delBtn].forEach(function(innerEl) {
    if (innerEl) innerEl.addEventListener('dragstart', function(e) { e.preventDefault(); e.stopPropagation(); });
  });

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

  return el;
}

function updateDateDisplay(date) {
  var picker = document.getElementById('datePicker');
  if (picker) picker.value = date;
  document.title = '四象限任务管理器 - ' + date;
}

// Weighted completion: I=0.35, II=0.3, III=0.2, IV=0.15
var QUADRANT_WEIGHTS = { I: 0.35, II: 0.3, III: 0.2, IV: 0.15 };

function calcQuadrantCompletion(items) {
  var total = 0, done = 0;
  items.forEach(function(item) {
    if (item.blockName !== undefined) {
      if (item.tasks) {
        item.tasks.forEach(function(t) { total++; if (t.completed) done++; });
      }
    } else {
      total++;
      if (item.completed) done++;
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
  // Weighted average of per-quadrant completion rates
  var weighted = 0;
  QUADRANT_KEYS.forEach(function(key) {
    weighted += quadRates[key].rate * QUADRANT_WEIGHTS[key];
  });
  return {
    total: totalAll,
    done: doneAll,
    simpleRate: totalAll > 0 ? Math.round((doneAll / totalAll) * 100) : 0,
    weightedRate: Math.round(weighted * 100),
    quadRates: quadRates
  };
}

function updateStatsBar(data) {
  var stats = calcWeightedCompletion(data);
  document.getElementById('statTotal').textContent = stats.total;
  document.getElementById('statDone').textContent = stats.done;
  document.getElementById('statRate').textContent = stats.weightedRate + '%';
  var rateEl = document.getElementById('statRate');
  if (rateEl) {
    rateEl.title = '加权完成率 (I×0.35 + II×0.3 + III×0.2 + IV×0.15) | 简单完成率: ' + stats.simpleRate + '%';
  }
  // Show deferred count
  var deferCount = data._deferred || 0;
  var deferEl = document.getElementById('statDeferred');
  if (deferEl) {
    deferEl.textContent = deferCount;
    deferEl.style.display = deferCount > 0 ? '' : 'none';
  }
  var deferLabel = document.getElementById('statDeferredLabel');
  if (deferLabel) {
    deferLabel.style.display = deferCount > 0 ? '' : 'none';
  }
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
function createTimeSlotBtn(currentKey, quadrantKey, taskId, blockId) {
  var slot = TIME_SLOTS.find(function(s) { return s.key === currentKey; }) || TIME_SLOTS[0];
  var btn = document.createElement('button');
  btn.className = 'task-timeslot-btn';
  btn.title = slot.title;
  btn.innerHTML = slot.icon;
  btn.setAttribute('data-slot-key', slot.key);
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    showTimeSlotPicker(btn, quadrantKey, taskId, blockId);
  });
  return btn;
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

// ============ Plan Task Panel Rendering (generic for future/week/month) ============

// Pool configurations for the three plan panels
var PLAN_POOL_CONFIGS = {
  future: {
    poolKey: FUTURE_TASK_KEY,
    listId: 'futureTaskList',
    countId: 'futureTaskCount',
    emptyId: 'futureTaskEmpty',
    emptyText: '暂无待办任务，点击下方按钮添加。设定日期和象限后，到期自动加入日程表。',
    deleteConfirm: '确定删除该待办任务？',
    loadFn: loadFutureTasks,
    updateFn: updateFutureTask,
    deleteFn: deleteFutureTask,
    editSubFn: editFutureSubtaskField,
    deleteSubFn: deleteFutureSubtask,
    addSubFn: addFutureSubtask,
    renderFn: renderFutureTaskPanel
  },
  week: {
    poolKey: WEEK_TASK_KEY,
    listId: 'weekTaskList',
    countId: 'weekTaskCount',
    emptyId: 'weekTaskEmpty',
    emptyText: '暂无周计划任务，点击下方按钮添加。设定日期和象限后，当周自动加入日程表。',
    deleteConfirm: '确定删除该周计划任务？',
    loadFn: loadWeekTasks,
    updateFn: updateWeekTask,
    deleteFn: deleteWeekTask,
    editSubFn: editWeekSubtaskField,
    deleteSubFn: deleteWeekSubtask,
    addSubFn: addWeekSubtask,
    renderFn: renderWeekTaskPanel
  },
  month: {
    poolKey: MONTH_TASK_KEY,
    listId: 'monthTaskList',
    countId: 'monthTaskCount',
    emptyId: 'monthTaskEmpty',
    emptyText: '暂无月计划任务，点击下方按钮添加。设定日期和象限后，当月自动加入日程表。',
    deleteConfirm: '确定删除该月计划任务？',
    loadFn: loadMonthTasks,
    updateFn: updateMonthTask,
    deleteFn: deleteMonthTask,
    editSubFn: editMonthSubtaskField,
    deleteSubFn: deleteMonthSubtask,
    addSubFn: addMonthSubtask,
    renderFn: renderMonthTaskPanel
  }
};

// Generic render for any plan pool
function renderPlanTaskPanel(cfg) {
  var ptasks = cfg.loadFn();
  var listEl = document.getElementById(cfg.listId);
  var countEl = document.getElementById(cfg.countId);
  var emptyEl = document.getElementById(cfg.emptyId);

  if (countEl) countEl.textContent = ptasks.length;

  if (!listEl) return;

  if (ptasks.length === 0) {
    if (emptyEl) {
      listEl.innerHTML = '';
      listEl.appendChild(emptyEl);
    } else {
      listEl.innerHTML = '<div class="empty-hint">' + cfg.emptyText + '</div>';
    }
    return;
  }

  var html = '';
  ptasks.forEach(function(ft) {
    if (ft.type === 'block') {
      html += _renderPlanBlockHTML(ft);
    } else {
      html += _renderPlanTaskHTML(ft);
    }
  });
  listEl.innerHTML = html;

  // Bind task text editing
  listEl.querySelectorAll('.futuretask-item-text').forEach(function(el) {
    el.addEventListener('dblclick', function(e) {
      e.stopPropagation();
      var ftId = this.dataset.ftId;
      startEdit(this, this.textContent, function(newVal) {
        cfg.updateFn(ftId, { text: newVal });
        cfg.renderFn();
      });
    });
  });

  // Bind task date editing
  listEl.querySelectorAll('.futuretask-item-date').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      var ftId = this.dataset.ftId;
      var input = createDateTextInput(this.dataset.value, function(newVal) {
        cfg.updateFn(ftId, { scheduledDate: newVal });
      }, function() { cfg.renderFn(); });
      this.innerHTML = ''; this.appendChild(input); input.focus();
    });
  });

  // Bind task quadrant editing
  listEl.querySelectorAll('.futuretask-item-quad').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      var ftId = this.dataset.ftId;
      var curVal = this.dataset.value || '';
      startSelectEdit(this, curVal || '选择象限', ['I', 'II', 'III', 'IV', '（未指定）'], function(newVal) {
        var quadKey = newVal === '（未指定）' ? '' : newVal;
        cfg.updateFn(ftId, { targetQuadrant: quadKey });
        cfg.renderFn();
      });
    });
  });

  // Bind delete buttons
  listEl.querySelectorAll('.futuretask-delete-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (confirm(cfg.deleteConfirm)) {
        cfg.deleteFn(this.dataset.ftId);
        cfg.renderFn();
      }
    });
  });

  // Bind block name editing
  listEl.querySelectorAll('.futuretask-block-name').forEach(function(el) {
    el.addEventListener('dblclick', function(e) {
      e.stopPropagation();
      var ftId = this.dataset.ftId;
      startEdit(this, this.textContent, function(newVal) {
        cfg.updateFn(ftId, { blockName: newVal });
        cfg.renderFn();
      });
    });
  });

  // Bind block date/quadrant
  listEl.querySelectorAll('.ft-block-date, .ft-block-quad').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      var ftId = this.dataset.ftId;
      var field = this.classList.contains('ft-block-date') ? 'scheduledDate' : 'targetQuadrant';
      if (field === 'scheduledDate') {
        var input = createDateTextInput(this.dataset.value, function(newVal) {
          cfg.updateFn(ftId, { scheduledDate: newVal });
        }, function() { cfg.renderFn(); });
        this.innerHTML = ''; this.appendChild(input); input.focus();
      } else {
        var curVal = this.dataset.value || '';
        startSelectEdit(this, curVal || '选择象限', ['I', 'II', 'III', 'IV', '（未指定）'], function(newVal) {
          var quadKey = newVal === '（未指定）' ? '' : newVal;
          cfg.updateFn(ftId, { targetQuadrant: quadKey });
          cfg.renderFn();
        });
      }
    });
  });

  // Bind subtask text editing
  listEl.querySelectorAll('.futuresubtask-text').forEach(function(el) {
    el.addEventListener('dblclick', function(e) {
      e.stopPropagation();
      var ftId = this.dataset.ftId;
      var stId = this.dataset.stId;
      startEdit(this, this.textContent, function(newVal) {
        cfg.editSubFn(ftId, stId, 'text', newVal);
        cfg.renderFn();
      });
    });
  });

  // Bind subtask date editing
  listEl.querySelectorAll('.fst-date').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      var ftId = this.dataset.ftId;
      var stId = this.dataset.stId;
      var input = createDateTextInput(this.dataset.value, function(newVal) {
        cfg.editSubFn(ftId, stId, 'scheduledDate', newVal);
      }, function() { cfg.renderFn(); });
      this.innerHTML = ''; this.appendChild(input); input.focus();
    });
  });

  // Bind subtask quadrant editing
  listEl.querySelectorAll('.fst-quad').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      var ftId = this.dataset.ftId;
      var stId = this.dataset.stId;
      var curVal = this.dataset.value || '';
      startSelectEdit(this, curVal || '选择象限', ['I', 'II', 'III', 'IV', '（未指定）'], function(newVal) {
        var quadKey = newVal === '（未指定）' ? '' : newVal;
        cfg.editSubFn(ftId, stId, 'targetQuadrant', quadKey);
        cfg.renderFn();
      });
    });
  });

  // Bind subtask delete
  listEl.querySelectorAll('.fst-delete-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (!confirm('删除该子任务？')) return;
      cfg.deleteSubFn(this.dataset.ftId, this.dataset.stId);
      cfg.renderFn();
    });
  });

  // Bind add subtask buttons
  listEl.querySelectorAll('.ft-add-st-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var ftId = this.dataset.ftId;
      var text = prompt('子任务内容：');
      if (!text) return;
      cfg.addSubFn(ftId, text);
      cfg.renderFn();
    });
  });

  // Bind drag for plan task items (draggable to quadrants)
  listEl.querySelectorAll('.futuretask-draggable, .futuresubtask-draggable').forEach(function(el) {
    el.addEventListener('dragstart', handleFutureDragStart);
    el.addEventListener('dragend', handleFutureDragEnd);
  });
}

// Concrete render functions for each pool
function renderFutureTaskPanel() { renderPlanTaskPanel(PLAN_POOL_CONFIGS.future); }
function renderWeekTaskPanel() { renderPlanTaskPanel(PLAN_POOL_CONFIGS.week); }
function renderMonthTaskPanel() { renderPlanTaskPanel(PLAN_POOL_CONFIGS.month); }

// Shared HTML generators (used by all plan pools)
function _renderPlanTaskHTML(ft) {
  var dateDisplay = ft.scheduledDate || '📅 设定日期';
  var quadDisplay = QUADRANTS[ft.targetQuadrant] ? QUADRANTS[ft.targetQuadrant].icon + ' ' + QUADRANTS[ft.targetQuadrant].label : '选择象限';
  var quadClass = ft.targetQuadrant ? ' set' : '';
  var today = new Date().toISOString().split('T')[0];
  var dateClass = (ft.scheduledDate && ft.scheduledDate === today) ? ' arrived' : '';

  return '<div class="futuretask-item futuretask-draggable" draggable="true" data-ft-id="' + ft.id + '" data-ft-text="' + escHtml(ft.text || '') + '">' +
    '<span class="futuretask-item-text" data-ft-id="' + ft.id + '" title="双击编辑内容">' + renderTaskText(ft.text || '新待办任务') + '</span>' +
    '<span class="futuretask-item-date' + dateClass + '" data-ft-id="' + ft.id + '" data-value="' + (ft.scheduledDate || '') + '" title="点击设定日期">' + dateDisplay + '</span>' +
    '<span class="futuretask-item-quad' + quadClass + '" data-ft-id="' + ft.id + '" data-value="' + (ft.targetQuadrant || '') + '" title="点击选择象限">' + quadDisplay + '</span>' +
    '<button class="task-delete-btn futuretask-delete-btn" data-ft-id="' + ft.id + '" title="删除">&times;</button>' +
    '</div>';
}

function _renderPlanBlockHTML(ft) {
  var dateDisplay = ft.scheduledDate || '📅 设定日期';
  var quadDisplay = QUADRANTS[ft.targetQuadrant] ? QUADRANTS[ft.targetQuadrant].icon + ' ' + QUADRANTS[ft.targetQuadrant].label : '选择象限';
  var today = new Date().toISOString().split('T')[0];
  var dateClass = (ft.scheduledDate && ft.scheduledDate === today) ? ' arrived' : '';

  var h = '<div class="futuretask-block">';
  h += '<div class="futuretask-block-header">';
  h += '<span class="futuretask-block-name" data-ft-id="' + ft.id + '" title="双击编辑名称">📦 ' + escHtml(ft.blockName || '新待办任务块') + '</span>';
  h += '<div class="futuretask-block-meta">';
  h += '<span class="futuretask-item-date ft-block-date' + dateClass + '" data-ft-id="' + ft.id + '" data-value="' + (ft.scheduledDate || '') + '" title="点击设定日期">' + dateDisplay + '</span>';
  h += '<span class="futuretask-item-quad ft-block-quad" data-ft-id="' + ft.id + '" data-value="' + (ft.targetQuadrant || '') + '" title="点击选择象限">' + quadDisplay + '</span>';
  h += '</div>';
  h += '<button class="task-delete-btn futuretask-delete-btn" data-ft-id="' + ft.id + '" title="删除">&times;</button>';
  h += '</div>';

  h += '<div class="futuretask-block-tasks">';
  if (ft.tasks && ft.tasks.length > 0) {
    ft.tasks.forEach(function(st) {
      var stDateDisplay = st.scheduledDate || '📅';
      var stQuadDisplay = QUADRANTS[st.targetQuadrant] ? QUADRANTS[st.targetQuadrant].icon : '';
      h += '<div class="futuresubtask-item futuresubtask-draggable" draggable="true" data-ft-id="' + ft.id + '" data-st-id="' + st.id + '" data-ft-text="' + escHtml(st.text || '') + '">';
      h += '<span class="futuresubtask-text" data-ft-id="' + ft.id + '" data-st-id="' + st.id + '" title="双击编辑内容">' + renderTaskText(st.text) + '</span>';
      h += '<span class="futuretask-item-date fst-date" data-ft-id="' + ft.id + '" data-st-id="' + st.id + '" data-value="' + (st.scheduledDate || '') + '" title="点击设定日期">' + stDateDisplay + '</span>';
      h += '<span class="futuretask-item-quad fst-quad" data-ft-id="' + ft.id + '" data-st-id="' + st.id + '" data-value="' + (st.targetQuadrant || '') + '" title="点击选择象限">' + (stQuadDisplay || '选择象限') + '</span>';
      h += '<button class="task-delete-btn fst-delete-btn" data-ft-id="' + ft.id + '" data-st-id="' + st.id + '" title="删除子任务" style="width:18px;height:18px;font-size:12px;">&times;</button>';
      h += '</div>';
    });
  } else {
    h += '<div style="font-size:11px;color:var(--text3);padding:4px;">（无子任务）</div>';
  }
  h += '<button class="add-subtask-btn ft-add-st-btn" data-ft-id="' + ft.id + '" style="border-radius:6px;margin-top:2px;">+ 添加子任务</button>';
  h += '</div>';
  h += '</div>';
  return h;
}

// ---- Plan Task / Subtask Helpers (generic) ----

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

// Backward-compat aliases for future task subtask helpers
function editFutureSubtaskField(ftId, stId, field, value) { _editPlanSubtaskField(FUTURE_TASK_KEY, saveFutureTasks, ftId, stId, field, value); }
function deleteFutureSubtask(ftId, stId) { _deletePlanSubtask(FUTURE_TASK_KEY, saveFutureTasks, ftId, stId); }
function addFutureSubtask(ftId, text) { _addPlanSubtask(FUTURE_TASK_KEY, saveFutureTasks, ftId, text); }

// Week task subtask helpers
function editWeekSubtaskField(ftId, stId, field, value) { _editPlanSubtaskField(WEEK_TASK_KEY, saveWeekTasks, ftId, stId, field, value); }
function deleteWeekSubtask(ftId, stId) { _deletePlanSubtask(WEEK_TASK_KEY, saveWeekTasks, ftId, stId); }
function addWeekSubtask(ftId, text) { _addPlanSubtask(WEEK_TASK_KEY, saveWeekTasks, ftId, text); }

// Month task subtask helpers
function editMonthSubtaskField(ftId, stId, field, value) { _editPlanSubtaskField(MONTH_TASK_KEY, saveMonthTasks, ftId, stId, field, value); }
function deleteMonthSubtask(ftId, stId) { _deletePlanSubtask(MONTH_TASK_KEY, saveMonthTasks, ftId, stId); }
function addMonthSubtask(ftId, text) { _addPlanSubtask(MONTH_TASK_KEY, saveMonthTasks, ftId, text); }
