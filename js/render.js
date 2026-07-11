// render.js - UI 渲染（创建 DOM 元素）

var currentDate = '';
var searchTerm = '';
var SLOT_ORDER = ['early_morn','forenoon','noon','afternoon','dusk','night'];
var viewMode = 'quadrant'; // 'quadrant' | 'time'

function getCurrentDate() { return currentDate; }

function renderAll(date) {
  currentDate = date;
  var data = loadDateData(date);
  if (viewMode === 'time') {
    renderTimeView(date, data);
  } else {
    resetGridLayout();
    QUADRANT_KEYS.forEach(function(key) {
      renderQuadrant(key, data[key] || []);
    });
    syncQuadrantRowHeights();
  }
  updateDateDisplay(date);
  updateStatsBar(data);
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
  // In time view, fall back to full re-render (quadrant containers don't exist)
  if (viewMode === 'time') {
    renderAll(currentDate);
    return;
  }
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

  // Filter by search term
  var filtered = items;
  if (searchTerm) {
    filtered = filterItems(items, searchTerm.toLowerCase());
  }

  // Sort: incomplete first, completed last; then by timeSlot within each group.
  // Blocks go to end. Stable: preserves manual order within same group+slot.
  filtered = filtered.slice();
  filtered.sort(function(a, b) {
    // Blocks always at end
    var aIsBlock = a.blockName !== undefined;
    var bIsBlock = b.blockName !== undefined;
    if (aIsBlock && !bIsBlock) return 1;
    if (!aIsBlock && bIsBlock) return -1;
    if (aIsBlock && bIsBlock) return 0;
    // Incomplete first
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    // Then timeSlot
    var ai = SLOT_ORDER.indexOf(a.timeSlot || '');
    var bi = SLOT_ORDER.indexOf(b.timeSlot || '');
    if (ai === -1) ai = 99;
    if (bi === -1) bi = 99;
    return ai - bi;
  });

  // Use DocumentFragment for batch DOM insertion
  var frag = document.createDocumentFragment();

  if (!filtered || filtered.length === 0) {
    var empty = document.createElement('div');
    empty.className = 'empty-hint';
    empty.textContent = searchTerm ? '无匹配任务' : '拖拽任务到此处，或点击上方按钮添加';
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

// ============ Time-Slot View (group tasks by completion time across all quadrants) ============

// Light background colors per quadrant for time view
var QUADRANT_BG = {
  I:  'rgba(255,179,179,0.18)',
  II: 'rgba(179,212,255,0.18)',
  III:'rgba(255,245,179,0.22)',
  IV: 'rgba(195,240,195,0.18)'
};

function renderTimeView(date, preloadedData) {
  var data = preloadedData || loadDateData(date);
  var grid = document.querySelector('.quadrant-grid');
  if (!grid) return;

  var timeviewContainer = document.getElementById('timeview-container');
  if (!timeviewContainer) return;

  // Collect all items from all quadrants with quadrant metadata
  var allItems = [];
  QUADRANT_KEYS.forEach(function(key) {
    var items = data[key] || [];
    items.forEach(function(item) {
      allItems.push({ item: item, quadrantKey: key });
    });
  });

  // Filter by search term
  if (searchTerm) {
    var term = searchTerm.toLowerCase();
    allItems = allItems.filter(function(entry) {
      var item = entry.item;
      if (item.blockName !== undefined) {
        if (item.blockName.toLowerCase().indexOf(term) !== -1) return true;
        if (item.tasks) {
          return item.tasks.some(function(t) { return t.text && t.text.toLowerCase().indexOf(term) !== -1; });
        }
        return false;
      }
      // Also check stages text for matches
      if (item.stages) {
        var stageMatch = item.stages.some(function(s) { return s.text && s.text.toLowerCase().indexOf(term) !== -1; });
        if (stageMatch) return true;
      }
      return item.text && item.text.toLowerCase().indexOf(term) !== -1;
    });
  }

  // Group by timeSlot — items without timeSlot get a default based on current time
  var slotGroups = {};
  allItems.forEach(function(entry) {
    var item = entry.item;
    if (item.blockName !== undefined) {
      var foundSlot = null;
      if (item.tasks) {
        for (var ti = 0; ti < item.tasks.length; ti++) {
          if (item.tasks[ti].timeSlot) { foundSlot = item.tasks[ti].timeSlot; break; }
        }
      }
      var effectiveSlot = foundSlot || getDefaultTimeSlot();
      if (!slotGroups[effectiveSlot]) slotGroups[effectiveSlot] = [];
      slotGroups[effectiveSlot].push(entry);
    } else {
      var slot = item.timeSlot || getDefaultTimeSlot();
      if (!slotGroups[slot]) slotGroups[slot] = [];
      slotGroups[slot].push(entry);
    }
  });

  // ---- Flatten children: distribute stages/subtasks to their own timeSlot sections ----
  // Track which parents have children distributed (to render them compact later)
  var parentsWithChildren = {}; // key: quadrantKey + '::' + itemId
  function flattenChildren() {
    // Collect all parent entries (original items)
    var allEntries = [];
    SLOT_ORDER.forEach(function(sk) {
      if (slotGroups[sk]) allEntries = allEntries.concat(slotGroups[sk]);
    });

    // Track which slots each parent's children go to, so we can place compact
    // parent cards in EVERY slot that has children (not just the parent's own slot)
    var parentChildSlots = {}; // key: qKey+'::'+itemId -> { entry: originalEntry, slots: {slotKey: true} }

    allEntries.forEach(function(entry) {
      var item = entry.item;
      var qKey = entry.quadrantKey;
      var parentKey = qKey + '::' + item.id;

      // Task with stages: distribute each stage to its own timeSlot
      if (!item.blockName && item.stages && item.stages.length > 0) {
        parentsWithChildren[parentKey] = true;
        if (!parentChildSlots[parentKey]) parentChildSlots[parentKey] = { entry: entry, slots: {} };
        item.stages.forEach(function(stage) {
          var childEntry = {
            item: item,
            quadrantKey: qKey,
            _childType: 'stage',
            _stageData: stage,
            _parentName: item.text || '未命名任务'
          };
          var tSlot = stage.timeSlot || getDefaultTimeSlot();
          if (!slotGroups[tSlot]) slotGroups[tSlot] = [];
          slotGroups[tSlot].push(childEntry);
          parentChildSlots[parentKey].slots[tSlot] = true;
        });
      }

      // Block with subtasks: distribute each subtask to its own timeSlot
      if (item.blockName && item.tasks && item.tasks.length > 0) {
        parentsWithChildren[parentKey] = true;
        if (!parentChildSlots[parentKey]) parentChildSlots[parentKey] = { entry: entry, slots: {} };
        item.tasks.forEach(function(subtask) {
          var subEntry = {
            item: item,
            quadrantKey: qKey,
            _childType: 'subtask',
            _subtaskData: subtask,
            _parentName: item.blockName || '未命名任务块'
          };
          var tSlot = subtask.timeSlot || getDefaultTimeSlot();
          if (!slotGroups[tSlot]) slotGroups[tSlot] = [];
          slotGroups[tSlot].push(subEntry);
          parentChildSlots[parentKey].slots[tSlot] = true;

          // Also distribute stages of this subtask
          if (subtask.stages && subtask.stages.length > 0) {
            subtask.stages.forEach(function(stage) {
              var chain = (item.blockName || '未命名任务块') + ' → ' + (subtask.text || '未命名子任务');
              var ssEntry = {
                item: item,
                quadrantKey: qKey,
                _childType: 'subtask-stage',
                _subtaskData: subtask,
                _stageData: stage,
                _parentName: chain
              };
              var ssSlot = stage.timeSlot || getDefaultTimeSlot();
              if (!slotGroups[ssSlot]) slotGroups[ssSlot] = [];
              slotGroups[ssSlot].push(ssEntry);
              parentChildSlots[parentKey].slots[ssSlot] = true;
            });
          }
        });
      }
    });

    // Remove original parent entries from slotGroups and insert compact parent
    // markers into EVERY slot that received children from that parent
    Object.keys(parentChildSlots).forEach(function(parentKey) {
      var info = parentChildSlots[parentKey];
      var origEntry = info.entry;

      // Remove original parent from all slotGroups
      SLOT_ORDER.forEach(function(sk) {
        var group = slotGroups[sk];
        if (!group) return;
        for (var i = group.length - 1; i >= 0; i--) {
          if (group[i] === origEntry) { group.splice(i, 1); break; }
        }
      });

      // Insert compact parent marker at top of each child slot
      Object.keys(info.slots).forEach(function(sk) {
        if (!slotGroups[sk]) slotGroups[sk] = [];
        slotGroups[sk].unshift({
          item: origEntry.item,
          quadrantKey: origEntry.quadrantKey,
          _compactParent: true
        });
      });
    });
  }
  flattenChildren();

  // Completion state for an entry (stage / subtask / standalone item)
  function getCompleted(entry) {
    if (entry._childType) {
      if (entry._stageData) return entry._stageData.completed;
      if (entry._subtaskData) return entry._subtaskData.completed;
    }
    return entry.item.completed;
  }

  // ---- Per-slot grouping: keep each parent header together with its in-slot children ----
  // Mirrors quadrant-view nesting so membership is visually unambiguous:
  //   📦/📋 parent header (🎯 big-task name) → indented 小任务 → indented 阶段
  var quadOrder = { I: 0, II: 1, III: 2, IV: 3 };
  function buildSlotUnits(group) {
    var parentHeaders = {};      // parentKey -> compact-parent entry
    var standalones = [];
    var childrenByParent = {};   // parentKey -> { subtasks:[], stages:[], subtaskStages:[] }

    group.forEach(function(entry) {
      var pk = entry.quadrantKey + '::' + entry.item.id;
      if (entry._compactParent) {
        parentHeaders[pk] = entry;
      } else if (entry._childType) {
        if (!childrenByParent[pk]) childrenByParent[pk] = { subtasks: [], stages: [], subtaskStages: [] };
        if (entry._childType === 'subtask') childrenByParent[pk].subtasks.push(entry);
        else if (entry._childType === 'stage') childrenByParent[pk].stages.push(entry);
        else if (entry._childType === 'subtask-stage') childrenByParent[pk].subtaskStages.push(entry);
      } else {
        standalones.push(entry);
      }
    });

    var units = [];
    Object.keys(parentHeaders).forEach(function(pk) {
      var cp = parentHeaders[pk];
      var ch = childrenByParent[pk] || { subtasks: [], stages: [], subtaskStages: [] };
      var allKids = ch.subtasks.concat(ch.stages).concat(ch.subtaskStages);
      var done = allKids.length > 0 && allKids.every(function(e) { return getCompleted(e); });
      units.push({ kind: 'parent', quadrantKey: cp.quadrantKey, cp: cp, children: ch, done: done });
    });
    standalones.forEach(function(entry) {
      units.push({ kind: 'standalone', quadrantKey: entry.quadrantKey, entry: entry, done: getCompleted(entry) });
    });

    // Order units: quadrant (I→IV), then incomplete before complete
    units.sort(function(a, b) {
      var qa = quadOrder[a.quadrantKey] !== undefined ? quadOrder[a.quadrantKey] : 99;
      var qb = quadOrder[b.quadrantKey] !== undefined ? quadOrder[b.quadrantKey] : 99;
      if (qa !== qb) return qa - qb;
      return (a.done ? 1 : 0) - (b.done ? 1 : 0);
    });
    return units;
  }

  // Render one unit (a parent group or a standalone item) into the slot container
  function appendUnit(container, unit) {
    var qKey = unit.quadrantKey;

    // Standalone task / block (no distributed children)
    if (unit.kind === 'standalone') {
      var item = unit.entry.item;
      var el;
      if (item.blockName !== undefined) {
        el = createTaskBlockElement(item, qKey, 0);
      } else {
        el = createTaskElement(item, qKey, 0);
      }
      if (el && QUADRANT_BG[qKey]) el.style.backgroundColor = QUADRANT_BG[qKey];
      if (el) container.appendChild(el);
      return;
    }

    // Parent group: header, then this slot's children nested below it
    var cp = unit.cp;
    var ch = unit.children;
    var isBlock = cp.item.blockName !== undefined;

    container.appendChild(createParentHeaderEl(cp));

    if (isBlock) {
      // Subtasks present in this slot, and this slot's subtask-stages grouped by their subtask
      var subtaskPresent = {};
      ch.subtasks.forEach(function(e) { subtaskPresent[e._subtaskData.id] = e; });
      var stagesBySubtask = {};
      ch.subtaskStages.forEach(function(e) {
        var sid = e._subtaskData.id;
        if (!stagesBySubtask[sid]) stagesBySubtask[sid] = [];
        stagesBySubtask[sid].push(e);
      });

      // Each present subtask, followed by its in-slot stages nested one level deeper
      ch.subtasks.forEach(function(se) {
        var subEl = createSubTaskElement(se._subtaskData, qKey, cp.item.id, { skipStages: true });
        if (!subEl) return;
        subEl.classList.add('timeview-indent-1');
        if (QUADRANT_BG[qKey]) subEl.style.backgroundColor = QUADRANT_BG[qKey];
        container.appendChild(subEl);
        var sid = se._subtaskData.id;
        (stagesBySubtask[sid] || []).forEach(function(sse) {
          var stEl = createStageElement(sse._stageData, qKey, cp.item.id, sid);
          if (!stEl) return;
          stEl.classList.add('timeview-indent-2');
          if (QUADRANT_BG[qKey]) stEl.style.backgroundColor = QUADRANT_BG[qKey];
          container.appendChild(stEl);
        });
      });

      // Orphan stages: their subtask row lives in another slot — label with the subtask name
      // so the stage's 小任务 membership is still clear.
      Object.keys(stagesBySubtask).forEach(function(sid) {
        if (subtaskPresent[sid]) return; // already nested under the subtask above
        var subName = (stagesBySubtask[sid][0]._subtaskData.text) || '子任务';
        var label = document.createElement('div');
        label.className = 'timeview-orphan-label';
        label.textContent = '↳ ' + subName;
        if (QUADRANT_BG[qKey]) label.style.backgroundColor = QUADRANT_BG[qKey];
        container.appendChild(label);
        stagesBySubtask[sid].forEach(function(sse) {
          var stEl = createStageElement(sse._stageData, qKey, cp.item.id, sid);
          if (!stEl) return;
          stEl.classList.add('timeview-indent-1');
          if (QUADRANT_BG[qKey]) stEl.style.backgroundColor = QUADRANT_BG[qKey];
          container.appendChild(stEl);
        });
      });
    } else {
      // Task with stages: each stage indented directly under the task header
      ch.stages.forEach(function(se) {
        var stEl = createStageElementForTask(se._stageData, qKey, cp.item.id);
        if (!stEl) return;
        stEl.classList.add('timeview-indent-1');
        if (QUADRANT_BG[qKey]) stEl.style.backgroundColor = QUADRANT_BG[qKey];
        container.appendChild(stEl);
      });
    }
  }

  // Helper: look up big task name by ID (checks active tasks, then the
  // completed-task cache so archived big tasks still resolve their name).
  function getBigTaskName(btId) {
    var tasks = loadBigTasks();
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].id === btId) return tasks[i].name;
    }
    if (typeof loadBigTaskCache === 'function') {
      var cache = loadBigTaskCache();
      for (var j = 0; j < cache.length; j++) {
        if (cache[j].id === btId) return cache[j].name;
      }
    }
    return null;
  }

  // Helper: create a parent group header (quadrant-view style, replaces compact parent card)
  function createParentHeaderEl(cpEntry) {
    var item = cpEntry.item;
    var qKey = cpEntry.quadrantKey;
    var isBlock = item.blockName !== undefined;
    // Total children across ALL slots (accurate for badge + delete confirm)
    var totalChildren = isBlock
      ? ((item.tasks && item.tasks.length) || 0)
      : ((item.stages && item.stages.length) || 0);

    var el = document.createElement('div');
    el.className = 'timeview-parent-header';
    if (QUADRANT_BG[qKey]) {
      el.style.backgroundColor = QUADRANT_BG[qKey];
    }

    // Quadrant badge
    var badge = document.createElement('span');
    badge.className = 'timeview-parent-badge';
    badge.textContent = (QUADRANTS[qKey] && QUADRANTS[qKey].icon) || qKey;
    badge.title = qKey + '象限';
    el.appendChild(badge);

    // Big task name (if this item came from a big task)
    if (item.bigTaskRef && item.bigTaskRef.bigTaskId) {
      var btName = getBigTaskName(item.bigTaskRef.bigTaskId);
      if (btName) {
        var btSpan = document.createElement('span');
        btSpan.className = 'timeview-bigtask-name';
        btSpan.textContent = '🎯 ' + btName;
        btSpan.title = '来自大任务：' + btName;
        el.appendChild(btSpan);
      }
    }

    // Item name
    var nameSpan = document.createElement('span');
    nameSpan.className = 'timeview-parent-name';
    nameSpan.textContent = (isBlock ? '📦 ' : '📋 ') + (item.blockName || item.text || '未命名');
    el.appendChild(nameSpan);

    // Child count hint
    var hint = document.createElement('span');
    hint.className = 'timeview-parent-hint';
    hint.textContent = totalChildren + '项';
    el.appendChild(hint);

    // Delete button
    var delBtn = document.createElement('button');
    delBtn.className = 'task-delete-btn';
    delBtn.innerHTML = '×';
    delBtn.title = '删除（含所有子项）';
    delBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var name = item.blockName || item.text || '';
      var msg = totalChildren > 0
        ? '确定删除"' + name + '"及其 ' + totalChildren + ' 个子项？\n（子项分布在各个时段中，也将被一并删除）'
        : '确定删除"' + name + '"？';
      if (!confirm(msg)) return;
      if (isBlock) {
        deleteBlockDirect(qKey, item.id);
      } else {
        deleteTaskDirect(qKey, item.id);
      }
    });
    delBtn.addEventListener('dragstart', function(e) { e.preventDefault(); e.stopPropagation(); });
    el.appendChild(delBtn);

    return el;
  }

  var frag = document.createDocumentFragment();

  SLOT_ORDER.forEach(function(slotKey) {
    var group = slotGroups[slotKey];
    if (!group || group.length === 0) return;

    var slotInfo = null;
    for (var s = 0; s < TIME_SLOTS.length; s++) {
      if (TIME_SLOTS[s].key === slotKey) { slotInfo = TIME_SLOTS[s]; break; }
    }
    if (!slotInfo) slotInfo = { icon: '⬚', label: slotKey };

    var section = document.createElement('div');
    section.className = 'timeview-section';

    var header = document.createElement('div');
    header.className = 'timeview-header';
    header.innerHTML = slotInfo.icon + ' ' + slotInfo.label + ' <span class="timeview-count">' + group.length + '</span>';
    section.appendChild(header);

    var itemsContainer = document.createElement('div');
    itemsContainer.className = 'timeview-items';

    // Group each parent header with its in-slot children (nested, quadrant-view style),
    // then standalone items. Units are ordered by quadrant → completion.
    var units = buildSlotUnits(group);
    units.forEach(function(unit) { appendUnit(itemsContainer, unit); });

    section.appendChild(itemsContainer);
    frag.appendChild(section);
  });

  // Hide quadrant containers, show time view
  var allQuadrants = grid.querySelectorAll('.quadrant');
  for (var qi = 0; qi < allQuadrants.length; qi++) {
    allQuadrants[qi].style.display = 'none';
  }

  if (!frag.childNodes.length) {
    var empty = document.createElement('div');
    empty.className = 'empty-hint';
    empty.textContent = searchTerm ? '无匹配任务' : '当前日期没有任务';
    frag.appendChild(empty);
  }

  // Auto-adjust grid columns: "two time slots per row" principle (matches quadrant 2×2 layout).
  // 1 slot → 1 col; 2+ slots → 2 cols per row (6 slots = 2×3, 4 slots = 2×2, etc.)
  var nonEmptyCount = 0;
  SLOT_ORDER.forEach(function(sk) { if (slotGroups[sk] && slotGroups[sk].length > 0) nonEmptyCount++; });
  var cols = nonEmptyCount <= 1 ? 1 : 2;
  // Cap columns by viewport width for responsive behavior
  var vw = window.innerWidth;
  if (vw <= 600) cols = 1; // mobile: single column
  var colStr = '';
  for (var ci = 0; ci < cols; ci++) { colStr += (ci > 0 ? ' ' : '') + '1fr'; }
  timeviewContainer.style.gridTemplateColumns = colStr;

  timeviewContainer.innerHTML = '';
  timeviewContainer.appendChild(frag);
  timeviewContainer.style.display = '';
}

