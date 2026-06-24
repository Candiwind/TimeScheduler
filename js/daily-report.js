// daily-report.js - Daily report generation with preview and download
function setupDailyReport() {
  document.getElementById('btnDailyReport').addEventListener('click', showDailyReport);
}

function showDailyReport() {
  var existing = document.getElementById('dailyReportModal');
  if (existing) existing.remove();

  var data = loadDateData(currentDate);
  var stats = calcWeightedCompletion(data);
  var reportMd = buildDailyReportMd(currentDate, data, stats);
  var reportHtml = buildDailyReportHtml(currentDate, data, stats);

  var modal = document.createElement('div');
  modal.id = 'dailyReportModal';
  modal.className = 'modal-overlay';

  var content = document.createElement('div');
  content.className = 'modal-content';
  content.style.maxWidth = '700px';
  content.style.maxHeight = '88vh';
  content.style.overflowY = 'auto';
  content.style.padding = '28px';

  // Title
  var title = document.createElement('h2');
  title.textContent = '📋 日报 - ' + currentDate;
  title.style.marginTop = '0';
  content.appendChild(title);

  // HTML preview body
  var preview = document.createElement('div');
  preview.style.cssText = 'background:var(--surface3);border-radius:10px;padding:18px 22px;margin:14px 0;font-size:13px;line-height:1.8;max-height:55vh;overflow-y:auto;border:1px solid var(--border);';
  preview.innerHTML = reportHtml;
  content.appendChild(preview);

  // Button row
  var btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:14px;';

  var downloadBtn = document.createElement('button');
  downloadBtn.className = 'btn btn-success btn-sm';
  downloadBtn.textContent = '📥 下载 MD';
  downloadBtn.addEventListener('click', function() {
    downloadMarkdown(reportMd, '日报_' + currentDate + '.md');
  });
  btnRow.appendChild(downloadBtn);

  var copyBtn = document.createElement('button');
  copyBtn.className = 'btn btn-info btn-sm';
  copyBtn.textContent = '📋 复制';
  copyBtn.addEventListener('click', function() {
    navigator.clipboard.writeText(reportMd).then(function() {
      alert('已复制到剪贴板');
    });
  });
  btnRow.appendChild(copyBtn);

  var closeBtn2 = document.createElement('button');
  closeBtn2.className = 'btn btn-sm btn-cancel';
  closeBtn2.textContent = '关闭';
  closeBtn2.addEventListener('click', function() { modal.remove(); });
  btnRow.appendChild(closeBtn2);

  content.appendChild(btnRow);
  modal.appendChild(content);
  document.body.appendChild(modal);

  modal.addEventListener('click', function(e) {
    if (e.target === modal) modal.remove();
  });
}

