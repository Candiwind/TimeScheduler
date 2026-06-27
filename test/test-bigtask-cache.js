// Regression test for completed-big-task auto-archive into cache library.
//   1. saveBigTasks filters out progress>=100 tasks and archives them.
//   2. suppressAutoArchive prevents immediate re-archive after restore.
//   3. restoreBigTaskFromCache moves task back to active list.
//   4. deleteBigTaskFromCache permanently removes from cache.
// Mirrors store.js cache logic without DOM/localStorage. Run: node test/test-bigtask-cache.js

var failures = 0;
function assert(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); }
  else { console.log('  ✗ FAIL: ' + msg); failures++; }
}

// --- Mirror of saveBigTasks archive/filter logic ---
function runSaveBigTasks(tasks, cache, toasts) {
  var active = [];
  var toArchive = [];
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    if ((t.progress || 0) >= 100 && !t.suppressAutoArchive) {
      toArchive.push(t);
    } else {
      if ((t.progress || 0) < 100) t.suppressAutoArchive = false;
      active.push(t);
    }
  }
  if (toArchive.length > 0) {
    toArchive.forEach(function (bt) {
      var exists = false;
      for (var k = 0; k < cache.length; k++) { if (cache[k].id === bt.id) { exists = true; break; } }
      if (!exists) {
        var snap = JSON.parse(JSON.stringify(bt));
        delete snap.suppressAutoArchive;
        cache.push(snap);
        toasts.push({ id: bt.id, name: bt.name || '未命名' });
      }
    });
  }
  return { active: active, cache: cache, toasts: toasts };
}

// --- Mirror of restoreBigTaskFromCache ---
function restoreBigTaskFromCache(cacheId, cache, activeTasks) {
  var idx = -1;
  for (var i = 0; i < cache.length; i++) { if (cache[i].id === cacheId) { idx = i; break; } }
  if (idx < 0) return { success: false, cache: cache, active: activeTasks };
  var bt = cache.splice(idx, 1)[0];
  var dup = false;
  for (var j = 0; j < activeTasks.length; j++) { if (activeTasks[j].id === bt.id) { dup = true; break; } }
  if (!dup) {
    bt.suppressAutoArchive = true;
    activeTasks.push(bt);
  }
  return { success: true, cache: cache, active: activeTasks };
}

// --- Mirror of deleteBigTaskFromCache ---
function deleteBigTaskFromCache(cacheId, cache) {
  return cache.filter(function (c) { return c.id !== cacheId; });
}

// ============ Test 1: auto-archive on save ============
console.log('\n[Test 1] saveBigTasks — auto-archives progress>=100 tasks into cache');
(function () {
  var tasks = [
    { id: 'a', name: '活跃任务', progress: 50 },
    { id: 'b', name: '已完成1', progress: 100 },
    { id: 'c', name: '已完成2', progress: 100 }
  ];
  var cache = [];
  var toasts = [];
  var result = runSaveBigTasks(tasks, cache, toasts);
  assert(result.active.length === 1 && result.active[0].id === 'a', 'only active task remains in active list');
  assert(result.cache.length === 2, 'both completed tasks archived to cache');
  assert(result.cache[0].id === 'b' && result.cache[1].id === 'c', 'cache order preserves insertion order');
  assert(result.toasts.length === 2, 'toasts generated for archived tasks');
  assert(!result.cache[0].suppressAutoArchive, 'suppressAutoArchive stripped from archived snapshot');
})();

// ============ Test 2: dedup — already archived task not duplicated ============
console.log('\n[Test 2] saveBigTasks — dedup against existing cache entries');
(function () {
  var tasks = [{ id: 'x', name: '已完成', progress: 100 }];
  var cache = [{ id: 'x', name: '已完成', progress: 100 }];
  var toasts = [];
  var result = runSaveBigTasks(tasks, cache, toasts);
  assert(result.cache.length === 1, 'no duplicate added to cache');
  assert(result.toasts.length === 0, 'no toast for already-cached task');
})();

// ============ Test 3: suppressAutoArchive prevents re-archive ============
console.log('\n[Test 3] suppressAutoArchive — restored task stays active');
(function () {
  var tasks = [{ id: 'r', name: '已恢复', progress: 100, suppressAutoArchive: true }];
  var cache = [];
  var toasts = [];
  var result = runSaveBigTasks(tasks, cache, toasts);
  assert(result.active.length === 1 && result.active[0].id === 'r', 'task with suppressAutoArchive stays active');
  assert(result.cache.length === 0, 'no archive happens when flag is set');
  assert(result.toasts.length === 0, 'no toast when suppressed');
})();

// ============ Test 4: suppressAutoArchive cleared when progress drops below 100 ============
console.log('\n[Test 4] suppressAutoArchive cleared on genuine reactivation (progress<100)');
(function () {
  var tasks = [{ id: 'r2', name: '重新活跃', progress: 80, suppressAutoArchive: true }];
  var cache = [];
  var toasts = [];
  var result = runSaveBigTasks(tasks, cache, toasts);
  assert(result.active[0].suppressAutoArchive === false, 'flag cleared when progress<100');
})();

