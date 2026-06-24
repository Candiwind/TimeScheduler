// store.js - localStorage 数据存储操作

var STORAGE_KEY = 'quadrant_task_data';
var SYNC_FILENAME = 'quadrant_tasks_backup.json';

// Check if running in Capacitor native app
function isCapacitorNative() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}
var STORAGE_BACKUP_KEY = 'quadrant_task_data_backup';

function loadAllData() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* fall through to backup */ }
  // Try backup recovery
  try {
    var backup = localStorage.getItem(STORAGE_BACKUP_KEY);
    if (backup) {
      console.warn('Primary data corrupted, recovering from backup');
      var recovered = JSON.parse(backup);
      localStorage.setItem(STORAGE_KEY, backup);
      return recovered;
    }
  } catch (e2) { /* unrecoverable */ }
  return {};
}

function saveAllData(data) {
  try {
    var json = JSON.stringify(data);
    localStorage.setItem(STORAGE_KEY, json);
    // Keep a backup
    localStorage.setItem(STORAGE_BACKUP_KEY, json);
  } catch (e) {
    alert('存储空间不足，请清理部分数据后重试');
  }
}

function loadDateData(date) {
  var all = loadAllData();
  return all[date] || { I: [], II: [], III: [], IV: [] };
}

function saveDateData(date, quadrantData) {
  var all = loadAllData();
  all[date] = quadrantData;
  saveAllData(all);
}

// Deferred save: batches writes within the same event loop tick
var _deferredDateData = null;
var _deferredTimer = null;
function saveDateDataDeferred(date, quadrantData) {
  _deferredDateData = { date: date, data: quadrantData };
  if (_deferredTimer) return;
  _deferredTimer = setTimeout(function() {
    if (_deferredDateData) {
      var all = loadAllData();
      all[_deferredDateData.date] = _deferredDateData.data;
      saveAllData(all);
      _deferredDateData = null;
    }
    _deferredTimer = null;
  }, 0);
}

function getAllCachedDates() {
  var all = loadAllData();
  return Object.keys(all).sort();
}

function getCachedDateData(date) {
  return loadDateData(date);
}

function importCachedData(sourceDate, targetDate) {
  var all = loadAllData();
  if (!all[sourceDate]) {
    alert('源日期没有缓存数据');
    return false;
  }
  var sourceData = JSON.parse(JSON.stringify(all[sourceDate]));
  if (sourceDate === targetDate) {
    // Same date: just reload
    all[targetDate] = sourceData;
  } else {
    // Merge: keep existing target tasks, append source tasks that are not duplicates
    var targetData = all[targetDate] || { I: [], II: [], III: [], IV: [] };
    QUADRANT_KEYS.forEach(function(key) {
      var existingIds = {};
      // Collect IDs of tasks already in target (including subtask IDs inside blocks)
      (targetData[key] || []).forEach(function(item) {
        existingIds[item.id] = true;
        if (item.tasks) {
          item.tasks.forEach(function(st) { existingIds[st.id] = true; });
        }
      });
      // Append source items whose top-level ID is not already in target
      (sourceData[key] || []).forEach(function(item) {
        if (!existingIds[item.id]) {
          if (!targetData[key]) targetData[key] = [];
          targetData[key].push(item);
        }
      });
    });
    all[targetDate] = targetData;
  }
  saveAllData(all);
  return true;
}

