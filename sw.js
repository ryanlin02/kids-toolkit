// Service Worker for 小朋友工具箱 PWA - 智能更新版本
// 版本號，用於快取管理
const CACHE_VERSION = 'v1.0.1';
const CACHE_NAME = `kids-toolkit-${CACHE_VERSION}`;
const VERSION_CACHE = `version-${CACHE_VERSION}`;

// 版本檢查間隔（毫秒）
const VERSION_CHECK_INTERVAL = 30 * 60 * 1000; // 30分鐘檢查一次

// 需要快取的核心檔案
const CORE_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/version.json',
  '/pages/calculator.html',
  '/pages/check.html',
  '/pages/invoice.html',
  '/pages/gas.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// 當前版本資訊
let currentVersion = null;
let lastVersionCheck = 0;

// Service Worker 安裝事件
self.addEventListener('install', (event) => {
  console.log('Service Worker: 安裝中...', CACHE_VERSION);
  
  event.waitUntil(
    Promise.all([
      // 快取核心檔案
      caches.open(CACHE_NAME).then((cache) => {
        console.log('Service Worker: 快取核心檔案');
        return cache.addAll(CORE_FILES);
      }),
      // 載入版本資訊
      loadVersionInfo()
    ])
    .then(() => {
      console.log('Service Worker: 安裝完成');
      // 跳過等待，立即啟用
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
    Promise.all([
      // 清除舊版本快取
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName.startsWith('kids-toolkit-') && cacheName !== CACHE_NAME) {
              console.log('Service Worker: 清除舊快取', cacheName);
              return caches.delete(cacheName);
            }
            if (cacheName.startsWith('version-') && cacheName !== VERSION_CACHE) {
              console.log('Service Worker: 清除舊版本快取', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // 立即控制所有頁面
      self.clients.claim()
    ])
    .then(() => {
      console.log('Service Worker: 啟用完成');
      // 啟動版本檢查
      startVersionCheck();
    })
  );
});

// 載入版本資訊
async function loadVersionInfo() {
  try {
    const response = await fetch('/version.json', { 
      cache: 'no-cache',
      headers: {
        'Cache-Control': 'no-cache'
      }
    });
    if (response.ok) {
      currentVersion = await response.json();
      console.log('Service Worker: 載入版本資訊', currentVersion);
      
      // 儲存版本資訊到快取
      const versionCache = await caches.open(VERSION_CACHE);
      await versionCache.put('/version.json', response.clone());
    }
  } catch (error) {
    console.error('Service Worker: 載入版本資訊失敗', error);
    // 嘗試從快取讀取
    try {
      const versionCache = await caches.open(VERSION_CACHE);
      const cachedResponse = await versionCache.match('/version.json');
      if (cachedResponse) {
        currentVersion = await cachedResponse.json();
        console.log('Service Worker: 使用快取的版本資訊', currentVersion);
      }
    } catch (cacheError) {
      console.error('Service Worker: 無法讀取快取的版本資訊', cacheError);
    }
  }
}

// 檢查版本更新
async function checkForUpdates() {
  try {
    console.log('Service Worker: 檢查版本更新...');
    const response = await fetch('/version.json', { 
      cache: 'no-cache',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`版本檢查失敗: ${response.status}`);
    }
    
    const newVersion = await response.json();
    
    if (!currentVersion || newVersion.version !== currentVersion.version || 
        newVersion.build !== currentVersion.build) {
      
      console.log('Service Worker: 發現新版本', {
        舊版本: currentVersion,
        新版本: newVersion
      });
      
      // 通知所有客戶端有更新
      const clients = await self.clients.matchAll();
      clients.forEach((client) => {
        client.postMessage({
          type: 'UPDATE_AVAILABLE',
          currentVersion: currentVersion,
          newVersion: newVersion
        });
      });
      
      return newVersion;
    } else {
      console.log('Service Worker: 版本已是最新');
      return null;
    }
    
  } catch (error) {
    console.error('Service Worker: 版本檢查失敗', error);
    return null;
  }
}

// 更新快取
async function updateCache(newVersion = null) {
  try {
    console.log('Service Worker: 開始更新快取...');
    
    const newCacheName = newVersion ? 
      `kids-toolkit-v${newVersion.version}` : CACHE_NAME;
    
    const cache = await caches.open(newCacheName);
    const updatePromises = CORE_FILES.map(async (url) => {
      try {
        const response = await fetch(url, { 
          cache: 'no-cache',
          headers: {
            'Cache-Control': 'no-cache'
          }
        });
        if (response.ok) {
          await cache.put(url, response);
          console.log(`Service Worker: 已更新快取 ${url}`);
        }
      } catch (error) {
        console.error(`Service Worker: 更新快取失敗 ${url}`, error);
      }
    });
    
    await Promise.all(updatePromises);
    
    if (newVersion) {
      currentVersion = newVersion;
      // 更新版本快取
      const versionCache = await caches.open(VERSION_CACHE);
      await versionCache.put('/version.json', new Response(JSON.stringify(newVersion)));
    }
    
    // 通知客戶端更新完成
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({
        type: 'CACHE_UPDATED',
        version: currentVersion
      });
    });
    
    console.log('Service Worker: 快取更新完成');
    
  } catch (error) {
    console.error('Service Worker: 快取更新失敗', error);
  }
}

// 啟動定期版本檢查
function startVersionCheck() {
  // 立即檢查一次
  setTimeout(() => {
    checkForUpdates();
  }, 5000); // 5秒後首次檢查
  
  // 定期檢查
  setInterval(() => {
    const now = Date.now();
    if (now - lastVersionCheck > VERSION_CHECK_INTERVAL) {
      lastVersionCheck = now;
      checkForUpdates();
    }
  }, VERSION_CHECK_INTERVAL);
}

// 處理網路請求 - Cache First with Network Update
self.addEventListener('fetch', (event) => {
  // 只處理 GET 請求
  if (event.request.method !== 'GET') {
    return;
  }

  // 只處理同源請求
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // 版本檢查請求直接通過
  if (event.request.url.endsWith('/version.json')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .catch(() => {
          // 網路失敗時返回快取版本
          return caches.match(event.request);
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // 如果有快取，立即返回快取版本（保證速度）
        if (cachedResponse) {
          console.log('Service Worker: 返回快取', event.request.url);
          
          // 同時在背景更新快取（如果是重要檔案）
          if (CORE_FILES.includes(new URL(event.request.url).pathname)) {
            // 背景更新
            fetch(event.request, { cache: 'no-cache' })
              .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                  const responseClone = networkResponse.clone();
                  caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseClone);
                    console.log('Service Worker: 背景更新快取', event.request.url);
                  });
                }
              })
              .catch((error) => {
                console.log('Service Worker: 背景更新失敗', error.message);
              });
          }
          
          return cachedResponse;
        }

        // 沒有快取，從網路獲取
        return fetch(event.request)
          .then((networkResponse) => {
            // 檢查回應是否有效
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }

            // 複製回應並快取
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
              console.log('Service Worker: 新增快取', event.request.url);
            });

            return networkResponse;
          })
          .catch((error) => {
            console.error('Service Worker: 網路請求失敗', error);
            
            // 導航請求失敗時返回首頁
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
            
            throw error;
          });
      })
  );
});

// 處理訊息事件
self.addEventListener('message', (event) => {
  const { data } = event;
  
  if (data && data.type === 'SKIP_WAITING') {
    console.log('Service Worker: 跳過等待，立即啟用新版本');
    self.skipWaiting();
  }
  
  if (data && data.type === 'CHECK_UPDATE') {
    console.log('Service Worker: 手動檢查更新');
    event.waitUntil(checkForUpdates());
  }
  
  if (data && data.type === 'FORCE_UPDATE') {
    console.log('Service Worker: 強制更新快取');
    event.waitUntil(
      loadVersionInfo().then(() => {
        return updateCache();
      })
    );
  }
  
  if (data && data.type === 'GET_VERSION') {
    // 回傳目前版本資訊
    event.ports[0].postMessage({
      type: 'VERSION_INFO',
      version: currentVersion
    });
  }
});

// 背景同步 - 用於版本檢查
self.addEventListener('sync', (event) => {
  if (event.tag === 'version-check') {
    console.log('Service Worker: 背景同步 - 版本檢查');
    event.waitUntil(checkForUpdates());
  }
});

console.log('Service Worker: 智能更新版本載入完成', CACHE_VERSION);