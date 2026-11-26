-- Log of Transitous lookups for the /diag/transit page. One row per lookup outcome.
-- Holds no coordinates or anything about the person searching. Service-only: RLS on, no policies.
CREATE TABLE public.transit_call (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sid UUID,
  endpoint TEXT NOT NULL CHECK (char_length(endpoint) <= 20),
  outcome TEXT NOT NULL CHECK (outcome IN ('ok','hit','shared','dropped','skip','cap','timeout','refused','dns','tls','network','4xx','429','5xx')),
  status INTEGER,
  ms INTEGER,
  bytes INTEGER
);
ALTER TABLE public.transit_call ENABLE ROW LEVEL SECURITY;
CREATE INDEX transit_call_at_idx ON public.transit_call (at DESC);
CREATE INDEX transit_call_sid_idx ON public.transit_call (sid);