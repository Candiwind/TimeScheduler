// app.js - Application initialization, theme, core setup
function initApp() {
  var today = new Date().toISOString().split('T')[0];
  currentDate = today;

  // Restore saved view mode
  var savedViewMode = localStorage.getItem('quadrant_view_mode');
  if (savedViewMode === 'time' || savedViewMode === 'quadrant') {
    viewMode = savedViewMode;
  }

  loadTheme();
  applyBigTaskDropOverrides();
  setupQuadrantContainers();
  setupDatePicker();
  setupButtons();
  setupDropZone();
  setupCacheButtons();
  setupKeyboardShortcuts();
  setupSearchInput();
  setupJsonButtons();
  setupStatsButton();
  setupDailyReport();
  setupBigTaskPanel();
  setupPlanPoolPanel();
  setupPrinciplesPanel();
  setupHintBar();
  migrateFutureTasks(today);
  migrateWeekTasks(today);
  migrateMonthTasks(today);
  seedCacheIndexIfEmpty(); // Backward compat: seed cache index with existing dates (one-time)
  renderAll(today);
  renderBigTaskPanel();
  renderPlanPoolPanel();
  renderPrinciplesPanel();

  // View mode toggle button
  var btnViewMode = document.getElementById('btnViewMode');
  if (btnViewMode) {
    // Update button label to match current mode
    if (viewMode === 'time') {
      btnViewMode.innerHTML = '🔲 象限视图';
      btnViewMode.title = '切换到象限视图';
    }
    btnViewMode.addEventListener('click', function() {
      if (viewMode === 'quadrant') {
        viewMode = 'time';
        localStorage.setItem('quadrant_view_mode', 'time');
        btnViewMode.innerHTML = '🔲 象限视图';
        btnViewMode.title = '切换到象限视图';
      } else {
        viewMode = 'quadrant';
        localStorage.setItem('quadrant_view_mode', 'quadrant');
        btnViewMode.innerHTML = '📋 时间视图';
        btnViewMode.title = '切换到时间视图';
      }
      renderAll(currentDate);
    });
  }

  setTimeout(function() {
    autoSyncFromDevice();
  }, 800);

  // Re-sync quadrant row heights on window resize
  window.addEventListener('resize', function() {
    if (typeof syncQuadrantRowHeights === 'function') syncQuadrantRowHeights();
  });
}

// ============ Theme ============
// Hint bar dismiss (point 2)
function setupHintBar() {
  var hintBar = document.getElementById('hintBar');
  if (!hintBar) return;
  if (localStorage.getItem('hint_bar_dismissed') === '1') {
    hintBar.style.display = 'none';
    return;
  }
  var closeBtn = hintBar.querySelector('.hint-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      hintBar.style.display = 'none';
      localStorage.setItem('hint_bar_dismissed', '1');
    });
  }
}

function loadTheme() {
  var theme = localStorage.getItem('quadrant_theme') || 'light';
  document.documentElement.setAttribute('data-theme', theme);
  updateDarkModeIcon(theme);
}

function toggleTheme() {
  var current = document.documentElement.getAttribute('data-theme');
  var next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('quadrant_theme', next);
  updateDarkModeIcon(next);
}

function updateDarkModeIcon(theme) {
  var btn = document.getElementById('btnDarkMode');
  if (btn) btn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
}

// ============ Quadrant Containers ============
var _quadrantContainersSetup = false;
function setupQuadrantContainers() {
  if (_quadrantContainersSetup) return;
  _quadrantContainersSetup = true;
  QUADRANT_KEYS.forEach(function(key) {
    var quadrant = document.getElementById('quadrant-' + key);
    if (!quadrant) return;
    quadrant.addEventListener('dragover', handleQuadrantDragOver);
    quadrant.addEventListener('dragleave', handleQuadrantDragLeave);
    quadrant.addEventListener('drop', handleQuadrantDrop);
  });
}

// ============ Date Picker ============
function setupDatePicker() {
  var picker = document.getElementById('datePicker');
  if (!picker) return;
  picker.addEventListener('change', function() {
    var newDate = picker.value;
    if (newDate && /^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      setSearchTerm('');
      document.getElementById('searchInput').value = '';
      renderAll(newDate);
    }
  });
}

// ============ Buttons ============
function setupButtons() {
  var today = new Date().toISOString().split('T')[0];

  document.getElementById('btnToday').addEventListener('click', function() {
    var picker = document.getElementById('datePicker');
    picker.value = today;
    setSearchTerm('');
    document.getElementById('searchInput').value = '';
    renderAll(today);
  });

  document.getElementById('btnDarkMode').addEventListener('click', toggleTheme);

  // Secondary toolbar toggle
  document.getElementById('btnToggleMore').addEventListener('click', function() {
    var toolbar = document.getElementById('secondaryToolbar');
    if (toolbar.style.display === 'none') {
      toolbar.style.display = '';
      this.textContent = '✕';
    } else {
      toolbar.style.display = 'none';
      this.textContent = '⚙️';
    }
  });

  document.getElementById('btnExportMd').addEventListener('click', exportToMarkdown);

  document.getElementById('btnImportMd').addEventListener('click', function() {
    document.getElementById('importFileInput').click();
  });

  document.getElementById('importFileInput').addEventListener('change', function(e) {
    if (e.target.files[0]) {
      handleFileImport(e.target.files[0]);
      e.target.value = '';
    }
  });

  QUADRANT_KEYS.forEach(function(key) {
    document.getElementById('btnAddTask-' + key).addEventListener('click', function() {
      addTask(key);
    });
    document.getElementById('btnAddBlock-' + key).addEventListener('click', function() {
      addTaskBlock(key);
    });
  });
}

