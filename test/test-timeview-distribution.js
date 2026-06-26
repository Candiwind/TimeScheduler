// Functional test for time-view distribution logic (flattenChildren + parentChildSlots)
// Replicates the core logic from render.js renderTimeView() without DOM dependencies.
// Run: node test/test-timeview-distribution.js

var SLOT_ORDER = ['early_morn','forenoon','noon','afternoon','dusk','night'];
function getDefaultTimeSlot() { return 'forenoon'; } // deterministic for test

// --- Core logic under test (mirrors render.js) ---
function buildSlotGroups(allItems) {
  var slotGroups = {};
  allItems.forEach(function(entry) {
    var item = entry.item;
    if (item.blockName !== undefined) {
      var foundSlot = null;
      if (item.tasks) {
        for (var ti = 0; ti < item.tasks.length; ti++) {
          if (item.tasks[ti].timeSlot) { foundSlot = item.tasks[ti].timeSlot; break; }
        }
      }
      var effectiveSlot = foundSlot || getDefaultTimeSlot();
      if (!slotGroups[effectiveSlot]) slotGroups[effectiveSlot] = [];
      slotGroups[effectiveSlot].push(entry);
    } else {
      var slot = item.timeSlot || getDefaultTimeSlot();
      if (!slotGroups[slot]) slotGroups[slot] = [];
      slotGroups[slot].push(entry);
    }
  });
  return slotGroups;
}

function flattenChildren(slotGroups) {
  var parentsWithChildren = {};
  var parentChildSlots = {};
  var allEntries = [];
  SLOT_ORDER.forEach(function(sk) {
    if (slotGroups[sk]) allEntries = allEntries.concat(slotGroups[sk]);
  });

  allEntries.forEach(function(entry) {
    var item = entry.item;
    var qKey = entry.quadrantKey;
    var parentKey = qKey + '::' + item.id;

    if (!item.blockName && item.stages && item.stages.length > 0) {
      parentsWithChildren[parentKey] = true;
      if (!parentChildSlots[parentKey]) parentChildSlots[parentKey] = { entry: entry, slots: {} };
      item.stages.forEach(function(stage) {
        var tSlot = stage.timeSlot || getDefaultTimeSlot();
        if (!slotGroups[tSlot]) slotGroups[tSlot] = [];
        slotGroups[tSlot].push({ item: item, quadrantKey: qKey, _childType: 'stage', _stageData: stage });
        parentChildSlots[parentKey].slots[tSlot] = true;
      });
    }

    if (item.blockName && item.tasks && item.tasks.length > 0) {
      parentsWithChildren[parentKey] = true;
      if (!parentChildSlots[parentKey]) parentChildSlots[parentKey] = { entry: entry, slots: {} };
      item.tasks.forEach(function(subtask) {
        var tSlot = subtask.timeSlot || getDefaultTimeSlot();
        if (!slotGroups[tSlot]) slotGroups[tSlot] = [];
        slotGroups[tSlot].push({ item: item, quadrantKey: qKey, _childType: 'subtask', _subtaskData: subtask });
        parentChildSlots[parentKey].slots[tSlot] = true;

        if (subtask.stages && subtask.stages.length > 0) {
          subtask.stages.forEach(function(stage) {
            var ssSlot = stage.timeSlot || getDefaultTimeSlot();
            if (!slotGroups[ssSlot]) slotGroups[ssSlot] = [];
            slotGroups[ssSlot].push({ item: item, quadrantKey: qKey, _childType: 'subtask-stage', _subtaskData: subtask, _stageData: stage });
            parentChildSlots[parentKey].slots[ssSlot] = true; // THE FIX
          });
        }
      });
    }
  });

  Object.keys(parentChildSlots).forEach(function(parentKey) {
    var info = parentChildSlots[parentKey];
    var origEntry = info.entry;
    SLOT_ORDER.forEach(function(sk) {
      var group = slotGroups[sk];
      if (!group) return;
      for (var i = group.length - 1; i >= 0; i--) {
        if (group[i] === origEntry) { group.splice(i, 1); break; }
      }
    });
    Object.keys(info.slots).forEach(function(sk) {
      if (!slotGroups[sk]) slotGroups[sk] = [];
      slotGroups[sk].unshift({ item: origEntry.item, quadrantKey: origEntry.quadrantKey, _compactParent: true });
    });
  });

  return { slotGroups: slotGroups, parentsWithChildren: parentsWithChildren };
}

// --- Test helpers ---
var failures = 0;
function assert(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); }
  else { console.log('  ✗ FAIL: ' + msg); failures++; }
}

function childKey(entry) {
  // unique identity for a subtask or stage
  if (entry._childType === 'subtask') return 'sub:' + entry._subtaskData.id;
  if (entry._childType === 'stage') return 'stage:' + entry._stageData.id;
  if (entry._childType === 'subtask-stage') return 'ss:' + entry._subtaskData.id + ':' + entry._stageData.id;
  return null;
}

function countOccurrences(slotGroups, keyFn) {
  var counts = {};
  SLOT_ORDER.forEach(function(sk) {
    (slotGroups[sk] || []).forEach(function(e) {
      var k = keyFn(e);
      if (k) counts[k] = (counts[k] || 0) + 1;
    });
  });
  return counts;
}

