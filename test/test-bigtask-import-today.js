// Regression test for big-task card-level "一键导入今日任务池":
//   planBigTaskTodayImport — 计算某大任务"今日任务池"的导入计划（去重 + 限定单个大任务）。
// 这是 CLAUDE.md 标注的"高频回归区"：大任务子任务的迁移必须去重，否则重复导入/残留。
// 本测试镜像 future.js 的 planBigTaskTodayImport 纯函数逻辑。Run: node test/test-bigtask-import-today.js

var QUADRANT_KEYS = ['I', 'II', 'III', 'IV'];

// --- 镜像 future.js 的 planBigTaskTodayImport ---
function planBigTaskTodayImport(bt, dateData, btId, date) {
  var poolItems = [];
  if (bt && bt.milestones) {
    bt.milestones.forEach(function (ms) {
      if (ms.tasks) ms.tasks.forEach(function (t) {
        if (t.plannedDate === date && !t.completed) poolItems.push({ t: t, ms: ms });
      });
    });
  }
  var toImport = [];
  var alreadyCount = 0;
  poolItems.forEach(function (it) {
    var alreadyImported = false;
    QUADRANT_KEYS.forEach(function (key) {
      (dateData[key] || []).forEach(function (task) {
        if (task.bigTaskRef && task.bigTaskRef.bigTaskId === btId && task.bigTaskRef.subtaskId === it.t.id) {
          alreadyImported = true;
        }
        if (task.blockName !== undefined && task.tasks) {
          task.tasks.forEach(function (st) {
            if (st.bigTaskRef && st.bigTaskRef.bigTaskId === btId && st.bigTaskRef.subtaskId === it.t.id) {
              alreadyImported = true;
            }
          });
        }
      });
    });
    if (alreadyImported) alreadyCount++;
    else toImport.push(it);
  });
  return { poolCount: poolItems.length, toImport: toImport, alreadyCount: alreadyCount };
}

var failures = 0;
function assert(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); }
  else { console.log('  ✗ FAIL: ' + msg); failures++; }
}

var DATE = '2026-07-11';

// 构造一个大任务：ms1 有 3 个子任务（今天/明天/今天已完成），ms2 有 1 个今天的
function makeBigTask() {
  return {
    id: 'bt_1',
    milestones: [
      { id: 'ms_1', tasks: [
        { id: 'st_a', text: '今天A', plannedDate: DATE, completed: false },                 // 今日池
        { id: 'st_b', text: '明天B', plannedDate: '2026-07-12', completed: false },          // 非今日
        { id: 'st_c', text: '今天C已完成', plannedDate: DATE, completed: true }               // 今日但已完成
      ] },
      { id: 'ms_2', tasks: [
        { id: 'st_d', text: '今天D', plannedDate: DATE, completed: false }                   // 今日池
      ] }
    ]
  };
}

// ============ Test 1: 空数据 → 今日池 2 条全部待导入 ============
console.log('\n[Test 1] 空今日数据 → 今日任务池 2 条全部待导入（排除非今日与已完成）');
(function () {
  var bt = makeBigTask();
  var data = { I: [], II: [], III: [], IV: [] };
  var plan = planBigTaskTodayImport(bt, data, 'bt_1', DATE);
  assert(plan.poolCount === 2, '今日池子任务数 = 2（st_a + st_d），排除明天/已完成');
  assert(plan.toImport.length === 2, '待导入 2 条');
  assert(plan.alreadyCount === 0, '无已导入');
  var ids = plan.toImport.map(function (it) { return it.t.id; }).sort();
  assert(ids.join(',') === 'st_a,st_d', '待导入恰为 st_a 与 st_d');
})();

