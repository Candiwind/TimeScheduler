// store.js - localStorage 数据存储操作

var STORAGE_KEY = 'quadrant_task_data';
var SYNC_FILENAME = 'quadrant_tasks_backup.json';
var SCHEMA_VERSION_KEY = 'quadrant_schema_version';
var SCHEMA_VERSION = 1;

// Check if running in Capacitor native app
function isCapacitorNative() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}
var STORAGE_BACKUP_KEY = 'quadrant_task_data_backup';
var MAX_ROLLING_BACKUPS = 3;  // Keep last 3 snapshots (rotating)

// --- 内存缓存层（避免重复 JSON.parse 整个历史大对象）---
var _allDataCache = null;
var _allDataCacheDirty = true;

function _fastDeepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    var arr = [];
    for (var i = 0; i < obj.length; i++) arr[i] = _fastDeepClone(obj[i]);
    return arr;
  }
  var clone = {};
  var keys = Object.keys(obj);
  for (var j = 0; j < keys.length; j++) {
    clone[keys[j]] = _fastDeepClone(obj[keys[j]]);
  }
  return clone;
}

function invalidateDataCache() {
  _allDataCacheDirty = true;
}

function loadAllData() {
  if (!_allDataCacheDirty && _allDataCache !== null) {
    return _fastDeepClone(_allDataCache);
  }
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      _allDataCache = JSON.parse(raw);
      _allDataCacheDirty = false;
      return _fastDeepClone(_allDataCache);
    }
  } catch (e) { /* fall through to backups */ }
  // Try recovery from rolling backups: _backup → _backup_1 → _backup_2 → ...
  var tryKeys = [STORAGE_BACKUP_KEY];
  for (var bi = 1; bi <= MAX_ROLLING_BACKUPS; bi++) {
    tryKeys.push(STORAGE_BACKUP_KEY + '_' + bi);
  }
  for (var k = 0; k < tryKeys.length; k++) {
    try {
      var backup = localStorage.getItem(tryKeys[k]);
      if (backup) {
        console.warn('Primary data corrupted, recovering from backup: ' + tryKeys[k]);
        var recovered = JSON.parse(backup);
        localStorage.setItem(STORAGE_KEY, backup);
        _allDataCache = recovered;
        _allDataCacheDirty = false;
        return _fastDeepClone(_allDataCache);
      }
    } catch (e2) { /* continue to next backup */ }
  }
  _allDataCache = {};
  _allDataCacheDirty = false;
  return {};
}

var _lastBackupRotate = 0;

// Rotate backups: shift existing snapshots +1, then store newest as _backup.
// This prevents a single malformed save from destroying both primary and backup
// simultaneously — older snapshots survive if the bug is detected in time.
// Throttled: only rotates if >30s since last rotation (high-frequency saves skip rotation).
function _rotateRollingBackups(json) {
  try {
    var now = Date.now();
    if (now - _lastBackupRotate < 30000) return; // 限频：30秒内不重复轮转
    _lastBackupRotate = now;
    // Shift: _backup_2 → _backup_3, _backup_1 → _backup_2, _backup → _backup_1
    for (var i = MAX_ROLLING_BACKUPS - 1; i >= 1; i--) {
      var older = localStorage.getItem(STORAGE_BACKUP_KEY + '_' + i);
      if (older !== null) {
        localStorage.setItem(STORAGE_BACKUP_KEY + '_' + (i + 1), older);
      }
    }
    var current = localStorage.getItem(STORAGE_BACKUP_KEY);
    if (current !== null) {
      localStorage.setItem(STORAGE_BACKUP_KEY + '_1', current);
    }
    localStorage.setItem(STORAGE_BACKUP_KEY, json);
  } catch (e) { /* silently skip backup rotation on quota — primary is already saved */ }
}

function saveAllData(data) {
  try {
    var json = JSON.stringify(data);
    localStorage.setItem(STORAGE_KEY, json);
    // 更新内存缓存
    _allDataCache = _fastDeepClone(data);
    _allDataCacheDirty = false;
    // Rolling backup: keeps up to 3 prior snapshots so old versions survive
    // even if a logic bug corrupts data for several consecutive saves
    _rotateRollingBackups(json);
    // Record schema version for future migration detection
    try { localStorage.setItem(SCHEMA_VERSION_KEY, String(SCHEMA_VERSION)); } catch (e) {}
  } catch (e) {
    var usedPct = estimateQuotaPct();
    var hint = usedPct > 80
      ? '\n\n当前已使用约 ' + usedPct + '% 的存储空间。建议导出 JSON 备份后清理历史日期或删除旧数据。'
      : '';
    alert('存储空间不足，请清理部分数据后重试' + hint);
  }
}

// Estimate localStorage usage percentage (rough, cross-browser approximation)
function estimateQuotaPct() {
  try {
    var total = 0;
    for (var i = 0; i < localStorage.length; i++) {
      total += localStorage.getItem(localStorage.key(i)).length;
    }
    // Most browsers allocate ~5 MB for localStorage
    return Math.round(total / (5 * 1024 * 1024) * 100);
  } catch (e) { return 0; }
}

function loadDateData(date) {
  var all = loadAllData();
  return all[date] || { I: [], II: [], III: [], IV: [] };
}

function saveDateData(date, quadrantData) {
  var all = loadAllData();
  all[date] = quadrantData;
  saveAllData(all);
  // 通知云同步模块
  if (typeof CloudSync !== 'undefined' && CloudSync.onDataChanged) {
    CloudSync.onDataChanged();
  }
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
      // 通知云同步模块
      if (typeof CloudSync !== 'undefined' && CloudSync.onDataChanged) {
        CloudSync.onDataChanged();
      }
    }
    _deferredTimer = null;
  }, 0);
}

function getAllCachedDates() {
  var all = loadAllData();
  return Object.keys(all).sort();
}

function getCachedDateData(date) {
  // 优先从快照读取：找到第一个有该日期且有快照的条目
  var entries = loadCachedDatesIndex();
  for (var i = 0; i < entries.length; i++) {
    if (entries[i].date === date && entries[i].snapshot) {
      return JSON.parse(JSON.stringify(entries[i].snapshot));
    }
  }
  // 回退：从主数据读取
  return loadDateData(date);
}

