import { supabase } from './supabase';

function base64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(b64);
  return new Uint8Array([...rawData].map((c) => c.charCodeAt(0)));
}

export async function subscribeToPush(registration?: ServiceWorkerRegistration) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.log('[Push] No session yet, skipping subscription');
      return false;
    }

    const reg = registration || await navigator.serviceWorker.ready;

    let sub: PushSubscription;
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY),
      } as PushSubscriptionOptionsInit);
    } catch (subErr) {
      console.error('[Push] subscribe failed:', subErr);
      return false;
    }

    const response = await fetch('/.netlify/functions/subscribe-push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });

    if (!response.ok) {
      console.error('[Push] Failed to save subscription to server');
      return false;
    }

    console.log('[Push] Successfully subscribed!');
    return true;
  } catch (err) {
    console.error('[Push] Error:', err);
    return false;
  }
}
