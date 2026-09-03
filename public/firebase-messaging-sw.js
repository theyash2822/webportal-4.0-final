/* Firebase messaging service worker — FCM background handler */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: self.FIREBASE_CONFIG?.apiKey,
  projectId: self.FIREBASE_CONFIG?.projectId,
  messagingSenderId: self.FIREBASE_CONFIG?.messagingSenderId,
  appId: self.FIREBASE_CONFIG?.appId,
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title || 'TallyDekho';
  const options = { body: payload.notification?.body || '', data: payload.data || {} };
  self.registration.showNotification(title, options);
});