// Reset quadrant-grid to default layout (for quadrant view)
function resetGridLayout() {
  var grid = document.querySelector('.quadrant-grid');
  if (!grid) return;
  // Reset inline styles
  grid.style.display = '';
  grid.style.flexDirection = '';
  grid.style.gap = '';

  // Show quadrant containers
  var allQuadrants = grid.querySelectorAll('.quadrant');
  for (var qi = 0; qi < allQuadrants.length; qi++) {
    allQuadrants[qi].style.display = '';
  }

  // Hide time view container
  var timeviewContainer = document.getElementById('timeview-container');
  if (timeviewContainer) {
    timeviewContainer.style.display = 'none';
    timeviewContainer.innerHTML = '';
  }
}

function countAllTasks(items) {
  var count = 0;
  walkLeafItems(items, function() { count++; });
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
    el.classList.add('is-bigtask-sub');
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

  // Prevent inner interactive elements from capturing drag
  [hlBtn, bonusBtn, deferBtn, timeSlotBtn, delBtn].forEach(function(innerEl) {
    if (innerEl) innerEl.addEventListener('dragstart', function(e) { e.preventDefault(); e.stopPropagation(); });
  });

  // Split into stages button
  var splitBtn = document.createElement('button');

  // When stages exist, hide action buttons — they belong to stages (must be after splitBtn creation)
  if (hasStages) {
    hlBtn.style.display = 'none';
    bonusBtn.style.display = 'none';
    deferBtn.style.display = 'none';
    timeSlotBtn.style.display = 'none';
    splitBtn.style.display = 'none';
    // Make checkbox auto-derived
    left.querySelector('input[type=checkbox]').style.pointerEvents = 'none';
    left.querySelector('input[type=checkbox]').style.opacity = '0.5';
  }
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
    // Sort stages: incomplete first, completed last; then by timeSlot within each group
    item.stages.sort(function(a, b) {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      var ai = SLOT_ORDER.indexOf(a.timeSlot || '');
      var bi = SLOT_ORDER.indexOf(b.timeSlot || '');
      if (ai === -1) ai = 99;
      if (bi === -1) bi = 99;
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
    // Insert before delBtn so both appear at top-right
    el.insertBefore(addStageBtn, delBtn);
    el.appendChild(stagesContainer);

    // 折叠切换按钮
    var toggleBtn = document.createElement('button');
    toggleBtn.className = 'stages-toggle-btn';
    var isCollapsed = loadStagesCollapseState()[item.id];
    toggleBtn.innerHTML = isCollapsed ? '▶' : '▼';
    toggleBtn.title = isCollapsed ? '展开阶段' : '折叠阶段';
    if (isCollapsed) {
      stagesContainer.style.display = 'none';
      addStageBtn.style.display = 'none';
    }
    toggleBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var nowCollapsed = stagesContainer.style.display !== 'none';
      stagesContainer.style.display = nowCollapsed ? 'none' : '';
      toggleBtn.innerHTML = nowCollapsed ? '▶' : '▼';
      toggleBtn.title = nowCollapsed ? '展开阶段' : '折叠阶段';
      var addBtn = el.querySelector('.add-stage-btn');
      if (addBtn) addBtn.style.display = nowCollapsed ? 'none' : '';
      setStageCollapsed(item.id, nowCollapsed);
    });
    toggleBtn.addEventListener('dragstart', function(e) { e.preventDefault(); e.stopPropagation(); });
    el.insertBefore(toggleBtn, delBtn);
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
    // Sort subtasks: incomplete first, completed last; then by timeSlot
    var sortedTasks = block.tasks.slice().sort(function(a, b) {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      var ai = SLOT_ORDER.indexOf(a.timeSlot || '');
      var bi = SLOT_ORDER.indexOf(b.timeSlot || '');
      if (ai === -1) ai = 99;
      if (bi === -1) bi = 99;
      return ai - bi;
    });
    sortedTasks.forEach(function(task) {
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

function createSubTaskElement(task, quadrantKey, blockId, opts) {
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
    el.classList.add('is-bigtask-sub');
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

  var left = document.createElement('div');
  left.className = 'task-left';
  left.appendChild(checkbox);
  left.appendChild(textSpan);
  el.appendChild(left);
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

  // Split into stages button
  var splitBtn = document.createElement('button');

  // When stages exist, hide action buttons — they belong to stages (must be after splitBtn creation)
  if (hasStages) {
    hlBtn.style.display = 'none';
    bonusBtn.style.display = 'none';
    deferBtn.style.display = 'none';
    timeSlotBtn2.style.display = 'none';
    splitBtn.style.display = 'none';
    checkbox.style.pointerEvents = 'none';
    checkbox.style.opacity = '0.5';
  }
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
  // In time view (opts.skipStages), stages are distributed to their own timeSlot
  // sections — skip the nested container to avoid duplication.
  if (task.stages && task.stages.length > 0) {
    // Sort stages: incomplete first, completed last; then by timeSlot within each group
    task.stages.sort(function(a, b) {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      var ai = SLOT_ORDER.indexOf(a.timeSlot || '');
      var bi = SLOT_ORDER.indexOf(b.timeSlot || '');
      if (ai === -1) ai = 99;
      if (bi === -1) bi = 99;
      return ai - bi;
    });
    // Keep completed-state synced even when skipping the nested container
    var allStagesDone = task.stages.every(function(s) { return s.completed; });
    if (task.completed !== allStagesDone) {
      task.completed = allStagesDone;
      checkbox.checked = allStagesDone;
      if (allStagesDone) { el.classList.add('completed'); } else { el.classList.remove('completed'); }
    }
    if (opts && opts.skipStages) {
      return el; // stages rendered separately (distributed by timeSlot)
    }
    var stagesContainer = document.createElement('div');
    stagesContainer.className = 'subtask-stages';
    el.classList.add('has-stages');
    task.stages.forEach(function(stage) {
      var stageEl = createStageElement(stage, quadrantKey, blockId, task.id);
      stagesContainer.appendChild(stageEl);
    });
    // Add stage button at top-right of task element
    var addStageBtn = document.createElement('button');
    addStageBtn.className = 'add-stage-btn';
    addStageBtn.innerHTML = '+ 阶段';
    addStageBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      addStage(quadrantKey, blockId, task.id);
    });
    addStageBtn.addEventListener('dragstart', function(e) { e.preventDefault(); e.stopPropagation(); });
    // Insert before delBtn so both appear at top-right
    el.insertBefore(addStageBtn, delBtn);
    el.appendChild(stagesContainer);

    // 折叠切换按钮
    var stCollapseId = blockId + '_' + task.id;
    var stToggleBtn = document.createElement('button');
    stToggleBtn.className = 'stages-toggle-btn';
    var stIsCollapsed = loadStagesCollapseState()[stCollapseId];
    stToggleBtn.innerHTML = stIsCollapsed ? '▶' : '▼';
    stToggleBtn.title = stIsCollapsed ? '展开阶段' : '折叠阶段';
    if (stIsCollapsed) {
      stagesContainer.style.display = 'none';
      addStageBtn.style.display = 'none';
    }
    stToggleBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var nowCollapsed = stagesContainer.style.display !== 'none';
      stagesContainer.style.display = nowCollapsed ? 'none' : '';
      stToggleBtn.innerHTML = nowCollapsed ? '▶' : '▼';
      stToggleBtn.title = nowCollapsed ? '展开阶段' : '折叠阶段';
      var addBtn = el.querySelector('.add-stage-btn');
      if (addBtn) addBtn.style.display = nowCollapsed ? 'none' : '';
      setStageCollapsed(stCollapseId, nowCollapsed);
    });
    stToggleBtn.addEventListener('dragstart', function(e) { e.preventDefault(); e.stopPropagation(); });
    el.insertBefore(stToggleBtn, delBtn);
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

  var stageLeft = document.createElement('div');
  stageLeft.className = 'task-left';
  stageLeft.appendChild(stageCheckbox);
  stageLeft.appendChild(stageText);
  stageRow.appendChild(stageLeft);
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

  var stageLeft = document.createElement('div');
  stageLeft.className = 'task-left';
  stageLeft.appendChild(stageCheckbox);
  stageLeft.appendChild(stageText);
  stageRow.appendChild(stageLeft);
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
  walkLeafItems(items, function(leaf) {
    total++;
    if (leaf.completed) done++;
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
    walkLeafItems(data[key] || [], function(leaf, info) {
      var g = slotToGroup[info.timeSlot];
      if (g) { groups[g].total++; if (leaf.completed) groups[g].done++; }
    });
  });
  return groups;
}

