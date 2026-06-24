// stats-ui.js - Statistics modal and recent history
function setupStatsButton() {
  document.getElementById('btnShowStats').addEventListener('click', showStatsModal);
}

function showStatsModal() {
  var existing = document.getElementById('statsModal');
  if (existing) existing.remove();

  var data = loadDateData(currentDate);
  var stats = calcWeightedCompletion(data);

  var modal = document.createElement('div');
  modal.id = 'statsModal';
  modal.className = 'modal-overlay';

  var content = document.createElement('div');
  content.className = 'modal-content';
  content.style.maxWidth = '580px';
  content.style.maxHeight = '85vh';
  content.style.overflowY = 'auto';

  var title = document.createElement('h2');
  title.textContent = '📈 任务统计 - ' + currentDate;
  content.appendChild(title);

  var weightHint = document.createElement('p');
  weightHint.style.cssText = 'font-size:11px;color:var(--text2);margin-bottom:4px;';
  weightHint.innerHTML = '完成率加权：所有任务权重均等，单项权重=100%÷任务总数';
  content.appendChild(weightHint);

  // All tasks have equal weight; per-task percentage = 100% / total task count
  var perTaskPctVal = stats.total > 0 ? (100 / stats.total).toFixed(1) : 0;

  var grid = document.createElement('div');
  grid.className = 'stats-grid';

  QUADRANT_KEYS.forEach(function(key) {
    var q = QUADRANTS[key];
    var qc = stats.quadRates[key];
    var quadWeight = stats.total > 0 ? Math.round((qc.total / stats.total) * 100) : 0;
    var quadDiv = document.createElement('div');
    quadDiv.className = 'stats-quad sq-' + key.toLowerCase();
    quadDiv.innerHTML =
      '<div class="sq-name">' + q.icon + ' ' + q.name + ' <small>(任务占比 ' + quadWeight + '%)</small></div>' +
      '<div class="sq-total">' + qc.total + '</div>' +
      '<div class="sq-done">完成 ' + qc.done + ' / ' + qc.total + ' (' + Math.round(qc.rate * 100) + '%)</div>' +
      '<div style="font-size:10px;opacity:0.7;">单任务占比: ' + perTaskPctVal + '%</div>';
    grid.appendChild(quadDiv);
  });

  content.appendChild(grid);

  // Time slot completion breakdown
  var slotStats = calcTimeSlotCompletion(data);
  var slotTitle = document.createElement('h3');
  slotTitle.textContent = '⏰ 分时段完成情况';
  slotTitle.style.cssText = 'margin-top:16px;margin-bottom:8px;';
  content.appendChild(slotTitle);

  var slotGroups = [
    { label: '早晨 + 上午', keys: ['early_morn', 'forenoon'] },
    { label: '中午 + 下午', keys: ['noon', 'afternoon'] },
    { label: '傍晚 + 晚上', keys: ['dusk', 'night'] }
  ];

  slotGroups.forEach(function(g) {
    var gd = slotStats[g.label];
    var rate = gd.total > 0 ? Math.round((gd.done / gd.total) * 100) : 0;
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 12px;margin-bottom:6px;background:var(--surface3);border-radius:8px;font-size:13px;';
    row.innerHTML =
      '<span style="font-size:16px;width:60px;text-align:center;">' + gd.icons + '</span>' +
      '<span style="flex:1;font-weight:600;">' + g.label + '</span>' +
      '<span style="color:var(--accent);font-weight:700;">' + gd.done + '/' + gd.total + '</span>' +
      '<span style="font-weight:700;min-width:42px;text-align:right;">' + rate + '%</span>';
    content.appendChild(row);
  });

  var overall = document.createElement('p');
  overall.style.cssText = 'text-align:center;padding:12px;background:var(--surface3);border-radius:8px;margin-top:10px;font-size:14px;';
  overall.innerHTML =
    '<strong>总计：</strong>' + stats.total + ' 个任务 | <strong>完成：</strong>' + stats.done + ' 个<br>' +
    '<strong>简单完成率：</strong>' + stats.simpleRate + '% | <strong>加权完成率：</strong>' + stats.weightedRate + '%';
  var deferCount = data._deferred || 0;
  if (deferCount > 0) {
    overall.innerHTML += '<br><strong>今日推迟：</strong>' + deferCount + ' 个';
  }
  var extraCount = calcExtraCompleted(data);
  if (extraCount > 0) {
    overall.innerHTML += ' | <strong>额外完成：</strong>' + extraCount + ' 个';
  }
  content.appendChild(overall);

  var recentTitle = document.createElement('h3');
  recentTitle.textContent = '📊 最近完成情况';
  recentTitle.style.cssText = 'margin-top:16px;margin-bottom:8px;';
  content.appendChild(recentTitle);

  var historyHtml = buildRecentHistoryHTML(currentDate);
  var historyDiv = document.createElement('div');
  historyDiv.innerHTML = historyHtml;
  historyDiv.style.cssText = 'font-size:12px;';
  content.appendChild(historyDiv);

  var closeBtn = document.createElement('button');
  closeBtn.className = 'btn btn-sm btn-cancel';
  closeBtn.textContent = '关闭';
  closeBtn.style.marginTop = '12px';
  closeBtn.addEventListener('click', function() { modal.remove(); });
  content.appendChild(closeBtn);

  modal.appendChild(content);
  document.body.appendChild(modal);

  modal.addEventListener('click', function(e) {
    if (e.target === modal) modal.remove();
  });
}

function buildRecentHistoryHTML(today) {
  var all = loadAllData();
  var dates = Object.keys(all).filter(function(d) { return /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today; }).sort().reverse().slice(0, 7);
  if (dates.length === 0) return '<p style="color:var(--text3);">暂无历史数据</p>';

  var html = '<table style="width:100%;border-collapse:collapse;">';
  html += '<tr style="border-bottom:1px solid var(--border);"><th style="text-align:left;padding:4px 8px;">日期</th><th style="text-align:center;">任务数</th><th style="text-align:center;">完成</th><th style="text-align:center;">完成率</th></tr>';
  dates.forEach(function(d) {
    var dayData = all[d];
    var dayStats = calcWeightedCompletion(dayData);
    html += '<tr style="border-bottom:1px solid var(--border);">';
    html += '<td style="padding:4px 8px;">' + d + '</td>';
    html += '<td style="text-align:center;">' + dayStats.total + '</td>';
    html += '<td style="text-align:center;">' + dayStats.done + '</td>';
    html += '<td style="text-align:center;font-weight:600;">' + dayStats.weightedRate + '%</td>';
    html += '</tr>';
  });
  html += '</table>';
  return html;
}
