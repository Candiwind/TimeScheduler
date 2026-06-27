// util.js - Shared helpers (exposed as both Util.* and bare globals)
var Util = (function() {
  function escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function calcDaysLeft(targetDate) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var target = new Date(targetDate + 'T00:00:00');
    return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
  }

  // Walk all "leaf" completable items in quadrant/date data.
  // A leaf is a stage (if task has stages), a subtask (if block), or the task itself.
  // callback(leaf, info):
  //   leaf — the completable item (.completed, .timeSlot, etc.)
  //   info.type — 'task' | 'subtask' | 'stage'
  //   info.parent — immediate parent (null for standalone tasks)
  //   info.grandparent — block for subtasks/stages under block, null otherwise
  //   info.timeSlot — effective timeSlot for the leaf
  function walkLeafItems(items, callback) {
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item.blockName !== undefined) {
        // Task block — each subtask is a leaf (or each stage of subtask)
        if (item.tasks) {
          for (var j = 0; j < item.tasks.length; j++) {
            var sub = item.tasks[j];
            if (sub.stages && sub.stages.length > 0) {
              for (var k = 0; k < sub.stages.length; k++) {
                callback(sub.stages[k], { type: 'stage', parent: sub, grandparent: item, timeSlot: sub.stages[k].timeSlot || '' });
              }
            } else {
              callback(sub, { type: 'subtask', parent: item, grandparent: null, timeSlot: sub.timeSlot || '' });
            }
          }
        }
      } else {
        // Standalone task — each stage is a leaf, or the task itself
        if (item.stages && item.stages.length > 0) {
          for (var m = 0; m < item.stages.length; m++) {
            callback(item.stages[m], { type: 'stage', parent: item, grandparent: null, timeSlot: item.stages[m].timeSlot || '' });
          }
        } else {
          callback(item, { type: 'task', parent: null, grandparent: null, timeSlot: item.timeSlot || '' });
        }
      }
    }
  }

  return { escHtml: escHtml, calcDaysLeft: calcDaysLeft, walkLeafItems: walkLeafItems };
})();

// Bare global aliases for backward compatibility
var escHtml = Util.escHtml;
var calcDaysLeft = Util.calcDaysLeft;
var walkLeafItems = Util.walkLeafItems;