function updateStatsBar(data) {
  var stats = calcAllStats(data);
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
  var slotEl = document.getElementById('headerSlotBreakdown');
  if (!slotEl) return;
  var slotGroupKeys = ['早晨 + 上午', '中午 + 下午', '傍晚 + 晚上'];
  var parts = [];
  slotGroupKeys.forEach(function(gk) {
    var gd = stats.slotGroups[gk];
    var rate = gd.total > 0 ? Math.round((gd.done / gd.total) * 100) : 0;
    parts.push('<span class="header-slot-badge" title="' + gk + '">' + gd.icons + ' <span>' + gd.done + '/' + gd.total + ' ' + rate + '%</span></span>');
  });
  if (deferCount > 0) {
    parts.push('<span class="header-slot-badge" title="今日推迟任务数">⏩ <span>' + deferCount + '推迟</span></span>');
  }
  slotEl.style.display = '';
  slotEl.innerHTML = parts.join('');
}

// 合并统计计算：一次遍历叶子项，同时算出象限/加权/时段三组指标
function calcAllStats(data) {
  var quadCounts = { I: {total:0, done:0}, II: {total:0, done:0}, III: {total:0, done:0}, IV: {total:0, done:0} };
  var totalAll = 0, doneAll = 0;
  var slotGroups = {
    '早晨 + 上午': { total: 0, done: 0, icons: '🌄🕘' },
    '中午 + 下午': { total: 0, done: 0, icons: '☀️🕒' },
    '傍晚 + 晚上': { total: 0, done: 0, icons: '🌇🌙' }
  };
  var slotToGroup = {
    'early_morn': '早晨 + 上午', 'forenoon': '早晨 + 上午',
    'noon': '中午 + 下午', 'afternoon': '中午 + 下午',
    'dusk': '傍晚 + 晚上', 'night': '傍晚 + 晚上'
  };

  QUADRANT_KEYS.forEach(function(key) {
    walkLeafItems(data[key] || [], function(leaf, info) {
      quadCounts[key].total++;
      totalAll++;
      if (leaf.completed) { quadCounts[key].done++; doneAll++; }
      var g = slotToGroup[info.timeSlot];
      if (g) { slotGroups[g].total++; if (leaf.completed) slotGroups[g].done++; }
    });
  });

  var weightedRate = totalAll > 0 ? Math.round((doneAll / totalAll) * 100) : 0;

  return {
    quadCounts: quadCounts,
    total: totalAll, done: doneAll, weightedRate: weightedRate,
    slotGroups: slotGroups
  };
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
    showTimeSlotPicker(btn, quadrantKey, taskId, blockId, opts);
  });
  return btn;
}

