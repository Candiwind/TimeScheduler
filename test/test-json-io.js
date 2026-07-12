// Regression test for JSON import merge/overwrite semantics.
// Mirrors importAllDataFromJSON(jsonText, merge) from js/store.js.
// Validates the cross-device data flow: 电脑端导出 → 手机端导入.
// Run: node test/test-json-io.js

var failures = 0;
function assert(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); }
  else { console.log('  ✗ FAIL: ' + msg); failures++; }
}

// Mirror of importAllDataFromJSON merge/overwrite branch (no localStorage).
// Returns { ok, store } where store is the resulting data state.
function applyImport(currentStore, jsonText, merge) {
  var imported;
  try { imported = JSON.parse(jsonText); }
  catch (e) { return { ok: false, store: currentStore }; }
  if (typeof imported !== 'object' || imported === null) return { ok: false, store: currentStore };
  var result;
  if (merge) {
    result = JSON.parse(JSON.stringify(currentStore));
    Object.keys(imported).forEach(function(date) { result[date] = imported[date]; });
  } else {
    result = JSON.parse(JSON.stringify(imported));
  }
  return { ok: true, store: result };
}

console.log('[Test 1] merge=true — imported dates overwrite, others preserved');
(function() {
  var current = {
    '2026-07-01': { I: [{ id: 'a' }] },
    '2026-07-02': { I: [{ id: 'old' }] }
  };
  var imported = {
    '2026-07-02': { II: [{ id: 'new' }] },
    '2026-07-03': { I: [{ id: 'c' }] }
  };
  var r = applyImport(current, JSON.stringify(imported), true);
  assert(r.ok, 'merge returns ok');
  assert(Object.keys(r.store).length === 3, '3 dates total after merge (01/02/03)');
  assert(r.store['2026-07-01'].I[0].id === 'a', '07-01 (not in import) preserved');
  assert(r.store['2026-07-02'].II[0].id === 'new', '07-02 overwritten by import');
  assert(!r.store['2026-07-02'].I, '07-02 fully replaced (old I gone)');
  assert(r.store['2026-07-03'].I[0].id === 'c', '07-03 (new date) added');
})();

console.log('[Test 2] merge=false — full overwrite');
(function() {
  var current = { '2026-07-01': { I: [{ id: 'a' }] } };
  var imported = { '2026-07-05': { I: [{ id: 'z' }] } };
  var r = applyImport(current, JSON.stringify(imported), false);
  assert(r.ok, 'overwrite returns ok');
  assert(Object.keys(r.store).length === 1, 'only 1 date after overwrite');
  assert(r.store['2026-07-05'].I[0].id === 'z', 'has imported date');
  assert(!r.store['2026-07-01'], 'old date 07-01 removed');
})();

console.log('[Test 3] invalid JSON rejected');
(function() {
  var r = applyImport({ '2026-07-01': { I: [] } }, 'not valid json{{{', true);
  assert(!r.ok, 'invalid JSON returns not ok');
})();

console.log('[Test 4] non-object JSON rejected (string/number/array-as-top? object accepted)');
(function() {
  assert(!applyImport({}, '"just a string"', true).ok, 'top-level string rejected');
  assert(!applyImport({}, '123', true).ok, 'top-level number rejected');
  assert(applyImport({}, 'null', true).ok === false, 'top-level null rejected');
})();

console.log('[Test 5] merge does not mutate caller\'s currentStore');
(function() {
  var current = { '2026-07-01': { I: [{ id: 'a' }] } };
  applyImport(current, JSON.stringify({ '2026-07-02': { I: [] } }), true);
  assert(Object.keys(current).length === 1, 'currentStore unchanged after merge');
})();

console.log('[Test 6] merge into empty store');
(function() {
  var r = applyImport({}, JSON.stringify({ '2026-07-10': { I: [{ id: 'x' }] } }), true);
  assert(r.ok, 'merge into empty ok');
  assert(Object.keys(r.store).length === 1, '1 date added');
  assert(r.store['2026-07-10'].I[0].id === 'x', 'data correct');
})();

if (failures === 0) { console.log('\n✅ ALL TESTS PASSED'); }
else { console.log('\n❌ ' + failures + ' test(s) failed'); process.exit(1); }
