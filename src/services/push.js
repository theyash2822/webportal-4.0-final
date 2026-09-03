/**
 * Web Push (FCM) — register token with backend POST /api/push-token.
 * Requires VITE_FIREBASE_* env vars; skips gracefully when unset.
 */
import api from './api';

let messaging = null;
let initAttempted = false;

function firebaseConfig() {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID;
  const appId = import.meta.env.VITE_FIREBASE_APP_ID;
  if (!apiKey || !projectId || !messagingSenderId || !appId) return null;
  return {
    apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
    projectId,
    messagingSenderId,
    appId,
  };
}

async function initMessaging() {
  if (messaging || initAttempted) return messaging;
  initAttempted = true;
  const cfg = firebaseConfig();
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!cfg || !vapidKey) return null;
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return null;
  try {
    const { initializeApp } = await import('firebase/app');
    const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
    if (!(await isSupported())) return null;
    const app = initializeApp(cfg);
    messaging = { instance: getMessaging(app), getToken, vapidKey };
    await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
    return messaging;
  } catch (e) {
    console.warn('[push] init failed', e?.message);
    return null;
  }
}

export async function getPushPermissionStatus() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function registerWebPushToken() {
  const m = await initMessaging();
  if (!m) throw new Error('Push not configured — add VITE_FIREBASE_* keys to .env');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission denied');
  const registration = await navigator.serviceWorker.ready;
  const token = await m.getToken(m.instance, { vapidKey: m.vapidKey, serviceWorkerRegistration: registration });
  if (!token) throw new Error('Could not obtain FCM token');
  await api.registerPushToken({ token, platform: 'web' });
  localStorage.setItem('td_push_token', token);
  return token;
}

export async function unregisterWebPushToken() {
  const token = localStorage.getItem('td_push_token');
  if (token) {
    try { await api.removePushToken({ token, platform: 'web' }); } catch { /* ignore */ }
    localStorage.removeItem('td_push_token');
  }
}

export async function tryAutoRegisterPush() {
  if (Notification.permission !== 'granted') return null;
  try {
    return await registerWebPushToken();
  } catch {
    return null;
  }
}