// 基于快照条目导入（新架构核心函数）
function importCachedDataFromSnapshot(entryId, targetDate, silent) {
  var entry = getCacheEntryById(entryId);
  if (!entry) {
    if (!silent) alert('缓存条目不存在');
    return false;
  }
  if (!entry.snapshot) {
    if (!silent) alert('该缓存条目没有快照数据，请先更新快照');
    return false;
  }
  var all = loadAllData();
  var sourceData = JSON.parse(JSON.stringify(entry.snapshot));
  if (entry.date === targetDate) {
    // 同日期：直接覆盖
    all[targetDate] = sourceData;
  } else {
    // 跨日期：ID 合并
    var targetData = all[targetDate] || { I: [], II: [], III: [], IV: [] };
    QUADRANT_KEYS.forEach(function(key) {
      var existingIds = {};
      (targetData[key] || []).forEach(function(item) {
        existingIds[item.id] = true;
        if (item.tasks) item.tasks.forEach(function(st) { existingIds[st.id] = true; });
      });
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

function importCachedData(sourceDate, targetDate, silent) {
  var all = loadAllData();
  if (!all[sourceDate]) {
    if (!silent) alert('源日期没有缓存数据');
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

// ============ Explicit Cache Index (only dates user clicked "缓存当前") ============
// V4: 条目结构 [{id, date, label, pinned, cachedAt, autoWorkday, autoSaturday, autoSunday}]
// 同一日期可多次缓存为独立快照，置顶后支持按星期自动导入
var CACHE_INDEX_KEY = 'quadrant_cached_dates_index';

function loadCachedDatesIndex() {
  try {
    var raw = localStorage.getItem(CACHE_INDEX_KEY);
    if (!raw) return [];
    var arr = JSON.parse(raw);
    // 向后兼容：string[] → [{date, label}] → [{id, date, label, pinned, cachedAt, auto*}]
    for (var i = 0; i < arr.length; i++) {
      if (typeof arr[i] === 'string') {
        arr[i] = { id: 'cache_' + generateId(), date: arr[i], label: '', pinned: false, cachedAt: Date.now(), autoWorkday: false, autoSaturday: false, autoSunday: false };
      } else {
        if (!arr[i].id) arr[i].id = 'cache_' + generateId();
        if (arr[i].pinned === undefined) arr[i].pinned = false;
        if (!arr[i].cachedAt) arr[i].cachedAt = Date.now();
        if (arr[i].autoWorkday === undefined) arr[i].autoWorkday = false;
        if (arr[i].autoSaturday === undefined) arr[i].autoSaturday = false;
        if (arr[i].autoSunday === undefined) arr[i].autoSunday = false;
        if (arr[i].snapshot === undefined) arr[i].snapshot = null;
      }
    }
    // 去重：仅清理同日期且都未命名的重复条目（有 label 的条目是用户保留的版本，不去重）
    var seenUnlabeled = {}; // date → entry (only for unlabeled entries)
    var deduped = [];
    for (var j = 0; j < arr.length; j++) {
      var entry = arr[j];
      if (!entry.date) { deduped.push(entry); continue; }
      if (entry.label) {
        // 有名称的条目始终保留（用户刻意保存的版本）
        deduped.push(entry);
        continue;
      }
      // 未命名条目：同日期只保留一条
      if (!seenUnlabeled[entry.date]) {
        seenUnlabeled[entry.date] = entry;
        deduped.push(entry);
      } else {
        var prev = seenUnlabeled[entry.date];
        if ((entry.cachedAt || 0) > (prev.cachedAt || 0)) {
          // 新条目更新 → 替换旧未命名条目
          deduped[deduped.indexOf(prev)] = entry;
          seenUnlabeled[entry.date] = entry;
        }
        // 否则保留旧条目
      }
    }
    // 如果去重后有变化，回写清理后的数据
    if (deduped.length !== arr.length) {
      deduped.sort(function(a, b) { return (a.date || '').localeCompare(b.date || ''); });
      saveCachedDatesIndex(deduped);
    }
    return deduped;
  } catch (e) {
    return [];
  }
}

function saveCachedDatesIndex(entries) {
  try {
    localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(entries));
  } catch (e) { /* silently fail */ }
}

function markDateAsCached(date) {
  var data = loadDateData(date);
  // 检查是否有内容
  var hasContent = false;
  QUADRANT_KEYS.forEach(function(key) {
    if (data[key] && data[key].length > 0) hasContent = true;
  });
  if (!hasContent) return false;
  // 深拷贝创建独立快照
  var snapshot = JSON.parse(JSON.stringify(data));
  var cached = loadCachedDatesIndex();
  // 查找同日期且未命名的条目（无 label 视为通用缓存，可覆盖；有 label 视为用户保留的版本，不可覆盖）
  var existingIdx = -1;
  for (var i = 0; i < cached.length; i++) {
    if (cached[i].date === date && !cached[i].label) { existingIdx = i; break; }
  }
  if (existingIdx >= 0) {
    // 更新已有未命名条目的快照
    cached[existingIdx].snapshot = snapshot;
    cached[existingIdx].cachedAt = Date.now();
  } else {
    cached.push({
      id: 'cache_' + generateId(),
      date: date,
      label: '',
      pinned: false,
      cachedAt: Date.now(),
      autoWorkday: false, autoSaturday: false, autoSunday: false,
      snapshot: snapshot
    });
  }
  cached.sort(function(a, b) { return a.date.localeCompare(b.date); });
  saveCachedDatesIndex(cached);
  return true;
}

// 更新已有缓存条目的快照为当前该日期的最新数据
function updateCacheSnapshot(id) {
  var entries = loadCachedDatesIndex();
  for (var i = 0; i < entries.length; i++) {
    if (entries[i].id === id) {
      var data = loadDateData(entries[i].date);
      entries[i].snapshot = JSON.parse(JSON.stringify(data));
      entries[i].cachedAt = Date.now();
      saveCachedDatesIndex(entries);
      return true;
    }
  }
  return false;
}

// 返回去重后的唯一日期列表（供导入逻辑使用）
function getCachedDates() {
  var seen = {};
  var dates = [];
  loadCachedDatesIndex().forEach(function(e) {
    if (!seen[e.date]) { seen[e.date] = true; dates.push(e.date); }
  });
  return dates;
}

function getCachedDateEntries() {
  return loadCachedDatesIndex();
}

// 通过条目ID获取缓存条目（含快照）
function getCacheEntryById(id) {
  var entries = loadCachedDatesIndex();
  for (var i = 0; i < entries.length; i++) {
    if (entries[i].id === id) return entries[i];
  }
  return null;
}

// 通过条目ID更新标签
function updateCachedDateLabel(id, label) {
  var entries = loadCachedDatesIndex();
  for (var i = 0; i < entries.length; i++) {
    if (entries[i].id === id) { entries[i].label = (label || '').trim(); break; }
  }
  saveCachedDatesIndex(entries);
}

// 通过条目ID从导入缓存索引中删除
function removeCachedDate(id) {
  var entries = loadCachedDatesIndex();
  var filtered = entries.filter(function(e) { return e.id !== id; });
  if (filtered.length < entries.length) {
    saveCachedDatesIndex(filtered);
    return true;
  }
  return false;
}

// 通过条目ID切换置顶状态
function toggleCachedDatePin(id) {
  var entries = loadCachedDatesIndex();
  for (var i = 0; i < entries.length; i++) {
    if (entries[i].id === id) { entries[i].pinned = !entries[i].pinned; break; }
  }
  saveCachedDatesIndex(entries);
}

// 设置缓存条目的自动导入选项（field: 'autoWorkday' | 'autoSaturday' | 'autoSunday'）
function setCachedDateAutoImport(id, field, value) {
  var entries = loadCachedDatesIndex();
  for (var i = 0; i < entries.length; i++) {
    if (entries[i].id === id) { entries[i][field] = !!value; break; }
  }
  saveCachedDatesIndex(entries);
}

// 获取某日期应自动导入的缓存条目（置顶 + 星期匹配）
function getAutoImportEntriesForDate(dateStr) {
  var day = new Date(dateStr + 'T00:00:00').getDay(); // 0=周日 1-5=周一至周五 6=周六
  var entries = loadCachedDatesIndex();
  return entries.filter(function(e) {
    if (!e.pinned) return false;
    if (day >= 1 && day <= 5 && e.autoWorkday) return true;
    if (day === 6 && e.autoSaturday) return true;
    if (day === 0 && e.autoSunday) return true;
    return false;
  });
}

// 静默版导入（无 alert/confirm），供自动导入使用
// 优先从快照导入，回退到主数据
function silentImportCachedData(sourceDate, targetDate) {
  // 优先查找有快照的条目
  var entries = loadCachedDatesIndex();
  for (var i = 0; i < entries.length; i++) {
    if (entries[i].date === sourceDate && entries[i].snapshot) {
      return importCachedDataFromSnapshot(entries[i].id, targetDate, true);
    }
  }
  // 回退：从主数据读取
  return importCachedData(sourceDate, targetDate, true);
}

// 自动导入追踪：记录哪些(entryId, targetDate)已导入过，避免重复导入
var AUTO_IMPORT_TRACKER_KEY = 'quadrant_auto_import_tracker';

function _getAutoImportTracker() {
  try {
    var raw = localStorage.getItem(AUTO_IMPORT_TRACKER_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch(e) { return {}; }
}

function _saveAutoImportTracker(tracker) {
  try { localStorage.setItem(AUTO_IMPORT_TRACKER_KEY, JSON.stringify(tracker)); } catch(e) {}
}

function _wasAutoImported(entryId, targetDate) {
  var tracker = _getAutoImportTracker();
  return !!(tracker[targetDate] && tracker[targetDate][entryId]);
}

function _markAutoImported(entryId, targetDate) {
  var tracker = _getAutoImportTracker();
  if (!tracker[targetDate]) tracker[targetDate] = {};
  tracker[targetDate][entryId] = true;
  _saveAutoImportTracker(tracker);
}

// 对指定日期执行所有尚未导入的自动导入，返回导入的条目标签列表
// 每个(entryId, targetDate)对只会自动导入一次，防止重复导入已删除的任务
function runAutoImportsForDate(dateStr) {
  var entries = getAutoImportEntriesForDate(dateStr);
  if (entries.length === 0) return [];
  var labels = [];
  entries.forEach(function(e) {
    if (!_wasAutoImported(e.id, dateStr)) {
      // 优先使用快照导入
      if (e.snapshot && importCachedDataFromSnapshot(e.id, dateStr, true)) {
        _markAutoImported(e.id, dateStr);
        labels.push(e.label || e.date);
      } else if (silentImportCachedData(e.date, dateStr)) {
        // 回退：从主数据导入
        _markAutoImported(e.id, dateStr);
        labels.push(e.label || e.date);
      }
    }
  });
  return labels;
}

// DEPRECATED: 旧版 seed 函数，不再需要。保留空壳以兼容旧调用。
function seedCacheIndexIfEmpty() {
  // 已被 migrateCacheIndexToSnapshot() 替代
}

// 迁移旧缓存条目为快照格式（一次性，通过迁移标记防重）
function migrateCacheIndexToSnapshot() {
  var MIGRATION_DONE_KEY = 'quadrant_cache_snapshot_migration_v1';
  if (localStorage.getItem(MIGRATION_DONE_KEY)) return 0;
  var entries = loadCachedDatesIndex();
  if (entries.length === 0) {
    localStorage.setItem(MIGRATION_DONE_KEY, '1');
    return 0;
  }
  var migrated = 0;
  var allData = loadAllData();
  entries.forEach(function(e) {
    if (!e.snapshot && allData[e.date]) {
      e.snapshot = JSON.parse(JSON.stringify(allData[e.date]));
      migrated++;
    }
  });
  if (migrated > 0) {
    saveCachedDatesIndex(entries);
  }
  localStorage.setItem(MIGRATION_DONE_KEY, '1');
  return migrated;
}

// 清除所有缓存条目（含快照）
function clearAllCachedDates() {
  saveCachedDatesIndex([]);
  try { localStorage.removeItem(AUTO_IMPORT_TRACKER_KEY); } catch(e) {}
}

// 清理主数据中超过 keepDays 天的旧日期（保留被缓存引用的日期）
function removeOldDateData(daysToKeep) {
  var all = loadAllData();
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (daysToKeep || 30));
  var cutoffStr = cutoff.toISOString().split('T')[0];
  // 收集缓存条目引用的日期
  var cachedDates = {};
  loadCachedDatesIndex().forEach(function(e) { cachedDates[e.date] = true; });
  var removed = 0;
  Object.keys(all).forEach(function(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return; // 跳过非日期键
    if (date >= cutoffStr) return; // 保留近期日期
    if (cachedDates[date]) return; // 保留被缓存引用的日期
    delete all[date];
    removed++;
  });
  if (removed > 0) saveAllData(all);
  return removed;
}

// ============ 通用回收站/删除缓存引擎 ============
// 适用于大任务删除缓存、依循删除缓存、计划池完成/删除缓存
var BIG_TASKS_DELETED_KEY = 'quadrant_big_tasks_deleted';
var PRINCIPLES_DELETED_KEY = 'quadrant_principles_deleted';
var PRIORITY_PROBLEMS_DELETED_KEY = 'quadrant_priority_problems_deleted';
var FUTURE_TASKS_CACHE_KEY = 'quadrant_future_tasks_cache';
var WEEK_TASKS_CACHE_KEY = 'quadrant_week_tasks_cache';
var MONTH_TASKS_CACHE_KEY = 'quadrant_month_tasks_cache';
var MAX_CACHE_ENTRIES = 10;

function _loadGenericCache(cacheKey) {
  try {
    var raw = localStorage.getItem(cacheKey);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

function _saveGenericCache(cacheKey, entries) {
  try { localStorage.setItem(cacheKey, JSON.stringify(entries)); }
  catch (e) { alert('存储空间不足'); }
  if (typeof CloudSync !== 'undefined' && CloudSync.onDataChanged) {
    CloudSync.onDataChanged();
  }
}

// 向缓存添加条目。达到上限时：优先驱逐最旧的 unpinned 条目；全置顶则拒绝并返回 false
function addToCache(cacheKey, entry, maxSize) {
  var limit = maxSize || MAX_CACHE_ENTRIES;
  var entries = _loadGenericCache(cacheKey);
  entry.timestamp = entry.timestamp || Date.now();
  entry.pinned = entry.pinned || false;
  if (entries.length >= limit) {
    var victimIdx = -1;
    for (var i = 0; i < entries.length; i++) {
      if (!entries[i].pinned) { victimIdx = i; break; }
    }
    if (victimIdx < 0) {
      alert('缓存已满（' + limit + ' 条）且全部已置顶。请先取消置顶再操作。');
      return false;
    }
    entries.splice(victimIdx, 1);
  }
  entries.push(entry);
  _saveGenericCache(cacheKey, entries);
  return true;
}

// 从缓存中永久删除条目
function removeFromCache(cacheKey, id) {
  var entries = _loadGenericCache(cacheKey);
  var filtered = entries.filter(function(e) { return e.id !== id; });
  if (filtered.length < entries.length) {
    _saveGenericCache(cacheKey, filtered);
    return true;
  }
  return false;
}

// 切换缓存条目的置顶状态
function toggleCachePin(cacheKey, id) {
  var entries = _loadGenericCache(cacheKey);
  for (var i = 0; i < entries.length; i++) {
    if (entries[i].id === id) { entries[i].pinned = !entries[i].pinned; break; }
  }
  _saveGenericCache(cacheKey, entries);
}

// 获取缓存条目列表
function getCacheEntries(cacheKey) {
  return _loadGenericCache(cacheKey);
}

// ============ 计划池完成/删除 → 移入缓存 ============
// 从计划池中查找并移出条目（任务/块/子任务），写入对应缓存
// poolKey: FUTURE/WEEK/MONTH_TASK_KEY。返回被移除的条目副本，未找到返回 null
function _extractAndCachePlanPoolItem(poolKey, saveFn, ftId, stId, action) {
  var tasks = loadPlanTasks(poolKey);
  var cacheKey = _planPoolToCacheKey(poolKey);
  var entry = null;
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === ftId) {
      if (stId && tasks[i].tasks) {
        // block 子任务
        for (var j = 0; j < tasks[i].tasks.length; j++) {
          if (tasks[i].tasks[j].id === stId) {
            var removed = tasks[i].tasks.splice(j, 1)[0];
            entry = {
              id: stId,
              type: 'subtask',
              data: JSON.parse(JSON.stringify(removed)),
              parentInfo: { ftId: ftId, ftName: tasks[i].blockName || tasks[i].text || '' },
              action: action,
              timestamp: Date.now(),
              pinned: false
            };
            break;
          }
        }
      } else if (!stId) {
        // 任务/块本身
        var removed2 = tasks.splice(i, 1)[0];
        entry = {
          id: ftId,
          type: removed2.type || 'task',
          data: JSON.parse(JSON.stringify(removed2)),
          parentInfo: null,
          action: action,
          timestamp: Date.now(),
          pinned: false
        };
      }
      break;
    }
  }
  if (entry) {
    // 先尝试写入缓存，成功后才持久化删除（避免缓存满时数据丢失）
    if (addToCache(cacheKey, entry)) {
      saveFn(tasks);
    }
  }
  return entry;
}

// 从计划池中提取已完成的条目（当 stage→all 完成 或 直接勾选完成 时）
// 检查 entry.data 中所有 stages 是否完成，若完成则移入缓存
function _maybeCompleteAndCachePlanPoolItem(poolKey, saveFn, ftId, stId) {
  var tasks = loadPlanTasks(poolKey);
  var cacheKey = _planPoolToCacheKey(poolKey);
  var entry = null;
  var shouldCache = false;

  for (var i = 0; i < tasks.length; i++) {
    var ft = tasks[i];
    if (ft.id === ftId) {
      if (stId && ft.tasks) {
        // block 子任务完成检查
        for (var j = 0; j < ft.tasks.length; j++) {
          var st = ft.tasks[j];
          if (st.id === stId) {
            if (st.completed) {
              // 子任务有阶段：所有阶段完成才算完成
              if (st.stages && st.stages.length > 0) {
                shouldCache = st.stages.every(function(s) { return s.completed; });
              } else {
                shouldCache = true; // 无阶段，直接完成
              }
              if (shouldCache) {
                var removed = ft.tasks.splice(j, 1)[0];
                entry = {
                  id: stId,
                  type: 'subtask',
                  data: JSON.parse(JSON.stringify(removed)),
                  parentInfo: { ftId: ftId, ftName: ft.blockName || ft.text || '' },
                  action: 'completed',
                  timestamp: Date.now(),
                  pinned: false
                };
              }
            }
            break;
          }
        }
      } else if (!stId) {
        // 任务/块完成检查
        if (ft.completed) {
          if (ft.stages && ft.stages.length > 0) {
            shouldCache = ft.stages.every(function(s) { return s.completed; });
          } else {
            shouldCache = true;
          }
          if (shouldCache) {
            var removed2 = tasks.splice(i, 1)[0];
            entry = {
              id: ftId,
              type: ft.type || 'task',
              data: JSON.parse(JSON.stringify(removed2)),
              parentInfo: null,
              action: 'completed',
              timestamp: Date.now(),
              pinned: false
            };
          }
        }
      }
      break;
    }
  }
  if (entry) {
    // 先尝试写入缓存，成功后才持久化移除
    if (addToCache(cacheKey, entry)) {
      saveFn(tasks);
    }
  }
  return entry;
}

function _planPoolToCacheKey(poolKey) {
  if (poolKey === FUTURE_TASK_KEY) return FUTURE_TASKS_CACHE_KEY;
  if (poolKey === WEEK_TASK_KEY) return WEEK_TASKS_CACHE_KEY;
  return MONTH_TASKS_CACHE_KEY;
}

// 从计划池缓存中恢复条目到池中
function restorePlanPoolFromCache(poolKey, saveFn, cacheId) {
  var cacheKey = _planPoolToCacheKey(poolKey);
  var entries = _loadGenericCache(cacheKey);
  var idx = -1;
  for (var i = 0; i < entries.length; i++) { if (entries[i].id === cacheId) { idx = i; break; } }
  if (idx < 0) return false;
  var entry = entries[idx];
  var tasks = loadPlanTasks(poolKey);
  if (entry.type === 'subtask' && entry.parentInfo) {
    // 子任务：先验证父 block 是否存在于活跃池中
    var parentFound = false;
    for (var pi = 0; pi < tasks.length; pi++) {
      if (tasks[pi].id === entry.parentInfo.ftId && tasks[pi].tasks) { parentFound = true; break; }
    }
    if (!parentFound) return false; // 父 block 不存在，保留在缓存中不恢复
  }
  // 验证通过，从缓存中移除
  entries.splice(idx, 1)[0];
  _saveGenericCache(cacheKey, entries);
  // 恢复时清除 completed 状态（如果是因为完成而缓存的）
  if (entry.data) {
    entry.data.completed = false;
    if (entry.data.stages) {
      entry.data.stages.forEach(function(s) { s.completed = false; });
    }
  }
  if (entry.type === 'subtask' && entry.parentInfo) {
    // 恢复到对应 block 中
    for (var j = 0; j < tasks.length; j++) {
      if (tasks[j].id === entry.parentInfo.ftId && tasks[j].tasks) {
        tasks[j].tasks.push(entry.data);
        break;
      }
    }
  } else {
    tasks.push(entry.data);
  }
  saveFn(tasks);
  return true;
}

// ============ 大任务删除缓存 ============
function _extractAndCacheBigTaskItem(btId, msId, stId, stageId) {
  var tasks = loadBigTasks();
  var entry = null;
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === btId) {
      if (!msId && !stId && !stageId) {
        // 删除整卡
        var removed = tasks.splice(i, 1)[0];
        entry = {
          id: btId,
          type: 'bigtask',
          data: JSON.parse(JSON.stringify(removed)),
          parentInfo: null,
          action: 'deleted',
          timestamp: Date.now(),
          pinned: false
        };
      } else if (msId && !stId && !stageId && tasks[i].milestones) {
        // 删除里程碑
        for (var j = 0; j < tasks[i].milestones.length; j++) {
          if (tasks[i].milestones[j].id === msId) {
            var removedMs = tasks[i].milestones.splice(j, 1)[0];
            entry = {
              id: msId,
              type: 'milestone',
              data: JSON.parse(JSON.stringify(removedMs)),
              parentInfo: { bigTaskId: btId, bigTaskName: tasks[i].name || '' },
              action: 'deleted',
              timestamp: Date.now(),
              pinned: false
            };
            break;
          }
        }
      } else if (msId && stId && !stageId && tasks[i].milestones) {
        // 删除子任务
        for (var k = 0; k < tasks[i].milestones.length; k++) {
          if (tasks[i].milestones[k].id === msId && tasks[i].milestones[k].tasks) {
            for (var l = 0; l < tasks[i].milestones[k].tasks.length; l++) {
              if (tasks[i].milestones[k].tasks[l].id === stId) {
                var removedSt = tasks[i].milestones[k].tasks.splice(l, 1)[0];
                entry = {
                  id: stId,
                  type: 'subtask',
                  data: JSON.parse(JSON.stringify(removedSt)),
                  parentInfo: { bigTaskId: btId, bigTaskName: tasks[i].name || '', milestoneId: msId, milestoneName: tasks[i].milestones[k].name || '' },
                  action: 'deleted',
                  timestamp: Date.now(),
                  pinned: false
                };
                break;
              }
            }
            break;
          }
        }
      } else if (msId && stId && stageId && tasks[i].milestones) {
        // 删除阶段
        for (var m = 0; m < tasks[i].milestones.length; m++) {
          if (tasks[i].milestones[m].id === msId && tasks[i].milestones[m].tasks) {
            for (var n = 0; n < tasks[i].milestones[m].tasks.length; n++) {
              var t = tasks[i].milestones[m].tasks[n];
              if (t.id === stId && t.stages) {
                for (var p = 0; p < t.stages.length; p++) {
                  if (t.stages[p].id === stageId) {
                    var removedStage = t.stages.splice(p, 1)[0];
                    entry = {
                      id: stageId,
                      type: 'stage',
                      data: JSON.parse(JSON.stringify(removedStage)),
                      parentInfo: { bigTaskId: btId, bigTaskName: tasks[i].name || '', milestoneId: msId, milestoneName: tasks[i].milestones[m].name || '', subtaskId: stId, subtaskName: t.text || '' },
                      action: 'deleted',
                      timestamp: Date.now(),
                      pinned: false
                    };
                    if (t.stages.length === 0) { delete t.stages; t.completed = false; }
                    else { t.completed = t.stages.every(function(s) { return s.completed; }); }
                    break;
                  }
                }
                break;
              }
            }
            break;
          }
        }
      }
      break;
    }
  }
  if (entry) {
    // 整卡删除时 tasks[i] 已指向下一个元素，不 recalc
    if (msId) {
      // 里程碑/子任务/阶段删除：重新计算所属大任务的进度
      for (var bi = 0; bi < tasks.length; bi++) {
        if (tasks[bi].id === btId) { recalcBigTaskProgress(tasks[bi]); break; }
      }
    }
    // 先尝试写入缓存，成功后才保存到 localStorage（避免缓存满时数据丢失）
    if (addToCache(BIG_TASKS_DELETED_KEY, entry)) {
      saveBigTasks(tasks);
    }
  }
  return entry;
}

// 从大任务删除缓存恢复条目
function restoreBigTaskFromDeletedCache(cacheId) {
  var entries = _loadGenericCache(BIG_TASKS_DELETED_KEY);
  var idx = -1;
  for (var i = 0; i < entries.length; i++) { if (entries[i].id === cacheId) { idx = i; break; } }
  if (idx < 0) return false;
  var entry = entries[idx];
  var tasks = loadBigTasks();
  if (entry.type === 'bigtask') {
    // 整卡恢复：直接移除缓存并恢复（无父任务依赖）
    entries.splice(idx, 1)[0];
    _saveGenericCache(BIG_TASKS_DELETED_KEY, entries);
    tasks.push(entry.data);
    saveBigTasks(tasks);
    return true;
  } else if (entry.parentInfo && entry.parentInfo.bigTaskId) {
    // 非整卡（里程碑/子任务/阶段）：先验证父大任务是否存在于活跃数据中
    var parentFound = false;
    for (var pi = 0; pi < tasks.length; pi++) {
      if (tasks[pi].id === entry.parentInfo.bigTaskId) { parentFound = true; break; }
    }
    if (!parentFound) return false; // 父大任务不存在，保留在缓存中不恢复
    // 父任务存在，移除缓存并恢复
    entries.splice(idx, 1)[0];
    _saveGenericCache(BIG_TASKS_DELETED_KEY, entries);
    if (entry.type === 'milestone') {
      for (var i = 0; i < tasks.length; i++) {
        if (tasks[i].id === entry.parentInfo.bigTaskId) {
          if (!tasks[i].milestones) tasks[i].milestones = [];
          tasks[i].milestones.push(entry.data);
          recalcBigTaskProgress(tasks[i]);
          break;
        }
      }
    } else if (entry.type === 'subtask') {
      for (var i = 0; i < tasks.length; i++) {
        if (tasks[i].id === entry.parentInfo.bigTaskId && tasks[i].milestones) {
          for (var j = 0; j < tasks[i].milestones.length; j++) {
            if (tasks[i].milestones[j].id === entry.parentInfo.milestoneId) {
              if (!tasks[i].milestones[j].tasks) tasks[i].milestones[j].tasks = [];
              tasks[i].milestones[j].tasks.push(entry.data);
              recalcBigTaskProgress(tasks[i]);
              break;
            }
          }
          break;
        }
      }
    } else if (entry.type === 'stage') {
      for (var i = 0; i < tasks.length; i++) {
        if (tasks[i].id === entry.parentInfo.bigTaskId && tasks[i].milestones) {
          for (var j = 0; j < tasks[i].milestones.length; j++) {
            if (tasks[i].milestones[j].id === entry.parentInfo.milestoneId && tasks[i].milestones[j].tasks) {
              for (var k = 0; k < tasks[i].milestones[j].tasks.length; k++) {
                if (tasks[i].milestones[j].tasks[k].id === entry.parentInfo.subtaskId) {
                  if (!tasks[i].milestones[j].tasks[k].stages) tasks[i].milestones[j].tasks[k].stages = [];
                  tasks[i].milestones[j].tasks[k].stages.push(entry.data);
                  recalcBigTaskProgress(tasks[i]);
                  break;
                }
              }
              break;
            }
          }
          break;
        }
      }
    }
    saveBigTasks(tasks);
  } else {
    return false; // 无法恢复（parentInfo 缺失）
  }
  return true;
}

// ============ 依循删除缓存 ============
// 原则与优先问题分别存入独立缓存：PRINCIPLES_DELETED_KEY / PRIORITY_PROBLEMS_DELETED_KEY
function _extractAndCachePrinciple(id, type) {
  var data = loadPrinciples();
  var entry = null;
  var cacheKey = type === 'priorityProblem' ? PRIORITY_PROBLEMS_DELETED_KEY : PRINCIPLES_DELETED_KEY;
  if (type === 'principle') {
    for (var i = 0; i < data.principles.length; i++) {
      if (data.principles[i].id === id) {
        var removed = data.principles.splice(i, 1)[0];
        entry = { id: id, type: 'principle', data: JSON.parse(JSON.stringify(removed)), deletedAt: Date.now(), pinned: false };
        break;
      }
    }
  } else if (type === 'priorityProblem') {
    if (!data.priorityProblems) data.priorityProblems = [];
    for (var j = 0; j < data.priorityProblems.length; j++) {
      if (data.priorityProblems[j].id === id) {
        var removed2 = data.priorityProblems.splice(j, 1)[0];
        entry = { id: id, type: 'priorityProblem', data: JSON.parse(JSON.stringify(removed2)), deletedAt: Date.now(), pinned: false };
        break;
      }
    }
  }
  if (entry) {
    // 先尝试写入缓存，成功后才持久化删除
    if (addToCache(cacheKey, entry)) {
      savePrinciples(data);
    }
  }
  return entry;
}

// 从原则删除缓存恢复
function restorePrincipleFromDeletedCache(cacheId) {
  var entries = _loadGenericCache(PRINCIPLES_DELETED_KEY);
  var idx = -1;
  for (var i = 0; i < entries.length; i++) { if (entries[i].id === cacheId) { idx = i; break; } }
  if (idx < 0) return false;
  var entry = entries.splice(idx, 1)[0];
  _saveGenericCache(PRINCIPLES_DELETED_KEY, entries);
  var data = loadPrinciples();
  data.principles.push(entry.data);
  savePrinciples(data);
  return true;
}

// 从优先问题删除缓存恢复
function restorePriorityProblemFromDeletedCache(cacheId) {
  var entries = _loadGenericCache(PRIORITY_PROBLEMS_DELETED_KEY);
  var idx = -1;
  for (var i = 0; i < entries.length; i++) { if (entries[i].id === cacheId) { idx = i; break; } }
  if (idx < 0) return false;
  var entry = entries.splice(idx, 1)[0];
  _saveGenericCache(PRIORITY_PROBLEMS_DELETED_KEY, entries);
  var data = loadPrinciples();
  if (!data.priorityProblems) data.priorityProblems = [];
  data.priorityProblems.push(entry.data);
  savePrinciples(data);
  return true;
}

function generateId() {
  return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Deep-copy stages from a big task subtask for quadrant import (new IDs to avoid conflicts)
function copyBigSubtaskStages(bigSubtask) {
  if (!bigSubtask.stages || !bigSubtask.stages.length) return null;
  return bigSubtask.stages.map(function(s) {
    return {
      id: generateId(),
      text: s.text,
      completed: s.completed || false,
      timeSlot: s.timeSlot || '',
      highlights: s.highlights ? s.highlights.slice() : undefined,
      extraCompleted: s.extraCompleted || false
    };
  });
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
      // 同时写入日期文件名（用户可识别）和固定文件名（autoSyncFromDevice 读取）
      var writeDated = CapacitorFilesystem.writeFile({
        path: 'Documents/' + fileName,
        data: json,
        directory: 'DOCUMENTS'
      });
      var writeSync = CapacitorFilesystem.writeFile({
        path: 'Documents/' + SYNC_FILENAME,
        data: json,
        directory: 'DOCUMENTS'
      });
      Promise.all([writeDated, writeSync]).then(function() {
        alert('数据已导出到设备文档文件夹：' + fileName + '\n\n可通过文件管理器找到此文件，在浏览器版中使用"导入JSON"即可同步数据。');
      }).catch(function(e) {
        // Fallback: try Downloads folder
        Promise.all([
          CapacitorFilesystem.writeFile({ path: fileName, data: json, directory: 'DOWNLOADS' }),
          CapacitorFilesystem.writeFile({ path: SYNC_FILENAME, data: json, directory: 'DOWNLOADS' })
        ]).then(function() {
          alert('数据已导出到下载文件夹：' + fileName);
        }).catch(function(e2) {
          alert('导出失败，尝试浏览器下载模式...');
          fallbackBlobDownload(json, fileName);
        });
      });
    } catch (e) {
      fallbackBlobDownload(json, fileName);
    }
    // 显示可复制文本，便于跨设备粘贴导入（手机端复制 → 电脑端粘贴，或反之）
    if (typeof showJsonExportModal === 'function') showJsonExportModal(json);
  } else {
    fallbackBlobDownload(json, fileName);
    // 显示可复制文本，便于跨设备粘贴导入（电脑端复制 → 手机端粘贴）
    if (typeof showJsonExportModal === 'function') showJsonExportModal(json);
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

// ============ Big Task Cache (archive of completed big tasks) ============
// When a big task reaches 100% it is auto-archived here, keeping the active
// list (BIG_TASK_KEY) to in-progress tasks only. The cache preserves the full
// plan (milestones/subtasks/stages + completedDate) for history & restore.
var BIG_TASK_CACHE_KEY = 'quadrant_big_tasks_cache';
// Names/ids of tasks archived during the most recent saveBigTasks — UI layer
// (bigtask.js renderBigTaskPanel) flushes these into undo toasts.
var _pendingArchiveToasts = [];

function loadBigTasks() {
  try {
    var raw = localStorage.getItem(BIG_TASK_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function loadBigTaskCache() {
  try {
    var raw = localStorage.getItem(BIG_TASK_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveBigTaskCache(arr) {
  try {
    localStorage.setItem(BIG_TASK_CACHE_KEY, JSON.stringify(arr));
  } catch (e) {
    alert('存储空间不足');
  }
  if (typeof CloudSync !== 'undefined' && CloudSync.onDataChanged) {
    CloudSync.onDataChanged();
  }
}

// Persist active big tasks. As a side effect, any task that has reached 100%
// (progress >= 100) and is NOT flagged suppressAutoArchive is automatically
// moved into the big task cache library. Tasks flagged suppressAutoArchive
// (restored from cache) stay visible until their progress drops below 100%,
// at which point the flag is cleared so a future completion re-archives them.
function saveBigTasks(tasks) {
  var active = [];
  var toArchive = [];
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    if ((t.progress || 0) >= 100 && !t.suppressAutoArchive) {
      toArchive.push(t);
    } else {
      if ((t.progress || 0) < 100) t.suppressAutoArchive = false; // genuinely active again
      active.push(t);
    }
  }
  if (toArchive.length > 0) {
    var cache = loadBigTaskCache();
    toArchive.forEach(function(bt) {
      var exists = false;
      for (var k = 0; k < cache.length; k++) { if (cache[k].id === bt.id) { exists = true; break; } }
      if (!exists) {
        var snap = JSON.parse(JSON.stringify(bt));
        delete snap.suppressAutoArchive;
        cache.push(snap);
        _pendingArchiveToasts.push({ id: bt.id, name: bt.name || '未命名' });
      }
    });
    saveBigTaskCache(cache);
  }
  try {
    localStorage.setItem(BIG_TASK_KEY, JSON.stringify(active));
  } catch (e) {
    alert('存储空间不足');
  }
  // 通知云同步（大任务变更也需要自动推送）
  if (typeof CloudSync !== 'undefined' && CloudSync.onDataChanged) {
    CloudSync.onDataChanged();
  }
}

// Move an archived big task back to the active list. Flagged suppressAutoArchive
// so the next saveBigTasks does not immediately re-archive it. Returns true on success.
function restoreBigTaskFromCache(cacheId) {
  var cache = loadBigTaskCache();
  var idx = -1;
  for (var i = 0; i < cache.length; i++) { if (cache[i].id === cacheId) { idx = i; break; } }
  if (idx < 0) return false;
  var bt = cache.splice(idx, 1)[0];
  saveBigTaskCache(cache);
  var tasks = loadBigTasks();
  var dup = false;
  for (var j = 0; j < tasks.length; j++) { if (tasks[j].id === bt.id) { dup = true; break; } }
  if (!dup) {
    bt.suppressAutoArchive = true;
    tasks.push(bt);
    saveBigTasks(tasks);
  }
  return true;
}

// Permanently remove an archived big task from the cache library.
function deleteBigTaskFromCache(cacheId) {
  var cache = loadBigTaskCache().filter(function(c) { return c.id !== cacheId; });
  saveBigTaskCache(cache);
}

// Today's date as a local YYYY-MM-DD string (for recording completion timestamps).
// Uses local time to stay consistent with Util.calcDaysLeft.
function todayLocalDateStr() {
  var d = new Date();
  var mm = d.getMonth() + 1;
  var dd = d.getDate();
  return d.getFullYear() + '-' + (mm < 10 ? '0' + mm : mm) + '-' + (dd < 10 ? '0' + dd : dd);
}

// Count big tasks that are still in progress (progress < 100).
// Completed big tasks no longer occupy an active slot — they don't count toward
// the "现存" (active) total shown in the panel header nor the MAX_BIG_TASKS limit.
function countActiveBigTasks(tasks) {
  var n = 0;
  for (var i = 0; i < tasks.length; i++) {
    if ((tasks[i].progress || 0) < 100) n++;
  }
  return n;
}

// Overdue days for a completed big task: how many days completedDate exceeded targetDate.
// Returns 0 when not completed, missing dates, or finished on/before the target date.
function bigTaskOverdueDays(bt) {
  if (!bt || !bt.completedDate || !bt.targetDate) return 0;
  var comp = new Date(bt.completedDate + 'T00:00:00');
  var tgt = new Date(bt.targetDate + 'T00:00:00');
  var diff = Math.round((comp - tgt) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

function addBigTask(task) {
  var tasks = loadBigTasks();
  if (countActiveBigTasks(tasks) >= MAX_BIG_TASKS) {
    alert('活跃大任务最多 ' + MAX_BIG_TASKS + ' 个，建议不超过 3 个。已完成的大任务不再占用名额，可删除或先完成现有大任务。');
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
  return !!_extractAndCacheBigTaskItem(id, null, null, null);
}

// Recalculate overall progress: equal-weight per subtask (or per stage if staged)
function recalcBigTaskProgress(bigTask) {
  var total = 0, done = 0;
  if (bigTask.milestones) {
    bigTask.milestones.forEach(function(ms) {
      if (ms.tasks) {
        ms.tasks.forEach(function(t) {
          if (t.stages && t.stages.length > 0) {
            t.stages.forEach(function(s) { total++; if (s.completed) done++; });
          } else {
            total++;
            if (t.completed) done++;
          }
        });
      }
    });
  }
  bigTask.progress = total > 0 ? Math.round((done / total) * 100) : 0;
  // Record the completion date when first reaching 100% (for overdue display),
  // and clear it whenever progress drops back below 100%.
  if (bigTask.progress >= 100) {
    if (!bigTask.completedDate) bigTask.completedDate = todayLocalDateStr();
  } else {
    bigTask.completedDate = null;
  }
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
    return { id: generateId(), text: name, completed: false, timeSlot: getDefaultTimeSlot() };
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
              t.stages.push({ id: generateId(), text: text, completed: false, timeSlot: getDefaultTimeSlot() });
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
  // 查找子任务所在的里程碑ID
  var tasks = loadBigTasks();
  var msId = null;
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === bigTaskId && tasks[i].milestones) {
      for (var j = 0; j < tasks[i].milestones.length; j++) {
        if (tasks[i].milestones[j].tasks) {
          for (var k = 0; k < tasks[i].milestones[j].tasks.length; k++) {
            if (tasks[i].milestones[j].tasks[k].id === subtaskId) {
              msId = tasks[i].milestones[j].id;
              break;
            }
          }
          if (msId) break;
        }
      }
      break;
    }
  }
  if (!msId) return;
  _extractAndCacheBigTaskItem(bigTaskId, msId, subtaskId, stageId);
  renderBigTaskPanel();
}

function toggleBigSubtaskHighlight(btId, stId) {
  var tasks = loadBigTasks();
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === btId && tasks[i].milestones) {
      tasks[i].milestones.forEach(function(ms) {
        if (ms.tasks) {
          ms.tasks.forEach(function(t) {
            if (t.id === stId) {
              if (t.highlights && t.highlights.length > 0) { delete t.highlights; }
              else { t.highlights = [{ start: 0, end: (t.text || '').length }]; }
            }
          });
        }
      });
    }
  }
  saveBigTasks(tasks);
  renderBigTaskPanel();
}

function toggleBigSubtaskStageHighlight(btId, stId, stageId) {
  var tasks = loadBigTasks();
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === btId && tasks[i].milestones) {
      tasks[i].milestones.forEach(function(ms) {
        if (ms.tasks) {
          ms.tasks.forEach(function(t) {
            if (t.id === stId && t.stages) {
              t.stages.forEach(function(s) {
                if (s.id === stageId) {
                  if (s.highlights && s.highlights.length > 0) { delete s.highlights; }
                  else { s.highlights = [{ start: 0, end: (s.text || '').length }]; }
                }
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

function importBigSubtaskStageToToday(btId, stId, stageId, stageText) {
  var data = loadDateData(currentDate);
  if (!data['II']) data['II'] = [];
  data['II'].push({
    id: generateId(),
    text: stageText,
    completed: false,
    progress: '100%',
    dueDate: '',
    bigTaskRef: { bigTaskId: btId, subtaskId: stId, stageId: stageId }
  });
  saveDateData(currentDate, data);
  renderAll(currentDate);
}

function editBigSubtaskStageDate(btId, stId, stageId, newDate) {
  var tasks = loadBigTasks();
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === btId && tasks[i].milestones) {
      tasks[i].milestones.forEach(function(ms) {
        if (ms.tasks) {
          ms.tasks.forEach(function(t) {
            if (t.id === stId && t.stages) {
              t.stages.forEach(function(s) {
                if (s.id === stageId) { s.plannedDate = newDate; }
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
  // 通知云同步（计划池变更也需要自动推送）
  if (typeof CloudSync !== 'undefined' && CloudSync.onDataChanged) {
    CloudSync.onDataChanged();
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
  return !!_extractAndCachePlanPoolItem(poolKey, savePlanTasks.bind(null, poolKey), id, null, 'deleted');
}

// Convenience aliases for plan pool cache key lookup
function getPlanPoolCacheKey(poolKey) { return _planPoolToCacheKey(poolKey); }
function restorePlanPoolFromCacheByKey(poolKey, cacheId) {
  var saveFn;
  if (poolKey === FUTURE_TASK_KEY) saveFn = saveFutureTasks;
  else if (poolKey === WEEK_TASK_KEY) saveFn = saveWeekTasks;
  else saveFn = saveMonthTasks;
  return restorePlanPoolFromCache(poolKey, saveFn, cacheId);
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
  var dedupRemoved = false;

  // First pass: build a set of bigTaskRef keys that already exist in non-II quadrants
  // (or in block subtasks).
  var existingRefsOutsideII = {};
  QUADRANT_KEYS.forEach(function(key) {
    if (key === 'II') return;
    var items = data[key] || [];
    items.forEach(function(task) {
      if (task.bigTaskRef) {
        var refKey = task.bigTaskRef.bigTaskId + '::' + task.bigTaskRef.subtaskId;
        existingRefsOutsideII[refKey] = true;
      }
      if (task.blockName !== undefined && task.tasks) {
        task.tasks.forEach(function(st) {
          if (st.bigTaskRef) {
            var rk = st.bigTaskRef.bigTaskId + '::' + st.bigTaskRef.subtaskId;
            existingRefsOutsideII[rk] = true;
          }
        });
      }
    });
  });

  // Second pass: remove stale duplicates in quadrant II that also exist in other quadrants
  if (data['II']) {
    var beforeLen = data['II'].length;
    data['II'] = data['II'].filter(function(task) {
      if (task.blockName !== undefined) {
        if (task.tasks) {
          task.tasks = task.tasks.filter(function(st) {
            if (st.bigTaskRef) {
              var rk = st.bigTaskRef.bigTaskId + '::' + st.bigTaskRef.subtaskId;
              return !existingRefsOutsideII[rk];
            }
            return true;
          });
        }
        return true;
      }
      if (task.bigTaskRef) {
        var rk = task.bigTaskRef.bigTaskId + '::' + task.bigTaskRef.subtaskId;
        if (existingRefsOutsideII[rk]) return false;
      }
      return true;
    });
    if (data['II'].length !== beforeLen) dedupRemoved = true;
  }

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
                var newTask = {
                  id: generateId(),
                  text: t.text,
                  completed: false,
                  progress: '100%',
                  dueDate: '',
                  timeSlot: t.timeSlot || getDefaultTimeSlot(),
                  bigTaskRef: { bigTaskId: bt.id, subtaskId: t.id, milestoneId: ms.id }
                };
                var copiedStages = copyBigSubtaskStages(t);
                if (copiedStages) newTask.stages = copiedStages;
                data['II'].push(newTask);
                migrated++;
              }
            }
          });
        }
      });
    }
  });

  if (migrated > 0 || dedupRemoved) {
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
    // 保留 bigTaskRef，以便 migrate 回象限时仍能关联大任务
    if (taskData.bigTaskRef) ft.bigTaskRef = taskData.bigTaskRef;
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
        var newTask = {
          id: generateId(),
          text: st.text,
          completed: false,
          progress: '100%',
          dueDate: '',
          timeSlot: st.timeSlot || getDefaultTimeSlot()
        };
        // 保留来源信息，确保删除/完成时能关联回大任务
        if (st.bigTaskRef) newTask.bigTaskRef = st.bigTaskRef;
        data[st.targetQuadrant].push(newTask);
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
            return { id: generateId(), text: st.text, completed: false, progress: '100%', timeSlot: st.timeSlot || getDefaultTimeSlot() };
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
        var newTask = {
          id: generateId(),
          text: ft.text,
          completed: false,
          progress: '100%',
          dueDate: '',
          timeSlot: getDefaultTimeSlot()
        };
        // 保留 bigTaskRef，使推迟回池后再迁移时仍能关联大任务
        if (ft.bigTaskRef) newTask.bigTaskRef = ft.bigTaskRef;
        data[ft.targetQuadrant].push(newTask);
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
    var data = raw ? JSON.parse(raw) : { id: '', startDate: '', endDate: '', principles: [] };
    data.priorityProblems = data.priorityProblems || [];
    return data;
  } catch (e) {
    return { id: '', startDate: '', endDate: '', principles: [], priorityProblems: [] };
  }
}

function savePrinciples(data) {
  try { localStorage.setItem(PRINCIPLES_KEY, JSON.stringify(data)); }
  catch (e) { alert('存储空间不足'); }
  // 通知云同步（原则/优先问题变更也需要自动推送）
  if (typeof CloudSync !== 'undefined' && CloudSync.onDataChanged) {
    CloudSync.onDataChanged();
  }
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
  return !!_extractAndCachePrinciple(id, 'principle');
}

function updatePrinciplesDateRange(startDate, endDate) {
  var data = loadPrinciples();
  data.startDate = startDate;
  data.endDate = endDate;
  savePrinciples(data);
}

// ============ Priority Problems Module ============
function addPriorityProblem(text) {
  var data = loadPrinciples();
  if (!data.priorityProblems) data.priorityProblems = [];
  if (data.priorityProblems.length >= 2) { alert('优先问题最多2条，建议1条'); return null; }
  var p = { id: generateId(), text: text };
  data.priorityProblems.push(p);
  savePrinciples(data);
  return p;
}

function updatePriorityProblem(id, text) {
  var data = loadPrinciples();
  if (!data.priorityProblems) return;
  for (var i = 0; i < data.priorityProblems.length; i++) {
    if (data.priorityProblems[i].id === id) { data.priorityProblems[i].text = text; break; }
  }
  savePrinciples(data);
}

function deletePriorityProblem(id) {
  return !!_extractAndCachePrinciple(id, 'priorityProblem');
}

// ============ Stages Collapse State Module ============
var STAGES_COLLAPSE_KEY = 'quadrant_stages_collapsed';

function loadStagesCollapseState() {
  try {
    var raw = localStorage.getItem(STAGES_COLLAPSE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveStagesCollapseState(state) {
  try { localStorage.setItem(STAGES_COLLAPSE_KEY, JSON.stringify(state)); }
  catch (e) { /* silent */ }
}

function setStageCollapsed(id, collapsed) {
  var state = loadStagesCollapseState();
  if (collapsed) {
    state[id] = true;
  } else {
    delete state[id];
  }
  saveStagesCollapseState(state);
}

// ============ 缓存面板折叠状态持久化 ============
var CACHE_TOGGLE_KEY = 'quadrant_cache_toggle_state';

function loadCacheToggleState() {
  try {
    var raw = localStorage.getItem(CACHE_TOGGLE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}

function saveCacheToggleState(state) {
  try { localStorage.setItem(CACHE_TOGGLE_KEY, JSON.stringify(state)); }
  catch (e) { /* silent */ }
}

// 为缓存面板设置折叠切换：默认收起，点击 header 展开/收起并持久化
function setupCacheSectionToggle(sectionId) {
  var section = document.getElementById(sectionId);
  if (!section) return;
  var header = section.querySelector('.bigtask-cache-header, .deleted-cache-header');
  var body = section.querySelector('.bigtask-cache-body, .deleted-cache-body');
  var icon = header ? header.querySelector('.bigtask-cache-toggle-icon, .deleted-cache-toggle-icon') : null;
  if (!header || !body) return;
  // 移除旧监听器（避免重复绑定）
  var newHeader = header.cloneNode(true);
  header.parentNode.replaceChild(newHeader, header);
  header = newHeader;
  body = section.querySelector('.bigtask-cache-body, .deleted-cache-body');
  icon = header.querySelector('.bigtask-cache-toggle-icon, .deleted-cache-toggle-icon');

  var state = loadCacheToggleState();
  var isOpen = !state[sectionId]; // 默认收起
  if (!isOpen) {
    body.style.display = 'none';
    if (icon) icon.textContent = '▶';
  } else {
    body.style.display = '';
    if (icon) icon.textContent = '▼';
  }

  header.addEventListener('click', function() {
    var cur = loadCacheToggleState();
    var nowOpen = body.style.display !== 'none';
    if (nowOpen) {
      body.style.display = 'none';
      if (icon) icon.textContent = '▶';
      cur[sectionId] = true;
    } else {
      body.style.display = '';
      if (icon) icon.textContent = '▼';
      delete cur[sectionId];
    }
    saveCacheToggleState(cur);
  });
}

// 生成缓存条目的 Markdown 风格详情文本（任务/子任务/阶段 含阶段进度、日期等）
function renderCacheDetailMarkdown(entry) {
  var lines = [];
  var data = entry.data || {};
  var typeLabel = { bigtask: '大任务', milestone: '里程碑', subtask: '子任务', stage: '阶段', task: '任务', block: '任务块' }[entry.type] || entry.type;
  var actionLabel = entry.action === 'completed' ? '✅ 已完成' : '🗑️ 已删除';
  lines.push('# ' + (typeLabel || '') + ' · ' + actionLabel);
  lines.push('');

  if (entry.type === 'bigtask') {
    lines.push('- **名称**: ' + (data.name || '未命名'));
    if (data.targetDate) lines.push('- **截止日期**: ' + data.targetDate);
    if (data.completedDate) lines.push('- **完成日期**: ' + data.completedDate);
    if (data.progress !== undefined) lines.push('- **进度**: ' + data.progress + '%');
    if (data.milestones) {
      lines.push('- **里程碑**: ' + data.milestones.length + ' 个');
      data.milestones.forEach(function(ms, i) {
        lines.push('  ' + (i + 1) + '. ' + (ms.name || '未命名') + '（' + (ms.tasks ? ms.tasks.length : 0) + ' 子任务）');
        if (ms.tasks) {
          ms.tasks.forEach(function(t) {
            var status = t.completed ? '✅' : '⬜';
            lines.push('    - ' + status + ' ' + (t.text || ''));
            if (t.stages) {
              t.stages.forEach(function(s) {
                lines.push('      - ' + (s.completed ? '✅' : '⬜') + ' ' + (s.text || ''));
              });
            }
          });
        }
      });
    }
  } else if (entry.type === 'milestone') {
    lines.push('- **名称**: ' + (data.name || '未命名'));
    if (data.tasks) lines.push('- **子任务数**: ' + data.tasks.length);
  } else if (entry.type === 'block') {
    lines.push('- **名称**: ' + (data.blockName || '未命名'));
    if (data.tasks) {
      data.tasks.forEach(function(t) {
        lines.push('  - ' + (t.completed ? '✅' : '⬜') + ' ' + (t.text || ''));
        if (t.stages) {
          t.stages.forEach(function(s) {
            lines.push('    - ' + (s.completed ? '✅' : '⬜') + ' ' + (s.text || ''));
          });
        }
      });
    }
  } else {
    // subtask / stage / task
    lines.push('- **内容**: ' + (data.text || data.name || '未命名'));
    if (data.scheduledDate) lines.push('- **计划日期**: ' + data.scheduledDate);
    if (data.targetQuadrant) {
      var q = QUADRANTS[data.targetQuadrant];
      lines.push('- **目标象限**: ' + (q ? q.icon + ' ' + q.label : data.targetQuadrant));
    }
    if (data.stages) {
      lines.push('- **阶段**:');
      data.stages.forEach(function(s) {
        lines.push('  - ' + (s.completed ? '✅' : '⬜') + ' ' + (s.text || ''));
      });
    }
  }

  var ts = entry.timestamp;
  if (ts) lines.push('\n*' + new Date(ts).toLocaleString('zh-CN') + '*');
  return lines.join('\n');
}

// 监听其他标签页/窗口的 localStorage 变化，自动失效内存缓存
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('storage', function(e) {
    if (e.key === STORAGE_KEY || e.key === STORAGE_BACKUP_KEY) {
      invalidateDataCache();
    }
  });
}
