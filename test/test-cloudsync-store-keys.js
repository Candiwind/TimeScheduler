// test-cloudsync-store-keys.js — 静态分析：验证 cloud-sync.js 的导出/导入键与 store.js 一致
// Run: node test/test-cloudsync-store-keys.js

var fs = require('fs');
var path = require('path');

var storePath = path.join(__dirname, '..', 'js', 'store.js');
var syncPath  = path.join(__dirname, '..', 'js', 'cloud-sync.js');

var storeSrc = fs.readFileSync(storePath, 'utf8');
var syncSrc  = fs.readFileSync(syncPath, 'utf8');

function extractStringLiterals(src) {
  var set = new Set();
  // match 'quadrant_...' or "quadrant_..." strings
  var re = /['"](quadrant_[a-z_]+)['"]/g;
  var m;
  while ((m = re.exec(src))) {
    set.add(m[1]);
  }
  return set;
}

function extractVarAssignments(src, varName) {
  var re = new RegExp('var\\\\s+' + varName + '\\s*=\\s*["\']([^"\']+)["\'];', 'g');
  var m, vals = [];
  while ((m = re.exec(src))) vals.push(m[1]);
  return vals;
}

// store.js 中定义的 localStorage 键常量
var storeKeys = new Set();
// 直接字符串
extractStringLiterals(storeSrc).forEach(function(k) { storeKeys.add(k); });
// 变量赋值
['STORAGE_KEY','STORAGE_BACKUP_KEY','CACHE_INDEX_KEY','BIG_TASK_KEY','BIG_TASK_CACHE_KEY','FUTURE_TASK_KEY','WEEK_TASK_KEY','MONTH_TASK_KEY','PRINCIPLES_KEY','STAGES_COLLAPSE_KEY'].forEach(function(vn) {
  extractVarAssignments(storeSrc, vn).forEach(function(k) { storeKeys.add(k); });
});

// 只关注业务数据键（排除备份、UI 偏好、云同步配置）
var businessKeys = Array.from(storeKeys).filter(function(k) {
  return k.indexOf('quadrant_') === 0 &&
    k.indexOf('_backup') === -1 &&
    k !== 'quadrant_schema_version' &&
    k !== 'quadrant_stages_collapsed' &&
    k !== 'quadrant_view_mode' &&
    k !== 'quadrant_theme';
});

// cloud-sync.js 中读取/写入的 localStorage 键
var syncKeys = new Set();
extractStringLiterals(syncSrc).forEach(function(k) { syncKeys.add(k); });

// 检测动态拼接键模式：'quadrant_' + pool + '_tasks' → 运行时为 quadrant_future_tasks 等
// 用于计划池的导出/导入
var hasCorrectPoolPattern = /['"]quadrant_['"]\s*\+\s*\w+\s*\+\s*['"]_tasks['"]/.test(syncSrc);
// 旧错误模式：'quadrant_pool_' + pool → 运行时为 quadrant_pool_future（错键）
var hasWrongPoolPattern = /['"]quadrant_pool_['"]/.test(syncSrc);

var errors = [];

// 1. 计划池键必须正确映射
if (hasWrongPoolPattern) {
  errors.push('计划池键错配：cloud-sync 中存在错误模式 "quadrant_pool_"（应为 quadrant_*_tasks）');
}
if (!hasCorrectPoolPattern && !hasWrongPoolPattern) {
  // 非动态拼接时检查静态字面量
  var expectedPoolKeys = ['quadrant_future_tasks', 'quadrant_week_tasks', 'quadrant_month_tasks'];
  expectedPoolKeys.forEach(function(expected) {
    if (!syncKeys.has(expected)) {
      errors.push('计划池键遗漏：cloud-sync 中找不到 "' + expected + '"');
    }
  });
}

// Check actual runtime keys by evaluating the export function's key building
// Simulate: for each pool in ['future','week','month'], key = 'quadrant_' + pool + '_tasks'
var poolNames = ['future', 'week', 'month'];
var simulatedKeys = poolNames.map(function(p) { return 'quadrant_' + p + '_tasks'; });
poolNames.forEach(function(p, i) {
  // 也验证这些键在 store.js 中存在
  var expectedKey = simulatedKeys[i];
  if (!storeKeys.has(expectedKey)) {
    errors.push('计划池键不匹配 store.js：store.js 中缺少 "' + expectedKey + '"');
  }
});

// 2. 大任务缓存键必须复数
if (syncKeys.has('quadrant_big_task_cache')) {
  errors.push('大任务缓存键错配：cloud-sync 使用单数 "quadrant_big_task_cache"，应为 "quadrant_big_tasks_cache"');
}
if (!syncKeys.has('quadrant_big_tasks_cache')) {
  errors.push('大任务缓存键遗漏：cloud-sync 中找不到 "quadrant_big_tasks_cache"');
}

// 3. 大任务活跃列表键
if (!syncKeys.has('quadrant_big_tasks')) {
  errors.push('大任务活跃键遗漏：cloud-sync 中找不到 "quadrant_big_tasks"');
}

// 4. 原则键
if (!syncKeys.has('quadrant_principles')) {
  errors.push('原则键遗漏：cloud-sync 中找不到 "quadrant_principles"');
}

// 5. 主数据键
if (!syncKeys.has('quadrant_task_data')) {
  errors.push('主数据键遗漏：cloud-sync 中找不到 "quadrant_task_data"');
}

// 6. 缓存索引键
if (!syncKeys.has('quadrant_cached_dates_index')) {
  errors.push('缓存索引键遗漏：cloud-sync 中找不到 "quadrant_cached_dates_index"');
}

// 汇总
if (errors.length === 0) {
  console.log('✅ 所有 cloud-sync 键与 store.js 一致');
  process.exit(0);
} else {
  console.log('❌ 发现 ' + errors.length + ' 个键不一致：');
  errors.forEach(function(e) { console.log('  - ' + e); });
  process.exit(1);
}
