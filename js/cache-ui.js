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

  entries.forEach(function(entry) {
    var cacheDate = entry.date;
    var label = entry.label || '';

    var item = document.createElement('div');
    item.className = 'cache-date-item';
    item.title = '点击合并数据到 ' + currentDate + '，已有任务不变';

    var info = document.createElement('div');
    info.className = 'cache-date-info';
    var cacheData = getCachedDateData(cacheDate);
    var summary = getTaskSummary(cacheData);

    // 可编辑名称标签
    var nameEl = document.createElement('strong');
    nameEl.className = 'cache-entry-label';
    nameEl.textContent = label || cacheDate;
    nameEl.title = '双击编辑名称';
    nameEl.style.cursor = 'text';
    nameEl.addEventListener('dblclick', function(e) {
      e.stopPropagation();
      var newLabel = prompt('输入新名称（留空则显示日期）：', label || '');
      if (newLabel !== null) {
        updateCachedDateLabel(cacheDate, newLabel);
        showCacheModal(); // 刷新模态框
      }
    });

    var dateLine = document.createElement('small');
    dateLine.textContent = (label ? '📅 ' + cacheDate + ' · ' : '') + summary;

    info.appendChild(nameEl);
    info.appendChild(document.createElement('br'));
    info.appendChild(dateLine);

    // 按钮行
    var btns = document.createElement('div');
    btns.className = 'cache-entry-btns';
    btns.style.marginTop = '4px';

    // 重命名按钮
    var renameBtn = document.createElement('button');
    renameBtn.className = 'btn btn-sm';
    renameBtn.textContent = '✏️';
    renameBtn.title = '重命名';
    renameBtn.style.marginRight = '4px';
    renameBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var newLabel = prompt('输入新名称（留空则显示日期）：', label || '');
      if (newLabel !== null) {
        updateCachedDateLabel(cacheDate, newLabel);
        showCacheModal();
      }
    });

    // 导出JSON按钮
    var exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-sm btn-info';
    exportBtn.textContent = '📤';
    exportBtn.title = '导出该日期数据为 JSON';
    exportBtn.style.marginRight = '4px';
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
      alert('已从 ' + (label || cacheDate) + ' 合并数据到 ' + currentDate + '（' + summary + '），已有任务保持不变');
    }

    importBtn.addEventListener('click', doImport);
    item.addEventListener('click', doImport);

    btns.appendChild(renameBtn);
    btns.appendChild(exportBtn);
    btns.appendChild(importBtn);
    item.appendChild(info);
    item.appendChild(btns);
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