function buildDailyReportMd(date, data, stats) {
  var lines = [];
  lines.push('# 📋 日报 — ' + date);
  lines.push('');
  lines.push('## 📊 概览');
  lines.push('');
  lines.push('| 指标 | 数值 |');
  lines.push('|------|------|');
  lines.push('| 总任务数 | ' + stats.total + ' |');
  lines.push('| 已完成 | ' + stats.done + ' |');
  lines.push('| 简单完成率 | ' + stats.simpleRate + '% |');
  lines.push('| 加权完成率 | ' + stats.weightedRate + '% (所有任务权重均等，自动合计100%) |');
  var deferCount = data._deferred || 0;
  lines.push('| 今日推迟 | ' + deferCount + ' |');
  var extraCount = calcExtraCompleted(data);
  if (extraCount > 0) {
    lines.push('| 额外完成 | ' + extraCount + ' |');
  }
  // Time slot breakdown in overview
  var slotStats = calcTimeSlotCompletion(data);
  var slotGroupKeys2 = ['早晨 + 上午', '中午 + 下午', '傍晚 + 晚上'];
  var slotRows = '';
  slotGroupKeys2.forEach(function(gk) {
    var gd = slotStats[gk];
    var rate2 = gd.total > 0 ? Math.round((gd.done / gd.total) * 100) : 0;
    slotRows += '| ' + gd.icons + ' ' + gk + ' | ' + gd.done + '/' + gd.total + ' | ' + rate2 + '% |\n';
  });
  lines.push(slotRows);
  lines.push('');

  QUADRANT_KEYS.forEach(function(key) {
    var q = QUADRANTS[key];
    var items = data[key] || [];
    var qc = calcQuadrantCompletion(items);
    lines.push('## ' + q.icon + ' ' + q.name + '（' + qc.done + '/' + qc.total + '）');
    lines.push('');

    if (items.length === 0) {
      lines.push('- （无任务）');
    } else {
      items.forEach(function(item) {
        if (item.blockName !== undefined) {
          lines.push('- **📦 ' + item.blockName + '**');
          if (item.tasks && item.tasks.length > 0) {
            item.tasks.forEach(function(t) {
              var status = t.completed ? '✅' : '⬜';
              var extra = t.extraCompleted ? ' 🎁' : '';
              lines.push('  - ' + status + ' ' + t.text + extra);
            });
          }
        } else {
          var status = item.completed ? '✅' : '⬜';
          var extra = item.extraCompleted ? ' 🎁' : '';
          var timeLabel = item.timeSlot ? ' ' + (TIME_SLOTS.find(function(s) { return s.key === item.timeSlot; }) || {}).icon || '' : '';
          lines.push('- ' + status + ' ' + (item.text || '') + timeLabel + extra);
        }
      });
    }
    lines.push('');
  });

  // Plan pool sections (待办池/周计划/月计划)
  var planPools = [
    { title: '📥 待办池', loadFn: loadFutureTasks },
    { title: '📅 周计划', loadFn: loadWeekTasks },
    { title: '🗓️ 月计划', loadFn: loadMonthTasks }
  ];

  planPools.forEach(function(pool) {
    var poolTasks = pool.loadFn();
    lines.push('## ' + pool.title + '（' + poolTasks.length + '）');
    lines.push('');
    if (poolTasks.length === 0) {
      lines.push('- （无任务）');
    } else {
      poolTasks.forEach(function(ft) {
        if (ft.type === 'block') {
          lines.push('- **📦 ' + (ft.blockName || '') + '**');
          if (ft.tasks && ft.tasks.length > 0) {
            ft.tasks.forEach(function(st) {
              var targetLabel = st.targetQuadrant ? ' → ' + ((QUADRANTS[st.targetQuadrant] || {}).name || st.targetQuadrant) : '';
              var dateLabel = st.scheduledDate ? ' 📅' + st.scheduledDate : '';
              lines.push('  - ⬜ ' + (st.text || '') + targetLabel + dateLabel);
            });
          }
        } else {
          var targetLabel2 = ft.targetQuadrant ? ' → ' + ((QUADRANTS[ft.targetQuadrant] || {}).name || ft.targetQuadrant) : '';
          var dateLabel2 = ft.scheduledDate ? ' 📅' + ft.scheduledDate : '';
          lines.push('- ⬜ ' + (ft.text || '') + targetLabel2 + dateLabel2);
        }
      });
    }
    lines.push('');
  });

  // Note section
  lines.push('## 📝 备注');
  lines.push('');
  lines.push('> 长期进步要重视 II 象限（重要不紧急）任务。');
  if (stats.weightedRate >= 80) {
    lines.push('> 今日完成率优秀，继续保持！');
  } else if (stats.weightedRate >= 50) {
    lines.push('> 今日有一定进展，重点关注 II 象限任务。');
  } else {
    lines.push('> 今日完成率偏低，建议回顾 I/II 象限任务优先级。');
  }
  lines.push('');

  return lines.join('\n');
}

