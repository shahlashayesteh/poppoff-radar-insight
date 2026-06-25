
CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  provider text NOT NULL DEFAULT 'stripe',
  environment text NOT NULL,
  raw_payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'processing',
  processed_at timestamptz,
  error text,
  retry_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_event_id ON public.payment_events(event_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_status ON public.payment_events(status);

GRANT ALL ON public.payment_events TO service_role;

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages payment events"
  ON public.payment_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

ALTER TABLE public.venue_settings
  ADD COLUMN IF NOT EXISTS pos_system text,
  ADD COLUMN IF NOT EXISTS labor_system text,
  ADD COLUMN IF NOT EXISTS market text,
  ADD COLUMN IF NOT EXISTS currency text;
