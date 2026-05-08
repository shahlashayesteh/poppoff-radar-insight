CREATE TABLE public.venue_pairings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  item text NOT NULL,
  category text NOT NULL,
  pair_with text NOT NULL,
  why text,
  priority text,
  position int NOT NULL DEFAULT 0,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, item, category, pair_with)
);

CREATE INDEX idx_venue_pairings_venue ON public.venue_pairings(venue_id);

ALTER TABLE public.venue_pairings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read venue pairings" ON public.venue_pairings
  FOR SELECT USING (is_venue_manager(venue_id));
CREATE POLICY "Managers insert venue pairings" ON public.venue_pairings
  FOR INSERT WITH CHECK (is_venue_manager(venue_id));
CREATE POLICY "Managers update venue pairings" ON public.venue_pairings
  FOR UPDATE USING (is_venue_manager(venue_id)) WITH CHECK (is_venue_manager(venue_id));
CREATE POLICY "Managers delete venue pairings" ON public.venue_pairings
  FOR DELETE USING (is_venue_manager(venue_id));
CREATE POLICY "Servers read venue pairings" ON public.venue_pairings
  FOR SELECT USING (is_venue_member(venue_id));