// --- Test Case 1: Block with subtask that has stages in different slots ---
console.log('\n[Test 1] Block subtask stages distributed to own slots, no duplication');
(function() {
  var block = {
    id: 'blk1', blockName: '项目A', quadrantKey: 'II',
    tasks: [
      { id: 'st1', text: '调研', timeSlot: 'forenoon' },                       // no stages
      { id: 'st2', text: '开发', timeSlot: 'afternoon',                         // has stages
        stages: [
          { id: 'sg1', text: 'S1', timeSlot: 'noon' },
          { id: 'sg2', text: 'S2', timeSlot: 'dusk' }
        ]
      }
    ]
  };
  var allItems = [{ item: block, quadrantKey: 'II' }];
  var slotGroups = buildSlotGroups(allItems);
  var res = flattenChildren(slotGroups);

  // S1 should be in noon, S2 in dusk — NOT nested-duplicated
  var stageCounts = countOccurrences(res.slotGroups, childKey);
  assert(stageCounts['ss:st2:sg1'] === 1, 'stage S1 appears exactly once (in noon)');
  assert(stageCounts['ss:st2:sg2'] === 1, 'stage S2 appears exactly once (in dusk)');
  assert((res.slotGroups['noon'] || []).some(function(e){ return e._childType === 'subtask-stage' && e._stageData.id === 'sg1'; }), 'S1 located in noon');
  assert((res.slotGroups['dusk'] || []).some(function(e){ return e._childType === 'subtask-stage' && e._stageData.id === 'sg2'; }), 'S2 located in dusk');

  // subtask 开发 appears once (afternoon), rendered without nested stages in real UI
  var subCounts = countOccurrences(res.slotGroups, childKey);
  assert(subCounts['sub:st2'] === 1, 'subtask 开发 appears exactly once');
  assert((res.slotGroups['afternoon'] || []).some(function(e){ return e._childType === 'subtask' && e._subtaskData.id === 'st2'; }), '开发 located in afternoon');

  // subtask 调研 appears once (forenoon)
  assert(subCounts['sub:st1'] === 1, 'subtask 调研 appears exactly once');

  // Parent header appears in each slot that has children: forenoon, afternoon, noon, dusk
  ['forenoon','afternoon','noon','dusk'].forEach(function(sk) {
    assert((res.slotGroups[sk] || []).some(function(e){ return e._compactParent && e.item.id === 'blk1'; }), 'block header present in ' + sk);
  });
})();

// --- Test Case 2: Task (not in block) with stages ---
console.log('\n[Test 2] Task with stages distributed, no duplication');
(function() {
  var task = {
    id: 't1', text: '晚间工作', timeSlot: 'night', quadrantKey: 'I',
    stages: [
      { id: 'g1', text: 'G1', timeSlot: 'night' },
      { id: 'g2', text: 'G2', timeSlot: 'dusk' }
    ]
  };
  var allItems = [{ item: task, quadrantKey: 'I' }];
  var slotGroups = buildSlotGroups(allItems);
  var res = flattenChildren(slotGroups);

  var stageCounts = countOccurrences(res.slotGroups, childKey);
  assert(stageCounts['stage:g1'] === 1, 'stage G1 appears exactly once');
  assert(stageCounts['stage:g2'] === 1, 'stage G2 appears exactly once');
  assert((res.slotGroups['night'] || []).some(function(e){ return e._childType === 'stage' && e._stageData.id === 'g1'; }), 'G1 located in night');
  assert((res.slotGroups['dusk'] || []).some(function(e){ return e._childType === 'stage' && e._stageData.id === 'g2'; }), 'G2 located in dusk');
})();

// --- Test Case 3: Same stage timeSlot as subtask — must NOT duplicate ---
console.log('\n[Test 3] Stage in same slot as its subtask — no duplication');
(function() {
  var block = {
    id: 'blk2', blockName: '项目B', quadrantKey: 'III',
    tasks: [
      { id: 'st3', text: '测试', timeSlot: 'noon',
        stages: [ { id: 'sg3', text: 'S3', timeSlot: 'noon' } ]
      }
    ]
  };
  var allItems = [{ item: block, quadrantKey: 'III' }];
  var slotGroups = buildSlotGroups(allItems);
  var res = flattenChildren(slotGroups);

  var stageCounts = countOccurrences(res.slotGroups, childKey);
  assert(stageCounts['ss:st3:sg3'] === 1, 'stage S3 appears exactly once even when same slot as subtask');
  assert(countOccurrences(res.slotGroups, childKey)['sub:st3'] === 1, 'subtask 测试 appears exactly once');
})();

// --- Test Case 4: Global uniqueness — every subtask/stage appears in exactly one slot ---
console.log('\n[Test 4] Global uniqueness across all subtasks/stages');
(function() {
  var block = {
    id: 'blk3', blockName: '混合', quadrantKey: 'IV',
    tasks: [
      { id: 'a', text: 'A', timeSlot: 'early_morn' },
      { id: 'b', text: 'B', timeSlot: 'forenoon', stages: [{ id: 'b1', text: 'B1', timeSlot: 'noon' }, { id: 'b2', text: 'B2', timeSlot: 'afternoon' }] },
      { id: 'c', text: 'C', timeSlot: 'dusk', stages: [{ id: 'c1', text: 'C1', timeSlot: 'night' }] }
    ]
  };
  var allItems = [{ item: block, quadrantKey: 'IV' }];
  var res = flattenChildren(buildSlotGroups(allItems));
  var counts = countOccurrences(res.slotGroups, childKey);
  var allKeys = ['sub:a','sub:b','sub:c','ss:b:b1','ss:b:b2','ss:c:c1'];
  allKeys.forEach(function(k) {
    assert(counts[k] === 1, k + ' appears exactly once');
  });
})();

console.log('\n' + (failures === 0 ? '✅ ALL TESTS PASSED' : '❌ ' + failures + ' TEST(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);