// ============ Test 2: Q-II 已存在一条 → 去重，只导入剩下一条 ============
console.log('\n[Test 2] Q-II 已导入 st_a → 去重，仅 st_d 待导入');
(function () {
  var bt = makeBigTask();
  var data = {
    I: [], III: [], IV: [],
    II: [{ id: 'q1', text: '今天A', bigTaskRef: { bigTaskId: 'bt_1', subtaskId: 'st_a', milestoneId: 'ms_1' } }]
  };
  var plan = planBigTaskTodayImport(bt, data, 'bt_1', DATE);
  assert(plan.poolCount === 2, '今日池仍 2 条');
  assert(plan.toImport.length === 1, '待导入 1 条（st_a 已在 Q-II）');
  assert(plan.toImport[0].t.id === 'st_d', '唯一待导入 = st_d');
  assert(plan.alreadyCount === 1, '已导入计数 = 1');
})();

// ============ Test 3: 已导入到其他象限（I/III/IV）也算已导入 ============
console.log('\n[Test 3] 已导入到 Q-III → 同样去重');
(function () {
  var bt = makeBigTask();
  var data = {
    I: [], II: [], IV: [],
    III: [{ id: 'q1', text: '今天D', bigTaskRef: { bigTaskId: 'bt_1', subtaskId: 'st_d' } }]
  };
  var plan = planBigTaskTodayImport(bt, data, 'bt_1', DATE);
  assert(plan.toImport.length === 1 && plan.toImport[0].t.id === 'st_a', 'st_d 在 Q-III，仅 st_a 待导入');
  assert(plan.alreadyCount === 1, '已导入计数 = 1');
})();

// ============ Test 4: 已作为"块子任务"导入 → 去重（blockName + tasks） ============
console.log('\n[Test 4] 已导入为块内子任务 → 去重');
(function () {
  var bt = makeBigTask();
  var data = {
    I: [], III: [], IV: [],
    II: [{ id: 'blk1', blockName: '块', tasks: [
      { id: 'sub1', text: '今天A', bigTaskRef: { bigTaskId: 'bt_1', subtaskId: 'st_a' } }
    ] }]
  };
  var plan = planBigTaskTodayImport(bt, data, 'bt_1', DATE);
  assert(plan.toImport.length === 1 && plan.toImport[0].t.id === 'st_d', 'st_a 在块内，仅 st_d 待导入');
  assert(plan.alreadyCount === 1, '已导入计数 = 1');
})();

// ============ Test 5: 不同 bigTaskId 的同名引用不算去重 ============
console.log('\n[Test 5] 其它大任务的引用不算重复（bigTaskId 必须匹配）');
(function () {
  var bt = makeBigTask();
  var data = {
    I: [], III: [], IV: [],
    II: [{ id: 'q1', text: '今天A', bigTaskRef: { bigTaskId: 'bt_OTHER', subtaskId: 'st_a' } }]
  };
  var plan = planBigTaskTodayImport(bt, data, 'bt_1', DATE);
  assert(plan.toImport.length === 2, 'bt_OTHER 的引用不影响 bt_1，仍 2 条待导入');
  assert(plan.alreadyCount === 0, '已导入计数 = 0');
})();

// ============ Test 6: 无里程碑 / 空池 → poolCount 0 ============
console.log('\n[Test 6] 无今日池子任务 → poolCount=0，按钮不出现');
(function () {
  var data = { I: [], II: [], III: [], IV: [] };
  assert(planBigTaskTodayImport({ id: 'bt_1' }, data, 'bt_1', DATE).poolCount === 0, '无 milestones → 0');
  assert(planBigTaskTodayImport(null, data, 'bt_1', DATE).poolCount === 0, 'bt=null → 0');
  var btEmpty = { id: 'bt_1', milestones: [{ id: 'ms', tasks: [
    { id: 'x', plannedDate: '2026-07-12', completed: false } // 只有明天的
  ] }] };
  assert(planBigTaskTodayImport(btEmpty, data, 'bt_1', DATE).poolCount === 0, '只有非今日子任务 → 0');
})();

console.log('\n' + (failures === 0 ? '✅ ALL TESTS PASSED' : '❌ ' + failures + ' TEST(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);
