// shortcuts.js - Keyboard shortcuts
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', function(e) {
    // Ctrl+D - toggle dark mode
    if (e.ctrlKey && e.key === 'd') {
      e.preventDefault();
      toggleTheme();
      return;
    }

    // Ctrl+F - focus search
    if (e.ctrlKey && e.key === 'f') {
      e.preventDefault();
      var searchInput = document.getElementById('searchInput');
      if (searchInput) searchInput.focus();
      return;
    }

    // Ctrl+S - export markdown
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      exportToMarkdown();
      return;
    }

    // Ctrl+Q - highlight selected text in task
    if (e.ctrlKey && e.key === 'q') {
      e.preventDefault();
      if (addHighlightFromSelection()) {
        return;
      }
    }

    // Escape - close any modal, clear search, close context menu, close picker
    if (e.key === 'Escape') {
      var picker = document.getElementById('timeslotPicker');
      if (picker) { picker.remove(); return; }
      var ctxMenu = document.getElementById('highlightContextMenu');
      if (ctxMenu) {
        ctxMenu.remove();
        _highlightSelection = null;
        return;
      }
      var modal = document.querySelector('.modal-overlay');
      if (modal) {
        modal.remove();
        return;
      }
      if (currentEditEl) {
        finishEdit(true);
        return;
      }
      var searchInput = document.getElementById('searchInput');
      if (searchInput && document.activeElement === searchInput) {
        searchInput.value = '';
        setSearchTerm('');
        updateSearchResult();
        return;
      }
      return;
    }

    // N - add task to first empty quadrant (when no input focused)
    if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var tag = document.activeElement ? document.activeElement.tagName : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      addTask('I');
    }
  });
}
