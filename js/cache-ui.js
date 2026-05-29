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
    alert('已缓存到日期：' + date + '（可在导入缓存中查看）');
  });

  document.getElementById('btnCacheLoad').addEventListener('click', function() {
    showCacheModal();
  });
}

function showCacheModal() {
  var dates = getAllCachedDates();
  if (dates.length === 0) {
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
  content.style.maxWidth = '500px';
  content.style.maxHeight = '70vh';
  content.style.overflowY = 'auto';

  var title = document.createElement('h2');
  title.textContent = '导入缓存数据';
  content.appendChild(title);

  var desc = document.createElement('p');
  desc.textContent = '选择日期导入，将合并到当前日期（' + currentDate + '），已有任务不会被修改或删除：';
  desc.style.color = 'var(--text2)';
  content.appendChild(desc);

  var list = document.createElement('div');
  list.className = 'cache-date-list';

  dates.forEach(function(cacheDate) {
    var item = document.createElement('div');
    item.className = 'cache-date-item';
    item.style.cursor = 'pointer';
    item.title = '点击合并 ' + cacheDate + ' 的数据到 ' + currentDate + '，已有任务不变';

    var info = document.createElement('div');
    info.className = 'cache-date-info';
    var cacheData = getCachedDateData(cacheDate);
    var summary = getTaskSummary(cacheData);
    info.innerHTML = '<strong>' + cacheDate + '</strong><br><small>' + summary + '</small>';

    var btn = document.createElement('button');
    btn.className = 'btn btn-sm btn-primary';
    btn.textContent = '导入';

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
      } catch (e) {
        alert('数据已导入但渲染失败：' + e.message + '\n请刷新页面查看。');
        return;
      }
      alert('已从 ' + cacheDate + ' 合并数据到 ' + currentDate + '（' + summary + '），已有任务保持不变');
    }

    btn.addEventListener('click', doImport);
    item.addEventListener('click', doImport);

    item.appendChild(info);
    item.appendChild(btn);
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
