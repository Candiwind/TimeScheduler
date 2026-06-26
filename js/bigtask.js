// bigtask.js - Big task panel (render, modals, AI planning, pool drag)
var _bigTaskPanelInit = false;

// ============ Setup ============

function setupBigTaskPanel() {
  if (_bigTaskPanelInit) return;
  _bigTaskPanelInit = true;

  document.getElementById('bigTaskPanelToggle').addEventListener('click', function() {
    document.getElementById('bigTaskPanel').classList.toggle('collapsed');
  });

  document.getElementById('btnAddBigTask').addEventListener('click', showAddBigTaskModal);
  document.getElementById('btnClaudePlan').addEventListener('click', showAIPlanModal);
}

// ============ Render ============

function renderBigTaskPanel() {
  var bigTasks = loadBigTasks();
  var listEl = document.getElementById('bigTaskList');

  // Save expanded card states and collapsed milestone states before re-render
  var expandedCardIds = {};
  var collapsedMilestoneIds = {};
  var existingCards = document.querySelectorAll('#bigTaskList .bigtask-card');
  existingCards.forEach(function(card) {
    if (card.classList.contains('expanded')) {
      var nameEl = card.querySelector('.bt-editable-name');
      if (nameEl && nameEl.dataset.btId) expandedCardIds[nameEl.dataset.btId] = true;
    }
    card.querySelectorAll('.bigtask-milestone').forEach(function(ms) {
      var msNameEl = ms.querySelector('.ms-editable-name');
      if (msNameEl && msNameEl.dataset.msId && ms.classList.contains('collapsed')) {
        collapsedMilestoneIds[msNameEl.dataset.msId] = true;
      }
    });
  });
  var emptyEl = document.getElementById('bigTaskEmpty');
  var countEl = document.getElementById('bigTaskCount');

  if (countEl) countEl.textContent = bigTasks.length;

  if (bigTasks.length === 0) {
    listEl.innerHTML = '';
    listEl.appendChild(emptyEl || document.createElement('div'));
    document.getElementById('bigTaskPool').style.display = 'none';
    return;
  }

  if (emptyEl && emptyEl.parentNode) emptyEl.parentNode.removeChild(emptyEl);

  var frag = document.createDocumentFragment();
  bigTasks.forEach(function(bt, idx) {
    var div = document.createElement('div');
    div.innerHTML = renderBigTaskCardHTML(bt, idx);
    while (div.firstChild) frag.appendChild(div.firstChild);
  });
  listEl.innerHTML = '';
  listEl.appendChild(frag);

  // Bind card toggle
  listEl.querySelectorAll('.bigtask-card-header').forEach(function(header) {
    header.addEventListener('click', function(e) {
      if (e.target.closest('button, input, .bt-editable, .bt-date-editable, .bt-weight-editable')) return;
      this.parentElement.classList.toggle('expanded');
    });
  });

  // Bind name editing
  listEl.querySelectorAll('.bt-editable-name').forEach(function(el) {
    el.addEventListener('dblclick', function(e) { e.stopPropagation();
      var btId = this.dataset.btId;
      startEdit(this, this.textContent, function(newVal) {
        updateBigTask(btId, { name: newVal });
        renderBigTaskPanel();
      });
    });
  });
  listEl.querySelectorAll('.bt-editable-target').forEach(function(el) {
    el.addEventListener('click', function(e) { e.stopPropagation();
      var btId = this.dataset.btId;
      var input = createDateTextInput(this.dataset.value, function(newVal) {
        updateBigTask(btId, { targetDate: newVal });
      }, function() { renderBigTaskPanel(); });
      this.innerHTML = ''; this.appendChild(input); input.focus();
    });
  });

  // Bind milestone subtask checkboxes
  listEl.querySelectorAll('.bigtask-subtask-checkbox').forEach(function(cb) {
    cb.addEventListener('change', function() {
      toggleBigSubtaskComplete(this.dataset.bigTaskId, this.dataset.subtaskId, this.checked);
      renderBigTaskPanel();
    });
  });

  // Bind complete toggle
  listEl.querySelectorAll('.bigtask-complete-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var btId = this.dataset.btId;
      var bts = loadBigTasks();
      var bt = null;
      for (var bi = 0; bi < bts.length; bi++) { if (bts[bi].id === btId) { bt = bts[bi]; break; } }
      var newProgress = (bt && bt.progress >= 100) ? 0 : 100;
      updateBigTask(btId, { progress: newProgress });
      renderBigTaskPanel();
    });
  });

  // Bind delete
  listEl.querySelectorAll('.bigtask-delete-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (confirm('确定删除该大任务及其所有规划？')) {
        deleteBigTask(this.dataset.bigTaskId);
        renderBigTaskPanel();
      }
    });
  });

  // Bind milestone toggles and editable fields
  listEl.querySelectorAll('.bigtask-milestone-header').forEach(function(header) {
    header.addEventListener('click', function(e) {
      if (e.target.closest('button, .ms-editable-name, .ms-editable-dates, .ms-editable-weight')) return;
      this.parentElement.classList.toggle('collapsed');
    });
  });

  listEl.querySelectorAll('.ms-editable-name').forEach(function(el) {
    el.addEventListener('dblclick', function(e) { e.stopPropagation();
      var btId = this.dataset.btId; var msId = this.dataset.msId;
      startEdit(this, this.textContent, function(newVal) {
        editMilestoneField(btId, msId, 'name', newVal);
        renderBigTaskPanel();
      });
    });
  });
  listEl.querySelectorAll('.ms-editable-dates').forEach(function(el) {
    el.addEventListener('click', function(e) { e.stopPropagation();
      var btId = this.dataset.btId; var msId = this.dataset.msId;
      var parts = (this.dataset.value || '~').split('~');
      showDateRangeEditor(this, parts[0].trim(), parts[1] ? parts[1].trim() : '', function(start, end) {
        editMilestoneField(btId, msId, 'dateRange', [start, end]);
        renderBigTaskPanel();
      });
    });
  });
  listEl.querySelectorAll('.ms-editable-weight').forEach(function(el) {
    el.addEventListener('click', function(e) { e.stopPropagation();
      var btId = this.dataset.btId; var msId = this.dataset.msId;
      var curW = parseInt(this.dataset.value) || 0;
      showWeightEditor(this, curW, function(newW) {
        editMilestoneField(btId, msId, 'weight', newW);
        renderBigTaskPanel();
      });
    });
  });

  listEl.querySelectorAll('.ms-delete-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) { e.stopPropagation();
      if (!confirm('删除该里程碑及其所有子任务？')) return;
      var btId = this.dataset.btId; var msId = this.dataset.msId;
      deleteMilestone(btId, msId);
      renderBigTaskPanel();
    });
  });

  // Subtask editable fields
  listEl.querySelectorAll('.st-editable-text').forEach(function(el) {
    el.addEventListener('dblclick', function(e) { e.stopPropagation();
      var btId = this.dataset.btId; var msId = this.dataset.msId; var stId = this.dataset.stId;
      startEdit(this, this.textContent, function(newVal) {
        editSubtaskField(btId, msId, stId, 'text', newVal);
        renderBigTaskPanel();
      });
    });
  });
  listEl.querySelectorAll('.st-editable-date').forEach(function(el) {
    el.addEventListener('click', function(e) { e.stopPropagation();
      var btId = this.dataset.btId; var msId = this.dataset.msId; var stId = this.dataset.stId;
      var input = createDateTextInput(this.dataset.value, function(newVal) {
        editSubtaskField(btId, msId, stId, 'plannedDate', newVal);
      }, function() { renderBigTaskPanel(); });
      this.innerHTML = ''; this.appendChild(input); input.focus();
    });
  });
  listEl.querySelectorAll('.st-editable-weight').forEach(function(el) {
    el.addEventListener('click', function(e) { e.stopPropagation();
      var btId = this.dataset.btId; var msId = this.dataset.msId; var stId = this.dataset.stId;
      var curW = parseInt(this.dataset.value) || 5;
      showWeightEditor(this, curW, function(newW) {
        editSubtaskField(btId, msId, stId, 'weight', newW);
        renderBigTaskPanel();
      });
    });
  });

  listEl.querySelectorAll('.st-import-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) { e.stopPropagation();
      importBigSubtaskToToday(this.dataset.btId, this.dataset.msId, this.dataset.stId);
    });
  });

  listEl.querySelectorAll('.st-delete-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) { e.stopPropagation();
      if (!confirm('删除该子任务？')) return;
      deleteSubtaskFromBigTask(this.dataset.btId, this.dataset.msId, this.dataset.stId);
      renderBigTaskPanel();
    });
  });

  listEl.querySelectorAll('.bt-add-ms-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) { e.stopPropagation();
      var btId = this.dataset.btId;
      var name = prompt('里程碑名称：');
      if (!name) return;
      addMilestoneToBigTask(btId, name);
      renderBigTaskPanel();
    });
  });

  listEl.querySelectorAll('.ms-add-st-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) { e.stopPropagation();
      var btId = this.dataset.btId; var msId = this.dataset.msId;
      var text = prompt('子任务内容：');
      if (!text) return;
      addSubtaskToMilestone(btId, msId, text);
      renderBigTaskPanel();
    });
  });

  // Bind drag handlers for bigtask subtasks
  listEl.querySelectorAll('.bigtask-subtask').forEach(function(el) {
    el.addEventListener('dragstart', handleBigtaskSubDragStart);
    el.addEventListener('dragend', handleBigtaskSubDragEnd);
    el.addEventListener('dragover', handleBigtaskSubDragOver);
    el.addEventListener('dragleave', handleBigtaskSubDragLeave);
    el.addEventListener('drop', handleBigtaskSubDrop);
  });

  // Bind big task subtask stage operations
  listEl.querySelectorAll('.bt-st-split-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      splitBigSubtaskIntoStages(this.dataset.btId, this.dataset.stId);
    });
  });
  listEl.querySelectorAll('[data-bt-stage]').forEach(function(cb) {
    cb.addEventListener('change', function() {
      toggleBigSubtaskStage(this.dataset.btId, this.dataset.stId, this.dataset.stageId, this.checked);
    });
  });
  listEl.querySelectorAll('.bt-stage-del').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      deleteBigSubtaskStage(this.dataset.btId, this.dataset.stId, this.dataset.stageId);
    });
  });
  listEl.querySelectorAll('.bt-add-stage-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      addBigSubtaskStage(this.dataset.btId, this.dataset.stId);
    });
  });
  listEl.querySelectorAll('.bt-stage-text').forEach(function(el) {
    el.addEventListener('dblclick', function(e) {
      e.stopPropagation();
      var btId = this.dataset.btId;
      var stId = this.dataset.stId;
      var stageId = this.dataset.stageId;
      var self = this;
      var input = document.createElement('input');
      input.type = 'text';
      input.value = this.textContent;
      input.style.cssText = 'width:100%;font-size:11px;padding:1px 4px;border:1px solid var(--accent);border-radius:3px;';
      input.addEventListener('blur', function() {
        var newVal = this.value.trim();
        if (newVal && newVal !== self.textContent) {
          updateBigSubtaskStageText(btId, stId, stageId, newVal);
        } else {
          renderBigTaskPanel();
        }
      });
      input.addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter') { this.blur(); }
        if (ev.key === 'Escape') { renderBigTaskPanel(); }
      });
      this.innerHTML = '';
      this.appendChild(input);
      input.focus();
    });
  });

  // Bind highlight toggle for big task subtasks
  listEl.querySelectorAll('.bt-st-hl-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      toggleBigSubtaskHighlight(this.dataset.btId, this.dataset.stId);
    });
  });

  // Bind highlight toggle for big task stages
  listEl.querySelectorAll('.bt-stage-hl-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      toggleBigSubtaskStageHighlight(this.dataset.btId, this.dataset.stId, this.dataset.stageId);
    });
  });

  // Bind stage import button
  listEl.querySelectorAll('.bt-stage-import-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      importBigSubtaskStageToToday(this.dataset.btId, this.dataset.stId, this.dataset.stageId, this.dataset.stageText);
    });
  });

  // Bind stage date editing
  listEl.querySelectorAll('.bt-stage-date').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      var btId = this.dataset.btId;
      var stId = this.dataset.stId;
      var stageId = this.dataset.stageId;
      var curVal = this.dataset.value;
      var input = createDateTextInput(curVal, function(newVal) {
        editBigSubtaskStageDate(btId, stId, stageId, newVal);
      }, function() { renderBigTaskPanel(); });
      this.innerHTML = '';
      this.appendChild(input);
      input.focus();
    });
  });

  // Restore expanded card states
  listEl.querySelectorAll('.bigtask-card').forEach(function(card) {
    var nameEl = card.querySelector('.bt-editable-name');
    if (nameEl && nameEl.dataset.btId && expandedCardIds[nameEl.dataset.btId]) {
      card.classList.add('expanded');
    }
  });

  // Restore collapsed milestone states
  listEl.querySelectorAll('.bigtask-milestone').forEach(function(ms) {
    var msNameEl = ms.querySelector('.ms-editable-name');
    if (msNameEl && msNameEl.dataset.msId && collapsedMilestoneIds[msNameEl.dataset.msId]) {
      ms.classList.add('collapsed');
    }
  });

  renderBigTaskPool();
}

