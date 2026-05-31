# BrightPrep — Deployment & Setup Guide

## What's in this folder

```
brightprep/
├── index.html                          ← Main app (deploy this)
├── netlify.toml                        ← Netlify config
├── package.json                        ← Dependencies
└── netlify/functions/
    ├── create-checkout.js              ← Stripe checkout API
    └── stripe-webhook.js               ← Stripe → Supabase sync
```

---

## STEP 1 — Deploy to Netlify (5 minutes)

1. Go to **https://app.netlify.com** and sign up free
2. Click **"Add new site" → "Deploy manually"**
3. Drag the entire `brightprep/` folder into the drop zone
4. Your site is live at a URL like `https://amazing-name-123.netlify.app`
5. **Optional:** Add a custom domain in Site Settings → Domain Management

---

## STEP 2 — Set up Supabase (10 minutes)

1. Go to **https://supabase.com** and create a free project
2. In the SQL Editor, run this to create the required tables:

```sql
-- Profiles table
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  name text,
  year_group text,
  is_pro boolean default false,
  plan text default 'free',
  coupon_used text,
  created_at timestamptz default now()
);

-- Subscriptions table
create table subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  plan text,
  status text,
  current_period_end timestamptz,
  updated_at timestamptz default now()
);

-- Enable Row Level Security
alter table profiles enable row level security;
alter table subscriptions enable row level security;

-- Policies (users can only read/write their own data)
create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
create policy "Users can view own subscription" on subscriptions for select using (auth.uid() = user_id);
```

3. Go to **Project Settings → API**
4. Copy your **Project URL** and **anon public key**
5. In `index.html`, replace:
   ```js
   const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
   const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
   ```

---

## STEP 3 — Set up Stripe (15 minutes)

### Create your products

1. Go to **https://dashboard.stripe.com** → Products → Add product
2. Create **"BrightPrep Monthly"** — £9.99/month recurring
3. Create **"BrightPrep Annual"** — £77.99/year recurring
4. Copy both **Price IDs** (they look like `price_1ABC...`)

### Create your coupon codes

Go to **Billing → Coupons → Create coupon**, then create:

| Code | Type | Value | Use case |
|------|------|-------|----------|
| BRIGHT50 | Percentage | 50% off for 3 months | General promo |
| BRIGHT100 | Percentage | 100% off for 1 month | Free access |
| EARLYBIRD | Percentage | 30% off | Launch offer |
| TEACHER | Percentage | 100% off for 1 month | Teachers |
| SCHOOL2025 | Percentage | 40% off | Schools |

For each coupon, create a **Promotion Code** (Billing → Promotion Codes) using the same code string — this is what students type at checkout.

### Enable test mode first
Use test cards: `4242 4242 4242 4242`, any future date, any CVC.

---

## STEP 4 — Set Netlify environment variables

In Netlify: **Site Settings → Environment Variables → Add variable**

| Variable | Value |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_...` (or `sk_test_...` for testing) |
| `STRIPE_PRICE_MONTHLY` | `price_1ABC...` (monthly price ID) |
| `STRIPE_PRICE_ANNUAL` | `price_5DEF...` (annual price ID) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` (from step 5 below) |
| `SUPABASE_URL` | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | `eyJ...` (service role key from Supabase settings) |
| `SITE_URL` | `https://your-site.netlify.app` |

---

## STEP 5 — Set up Stripe webhook

1. In Stripe: **Developers → Webhooks → Add endpoint**
2. Endpoint URL: `https://your-site.netlify.app/api/stripe-webhook`
3. Select these events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `checkout.session.completed`
4. Copy the **Signing secret** (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`

---

## STEP 6 — Enable Google Sign-In (optional)

1. In Supabase: **Authentication → Providers → Google → Enable**
2. Follow the Google OAuth setup guide (takes ~10 min)
3. Add your Netlify URL to the allowed redirect URIs

---

## How coupon codes work

### Student-facing flow:
1. Student enters `BRIGHT50` on the signup form or upgrade modal
2. The code is previewed client-side (instant feedback)
3. When they click "Subscribe", the code is passed to Stripe Checkout
4. Stripe applies the discount automatically — student sees the discounted price
5. After payment, the Stripe webhook updates Supabase to mark them as Pro

### Shareable coupon URLs:
You can share links that pre-fill the coupon code:
```
https://your-site.netlify.app/?coupon=BRIGHT50
https://your-site.netlify.app/?coupon=TEACHER
```

The code auto-fills in the signup form and upgrade modal.

### Managing codes:
- Create/disable codes in **Stripe Dashboard → Billing → Promotion Codes**
- Set redemption limits (e.g. first 100 users only)
- Set expiry dates (e.g. end of month)
- Track how many times each code has been used

---

## Going live checklist

- [ ] Supabase project created and tables set up
- [ ] `SUPABASE_URL` and `SUPABASE_ANON_KEY` updated in `index.html`
- [ ] Stripe products and prices created
- [ ] Coupon codes created in Stripe
- [ ] All environment variables set in Netlify
- [ ] Stripe webhook endpoint created and secret saved
- [ ] Tested with Stripe test card `4242 4242 4242 4242`
- [ ] Switched Stripe to live mode (replace `sk_test_` with `sk_live_`)
- [ ] Custom domain connected (optional)

---

## Monthly running costs

| Service | Free tier | Paid |
|---|---|---|
| Netlify | Free (100GB bandwidth) | $19/mo if exceeded |
| Supabase | Free (50,000 users) | $25/mo if exceeded |
| Stripe | Free | 1.4% + 20p per transaction |
| Domain | — | ~£8/year |
| **Total** | **£0/month** until you scale | ~£30-40/mo at scale |
