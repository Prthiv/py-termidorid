'use strict';

self.addEventListener('push', function (event) {
  try {
    const data = event.data.json();
    const title = data.title || 'New Message';
    const options = {
      body: data.body,
      icon: data.icon || '/icons/icon-192x192.png',
      badge: '/icons/icon-96x96.png',
    };

    const promiseChain = self.registration.showNotification(title, options);
    event.waitUntil(promiseChain);
  } catch (e) {
    console.error('Error handling push event:', e);
    // Fallback for plain text notifications
    const promiseChain = self.registration.showNotification('New Message', {
        body: event.data.text()
    });
    event.waitUntil(promiseChain);
  }
});
