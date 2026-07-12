// json-io.js - JSON import/export（支持文件选择 + 粘贴导入，移动端友好）
function setupJsonButtons() {
  document.getElementById('btnExportJson').addEventListener('click', function() {
    exportAllDataAsJSON();
  });

  document.getElementById('btnImportJson').addEventListener('click', function() {
    showJsonImportModal();
  });

  // 文件选择器仍保留（模态框内触发）
  document.getElementById('importJsonInput').addEventListener('change', function(e) {
    if (e.target.files[0]) {
      importJsonFile(e.target.files[0]);
      e.target.value = '';
      var modal = document.getElementById('jsonImportModal');
      if (modal) modal.remove();
    }
  });
}

// 显示导入JSON模态框（含文件选择 + 粘贴导入两种方式）
function showJsonImportModal() {
  var existing = document.getElementById('jsonImportModal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = 'jsonImportModal';
  modal.className = 'modal-overlay';

  var content = document.createElement('div');
  content.className = 'modal-content';
  content.style.maxWidth = '480px';

  var title = document.createElement('h2');
  title.textContent = '📥 导入JSON数据';
  content.appendChild(title);

  var desc = document.createElement('p');
  desc.textContent = '选择JSON文件或粘贴JSON内容，合并/覆盖导入到当前设备：';
  desc.style.color = 'var(--text2)';
  desc.style.fontSize = '13px';
  desc.style.marginBottom = '12px';
  content.appendChild(desc);

  // ---- 方式1：文件选择 ----
  var fileSection = document.createElement('div');
  fileSection.style.marginBottom = '14px';

  var fileBtn = document.createElement('button');
  fileBtn.className = 'btn btn-primary';
  fileBtn.textContent = '📁 选择JSON文件';
  fileBtn.style.width = '100%';
  fileBtn.style.padding = '10px';
  fileBtn.style.fontSize = '14px';
  fileBtn.addEventListener('click', function() {
    document.getElementById('importJsonInput').click();
  });
  fileSection.appendChild(fileBtn);
  content.appendChild(fileSection);

  // ---- 分隔线 ----
  var sep = document.createElement('div');
  sep.style.cssText = 'display:flex;align-items:center;gap:10px;margin:12px 0;color:var(--text3);font-size:12px;';
  sep.innerHTML = '<span style="flex:1;border-top:1px solid var(--border)"></span>或粘贴JSON<span style="flex:1;border-top:1px solid var(--border)"></span>';
  content.appendChild(sep);

  // ---- 方式2：粘贴JSON ----
  var pasteSection = document.createElement('div');

  var textarea = document.createElement('textarea');
  textarea.placeholder = '在此粘贴JSON数据...';
  textarea.style.cssText = 'width:100%;height:120px;padding:10px;font-size:12px;font-family:monospace;border:1px solid var(--border);border-radius:6px;background:var(--surface2);color:var(--text);resize:vertical;box-sizing:border-box;';
  pasteSection.appendChild(textarea);

  var pasteBtns = document.createElement('div');
  pasteBtns.style.cssText = 'display:flex;gap:8px;margin-top:8px;';

  var mergeBtn = document.createElement('button');
  mergeBtn.className = 'btn btn-primary';
  mergeBtn.textContent = '合并导入（保留现有数据）';
  mergeBtn.style.flex = '1';
  mergeBtn.addEventListener('click', function() {
    var json = textarea.value.trim();
    if (!json) { alert('请先粘贴JSON数据'); return; }
    if (importAllDataFromJSON(json, true)) {
      renderAll(currentDate);
      modal.remove();
      alert('合并导入成功！');
    }
  });
  pasteBtns.appendChild(mergeBtn);

  var overwriteBtn = document.createElement('button');
  overwriteBtn.className = 'btn btn-cancel';
  overwriteBtn.textContent = '覆盖导入';
  overwriteBtn.addEventListener('click', function() {
    var json = textarea.value.trim();
    if (!json) { alert('请先粘贴JSON数据'); return; }
    if (!confirm('覆盖导入将清空当前所有数据，确定继续？')) return;
    if (importAllDataFromJSON(json, false)) {
      renderAll(currentDate);
      modal.remove();
      alert('覆盖导入成功！');
    }
  });
  pasteBtns.appendChild(overwriteBtn);

  pasteSection.appendChild(pasteBtns);
  content.appendChild(pasteSection);

  // ---- 关闭按钮 ----
  var closeBtn = document.createElement('button');
  closeBtn.className = 'btn btn-sm btn-cancel';
  closeBtn.textContent = '关闭';
  closeBtn.style.marginTop = '12px';
  closeBtn.addEventListener('click', function() { modal.remove(); });
  content.appendChild(closeBtn);

  modal.appendChild(content);
  document.body.appendChild(modal);

  modal.addEventListener('click', function(e) {
    if (e.target === modal) modal.remove();
  });
}

function importJsonFile(file) {
  var reader = new FileReader();
  reader.onload = function(e) {
    var action = confirm('点击"确定"将合并导入（保留现有数据），点击"取消"将覆盖所有数据。');
    if (importAllDataFromJSON(e.target.result, action)) {
      renderAll(currentDate);
      alert('导入成功！');
    }
  };
  reader.readAsText(file);
}
