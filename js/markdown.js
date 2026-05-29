// markdown.js - Markdown 导入导出

function exportToMarkdown() {
  var data = loadDateData(currentDate);
  var lines = [];
  lines.push('# 任务记录 - ' + currentDate);
  lines.push('');

  QUADRANT_KEYS.forEach(function(key) {
    var q = QUADRANTS[key];
    lines.push('## ' + q.id + '. ' + q.name);
    lines.push('');

    var items = data[key] || [];
    if (items.length === 0) {
      lines.push('- (无)');
    } else {
      items.forEach(function(item) {
        if (item.blockName !== undefined) {
          lines.push('- **📦 ' + item.blockName + '** (' + (item.progress || '100%') + ')');
          if (item.tasks && item.tasks.length > 0) {
            item.tasks.forEach(function(task) {
              var checkbox = task.completed ? '[x]' : '[ ]';
              lines.push('    - ' + checkbox + ' ' + (task.text || ''));
            });
          } else {
            lines.push('    - (无子任务)');
          }
        } else {
          var checkbox = item.completed ? '[x]' : '[ ]';
          var progress = item.progress && item.progress !== '100%' ? ' (' + item.progress + ')' : '';
          var due = item.dueDate ? ' 📅' + item.dueDate : '';
          lines.push('- ' + checkbox + ' ' + (item.text || '') + progress + due);
        }
      });
    }
    lines.push('');
  });

  var blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'tasks_' + currentDate + '.md';
  a.click();
  URL.revokeObjectURL(url);
}

function importFromMarkdown(mdText) {
  var lines = mdText.split('\n');
  var data = { I: [], II: [], III: [], IV: [] };
  var currentQuadrant = null;
  var currentBlock = null;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];

    var quadMatch = line.match(/^##\s*(I+)\s*\.\s*/);
    if (quadMatch) {
      var qKey = quadMatch[1];
      if (QUADRANTS[qKey]) {
        currentQuadrant = qKey;
        currentBlock = null;
      }
      continue;
    }

    if (!currentQuadrant) continue;

    if (line.trim() === '- (无)') continue;

    var blockMatch = line.match(/^-\s*\*\*📦\s+(.+?)\*\*\s*(\(.+?\))?$/);
    if (blockMatch) {
      var blockName = blockMatch[1].trim();
      var progress = blockMatch[2] ? blockMatch[2].replace(/[()]/g, '').trim() : '100%';
      currentBlock = {
        id: generateId(),
        blockName: blockName,
        progress: progress,
        tasks: []
      };
      data[currentQuadrant].push(currentBlock);
      continue;
    }

    var subtaskMatch = line.match(/^\s{4}-\s+\[(x|\s)\]\s+(.+)$/);
    if (subtaskMatch && currentBlock) {
      currentBlock.tasks.push({
        id: generateId(),
        text: subtaskMatch[2].trim(),
        completed: subtaskMatch[1] === 'x'
      });
      continue;
    }

    var taskMatch = line.match(/^-\s+\[(x|\s)\]\s+(.+?)(\s*\((\d+%|<50%)\))?(\s*📅(\d{4}-\d{2}-\d{2}))?\s*$/);
    if (taskMatch) {
      var progress = taskMatch[4] || '100%';
      var dueDate = taskMatch[6] || '';
      data[currentQuadrant].push({
        id: generateId(),
        text: taskMatch[2].trim(),
        completed: taskMatch[1] === 'x',
        progress: progress,
        dueDate: dueDate
      });
      currentBlock = null;
    }
  }

  return data;
}

function handleFileImport(file) {
  if (!file.name.endsWith('.md') && !file.name.endsWith('.txt')) {
    alert('请选择 .md 或 .txt 文件');
    return;
  }

  var reader = new FileReader();
  reader.onload = function(e) {
    var mdText = e.target.result;
    var importedData = importFromMarkdown(mdText);

    var hasContent = false;
    QUADRANT_KEYS.forEach(function(key) {
      if (importedData[key] && importedData[key].length > 0) hasContent = true;
    });

    if (!hasContent) {
      alert('未能从文件中解析到任务数据，请检查文件格式');
      return;
    }

    var currentData = loadDateData(currentDate);
    var hasExisting = false;
    QUADRANT_KEYS.forEach(function(key) {
      if (currentData[key] && currentData[key].length > 0) hasExisting = true;
    });

    if (hasExisting) {
      if (!confirm('当前日期已有任务数据，导入将覆盖现有数据，确定继续？')) return;
    }

    saveDateData(currentDate, importedData);
    renderAll(currentDate);
    alert('导入成功！');
  };
  reader.readAsText(file);
}
