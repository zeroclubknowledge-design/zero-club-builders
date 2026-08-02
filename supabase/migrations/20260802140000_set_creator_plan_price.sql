-- Creator pricing was approved after the subscription system was introduced.
-- This remains separate so databases that already applied the original plan
-- migration receive the new price without rebuilding subscriptions or Clubs.

update public.subscription_plans
set price_amount = 7000,
    currency = 'NGN',
    billing_interval = 'month',
    metadata = coalesce(metadata, '{}'::jsonb) - 'pricing_pending',
    updated_at = now()
where key = 'creator';

notify pgrst, 'reload schema';