function generateId() {
  return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// JSON export - downloads entire localStorage as JSON file
// In Capacitor native app: saves to device Documents folder for sharing
// In browser: triggers a file download
function exportAllDataAsJSON() {
  var all = loadAllData();
  var json = JSON.stringify(all, null, 2);
  var fileName = 'quadrant_tasks_backup_' + new Date().toISOString().split('T')[0] + '.json';

  if (isCapacitorNative()) {
    // Use Capacitor Filesystem API to save to device storage
    try {
      var CapacitorFilesystem = Capacitor.Plugins.Filesystem;
      CapacitorFilesystem.writeFile({
        path: 'Documents/' + fileName,
        data: json,
        directory: 'DOCUMENTS'
      }).then(function() {
        alert('数据已导出到设备文档文件夹：' + fileName + '\n\n可通过文件管理器找到此文件，在浏览器版中使用"导入JSON"即可同步数据。');
      }).catch(function(e) {
        // Fallback: try Downloads folder
        CapacitorFilesystem.writeFile({
          path: fileName,
          data: json,
          directory: 'DOWNLOADS'
        }).then(function() {
          alert('数据已导出到下载文件夹：' + fileName);
        }).catch(function(e2) {
          alert('导出失败，尝试浏览器下载模式...');
          fallbackBlobDownload(json, fileName);
        });
      });
    } catch (e) {
      fallbackBlobDownload(json, fileName);
    }
  } else {
    fallbackBlobDownload(json, fileName);
  }
}

function fallbackBlobDownload(json, fileName) {
  var blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

// JSON import - merge or replace data from JSON file
function importAllDataFromJSON(jsonText, merge) {
  var imported;
  try {
    imported = JSON.parse(jsonText);
  } catch (e) {
    alert('JSON 格式无效，无法导入');
    return false;
  }
  if (typeof imported !== 'object' || imported === null) {
    alert('JSON 数据格式不正确');
    return false;
  }
  if (merge) {
    var current = loadAllData();
    Object.keys(imported).forEach(function(date) {
      current[date] = imported[date];
    });
    saveAllData(current);
  } else {
    saveAllData(imported);
  }
  return true;
}

// Auto-sync: on Capacitor app startup, check for previously exported data
function autoSyncFromDevice() {
  if (!isCapacitorNative()) return;
  try {
    var CapacitorFilesystem = Capacitor.Plugins.Filesystem;
    // Try to read the backup file from Documents
    CapacitorFilesystem.readFile({
      path: 'Documents/' + SYNC_FILENAME,
      directory: 'DOCUMENTS'
    }).then(function(result) {
      if (result.data) {
        var imported = JSON.parse(result.data);
        if (typeof imported === 'object' && imported !== null) {
          var current = loadAllData();
          // Only sync if the backup has more dates than current
          if (Object.keys(imported).length > Object.keys(current).length) {
            if (confirm('检测到设备上有备份数据（' + Object.keys(imported).length + ' 天记录）。\n当前数据有 ' + Object.keys(current).length + ' 天记录。\n\n是否导入备份数据？（点击取消保留当前数据）')) {
              importAllDataFromJSON(result.data, true);
              if (typeof renderAll === 'function') renderAll(currentDate || new Date().toISOString().split('T')[0]);
              if (typeof renderBigTaskPanel === 'function') renderBigTaskPanel();
              alert('数据同步成功！');
            }
          }
        }
      }
    }).catch(function() {
      // No backup file exists yet, that's fine
    });
  } catch (e) { /* Capacitor plugin not available */ }
}

// Import JSON from device file (called from native file picker)
function importJsonFromDeviceFile(filePath) {
  if (!isCapacitorNative()) return;
  try {
    var CapacitorFilesystem = Capacitor.Plugins.Filesystem;
    CapacitorFilesystem.readFile({
      path: filePath,
      directory: 'DOCUMENTS'
    }).then(function(result) {
      if (result.data) {
        var action = confirm('点击"确定"将合并导入（保留现有数据），点击"取消"将覆盖所有数据。');
        if (importAllDataFromJSON(result.data, action)) {
          if (typeof renderAll === 'function') renderAll(currentDate || new Date().toISOString().split('T')[0]);
          if (typeof renderBigTaskPanel === 'function') renderBigTaskPanel();
          alert('导入成功！');
        }
      }
    }).catch(function(e) {
      alert('读取文件失败：' + e.message);
    });
  } catch (e) { /* not available */ }
}

// Ensure current date data exists
function ensureDateData(date) {
  var all = loadAllData();
  if (!all[date]) {
    all[date] = { I: [], II: [], III: [], IV: [] };
    saveAllData(all);
  }
  return all[date];
}

// ============ Big Tasks ============
var BIG_TASK_KEY = 'quadrant_big_tasks';
var MAX_BIG_TASKS = 5;

function loadBigTasks() {
  try {
    var raw = localStorage.getItem(BIG_TASK_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveBigTasks(tasks) {
  try {
    localStorage.setItem(BIG_TASK_KEY, JSON.stringify(tasks));
  } catch (e) {
    alert('存储空间不足');
  }
}

function addBigTask(task) {
  var tasks = loadBigTasks();
  if (tasks.length >= MAX_BIG_TASKS) {
    alert('大任务最多 ' + MAX_BIG_TASKS + ' 个，建议不超过 3 个。请先完成或删除现有大任务。');
    return null;
  }
  tasks.push(task);
  saveBigTasks(tasks);
  return task;
}

function updateBigTask(id, updates) {
  var tasks = loadBigTasks();
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === id) {
      Object.keys(updates).forEach(function(k) { tasks[i][k] = updates[k]; });
      saveBigTasks(tasks);
      return tasks[i];
    }
  }
  return null;
}

function deleteBigTask(id) {
  var tasks = loadBigTasks();
  var filtered = tasks.filter(function(t) { return t.id !== id; });
  if (filtered.length < tasks.length) {
    saveBigTasks(filtered);
    return true;
  }
  return false;
}

// Recalculate overall progress of a big task from completed subtask weights
function recalcBigTaskProgress(bigTask) {
  var totalWeight = 0, completedWeight = 0;
  if (bigTask.milestones) {
    bigTask.milestones.forEach(function(ms) {
      if (ms.tasks) {
        ms.tasks.forEach(function(t) {
          totalWeight += t.weight || 0;
          if (t.completed) completedWeight += t.weight || 0;
        });
      }
    });
  }
  bigTask.progress = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
  return bigTask;
}

// Get tasks from all big tasks scheduled for a specific date
function getBigTasksForDate(date) {
  var bigTasks = loadBigTasks();
  var result = [];
  bigTasks.forEach(function(bt) {
    if (bt.milestones) {
      bt.milestones.forEach(function(ms) {
        if (ms.tasks) {
          ms.tasks.forEach(function(t) {
            if (t.plannedDate === date && !t.completed) {
              result.push({
                bigTaskId: bt.id,
                bigTaskName: bt.name,
                milestoneName: ms.name,
                task: t
              });
            }
          });
        }
      });
    }
  });
  return result;
}

// Toggle a big task subtask completion
function toggleBigSubtaskComplete(bigTaskId, subtaskId, completed) {
  var tasks = loadBigTasks();
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === bigTaskId) {
      var bt = tasks[i];
      if (bt.milestones) {
        bt.milestones.forEach(function(ms) {
          if (ms.tasks) {
            ms.tasks.forEach(function(t) {
              if (t.id === subtaskId) { t.completed = completed; }
            });
          }
        });
      }
      recalcBigTaskProgress(bt);
      saveBigTasks(tasks);
      return bt;
    }
  }
  return null;
}

// ============ Big Task Subtask Stage Operations ============

function toggleBigSubtaskStage(bigTaskId, subtaskId, stageId, completed) {
  var tasks = loadBigTasks();
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === bigTaskId && tasks[i].milestones) {
      tasks[i].milestones.forEach(function(ms) {
        if (ms.tasks) {
          ms.tasks.forEach(function(t) {
            if (t.id === subtaskId && t.stages) {
              t.stages.forEach(function(s) {
                if (s.id === stageId) { s.completed = completed; }
              });
              t.completed = t.stages.every(function(s) { return s.completed; });
            }
          });
        }
      });
      recalcBigTaskProgress(tasks[i]);
      saveBigTasks(tasks);
      return;
    }
  }
}

