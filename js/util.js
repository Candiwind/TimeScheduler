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

  return { escHtml: escHtml, calcDaysLeft: calcDaysLeft };
})();

// Bare global aliases for backward compatibility
var escHtml = Util.escHtml;
var calcDaysLeft = Util.calcDaysLeft;
