// toast.js - Toast notification with undo support
var Toast = (function() {
  function showUndoToast(message, undoCallback) {
    var container = document.getElementById('toastContainer');
    if (!container) return;

    var toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = message + ' ';

    var undoBtn = document.createElement('button');
    undoBtn.className = 'toast-undo';
    undoBtn.textContent = '撤销';
    undoBtn.addEventListener('click', function() {
      undoCallback();
      _remove(toast);
    });
    toast.appendChild(undoBtn);

    container.appendChild(toast);

    var timer = setTimeout(function() { _remove(toast); }, 5000);
    toast._timer = timer;
  }

  function _remove(toast) {
    if (toast._timer) clearTimeout(toast._timer);
    toast.style.animation = 'toastOut 0.2s ease forwards';
    setTimeout(function() {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 200);
  }

  return { show: showUndoToast };
})();