function splitBigSubtaskIntoStages(bigTaskId, subtaskId) {
  var tasks = loadBigTasks();
  var subtask = null;
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === bigTaskId && tasks[i].milestones) {
      tasks[i].milestones.forEach(function(ms) {
        if (ms.tasks) {
          ms.tasks.forEach(function(t) {
            if (t.id === subtaskId) { subtask = t; }
          });
        }
      });
    }
  }
  if (!subtask) return;
  if (subtask.stages && subtask.stages.length > 0) { alert('该子任务已拆分为阶段'); return; }
  var input = prompt('请输入阶段名称（用逗号分隔，如"设计,编码,测试"）：\n原任务名：' + (subtask.text || ''));
  if (!input) return;
  var stageNames = input.split(/[,，]/).map(function(s) { return s.trim(); }).filter(Boolean);
  if (stageNames.length < 2) { alert('请至少输入2个阶段名称'); return; }
  subtask.stages = stageNames.map(function(name) {
    return { id: generateId(), text: name, completed: false };
  });
  subtask.completed = false;
  saveBigTasks(tasks);
  renderBigTaskPanel();
}

function addBigSubtaskStage(bigTaskId, subtaskId) {
  var text = prompt('请输入新阶段名称：');
  if (!text) return;
  var tasks = loadBigTasks();
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === bigTaskId && tasks[i].milestones) {
      tasks[i].milestones.forEach(function(ms) {
        if (ms.tasks) {
          ms.tasks.forEach(function(t) {
            if (t.id === subtaskId) {
              if (!t.stages) t.stages = [];
              t.stages.push({ id: generateId(), text: text, completed: false });
              t.completed = false;
            }
          });
        }
      });
    }
  }
  saveBigTasks(tasks);
  renderBigTaskPanel();
}

