// test-cloudsync-merge.js — 逐条目 LWW 合并引擎测试
// 验证 SyncMerge 各个合并函数在所有并发场景下的正确性
// Run: node test/test-cloudsync-merge.js

var fs = require('fs');
var path = require('path');

// Load the module as a script (it's an IIFE)
var src = fs.readFileSync(path.join(__dirname, '..', 'js', 'sync-merge.js'), 'utf8');
eval(src);
var M = SyncMerge; // SyncMerge is the global created by the IIFE

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (e) {
    failed++;
    console.log('  ✗ ' + name + ' — ' + e.message);
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }
function assertEq(a, b, msg) { assert(a === b, msg + ': expected ' + b + ' got ' + a); }
function assertLen(arr, n, msg) { assert(arr.length === n, msg + ': expected ' + n + ' got ' + arr.length); }

console.log('=== LWW 决胜逻辑 ===\n');

// Helper: make task item
function ti(id, text, updatedAt, deleted) {
  var o = { id: id, text: text };
  if (updatedAt) o.updatedAt = updatedAt;
  if (deleted) o._deleted = true;
  return o;
}

// updatedAt: newer date = later = wins
var T1 = '2026-07-11T10:00:00.000Z';
var T2 = '2026-07-11T11:00:00.000Z';
var T3 = '2026-07-11T12:00:00.000Z';

test('newer updatedAt wins (remote newer)', function() {
  var local = ti('a', 'local task', T1);
  var remote = ti('a', 'remote task', T2);
  var winner = M.lwwWinner(local, remote);
  assert(winner.text === 'remote task', 'remote should win with newer timestamp');
  assert(!winner._deleted, 'should not be deleted');
});

test('newer updatedAt wins (local newer)', function() {
  var local = ti('a', 'local task', T2);
  var remote = ti('a', 'remote task', T1);
  var winner = M.lwwWinner(local, remote);
  assert(winner.text === 'local task', 'local should win with newer timestamp');
});

test('no updatedAt on either side → local wins (conservative)', function() {
  var local = ti('a', 'local task');
  var remote = ti('a', 'remote task');
  var winner = M.lwwWinner(local, remote);
  assert(winner.text === 'local task', 'local wins when both lack timestamp');
});

test('side with updatedAt wins over side without', function() {
  var local = ti('a', 'local task');  // no timestamp
  var remote = ti('a', 'remote task', T1);  // has timestamp
  var winner = M.lwwWinner(local, remote);
  assert(winner.text === 'remote task', 'side with timestamp wins');
});

console.log('\n=== 墓碑（_deleted）逻辑 ===\n');

test('local tombstone newer → item deleted (winner = local tombstone)', function() {
  var local = ti('a', 'old', T2, true);  // tombstone, newer
  var remote = ti('a', 'changed', T1);   // edit, older
  var winner = M.lwwWinner(local, remote);
  assert(winner._deleted, 'local deletion wins');
});

test('remote tombstone newer → item deleted (winner = remote tombstone)', function() {
  var local = ti('a', 'local task', T1);
  var remote = ti('a', 'deleted', T2, true);
  var winner = M.lwwWinner(local, remote);
  assert(winner._deleted, 'remote deletion wins');
});

test('both sides tombstone → newer tombstone wins', function() {
  var local = ti('a', 'del1', T2, true);
  var remote = ti('a', 'del2', T3, true);
  var winner = M.lwwWinner(local, remote);
  assert(winner._deleted, 'both deleted');
});

test('local tombstone older → remote edit wins (tombstone ignored)', function() {
  var local = ti('a', 'old', T1, true);    // tombstone, older
  var remote = ti('a', 'changed', T2);     // edit, newer
  var winner = M.lwwWinner(local, remote);
  assert(!winner._deleted, 'edit wins over older tombstone');
});

console.log('\n=== mergeArrayById 数组合并 ===\n');

