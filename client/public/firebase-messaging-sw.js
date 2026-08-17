// Firebase Cloud Messaging Service Worker
// This file must be located in the public/ directory

/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker by passing in the messagingSenderId
// These values should match your main firebase.ts config
firebase.initializeApp({
  apiKey: "add your api key in here",
  authDomain: "evapp-4d7e4.firebaseapp.com",
  projectId: "evapp-4d7e4",
  storageBucket: "evapp-4d7e4.firebasestorage.app",
  messagingSenderId: "386685644582",
  appId: "1:386685644582:web:238148669dbc9dee959be7"
});

// Retrieve an instance of Firebase Messaging so that it can handle background messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/favicon.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
