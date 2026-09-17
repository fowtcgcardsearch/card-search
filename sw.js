// 最小限のService Worker（PWAインストール条件のクリア用）
self.addEventListener('fetch', function(event) {
  // 通常のネットワーク通信を行う
  event.respondWith(fetch(event.request));
});