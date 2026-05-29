// timeslot.js - Time-of-day slot selector for tasks
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
