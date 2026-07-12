// cache-ui.js - Cache management UI (save current, import cache modal)
function setupCacheButtons() {
  document.getElementById('btnCacheSave').addEventListener('click', function() {
    var date = currentDate;
    var data = loadDateData(date);
    // Deep-clone to avoid reference issues
    data = JSON.parse(JSON.stringify(data));
    var hasContent = false;
    QUADRANT_KEYS.forEach(function(key) {
      if (data[key] && data[key].length > 0) hasContent = true;
    });
    if (!hasContent) {
      alert('当前日期没有任务数据');
      return;
    }
    saveDateData(date, data);
    markDateAsCached(date);
    alert('已缓存到日期：' + date + '（可在导入缓存中查看）');
  });

  document.getElementById('btnCacheLoad').addEventListener('click', function() {
    showCacheModal();
  });
}

function showCacheModal() {
  var entries = getCachedDateEntries();
  if (entries.length === 0) {
    alert('没有已缓存的日期，请先在某个日期下添加任务后点击"缓存当前"');
    return;
  }

  // 置顶的排在最前面，然后按日期排序
  entries.sort(function(a, b) {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return a.date.localeCompare(b.date);
  });

  var existing = document.getElementById('cacheModal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = 'cacheModal';
  modal.className = 'modal-overlay';

  var content = document.createElement('div');
  content.className = 'modal-content';
  content.style.maxWidth = '560px';
  content.style.maxHeight = '75vh';
  content.style.overflowY = 'auto';

  var title = document.createElement('h2');
  title.textContent = '导入缓存数据';
  content.appendChild(title);

  var desc = document.createElement('p');
  desc.textContent = '选择日期导入，将合并到当前日期（' + currentDate + '）。双击名称可重命名，已有任务不会被修改或删除：';
  desc.style.color = 'var(--text2)';
  content.appendChild(desc);

  var list = document.createElement('div');
  list.className = 'cache-date-list';

  // 性能关键：一次性加载全量数据，避免每个条目深拷贝整个数据集
  var allData = loadAllData();

  entries.forEach(function(entry) {
    var cacheDate = entry.date;
    var entryId = entry.id;
    var label = entry.label || '';
    var pinned = entry.pinned || false;

    var item = document.createElement('div');
    item.className = 'cache-date-item';
    item.title = '点击合并数据到 ' + currentDate + '，已有任务不变';

    var cacheData = allData[cacheDate] || { I: [], II: [], III: [], IV: [] };

    // 计算四象限任务数量
    var qCounts = { I: 0, II: 0, III: 0, IV: 0 };
    QUADRANT_KEYS.forEach(function(key) {
      var items = cacheData[key] || [];
      items.forEach(function(it) {
        if (it.blockName !== undefined) {
          qCounts[key] += (it.tasks ? it.tasks.length : 0);
        } else {
          qCounts[key] += 1;
        }
      });
    });

    // ============ Row 1: 名称 + 象限数量徽标 ============
    var row1 = document.createElement('div');
    row1.className = 'cache-row1';

    var nameEl = document.createElement('strong');
    nameEl.className = 'cache-entry-label';
    nameEl.textContent = (pinned ? '📌 ' : '') + (label || cacheDate);
    nameEl.title = '双击编辑名称';
    nameEl.addEventListener('dblclick', function(e) {
      e.stopPropagation();
      var newLabel = prompt('输入新名称（留空则显示日期）：', label || '');
      if (newLabel !== null) {
        updateCachedDateLabel(entryId, newLabel);
        showCacheModal();
      }
    });
    row1.appendChild(nameEl);

    // 象限数量徽标
    var badges = document.createElement('span');
    badges.className = 'cache-quad-badges';
    QUADRANT_KEYS.forEach(function(key) {
      var b = document.createElement('span');
      b.className = 'quad-badge';
      if (qCounts[key] > 0) b.classList.add('quad-badge-' + key.toLowerCase());
      b.textContent = QUADRANTS[key].icon + ' ' + qCounts[key];
      badges.appendChild(b);
    });
    row1.appendChild(badges);

    // ============ Row 2: 日期 + 全部操作按钮 ============
    var row2 = document.createElement('div');
    row2.className = 'cache-row2';

    // 日期提示（仅在有自定义名称时显示）
    if (label) {
      var dateHint = document.createElement('small');
      dateHint.className = 'cache-date-hint';
      dateHint.textContent = '📅 ' + cacheDate;
      row2.appendChild(dateHint);
    }

    // 按钮组
    var btns = document.createElement('span');
    btns.className = 'cache-entry-btns';

    // 置顶按钮
    var pinBtn = document.createElement('button');
    pinBtn.className = 'btn btn-sm';
    pinBtn.textContent = pinned ? '📌' : '📍';
    pinBtn.title = pinned ? '取消置顶' : '置顶保护';
    pinBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      toggleCachedDatePin(entryId);
      showCacheModal();
    });
    btns.appendChild(pinBtn);

    // 重命名按钮
    var renameBtn = document.createElement('button');
    renameBtn.className = 'btn btn-sm';
    renameBtn.textContent = '✏️';
    renameBtn.title = '重命名';
    renameBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var newLabel = prompt('输入新名称（留空则显示日期）：', label || '');
      if (newLabel !== null) {
        updateCachedDateLabel(entryId, newLabel);
        showCacheModal();
      }
    });
    btns.appendChild(renameBtn);

    // 导出JSON按钮
    var exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-sm btn-info';
    exportBtn.textContent = '📤';
    exportBtn.title = '导出JSON';
    exportBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var data = getCachedDateData(cacheDate);
      var json = JSON.stringify(data, null, 2);
      var fileName = 'tasks-' + (label || cacheDate) + '.json';
      var blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    });
    btns.appendChild(exportBtn);

    // 删除缓存按钮
    var delBtn = document.createElement('button');
    delBtn.className = 'btn btn-sm btn-cancel';
    delBtn.textContent = '🗑️';
    delBtn.title = '从缓存列表删除（不删除实际数据）';
    delBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (confirm('确定从导入缓存列表中删除 ' + (label || cacheDate) + '？\n（不会删除该日期的实际任务数据，仅移除缓存索引）')) {
        removeCachedDate(entryId);
        showCacheModal();
      }
    });
    btns.appendChild(delBtn);

    // 导入按钮
    var importBtn = document.createElement('button');
    importBtn.className = 'btn btn-sm btn-primary';
    importBtn.textContent = '导入';

    function doImport(e) {
      e.stopPropagation();
      if (cacheDate === currentDate) {
        if (!confirm('源日期与当前日期相同（' + cacheDate + '），是否重新加载？')) return;
      }
      if (!importCachedData(cacheDate, currentDate)) {
        alert('导入失败：无法读取 ' + cacheDate + ' 的数据');
        return;
      }
      modal.remove();
      try {
        renderAll(currentDate);
      } catch (e2) {
        alert('数据已导入但渲染失败：' + e2.message + '\n请刷新页面查看。');
        return;
      }
      alert('已从 ' + (label || cacheDate) + ' 合并数据到 ' + currentDate + '，已有任务保持不变');
    }

    importBtn.addEventListener('click', doImport);
    item.addEventListener('click', doImport);
    btns.appendChild(importBtn);

    // 自动导入开关（仅置顶时显示，内联到按钮行末尾）
    if (pinned) {
      var autoSep = document.createElement('span');
      autoSep.className = 'cache-auto-sep';
      autoSep.textContent = '⏰';
      autoSep.title = '按星期自动导入';
      btns.appendChild(autoSep);

      var autoWorkday = entry.autoWorkday || false;
      var autoSaturday = entry.autoSaturday || false;
      var autoSunday = entry.autoSunday || false;

      function makeAutoBtn(label, field, current) {
        var btn = document.createElement('button');
        btn.className = 'btn btn-sm btn-auto' + (current ? ' btn-primary' : '');
        btn.textContent = label;
        btn.title = current ? '已开启' + label + '自动导入' : '点击开启' + label + '自动导入';
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          setCachedDateAutoImport(entryId, field, !current);
          showCacheModal();
        });
        return btn;
      }

      btns.appendChild(makeAutoBtn('工作日', 'autoWorkday', autoWorkday));
      btns.appendChild(makeAutoBtn('周六', 'autoSaturday', autoSaturday));
      btns.appendChild(makeAutoBtn('周日', 'autoSunday', autoSunday));
    }

    row2.appendChild(btns);

    item.appendChild(row1);
    item.appendChild(row2);
    list.appendChild(item);
  });

  content.appendChild(list);

  var closeBtn = document.createElement('button');
  closeBtn.className = 'btn btn-sm btn-cancel';
  closeBtn.textContent = '关闭';
  closeBtn.style.marginTop = '15px';
  closeBtn.addEventListener('click', function() { modal.remove(); });
  content.appendChild(closeBtn);

  modal.appendChild(content);
  document.body.appendChild(modal);

  modal.addEventListener('click', function(e) {
    if (e.target === modal) modal.remove();
  });
}

function getTaskSummary(data) {
  var parts = [];
  QUADRANT_KEYS.forEach(function(key) {
    var items = data[key] || [];
    var taskCount = 0, blockCount = 0;
    items.forEach(function(item) {
      if (item.blockName !== undefined) {
        blockCount++;
        taskCount += (item.tasks ? item.tasks.length : 0);
      } else {
        taskCount++;
      }
    });
    if (taskCount > 0 || blockCount > 0) {
      parts.push(QUADRANTS[key].icon + ' ' + taskCount + '任务, ' + blockCount + '块');
    }
  });
  return parts.length > 0 ? parts.join(' | ') : '无任务';
}
