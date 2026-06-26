// Regression test for time-view per-slot GROUPING & NESTING (buildSlotUnits + appendUnit logic).
// Verifies membership is visually unambiguous: each parent header stays grouped with its own
// in-slot children; subtask-stages nest under their subtask when present, else get an orphan label.
// Mirrors render.js logic without DOM. Run: node test/test-timeview-grouping.js

var SLOT_ORDER = ['early_morn', 'forenoon', 'noon', 'afternoon', 'dusk', 'night'];
var quadOrder = { I: 0, II: 1, III: 2, IV: 3 };
function getDefaultTimeSlot() { return 'forenoon'; }

function getCompleted(entry) {
  if (entry._childType) {
    if (entry._stageData) return entry._stageData.completed;
    if (entry._subtaskData) return entry._subtaskData.completed;
  }
  return entry.item.completed;
}

// --- Mirror of buildSlotUnits ---
function buildSlotUnits(group) {
  var parentHeaders = {};
  var standalones = [];
  var childrenByParent = {};
  group.forEach(function (entry) {
    var pk = entry.quadrantKey + '::' + entry.item.id;
    if (entry._compactParent) {
      parentHeaders[pk] = entry;
    } else if (entry._childType) {
      if (!childrenByParent[pk]) childrenByParent[pk] = { subtasks: [], stages: [], subtaskStages: [] };
      if (entry._childType === 'subtask') childrenByParent[pk].subtasks.push(entry);
      else if (entry._childType === 'stage') childrenByParent[pk].stages.push(entry);
      else if (entry._childType === 'subtask-stage') childrenByParent[pk].subtaskStages.push(entry);
    } else {
      standalones.push(entry);
    }
  });
  var units = [];
  Object.keys(parentHeaders).forEach(function (pk) {
    var cp = parentHeaders[pk];
    var ch = childrenByParent[pk] || { subtasks: [], stages: [], subtaskStages: [] };
    var allKids = ch.subtasks.concat(ch.stages).concat(ch.subtaskStages);
    var done = allKids.length > 0 && allKids.every(function (e) { return getCompleted(e); });
    units.push({ kind: 'parent', quadrantKey: cp.quadrantKey, cp: cp, children: ch, done: done });
  });
  standalones.forEach(function (entry) {
    units.push({ kind: 'standalone', quadrantKey: entry.quadrantKey, entry: entry, done: getCompleted(entry) });
  });
  units.sort(function (a, b) {
    var qa = quadOrder[a.quadrantKey] !== undefined ? quadOrder[a.quadrantKey] : 99;
    var qb = quadOrder[b.quadrantKey] !== undefined ? quadOrder[b.quadrantKey] : 99;
    if (qa !== qb) return qa - qb;
    return (a.done ? 1 : 0) - (b.done ? 1 : 0);
  });
  return units;
}

// --- Mirror of appendUnit: emit a flat "render plan" of labeled rows ---
// Each row: { indent: 0|1|2, type: 'header'|'subtask'|'stage'|'orphan-label'|'standalone', name, parentId, subId? }
function renderPlan(units) {
  var rows = [];
  units.forEach(function (unit) {
    if (unit.kind === 'standalone') {
      rows.push({ indent: 0, type: 'standalone', name: unit.entry.item.text || unit.entry.item.blockName });
      return;
    }
    var cp = unit.cp;
    var ch = unit.children;
    var isBlock = cp.item.blockName !== undefined;
    rows.push({ indent: 0, type: 'header', name: cp.item.blockName || cp.item.text, parentId: cp.item.id });
    if (isBlock) {
      var subtaskPresent = {};
      ch.subtasks.forEach(function (e) { subtaskPresent[e._subtaskData.id] = e; });
      var stagesBySubtask = {};
      ch.subtaskStages.forEach(function (e) {
        var sid = e._subtaskData.id;
        if (!stagesBySubtask[sid]) stagesBySubtask[sid] = [];
        stagesBySubtask[sid].push(e);
      });
      ch.subtasks.forEach(function (se) {
        rows.push({ indent: 1, type: 'subtask', name: se._subtaskData.text, parentId: cp.item.id, subId: se._subtaskData.id });
        var sid = se._subtaskData.id;
        (stagesBySubtask[sid] || []).forEach(function (sse) {
          rows.push({ indent: 2, type: 'stage', name: sse._stageData.text, parentId: cp.item.id, subId: sid, stageId: sse._stageData.id });
        });
      });
      Object.keys(stagesBySubtask).forEach(function (sid) {
        if (subtaskPresent[sid]) return;
        rows.push({ indent: 1, type: 'orphan-label', name: stagesBySubtask[sid][0]._subtaskData.text, parentId: cp.item.id, subId: sid });
        stagesBySubtask[sid].forEach(function (sse) {
          rows.push({ indent: 1, type: 'stage', name: sse._stageData.text, parentId: cp.item.id, subId: sid, stageId: sse._stageData.id });
        });
      });
    } else {
      ch.stages.forEach(function (se) {
        rows.push({ indent: 1, type: 'stage', name: se._stageData.text, parentId: cp.item.id, stageId: se._stageData.id });
      });
    }
  });
  return rows;
}

