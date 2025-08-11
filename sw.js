// Service Worker for 小朋友工具箱 PWA
// 版本號，用於快取管理
const CACHE_NAME = 'kids-toolkit-v1.0.0';
const STATIC_CACHE_NAME = 'kids-toolkit-static-v1.0.0';

// 需要快取的核心檔案
const CORE_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/pages/calculator.html',
  '/pages/check.html', 
  '/pages/invoice.html',
  '/pages/gas.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Service Worker 安裝事件
self.addEventListener('install', (event) => {
  console.log('Service Worker: 安裝中...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: 快取核心檔案');
        return cache.addAll(CORE_FILES);
      })
      .then(() => {
        console.log('Service Worker: 安裝完成');
        // 強制啟用新的 Service Worker
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Service Worker: 安裝失敗', error);
      })
  );
});

// Service Worker 啟用事件
self.addEventListener('activate', (event) => {
  console.log('Service Worker: 啟用中...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        // 清除舊版本的快取
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE_NAME && cacheName !== CACHE_NAME) {
              console.log('Service Worker: 清除舊快取', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('Service Worker: 啟用完成');
        // 立即控制所有頁面
        return self.clients.claim();
      })
  );
});

// 攔截網路請求
self.addEventListener('fetch', (event) => {
  // 只處理 GET 請求
  if (event.request.method !== 'GET') {
    return;
  }

  // 只處理同源請求
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // 如果找到快取，直接返回
        if (cachedResponse) {
          console.log('Service Worker: 從快取返回', event.request.url);
          return cachedResponse;
        }

        // 沒有快取，從網路取得
        return fetch(event.request)
          .then((response) => {
            // 檢查回應是否有效
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // 複製回應（因為回應只能使用一次）
            const responseToCache = response.clone();

            // 將新回應加入快取
            caches.open(CACHE_NAME)
              .then((cache) => {
                console.log('Service Worker: 快取新檔案', event.request.url);
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch((error) => {
            console.error('Service Worker: 網路請求失敗', error);
            
            // 如果是導航請求（頁面請求），返回首頁
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
            
            // 其他請求返回離線頁面或錯誤
            throw error;
          });
      })
  );
});

// 處理訊息事件（用於手動更新快取）
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('Service Worker: 收到跳過等待訊息');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'UPDATE_CACHE') {
    console.log('Service Worker: 收到更新快取訊息');
    event.waitUntil(
      caches.open(STATIC_CACHE_NAME)
        .then((cache) => {
          return cache.addAll(CORE_FILES);
        })
        .then(() => {
          console.log('Service Worker: 快取更新完成');
          // 通知客戶端更新完成
          self.clients.matchAll().then((clients) => {
            clients.forEach((client) => {
              client.postMessage({
                type: 'CACHE_UPDATED'
              });
            });
          });
        })
    );
  }
});

// 處理推送通知（未來擴展使用）
self.addEventListener('push', (event) => {
  if (event.data) {
    const options = {
      body: event.data.text(),
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: 1
      }
    };
    
    event.waitUntil(
      self.registration.showNotification('小朋友工具箱', options)
    );
  }
});

// 處理通知點擊事件
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: 通知被點擊', event);
  
  event.notification.close();
  
  // 開啟或聚焦到應用程式
  event.waitUntil(
    self.clients.matchAll({ type: 'window' })
      .then((clients) => {
        // 檢查是否已有視窗開啟
        for (const client of clients) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        // 沒有視窗開啟，開啟新視窗
        if (self.clients.openWindow) {
          return self.clients.openWindow('/');
        }
      })
  );
});

// 背景同步事件（未來擴展使用）
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    console.log('Service Worker: 執行背景同步');
    event.waitUntil(
      // 在這裡執行背景同步任務
      Promise.resolve()
    );
  }
});

console.log('Service Worker: 腳本載入完成');