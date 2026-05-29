// defer.js - Defer tasks and toggle extra-completed
function handleDeferTask(quadrantKey, taskId, blockId) {
  var data = loadDateData(currentDate);
  var found = null;
  if (blockId) {
    for (var i = 0; i < data[quadrantKey].length; i++) {
      if (data[quadrantKey][i].id === blockId && data[quadrantKey][i].blockName !== undefined) {
        var tasks = data[quadrantKey][i].tasks || [];
        for (var j = 0; j < tasks.length; j++) {
          if (tasks[j].id === taskId) { found = tasks.splice(j, 1)[0]; break; }
        }
        break;
      }
    }
  } else {
    for (var k = 0; k < data[quadrantKey].length; k++) {
      if (data[quadrantKey][k].id === taskId && !data[quadrantKey][k].blockName) {
        found = data[quadrantKey].splice(k, 1)[0];
        break;
      }
    }
  }
  if (!found) return;

  var result = deferQuadrantTask({
    text: found.text,
    bigTaskRef: found.bigTaskRef || null,
    quadrantKey: quadrantKey
  });

  if (data._deferred === undefined) data._deferred = 0;
  data._deferred++;
  saveDateData(currentDate, data);

  if (result === 'pool') {
    Toast.show('已推迟回大任务池（日期+1天）', function() {
      var d = loadDateData(currentDate);
      if (blockId) {
        for (var i = 0; i < d[quadrantKey].length; i++) {
          if (d[quadrantKey][i].id === blockId && d[quadrantKey][i].blockName !== undefined) {
            if (!d[quadrantKey][i].tasks) d[quadrantKey][i].tasks = [];
            d[quadrantKey][i].tasks.push(found);
            break;
          }
        }
      } else {
        d[quadrantKey].push(found);
      }
      saveDateData(currentDate, d);
      if (found.bigTaskRef) {
        var bts = loadBigTasks();
        for (var i = 0; i < bts.length; i++) {
          if (bts[i].id === found.bigTaskRef.bigTaskId && bts[i].milestones) {
            for (var j = 0; j < bts[i].milestones.length; j++) {
              if (bts[i].milestones[j].tasks) {
                for (var k = 0; k < bts[i].milestones[j].tasks.length; k++) {
                  if (bts[i].milestones[j].tasks[k].id === found.bigTaskRef.subtaskId) {
                    bts[i].milestones[j].tasks[k].plannedDate = currentDate;
                    saveBigTasks(bts);
                    break;
                  }
                }
              }
            }
          }
        }
      } else {
        var fts = loadFutureTasks();
        fts.pop();
        saveFutureTasks(fts);
      }
      renderAll(currentDate);
    });
  } else if (result === 'future') {
    Toast.show('已推迟到待办任务池', function() {
      var d = loadDateData(currentDate);
      if (blockId) {
        for (var i = 0; i < d[quadrantKey].length; i++) {
          if (d[quadrantKey][i].id === blockId && d[quadrantKey][i].blockName !== undefined) {
            if (!d[quadrantKey][i].tasks) d[quadrantKey][i].tasks = [];
            d[quadrantKey][i].tasks.push(found);
            break;
          }
        }
      } else {
        d[quadrantKey].push(found);
      }
      saveDateData(currentDate, d);
      var fts = loadFutureTasks();
      fts.pop();
      saveFutureTasks(fts);
      renderAll(currentDate);
    });
  }
  renderAll(currentDate);
}

function handleDeferSubtask(quadrantKey, blockId, subtaskId) {
  handleDeferTask(quadrantKey, subtaskId, blockId);
}

// ---- Extra Completed ----

function toggleTaskExtra(quadrantKey, taskId, blockId) {
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
  if (item) {
    item.extraCompleted = !item.extraCompleted;
    saveDateData(currentDate, data);
    renderQuadrantOnly(quadrantKey);
  }
}

function toggleSubtaskExtra(quadrantKey, blockId, taskId) {
  toggleTaskExtra(quadrantKey, taskId, blockId);
}

function calcExtraCompleted(data) {
  var count = 0;
  QUADRANT_KEYS.forEach(function(key) {
    (data[key] || []).forEach(function(item) {
      if (item.blockName !== undefined) {
        if (item.tasks) item.tasks.forEach(function(t) { if (t.extraCompleted) count++; });
      } else {
        if (item.extraCompleted) count++;
      }
    });
  });
  return count;
}
