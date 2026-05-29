// highlight.js - Text highlight system (star toggle + mouse select + Ctrl+Q or right-click)
var _highlightSelection = null;

// Toggle full-text highlight for a task (via star button)
function toggleTaskHighlight(quadrantKey, taskId, blockId) {
  var data = loadDateData(currentDate);
  var item = null;
  if (blockId) {
    for (var i = 0; i < data[quadrantKey].length; i++) {
      if (data[quadrantKey][i].id === blockId && data[quadrantKey][i].blockName !== undefined) {
        var tasks = data[quadrantKey][i].tasks || [];
        for (var j = 0; j < tasks.length; j++) {
          if (tasks[j].id === taskId) { item = tasks[j]; break; }
        }
        break;
      }
    }
  } else {
    for (var k = 0; k < data[quadrantKey].length; k++) {
      if (data[quadrantKey][k].id === taskId && !data[quadrantKey][k].blockName) {
        item = data[quadrantKey][k];
        break;
      }
    }
  }
  if (!item) return;

  // Toggle: if any highlights exist, clear them; otherwise highlight entire text
  if (item.highlights && item.highlights.length > 0) {
    item.highlights = [];
  } else {
    var len = (item.text || '').length;
    if (len > 0) {
      item.highlights = [{ start: 0, end: len }];
    }
  }
  saveDateData(currentDate, data);
  renderQuadrantOnly(quadrantKey);
}

function trackTextSelection(el, quadrantKey, taskId, blockId) {
  setTimeout(function() {
    var sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) {
      _highlightSelection = null;
      return;
    }
    var range = sel.getRangeAt(0);
    var container = range.commonAncestorContainer;
    if (!el.contains(container)) {
      _highlightSelection = null;
      return;
    }
    var rawText = el.dataset.rawText || el.textContent || '';
    var selText = sel.toString();
    if (!selText) { _highlightSelection = null; return; }
    var startIdx = rawText.indexOf(selText);
    if (startIdx === -1) { _highlightSelection = null; return; }
    _highlightSelection = {
      el: el,
      quadrantKey: quadrantKey,
      taskId: taskId,
      blockId: blockId,
      start: startIdx,
      end: startIdx + selText.length,
      rawText: rawText
    };
  }, 10);
}

function addHighlightFromSelection() {
  if (!_highlightSelection) return false;
  addHighlightToTask(
    _highlightSelection.quadrantKey,
    _highlightSelection.taskId,
    _highlightSelection.blockId,
    _highlightSelection.start,
    _highlightSelection.end
  );
  _highlightSelection = null;
  return true;
}

function addHighlightToTask(quadrantKey, taskId, blockId, start, end) {
  var data = loadDateData(currentDate);
  if (blockId) {
    for (var i = 0; i < data[quadrantKey].length; i++) {
      if (data[quadrantKey][i].id === blockId && data[quadrantKey][i].blockName !== undefined) {
        var tasks = data[quadrantKey][i].tasks || [];
        for (var j = 0; j < tasks.length; j++) {
          if (tasks[j].id === taskId) {
            if (!tasks[j].highlights) tasks[j].highlights = [];
            tasks[j].highlights.push({ start: start, end: end });
            break;
          }
        }
        break;
      }
    }
  } else {
    for (var k = 0; k < data[quadrantKey].length; k++) {
      if (data[quadrantKey][k].id === taskId && !data[quadrantKey][k].blockName) {
        if (!data[quadrantKey][k].highlights) data[quadrantKey][k].highlights = [];
        data[quadrantKey][k].highlights.push({ start: start, end: end });
        break;
      }
    }
  }
  saveDateData(currentDate, data);
  renderQuadrantOnly(quadrantKey);
}

function showHighlightContextMenu(e, el, quadrantKey, taskId, blockId) {
  trackTextSelection(el, quadrantKey, taskId, blockId);
  if (!_highlightSelection) return;

  e.preventDefault();
  e.stopPropagation();

  var existing = document.getElementById('highlightContextMenu');
  if (existing) existing.remove();

  var menu = document.createElement('div');
  menu.id = 'highlightContextMenu';
  menu.className = 'highlight-context-menu';
  menu.style.left = e.pageX + 'px';
  menu.style.top = e.pageY + 'px';

  var item = document.createElement('div');
  item.className = 'highlight-context-item';
  item.textContent = '🖍️ 高亮选中文本';
  item.addEventListener('click', function(ev) {
    ev.stopPropagation();
    addHighlightFromSelection();
    menu.remove();
  });
  menu.appendChild(item);

  document.body.appendChild(menu);

  setTimeout(function() {
    document.addEventListener('click', function closeMenu() {
      if (menu.parentNode) menu.remove();
      document.removeEventListener('click', closeMenu);
    }, { once: true });
  }, 10);
}
