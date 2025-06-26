// IMPORTANT: This file MUST be in the /public folder.

// Give the service worker access to Firebase Messaging.
// Note that you can only use Firebase Messaging here, other Firebase libraries
// are not available in the service worker.
try {
  importScripts('https://www.gstatic.com/firebasejs/9.15.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/9.15.0/firebase-messaging-compat.js');

  // --- STEP 3 from the guide goes here ---
  //
  // IMPORTANT: REPLACE THE PLACEHOLDER CONFIGURATION BELOW
  // with your own Firebase project's configuration.
  //
  // To get this, go to:
  // Firebase Console > Project Settings > General Tab > Your apps > SDK setup and configuration
  const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID",
    measurementId: "YOUR_MEASUREMENT_ID"
  };

  // Initialize the Firebase app in the service worker with the Firebase config
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  // Retrieve an instance of Firebase Messaging so that it can handle background
  // messages.
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage(function(payload) {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);

    // Customize notification here
    const notificationTitle = payload.notification.title || "New Message";
    const notificationOptions = {
      body: payload.notification.body || "",
      icon: '/icons/icon-192x192.png'
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });

} catch (e) {
  console.error("Error in service worker, push notifications may not work.", e)
}
