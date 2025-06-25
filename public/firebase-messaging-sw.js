// IMPORTANT: This file must be in the `public` directory.

// This service worker handles background push notifications.
// It must be initialized with your Firebase project's configuration.

// --- STEP 1: Import Firebase ---
// The Firebase libraries are imported via a Content Delivery Network (CDN).
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// --- STEP 2: Add Your Firebase Configuration ---
// TODO: Replace the placeholder values below with your actual Firebase project
// configuration. You can find this in your Firebase project settings, or
// copy it from the `firebaseConfig` object in `src/lib/firebase.ts`.
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// --- STEP 3: Initialize Firebase ---
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// --- STEP 4: Handle Background Messages ---
// This function is triggered when the app is in the background or closed.
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message: ', payload);

  const notificationTitle = payload.notification.title || 'New Message';
  const notificationOptions = {
    body: payload.notification.body || '',
    icon: '/icon-192.png' // Optional: Add an icon file to your /public folder
  };

  // The service worker shows the notification to the user.
  self.registration.showNotification(notificationTitle, notificationOptions);
});