// --- Helpers to build a slot's `group` (post-flattenChildren entries) ---
function cp(item, q) { return { item: item, quadrantKey: q, _compactParent: true }; }
function sub(item, q, sd) { return { item: item, quadrantKey: q, _childType: 'subtask', _subtaskData: sd }; }
function tstage(item, q, st) { return { item: item, quadrantKey: q, _childType: 'stage', _stageData: st }; }
function sstage(item, q, sd, st) { return { item: item, quadrantKey: q, _childType: 'subtask-stage', _subtaskData: sd, _stageData: st }; }
function standalone(item, q) { return { item: item, quadrantKey: q }; }

var failures = 0;
function assert(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); }
  else { console.log('  ✗ FAIL: ' + msg); failures++; }
}
function findRow(rows, type, name) {
  return rows.filter(function (r) { return r.type === type && r.name === name; })[0];
}

// --- Test 1: block — subtask present, its stage nests at indent-2 ---
console.log('\n[Test 1] Subtask present in slot → its stage nests under it (indent 2)');
(function () {
  var block = { id: 'b1', blockName: '项目A' };
  var sd = { id: 's1', text: '开发' };
  var st = { id: 'g1', text: '阶段1', completed: false };
  var group = [cp(block, 'II'), sub(block, 'II', sd), sstage(block, 'II', sd, st)];
  var rows = renderPlan(buildSlotUnits(group));
  var hdr = findRow(rows, 'header', '项目A');
  var subRow = findRow(rows, 'subtask', '开发');
  var stageRow = findRow(rows, 'stage', '阶段1');
  assert(!!hdr && hdr.indent === 0, 'block header present at indent 0');
  assert(!!subRow && subRow.indent === 1 && subRow.parentId === 'b1', 'subtask 开发 at indent 1 under block');
  assert(!!stageRow && stageRow.indent === 2 && stageRow.subId === 's1', 'stage 阶段1 nested at indent 2 under 开发');
  assert(!findRow(rows, 'orphan-label', '开发'), 'no orphan label (subtask is present)');
  // adjacency: header → subtask → stage, contiguous
  var idxH = rows.indexOf(hdr), idxS = rows.indexOf(subRow), idxG = rows.indexOf(stageRow);
  assert(idxH < idxS && idxS < idxG, 'order: header → subtask → stage (grouped, not flat)');
})();

// --- Test 2: block — stage in slot but its subtask is NOT → orphan label + indent-1 stage ---
console.log('\n[Test 2] Orphan stage (subtask in another slot) → labeled, indent 1');
(function () {
  var block = { id: 'b2', blockName: '项目B' };
  var sd = { id: 's2', text: '测试' };
  var st = { id: 'g2', text: '阶段X', completed: false };
  var group = [cp(block, 'III'), sstage(block, 'III', sd, st)];
  var rows = renderPlan(buildSlotUnits(group));
  var label = findRow(rows, 'orphan-label', '测试');
  var stageRow = findRow(rows, 'stage', '阶段X');
  assert(!!label && label.indent === 1 && label.parentId === 'b2', 'orphan label ↳ 测试 at indent 1 under block');
  assert(!!stageRow && stageRow.indent === 1 && stageRow.subId === 's2', 'orphan stage at indent 1 (not 2)');
  assert(!findRow(rows, 'subtask', '测试'), 'no subtask row rendered (it is in another slot)');
})();