function renderBigTaskCardHTML(bt, idx) {
  var daysLeft = Util.calcDaysLeft(bt.targetDate);
  var countdownClass = daysLeft <= 14 ? ' urgent' : '';

  var completedClass = (bt.progress >= 100) ? ' completed' : '';
  var h = '<div class="bigtask-card' + completedClass + '">';
  h += '<div class="bigtask-card-header">';
  h += '<span class="bigtask-card-icon">📌</span>';
  h += '<div class="bigtask-card-info">';
  h += '<div class="bigtask-card-name bt-editable-name" data-bt-id="' + bt.id + '" title="双击编辑名称">' + Util.escHtml(bt.name) + '</div>';
  h += '<div class="bigtask-card-meta">截止：<span class="bt-editable-target" data-bt-id="' + bt.id + '" data-value="' + bt.targetDate + '" title="点击修改截止日期" style="cursor:pointer;text-decoration:underline dotted;color:var(--accent);">' + bt.targetDate + '</span> | ' + (bt.milestones ? bt.milestones.length : 0) + ' 个里程碑</div>';
  h += '</div>';
  h += '<div class="bigtask-card-progress-wrap">';
  h += '<div class="bigtask-card-progress-bar"><div class="bigtask-card-progress-fill" style="width:' + (bt.progress || 0) + '%"></div></div>';
  h += '<span class="bigtask-card-progress-text">' + (bt.progress || 0) + '%</span>';
  h += '</div>';
  h += '<span class="bigtask-card-countdown' + countdownClass + '">' + (daysLeft >= 0 ? '倒计时 ' + daysLeft + ' 天' : '已逾期') + '</span>';
  h += '<button class="bigtask-complete-btn' + (bt.progress >= 100 ? ' completed' : '') + '" data-bt-id="' + bt.id + '" title="' + (bt.progress >= 100 ? '标记为未完成' : '标记为完成') + '" style="font-size:14px;padding:0;width:22px;height:22px;border:1px solid var(--border);border-radius:4px;background:transparent;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;">' + (bt.progress >= 100 ? '✅' : '⬜') + '</button>';
  h += '<span class="bigtask-card-toggle" style="font-size:10px;color:var(--text3);transition:transform var(--t);">▼</span>';
  h += '<button class="task-delete-btn bigtask-delete-btn" data-big-task-id="' + bt.id + '" title="删除大任务">&times;</button>';
  h += '</div>';
  h += '<div class="bigtask-card-body">';
  if (bt.analysis) {
    h += '<div style="padding:8px 12px;margin-bottom:8px;background:var(--accent-light);border-radius:6px;font-size:12px;color:var(--text2);line-height:1.5;">📋 <strong>分析：</strong>' + Util.escHtml(bt.analysis) + '</div>';
  }
  if (bt.references && bt.references.length > 0) {
    h += '<div style="padding:8px 12px;margin-bottom:8px;background:var(--surface3);border-radius:6px;font-size:12px;line-height:1.6;">📚 <strong>参考资料：</strong><br>';
    bt.references.forEach(function(ref, ri) {
      h += '&nbsp;&nbsp;' + (ri + 1) + '. ' + Util.escHtml(ref) + '<br>';
    });
    h += '</div>';
  }
  if (bt.milestones && bt.milestones.length > 0) {
    bt.milestones.forEach(function(ms) {
      var msDone = 0, msTotal = 0;
      if (ms.tasks) {
        ms.tasks.forEach(function(t) {
          if (t.stages && t.stages.length > 0) {
            t.stages.forEach(function(s) { msTotal++; if (s.completed) msDone++; });
          } else {
            msTotal++;
            if (t.completed) msDone++;
          }
        });
      }
      var msRate = msTotal > 0 ? Math.round(msDone / msTotal * 100) : 0;
      var datesStr = ms.dateRange ? ms.dateRange[0] + ' ~ ' + ms.dateRange[1] : '';
      h += '<div class="bigtask-milestone">';
      h += '<div class="bigtask-milestone-header">';
      h += '<span class="bigtask-milestone-toggle">▼</span>';
      h += '<span class="bigtask-milestone-name ms-editable-name" data-bt-id="' + bt.id + '" data-ms-id="' + ms.id + '" title="双击编辑名称">📅 ' + Util.escHtml(ms.name) + '</span>';
      h += '<span class="bigtask-milestone-date ms-editable-dates" data-bt-id="' + bt.id + '" data-ms-id="' + ms.id + '" data-value="' + Util.escHtml(datesStr) + '" title="点击修改日期范围" style="cursor:pointer;">' + Util.escHtml(datesStr || '点击设日期') + '</span>';
      h += '<span class="bigtask-milestone-weight ms-editable-weight" data-bt-id="' + bt.id + '" data-ms-id="' + ms.id + '" data-value="' + (ms.weight || 0) + '" title="点击修改参考权重" style="cursor:pointer;">参考权重 ' + (ms.weight || 0) + '%</span>';
      h += '<button class="task-delete-btn ms-delete-btn" data-bt-id="' + bt.id + '" data-ms-id="' + ms.id + '" title="删除里程碑" style="width:18px;height:18px;font-size:14px;">&times;</button>';
      h += '</div>';
      h += '<div class="bigtask-milestone-bar"><div class="bigtask-milestone-bar-fill" style="width:' + msRate + '%"></div></div>';
      h += '<div class="bigtask-milestone-body">';
      if (ms.tasks && ms.tasks.length > 0) {
        // Sort by plannedDate, nulls last
        ms.tasks.sort(function(a, b) {
          if (!a.plannedDate && !b.plannedDate) return 0;
          if (!a.plannedDate) return 1;
          if (!b.plannedDate) return -1;
          return a.plannedDate.localeCompare(b.plannedDate);
        });
        ms.tasks.forEach(function(t) {
          var btHasStages = t.stages && t.stages.length > 0;
          h += '<div class="bigtask-subtask" draggable="true" data-type="bigtask-subtask" data-bt-id="' + bt.id + '" data-ms-id="' + ms.id + '" data-st-id="' + t.id + '" data-st-text="' + Util.escHtml(t.text).replace(/"/g, '&quot;') + '">';
          h += '<input type="checkbox" class="task-checkbox bigtask-subtask-checkbox" data-big-task-id="' + bt.id + '" data-subtask-id="' + t.id + '" ' + (t.completed ? 'checked' : '') + (btHasStages ? ' disabled style="pointer-events:none;opacity:0.5;"' : '') + '>';
          var hlIcon = (t.highlights && t.highlights.length > 0) ? '⭐' : '☆';
          h += '<span class="bigtask-subtask-text st-editable-text' + (t.completed ? ' done' : '') + '" data-bt-id="' + bt.id + '" data-ms-id="' + ms.id + '" data-st-id="' + t.id + '" title="双击编辑内容">' + renderTaskText(t.text, t.highlights) + '</span>';
          if (!btHasStages) {
            h += '<span class="bigtask-subtask-date st-editable-date" data-bt-id="' + bt.id + '" data-ms-id="' + ms.id + '" data-st-id="' + t.id + '" data-value="' + (t.plannedDate || '') + '" title="点击修改日期" style="cursor:pointer;">' + (t.plannedDate || '📅') + '</span>';
            h += '<span class="bigtask-subtask-weight st-editable-weight" data-bt-id="' + bt.id + '" data-ms-id="' + ms.id + '" data-st-id="' + t.id + '" data-value="' + (t.weight || 5) + '" title="点击修改参考权重" style="cursor:pointer;">' + (t.weight || 5) + '%</span>';
            h += '<button class="task-defer-btn st-import-btn" data-bt-id="' + bt.id + '" data-ms-id="' + ms.id + '" data-st-id="' + t.id + '" title="导入今日任务" style="width:18px;height:18px;font-size:11px;">📥</button>';
          }
          h += '<button class="task-extra-btn bt-st-hl-btn" data-bt-id="' + bt.id + '" data-st-id="' + t.id + '" title="高亮/取消高亮" style="width:18px;height:18px;font-size:11px;padding:0;">' + hlIcon + '</button>';
          h += '<button class="task-delete-btn st-delete-btn" data-bt-id="' + bt.id + '" data-ms-id="' + ms.id + '" data-st-id="' + t.id + '" title="删除子任务" style="width:16px;height:16px;font-size:12px;">&times;</button>';
          h += '<button class="split-stages-btn bt-st-split-btn" data-bt-id="' + bt.id + '" data-st-id="' + t.id + '" title="拆分为阶段" style="width:18px;height:18px;font-size:10px;">⊞</button>';
          h += '</div>';
          // Stages for this big task subtask
          if (btHasStages) {
            // Sort stages by plannedDate, nulls last
            t.stages.sort(function(a, b) {
              if (!a.plannedDate && !b.plannedDate) return 0;
              if (!a.plannedDate) return 1;
              if (!b.plannedDate) return -1;
              return a.plannedDate.localeCompare(b.plannedDate);
            });
            t.stages.forEach(function(s) {
              var sHlIcon = (s.highlights && s.highlights.length > 0) ? '⭐' : '☆';
              h += '<div class="bigtask-subtask-stage' + (s.completed ? ' completed' : '') + '" style="display:flex;align-items:center;gap:4px;padding:2px 6px 2px 28px;font-size:11px;">';
              h += '<input type="checkbox" class="task-checkbox" style="width:14px;height:14px;" data-bt-stage="1" data-bt-id="' + bt.id + '" data-st-id="' + t.id + '" data-stage-id="' + s.id + '" ' + (s.completed ? 'checked' : '') + '>';
              h += '<span class="bt-stage-text" data-bt-id="' + bt.id + '" data-st-id="' + t.id + '" data-stage-id="' + s.id + '" title="双击编辑" style="flex:1;">' + renderTaskText(s.text, s.highlights) + '</span>';
              h += '<span class="bt-stage-date" data-bt-id="' + bt.id + '" data-st-id="' + t.id + '" data-stage-id="' + s.id + '" data-value="' + (s.plannedDate || '') + '" title="点击修改日期" style="cursor:pointer;font-size:10px;color:var(--text2);">' + (s.plannedDate || '📅') + '</span>';
              h += '<button class="task-extra-btn bt-stage-hl-btn" data-bt-id="' + bt.id + '" data-st-id="' + t.id + '" data-stage-id="' + s.id + '" title="高亮/取消高亮" style="width:14px;height:14px;font-size:9px;padding:0;">' + sHlIcon + '</button>';
              h += '<button class="task-defer-btn bt-stage-import-btn" data-bt-id="' + bt.id + '" data-st-id="' + t.id + '" data-stage-id="' + s.id + '" data-stage-text="' + Util.escHtml(s.text).replace(/"/g, '&quot;') + '" title="导入今日象限" style="width:16px;height:16px;font-size:10px;padding:0;">📥</button>';
              h += '<button class="task-delete-btn bt-stage-del" data-bt-id="' + bt.id + '" data-st-id="' + t.id + '" data-stage-id="' + s.id + '" style="width:14px;height:14px;font-size:10px;">&times;</button>';
              h += '</div>';
            });
            h += '<button class="add-stage-btn bt-add-stage-btn" data-bt-id="' + bt.id + '" data-st-id="' + t.id + '" style="margin-left:28px;width:calc(100% - 28px);">+ 阶段</button>';
          }
        });
      } else {
        h += '<div style="font-size:11px;color:var(--text3);padding:4px;">（无子任务）</div>';
      }
      h += '<button class="add-subtask-btn ms-add-st-btn" data-bt-id="' + bt.id + '" data-ms-id="' + ms.id + '" style="border-radius:6px;margin-top:2px;">+ 添加子任务</button>';
      h += '</div></div>';
    });
  } else {
    h += '<div class="empty-hint">暂无里程碑，请用 AI 规划或手动添加</div>';
  }
  h += '<button class="add-subtask-btn bt-add-ms-btn" data-bt-id="' + bt.id + '" style="border-radius:6px;margin-top:6px;padding:8px;">+ 添加里程碑</button>';
  h += '</div></div>';
  return h;
}

function renderBigTaskPool() {
  var poolEl = document.getElementById('bigTaskPool');
  var itemsEl = document.getElementById('bigTaskPoolItems');
  if (!poolEl || !itemsEl) return;

  var today = currentDate;
  var poolItems = getBigTasksForDate(today);

  if (poolItems.length === 0) {
    poolEl.style.display = 'none';
    itemsEl.innerHTML = '';
    return;
  }

  poolEl.style.display = '';
  itemsEl.innerHTML = '';

  // Show warning if too many tasks scheduled for today
  if (poolItems.length > 3) {
    var warnEl = document.createElement('div');
    warnEl.className = 'pool-daily-warning';
    warnEl.textContent = '⚠️ 今日任务较多（' + poolItems.length + ' 个），建议每日安排 ≤3 个任务，避免设立不可能完成的计划';
    itemsEl.appendChild(warnEl);
  }

  poolItems.forEach(function(pi) {
    var el = document.createElement('div');
    el.className = 'bigtask-pool-item';
    el.draggable = true;
    el.dataset.poolBigTaskId = pi.bigTaskId;
    el.dataset.poolSubtaskId = pi.task.id;
    el.dataset.poolText = pi.task.text;
    el.dataset.poolWeight = pi.task.weight || 5;

    el.innerHTML = '<span>' + renderTaskText(pi.task.text) + '</span>' +
      '<span class="pool-item-source">[' + Util.escHtml(pi.bigTaskName) + ' / ' + Util.escHtml(pi.milestoneName) + ']</span>' +
      '<span style="font-size:10px;color:var(--accent);">' + (pi.task.weight || 5) + '%</span>';

    el.addEventListener('dragstart', handlePoolDragStart);
    el.addEventListener('dragend', handlePoolDragEnd);
    itemsEl.appendChild(el);
  });
}

// ============ Pool Drag Handlers ============

function handlePoolDragStart(e) {
  this.classList.add('dragging');
  draggedItem = this;
  dragSourceQuadrant = null;
  dragSourceBlockId = null;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', 'POOL:' + this.dataset.poolBigTaskId + ':' + this.dataset.poolSubtaskId + ':' + this.dataset.poolText + ':' + (this.dataset.poolWeight || '5'));
  window._dragFromPool = {
    bigTaskId: this.dataset.poolBigTaskId,
    subtaskId: this.dataset.poolSubtaskId,
    text: this.dataset.poolText,
    weight: parseInt(this.dataset.poolWeight) || 5
  };
}

function handlePoolDragEnd(e) {
  this.classList.remove('dragging');
  draggedItem = null;
  dragSourceQuadrant = null;
  dragSourceBlockId = null;
  window._dragFromPool = null;
}

// ============ Override Drop Handlers for Pool + Future ============

// Applied after original handleQuadrantDrop is defined
function applyBigTaskDropOverrides() {
  var _origHandleQuadrantDrop = handleQuadrantDrop;
  handleQuadrantDrop = function(e) {
    if (window._dragFromPool) {
      e.preventDefault();
      var container = this.querySelector('.quadrant-tasks');
      if (container) container.classList.remove('drag-over');
      clearAllHighlights();
      addPoolTaskToQuadrant(this.dataset.key, window._dragFromPool);
      window._dragFromPool = null;
      return;
    }
    if (window._dragFromFuture) {
      e.preventDefault();
      var c = this.querySelector('.quadrant-tasks');
      if (c) c.classList.remove('drag-over');
      clearAllHighlights();
      addFutureDragToQuadrant(this.dataset.key, window._dragFromFuture);
      window._dragFromFuture = null;
      return;
    }
    if (window._dragFromBigtask) {
      e.preventDefault();
      var container2 = this.querySelector('.quadrant-tasks');
      if (container2) container2.classList.remove('drag-over');
      clearAllHighlights();
      moveBigtaskSubToQuadrant(this.dataset.key, window._dragFromBigtask);
      window._dragFromBigtask = null;
      return;
    }
    if (draggedItem && draggedItem.dataset.type === 'stage') {
      e.preventDefault();
      var c3 = this.querySelector('.quadrant-tasks');
      if (c3) c3.classList.remove('drag-over');
      clearAllHighlights();
      moveStageOutToTask(
        draggedItem.dataset.quadrant,
        draggedItem.dataset.blockId || null,
        draggedItem.dataset.subtaskId || null,
        draggedItem.dataset.taskId || null,
        draggedItem.dataset.stageId
      );
      draggedItem = null;
      dragSourceQuadrant = null;
      dragSourceBlockId = null;
      return;
    }
    _origHandleQuadrantDrop.call(this, e);
  };

  var _origHandleTaskDrop = handleTaskDrop;
  handleTaskDrop = function(e) {
    if (window._dragFromPool) {
      e.preventDefault(); e.stopPropagation();
      this.classList.remove('drag-over-task');
      addPoolTaskToQuadrant(this.dataset.quadrant, window._dragFromPool);
      window._dragFromPool = null;
      return;
    }
    if (window._dragFromFuture) {
      e.preventDefault(); e.stopPropagation();
      this.classList.remove('drag-over-task');
      addFutureDragToQuadrant(this.dataset.quadrant, window._dragFromFuture);
      window._dragFromFuture = null;
      return;
    }
    if (window._dragFromBigtask) {
      e.preventDefault(); e.stopPropagation();
      this.classList.remove('drag-over-task');
      moveBigtaskSubToQuadrant(this.dataset.quadrant, window._dragFromBigtask);
      window._dragFromBigtask = null;
      return;
    }
    _origHandleTaskDrop.call(this, e);
  };

  var _origHandleBlockDrop = handleBlockDrop;
  handleBlockDrop = function(e) {
    if (window._dragFromPool) {
      e.preventDefault(); e.stopPropagation();
      this.classList.remove('drag-over-block');
      var targetQuadrant = this.dataset.quadrant;
      var targetBlockId = this.dataset.id;
      var poolData = window._dragFromPool;
      var data = loadDateData(currentDate);
      for (var i = 0; i < data[targetQuadrant].length; i++) {
        if (data[targetQuadrant][i].id === targetBlockId && data[targetQuadrant][i].blockName !== undefined) {
          if (!data[targetQuadrant][i].tasks) data[targetQuadrant][i].tasks = [];
          var newSubtask = {
            id: generateId(),
            text: poolData.text,
            completed: false,
            bigTaskRef: { bigTaskId: poolData.bigTaskId, subtaskId: poolData.subtaskId }
          };
          var stData = getBigSubtaskData(poolData.bigTaskId, poolData.subtaskId);
          if (stData) {
            var copiedStages = copyBigSubtaskStages(stData);
            if (copiedStages) newSubtask.stages = copiedStages;
          }
          data[targetQuadrant][i].tasks.push(newSubtask);
          break;
        }
      }
      saveDateData(currentDate, data);
      toggleBigSubtaskComplete(poolData.bigTaskId, poolData.subtaskId, false);
      window._dragFromPool = null;
      renderAll(currentDate);
      return;
    }
    if (window._dragFromFuture) {
      e.preventDefault(); e.stopPropagation();
      this.classList.remove('drag-over-block');
      var tQ = this.dataset.quadrant;
      var tBId = this.dataset.id;
      var fData = window._dragFromFuture;
      var d2 = loadDateData(currentDate);
      for (var i2 = 0; i2 < d2[tQ].length; i2++) {
        if (d2[tQ][i2].id === tBId && d2[tQ][i2].blockName !== undefined) {
          if (!d2[tQ][i2].tasks) d2[tQ][i2].tasks = [];
          d2[tQ][i2].tasks.push({ id: generateId(), text: fData.text, completed: false, timeSlot: getDefaultTimeSlot() });
          break;
        }
      }
      saveDateData(currentDate, d2);
      removeFutureDragSource(fData);
      window._dragFromFuture = null;
      renderAll(currentDate);
      return;
    }
    if (window._dragFromBigtask) {
      e.preventDefault(); e.stopPropagation();
      this.classList.remove('drag-over-block');
      var tQ2 = this.dataset.quadrant;
      var tBId2 = this.dataset.id;
      var bData = window._dragFromBigtask;
      var d3 = loadDateData(currentDate);
      for (var i3 = 0; i3 < d3[tQ2].length; i3++) {
        if (d3[tQ2][i3].id === tBId2 && d3[tQ2][i3].blockName !== undefined) {
          if (!d3[tQ2][i3].tasks) d3[tQ2][i3].tasks = [];
          var newBSubtask = {
            id: generateId(),
            text: bData.text,
            completed: false,
            timeSlot: getDefaultTimeSlot(),
            bigTaskRef: { bigTaskId: bData.btId, subtaskId: bData.stId }
          };
          var stData2 = getBigSubtaskData(bData.btId, bData.stId);
          if (stData2) {
            var copiedStages2 = copyBigSubtaskStages(stData2);
            if (copiedStages2) newBSubtask.stages = copiedStages2;
          }
          d3[tQ2][i3].tasks.push(newBSubtask);
          break;
        }
      }
      saveDateData(currentDate, d3);
      toggleBigSubtaskComplete(bData.btId, bData.stId, false);
      window._dragFromBigtask = null;
      renderAll(currentDate);
      return;
    }
    _origHandleBlockDrop.call(this, e);
  };
}

function addPoolTaskToQuadrant(quadrantKey, poolData) {
  var data = loadDateData(currentDate);
  // Check if a task with same bigTaskRef already exists (auto-migrated) — move it instead of duplicating
  var existingKey = null, existingIndex = -1, existingBlockIndex = -1, existingInBlock = false;
  QUADRANT_KEYS.forEach(function(key) {
    var items = data[key] || [];
    for (var i = 0; i < items.length; i++) {
      // Check top-level tasks
      if (items[i].bigTaskRef && items[i].bigTaskRef.bigTaskId === poolData.bigTaskId && items[i].bigTaskRef.subtaskId === poolData.subtaskId) {
        existingKey = key; existingIndex = i; return;
      }
      // Also check block subtasks
      if (items[i].blockName !== undefined && items[i].tasks) {
        for (var j = 0; j < items[i].tasks.length; j++) {
          if (items[i].tasks[j].bigTaskRef && items[i].tasks[j].bigTaskRef.bigTaskId === poolData.bigTaskId && items[i].tasks[j].bigTaskRef.subtaskId === poolData.subtaskId) {
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
      // Remove from block subtasks
      var blockItem = data[existingKey][existingIndex];
      var subtask = blockItem.tasks.splice(existingBlockIndex, 1)[0];
      data[quadrantKey].push({
        id: subtask.id || generateId(),
        text: subtask.text,
        completed: false,
        progress: '100%',
        timeSlot: subtask.timeSlot || getDefaultTimeSlot(),
        bigTaskRef: subtask.bigTaskRef
      });
    } else {
      // Move top-level task to target quadrant
      var existing = data[existingKey].splice(existingIndex, 1)[0];
      data[quadrantKey].push(existing);
    }
  } else {
    var newTask = {
      id: generateId(),
      text: poolData.text,
      completed: false,
      progress: '100%',
      bigTaskRef: { bigTaskId: poolData.bigTaskId, subtaskId: poolData.subtaskId },
      weight: poolData.weight,
      timeSlot: (poolData.timeSlot) || getDefaultTimeSlot()
    };
    var stData = getBigSubtaskData(poolData.bigTaskId, poolData.subtaskId);
    if (stData) {
      var copiedStages = copyBigSubtaskStages(stData);
      if (copiedStages) newTask.stages = copiedStages;
    }
    data[quadrantKey].push(newTask);
  }
  saveDateData(currentDate, data);
  toggleBigSubtaskComplete(poolData.bigTaskId, poolData.subtaskId, false);
  renderAll(currentDate);
}

function addFutureDragToQuadrant(quadrantKey, fData) {
  var data = loadDateData(currentDate);
  var task = {
    id: generateId(),
    text: fData.text,
    completed: false,
    progress: '100%',
    dueDate: '',
    timeSlot: getDefaultTimeSlot()
  };
  data[quadrantKey].push(task);
  saveDateData(currentDate, data);
  removeFutureDragSource(fData);
  renderAll(currentDate);
}

function removeFutureDragSource(fData) {
  var ftasks = loadFutureTasks();
  if (fData.stId) {
    for (var i = 0; i < ftasks.length; i++) {
      if (ftasks[i].id === fData.ftId && ftasks[i].tasks) {
        ftasks[i].tasks = ftasks[i].tasks.filter(function(st) { return st.id !== fData.stId; });
        if (ftasks[i].tasks.length === 0 && !ftasks[i].scheduledDate) {
          ftasks.splice(i, 1);
        }
        break;
      }
    }
  } else {
    ftasks = ftasks.filter(function(ft) { return ft.id !== fData.ftId; });
  }
  saveFutureTasks(ftasks);
}

// ============ Add Big Task Modal ============

function showAddBigTaskModal() {
  var existing = document.getElementById('bigTaskAddModal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = 'bigTaskAddModal';
  modal.className = 'modal-overlay';

  var content = document.createElement('div');
  content.className = 'modal-content';
  content.style.maxWidth = '520px';

  content.innerHTML = '<h2>🎯 新建大任务</h2>' +
    '<p style="font-size:12px;color:var(--text2);margin-bottom:12px;">创建一个长期目标，如考试备考、项目交付等。建议同时活跃的大任务 ≤3 个。</p>' +
    '<label style="font-size:13px;display:block;margin-bottom:4px;">任务名称</label>' +
    '<input type="text" id="btName" placeholder="例：日语N2考试" style="width:100%;padding:8px;border:1px solid var(--border2);border-radius:6px;font-size:13px;margin-bottom:10px;background:var(--surface);color:var(--text);">' +
    '<label style="font-size:13px;display:block;margin-bottom:4px;">目标截止日期</label>' +
    '<input type="date" id="btTargetDate" style="width:100%;padding:8px;border:1px solid var(--border2);border-radius:6px;font-size:13px;margin-bottom:10px;background:var(--surface);color:var(--text);">' +
    '<label style="font-size:13px;display:block;margin-bottom:4px;">描述（可选）</label>' +
    '<textarea id="btDesc" rows="3" placeholder="简要描述目标…" style="width:100%;padding:8px;border:1px solid var(--border2);border-radius:6px;font-size:13px;resize:vertical;background:var(--surface);color:var(--text);"></textarea>' +
    '<div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end;">' +
    '<button class="btn btn-sm btn-cancel" id="btCancel">取消</button>' +
    '<button class="btn btn-sm btn-primary" id="btCreate">创建大任务</button></div>';

  modal.appendChild(content);
  document.body.appendChild(modal);

  document.getElementById('btCancel').addEventListener('click', function() { modal.remove(); });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

  document.getElementById('btCreate').addEventListener('click', function() {
    var name = document.getElementById('btName').value.trim();
    var targetDate = document.getElementById('btTargetDate').value;
    var desc = document.getElementById('btDesc').value.trim();

    if (!name) { alert('请输入任务名称'); return; }
    if (!targetDate) { alert('请选择截止日期'); return; }

    var bt = {
      id: 'bt_' + generateId(),
      name: name,
      targetDate: targetDate,
      description: desc,
      createdAt: currentDate,
      progress: 0,
      milestones: []
    };

    if (!addBigTask(bt)) { return; }
    modal.remove();
    renderBigTaskPanel();
    alert('大任务已创建！点击展开后可添加里程碑和子任务。建议点击"AI 规划"自动拆解。');
  });
}

// ============ AI Plan Modal ============

function showAIPlanModal() {
  var bigTasks = loadBigTasks();
  if (bigTasks.length === 0) {
    alert('请先创建一个大任务');
    return;
  }

  var existing = document.getElementById('claudePlanModal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = 'claudePlanModal';
  modal.className = 'modal-overlay';

  var content = document.createElement('div');
  content.className = 'modal-content';
  content.style.maxWidth = '680px';
  content.style.maxHeight = '85vh';
  content.style.overflowY = 'auto';

  var btOptions = '';
  bigTasks.forEach(function(bt) {
    btOptions += '<option value="' + bt.id + '">' + Util.escHtml(bt.name) + ' (截止 ' + bt.targetDate + ')</option>';
  });

  var typeOptions = [
    { value: 'exam', label: '📝 考试备考', desc: '如语言考试、资格证、考研考公等' },
    { value: 'project', label: '🚀 项目交付', desc: '如产品上线、报告撰写、活动策划等' },
    { value: 'skill', label: '💡 技能学习', desc: '如编程语言、设计工具、乐器、运动等' }
  ];

  var typeRadios = '';
  typeOptions.forEach(function(t, i) {
    typeRadios += '<label style="display:flex;align-items:center;gap:6px;padding:6px 10px;margin:3px 0;border:1px solid var(--border);border-radius:6px;cursor:pointer;' + (i === 0 ? 'background:var(--accent-light);' : '') + '" id="cpTypeLabel' + i + '">' +
      '<input type="radio" name="cpTaskType" value="' + t.value + '" ' + (i === 0 ? 'checked' : '') + ' style="margin:0;">' +
      '<span><strong>' + t.label + '</strong><br><small style="color:var(--text2);">' + t.desc + '</small></span></label>';
  });

  content.innerHTML = '<h2>🤖 AI 规划大任务</h2>' +
    '<p style="font-size:12px;color:var(--text2);margin-bottom:8px;">选择任务类型和大任务，生成含调研维度的 prompt，发送给 AI 获取结构化规划。</p>' +
    '<label style="font-size:13px;display:block;margin-bottom:4px;">1. 任务类型</label>' +
    '<div style="margin-bottom:10px;">' + typeRadios + '</div>' +
    '<label style="font-size:13px;display:block;margin-bottom:4px;">2. 选择大任务</label>' +
    '<select id="cpBigTaskSelect" style="width:100%;padding:8px;border:1px solid var(--border2);border-radius:6px;font-size:13px;margin-bottom:10px;background:var(--surface);color:var(--text);">' + btOptions + '</select>' +
    '<label style="font-size:13px;display:block;margin-bottom:4px;">3. 复制 prompt 发送给 AI</label>' +
    '<textarea id="cpPrompt" rows="14" readonly style="width:100%;padding:8px;border:1px solid var(--border2);border-radius:6px;font-size:12px;font-family:monospace;margin-bottom:8px;background:var(--surface3);color:var(--text);"></textarea>' +
    '<button class="btn btn-sm btn-info" id="cpCopyPrompt" style="margin-bottom:12px;">📋 复制 Prompt</button>' +
    '<label style="font-size:13px;display:block;margin-bottom:4px;">4. 粘贴 AI 返回的 JSON 并导入</label>' +
    '<textarea id="cpJsonInput" rows="8" placeholder="粘贴 AI 生成的 JSON…" style="width:100%;padding:8px;border:1px solid var(--border2);border-radius:6px;font-size:12px;font-family:monospace;resize:vertical;background:var(--surface);color:var(--text);"></textarea>' +
    '<div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end;">' +
    '<button class="btn btn-sm btn-cancel" id="cpCancel">取消</button>' +
    '<button class="btn btn-sm btn-primary" id="cpImport">导入规划</button></div>';

  modal.appendChild(content);
  document.body.appendChild(modal);

  var radioLabels = modal.querySelectorAll('[id^="cpTypeLabel"]');
  radioLabels.forEach(function(label) {
    label.addEventListener('click', function() {
      radioLabels.forEach(function(l) { l.style.background = ''; });
      this.style.background = 'var(--accent-light)';
      updateAIPrompt();
    });
  });

  updateAIPrompt();

  document.getElementById('cpBigTaskSelect').addEventListener('change', updateAIPrompt);
  modal.querySelectorAll('input[name="cpTaskType"]').forEach(function(r) {
    r.addEventListener('change', updateAIPrompt);
  });

  function getSelectedType() {
    var checked = modal.querySelector('input[name="cpTaskType"]:checked');
    return checked ? checked.value : 'exam';
  }

  function updateAIPrompt() {
    var btId = document.getElementById('cpBigTaskSelect').value;
    var bt = bigTasks.find(function(t) { return t.id === btId; });
    if (!bt) return;
    var today = new Date().toISOString().split('T')[0];
    var daysLeft = Util.calcDaysLeft(bt.targetDate);
    var taskType = getSelectedType();
    var prompt = buildPromptByType(taskType, bt, today, daysLeft);
    document.getElementById('cpPrompt').value = prompt;
  }

  document.getElementById('cpCopyPrompt').addEventListener('click', function() {
    var promptEl = document.getElementById('cpPrompt');
    promptEl.select();
    document.execCommand('copy');
    alert('Prompt 已复制！请粘贴到 AI 对话中。');
  });

  document.getElementById('cpCancel').addEventListener('click', function() { modal.remove(); });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

  document.getElementById('cpImport').addEventListener('click', function() {
    var btId = document.getElementById('cpBigTaskSelect').value;
    var jsonStr = document.getElementById('cpJsonInput').value.trim();
    if (!jsonStr) { alert('请先粘贴 AI 生成的 JSON'); return; }

    var plan;
    try { plan = JSON.parse(jsonStr); } catch (e) {
      var codeMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (codeMatch) {
        try { plan = JSON.parse(codeMatch[0]); } catch (e2) { alert('JSON 解析失败，请检查格式'); return; }
      } else {
        alert('JSON 解析失败，请检查格式'); return;
      }
    }

    if (!plan.milestones || !Array.isArray(plan.milestones)) {
      alert('JSON 格式不正确，需要包含 "milestones" 数组'); return;
    }

    plan.milestones.forEach(function(ms) {
      ms.id = 'ms_' + generateId();
      if (ms.tasks) {
        ms.tasks.forEach(function(t) {
          t.id = 'st_' + generateId();
          t.completed = false;
          t.weight = t.weight || 5;
        });
      }
    });

    var updateFields = { milestones: plan.milestones };
    if (plan.analysis) updateFields.analysis = plan.analysis;
    if (plan.references) updateFields.references = plan.references;
    var bt = updateBigTask(btId, updateFields);
    if (bt) {
      recalcBigTaskProgress(bt);
      var tasks = loadBigTasks();
      for (var i = 0; i < tasks.length; i++) {
        if (tasks[i].id === btId) { tasks[i] = bt; break; }
      }
      saveBigTasks(tasks);
      modal.remove();
      renderBigTaskPanel();
      alert('规划已导入！共 ' + plan.milestones.length + ' 个里程碑。今日任务已出现在任务池中。');
    }
  });
}

// ---- Prompt Templates ----

function buildPromptByType(taskType, bt, today, daysLeft) {
  var header =
    '你是一个专业的任务规划助手。请调研并规划以下任务，输出严格 JSON 格式（不要包含其他文字）。\n\n' +
    '任务名称：' + bt.name + '\n' +
    '目标截止日期：' + bt.targetDate + '\n' +
    '当前日期：' + today + '\n' +
    '剩余天数：' + daysLeft + ' 天\n' +
    '补充描述：' + (bt.description || '无') + '\n\n';

  var dims, steps;

  if (taskType === 'exam') {
    dims = '## 调研维度（请在规划前简要分析）\n' +
      '1. **考试结构**：考试科目/题型/分值分布/通过标准\n' +
      '2. **参考资料**：推荐教材、真题集、网课、App（请给出具体书名/资源名）\n' +
      '3. **个人基础诊断**：基于描述分析优势科目和短板，分配不同权重\n' +
      '4. **时间预算**：每天可投入的小时数建议，各阶段时间分配比例\n' +
      '5. **模拟检测点**：在哪几个关键节点安排自测/模考来校准进度\n\n';
    steps = '## 规划步骤\n' +
      '1. 调研上述维度，在 JSON 前用注释风格写一段 100 字以内的分析\n' +
      '2. 将 ' + daysLeft + ' 天分为 3-4 个里程碑阶段，权重之和=100\n' +
      '   - 阶段结构参考：基础夯实→专项突破→真题冲刺→考前保温\n' +
      '3. 每个里程碑内拆解日任务，每任务 1-3 天完成，约等难度\n' +
      '4. 每个日任务分配权重（里程碑内占比）\n' +
      '5. 优先安排 II 象限（重要不紧急）的稳步推进任务\n\n';
  } else if (taskType === 'project') {
    dims = '## 调研维度（请在规划前简要分析）\n' +
      '1. **需求拆解**：核心交付物是什么？子任务/模块如何划分？\n' +
      '2. **依赖与风险**：哪些任务有前置依赖？主要风险点和应对方案\n' +
      '3. **资源与工具**：需要的软件/平台/资料/协作方（请给出具体名称）\n' +
      '4. **参考资料**：相关文档、教程、案例、模板链接或书名\n' +
      '5. **检查节点**：关键评审/测试/验收的时间点和通过标准\n\n';
    steps = '## 规划步骤\n' +
      '1. 调研上述维度，在 JSON 前用注释风格写一段 100 字以内的分析\n' +
      '2. 将 ' + daysLeft + ' 天分为 3-4 个里程碑阶段，权重之和=100\n' +
      '   - 阶段结构参考：需求设计→核心开发/执行→整合测试→交付完善\n' +
      '3. 每个里程碑内拆解日任务，每任务 1-3 天完成，约等难度\n' +
      '4. 区分"推进型"任务（II 象限）和"阻塞型"任务（I 象限）\n' +
      '5. 预留 10-15% 缓冲时间应对风险\n\n';
  } else { // skill
    dims = '## 调研维度（请在规划前简要分析）\n' +
      '1. **知识体系**：该技能的核心知识点/能力树结构（如基础→中级→高级）\n' +
      '2. **学习资源**：推荐教程、书籍、视频课程、练习平台（请给出具体名称）\n' +
      '3. **实践项目**：适合初学者/进阶级的练习项目或实战案例\n' +
      '4. **检验标准**：如何验证每个阶段的学习成果（如作品、测试、认证）\n' +
      '5. **社区与求助**：相关论坛、社群、 mentor 渠道\n\n';
    steps = '## 规划步骤\n' +
      '1. 调研上述维度，在 JSON 前用注释风格写一段 100 字以内的分析\n' +
      '2. 将 ' + daysLeft + ' 天分为 3-4 个里程碑阶段，权重之和=100\n' +
      '   - 阶段结构参考：入门理解→刻意练习→实战应用→作品输出\n' +
      '3. 每个里程碑内拆解日任务，每任务 1-3 天完成，约等难度\n' +
      '4. 采用"学 30% + 练 70%"的原则安排任务（重练习轻理论）\n' +
      '5. 每阶段末尾安排一个小型成果检验\n\n';
  }

  var jsonTemplate =
    '## 输出 JSON 格式\n' +
    '{\n' +
    '  "analysis": "简要的调研分析（100字内）",\n' +
    '  "references": ["参考资料1", "参考资料2", "参考资料3"],\n' +
    '  "milestones": [\n' +
    '    {\n' +
    '      "name": "阶段1：名称",\n' +
    '      "dateRange": ["YYYY-MM-DD", "YYYY-MM-DD"],\n' +
    '      "weight": 30,\n' +
    '      "tasks": [\n' +
    '        {"text": "具体任务描述", "plannedDate": "YYYY-MM-DD", "weight": 5},\n' +
    '        {"text": "具体任务描述", "plannedDate": "YYYY-MM-DD", "weight": 5}\n' +
    '      ]\n' +
    '    },\n' +
    '    {\n' +
    '      "name": "阶段2：名称",\n' +
    '      "dateRange": ["YYYY-MM-DD", "YYYY-MM-DD"],\n' +
    '      "weight": 40,\n' +
    '      "tasks": [...]\n' +
    '    }\n' +
    '  ]\n' +
    '}';

  return header + dims + steps + jsonTemplate;
}

// ============ Big Task Edit Helpers ============

function editMilestoneField(btId, msId, field, value) {
  var tasks = loadBigTasks();
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === btId && tasks[i].milestones) {
      for (var j = 0; j < tasks[i].milestones.length; j++) {
        if (tasks[i].milestones[j].id === msId) {
          tasks[i].milestones[j][field] = value;
          recalcBigTaskProgress(tasks[i]);
          saveBigTasks(tasks);
          return;
        }
      }
    }
  }
}

function editSubtaskField(btId, msId, stId, field, value) {
  var tasks = loadBigTasks();
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === btId && tasks[i].milestones) {
      for (var j = 0; j < tasks[i].milestones.length; j++) {
        if (tasks[i].milestones[j].id === msId && tasks[i].milestones[j].tasks) {
          for (var k = 0; k < tasks[i].milestones[j].tasks.length; k++) {
            if (tasks[i].milestones[j].tasks[k].id === stId) {
              tasks[i].milestones[j].tasks[k][field] = value;
              recalcBigTaskProgress(tasks[i]);
              saveBigTasks(tasks);
              return;
            }
          }
        }
      }
    }
  }
}

function deleteMilestone(btId, msId) {
  var tasks = loadBigTasks();
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === btId && tasks[i].milestones) {
      tasks[i].milestones = tasks[i].milestones.filter(function(ms) { return ms.id !== msId; });
      recalcBigTaskProgress(tasks[i]);
      saveBigTasks(tasks);
      return;
    }
  }
}

function deleteSubtaskFromBigTask(btId, msId, stId) {
  var tasks = loadBigTasks();
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === btId && tasks[i].milestones) {
      for (var j = 0; j < tasks[i].milestones.length; j++) {
        if (tasks[i].milestones[j].id === msId && tasks[i].milestones[j].tasks) {
          tasks[i].milestones[j].tasks = tasks[i].milestones[j].tasks.filter(function(t) { return t.id !== stId; });
          recalcBigTaskProgress(tasks[i]);
          saveBigTasks(tasks);
          return;
        }
      }
    }
  }
}

