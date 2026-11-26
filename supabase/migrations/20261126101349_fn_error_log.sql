-- Server errors (5xx) from the search function, for /diag/transit. No coordinates or anything about who searched.
-- Service-only: RLS on, no policies.
CREATE TABLE public.fn_error (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  fn TEXT NOT NULL CHECK (char_length(fn) <= 20),
  action TEXT CHECK (char_length(action) <= 20),
  sid TEXT CHECK (char_length(sid) <= 40),
  status INTEGER NOT NULL,
  cause TEXT NOT NULL CHECK (char_length(cause) <= 200),
  ms INTEGER
);
ALTER TABLE public.fn_error ENABLE ROW LEVEL SECURITY;
CREATE INDEX fn_error_at_idx ON public.fn_error (at DESC);