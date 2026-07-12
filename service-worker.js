// service-worker.js — PWA Service Worker
// 版本号：修改此值可触发缓存更新（新旧缓存并存，激活后清理旧版）
const CACHE_VERSION = 'v15';
const CACHE_NAME = 'quadrant-tasks-' + CACHE_VERSION;

// 需要预缓存的核心资源（首次安装时缓存）
const PRECACHE_ASSETS = [
  'index.html',
  'css/style.css',
  'js/config.js',
  'js/store.js',
  'js/util.js',
  'js/edit.js',
  'js/toast.js',
  'js/highlight.js',
  'js/timeslot.js',
  'js/render.js',
  'js/drag.js',
  'js/markdown.js',
  'js/json-io.js',
  'js/cache-ui.js',
  'js/stats-ui.js',
  'js/shortcuts.js',
  'js/quadrant-ops.js',
  'js/defer.js',
  'js/future.js',
  'js/bigtask.js',
  'js/daily-report.js',
  'js/source-editor.js',
  'js/cloud-sync.js',
  'js/app.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png'
];

// ============ install：预缓存核心资源 ============
self.addEventListener('install', function(event) {
  console.log('[SW] 安装中... 缓存版本:', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('[SW] 预缓存 ' + PRECACHE_ASSETS.length + ' 个核心资源');
      return cache.addAll(PRECACHE_ASSETS).catch(function(err) {
        console.warn('[SW] 部分资源预缓存失败（非致命）:', err);
        // 逐个缓存，避免一个失败导致全部回滚
        return Promise.allSettled(
          PRECACHE_ASSETS.map(function(url) {
            return cache.add(url).catch(function() {
              console.warn('[SW] 跳过资源:', url);
            });
          })
        );
      });
    }).then(function() {
      // 强制跳过等待，立即激活（确保更新后新 SW 立刻接管）
      return self.skipWaiting();
    })
  );
});

// ============ activate：清理旧版本缓存，立即接管页面 ============
self.addEventListener('activate', function(event) {
  console.log('[SW] 激活中... 当前版本:', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) {
          // 删除所有不属于当前版本的缓存
          return key !== CACHE_NAME && key.indexOf('quadrant-tasks-') === 0;
        }).map(function(key) {
          console.log('[SW] 清理旧缓存:', key);
          return caches.delete(key);
        })
      );
    }).then(function() {
      // 立即接管所有客户端页面（无需刷新即可被新 SW 控制）
      return self.clients.claim();
    })
  );
});

// ============ fetch：缓存优先策略（Cache First, Network Fallback） ============
self.addEventListener('fetch', function(event) {
  // 只处理 GET 请求
  if (event.request.method !== 'GET') return;

  // 跳过 chrome-extension:// 等非 http(s) 请求
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then(function(cachedResponse) {
      if (cachedResponse) {
        // 缓存命中：返回缓存，同时在后台更新缓存（Stale-While-Revalidate）
        // 对 HTML 页面始终尝试网络更新
        if (event.request.headers.get('accept') && event.request.headers.get('accept').indexOf('text/html') !== -1) {
          fetchAndCache(event.request);
        }
        return cachedResponse;
      }

      // 缓存未命中：发起网络请求
      return fetch(event.request).then(function(networkResponse) {
        // 只缓存成功的 GET 响应
        if (networkResponse && networkResponse.status === 200) {
          var responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(function() {
        // 网络不可用且无缓存：返回离线提示页（仅对 HTML 导航请求）
        if (event.request.headers.get('accept') && event.request.headers.get('accept').indexOf('text/html') !== -1) {
          return new Response(
            '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">' +
            '<meta name="viewport" content="width=device-width,initial-scale=1.0">' +
            '<title>离线 - 四象限任务管理器</title>' +
            '<style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;' +
            'justify-content:center;min-height:100vh;margin:0;background:#f0f2f5;color:#333;}' +
            '.offline-box{text-align:center;padding:40px 24px;background:#fff;border-radius:12px;' +
            'box-shadow:0 2px 12px rgba(0,0,0,0.08);max-width:360px;margin:16px;}' +
            '.offline-icon{font-size:64px;margin-bottom:16px;}' +
            'h1{font-size:20px;margin:0 0 8px;color:#333;}p{font-size:14px;color:#666;margin:0;}' +
            '</style></head><body><div class="offline-box">' +
            '<div class="offline-icon">📡</div>' +
            '<h1>当前离线</h1>' +
            '<p>请检查网络连接后重试。已缓存的数据仍可在恢复网络后使用。</p>' +
            '</div></body></html>',
            { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        }
        // 对于非 HTML 请求（JS/CSS/图片等），返回简单的错误
        return new Response('Network error', { status: 408 });
      });
    })
  );
});

// 后台更新缓存（不阻塞响应）
function fetchAndCache(request) {
  fetch(request).then(function(networkResponse) {
    if (networkResponse && networkResponse.status === 200) {
      caches.open(CACHE_NAME).then(function(cache) {
        cache.put(request, networkResponse);
      });
    }
  }).catch(function() {
    // 后台更新失败，静默忽略
  });
}