function updateBigSubtaskStageText(bigTaskId, subtaskId, stageId, newText) {
  var tasks = loadBigTasks();
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === bigTaskId && tasks[i].milestones) {
      tasks[i].milestones.forEach(function(ms) {
        if (ms.tasks) {
          ms.tasks.forEach(function(t) {
            if (t.id === subtaskId && t.stages) {
              t.stages.forEach(function(s) {
                if (s.id === stageId) { s.text = newText; }
              });
            }
          });
        }
      });
    }
  }
  saveBigTasks(tasks);
  renderBigTaskPanel();
}

function deleteBigSubtaskStage(bigTaskId, subtaskId, stageId) {
  if (!confirm('确定删除该阶段？')) return;
  var tasks = loadBigTasks();
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === bigTaskId && tasks[i].milestones) {
      tasks[i].milestones.forEach(function(ms) {
        if (ms.tasks) {
          ms.tasks.forEach(function(t) {
            if (t.id === subtaskId && t.stages) {
              t.stages = t.stages.filter(function(s) { return s.id !== stageId; });
              if (t.stages.length === 0) { delete t.stages; t.completed = false; }
              else { t.completed = t.stages.every(function(s) { return s.completed; }); }
            }
          });
        }
      });
    }
  }
  saveBigTasks(tasks);
  renderBigTaskPanel();
}

// ============ Plan Task Pools (待办/周计划/月计划) ============
var FUTURE_TASK_KEY = 'quadrant_future_tasks';
var WEEK_TASK_KEY = 'quadrant_week_tasks';
var MONTH_TASK_KEY = 'quadrant_month_tasks';

// Generic load/save for plan pools
function loadPlanTasks(poolKey) {
  try {
    var raw = localStorage.getItem(poolKey);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function savePlanTasks(poolKey, tasks) {
  try {
    localStorage.setItem(poolKey, JSON.stringify(tasks));
  } catch (e) {
    alert('存储空间不足');
  }
}

function addPlanTask(poolKey, task) {
  var tasks = loadPlanTasks(poolKey);
  tasks.push(task);
  savePlanTasks(poolKey, tasks);
  return task;
}

function updatePlanTask(poolKey, id, updates) {
  var tasks = loadPlanTasks(poolKey);
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === id) {
      Object.keys(updates).forEach(function(k) { tasks[i][k] = updates[k]; });
      savePlanTasks(poolKey, tasks);
      return tasks[i];
    }
  }
  return null;
}

function deletePlanTask(poolKey, id) {
  var tasks = loadPlanTasks(poolKey);
  var filtered = tasks.filter(function(t) { return t.id !== id; });
  if (filtered.length < tasks.length) {
    savePlanTasks(poolKey, filtered);
    return true;
  }
  return false;
}

// Convenience aliases for future tasks (backward compat)
function loadFutureTasks() { return loadPlanTasks(FUTURE_TASK_KEY); }
function saveFutureTasks(tasks) { savePlanTasks(FUTURE_TASK_KEY, tasks); }
function addFutureTask(task) { return addPlanTask(FUTURE_TASK_KEY, task); }
function updateFutureTask(id, updates) { return updatePlanTask(FUTURE_TASK_KEY, id, updates); }
function deleteFutureTask(id) { return deletePlanTask(FUTURE_TASK_KEY, id); }

// Convenience aliases for week tasks
function loadWeekTasks() { return loadPlanTasks(WEEK_TASK_KEY); }
function saveWeekTasks(tasks) { savePlanTasks(WEEK_TASK_KEY, tasks); }
function addWeekTask(task) { return addPlanTask(WEEK_TASK_KEY, task); }
function updateWeekTask(id, updates) { return updatePlanTask(WEEK_TASK_KEY, id, updates); }
function deleteWeekTask(id) { return deletePlanTask(WEEK_TASK_KEY, id); }

// Convenience aliases for month tasks
function loadMonthTasks() { return loadPlanTasks(MONTH_TASK_KEY); }
function saveMonthTasks(tasks) { savePlanTasks(MONTH_TASK_KEY, tasks); }
function addMonthTask(task) { return addPlanTask(MONTH_TASK_KEY, task); }
function updateMonthTask(id, updates) { return updatePlanTask(MONTH_TASK_KEY, id, updates); }
function deleteMonthTask(id) { return deletePlanTask(MONTH_TASK_KEY, id); }

