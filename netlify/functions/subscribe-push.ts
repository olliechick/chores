import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const authHeader = event.headers.authorization;
    if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

    const { subscription } = JSON.parse(event.body || '{}');
    if (!subscription) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Subscription is required' }) };
    }

    const email = user.email?.toLowerCase();
    if (!email) return { statusCode: 400, body: JSON.stringify({ error: 'No email on account' }) };

    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_email', email)
      .filter('subscription->>endpoint', 'eq', subscription.endpoint);

    const { error: insertError } = await supabase
      .from('push_subscriptions')
      .insert({ user_email: email, subscription });

    if (insertError) {
      console.error('Failed to insert push subscription:', insertError);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to save subscription' }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    console.error('subscribe-push error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal error' }) };
  }
};
