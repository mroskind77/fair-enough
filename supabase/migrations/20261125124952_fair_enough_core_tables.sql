-- Fair Enough core schema (spec v4, 5.2). RLS on every table.
-- Service-only tables have NO policies: only edge functions (service role) can touch them.

CREATE TABLE public.rate_counter (
  key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
ALTER TABLE public.rate_counter ENABLE ROW LEVEL SECURITY;
CREATE INDEX rate_counter_window_idx ON public.rate_counter (window_start);

-- Atomic upsert-increment. Returns true when the call is allowed.
CREATE OR REPLACE FUNCTION public.bump(p_key TEXT, p_window_seconds INTEGER, p_limit INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  v_start := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);
  INSERT INTO public.rate_counter AS rc (key, window_start, count)
  VALUES (p_key, v_start, 1)
  ON CONFLICT (key, window_start) DO UPDATE SET count = rc.count + 1
  RETURNING rc.count INTO v_count;
  RETURN v_count <= p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.bump(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump(TEXT, INTEGER, INTEGER) TO service_role;

CREATE TABLE public.cache (
  key TEXT PRIMARY KEY,
  json JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ttl_seconds INTEGER NOT NULL
);
ALTER TABLE public.cache ENABLE ROW LEVEL SECURITY;
CREATE INDEX cache_fetched_idx ON public.cache (fetched_at);

CREATE TABLE public.search_pool (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '2 hours'),
  fingerprint TEXT NOT NULL,
  request JSONB NOT NULL,
  pool JSONB NOT NULL DEFAULT '[]'::jsonb
);
ALTER TABLE public.search_pool ENABLE ROW LEVEL SECURITY;
CREATE INDEX search_pool_expires_idx ON public.search_pool (expires_at);

CREATE TABLE public.share_snapshot (
  id TEXT PRIMARY KEY CHECK (char_length(id) = 12),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  lang TEXT NOT NULL CHECK (lang IN ('he', 'en')),
  meet_at TIMESTAMPTZ NOT NULL,
  duration_min INTEGER NOT NULL CHECK (duration_min BETWEEN 15 AND 720),
  occasion TEXT NOT NULL CHECK (occasion IN ('date', 'friends', 'family')),
  chips TEXT[] NOT NULL DEFAULT '{}',
  kosher BOOLEAN NOT NULL DEFAULT false,
  hide_starts BOOLEAN NOT NULL DEFAULT false,
  people JSONB NOT NULL,
  venues JSONB NOT NULL,
  og_version INTEGER NOT NULL DEFAULT 1
);
ALTER TABLE public.share_snapshot ENABLE ROW LEVEL SECURITY;
CREATE INDEX share_snapshot_expires_idx ON public.share_snapshot (expires_at);

CREATE TABLE public.report (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  osm_ref TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('kosher_wrong', 'closed', 'hours_wrong', 'other')),
  text TEXT CHECK (char_length(text) <= 280),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'flagged'))
);
ALTER TABLE public.report ENABLE ROW LEVEL SECURITY;
CREATE INDEX report_osm_ref_idx ON public.report (osm_ref, created_at);

-- Public reference data: no personal information. Admin write policies come with /admin (M4).
CREATE TABLE public.venue_override (
  osm_ref TEXT PRIMARY KEY,
  kosher_status TEXT NOT NULL DEFAULT 'unknown' CHECK (kosher_status IN ('listed_kosher', 'listed_not_kosher', 'unknown')),
  certifier TEXT CHECK (char_length(certifier) <= 200),
  meat_dairy TEXT CHECK (meat_dairy IN ('meat', 'dairy', 'parve')),
  hours_override TEXT CHECK (char_length(hours_override) <= 500),
  last_checked_on DATE,
  source TEXT CHECK (char_length(source) <= 200),
  note TEXT CHECK (char_length(note) <= 500)
);
ALTER TABLE public.venue_override ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read venue overrides" ON public.venue_override
  FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.activity_extra (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(name) <= 200),
  name_he TEXT CHECK (char_length(name_he) <= 200),
  chip TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN 29 AND 33.5),
  lon DOUBLE PRECISION NOT NULL CHECK (lon BETWEEN 34 AND 36),
  website TEXT CHECK (char_length(website) <= 200),
  phone TEXT CHECK (char_length(phone) <= 40),
  confidence REAL,
  source_datasets TEXT[] NOT NULL DEFAULT '{}',
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hidden BOOLEAN NOT NULL DEFAULT false
);
ALTER TABLE public.activity_extra ENABLE ROW LEVEL SECURITY;
CREATE INDEX activity_extra_chip_idx ON public.activity_extra (chip, lat, lon);
CREATE POLICY "Anyone can read visible activities" ON public.activity_extra
  FOR SELECT TO anon, authenticated USING (hidden = false);