function showTimeSlotPicker(anchorEl, quadrantKey, taskId, blockId, opts) {
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
      if (opts && opts.setFn) {
        opts.setFn(slot.key);
      } else {
        updateTaskTimeSlot(quadrantKey, taskId, blockId, slot.key);
      }
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
    saveFn: saveFutureTasks,
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
    saveFn: saveWeekTasks,
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
    saveFn: saveMonthTasks,
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

  // Checkbox 勾选/取消勾选
  listEl.querySelectorAll('.planpool-checkbox').forEach(function(cb) {
    cb.addEventListener('change', function(e) {
      e.stopPropagation();
      var ftId = this.dataset.ftId;
      var stId = this.dataset.stId;
      var checked = this.checked;
      if (stId) {
        cfg.editSubFn(ftId, stId, 'completed', checked);
      } else {
        cfg.updateFn(ftId, { completed: checked });
      }
      renderPlanPoolPanel();
    });
  });

  // 划分阶段按钮（任务 / block 子任务通用：通过 data-st-id 区分）
  listEl.querySelectorAll('.planpool-split-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var stId = this.dataset.stId;
      if (stId) {
        _splitPlanBlockSubStages(cfg.poolKey, cfg.saveFn, this.dataset.ftId, stId);
      } else {
        _splitPlanTaskStages(cfg.poolKey, cfg.saveFn, this.dataset.ftId);
      }
      renderPlanPoolPanel();
    });
  });

  // 阶段 checkbox（任务 / block 子任务通用）
  listEl.querySelectorAll('.planpool-stage-checkbox').forEach(function(cb) {
    cb.addEventListener('change', function(e) {
      e.stopPropagation();
      var stId = this.dataset.stId;
      if (stId) {
        _togglePlanBlockSubStageComplete(cfg.poolKey, cfg.saveFn, this.dataset.ftId, stId, this.dataset.stageId, this.checked);
      } else {
        _togglePlanTaskStageComplete(cfg.poolKey, cfg.saveFn, this.dataset.ftId, this.dataset.stageId, this.checked);
      }
      renderPlanPoolPanel();
    });
  });

  // 阶段文字双击编辑（任务 / block 子任务通用）
  listEl.querySelectorAll('.planpool-stage-text').forEach(function(el) {
    el.addEventListener('dblclick', function(e) {
      e.stopPropagation();
      var ftId = this.dataset.ftId;
      var stId = this.dataset.stId;
      var stageId = this.dataset.stageId;
      startEdit(this, this.textContent, function(newVal) {
        if (stId) {
          _updatePlanBlockSubStageText(cfg.poolKey, cfg.saveFn, ftId, stId, stageId, newVal);
        } else {
          _updatePlanTaskStageText(cfg.poolKey, cfg.saveFn, ftId, stageId, newVal);
        }
        renderPlanPoolPanel();
      });
    });
  });

  // 阶段删除按钮（任务 / block 子任务通用）
  listEl.querySelectorAll('.planpool-stage-del-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var stId = this.dataset.stId;
      if (stId) {
        _deletePlanBlockSubStage(cfg.poolKey, cfg.saveFn, this.dataset.ftId, stId, this.dataset.stageId);
      } else {
        _deletePlanTaskStage(cfg.poolKey, cfg.saveFn, this.dataset.ftId, this.dataset.stageId);
      }
      renderPlanPoolPanel();
    });
  });

  // 添加阶段按钮（任务 / block 子任务通用）
  listEl.querySelectorAll('.planpool-add-stage-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var ftId = this.dataset.ftId;
      var stId = this.dataset.stId;
      var text = prompt('阶段名称：');
      if (!text) return;
      if (stId) {
        _addPlanBlockSubStage(cfg.poolKey, cfg.saveFn, ftId, stId, text);
      } else {
        _addPlanTaskStage(cfg.poolKey, cfg.saveFn, ftId, text);
      }
      renderPlanPoolPanel();
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

  // 计划池导入按钮
  listEl.querySelectorAll('.planpool-import-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      importPlanPoolItemToToday(
        this.dataset.ftId,
        this.dataset.stId || null,
        this.dataset.ftText
      );
    });
  });

  listEl.querySelectorAll('.planpool-import-all-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      importPlanPoolItemWithStagesToToday(
        this.dataset.ftId,
        this.dataset.stId || null,
        this.dataset.ftText
      );
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
  var isCompleted = ft.completed ? true : false;
  var hasStages = ft.stages && ft.stages.length > 0;
  var completedClass = isCompleted ? ' completed' : '';
  var stagesClass = hasStages ? ' has-stages' : '';

  var h = '<div class="planpool-item planpool-draggable' + completedClass + stagesClass + '" draggable="true" data-ft-id="' + ft.id + '" data-ft-text="' + escHtml(ft.text || '') + '">';
  // Checkbox：有阶段时禁用（自动派生），无阶段时正常勾选
  h += '<input type="checkbox" class="planpool-checkbox" data-ft-id="' + ft.id + '"' + (isCompleted ? ' checked' : '') + (hasStages ? ' disabled style="pointer-events:none;opacity:0.5;"' : '') + '>';
  h += '<span class="planpool-item-text" data-ft-id="' + ft.id + '" title="双击编辑内容">' + renderTaskText(ft.text || '新任务') + '</span>';
  // 划分阶段按钮（仅无阶段时显示）
  if (!hasStages) {
    h += '<button class="split-stages-btn planpool-split-btn" data-ft-id="' + ft.id + '" title="划分阶段" style="width:22px;height:22px;flex-shrink:0;">📋</button>';
  }
  h += '<span class="planpool-item-date' + dateClass + '" data-ft-id="' + ft.id + '" data-value="' + (ft.scheduledDate || '') + '" title="点击设定日期">' + dateDisplay + '</span>';
  h += '<span class="planpool-item-quad' + quadClass + '" data-ft-id="' + ft.id + '" data-value="' + (ft.targetQuadrant || '') + '" title="点击选择象限">' + quadDisplay + '</span>';
  h += '<button class="task-defer-btn planpool-import-btn" data-ft-id="' + ft.id + '" data-ft-text="' + escHtml(ft.text || '') + '" title="导入今日Q-II" style="width:18px;height:18px;font-size:11px;">📥</button>';
  h += '<button class="task-delete-btn planpool-delete-btn" data-ft-id="' + ft.id + '" title="删除">&times;</button>';
  h += '</div>';

  // 阶段行容器
  if (hasStages) {
    h += '<div class="planpool-stages">';
    ft.stages.forEach(function(stage) {
      var stageCompleted = stage.completed ? ' completed' : '';
      h += '<div class="planpool-stage-item' + stageCompleted + '" data-ft-id="' + ft.id + '" data-stage-id="' + stage.id + '">';
      h += '<input type="checkbox" class="planpool-stage-checkbox" data-ft-id="' + ft.id + '" data-stage-id="' + stage.id + '"' + (stage.completed ? ' checked' : '') + '>';
      h += '<span class="planpool-stage-text" data-ft-id="' + ft.id + '" data-stage-id="' + stage.id + '" title="双击编辑内容">' + renderTaskText(stage.text) + '</span>';
      h += '<button class="planpool-stage-del-btn" data-ft-id="' + ft.id + '" data-stage-id="' + stage.id + '" title="删除阶段">&times;</button>';
      h += '</div>';
    });
    h += '<button class="planpool-add-stage-btn" data-ft-id="' + ft.id + '">+ 阶段</button>';
    h += '<button class="planpool-import-all-btn" data-ft-id="' + ft.id + '" data-ft-text="' + escHtml(ft.text || '') + '" title="导入全部阶段到今日" style="width:100%;padding:3px 6px;border:1px dashed var(--border2);background:transparent;color:var(--accent);font-size:11px;cursor:pointer;border-radius:4px;margin-top:4px;">📥 导入全部阶段到今日</button>';
    h += '</div>';
  }

  return h;
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
      var stCompleted = st.completed ? true : false;
      var stHasStages = st.stages && st.stages.length > 0;
      var stCompletedClass = stCompleted ? ' completed' : '';
      var stStagesClass = stHasStages ? ' has-stages' : '';
      h += '<div class="planpool-subtask-item planpool-draggable' + stCompletedClass + stStagesClass + '" draggable="true" data-ft-id="' + ft.id + '" data-st-id="' + st.id + '" data-ft-text="' + escHtml(st.text || '') + '">';
      // Checkbox：有阶段时禁用（自动派生）
      h += '<input type="checkbox" class="planpool-checkbox" data-ft-id="' + ft.id + '" data-st-id="' + st.id + '"' + (stCompleted ? ' checked' : '') + (stHasStages ? ' disabled style="pointer-events:none;opacity:0.5;"' : '') + '>';
      h += '<span class="planpool-subtask-text" data-ft-id="' + ft.id + '" data-st-id="' + st.id + '" title="双击编辑内容">' + renderTaskText(st.text) + '</span>';
      // 划分阶段按钮（仅无阶段时显示）
      if (!stHasStages) {
        h += '<button class="split-stages-btn planpool-split-btn" data-ft-id="' + ft.id + '" data-st-id="' + st.id + '" title="划分阶段" style="width:18px;height:18px;flex-shrink:0;">📋</button>';
      }
      h += '<span class="planpool-item-date pp-st-date" data-ft-id="' + ft.id + '" data-st-id="' + st.id + '" data-value="' + (st.scheduledDate || '') + '" title="点击设定日期">' + stDateDisplay + '</span>';
      h += '<span class="planpool-item-quad pp-st-quad" data-ft-id="' + ft.id + '" data-st-id="' + st.id + '" data-value="' + (st.targetQuadrant || '') + '" title="点击选择象限">' + (stQuadDisplay || '选择象限') + '</span>';
      h += '<button class="task-defer-btn planpool-import-btn" data-ft-id="' + ft.id + '" data-st-id="' + st.id + '" data-ft-text="' + escHtml(st.text || '') + '" title="导入今日Q-II" style="width:16px;height:16px;font-size:10px;">📥</button>';
      h += '<button class="task-delete-btn pp-st-delete-btn" data-ft-id="' + ft.id + '" data-st-id="' + st.id + '" title="删除子任务" style="width:18px;height:18px;font-size:12px;">&times;</button>';
      h += '</div>';
      // 子任务阶段容器
      if (stHasStages) {
        h += '<div class="planpool-stages planpool-block-stages">';
        st.stages.forEach(function(stage) {
          var stageCompleted = stage.completed ? ' completed' : '';
          h += '<div class="planpool-stage-item' + stageCompleted + '" data-ft-id="' + ft.id + '" data-st-id="' + st.id + '" data-stage-id="' + stage.id + '">';
          h += '<input type="checkbox" class="planpool-stage-checkbox" data-ft-id="' + ft.id + '" data-st-id="' + st.id + '" data-stage-id="' + stage.id + '"' + (stage.completed ? ' checked' : '') + '>';
          h += '<span class="planpool-stage-text" data-ft-id="' + ft.id + '" data-st-id="' + st.id + '" data-stage-id="' + stage.id + '" title="双击编辑内容">' + renderTaskText(stage.text) + '</span>';
          h += '<button class="planpool-stage-del-btn" data-ft-id="' + ft.id + '" data-st-id="' + st.id + '" data-stage-id="' + stage.id + '" title="删除阶段">&times;</button>';
          h += '</div>';
        });
        h += '<button class="planpool-add-stage-btn" data-ft-id="' + ft.id + '" data-st-id="' + st.id + '">+ 阶段</button>';
        h += '<button class="planpool-import-all-btn" data-ft-id="' + ft.id + '" data-st-id="' + st.id + '" data-ft-text="' + escHtml(st.text || '') + '" title="导入全部阶段到今日" style="width:100%;padding:3px 6px;border:1px dashed var(--border2);background:transparent;color:var(--accent);font-size:11px;cursor:pointer;border-radius:4px;margin-top:4px;">📥 导入全部阶段到今日</button>';
        h += '</div>';
      }
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
        completed: false,
        scheduledDate: '',
        targetQuadrant: ''
      });
      saveFn(tasks);
      return;
    }
  }
}

