// edit.js - 编辑功能（任务文本/任务块名/完成度编辑）

let currentEditEl = null;
let currentEditCallback = null;
let currentEditOriginalValue = '';

function startEdit(el, value, callback) {
  if (currentEditEl) {
    finishEdit(true);
  }
  currentEditEl = el;
  currentEditCallback = callback;
  currentEditOriginalValue = value;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'inline-edit-input';
  input.value = value;
  input.style.width = Math.max(el.offsetWidth, 60) + 'px';

  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      finishEdit(false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finishEdit(true);
    }
  });

  input.addEventListener('blur', function() {
    finishEdit(false);
  });

  el.style.display = 'none';
  el.parentNode.insertBefore(input, el);
  input.focus();
  input.select();
}

function finishEdit(cancel) {
  if (!currentEditEl) return;
  const input = currentEditEl.parentNode.querySelector('.inline-edit-input');
  if (!input) {
    currentEditEl.style.display = '';
    currentEditEl = null;
    currentEditCallback = null;
    return;
  }

  const newValue = cancel ? currentEditOriginalValue : input.value.trim();
  input.remove();
  currentEditEl.style.display = '';

  if (!cancel && newValue && newValue !== currentEditOriginalValue) {
    currentEditCallback(newValue);
  }

  currentEditEl = null;
  currentEditCallback = null;
  currentEditOriginalValue = '';
}

function startSelectEdit(el, currentValue, options, callback) {
  if (currentEditEl) {
    finishEdit(true);
  }

  const select = document.createElement('select');
  select.className = 'inline-select-input';
  select._originalEl = el;

  options.forEach(function(opt) {
    const option = document.createElement('option');
    option.value = opt;
    option.textContent = opt;
    if (opt === currentValue) option.selected = true;
    select.appendChild(option);
  });

  select.addEventListener('change', function() {
    callback(select.value);
    finishSelectEdit();
  });

  select.addEventListener('blur', function() {
    finishSelectEdit();
  });

  el.style.display = 'none';
  el.parentNode.insertBefore(select, el);
  select.focus();

  currentEditEl = select;
}

function finishSelectEdit() {
  if (!currentEditEl || currentEditEl.tagName !== 'SELECT') return;
  const el = currentEditEl._originalEl;
  currentEditEl.remove();
  if (el) el.style.display = '';
  currentEditEl = null;
}
