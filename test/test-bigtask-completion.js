// Regression test for big-task completion bookkeeping:
//   1. countActiveBigTasks — completed big tasks no longer count toward "现存" / MAX limit.
//   2. bigTaskOverdueDays — days a completed big task overshot its target date.
//   3. recalcBigTaskProgress — stamps completedDate on reaching 100%, clears it on regression.
//   4. manual complete-button update payload — records/clears completedDate in lockstep with progress.
// Mirrors store.js / bigtask.js logic without DOM. Run: node test/test-bigtask-completion.js

// --- Mirror of todayLocalDateStr (injectable fixed "today" for deterministic tests) ---
function makeToday(fixed) { return function () { return fixed; }; }

// --- Mirror of countActiveBigTasks ---
function countActiveBigTasks(tasks) {
  var n = 0;
  for (var i = 0; i < tasks.length; i++) {
    if ((tasks[i].progress || 0) < 100) n++;
  }
  return n;
}

// --- Mirror of bigTaskOverdueDays ---
function bigTaskOverdueDays(bt) {
  if (!bt || !bt.completedDate || !bt.targetDate) return 0;
  var comp = new Date(bt.completedDate + 'T00:00:00');
  var tgt = new Date(bt.targetDate + 'T00:00:00');
  var diff = Math.round((comp - tgt) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

// --- Mirror of recalcBigTaskProgress (with injected today) ---
function recalcBigTaskProgress(bigTask, todayStr) {
  var total = 0, done = 0;
  if (bigTask.milestones) {
    bigTask.milestones.forEach(function (ms) {
      if (ms.tasks) {
        ms.tasks.forEach(function (t) {
          if (t.stages && t.stages.length > 0) {
            t.stages.forEach(function (s) { total++; if (s.completed) done++; });
          } else {
            total++;
            if (t.completed) done++;
          }
        });
      }
    });
  }
  bigTask.progress = total > 0 ? Math.round((done / total) * 100) : 0;
  if (bigTask.progress >= 100) {
    if (!bigTask.completedDate) bigTask.completedDate = todayStr;
  } else {
    bigTask.completedDate = null;
  }
  return bigTask;
}

// --- Mirror of manual complete-button update payload ---
function buildCompleteUpdates(bt, todayStr) {
  var newProgress = (bt && bt.progress >= 100) ? 0 : 100;
  var updates = { progress: newProgress };
  if (newProgress >= 100) {
    if (!bt.completedDate) updates.completedDate = todayStr;
  } else {
    updates.completedDate = null;
  }
  return updates;
}

var failures = 0;
function assert(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); }
  else { console.log('  ✗ FAIL: ' + msg); failures++; }
}

// ============ Test 1: countActiveBigTasks ============
console.log('\n[Test 1] countActiveBigTasks — completed tasks excluded from active count');
(function () {
  var tasks = [
    { id: 'a', progress: 0 },   // active
    { id: 'b', progress: 60 },  // active
    { id: 'c', progress: 100 }, // completed
    { id: 'd', progress: 100 }  // completed
  ];
  assert(countActiveBigTasks(tasks) === 2, '4 tasks (2 active, 2 completed) → 2 active');
  assert(countActiveBigTasks([]) === 0, 'empty list → 0');
  assert(countActiveBigTasks([{ id: 'x', progress: 100 }]) === 0, 'single completed → 0');
  assert(countActiveBigTasks([{ id: 'y' }]) === 1, 'task with no progress field treated as 0 → active');
})();

// ============ Test 2: bigTaskOverdueDays ============
console.log('\n[Test 2] bigTaskOverdueDays — days over target');
(function () {
  assert(bigTaskOverdueDays({ targetDate: '2026-06-01', completedDate: '2026-06-04' }) === 3, '3 days late → 3');
  assert(bigTaskOverdueDays({ targetDate: '2026-06-10', completedDate: '2026-06-10' }) === 0, 'on target → 0');
  assert(bigTaskOverdueDays({ targetDate: '2026-06-10', completedDate: '2026-06-05' }) === 0, 'finished early → 0');
  assert(bigTaskOverdueDays({ targetDate: '2026-06-10' }) === 0, 'no completedDate (incomplete) → 0');
  assert(bigTaskOverdueDays({ completedDate: '2026-06-05' }) === 0, 'no targetDate → 0');
  assert(bigTaskOverdueDays({}) === 0, 'no dates → 0');
})();