function addMilestoneToBigTask(btId, name) {
  var tasks = loadBigTasks();
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === btId) {
      if (!tasks[i].milestones) tasks[i].milestones = [];
      tasks[i].milestones.push({
        id: 'ms_' + generateId(),
        name: name,
        dateRange: ['', ''],
        weight: 0,
        tasks: []
      });
      saveBigTasks(tasks);
      return;
    }
  }
}

function addSubtaskToMilestone(btId, msId, text) {
  var tasks = loadBigTasks();
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === btId && tasks[i].milestones) {
      for (var j = 0; j < tasks[i].milestones.length; j++) {
        if (tasks[i].milestones[j].id === msId) {
          if (!tasks[i].milestones[j].tasks) tasks[i].milestones[j].tasks = [];
          tasks[i].milestones[j].tasks.push({
            id: 'st_' + generateId(),
            text: text,
            plannedDate: '',
            completed: false,
            weight: 5
          });
          recalcBigTaskProgress(tasks[i]);
          saveBigTasks(tasks);
          return;
        }
      }
    }
  }
}

function showDateRangeEditor(el, start, end, callback) {
  if (currentEditEl) finishEdit(true);
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '2000';
  var box = document.createElement('div');
  box.className = 'modal-content';
  box.style.cssText = 'padding:20px;min-width:300px;text-align:center;';
  box.innerHTML = '<h3 style="margin-top:0;">编辑日期范围</h3>' +
    '<label>开始：</label><input type="date" id="drStart" value="' + start + '" style="margin-bottom:8px;width:100%;"><br>' +
    '<label>结束：</label><input type="date" id="drEnd" value="' + end + '" style="margin-bottom:12px;width:100%;"><br>' +
    '<button class="btn btn-sm btn-primary" id="drOk">确定</button> ';
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  document.getElementById('drOk').addEventListener('click', function() {
    callback(document.getElementById('drStart').value, document.getElementById('drEnd').value);
    overlay.remove();
  });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
}

function showWeightEditor(el, current, callback) {
  if (currentEditEl) finishEdit(true);
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '2000';
  var box = document.createElement('div');
  box.className = 'modal-content';
  box.style.cssText = 'padding:20px;min-width:200px;text-align:center;';
  var opts = '';
  [1,2,3,4,5,6,7,8,9,10,12,15,20,25,30,35,40,45,50].forEach(function(w) {
    opts += '<option value="' + w + '"' + (w === current ? ' selected' : '') + '>' + w + '%</option>';
  });
  box.innerHTML = '<h3 style="margin-top:0;">选择参考权重</h3><select id="wSelect" style="width:100%;padding:8px;font-size:14px;">' + opts + '</select><br><br>' +
    '<button class="btn btn-sm btn-primary" id="wOk">确定</button> ';
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  document.getElementById('wOk').addEventListener('click', function() {
    callback(parseInt(document.getElementById('wSelect').value));
    overlay.remove();
  });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
}
