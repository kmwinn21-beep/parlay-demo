import Stripe from 'stripe';

// stripe is null when STRIPE_SECRET_KEY is not configured (e.g. demo deployments).
// Routes that need Stripe must check process.env.STRIPE_SECRET_KEY before using this.
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-04-22.dahlia',
      typescript: true,
    })
  : (null as unknown as Stripe);
