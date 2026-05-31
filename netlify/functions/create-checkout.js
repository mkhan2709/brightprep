// netlify/functions/create-checkout.js
// Stripe Checkout session creator with coupon/promotion code support

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  try {
    const { plan, userId, userEmail, couponCode } = JSON.parse(event.body);

    // Price IDs from your Stripe dashboard (replace with your actual IDs)
    const PRICES = {
      monthly: process.env.STRIPE_PRICE_MONTHLY,  // e.g. price_1234...
      annual:  process.env.STRIPE_PRICE_ANNUAL,    // e.g. price_5678...
    };

    const priceId = PRICES[plan];
    if (!priceId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid plan' }) };
    }

    const sessionConfig = {
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      // ✅ This enables the promo code box inside Stripe Checkout
      allow_promotion_codes: true,
      customer_email: userEmail,
      client_reference_id: userId,
      success_url: `${process.env.SITE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.SITE_URL}/index.html?cancelled=true`,
      metadata: { userId, plan },
      subscription_data: {
        metadata: { userId, plan },
        trial_period_days: 7, // 7-day free trial
      },
    };

    // If a specific coupon code was pre-applied (e.g. from a URL ?coupon=FREE100)
    // we can look it up and apply it directly so the user doesn't need to type it
    if (couponCode && couponCode.trim() !== '') {
      try {
        // Look up the promotion code
        const promoCodes = await stripe.promotionCodes.list({
          code: couponCode.trim().toUpperCase(),
          active: true,
          limit: 1,
        });
        if (promoCodes.data.length > 0) {
          sessionConfig.discounts = [{ promotion_code: promoCodes.data[0].id }];
          // When using discounts array, we can't also allow_promotion_codes
          delete sessionConfig.allow_promotion_codes;
        }
      } catch (e) {
        // Coupon not found — just let Stripe Checkout handle it normally
        console.log('Promo code lookup failed:', e.message);
      }
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error('Stripe error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