// === Plan pool 阶段操作 ===

function _splitPlanTaskStages(poolKey, saveFn, ftId) {
  var tasks = loadPlanTasks(poolKey);
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === ftId) {
      var ft = tasks[i];
      if (ft.type === 'block') { alert('任务块不支持划分阶段，请对单个任务使用此功能'); return; }
      if (!ft.text) { alert('请先输入任务内容'); return; }
      if (ft.stages && ft.stages.length > 0) { alert('该任务已拆分为阶段'); return; }
      var input = prompt('请输入阶段名称（用逗号分隔，如"设计,编码,测试"）：\n原任务名：' + (ft.text || ''));
      if (!input) return;
      var stageNames = input.split(/[,，]/).map(function(s) { return s.trim(); }).filter(Boolean);
      if (stageNames.length < 2) { alert('请至少输入2个阶段名称'); return; }
      ft.stages = stageNames.map(function(name) {
        return { id: generateId(), text: name, completed: false, timeSlot: typeof getDefaultTimeSlot === 'function' ? getDefaultTimeSlot() : '' };
      });
      ft.completed = false;
      saveFn(tasks);
      return;
    }
  }
}

function _addPlanTaskStage(poolKey, saveFn, ftId, stageText) {
  var tasks = loadPlanTasks(poolKey);
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === ftId) {
      var ft = tasks[i];
      if (!ft.stages) ft.stages = [];
      ft.stages.push({
        id: generateId(),
        text: stageText,
        completed: false,
        timeSlot: typeof getDefaultTimeSlot === 'function' ? getDefaultTimeSlot() : ''
      });
      ft.completed = false;
      saveFn(tasks);
      return;
    }
  }
}

