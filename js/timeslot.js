// timeslot.js - Time-of-day slot selector for tasks

// Return a reasonable default timeSlot based on the current time of day
function getDefaultTimeSlot() {
  var h = new Date().getHours();
  if (h >= 5 && h < 8)   return 'early_morn';
  if (h >= 8 && h < 12)  return 'forenoon';
  if (h >= 12 && h < 14) return 'noon';
  if (h >= 14 && h < 17) return 'afternoon';
  if (h >= 17 && h < 20) return 'dusk';
  return 'night'; // 20:00–4:59
}

function updateTaskTimeSlot(quadrantKey, taskId, blockId, slotKey) {
  var data = loadDateData(currentDate);
  if (blockId) {
    for (var i = 0; i < data[quadrantKey].length; i++) {
      if (data[quadrantKey][i].id === blockId && data[quadrantKey][i].blockName !== undefined) {
        var tasks = data[quadrantKey][i].tasks || [];
        for (var j = 0; j < tasks.length; j++) {
          if (tasks[j].id === taskId) { tasks[j].timeSlot = slotKey; break; }
        }
        break;
      }
    }
  } else {
    for (var k = 0; k < data[quadrantKey].length; k++) {
      if (data[quadrantKey][k].id === taskId && !data[quadrantKey][k].blockName) {
        data[quadrantKey][k].timeSlot = slotKey;
        break;
      }
    }
  }
  saveDateData(currentDate, data);
  renderQuadrantOnly(quadrantKey);
}
