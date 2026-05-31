// netlify/functions/stripe-webhook.js
// Listens for Stripe events and updates Supabase subscription records

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // Service role key (server-side only)
);

exports.handler = async (event) => {
  const sig = event.headers['stripe-signature'];

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  const { type, data } = stripeEvent;
  const obj = data.object;

  try {
    switch (type) {

      // ✅ Subscription activated (new subscriber or trial started)
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const userId = obj.metadata?.userId;
        if (!userId) break;

        const plan = obj.metadata?.plan || 'monthly';
        const status = obj.status; // active, trialing, past_due, canceled

        await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_customer_id: obj.customer,
          stripe_subscription_id: obj.id,
          plan,
          status,
          current_period_end: new Date(obj.current_period_end * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

        // Update the user's profile to mark them as pro
        await supabase.from('profiles').update({
          is_pro: ['active', 'trialing'].includes(status),
          plan,
        }).eq('id', userId);

        break;
      }

      // ❌ Subscription cancelled or expired
      case 'customer.subscription.deleted': {
        const userId = obj.metadata?.userId;
        if (!userId) break;

        await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_subscription_id: obj.id,
          status: 'canceled',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

        await supabase.from('profiles').update({
          is_pro: false,
          plan: 'free',
        }).eq('id', userId);

        break;
      }

      // 🆓 Handle 100% off coupon — checkout completed at £0
      case 'checkout.session.completed': {
        const userId = obj.client_reference_id || obj.metadata?.userId;
        if (!userId) break;

        // If total was 0 (100% coupon), grant access immediately
        if (obj.amount_total === 0) {
          await supabase.from('profiles').update({
            is_pro: true,
            plan: 'coupon_free',
          }).eq('id', userId);
        }
        break;
      }
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
    return { statusCode: 500, body: 'Internal error' };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
