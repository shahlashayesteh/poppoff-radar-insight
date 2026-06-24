ALTER TABLE public.subscriptions RENAME COLUMN paddle_subscription_id TO stripe_subscription_id;
ALTER TABLE public.subscriptions RENAME COLUMN paddle_customer_id TO stripe_customer_id;
DELETE FROM public.subscriptions;