test('two independent additions → both kept', function() {
  var local = [ti('a', 'task A', T1)];
  var remote = [ti('b', 'task B', T1)];
  var result = M.mergeArrayById(local, remote);
  assertEq(result.length, 2, 'both tasks kept');
  assertEq(result.filter(function(r) { return r.id === 'a'; }).length, 1, 'A present');
  assertEq(result.filter(function(r) { return r.id === 'b'; }).length, 1, 'B present');
});

test('same ID, different edits → newer wins', function() {
  var local = [ti('a', 'edit by phone', T1)];
  var remote = [ti('a', 'edit by computer', T2)];
  var result = M.mergeArrayById(local, remote);
  assertEq(result.length, 1, 'one item');
  assertEq(result[0].text, 'edit by computer', 'computer edit wins (newer)');
});

test('ID only in remote → added to local', function() {
  var local = [];
  var remote = [ti('x', 'new from cloud', T1)];
  var result = M.mergeArrayById(local, remote);
  assertEq(result.length, 1, 'remote item added');
  assertEq(result[0].text, 'new from cloud', 'item present');
});

test('remote tombstone → item removed', function() {
  var local = [ti('a', 'will be deleted', T1)];
  var remote = [ti('a', '', T2, true)];
  var result = M.mergeArrayById(local, remote);
  assertEq(result.length, 0, 'item deleted by tombstone');
});

test('remote tombstone for non-existent ID → ignored', function() {
  var local = [ti('a', 'keep me', T1)];
  var remote = [ti('x', '', T2, true)]; // non-existent ID
  var result = M.mergeArrayById(local, remote);
  assertEq(result.length, 1, 'only local item');
  assertEq(result[0].id, 'a', 'A kept');
});

test('null/undefined arrays → handled gracefully', function() {
  var result = M.mergeArrayById(null, undefined);
  assertEq(result.length, 0, 'empty for null inputs');

  var result2 = M.mergeArrayById([ti('a', 'ok', T1)], null);
  assertEq(result2.length, 1, 'local preserved with null remote');
});

test('preserves order (local then new remote)', function() {
  var local = [ti('a', 'A', T1), ti('b', 'B', T1)];
  var remote = [ti('c', 'C', T1), ti('d', 'D', T1)];
  var result = M.mergeArrayById(local, remote);
  assertEq(result.length, 4);
  assertEq(result[0].id, 'a');
  assertEq(result[1].id, 'b');
  assertEq(result[2].id, 'c');
  assertEq(result[3].id, 'd');
});

console.log('\n=== mergeDateData 日数据合并 ===\n');

test('different days, different quadrants → merged', function() {
  var localDD = { I: [ti('a', 'Q1 local', T1)], II: [], III: [], IV: [] };
  var remoteDD = { I: [], II: [ti('b', 'Q2 remote', T2)], III: [], IV: [] };
  var result = M.mergeDateData(localDD, remoteDD);
  assertEq(result.I.length, 1, 'Q1 has local');
  assertEq(result.II.length, 1, 'Q2 has remote');
  assertEq(result.III.length, 0, 'Q3 empty');
  assertEq(result.IV.length, 0, 'Q4 empty');
});

test('same quadrant, concurrent add → both kept', function() {
  var localDD = { I: [ti('a', 'phone task', T1)], II: [], III: [], IV: [] };
  var remoteDD = { I: [ti('b', 'computer task', T2)], II: [], III: [], IV: [] };
  var result = M.mergeDateData(localDD, remoteDD);
  assertEq(result.I.length, 2, 'both tasks in Q1');
});

test('same task edited on both sides → newer wins', function() {
  var localDD = { I: [ti('a', 'phone edit', T1)], II: [], III: [], IV: [] };
  var remoteDD = { I: [ti('a', 'computer edit', T2)], II: [], III: [], IV: [] };
  var result = M.mergeDateData(localDD, remoteDD);
  assertEq(result.I.length, 1, 'one task in Q1');
  assertEq(result.I[0].text, 'computer edit', 'newer edit wins');
});