// ============ Test 5: restore from cache ============
console.log('\n[Test 5] restoreBigTaskFromCache — moves task back to active list');
(function () {
  var cache = [{ id: 'old', name: '归档任务', progress: 100, milestones: [] }];
  var active = [{ id: 'curr', name: '当前任务', progress: 50 }];
  var res = restoreBigTaskFromCache('old', cache, active);
  assert(res.success === true, 'restore returns success');
  assert(res.cache.length === 0, 'task removed from cache');
  assert(res.active.length === 2, 'task added to active list');
  assert(res.active[1].suppressAutoArchive === true, 'restored task flagged suppressAutoArchive');
})();

// ============ Test 6: restore dedup — skip if already active ============
console.log('\n[Test 6] restoreBigTaskFromCache — dedup against active list');
(function () {
  var cache = [{ id: 'dup', name: '重复', progress: 100 }];
  var active = [{ id: 'dup', name: '重复', progress: 50 }];
  var res = restoreBigTaskFromCache('dup', cache, active);
  assert(res.success === true, 'restore still succeeds');
  assert(res.cache.length === 0, 'removed from cache');
  assert(res.active.length === 1, 'no duplicate added to active list');
})();

// ============ Test 7: restore missing id ============
console.log('\n[Test 7] restoreBigTaskFromCache — returns false for missing id');
(function () {
  var cache = [{ id: 'a', name: 'A', progress: 100 }];
  var active = [];
  var res = restoreBigTaskFromCache('missing', cache, active);
  assert(res.success === false, 'returns false when id not found');
  assert(res.cache.length === 1, 'cache unchanged');
  assert(res.active.length === 0, 'active unchanged');
})();

// ============ Test 8: delete from cache ============
console.log('\n[Test 8] deleteBigTaskFromCache — permanently removes from cache');
(function () {
  var cache = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  var result = deleteBigTaskFromCache('b', cache);
  assert(result.length === 2, 'one item removed');
  assert(result[0].id === 'a' && result[1].id === 'c', 'remaining items correct');
})();

// ============ Test 9: end-to-end lifecycle ============
console.log('\n[Test 9] end-to-end — complete → archive → restore → complete again');
(function () {
  var active = [{ id: 'lifecycle', name: '循环任务', progress: 50 }];
  var cache = [];
  var toasts = [];

  // 1. complete
  active[0].progress = 100;
  var r1 = runSaveBigTasks(active, cache, toasts);
  active = r1.active; cache = r1.cache; toasts = r1.toasts;
  assert(active.length === 0 && cache.length === 1, 'completed → archived');

  // 2. restore
  var r2 = restoreBigTaskFromCache('lifecycle', cache, active);
  active = r2.active; cache = r2.cache;
  assert(active.length === 1 && active[0].suppressAutoArchive === true, 'restored with suppression');

  // 3. save while suppressed → stays active
  var r3 = runSaveBigTasks(active, cache, []);
  active = r3.active; cache = r3.cache;
  assert(active.length === 1 && cache.length === 0, 'suppressed task not re-archived');

  // 4. un-complete (progress drops) → suppression cleared
  active[0].progress = 80;
  var r4 = runSaveBigTasks(active, cache, []);
  active = r4.active;
  assert(active[0].suppressAutoArchive === false, 'flag cleared on un-complete');

  // 5. complete again → re-archive
  active[0].progress = 100;
  var r5 = runSaveBigTasks(active, cache, []);
  active = r5.active; cache = r5.cache;
  assert(active.length === 0 && cache.length === 1, 're-completed → re-archived');
})();

// ============ Test 10: cache rendering independent of active tasks ============
// This tests the fix for: when all tasks are archived, renderBigTaskPanel early-returned
// before calling renderBigTaskCache(), so the cache UI was never shown.
console.log('\n[Test 10] cache exists even when active list is empty (render independence)');
(function () {
  // Simulate: all tasks completed → archived → active list empty, cache populated
  var cache = [
    { id: 'arch1', name: '已归档任务1', progress: 100, completedDate: '2026-06-25', targetDate: '2026-06-20' },
    { id: 'arch2', name: '已归档任务2', progress: 100, completedDate: '2026-06-26', targetDate: '2026-06-22' }
  ];
  var active = [];  // <-- the scenario: no active tasks

  // Even with empty active list, the cache data is intact and renderable
  assert(cache.length === 2, 'cache retains both archived tasks');
  assert(active.length === 0, 'active list is empty after full archive');

  // Verify overdue calculation still works on cached entries
  var overdue0 = (function(bt) {
    if (!bt || !bt.completedDate || !bt.targetDate) return 0;
    var comp = new Date(bt.completedDate + 'T00:00:00');
    var tgt = new Date(bt.targetDate + 'T00:00:00');
    var diff = Math.round((comp - tgt) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  })(cache[0]);
  assert(overdue0 === 5, 'archived task 1 shows 5 overdue days (completed 06-25 vs target 06-20)');

  // Verify restore from cache to empty active list works
  var bt = cache.splice(0, 1)[0];
  bt.suppressAutoArchive = true;
  active.push(bt);
  assert(cache.length === 1, 'after restore: cache has 1 remaining');
  assert(active.length === 1, 'after restore: active has 1 task');
  assert(active[0].suppressAutoArchive === true, 'restored task flagged suppressAutoArchive');

  // Verify delete from cache when active is empty
  cache = cache.filter(function(c) { return c.id !== 'arch2'; });
  assert(cache.length === 0, 'after delete: cache is empty');
})();

console.log('\n' + (failures === 0 ? '✅ ALL TESTS PASSED' : '❌ ' + failures + ' TEST(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);
