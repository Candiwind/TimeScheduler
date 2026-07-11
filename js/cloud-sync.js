// cloud-sync.js — 云盘数据同步模块
// 支持 GitHub Gist 云同步，电脑手机全自动

var CloudSync = (function() {
  var SYNC_FILE_NAME = 'quadrant_tasks_backup.json';
  var GIST_ID_KEY = 'cloudsync_gist_id';
  var GIST_TOKEN_KEY = 'cloudsync_gist_token';
  var SYNC_ENABLED_KEY = 'cloudsync_enabled';
  var SYNC_MODE_KEY = 'cloudsync_mode';
  var LAST_SYNC_KEY = 'cloudsync_last_sync';

  // 同步状态
  var syncInfo = {
    enabled: false,
    mode: null,        // 'github-gist'
    lastSync: null,
    gistId: null,
    gistToken: null
  };

  // 数据变更回调（外部注册）
  var onDataChangeCallback = null;

  /**
   * 初始化：恢复之前的同步配置
   */
  // 版本标记——用于排查浏览器是否缓存了旧代码
  var CODE_VERSION = '2026-07-11-remove-gitee';

  function init() {
    console.log('%c[云同步] 代码版本: ' + CODE_VERSION, 'color:#0969da;font-weight:bold;');
    console.log('[云同步] 当前配置:', {
      enabled: localStorage.getItem(SYNC_ENABLED_KEY) === '1',
      mode: localStorage.getItem(SYNC_MODE_KEY),
      hasGistId: !!(localStorage.getItem(GIST_ID_KEY)),
      hasToken: !!(localStorage.getItem(GIST_TOKEN_KEY))
    });

    // 恢复配置
    syncInfo.enabled = localStorage.getItem(SYNC_ENABLED_KEY) === '1';
    syncInfo.mode = localStorage.getItem(SYNC_MODE_KEY) || null;
    syncInfo.lastSync = localStorage.getItem(LAST_SYNC_KEY) || null;
    syncInfo.gistId = localStorage.getItem(GIST_ID_KEY) || null;
    syncInfo.gistToken = localStorage.getItem(GIST_TOKEN_KEY) || null;

    // 向后兼容：旧版 'baidu-disk' / 'gitee-gist' / 'gist' → 清理或迁移
    if (syncInfo.enabled) {
      var oldMode = syncInfo.mode;
      if (oldMode === 'baidu-disk' || oldMode === 'gitee-gist') {
        // 百度网盘 / Gitee Gist 已废弃，清除旧配置
        syncInfo.enabled = false;
        syncInfo.mode = null;
        localStorage.removeItem(SYNC_ENABLED_KEY);
        localStorage.removeItem(SYNC_MODE_KEY);
        localStorage.removeItem('cloudsync_dir_path');
        localStorage.removeItem('cloudsync_gitee_gist_id');
        localStorage.removeItem('cloudsync_gitee_gist_token');
      } else if (oldMode === 'gist') {
        // GitHub Gist 旧名称 → 新名称
        syncInfo.mode = 'github-gist';
        localStorage.setItem(SYNC_MODE_KEY, 'github-gist');
      }
    }

    // 自动拉取（GitHub Gist）
    if (syncInfo.enabled && syncInfo.mode === 'github-gist' && syncInfo.gistId) {
      autoPullFromGist();
    }
  }

  /**
   * 注册数据变更回调（store.js saveDateData 后调用）
   */
  function onDataChanged() {
    if (!syncInfo.enabled) return;

    if (syncInfo.mode === 'github-gist' && syncInfo.gistId && syncInfo.gistToken) {
      debouncePushToGist();
    }
  }

  // ============ 数据导出 ============

  function exportAllData() {
    // 关键修正：所有日期数据存在 quadrant_task_data 一个大对象里（loadAllData），
    // 而非每个日期独立键。直接导出整个大对象。
    var allDateData = {};
    try {
      allDateData = (typeof loadAllData === 'function') ? loadAllData() :
                    JSON.parse(localStorage.getItem('quadrant_task_data') || '{}');
    } catch(e) { allDateData = {}; }

    var exportObj = {
      _version: 3,  // v3: 修正 dateData 数据结构（从 quadrant_task_data 读取）
      _exportedAt: new Date().toISOString(),
      _source: 'quadrant-task-manager-cloudsync',
      cachedDatesIndex: (function() {
        try { return JSON.parse(localStorage.getItem('quadrant_cached_dates_index') || '[]'); }
        catch(e) { return []; }
      })(),
      // 全部日期数据（{date: {I:[],II:[],III:[],IV:[]}}）
      dateData: allDateData,
      bigTasks: loadBigTasks ? loadBigTasks() : [],
      bigTaskCache: (function() {
        try { return JSON.parse(localStorage.getItem('quadrant_big_tasks_cache') || '[]'); }
        catch(e) { return []; }
      })(),
      principles: loadPrinciples ? loadPrinciples() : {}
    };

    // 也加入未来任务池数据
    ['future', 'week', 'month'].forEach(function(pool) {
      var key = 'quadrant_pool_' + pool;
      try {
        var poolRaw = localStorage.getItem(key);
        if (poolRaw) exportObj['pool_' + pool] = JSON.parse(poolRaw);
      } catch(e) {}
    });

    console.log('[云同步] 导出数据：' + Object.keys(allDateData).length + ' 个日期，' +
                exportObj.cachedDatesIndex.length + ' 个显式缓存');
    return exportObj;
  }

  // ============ GitHub Gist 云同步 ============

  /**
   * 设置 Gist 同步（支持两种模式）
   * - 仅拉取：只需 Gist ID（Gist 须为公开），手机端最简配置
   * - 拉取+推送：需要 Gist ID + Token，两端全自动
   * @param {string} [gistId] 直接传入则跳过 prompt
   * @param {string} [token] 直接传入则跳过 prompt；空字符串=仅拉取
   */
  function setupGistSync(gistId, token) {
    var fromForm = (typeof gistId !== 'undefined');

    if (!fromForm) {
      var existingToken = syncInfo.gistToken || '';
      var tokenHint = existingToken ?
        '（检测到已保存的 Token，将优先使用）\n\n' :
        '（公开 Gist 无需 Token 即可拉取）\n\n';

      gistId = prompt(
        '请输入 GitHub Gist ID：\n\n' +
        '如何获取？\n' +
        '1. 打开 gist.github.com\n' +
        '2. 创建一个新 Gist（建议设为 🔓公开，方便手机免 Token 读取）\n' +
        '3. 从浏览器地址栏复制 Gist ID（如 abc123def456）\n\n' +
        tokenHint +
        '仅需拉取数据 → 输入 Gist ID 即可（Gist 须公开）\n' +
        '需要推送数据 → 还需输入 Token',
        syncInfo.gistId || '');
      if (!gistId) return;
      token = undefined; // 走下面的逻辑
    }

    var existingToken = (typeof token !== 'undefined' && token !== null) ? token : (syncInfo.gistToken || '');

    // 已有 Token → 优先用 Token（保留推送能力）
    if (existingToken) {
      fetchGist(gistId, existingToken).then(function() {
        saveGistConfig(gistId, existingToken, '完整模式（已有Token）');
        showToast('✅ Gist 已连接（拉取+推送模式）\n两端自动同步已就绪');
        pullFromGist(false);
        if (fromForm) openSyncSettings();
      }).catch(function() {
        if (fromForm) {
          // 表单模式：Token 可能不对，提示但不降级（用户可在表单中清除Token重试）
          alert('连接失败：Token 无效或 Gist ID 不存在。\n请检查后重试，或清空 Token 尝试公开访问。');
        } else {
          // Prompt 模式：引导重新输入
          var newToken = prompt(
            '已保存的 Token 失效，请重新输入。\n\n' +
            '或留空切换到仅拉取模式（需 Gist 为公开）：',
            '');
          if (newToken) {
            fetchGist(gistId, newToken).then(function() {
              saveGistConfig(gistId, newToken, '完整模式（新Token）');
              showToast('✅ Gist 已连接（拉取+推送模式）');
              pullFromGist(false);
            }).catch(function(err) {
              alert('连接失败：' + err.message);
            });
          } else {
            fetchGist(gistId, null).then(function() {
              saveGistConfig(gistId, '', '仅拉取模式（公开Gist，Token已失效）');
              showToast('⚠️ Token 已清除，当前为仅拉取模式');
              pullFromGist(false);
            }).catch(function(err) {
              alert('公开访问也失败：' + err.message);
            });
          }
        }
      });
    } else {
      // 无 Token → 先试公开访问
      fetchGist(gistId, null).then(function(gistData) {
        saveGistConfig(gistId, '', '仅拉取模式（公开Gist）');
        if (fromForm) {
          showToast('✅ Gist 已连接（仅拉取模式）\n手机端无需 Token 即可自动同步');
        } else {
          showToast('✅ Gist 已连接（仅拉取模式）\n' +
                    '手机端无需 Token 即可自动同步\n\n' +
                    '如需推送数据，请再次设置并输入 Token。');
        }
        pullFromGist(false);
        if (fromForm) openSyncSettings();
      }).catch(function() {
        if (fromForm) {
          alert('无法访问该 Gist。\n\n可能原因：\n1. Gist ID 不存在\n2. Gist 为私密，需填写 Token');
        } else {
          var newToken = prompt(
            '该 Gist 为私密或不存在，需要 Token 才能访问。\n\n' +
            '请输入 Token（留空取消）：',
            '');
          if (!newToken) return;
          fetchGist(gistId, newToken).then(function() {
            saveGistConfig(gistId, newToken, '完整模式（私密Gist）');
            showToast('✅ Gist 已连接（拉取+推送模式）');
            pullFromGist(false);
          }).catch(function(err) {
            alert('连接失败：' + err.message);
          });
        }
      });
    }
  }

  function saveGistConfig(gistId, token, desc) {
    syncInfo.gistId = gistId;
    syncInfo.gistToken = token;
    syncInfo.enabled = true;
    syncInfo.mode = 'github-gist';
    localStorage.setItem(GIST_ID_KEY, gistId);
    localStorage.setItem(GIST_TOKEN_KEY, token);
    localStorage.setItem(SYNC_ENABLED_KEY, '1');
    localStorage.setItem(SYNC_MODE_KEY, 'github-gist');
    console.log('[云同步] Gist 配置已保存:', desc);
    updateSyncIndicator();
  }

  function fetchGist(gistId, token) {
    var headers = { 'Accept': 'application/vnd.github.v3+json' };
    if (token) headers['Authorization'] = 'token ' + token;
    return fetch('https://api.github.com/gists/' + gistId, { headers: headers }).then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  /**
   * 诊断 Gist 连接：逐步检测问题出在哪一环
   * 返回 "ok" 或错误描述
   */
  function diagnoseGistConnection(callback) {
    var steps = [];
    var report = function(msg) { steps.push(msg); console.log('[诊断]', msg); };

    report('=== 开始诊断 Gist 连接 ===');

    // 检查 1：配置
    if (!syncInfo.gistId) { callback('未配置 Gist ID', steps); return; }
    report('✓ Gist ID: ' + syncInfo.gistId);
    if (!syncInfo.gistToken) { callback('未配置 Token（仅拉取模式无法推送）', steps); return; }
    report('✓ Token: ' + syncInfo.gistToken.substring(0, 7) + '...');

    // 检查 2：基本网络（GET api.github.com）
    report('正在检测 api.github.com 连通性...');
    fetch('https://api.github.com', { method: 'HEAD' }).then(function(res) {
      report('✓ api.github.com 可达 (HTTP ' + res.status + ')');

      // 检查 3：Gist 读取权限
      report('正在检测 Gist 读取权限...');
      return fetchGist(syncInfo.gistId, syncInfo.gistToken);
    }).then(function(gist) {
      report('✓ Gist 可读取 (' + (gist.description || '无描述') + ')');

      // 检查 4：写入权限（最小测试）
      report('正在检测 Gist 写入权限（发送空更新）...');
      var testPayload = {
        files: {}
      };
      testPayload.files[SYNC_FILE_NAME] = {
        content: JSON.stringify({ _test: true, _timestamp: new Date().toISOString() }, null, 2)
      };

      return fetch('https://api.github.com/gists/' + syncInfo.gistId, {
        method: 'PATCH',
        headers: {
          'Authorization': 'token ' + syncInfo.gistToken,
          'Accept': 'application/vnd.github+json'
        },
        body: JSON.stringify(testPayload)
      }).then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status + (res.status === 401 ? ' → Token 无效或权限不足' : res.status === 404 ? ' → Gist 不存在' : ''));
        report('✓ Gist 写入成功 — 一切正常');

        // 写入成功，回写原来的数据
        report('诊断完成：所有检查通过，现在执行完整推送...');
        return res.json().then(function() {
          callback('ok', steps);
        });
      });
    }).catch(function(err) {
      report('✗ 失败: ' + err.message);
      callback(err.message, steps);
    });
  }

  /**
   * 推送数据到 Gist（需要 Token）
   */
  function pushToGist() {
    console.log('[云同步] pushToGist 被调用');

    if (!syncInfo.gistId) {
      alert('请先设置 Gist 同步。');
      return;
    }
    if (!syncInfo.gistToken) {
      alert('当前为仅拉取模式，不支持推送。\n\n如需推送，请重新设置 Gist 同步并输入 Token。');
      return;
    }

    // 显示加载状态
    var pushBtn = document.getElementById('btnGistPush');
    var originalText = pushBtn ? pushBtn.textContent : '📤 推送';
    if (pushBtn) {
      pushBtn.disabled = true;
      pushBtn.textContent = '⏳ 诊断中...';
    }

    setSyncIcon('syncing', '正在检测连接...');

    // 先跑诊断
    diagnoseGistConnection(function(result, steps) {
      if (result !== 'ok') {
        // 诊断失败
        var msg = '❌ 推送失败\n\n诊断报告：\n' + steps.join('\n') +
                  '\n\n📋 建议排查：\n' +
                  '1. 检查 Token 是否过期或被撤销\n' +
                  '2. 确认 Token 勾选了 gist 权限\n' +
                  '3. 确认 Gist 没有被删除\n' +
                  '4. 检查防火墙/VPN 是否拦截了 PATCH 请求';
        setSyncIcon('error', '推送失败');
        alert(msg);
        if (pushBtn) { pushBtn.disabled = false; pushBtn.textContent = originalText; }
        return;
      }

      // 诊断通过，执行实际推送
      setSyncIcon('syncing', '正在推送到云端...');
      if (pushBtn) pushBtn.textContent = '⏳ 推送中...';

      var data = exportAllData();
      var payload = { files: {} };
      payload.files[SYNC_FILE_NAME] = {
        content: JSON.stringify(data, null, 2)
      };

      console.log('[云同步] 开始正式推送...');

      var controller = new AbortController();
      var timeoutId = setTimeout(function() { controller.abort(); }, 20000);

      fetch('https://api.github.com/gists/' + syncInfo.gistId, {
        method: 'PATCH',
        headers: {
          'Authorization': 'token ' + syncInfo.gistToken,
          'Accept': 'application/vnd.github+json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      }).then(function(res) {
        clearTimeout(timeoutId);
        console.log('[云同步] 推送响应:', res.status);
        if (!res.ok) throw new Error('HTTP ' + res.status + (res.status === 401 ? ' (Token无效)' : ''));
        return res.json();
      }).then(function() {
        var now = new Date().toISOString();
        syncInfo.lastSync = now;
        localStorage.setItem(LAST_SYNC_KEY, now);
        setSyncIcon('idle');
        console.log('[云同步] 推送成功');
      }).catch(function(err) {
        clearTimeout(timeoutId);
        var msg = err.name === 'AbortError' ? '请求超时（20秒），请检查网络连接' : err.message;
        console.error('[云同步] 推送失败:', msg);
        setSyncIcon('error', '推送失败：' + msg);
        alert('推送失败：' + msg);
      }).finally(function() {
        if (pushBtn) {
          pushBtn.disabled = false;
          pushBtn.textContent = originalText;
        }
      });
    });
  }

  /**
   * 从 Gist 拉取数据（自动带 Token 如果已配置）
   */
  function pullFromGist(silent) {
    if (!syncInfo.gistId) return Promise.resolve(null);

    if (!silent) setSyncIcon('syncing', '正在从云端拉取...');

    var headers = { 'Accept': 'application/vnd.github.v3+json' };
    if (syncInfo.gistToken) headers['Authorization'] = 'token ' + syncInfo.gistToken;

    return fetch('https://api.github.com/gists/' + syncInfo.gistId, { headers: headers }).then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' — Gist 不可访问（私密 Gist 需要 Token）');
      return res.json();
    }).then(function(gist) {
      var file = gist.files && gist.files[SYNC_FILE_NAME];
      if (!file || !file.content) {
        if (!silent) {
          setSyncIcon('error', 'Gist 中未找到数据文件');
          alert('Gist 中未找到数据文件，请先在电脑端推送一次。');
        }
        return null;
      }

      var data = JSON.parse(file.content);
      importAllData(data);

      var now = new Date().toISOString();
      syncInfo.lastSync = now;
      localStorage.setItem(LAST_SYNC_KEY, now);
      if (!silent) setSyncIcon('idle');

      // 触发页面重新渲染
      refreshAllViews();

      return data;
    }).catch(function(err) {
      if (!silent) {
        setSyncIcon('error', '拉取失败：' + err.message);
        alert('拉取失败：' + err.message);
      }
      console.error('[云同步] 拉取失败:', err.message);
      return null;
    });
  }

  // ============ 数据导入逻辑 ============

  /**
   * 导入全部数据到当前浏览器
   */
  function importAllData(data) {
    if (!data || !data._version) {
      alert('无效的同步数据文件。');
      return;
    }

    var dateCount = 0;

    // 导入缓存日期索引（合并：保留本地独有的日期）
    if (data.cachedDatesIndex && data.cachedDatesIndex.length > 0) {
      try {
        var localIdx = JSON.parse(localStorage.getItem('quadrant_cached_dates_index') || '[]');
        var merged = localIdx.slice();
        data.cachedDatesIndex.forEach(function(d) {
          if (merged.indexOf(d) === -1) merged.push(d);
        });
        merged.sort();
        localStorage.setItem('quadrant_cached_dates_index', JSON.stringify(merged));
      } catch(e) {}
    }

    // 关键修正：日期数据合并写入 quadrant_task_data 大对象（loadAllData/saveAllData）
    // 策略：云端有的日期覆盖本地同名日期，本地独有的日期保留
    if (data.dateData) {
      var existing = {};
      try {
        existing = (typeof loadAllData === 'function') ? loadAllData() :
                   JSON.parse(localStorage.getItem('quadrant_task_data') || '{}');
      } catch(e) { existing = {}; }

      Object.keys(data.dateData).forEach(function(date) {
        existing[date] = data.dateData[date];
        dateCount++;
      });

      if (typeof saveAllData === 'function') {
        saveAllData(existing);
      } else {
        try { localStorage.setItem('quadrant_task_data', JSON.stringify(existing)); } catch(e) {}
      }
    }

    // 导入未来任务池
    ['future', 'week', 'month'].forEach(function(pool) {
      var key = 'pool_' + pool;
      if (data[key]) {
        localStorage.setItem('quadrant_pool_' + pool, JSON.stringify(data[key]));
      }
    });

    // 导入原则
    if (data.principles && data.principles.principles) {
      localStorage.setItem('quadrant_principles', JSON.stringify(data.principles));
    }

    // 导入大任务
    if (data.bigTasks) {
      localStorage.setItem('quadrant_big_tasks', JSON.stringify(data.bigTasks));
    }
    if (data.bigTaskCache) {
      localStorage.setItem('quadrant_big_task_cache', JSON.stringify(data.bigTaskCache));
    }

    console.log('[云同步] 已导入数据，合并 ' + dateCount + ' 个日期');
    return true;
  }

  /**
   * 刷新所有视图（导入数据后调用）
   */
  function refreshAllViews() {
    try {
      if (typeof renderAll === 'function' && typeof currentDate !== 'undefined') {
        renderAll(currentDate);
      }
      if (typeof renderBigTaskPanel === 'function') renderBigTaskPanel();
      if (typeof renderPlanPoolPanel === 'function') renderPlanPoolPanel();
      if (typeof renderPrinciplesPanel === 'function') renderPrinciplesPanel();
      if (typeof renderBigTaskCache === 'function') renderBigTaskCache();
      if (typeof renderCachedDatesPanel === 'function') renderCachedDatesPanel();
    } catch(e) {
      console.warn('[云同步] 刷新视图失败:', e);
    }
  }

  /**
   * 自动从 Gist 拉取（页面加载时静默调用）
   */
  function autoPullFromGist() {
    pullFromGist(true).then(function(data) {
      if (data) {
        console.log('[云同步] 自动拉取成功');
      }
    });
  }

  // 防抖推送定时器
  var pushTimer = null;
  function debouncePushToGist() {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(function() {
      pushToGist();
    }, 3000); // 3秒防抖，避免频繁 API 调用
  }

  /**
   * 测试 Gist 连接
   */
  function testGistConnection(gistId, token) {
    return fetch('https://api.github.com/gists/' + gistId, {
      headers: {
        'Authorization': 'token ' + token,
        'Accept': 'application/vnd.github.v3+json'
      }
    }).then(function(res) {
      return res.ok;
    }).catch(function() {
      return false;
    });
  }

  // ============ Toast 提示 ============

  function showToast(msg) {
    if (typeof window.showToastMessage === 'function') {
      window.showToastMessage(msg, 4000);
    } else {
      alert(msg);
    }
  }

  // ============ 同步状态指示器 ============

  function updateSyncIndicator() {
    var btn = document.getElementById('btnCloudSync');
    if (!btn) return;

    if (!syncInfo.enabled) {
      btn.innerHTML = '☁️';
      btn.title = '点击配置云同步';
      btn.style.color = '';
      return;
    }

    var modeLabel = syncInfo.mode === 'github-gist' ? 'GitHub Gist' : '未知';

    var lastSyncStr = syncInfo.lastSync ? formatTimeAgo(syncInfo.lastSync) : '从未';

    btn.innerHTML = '☁️';
    btn.title = '同步方式：' + modeLabel + '\n上次同步：' + lastSyncStr;
    btn.style.color = 'var(--accent)';
  }

  /**
   * 设置右上角同步图标状态（替代弹窗通知）
   * @param {string} state - 'syncing' | 'idle' | 'error'
   * @param {string} [hint] - 鼠标悬停提示文字
   */
  function setSyncIcon(state, hint) {
    var btn = document.getElementById('btnCloudSync');
    if (!btn) return;
    if (state === 'syncing') {
      btn.innerHTML = '⏳';
      btn.title = hint || '正在同步...';
      btn.style.opacity = '0.7';
    } else if (state === 'error') {
      btn.innerHTML = '⚠️';
      btn.title = hint || '同步失败';
      btn.style.color = '#e53935';
      btn.style.opacity = '1';
      setTimeout(function() { updateSyncIndicator(); }, 3000);
    } else {
      updateSyncIndicator();
      btn.style.opacity = '1';
    }
  }

  function formatTimeAgo(isoStr) {
    if (!isoStr) return '从未';
    var diff = Date.now() - new Date(isoStr).getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    return Math.floor(diff / 86400000) + '天前';
  }

  /**
   * 禁用云同步
   */
  function disableSync() {
    syncInfo.enabled = false;
    syncInfo.mode = null;
    syncInfo.gistId = null;
    syncInfo.gistToken = null;

    localStorage.removeItem(SYNC_ENABLED_KEY);
    localStorage.removeItem(SYNC_MODE_KEY);
    localStorage.removeItem(GIST_ID_KEY);
    localStorage.removeItem(GIST_TOKEN_KEY);

    updateSyncIndicator();
    showToast('云同步已禁用');
  }

  /**
   * 打开同步设置对话框
   */
  function openSyncSettings() {
    var html = '<div style="max-width:440px;">' +
      '<h3 style="margin:0 0 12px;font-size:16px;">☁️ 云同步设置</h3>';

    if (syncInfo.enabled) {
      // 同步方向说明
      var dirLabel = '';
      var dirColor = 'var(--text2)';
      if (syncInfo.mode === 'github-gist') {
        if (syncInfo.gistToken) {
          dirLabel = '⬆️⬇️ 双向同步（本端改动 3 秒后自动推送）';
          dirColor = '#2e7d32';
        } else {
          dirLabel = '⬇️ 仅拉取（本端改动不会上传，需在下方填 Token 才能双向）';
          dirColor = '#e65100';
        }
      }
      html += '<div style="padding:8px 12px;background:var(--accent-light);border-radius:8px;margin-bottom:12px;font-size:12px;">' +
        '🟢 已启用：GitHub Gist 云同步<br>' +
        '同步方向：<b style="color:' + dirColor + '">' + dirLabel + '</b><br>' +
        '上次同步：' + (syncInfo.lastSync ? new Date(syncInfo.lastSync).toLocaleString('zh-CN') : '从未') +
        '</div>';
    } else {
      html += '<div style="padding:8px 12px;background:var(--surface3);border-radius:8px;margin-bottom:12px;font-size:12px;color:var(--text2);">' +
        '⚪ 未配置同步。在下方填写 Gist 信息开始：</div>';
    }

    // --- GitHub Gist 云同步（表单直接嵌入对话框）---
    html += '<p style="font-size:12px;color:var(--text2);margin:0 0 8px;"><b>GitHub Gist 同步</b>（电脑手机全自动）</p>';

    // Gist ID 输入
    html += '<label style="font-size:11px;color:var(--text2);display:block;margin-bottom:2px;">' +
      'Gist ID <span style="color:var(--text3);">— 从 gist.github.com 地址栏复制</span></label>' +
      '<input id="gistIdInput" type="text" placeholder="例如：abc123def456789" ' +
      'value="' + (syncInfo.gistId || '') + '" ' +
      'style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;' +
      'background:var(--surface);color:var(--text);margin-bottom:8px;box-sizing:border-box;">';

    // Token 输入（可选）
    html += '<label style="font-size:11px;color:var(--text2);display:block;margin-bottom:2px;">' +
      'Token <span style="color:var(--text3);">— 可选，需要推送时填写（github.com/settings/tokens → 勾选 gist）</span></label>' +
      '<input id="gistTokenInput" type="password" placeholder="例如：ghp_xxxxxxxxxxxxxxxxxxxx" ' +
      'value="' + (syncInfo.gistToken || '') + '" ' +
      'style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;' +
      'background:var(--surface);color:var(--text);margin-bottom:8px;box-sizing:border-box;">';

    // 连接按钮
    html += '<button class="btn btn-sm btn-info" id="btnGistConnect" style="width:100%;margin-bottom:4px;" ' +
      'onclick="var g=document.getElementById(\'gistIdInput\').value.trim();if(!g){alert(\'请输入Gist ID\');return;}var t=document.getElementById(\'gistTokenInput\').value.trim();CloudSync.setupGistSync(g,t);">' +
      '🔗 连接 GitHub Gist</button>';
    html += '<p style="font-size:10px;color:var(--text3);margin:0 0 4px;">' +
      '公开 Gist → 仅填 Gist ID 即可 · 私密 Gist → 还需填 Token</p>';

    // 当前 GitHub Gist 模式的操作按钮
    if (syncInfo.enabled && syncInfo.mode === 'github-gist') {
      var hasToken = syncInfo.gistToken;
      html += '<div style="display:flex;gap:4px;margin-top:8px;">' +
        '<button class="btn btn-sm btn-success" id="btnGistPush" style="flex:1;"' +
        (hasToken ? ' onclick="CloudSync.pushToGist()"' : ' disabled') + '>📤 推送' + (hasToken ? '' : '(需Token)') + '</button>' +
        '<button class="btn btn-sm btn-info" id="btnGistPull" style="flex:1;" onclick="CloudSync.pullFromGist()">📥 拉取</button>' +
        '</div>';
      if (!hasToken) {
        html += '<p style="font-size:10px;color:var(--text3);margin:4px 0 0;">⚠️ 当前为仅拉取模式，在上方填写 Token 后点"连接"即可推送</p>';
      }
    }

    if (syncInfo.enabled) {
      html += '<button class="btn btn-sm btn-cancel" id="btnGistDisable" style="width:100%;margin-top:12px;" ' +
        'onclick="CloudSync.disableSync()">❌ 禁用云同步</button>';
    }

    html += '<p style="font-size:10px;color:var(--text3);margin:12px 0 0;line-height:1.5;">' +
      '💡 <b>Gist 模式：</b>创建公开 Gist → 手机只需输入 Gist ID 即可拉取；输入 Token 后还可推送（双向自动同步）。' +
      '</p>';

    html += '</div>';

    showModal('cloud-sync-modal', html, [
      { text: '关闭', className: 'btn-cancel', action: closeModal }
    ]);

  }

  // 简单模态框
  function showModal(id, html, buttons) {
    closeModal();
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = id;
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeModal();
    });

    var content = document.createElement('div');
    content.className = 'modal-content';
    content.innerHTML = html;

    if (buttons && buttons.length > 0) {
      var btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:16px;';
      buttons.forEach(function(b) {
        var btn = document.createElement('button');
        btn.className = 'btn btn-sm ' + (b.className || '');
        btn.textContent = b.text;
        btn.addEventListener('click', b.action);
        btnRow.appendChild(btn);
      });
      content.appendChild(btnRow);
    }

    overlay.appendChild(content);
    document.body.appendChild(overlay);
  }

  function closeModal() {
    var existing = document.querySelector('.modal-overlay');
    if (existing) existing.remove();
  }

  // ============ 公开 API ============
  return {
    init: init,
    onDataChanged: onDataChanged,
    setupGistSync: setupGistSync,
    pushToGist: pushToGist,
    pullFromGist: pullFromGist,
    disableSync: disableSync,
    openSyncSettings: openSyncSettings,
    updateSyncIndicator: updateSyncIndicator,
    getSyncInfo: function() { return syncInfo; }
  };
})();