// --- Test 3: task with stages — stages nest at indent 1 under the task header ---
console.log('\n[Test 3] Task with stages → each stage at indent 1 under task header');
(function () {
  var task = { id: 't1', text: '晚间工作' };
  var g1 = { id: 'a1', text: 'A1', completed: false };
  var g2 = { id: 'a2', text: 'A2', completed: true };
  var group = [cp(task, 'I'), tstage(task, 'I', g1), tstage(task, 'I', g2)];
  var rows = renderPlan(buildSlotUnits(group));
  var hdr = findRow(rows, 'header', '晚间工作');
  var a1 = findRow(rows, 'stage', 'A1');
  var a2 = findRow(rows, 'stage', 'A2');
  assert(!!hdr && hdr.indent === 0, 'task header at indent 0');
  assert(!!a1 && a1.indent === 1 && a1.parentId === 't1', 'stage A1 indent 1 under task');
  assert(!!a2 && a2.indent === 1, 'stage A2 indent 1 under task');
  var idx = [rows.indexOf(hdr), rows.indexOf(a1), rows.indexOf(a2)];
  assert(idx[0] < idx[1] && idx[1] < idx[2], 'header → A1 → A2 contiguous');
})();

// --- Test 4: two parents in same slot — children not interleaved (each header owns its block of rows) ---
console.log('\n[Test 4] Two parents in one slot — children stay under their own header');
(function () {
  var blk1 = { id: 'p1', blockName: 'P1' };
  var blk2 = { id: 'p2', blockName: 'P2' };
  var s1 = { id: 'x1', text: 'X1' };
  var s2 = { id: 'x2', text: 'X2' };
  // P1 in II, P2 in I → after sort, P2 (I) comes first, then P1 (II)
  var group = [cp(blk1, 'II'), sub(blk1, 'II', s1), cp(blk2, 'I'), sub(blk2, 'I', s2)];
  var rows = renderPlan(buildSlotUnits(group));
  var h2 = findRow(rows, 'header', 'P2'); // I first
  var h1 = findRow(rows, 'header', 'P1');
  assert(rows.indexOf(h2) < rows.indexOf(h1), 'quadrant I parent (P2) ordered before quadrant II (P1)');
  // P2's child X2 must immediately follow P2 header, before P1 header
  var x2 = findRow(rows, 'subtask', 'X2');
  assert(rows.indexOf(h2) < rows.indexOf(x2) && rows.indexOf(x2) < rows.indexOf(h1), 'P2 → X2 contiguous, no interleaving with P1');
})();

// --- Test 5: standalone item ordered by quadrant alongside parent groups ---
console.log('\n[Test 5] Standalone item interleaved by quadrant with parent groups');
(function () {
  var blk = { id: 'b5', blockName: '块V', bigTaskRef: { bigTaskId: 'bt1' } };
  var sd5 = { id: 's5', text: '子5' };
  var st5 = { id: 'g5', text: 'G5', completed: false };
  var solo = { id: 't5', text: '独立任务' };
  var group = [cp(blk, 'IV'), sstage(blk, 'IV', sd5, st5), standalone(solo, 'I')];
  var rows = renderPlan(buildSlotUnits(group));
  var soloRow = findRow(rows, 'standalone', '独立任务');
  var blkHdr = findRow(rows, 'header', '块V');
  assert(!!soloRow && soloRow.indent === 0, 'standalone at indent 0');
  assert(rows.indexOf(soloRow) < rows.indexOf(blkHdr), 'quadrant I standalone ordered before quadrant IV parent');
})();

console.log('\n' + (failures === 0 ? '✅ ALL TESTS PASSED' : '❌ ' + failures + ' TEST(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);
