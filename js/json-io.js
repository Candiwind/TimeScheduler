// json-io.js - JSON import/export
function setupJsonButtons() {
  document.getElementById('btnExportJson').addEventListener('click', function() {
    exportAllDataAsJSON();
  });

  document.getElementById('btnImportJson').addEventListener('click', function() {
    document.getElementById('importJsonInput').click();
  });

  document.getElementById('importJsonInput').addEventListener('change', function(e) {
    if (e.target.files[0]) {
      importJsonFile(e.target.files[0]);
      e.target.value = '';
    }
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