function _deletePlanTaskStage(poolKey, saveFn, ftId, stageId) {
  if (!confirm('确定删除该阶段？')) return;
  var tasks = loadPlanTasks(poolKey);
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === ftId) {
      var ft = tasks[i];
      ft.stages = (ft.stages || []).filter(function(s) { return s.id !== stageId; });
      if (ft.stages.length === 0) {
        delete ft.stages;
        ft.completed = false;
      } else {
        ft.completed = ft.stages.every(function(s) { return s.completed; });
      }
      saveFn(tasks);
      return;
    }
  }
}

function _togglePlanTaskStageComplete(poolKey, saveFn, ftId, stageId, completed) {
  var tasks = loadPlanTasks(poolKey);
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === ftId && tasks[i].stages) {
      for (var j = 0; j < tasks[i].stages.length; j++) {
        if (tasks[i].stages[j].id === stageId) {
          tasks[i].stages[j].completed = completed;
          tasks[i].completed = tasks[i].stages.every(function(s) { return s.completed; });
          saveFn(tasks);
          return;
        }
      }
    }
  }
}

function _updatePlanTaskStageText(poolKey, saveFn, ftId, stageId, newText) {
  var tasks = loadPlanTasks(poolKey);
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === ftId && tasks[i].stages) {
      for (var j = 0; j < tasks[i].stages.length; j++) {
        if (tasks[i].stages[j].id === stageId) {
          tasks[i].stages[j].text = newText;
          saveFn(tasks);
          return;
        }
      }
    }
  }
}

