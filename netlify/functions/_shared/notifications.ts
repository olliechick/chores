import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function sendPushToUser(email: string, title: string, body: string) {
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_email', email);

  if (!subscriptions?.length) return;

  webpush.setVapidDetails(
    process.env.VAPID_EMAIL!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );

  for (const row of subscriptions) {
    try {
      await webpush.sendNotification(row.subscription, JSON.stringify({
        title,
        body,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png',
        tag: 'daily-reminder',
        url: '/',
      }));
    } catch (err) {
      if (err && typeof err === 'object' && 'statusCode' in err && (err.statusCode === 410 || err.statusCode === 404)) {
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('id', row.id);
      }
      console.error('Push send failed:', err);
    }
  }
}