console.log('\n=== mergeAllDateData 多日合并 ===\n');

test('local-only date preserved, remote-only date added, shared date merged', function() {
  var localAll = {
    '2026-07-10': { I: [ti('a', 'local-only day', T1)], II: [], III: [], IV: [] },
    '2026-07-11': { I: [ti('b', 'shared day local', T1)], II: [], III: [], IV: [] }
  };
  var remoteAll = {
    '2026-07-11': { I: [ti('c', 'shared day remote', T2)], II: [], III: [], IV: [] },
    '2026-07-12': { I: [ti('d', 'remote-only day', T1)], II: [], III: [], IV: [] }
  };
  var result = M.mergeAllDateData(localAll, remoteAll);
  assertEq(Object.keys(result).length, 3, '3 dates total');
  assertEq(result['2026-07-10'].I.length, 1, '07-10 has 1 local-only');
  assertEq(result['2026-07-12'].I.length, 1, '07-12 has 1 remote-only');
  assertEq(result['2026-07-11'].I.length, 2, '07-11 has both (shared day merged)');
});

console.log('\n=== mergePrinciples ===\n');

test('both add different principles → both kept', function() {
  var localPr = { id: '', startDate: '', endDate: '', principles: [ti('p1', '原则A', T1)], priorityProblems: [] };
  var remotePr = { id: '', startDate: '', endDate: '', principles: [ti('p2', '原则B', T1)], priorityProblems: [] };
  var result = M.mergePrinciples(localPr, remotePr);
  assertEq(result.principles.length, 2, 'both principles kept');
});

test('both add priority problems → both kept', function() {
  var localPr = { id: '', startDate: '', endDate: '', principles: [], priorityProblems: [ti('pp1', '问题A', T1)] };
  var remotePr = { id: '', startDate: '', endDate: '', principles: [], priorityProblems: [ti('pp2', '问题B', T2)] };
  var result = M.mergePrinciples(localPr, remotePr);
  assertEq(result.priorityProblems.length, 2, 'both problems kept');
});

console.log('\n=== mergeCachedDatesIndex ===\n');

test('union of two date indices', function() {
  var local = ['2026-07-10', '2026-07-11'];
  var remote = ['2026-07-11', '2026-07-12'];
  var result = M.mergeCachedDatesIndex(local, remote);
  assertEq(result.length, 3, '3 unique dates');
  assertEq(result[0], '2026-07-10');
  assertEq(result[1], '2026-07-11');
  assertEq(result[2], '2026-07-12');
});

console.log('\n=== countRemoteChanges ===\n');

test('counts new items from remote', function() {
  var local = { '2026-07-11': { I: [ti('a', 'task', T1)], II: [], III: [], IV: [] } };
  var remote = { '2026-07-11': { I: [ti('a', 'task', T1), ti('b', 'new', T1)], II: [], III: [], IV: [] } };
  var count = M.countRemoteChanges(local, remote);
  assertEq(count, 1, '1 new remote item');
});

test('counts updated items from remote', function() {
  var local = { '2026-07-11': { I: [ti('a', 'old text', T1)], II: [], III: [], IV: [] } };
  var remote = { '2026-07-11': { I: [ti('a', 'new text', T2)], II: [], III: [], IV: [] } };
  var count = M.countRemoteChanges(local, remote);
  assertEq(count, 1, '1 updated remote item');
});

test('zero when identical', function() {
  var local = { '2026-07-11': { I: [ti('a', 'same', T1)], II: [], III: [], IV: [] } };
  var remote = JSON.parse(JSON.stringify(local));
  var count = M.countRemoteChanges(local, remote);
  assertEq(count, 0, 'no changes');
});

// Summary
console.log('\n=== ' + (failed === 0 ? '✅ ALL ' + passed + ' TESTS PASSED' : '❌ ' + failed + ' FAILED / ' + (passed + failed) + ' TOTAL') + ' ===\n');
process.exit(failed > 0 ? 1 : 0);