// === Plan pool block 子任务阶段操作 ===

function _splitPlanBlockSubStages(poolKey, saveFn, ftId, stId) {
  var tasks = loadPlanTasks(poolKey);
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === ftId && tasks[i].tasks) {
      for (var j = 0; j < tasks[i].tasks.length; j++) {
        var st = tasks[i].tasks[j];
        if (st.id === stId) {
          if (st.stages && st.stages.length > 0) { alert('该子任务已拆分为阶段'); return; }
          var input = prompt('请输入阶段名称（用逗号分隔，如"设计,编码,测试"）：\n子任务名：' + (st.text || ''));
          if (!input) return;
          var stageNames = input.split(/[,，]/).map(function(s) { return s.trim(); }).filter(Boolean);
          if (stageNames.length < 2) { alert('请至少输入2个阶段名称'); return; }
          st.stages = stageNames.map(function(name) {
            return { id: generateId(), text: name, completed: false, timeSlot: typeof getDefaultTimeSlot === 'function' ? getDefaultTimeSlot() : '' };
          });
          st.completed = false;
          saveFn(tasks);
          return;
        }
      }
    }
  }
}

function _addPlanBlockSubStage(poolKey, saveFn, ftId, stId, stageText) {
  var tasks = loadPlanTasks(poolKey);
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === ftId && tasks[i].tasks) {
      for (var j = 0; j < tasks[i].tasks.length; j++) {
        var st = tasks[i].tasks[j];
        if (st.id === stId) {
          if (!st.stages) st.stages = [];
          st.stages.push({
            id: generateId(), text: stageText, completed: false,
            timeSlot: typeof getDefaultTimeSlot === 'function' ? getDefaultTimeSlot() : ''
          });
          st.completed = false;
          saveFn(tasks);
          return;
        }
      }
    }
  }
}