// ============ File Drop Zone ============
function setupDropZone() {
  var dropZone = document.getElementById('app');
  var dragCounter = 0;

  dropZone.addEventListener('dragenter', function(e) {
    e.preventDefault();
    dragCounter++;
    var types = e.dataTransfer.types;
    if (types && types.indexOf && types.indexOf('Files') !== -1) {
      dropZone.classList.add('file-drag-over');
    }
  });

  dropZone.addEventListener('dragleave', function(e) {
    dragCounter--;
    if (dragCounter === 0) {
      dropZone.classList.remove('file-drag-over');
    }
  });

  dropZone.addEventListener('dragover', function(e) {
    e.preventDefault();
  });

  dropZone.addEventListener('drop', function(e) {
    e.preventDefault();
    dragCounter = 0;
    dropZone.classList.remove('file-drag-over');
    var files = e.dataTransfer.files;
    if (files && files.length > 0) {
      var file = files[0];
      if (file.name.endsWith('.json')) {
        importJsonFile(file);
      } else {
        handleFileImport(file);
      }
    }
  });
}

// ============ Search ============
function setupSearchInput() {
  var input = document.getElementById('searchInput');
  if (!input) return;
  var debounceTimer;
  input.addEventListener('input', function() {
    clearTimeout(debounceTimer);
    var term = input.value.trim();
    debounceTimer = setTimeout(function() {
      setSearchTerm(term);
      updateSearchResult();
    }, 150);
  });
}

function updateSearchResult() {
  var el = document.getElementById('searchResult');
  if (!el) return;
  if (searchTerm) {
    var data = loadDateData(currentDate);
    var count = 0;
    QUADRANT_KEYS.forEach(function(key) {
      var items = data[key] || [];
      items.forEach(function(item) {
        if (item.blockName !== undefined) {
          if (item.blockName.toLowerCase().indexOf(searchTerm.toLowerCase()) !== -1) count++;
          if (item.tasks) {
            item.tasks.forEach(function(t) {
              if (t.text && t.text.toLowerCase().indexOf(searchTerm.toLowerCase()) !== -1) count++;
            });
          }
        } else {
          if (item.text && item.text.toLowerCase().indexOf(searchTerm.toLowerCase()) !== -1) count++;
        }
      });
    });
    el.textContent = '找到 ' + count + ' 个匹配';
  } else {
    el.textContent = '';
  }
}

// ============ Drag Binding ============
function setupDragDrop() {
  // Handled via rebindDragEvents after each render
}

function rebindDragEvents() {
  document.querySelectorAll('.task-item').forEach(function(el) {
    el.addEventListener('dragstart', handleDragStart);
    el.addEventListener('dragend', handleDragEnd);
    el.addEventListener('dragover', handleTaskDragOver);
    el.addEventListener('dragleave', handleTaskDragLeave);
    el.addEventListener('drop', handleTaskDrop);
  });
  document.querySelectorAll('.task-block').forEach(function(el) {
    el.addEventListener('dragstart', handleDragStart);
    el.addEventListener('dragend', handleDragEnd);
    el.addEventListener('dragover', handleBlockDragOver);
    el.addEventListener('dragleave', handleBlockDragLeave);
    el.addEventListener('drop', handleBlockDrop);
  });
  document.querySelectorAll('.subtask-item').forEach(function(el) {
    el.addEventListener('dragstart', handleDragStart);
    el.addEventListener('dragend', handleDragEnd);
    el.addEventListener('dragover', handleSubtaskDragOver);
    el.addEventListener('dragleave', handleSubtaskDragLeave);
    el.addEventListener('drop', handleSubtaskDrop);
  });
}

// Override renderAll (drag handlers are bound in create*Element functions)
var _originalRenderAll = renderAll;
renderAll = function(date) {
  migrateFutureTasks(date);
  migrateWeekTasks(date);
  migrateMonthTasks(date);
  migrateBigTaskSubtasks(date);
  _originalRenderAll(date);
  renderBigTaskPanel();
  renderPlanPoolPanel();
  renderPrinciplesPanel();
};

// ============ Principles Panel ============
function setupPrinciplesPanel() {
  document.getElementById('principlesPanelToggle').addEventListener('click', function() {
    document.getElementById('principlesPanel').classList.toggle('collapsed');
  });

  document.getElementById('btnSetPrinciplesDate').addEventListener('click', function() {
    var data = loadPrinciples();
    showDateRangeEditor(this, data.startDate, data.endDate, function(start, end) {
      updatePrinciplesDateRange(start, end);
      renderPrinciplesPanel();
    });
  });

  document.getElementById('btnAddPrinciple').addEventListener('click', function() {
    var data = loadPrinciples();
    if (data.principles.length >= 5) { alert('原则最多5条，建议不超过3条'); return; }
    if (!data.startDate || !data.endDate) { alert('请先设置起止日期'); return; }
    var text = prompt('请输入依循（如"每天早上6点起床"）：');
    if (!text) return;
    addPrinciple(text);
    renderPrinciplesPanel();
  });
}

// ============ Start ============
document.addEventListener('DOMContentLoaded', function() {
  try {
    initApp();
  } catch (e) {
    alert('页面初始化失败：' + e.message + '\n\n请按 F12 打开控制台查看详细错误');
    console.error('Init error:', e);
  }
});
