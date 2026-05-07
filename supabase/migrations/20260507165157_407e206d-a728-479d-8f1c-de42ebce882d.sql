
-- Roles enum
CREATE TYPE public.app_role AS ENUM ('manager', 'server');

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  business_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- User roles
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- has_role helper (security definer to avoid recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Generate unique 6-digit join code
CREATE OR REPLACE FUNCTION public.generate_unique_join_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code text;
  attempts int := 0;
BEGIN
  LOOP
    new_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    IF NOT EXISTS (SELECT 1 FROM public.venues WHERE join_code = new_code) THEN
      RETURN new_code;
    END IF;
    attempts := attempts + 1;
    IF attempts > 50 THEN
      RAISE EXCEPTION 'Could not generate unique join code';
    END IF;
  END LOOP;
END;
$$;

-- Venues
CREATE TABLE public.venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  join_code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

-- Auto-fill join_code on insert if not provided
CREATE OR REPLACE FUNCTION public.set_venue_join_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.join_code IS NULL OR NEW.join_code = '' THEN
    NEW.join_code := public.generate_unique_join_code();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_venue_join_code
  BEFORE INSERT ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.set_venue_join_code();

-- Venue members
CREATE TABLE public.venue_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, user_id)
);
ALTER TABLE public.venue_members ENABLE ROW LEVEL SECURITY;

-- Venue policies
CREATE POLICY "Managers create own venues" ON public.venues
  FOR INSERT WITH CHECK (auth.uid() = manager_id AND public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Managers read own venues" ON public.venues
  FOR SELECT USING (auth.uid() = manager_id);
CREATE POLICY "Managers update own venues" ON public.venues
  FOR UPDATE USING (auth.uid() = manager_id);
CREATE POLICY "Managers delete own venues" ON public.venues
  FOR DELETE USING (auth.uid() = manager_id);
CREATE POLICY "Servers read joined venues" ON public.venues
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.venue_members vm
    WHERE vm.venue_id = venues.id AND vm.user_id = auth.uid()
  ));

-- Venue member policies
CREATE POLICY "Members read own membership" ON public.venue_members
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Managers read venue memberships" ON public.venue_members
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.venues v
    WHERE v.id = venue_members.venue_id AND v.manager_id = auth.uid()
  ));
CREATE POLICY "Managers remove members" ON public.venue_members
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM public.venues v
    WHERE v.id = venue_members.venue_id AND v.manager_id = auth.uid()
  ));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_venues_updated_at BEFORE UPDATE ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, business_name)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'business_name'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Server signup: join with code (atomic)
CREATE OR REPLACE FUNCTION public.join_venue_with_code(_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue_id uuid;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO v_venue_id FROM public.venues WHERE join_code = _code;
  IF v_venue_id IS NULL THEN
    RAISE EXCEPTION 'Invalid join code';
  END IF;

  -- Cannot join your own venue as server
  IF EXISTS (SELECT 1 FROM public.venues WHERE id = v_venue_id AND manager_id = v_uid) THEN
    RAISE EXCEPTION 'You own this venue';
  END IF;

  -- Cannot be both manager and server
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_uid AND role = 'manager') THEN
    RAISE EXCEPTION 'Manager accounts cannot join as server';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'server')
    ON CONFLICT (user_id, role) DO NOTHING;
  INSERT INTO public.venue_members (venue_id, user_id) VALUES (v_venue_id, v_uid)
    ON CONFLICT (venue_id, user_id) DO NOTHING;

  RETURN v_venue_id;
END;
$$;

-- Manager: regenerate join code for a venue they own
CREATE OR REPLACE FUNCTION public.regenerate_venue_join_code(_venue_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.venues WHERE id = _venue_id AND manager_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  new_code := public.generate_unique_join_code();
  UPDATE public.venues SET join_code = new_code WHERE id = _venue_id;
  RETURN new_code;
END;
$$;
