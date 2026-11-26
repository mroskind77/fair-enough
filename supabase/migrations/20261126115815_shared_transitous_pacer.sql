-- One pace for every search instance: Transitous allows about 9 calls per IP at once, then one every 3 s.
-- Service-only table (no policies): only edge functions (service role) can touch it.
CREATE TABLE public.pace (
  key TEXT PRIMARY KEY,
  tat TIMESTAMPTZ NOT NULL
);
ALTER TABLE public.pace ENABLE ROW LEVEL SECURITY;

-- Takes one turn. Returns the ms to wait before calling (0 = now), or -1 when the wait would exceed p_max_wait_ms
-- (no turn is taken then).
CREATE OR REPLACE FUNCTION public.pace_take(p_key TEXT, p_every_ms INTEGER, p_burst INTEGER, p_max_wait_ms INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_tat TIMESTAMPTZ;
  v_new TIMESTAMPTZ;
  v_wait INTEGER;
BEGIN
  INSERT INTO public.pace (key, tat) VALUES (p_key, v_now) ON CONFLICT (key) DO NOTHING;
  SELECT tat INTO v_tat FROM public.pace WHERE key = p_key FOR UPDATE;
  v_new := greatest(v_tat, v_now) + make_interval(secs => p_every_ms / 1000.0);
  v_wait := greatest(0, ceil(extract(epoch FROM (v_new - v_now)) * 1000 - p_burst::numeric * p_every_ms))::INTEGER;
  IF v_wait > p_max_wait_ms THEN
    RETURN -1;
  END IF;
  UPDATE public.pace SET tat = v_new WHERE key = p_key;
  RETURN v_wait;
END;
$$;
REVOKE ALL ON FUNCTION public.pace_take(TEXT, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pace_take(TEXT, INTEGER, INTEGER, INTEGER) TO service_role;