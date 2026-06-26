// Regression test for time-view grid column logic ("two time slots per row" principle).
// Mirrors the column calculation in render.js renderTimeView() without DOM dependencies.
// Run: node test/test-timeview-columns.js

var SLOT_ORDER = ['early_morn', 'forenoon', 'noon', 'afternoon', 'dusk', 'night'];

// Replicates the column logic from renderTimeView()
function computeCols(slotGroups, viewportWidth) {
  var nonEmptyCount = 0;
  SLOT_ORDER.forEach(function (sk) {
    if (slotGroups[sk] && slotGroups[sk].length > 0) nonEmptyCount++;
  });
  var cols = nonEmptyCount <= 1 ? 1 : 2;
  var vw = viewportWidth;
  if (vw <= 600) cols = 1; // mobile: single column
  return cols;
}

function slotGroupsFromCount(n) {
  var g = {};
  for (var i = 0; i < n; i++) { g[SLOT_ORDER[i]] = [{ dummy: true }]; }
  return g;
}

var failures = 0;
function assert(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); }
  else { console.log('  ✗ FAIL: ' + msg); failures++; }
}

console.log('\n[Test 1] Desktop (1400px) — two slots per row for 2+ populated slots');
(function () {
  assert(computeCols(slotGroupsFromCount(0), 1400) === 1, '0 slots → 1 col (empty → 1fr single)');
  assert(computeCols(slotGroupsFromCount(1), 1400) === 1, '1 slot  → 1 col (1×1)');
  assert(computeCols(slotGroupsFromCount(2), 1400) === 2, '2 slots → 2 cols (2×1)');
  assert(computeCols(slotGroupsFromCount(3), 1400) === 2, '3 slots → 2 cols (2+1)');
  assert(computeCols(slotGroupsFromCount(4), 1400) === 2, '4 slots → 2 cols (2×2)');
  assert(computeCols(slotGroupsFromCount(5), 1400) === 2, '5 slots → 2 cols (2+2+1)');
  assert(computeCols(slotGroupsFromCount(6), 1400) === 2, '6 slots → 2 cols (2×3) ← core requirement');
})();

console.log('\n[Test 2] Mobile (<=600px) — always single column');
(function () {
  [1, 2, 3, 4, 5, 6].forEach(function (n) {
    assert(computeCols(slotGroupsFromCount(n), 400) === 1, n + ' slots @400px → 1 col');
  });
})();

console.log('\n[Test 3] Rows implied = ceil(nonEmptyCount / cols) — verify 6 slots yields 3 rows');
(function () {
  function rows(n, cols) { return Math.ceil(n / cols); }
  assert(rows(6, 2) === 3, '6 slots / 2 cols = 3 rows (2×3 layout)');
  assert(rows(4, 2) === 2, '4 slots / 2 cols = 2 rows (2×2 layout)');
  assert(rows(5, 2) === 3, '5 slots / 2 cols = 3 rows');
  assert(rows(1, 1) === 1, '1 slot  / 1 col  = 1 row');
})();

console.log('\n' + (failures === 0 ? '✅ ALL TESTS PASSED' : '❌ ' + failures + ' TEST(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);