// Auto-migrate big task subtasks whose plannedDate matches the given date
// Adds them to quadrant II if not already imported
function migrateBigTaskSubtasks(date) {
  var bigTasks = loadBigTasks();
  var data = loadDateData(date);
  var migrated = 0;

  bigTasks.forEach(function(bt) {
    if (bt.milestones) {
      bt.milestones.forEach(function(ms) {
        if (ms.tasks) {
          ms.tasks.forEach(function(t) {
            if (t.plannedDate === date && !t.completed) {
              var alreadyImported = false;
              QUADRANT_KEYS.forEach(function(key) {
                (data[key] || []).forEach(function(task) {
                  if (task.bigTaskRef && task.bigTaskRef.bigTaskId === bt.id && task.bigTaskRef.subtaskId === t.id) {
                    alreadyImported = true;
                  }
                  if (task.blockName !== undefined && task.tasks) {
                    task.tasks.forEach(function(st) {
                      if (st.bigTaskRef && st.bigTaskRef.bigTaskId === bt.id && st.bigTaskRef.subtaskId === t.id) {
                        alreadyImported = true;
                      }
                    });
                  }
                });
              });
              if (!alreadyImported) {
                if (!data['II']) data['II'] = [];
                data['II'].push({
                  id: generateId(),
                  text: t.text,
                  completed: false,
                  progress: '100%',
                  dueDate: '',
                  bigTaskRef: { bigTaskId: bt.id, subtaskId: t.id, milestoneId: ms.id }
                });
                migrated++;
              }
            }
          });
        }
      });
    }
  });

  if (migrated > 0) {
    saveDateData(date, data);
  }
  return migrated;
}

// Defer a task from quadrant: big task subs go back to pool (date+1), others go to future pool
function deferQuadrantTask(taskData) {
  if (taskData.bigTaskRef) {
    // Push back to big task: increment plannedDate by 1
    var bigTasks = loadBigTasks();
    for (var i = 0; i < bigTasks.length; i++) {
      if (bigTasks[i].id === taskData.bigTaskRef.bigTaskId && bigTasks[i].milestones) {
        for (var j = 0; j < bigTasks[i].milestones.length; j++) {
          if (bigTasks[i].milestones[j].tasks) {
            for (var k = 0; k < bigTasks[i].milestones[j].tasks.length; k++) {
              if (bigTasks[i].milestones[j].tasks[k].id === taskData.bigTaskRef.subtaskId) {
                var oldDate = bigTasks[i].milestones[j].tasks[k].plannedDate;
                var nextDate = oldDate;
                if (oldDate) {
                  var d = new Date(oldDate + 'T00:00:00');
                  d.setDate(d.getDate() + 1);
                  nextDate = d.toISOString().split('T')[0];
                }
                bigTasks[i].milestones[j].tasks[k].plannedDate = nextDate;
                saveBigTasks(bigTasks);
                return 'pool';
              }
            }
          }
        }
      }
    }
    return null;
  } else {
    // Add to future task pool with tomorrow's date
    var today = new Date().toISOString().split('T')[0];
    var tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    var nextDate = tomorrow.toISOString().split('T')[0];
    var ft = {
      id: 'ft_' + generateId(),
      type: 'task',
      text: taskData.text,
      scheduledDate: nextDate,
      targetQuadrant: taskData.quadrantKey || ''
    };
    addFutureTask(ft);
    return 'future';
  }
}

// Auto-migrate future tasks whose scheduledDate matches the given date
// Returns count of migrated tasks
function migrateFutureTasks(date) {
  return _migratePlanPool(FUTURE_TASK_KEY, date, function(sd) { return sd === date; });
}

// Auto-migrate week tasks whose scheduledDate falls in the same week as the given date
function migrateWeekTasks(date) {
  var weekRange = _getWeekRange(date);
  return _migratePlanPool(WEEK_TASK_KEY, date, function(sd) {
    return sd >= weekRange[0] && sd <= weekRange[1];
  });
}

// Auto-migrate month tasks whose scheduledDate falls in the same month as the given date
function migrateMonthTasks(date) {
  var monthRange = _getMonthRange(date);
  return _migratePlanPool(MONTH_TASK_KEY, date, function(sd) {
    return sd >= monthRange[0] && sd <= monthRange[1];
  });
}