function _deletePlanBlockSubStage(poolKey, saveFn, ftId, stId, stageId) {
  if (!confirm('确定删除该阶段？')) return;
  var tasks = loadPlanTasks(poolKey);
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === ftId && tasks[i].tasks) {
      for (var j = 0; j < tasks[i].tasks.length; j++) {
        var st = tasks[i].tasks[j];
        if (st.id === stId && st.stages) {
          st.stages = st.stages.filter(function(s) { return s.id !== stageId; });
          if (st.stages.length === 0) { delete st.stages; st.completed = false; }
          else { st.completed = st.stages.every(function(s) { return s.completed; }); }
          saveFn(tasks);
          return;
        }
      }
    }
  }
}

function _togglePlanBlockSubStageComplete(poolKey, saveFn, ftId, stId, stageId, completed) {
  var tasks = loadPlanTasks(poolKey);
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === ftId && tasks[i].tasks) {
      for (var j = 0; j < tasks[i].tasks.length; j++) {
        var st = tasks[i].tasks[j];
        if (st.id === stId && st.stages) {
          for (var k = 0; k < st.stages.length; k++) {
            if (st.stages[k].id === stageId) {
              st.stages[k].completed = completed;
              st.completed = st.stages.every(function(s) { return s.completed; });
              saveFn(tasks);
              return;
            }
          }
        }
      }
    }
  }
}

function _updatePlanBlockSubStageText(poolKey, saveFn, ftId, stId, stageId, newText) {
  var tasks = loadPlanTasks(poolKey);
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === ftId && tasks[i].tasks) {
      for (var j = 0; j < tasks[i].tasks.length; j++) {
        var st = tasks[i].tasks[j];
        if (st.id === stId && st.stages) {
          for (var k = 0; k < st.stages.length; k++) {
            if (st.stages[k].id === stageId) {
              st.stages[k].text = newText;
              saveFn(tasks);
              return;
            }
          }
        }
      }
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

  // ===== 优先问题渲染 =====
  var ppListEl = document.getElementById('priorityProblemsList');
  var ppSeparator = document.getElementById('priorityProblemsSeparator');
  var ppActions = document.getElementById('priorityProblemsActions');
  var ppAddBtn = document.getElementById('btnAddPriorityProblem');

  if (!ppListEl) return;

  // 清空旧优先问题项
  ppListEl.querySelectorAll('.priority-problem-item').forEach(function(el) { el.remove(); });

  var problems = data.priorityProblems || [];

  if (problems.length === 0) {
    if (ppSeparator) ppSeparator.style.display = 'none';
    // 仍显示"+ 添加优先问题"按钮，否则空状态下无法添加第一条
    if (ppActions) ppActions.style.display = '';
    if (ppAddBtn) ppAddBtn.style.display = '';
    return;
  }

  if (ppSeparator) ppSeparator.style.display = '';
  if (ppActions) {
    if (ppAddBtn) ppAddBtn.style.display = problems.length >= 2 ? 'none' : '';
    ppActions.style.display = '';
  }

  problems.forEach(function(p, idx) {
    var el = document.createElement('div');
    el.className = 'priority-problem-item';
    el.innerHTML = '<span class="priority-problem-index">' + (idx + 1) + '.</span>' +
      '<span class="priority-problem-text">' + Util.escHtml(p.text) + '</span>' +
      '<button class="task-delete-btn priority-problem-del-btn" data-ppid="' + p.id + '">&times;</button>';
    ppListEl.appendChild(el);
  });

  // 绑定双击编辑
  ppListEl.querySelectorAll('.priority-problem-text').forEach(function(el) {
    el.addEventListener('dblclick', function() {
      var ppid = this.parentElement.querySelector('.priority-problem-del-btn').dataset.ppid;
      startEdit(this, this.textContent, function(newVal) {
        updatePriorityProblem(ppid, newVal);
        renderPrinciplesPanel();
      });
    });
  });

  // 绑定删除
  ppListEl.querySelectorAll('.priority-problem-del-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (!confirm('删除该优先问题？')) return;
      deletePriorityProblem(this.dataset.ppid);
      renderPrinciplesPanel();
    });
  });
}
