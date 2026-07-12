/**
 * recover-today.js — 今天(2026-07-12)数据自动恢复
 *
 * 多层级恢复策略：
 *   1. 主数据 quadrant_task_data
 *   2. 滚动备份 _backup / _backup_1 / _backup_2 / _backup_3
 *   3. 缓存日期索引 quad​rant_cached_dates_index
 *   4. GitHub Gist 云端拉取（公开 Gist，无需 Token）
 *
 * 找到后自动恢复到主数据，刷新页面即可看到。
 */

(function() {
  var TODAY = '2026-07-12';
  var STORAGE_KEY = 'quadrant_task_data';
  var BACKUP_KEY = 'quadrant_task_data_backup';
  var CACHE_INDEX_KEY = 'quadrant_cached_dates_index';
  var GIST_ID = '0c951f69146c93193030830b224ced4c';

  // 防止重复执行
  var DONE_KEY = 'quadrant_recovery_done_' + TODAY;
  if (localStorage.getItem(DONE_KEY)) {
    console.log('[recover-today] 今天已尝试过恢复，跳过（清除标记: localStorage.removeItem("' + DONE_KEY + '")）');
    return;
  }

  // 安全读 localStorage
  function safeGet(key) {
    try { return localStorage.getItem(key); } catch(e) { return null; }
  }
  function safeSet(key, val) {
    try { localStorage.setItem(key, val); return true; } catch(e) { return false; }
  }
  function safeParse(raw) {
    try { return JSON.parse(raw); } catch(e) { return null; }
  }

  // 检查某个数据对象中是否有今天的非空数据
  function hasTodayData(obj) {
    if (!obj || !obj[TODAY]) return false;
    var d = obj[TODAY];
    var total = 0;
    ['I','II','III','IV'].forEach(function(k) {
      if (Array.isArray(d[k])) total += d[k].length;
    });
    return total > 0;
  }

  function describeData(obj) {
    if (!obj || !obj[TODAY]) return '无数据';
    var d = obj[TODAY];
    var parts = [];
    ['I','II','III','IV'].forEach(function(k) {
      if (Array.isArray(d[k]) && d[k].length > 0) {
        parts.push(k + ':' + d[k].length + '项');
      }
    });
    return parts.length > 0 ? parts.join(', ') : '空';
  }

  var found = null;
  var source = '';
  var details = '';

  // ==== 1. 主数据 ====
  var mainRaw = safeGet(STORAGE_KEY);
  var mainObj = safeParse(mainRaw);
  if (hasTodayData(mainObj)) {
    console.log('[recover-today] ✅ 主数据中已有今天数据，无需恢复');
    console.log('[recover-today]   ' + describeData(mainObj));
    safeSet(DONE_KEY, Date.now().toString());
    return;
  }
  console.log('[recover-today] 🔍 主数据中没有今天的数据，开始搜索备份...');

  // ==== 2. 滚动备份（从新到旧） ====
  var backupKeys = [BACKUP_KEY, BACKUP_KEY + '_1', BACKUP_KEY + '_2', BACKUP_KEY + '_3'];
  for (var i = 0; i < backupKeys.length; i++) {
    var bRaw = safeGet(backupKeys[i]);
    if (!bRaw) { console.log('[recover-today]   ' + backupKeys[i] + ': 不存在'); continue; }
    var bObj = safeParse(bRaw);
    if (hasTodayData(bObj)) {
      found = bObj[TODAY];
      source = backupKeys[i];
      details = describeData(bObj);
      console.log('[recover-today]   ' + backupKeys[i] + ': ✅ 找到! ' + details);
      break;
    } else {
      console.log('[recover-today]   ' + backupKeys[i] + ': ' + describeData(bObj));
    }
  }

  // ==== 3. 缓存日期索引 ====
  if (!found) {
    console.log('[recover-today] 🔍 备份中未找到，检查缓存日期索引...');
    var idxRaw = safeGet(CACHE_INDEX_KEY);
    if (idxRaw) {
      var entries = safeParse(idxRaw);
      if (Array.isArray(entries)) {
        for (var j = 0; j < entries.length; j++) {
          if (entries[j].date === TODAY) {
            console.log('[recover-today]   缓存索引中有今天条目: id=' + entries[j].id + ' label=' + (entries[j].label || '无'));
            for (var k = 0; k < backupKeys.length; k++) {
              var bRaw2 = safeGet(backupKeys[k]);
              if (!bRaw2) continue;
              var bObj2 = safeParse(bRaw2);
              if (hasTodayData(bObj2)) {
                found = bObj2[TODAY];
                source = '缓存索引 -> ' + backupKeys[k];
                details = describeData(bObj2);
                console.log('[recover-today]   ✅ 在' + backupKeys[k] + '中找到! ' + details);
                break;
              }
            }
            break;
          }
        }
      }
    }
    if (!found) {
      console.log('[recover-today]   缓存索引中无今天条目');
    }
  }

  // ==== 4. 本地恢复成功 ====
  if (found) {
    restoreData(found, source, details, mainObj);
    return;
  }

  // ==== 5. GitHub Gist 云端拉取 ====
  console.log('[recover-today] ☁️ 本地未找到，尝试从 GitHub Gist 拉取...');
  console.log('[recover-today]   Gist ID: ' + GIST_ID);

  fetch('https://api.github.com/gists/' + GIST_ID, {
    cache: 'no-cache',
    headers: { 'Accept': 'application/vnd.github.v3+json' }
  })
  .then(function(response) {
    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }
    return response.json();
  })
  .then(function(gistData) {
    var files = gistData.files;
    if (!files || !files['quadrant_tasks_backup.json']) {
      throw new Error('Gist 中没有 quadrant_tasks_backup.json 文件');
    }

    var content = files['quadrant_tasks_backup.json'].content;
    if (!content) {
      throw new Error('Gist 文件内容为空（可能是 truncated 的大文件）');
    }

    var gistObj = safeParse(content);
    if (!gistObj) {
      throw new Error('Gist 数据 JSON 解析失败');
    }

    // Gist 中的数据结构：{ _version, dateData: { "2026-07-12": {...} }, bigTasks, ... }
    var dateData = gistObj.dateData || gistObj;
    if (hasTodayData(dateData)) {
      found = dateData[TODAY];
      source = 'GitHub Gist (云端)';
      details = describeData(dateData);
      console.log('[recover-today]   ✅ 从 Gist 找到! ' + details);
      restoreData(found, source, details, mainObj || {});
    } else {
      console.log('[recover-today]   ❌ Gist 数据中没有今天的条目');
      // 列出 Gist 中的可用日期
      var gistDates = Object.keys(dateData).filter(function(d) {
        return /^\d{4}-\d{2}-\d{2}$/.test(d);
      }).sort();
      console.log('[recover-today]   Gist 中可用日期:', gistDates.length > 0 ? gistDates.join(', ') : '无');

      // 最后尝试：本地 recovery JSON 文件
      tryLocalRecoveryFile(mainObj);
    }
  })
  .catch(function(err) {
    console.error('[recover-today]   Gist 拉取失败: ' + err.message);
    // 尝试本地 recovery JSON
    tryLocalRecoveryFile(mainObj);
  });

  // ==== 恢复函数 ====
  function restoreData(data, src, desc, existingObj) {
    console.log('[recover-today] 🔧 正在恢复数据...');
    var all = existingObj || {};
    all[TODAY] = data;

    var json = JSON.stringify(all);
    if (safeSet(STORAGE_KEY, json)) {
      console.log('[recover-today] ✅✅ 数据已恢复到 ' + STORAGE_KEY + '!');
      console.log('[recover-today]   来源: ' + src);
      console.log('[recover-today]   内容: ' + desc);
      console.log('[recover-today]   🔄 3秒后自动刷新页面...');
      safeSet(DONE_KEY, Date.now().toString());

      // 延迟刷新，让用户看到日志
      setTimeout(function() {
        window.location.reload();
      }, 3000);
    } else {
      console.error('[recover-today] ❌ 写入 localStorage 失败（可能配额满）');
    }
  }

  // ==== 本地 recovery JSON 文件兜底 ====
  function tryLocalRecoveryFile(existingObj) {
    console.log('[recover-today] 📁 尝试本地 recovery JSON...');
    fetch('recovery-2026-07-12.json')
      .then(function(response) {
        if (!response.ok) throw new Error('本地文件不存在');
        return response.json();
      })
      .then(function(recoveryObj) {
        if (hasTodayData(recoveryObj)) {
          found = recoveryObj[TODAY];
          source = '本地Recovery文件';
          details = describeData(recoveryObj);
          console.log('[recover-today]   ✅ 从本地文件找到! ' + details);
          restoreData(found, source, details, existingObj);
        } else {
          noDataFound(existingObj);
        }
      })
      .catch(function() {
        noDataFound(existingObj);
      });
  }

  function noDataFound(existingObj) {
    console.log('[recover-today] ❌ 所有来源均未找到今天(' + TODAY + ')的数据');

    // 列出主数据中的可用日期
    if (existingObj) {
      var dates = Object.keys(existingObj).filter(function(d) {
        return /^\d{4}-\d{2}-\d{2}$/.test(d);
      }).sort();
      console.log('[recover-today]   主数据中可用日期:', dates.length > 0 ? dates.join(', ') : '无');
    }

    // 列出最新备份中的可用日期
    var latestBackupRaw = safeGet(BACKUP_KEY);
    if (latestBackupRaw) {
      var lbObj = safeParse(latestBackupRaw);
      if (lbObj) {
        var bDates = Object.keys(lbObj).filter(function(d) {
          return /^\d{4}-\d{2}-\d{2}$/.test(d);
        }).sort();
        console.log('[recover-today]   最新备份中可用日期:', bDates.length > 0 ? bDates.join(', ') : '无');
      }
    }

    console.log('[recover-today] 💡 手动恢复: 使用"📥 导入JSON"加载 recovery-2026-07-12.json');

    safeSet(DONE_KEY, Date.now().toString());
  }
})();
