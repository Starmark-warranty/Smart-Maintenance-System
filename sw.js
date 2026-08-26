/* ═══════════════════════════════════════════════════════════════════════
   STARMARK — Service Worker v2.0
   ───────────────────────────────────────────────────────────────────────
   หน้าที่ 3 อย่าง:
     1. รับ push จาก Firebase ตอนแอปปิดอยู่ (background)
     2. จัดการตอนผู้ใช้แตะแจ้งเตือน -> เปิดแอปไปหน้าที่ถูก
     3. แคชไฟล์เปลือกแอป ให้เปิดได้ตอนเน็ตหลุด

   ⚠️ ห้ามแคช index.html แบบ cache-first
      ไม่งั้น deploy ใหม่แล้วผู้ใช้จะยังเห็นของเก่าไปตลอด
      ที่นี่ใช้ network-first สำหรับหน้าเว็บ และ cache-first เฉพาะไอคอน
═══════════════════════════════════════════════════════════════════════ */

const VER   = 'starmark-v2.0.2';
const SHELL = VER + '-shell';

/* ── Firebase (compat build เท่านั้น ใช้ใน service worker ได้) ── */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBOPhEtPgSvxJdNHmwHe3oyi1mehovJRTU",
  authDomain: "starmark-pm-v2.firebaseapp.com",
  projectId: "starmark-pm-v2",
  storageBucket: "starmark-pm-v2.firebasestorage.app",
  messagingSenderId: "24696782127",
  appId: "1:24696782127:web:4ce8126cd3ae9195d9b5da"
});

const messaging = firebase.messaging();

/* ── แปลง type ของแจ้งเตือน -> หน้าที่จะเปิด ── */
function navOf(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'pm_upcoming' || t === 'pm_window_updated') return 'pm';
  if (t === 'daily_report' || t === 'pm_missed')        return 'report';
  if (t === 'assignment' || t === 'job_assignment' ||
      t === 'job_completed' || t === 'repair')          return 'repair';
  return 'home';
}

/* ═══ 1. Push ตอนแอปปิด / อยู่เบื้องหลัง ═══
   ⚠️ เรื่องเสียง: เว็บกำหนดไฟล์เสียงเองไม่ได้บน Android
      เสียงถูกคุมโดย "ช่องแจ้งเตือน" ของระบบปฏิบัติการ
      ตั้งได้ที่ Settings -> แอป -> (ชื่อแอป หรือ Chrome) -> การแจ้งเตือน
      ที่ทำได้จากโค้ดคือ silent:false + renotify:true + สั่งการสั่น
   ส่งแบบ data-only จากหลังบ้าน แล้วให้ SW วาดเอง
   -> คุมข้อความ/ปุ่ม/ปลายทางได้เต็มที่ และไม่เด้งซ้อนกับ onMessage ตอนแอปเปิด */
messaging.onBackgroundMessage((payload) => {
  const d     = payload.data || {};
  const n     = payload.notification || {};
  const title = d.title || n.title || 'STARMARK';
  const body  = d.body  || n.body  || '';
  const nav   = d.nav || navOf(d.type);

  self.registration.showNotification(title, {
    body,
    icon:  './icon-192.png',
    badge: './icon-96.png',
    tag:   d.tag || ('sm-' + (d.type || 'info')),
    renotify: true,          /* ข้อความใหม่ tag เดิม -> ให้เตือนซ้ำ ไม่ใช่แทนแบบเงียบ */
    silent: false,           /* บอกชัดว่าไม่ใช่แจ้งเตือนแบบเงียบ */
    requireInteraction: false,
    vibrate: [200, 100, 200],
    data: { nav, type: d.type || '', jobId: d.jobId || '', machineId: d.machineId || '' },
    actions: [{ action: 'open', title: 'เปิดดู' }]
  });
});

/* ═══ 2. แตะแจ้งเตือน ═══
   ถ้าแอปเปิดอยู่แล้ว -> โฟกัสแท็บเดิม + ส่ง message ให้ย้ายหน้า
   ถ้ายังไม่เปิด        -> เปิดใหม่พร้อม ?nav=… */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const data = e.notification.data || {};
  const nav  = data.nav || 'home';

  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if ('focus' in c) {
        try { c.postMessage({ type: 'NOTIF_NAVIGATE', nav, data }); } catch (_) {}
        return c.focus();
      }
    }
    if (self.clients.openWindow) {
      return self.clients.openWindow('./index.html?nav=' + encodeURIComponent(nav));
    }
  })());
});

/* ═══ 3. แคชเปลือกแอป ═══ */
const SHELL_FILES = [
  './manifest.json',
  './icon-96.png',
  './icon-152.png',
  './icon-167.png',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (e) => {
  self.skipWaiting();   /* เวอร์ชันใหม่ขึ้นทันที ไม่ต้องรอปิดทุกแท็บ */
  e.waitUntil(
    caches.open(SHELL).then(c => c.addAll(SHELL_FILES).catch(() => {}))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== SHELL).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  /* ห้ามแตะคำขอไปหลังบ้าน — ต้องสดเสมอ */
  if (url.hostname.includes('supabase.co') ||
      url.hostname.includes('script.google.com') ||
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('gstatic.com')) return;

  /* หน้าเว็บ: เอาของใหม่ก่อน เน็ตหลุดค่อยใช้ของเก่า
     (กันปัญหา "deploy แล้วยังเห็นของเดิม") */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('./index.html').then(r => r || caches.match(req)))
    );
    return;
  }

  /* ไอคอน/manifest: ใช้ของในเครื่องก่อน เร็วกว่า */
  if (url.pathname.includes('/icons/') || url.pathname.endsWith('manifest.json')) {
    e.respondWith(
      caches.match(req).then(r => r || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(SHELL).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => r))
    );
  }
});

/* ═══ ให้หน้าเว็บสั่งอัปเดตทันทีได้ ═══ */
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