// Get the Monday-Sunday range for the given date's week
function _getWeekRange(dateStr) {
  var d = new Date(dateStr + 'T00:00:00');
  var day = d.getDay();
  var diff = day === 0 ? 6 : day - 1; // Monday = 0
  var monday = new Date(d);
  monday.setDate(d.getDate() - diff);
  var sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return [monday.toISOString().split('T')[0], sunday.toISOString().split('T')[0]];
}

// Get the first-last day range for the given date's month
function _getMonthRange(dateStr) {
  var d = new Date(dateStr + 'T00:00:00');
  var first = new Date(d.getFullYear(), d.getMonth(), 1);
  var last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return [first.toISOString().split('T')[0], last.toISOString().split('T')[0]];
}

// Generic plan pool migration
// shouldMigrate(sd) returns true if a task with scheduledDate=sd should be migrated
function _migratePlanPool(poolKey, date, shouldMigrate) {
  var ptasks = loadPlanTasks(poolKey);
  if (ptasks.length === 0) return 0;
  var migrated = 0;
  var remaining = [];
  var data = loadDateData(date);

  ptasks.forEach(function(ft) {
    if (ft.type === 'block') {
      var extractedSubs = [];
      var keptTasks = [];
      if (ft.tasks) {
        ft.tasks.forEach(function(st) {
          if (shouldMigrate(st.scheduledDate || '') && st.targetQuadrant) {
            extractedSubs.push(st);
          } else {
            keptTasks.push(st);
          }
        });
      }
      extractedSubs.forEach(function(st) {
        if (!data[st.targetQuadrant]) data[st.targetQuadrant] = [];
        data[st.targetQuadrant].push({
          id: generateId(),
          text: st.text,
          completed: false,
          progress: '100%',
          dueDate: ''
        });
        migrated++;
      });
      ft.tasks = keptTasks;
      if (shouldMigrate(ft.scheduledDate || '') && ft.targetQuadrant) {
        if (!data[ft.targetQuadrant]) data[ft.targetQuadrant] = [];
        var block = {
          id: generateId(),
          blockName: ft.blockName,
          progress: '100%',
          tasks: keptTasks.map(function(st) {
            return { id: generateId(), text: st.text, completed: false };
          })
        };
        data[ft.targetQuadrant].push(block);
        migrated++;
      } else if (keptTasks.length > 0 || !ft.scheduledDate || !shouldMigrate(ft.scheduledDate)) {
        remaining.push(ft);
      }
    } else {
      if (shouldMigrate(ft.scheduledDate || '') && ft.targetQuadrant) {
        if (!data[ft.targetQuadrant]) data[ft.targetQuadrant] = [];
        data[ft.targetQuadrant].push({
          id: generateId(),
          text: ft.text,
          completed: false,
          progress: '100%',
          dueDate: ''
        });
        migrated++;
      } else {
        remaining.push(ft);
      }
    }
  });

  if (migrated > 0) {
    saveDateData(date, data);
    savePlanTasks(poolKey, remaining);
  }
  return migrated;
}

// ============ Principles Module ============
var PRINCIPLES_KEY = 'quadrant_principles';

function loadPrinciples() {
  try {
    var raw = localStorage.getItem(PRINCIPLES_KEY);
    return raw ? JSON.parse(raw) : { id: '', startDate: '', endDate: '', principles: [] };
  } catch (e) {
    return { id: '', startDate: '', endDate: '', principles: [] };
  }
}

function savePrinciples(data) {
  try { localStorage.setItem(PRINCIPLES_KEY, JSON.stringify(data)); }
  catch (e) { alert('存储空间不足'); }
}

function addPrinciple(text) {
  var data = loadPrinciples();
  if (data.principles.length >= 5) { alert('原则最多5条，建议不超过3条'); return null; }
  var p = { id: generateId(), text: text };
  data.principles.push(p);
  savePrinciples(data);
  return p;
}

function updatePrinciple(id, text) {
  var data = loadPrinciples();
  for (var i = 0; i < data.principles.length; i++) {
    if (data.principles[i].id === id) { data.principles[i].text = text; break; }
  }
  savePrinciples(data);
}

function deletePrinciple(id) {
  var data = loadPrinciples();
  data.principles = data.principles.filter(function(p) { return p.id !== id; });
  savePrinciples(data);
}

function updatePrinciplesDateRange(startDate, endDate) {
  var data = loadPrinciples();
  data.startDate = startDate;
  data.endDate = endDate;
  savePrinciples(data);
}