// ============ Test 3: recalcBigTaskProgress stamps completedDate ============
console.log('\n[Test 3] recalc — completedDate stamped at 100%, cleared on regression');
(function () {
  var today = makeToday('2026-06-27');
  // All subtasks done → 100%
  var bt1 = { milestones: [{ tasks: [{ completed: true }, { completed: true }] }] };
  recalcBigTaskProgress(bt1, today());
  assert(bt1.progress === 100, 'all done → progress 100');
  assert(bt1.completedDate === '2026-06-27', 'completedDate stamped when reaching 100%');

  // One subtask incomplete → drops below 100%, completedDate cleared
  bt1.milestones[0].tasks[0].completed = false;
  recalcBigTaskProgress(bt1, today());
  assert(bt1.progress === 50, 'one undone → 50%');
  assert(bt1.completedDate === null, 'completedDate cleared after dropping below 100%');

  // Re-completing records a fresh date
  bt1.milestones[0].tasks[0].completed = true;
  var today2 = makeToday('2026-06-30');
  recalcBigTaskProgress(bt1, today2());
  assert(bt1.completedDate === '2026-06-30', 're-completion records new date (not stale)');

  // Stages counted individually
  var bt2 = { milestones: [{ tasks: [{ stages: [{ completed: true }, { completed: false }] }] }] };
  recalcBigTaskProgress(bt2, today());
  assert(bt2.progress === 50, '1 of 2 stages done → 50%');
  assert(bt2.completedDate === null, 'partial stages → no completedDate');
})();

// ============ Test 4: recalc does not overwrite an existing completedDate ============
console.log('\n[Test 4] recalc — preserves original completedDate on subsequent recalc');
(function () {
  var today = makeToday('2026-06-27');
  var bt = { milestones: [{ tasks: [{ completed: true }] }], completedDate: '2026-06-20' };
  recalcBigTaskProgress(bt, today());
  assert(bt.completedDate === '2026-06-20', 'existing completedDate kept (not overwritten with today)');
})();

// ============ Test 5: manual complete-button update payload ============
console.log('\n[Test 5] complete-button — update payload records/clears completedDate with progress');
(function () {
  var today = makeToday('2026-06-27');
  // Incomplete task → mark complete
  var updates1 = buildCompleteUpdates({ progress: 40 }, today());
  assert(updates1.progress === 100, 'incomplete → progress 100');
  assert(updates1.completedDate === '2026-06-27', 'records completedDate on first completion');

  // Already completedDate stamped, re-clicking complete (still 100) keeps it
  var updates2 = buildCompleteUpdates({ progress: 100, completedDate: '2026-06-20' }, today());
  assert(updates2.progress === 0, 'completed → toggles back to 0');
  assert(updates2.completedDate === null, 'clears completedDate when un-completing');

  // Re-completing after clear stamps a fresh date
  var updates3 = buildCompleteUpdates({ progress: 0, completedDate: null }, today());
  assert(updates3.progress === 100, 're-complete → progress 100');
  assert(updates3.completedDate === '2026-06-27', 're-completion stamps fresh date');
})();

// ============ Test 6: MAX-limit semantics — completing frees a slot ============
console.log('\n[Test 6] MAX limit counts only active tasks (completing frees a slot)');
(function () {
  var MAX_BIG_TASKS = 5;
  // 5 total, 3 completed → only 2 active → under limit, can add
  var tasks = [
    { id: 'a', progress: 10 },
    { id: 'b', progress: 20 },
    { id: 'c', progress: 100 },
    { id: 'd', progress: 100 },
    { id: 'e', progress: 100 }
  ];
  assert(countActiveBigTasks(tasks) < MAX_BIG_TASKS, '5 total / 2 active → below MAX, slot freed');
  // 5 total, all active → at limit, cannot add
  var allActive = [{ progress: 10 }, { progress: 20 }, { progress: 30 }, { progress: 40 }, { progress: 50 }];
  assert(countActiveBigTasks(allActive) >= MAX_BIG_TASKS, '5 active → at MAX, blocked from adding');
})();

console.log('\n' + (failures === 0 ? '✅ ALL TESTS PASSED' : '❌ ' + failures + ' TEST(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);
