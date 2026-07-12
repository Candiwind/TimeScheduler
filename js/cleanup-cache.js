/**
 * cleanup-cache.js — 清理缓存索引，仅保留前3条（置顶优先，然后按日期排序）
 * 一次性脚本：执行后自动移除自身 <script> 标签，不残留。
 */
(function() {
  var DONE_KEY = 'quadrant_cleanup_cache_done';
  if (localStorage.getItem(DONE_KEY)) {
    console.log('[cleanup-cache] 已执行过，跳过。如需重跑：localStorage.removeItem("' + DONE_KEY + '")');
    return;
  }

  var CACHE_KEY = 'quadrant_cached_dates_index';

  try {
    var raw = localStorage.getItem(CACHE_KEY);
    if (!raw) {
      console.log('[cleanup-cache] 缓存索引为空，无需清理');
      localStorage.setItem(DONE_KEY, '1');
      return;
    }

    var entries = JSON.parse(raw);
    if (!Array.isArray(entries) || entries.length <= 3) {
      console.log('[cleanup-cache] 缓存索引仅 ' + (entries.length || 0) + ' 条，无需清理');
      localStorage.setItem(DONE_KEY, '1');
      return;
    }

    console.log('[cleanup-cache] 清理前共 ' + entries.length + ' 条：');
    entries.forEach(function(e, i) {
      console.log('  ' + (i + 1) + '. [' + (e.pinned ? '📌' : ' ') + '] ' + e.date + (e.label ? ' "' + e.label + '"' : ''));
    });

    // 排序：置顶优先，然后按日期
    entries.sort(function(a, b) {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return (a.date || '').localeCompare(b.date || '');
    });

    var keep = entries.slice(0, 3);
    var removed = entries.slice(3);

    localStorage.setItem(CACHE_KEY, JSON.stringify(keep));
    localStorage.setItem(DONE_KEY, '1');

    console.log('[cleanup-cache] ✅ 已清理完成！');
    console.log('[cleanup-cache]   保留 ' + keep.length + ' 条：');
    keep.forEach(function(e, i) {
      console.log('[cleanup-cache]     ' + (i + 1) + '. ' + e.date + (e.label ? ' "' + e.label + '"' : '') + (e.pinned ? ' 📌' : ''));
    });
    console.log('[cleanup-cache]   删除 ' + removed.length + ' 条：');
    removed.forEach(function(e, i) {
      console.log('[cleanup-cache]     - ' + e.date + (e.label ? ' "' + e.label + '"' : ''));
    });

    // 自动移除自身 script 标签
    var scripts = document.querySelectorAll('script[src*="cleanup-cache.js"]');
    for (var s = 0; s < scripts.length; s++) {
      scripts[s].parentNode.removeChild(scripts[s]);
    }
    console.log('[cleanup-cache] 🧹 已自毁，刷新页面后不再执行');
  } catch (e) {
    console.error('[cleanup-cache] 清理失败：' + e.message);
    localStorage.setItem(DONE_KEY, '1');
  }
})();
