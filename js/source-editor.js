// source-editor.js — 手机端源码编辑器
// 支持在手机端直接编辑页面的 HTML/CSS/JS 源码，预览效果，导出文件
// 编辑内容自动保存到 localStorage，刷新不丢失

var SourceEditor = (function() {
  // localStorage 存储键
  var STORAGE_KEY_PREFIX = 'source_editor_';

  // 原始源码快照（首次加载时保存）
  var originalSource = {
    html: '',
    css: '',
    js: ''
  };

  // 当前编辑中的源码（与 textarea 双向绑定）
  var currentSource = {
    html: '',
    css: '',
    js: ''
  };

  // 当前激活的编辑器 tab（html/css/js）
  var activeTab = 'html';

  // 编辑器面板 DOM 引用
  var editorOverlay = null;
  var previewFrame = null;
  var isPreviewMode = false;

  // 自动保存定时器
  var autoSaveTimer = null;

  /**
   * 初始化：捕获原始源码，加载 localStorage 中的修改
   */
  function init() {
    captureOriginalSource();
    loadFromStorage();
  }

  /**
   * 捕获当前页面的原始源码
   */
  function captureOriginalSource() {
    // HTML：获取完整 document HTML
    originalSource.html = document.documentElement.outerHTML;

    // CSS：收集所有 style 标签和 link 的外部样式
    var cssParts = [];
    var styleTags = document.querySelectorAll('style');
    styleTags.forEach(function(st) {
      cssParts.push(st.textContent);
    });
    // 尝试读取主要 CSS 文件（通过 fetch，可能因跨域失败则用注释替代）
    originalSource.css = cssParts.join('\n\n/* ===== style tag ===== */\n\n');

    // JS：收集所有内联 script 的内容
    var jsParts = [];
    var scripts = document.querySelectorAll('script:not([src])');
    scripts.forEach(function(sc) {
      if (sc.textContent.trim()) {
        jsParts.push(sc.textContent);
      }
    });
    originalSource.js = jsParts.join('\n\n// ===== script block =====\n\n');

    // 如果 localStorage 没有保存过，初始化为原始值
    if (!localStorage.getItem(STORAGE_KEY_PREFIX + 'html')) {
      currentSource.html = originalSource.html;
      currentSource.css = originalSource.css;
      currentSource.js = originalSource.js;
    }
  }

  /**
   * 从 localStorage 加载已保存的编辑内容
   */
  function loadFromStorage() {
    var savedHtml = localStorage.getItem(STORAGE_KEY_PREFIX + 'html');
    var savedCss = localStorage.getItem(STORAGE_KEY_PREFIX + 'css');
    var savedJs = localStorage.getItem(STORAGE_KEY_PREFIX + 'js');

    if (savedHtml !== null) {
      currentSource.html = savedHtml;
    } else {
      currentSource.html = originalSource.html;
    }
    if (savedCss !== null) {
      currentSource.css = savedCss;
    } else {
      currentSource.css = originalSource.css;
    }
    if (savedJs !== null) {
      currentSource.js = savedJs;
    } else {
      currentSource.js = originalSource.js;
    }
  }

  /**
   * 保存当前编辑内容到 localStorage（带防抖）
   */
  function saveToStorage() {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(function() {
      localStorage.setItem(STORAGE_KEY_PREFIX + 'html', currentSource.html);
      localStorage.setItem(STORAGE_KEY_PREFIX + 'css', currentSource.css);
      localStorage.setItem(STORAGE_KEY_PREFIX + 'js', currentSource.js);
      console.log('[源码编辑器] 已自动保存到 localStorage');
    }, 500);
  }

  /**
   * 打开源码编辑器
   */
  function open() {
    // 确保源码是最新的
    if (!currentSource.html) loadFromStorage();

    // 创建遮罩层
    editorOverlay = document.createElement('div');
    editorOverlay.className = 'source-editor-overlay';
    editorOverlay.innerHTML = buildEditorHTML();
    document.body.appendChild(editorOverlay);

    // 绑定事件
    bindEditorEvents();

    // 显示初始 tab
    switchTab(activeTab);

    // 防止背景滚动
    document.body.style.overflow = 'hidden';

    // 动画入场
    requestAnimationFrame(function() {
      editorOverlay.classList.add('active');
    });
  }

  /**
   * 关闭源码编辑器
   */
  function close() {
    if (!editorOverlay) return;
    editorOverlay.classList.remove('active');
    setTimeout(function() {
      if (editorOverlay) {
        editorOverlay.remove();
        editorOverlay = null;
      }
      document.body.style.overflow = '';
    }, 250);
  }

  /**
   * 构建编辑器 HTML 结构
   */
  function buildEditorHTML() {
    return '' +
      '<div class="source-editor-panel">' +
      '  <div class="source-editor-header">' +
      '    <span class="source-editor-title">📝 源码编辑器</span>' +
      '    <div class="source-editor-header-actions">' +
      '      <button class="btn btn-sm btn-info" id="seBtnPreview">👁 预览</button>' +
      '      <button class="btn btn-sm btn-success" id="seBtnExport">📥 导出HTML</button>' +
      '      <button class="btn btn-sm btn-warning" id="seBtnReset">🔄 重置</button>' +
      '      <button class="btn btn-sm btn-cancel" id="seBtnClose">✕ 关闭</button>' +
      '    </div>' +
      '  </div>' +
      '  <div class="source-editor-tabs">' +
      '    <button class="source-editor-tab active" data-tab="html">HTML</button>' +
      '    <button class="source-editor-tab" data-tab="css">CSS</button>' +
      '    <button class="source-editor-tab" data-tab="js">JavaScript</button>' +
      '  </div>' +
      '  <div class="source-editor-body">' +
      '    <textarea class="source-editor-textarea" id="seTextarea" placeholder="在此编辑源码..." spellcheck="false"></textarea>' +
      '    <iframe class="source-editor-preview" id="sePreviewFrame" style="display:none;" sandbox="allow-scripts allow-same-origin" title="预览"></iframe>' +
      '  </div>' +
      '  <div class="source-editor-footer">' +
      '    <span class="source-editor-status" id="seStatus">💾 已自动保存</span>' +
      '    <span class="source-editor-hint">💡 编辑后点击「预览」查看效果，修改内容自动保存到浏览器</span>' +
      '  </div>' +
      '  <!-- 预览模式下的返回按钮（浮动） -->' +
      '  <div class="source-editor-preview-actions" id="sePreviewActions" style="display:none;">' +
      '    <button class="btn btn-primary btn-sm" id="seBtnBackEdit">← 返回编辑</button>' +
      '  </div>' +
      '</div>';
  }

  /**
   * 绑定编辑器事件
   */
  function bindEditorEvents() {
    var panel = editorOverlay.querySelector('.source-editor-panel');

    // 关闭按钮
    panel.querySelector('#seBtnClose').addEventListener('click', function() {
      close();
    });

    // 点击遮罩关闭（但不关闭面板内的点击）
    editorOverlay.addEventListener('click', function(e) {
      if (e.target === editorOverlay) {
        close();
      }
    });

    // Tab 切换
    var tabs = panel.querySelectorAll('.source-editor-tab');
    tabs.forEach(function(tab) {
      tab.addEventListener('click', function() {
        switchTab(this.getAttribute('data-tab'));
      });
    });

    // 文本编辑区内容变化 → 自动保存
    var textarea = panel.querySelector('#seTextarea');
    textarea.addEventListener('input', function() {
      currentSource[activeTab] = textarea.value;
      saveToStorage();
      updateStatus('💾 保存中...');
    });

    // 预览按钮
    panel.querySelector('#seBtnPreview').addEventListener('click', function() {
      if (isPreviewMode) {
        exitPreview();
      } else {
        enterPreview();
      }
    });

    // 返回编辑按钮
    panel.querySelector('#seBtnBackEdit').addEventListener('click', function() {
      exitPreview();
    });

    // 导出 HTML 按钮
    panel.querySelector('#seBtnExport').addEventListener('click', function() {
      exportHTML();
    });

    // 重置按钮
    panel.querySelector('#seBtnReset').addEventListener('click', function() {
      resetToOriginal();
    });

    // ESC 键关闭
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && editorOverlay) {
        close();
      }
    });
  }

  /**
   * 切换到指定 tab（html/css/js）
   */
  function switchTab(tab) {
    // 先保存当前 tab 的内容
    var textarea = editorOverlay ? editorOverlay.querySelector('#seTextarea') : null;
    if (textarea) {
      currentSource[activeTab] = textarea.value;
    }

    activeTab = tab;

    // 更新 tab 激活状态
    if (editorOverlay) {
      var tabs = editorOverlay.querySelectorAll('.source-editor-tab');
      tabs.forEach(function(t) {
        t.classList.toggle('active', t.getAttribute('data-tab') === tab);
      });
    }

    // 更新 textarea 内容
    if (textarea) {
      textarea.value = currentSource[tab] || '';
    }
  }

  /**
   * 进入预览模式
   */
  function enterPreview() {
    if (!editorOverlay) return;

    var textarea = editorOverlay.querySelector('#seTextarea');
    var previewFrame = editorOverlay.querySelector('#sePreviewFrame');
    var previewActions = editorOverlay.querySelector('#sePreviewActions');
    var btnPreview = editorOverlay.querySelector('#seBtnPreview');

    // 保存当前 tab 内容
    currentSource[activeTab] = textarea.value;
    saveToStorage();

    // 隐藏 textarea，显示 iframe
    textarea.style.display = 'none';
    previewFrame.style.display = 'block';
    previewActions.style.display = 'flex';
    btnPreview.textContent = '✏ 编辑';

    isPreviewMode = true;

    // 构建完整的预览 HTML
    var previewHTML = buildPreviewHTML();

    // 写入 iframe
    var blob = new Blob([previewHTML], { type: 'text/html;charset=utf-8' });
    previewFrame.src = URL.createObjectURL(blob);

    updateStatus('👁 预览模式');
  }

  /**
   * 退出预览模式，返回编辑
   */
  function exitPreview() {
    if (!editorOverlay) return;

    var textarea = editorOverlay.querySelector('#seTextarea');
    var previewFrame = editorOverlay.querySelector('#sePreviewFrame');
    var previewActions = editorOverlay.querySelector('#sePreviewActions');
    var btnPreview = editorOverlay.querySelector('#seBtnPreview');

    // 释放 blob URL
    if (previewFrame.src) {
      URL.revokeObjectURL(previewFrame.src);
      previewFrame.src = '';
    }

    textarea.style.display = '';
    previewFrame.style.display = 'none';
    previewActions.style.display = 'none';
    btnPreview.textContent = '👁 预览';

    isPreviewMode = false;
    updateStatus('💾 已自动保存');
  }

  /**
   * 构建完整的预览 HTML（合并 HTML + CSS + JS）
   */
  function buildPreviewHTML() {
    var html = currentSource.html || originalSource.html;
    var css = currentSource.css || '';
    var js = currentSource.js || '';

    // 如果 HTML 中没有 </head> 标签，说明可能是片段，直接包裹
    if (html.indexOf('</head>') === -1) {
      // 简单包裹
      return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1.0">' +
        '<style>' + css + '</style></head><body>' + html +
        '<script>' + js + '</' + 'script></body></html>';
    }

    // 在 </head> 前注入 CSS（如果 CSS 修改过且不在 HTML 中）
    if (css && css !== originalSource.css) {
      html = html.replace('</head>', '<style id="se-injected-css">' + css + '</style></head>');
    }

    // 在 </body> 前注入 JS（如果 JS 修改过且不在 HTML 中）
    if (js && js !== originalSource.js) {
      html = html.replace('</body>', '<script id="se-injected-js">' + js + '</' + 'script></body>');
    }

    return html;
  }

  /**
   * 导出修改后的完整 HTML 文件
   */
  function exportHTML() {
    // 确保当前编辑内容已保存
    if (!editorOverlay) return;
    var textarea = editorOverlay.querySelector('#seTextarea');
    if (textarea && !isPreviewMode) {
      currentSource[activeTab] = textarea.value;
    }

    var html = currentSource.html || originalSource.html;
    var css = currentSource.css || '';
    var js = currentSource.js || '';

    // 构建完整的独立 HTML 文件
    var fullHTML;
    if (html.indexOf('</head>') === -1) {
      fullHTML = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1.0">' +
        '<style>' + css + '</style></head><body>' + html +
        '<script>' + js + '</' + 'script></body></html>';
    } else {
      fullHTML = html;
      // 注入修改过的 CSS
      if (css && css !== originalSource.css) {
        if (fullHTML.indexOf('<style id="se-injected-css">') === -1) {
          fullHTML = fullHTML.replace('</head>', '<style>' + css + '</style></head>');
        }
      }
      // 注入修改过的 JS
      if (js && js !== originalSource.js) {
        if (fullHTML.indexOf('<script id="se-injected-js">') === -1) {
          fullHTML = fullHTML.replace('</body>', '<script>' + js + '</' + 'script></body>');
        }
      }
    }

    // 下载文件
    var blob = new Blob([fullHTML], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '四象限任务管理器_' + getDateStr() + '.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    updateStatus('✅ 已导出 HTML 文件');
    setTimeout(function() { updateStatus('💾 已自动保存'); }, 2000);
  }

  /**
   * 重置为原始源码
   */
  function resetToOriginal() {
    if (!confirm('确定要重置所有修改吗？这将恢复为原始页面代码，您当前的修改将丢失。')) {
      return;
    }

    currentSource.html = originalSource.html;
    currentSource.css = originalSource.css;
    currentSource.js = originalSource.js;

    // 清除 localStorage
    localStorage.removeItem(STORAGE_KEY_PREFIX + 'html');
    localStorage.removeItem(STORAGE_KEY_PREFIX + 'css');
    localStorage.removeItem(STORAGE_KEY_PREFIX + 'js');

    // 更新 textarea
    if (editorOverlay) {
      var textarea = editorOverlay.querySelector('#seTextarea');
      if (textarea) {
        textarea.value = currentSource[activeTab] || '';
      }
    }

    updateStatus('🔄 已重置为原始代码');
    setTimeout(function() { updateStatus('💾 已自动保存'); }, 2000);
  }

  /**
   * 更新状态栏文字
   */
  function updateStatus(msg) {
    var statusEl = editorOverlay ? editorOverlay.querySelector('#seStatus') : null;
    if (statusEl) {
      statusEl.textContent = msg;
    }
  }

  /**
   * 获取日期字符串（用于导出文件名）
   */
  function getDateStr() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  // ============ 公开 API ============
  return {
    init: init,
    open: open,
    close: close,
    exportHTML: exportHTML
  };
})();