function buildDailyReportHtml(date, data, stats) {
  var h = '';
  h += '<h3 style="margin:0 0 12px;color:var(--accent);">📊 概览</h3>';
  h += '<table style="width:100%;border-collapse:collapse;margin-bottom:16px;">';
  h += '<tr><td style="padding:4px 12px;">总任务数</td><td style="font-weight:700;">' + stats.total + '</td></tr>';
  h += '<tr><td style="padding:4px 12px;">已完成</td><td style="font-weight:700;color:#5cb85c;">' + stats.done + '</td></tr>';
  h += '<tr><td style="padding:4px 12px;">加权完成率</td><td style="font-weight:700;color:var(--accent);">' + stats.weightedRate + '%</td></tr>';
  var deferCount = data._deferred || 0;
  h += '<tr><td style="padding:4px 12px;">今日推迟</td><td style="color:#f0ad4e;">' + deferCount + '</td></tr>';
  var extraCount = calcExtraCompleted(data);
  if (extraCount > 0) {
    h += '<tr><td style="padding:4px 12px;">额外完成</td><td style="color:#f0ad4e;">' + extraCount + '</td></tr>';
  }
  // Time slot rows in overview table
  var slotStatsHtml = calcTimeSlotCompletion(data);
  ['早晨 + 上午', '中午 + 下午', '傍晚 + 晚上'].forEach(function(gk) {
    var gd = slotStatsHtml[gk];
    var rate3 = gd.total > 0 ? Math.round((gd.done / gd.total) * 100) : 0;
    h += '<tr><td style="padding:4px 12px;">' + gd.icons + ' ' + gk + '</td><td style="font-weight:700;color:var(--accent);">' + gd.done + '/' + gd.total + ' <span style="font-size:11px;opacity:0.8;">(' + rate3 + '%)</span></td></tr>';
  });
  h += '</table>';

  QUADRANT_KEYS.forEach(function(key) {
    var q = QUADRANTS[key];
    var items = data[key] || [];
    var qc = calcQuadrantCompletion(items);
    var qColors = { I: '#ffb3b3', II: '#b3d4ff', III: '#fff5b3', IV: '#c3f0c3' };
    h += '<h3 style="margin:0 0 8px;background:' + qColors[key] + ';padding:6px 12px;border-radius:6px;font-size:14px;">' + q.icon + ' ' + q.name + ' <span style="font-size:12px;">（' + qc.done + '/' + qc.total + '）</span></h3>';

    if (items.length === 0) {
      h += '<p style="color:var(--text3);padding:0 12px;">（无任务）</p>';
    } else {
      h += '<ul style="margin:4px 0 14px;padding-left:24px;">';
      items.forEach(function(item) {
        if (item.blockName !== undefined) {
          h += '<li><strong>📦 ' + Util.escHtml(item.blockName) + '</strong><ul>';
          if (item.tasks) {
            item.tasks.forEach(function(t) {
              var icon = t.completed ? '✅' : '⬜';
              var cls = t.completed ? 'style="text-decoration:line-through;opacity:0.6;"' : '';
              var extra = t.extraCompleted ? ' 🎁' : '';
              h += '<li ' + cls + '>' + icon + ' ' + Util.escHtml(t.text) + extra + '</li>';
            });
          }
          h += '</ul></li>';
        } else {
          var icon = item.completed ? '✅' : '⬜';
          var cls = item.completed ? 'style="text-decoration:line-through;opacity:0.6;"' : '';
          var extra = item.extraCompleted ? ' 🎁' : '';
          var timeLabel = item.timeSlot ? ' ' + ((TIME_SLOTS.find(function(s) { return s.key === item.timeSlot; }) || {}).icon || '') : '';
          h += '<li ' + cls + '>' + icon + ' ' + Util.escHtml(item.text || '') + timeLabel + extra + '</li>';
        }
      });
      h += '</ul>';
    }
  });

  // Plan pool sections (待办池/周计划/月计划)
  var poolColors = { '📥 待办池': '#e8d5f5', '📅 周计划': '#d5e5f5', '🗓️ 月计划': '#d5f5e0' };
  var planPoolsHtml = [
    { title: '📥 待办池', loadFn: loadFutureTasks },
    { title: '📅 周计划', loadFn: loadWeekTasks },
    { title: '🗓️ 月计划', loadFn: loadMonthTasks }
  ];

  planPoolsHtml.forEach(function(pool) {
    var poolTasks = pool.loadFn();
    h += '<h3 style="margin:0 0 8px;background:' + (poolColors[pool.title] || '#e8e8e8') + ';padding:6px 12px;border-radius:6px;font-size:14px;">' + pool.title + ' <span style="font-size:12px;">（' + poolTasks.length + '）</span></h3>';
    if (poolTasks.length === 0) {
      h += '<p style="color:var(--text3);padding:0 12px;">（无任务）</p>';
    } else {
      h += '<ul style="margin:4px 0 14px;padding-left:24px;">';
      poolTasks.forEach(function(ft) {
        if (ft.type === 'block') {
          h += '<li><strong>📦 ' + Util.escHtml(ft.blockName || '') + '</strong><ul>';
          if (ft.tasks && ft.tasks.length > 0) {
            ft.tasks.forEach(function(st) {
              var targetLabel = st.targetQuadrant ? ' → ' + ((QUADRANTS[st.targetQuadrant] || {}).name || st.targetQuadrant) : '';
              var dateLabel = st.scheduledDate ? ' 📅' + st.scheduledDate : '';
              h += '<li>⬜ ' + Util.escHtml(st.text || '') + targetLabel + dateLabel + '</li>';
            });
          }
          h += '</ul></li>';
        } else {
          var targetLabel2 = ft.targetQuadrant ? ' → ' + ((QUADRANTS[ft.targetQuadrant] || {}).name || ft.targetQuadrant) : '';
          var dateLabel2 = ft.scheduledDate ? ' 📅' + ft.scheduledDate : '';
          h += '<li>⬜ ' + Util.escHtml(ft.text || '') + targetLabel2 + dateLabel2 + '</li>';
        }
      });
      h += '</ul>';
    }
  });

  // Note
  var note = '';
  if (stats.weightedRate >= 80) {
    note = '🎉 今日完成率优秀，继续保持！';
  } else if (stats.weightedRate >= 50) {
    note = '📌 今日有一定进展，重点关注 II 象限任务。';
  } else {
    note = '💪 今日完成率偏低，建议回顾 I/II 象限任务优先级。';
  }
  h += '<p style="color:var(--text2);font-size:12px;border-top:1px solid var(--border);padding-top:8px;">' + note + '</p>';

  return h;
}

function downloadMarkdown(text, filename) {
  var blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
