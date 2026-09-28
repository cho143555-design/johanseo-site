SET lock_timeout = '5s';
ALTER TABLE public.submissions ADD COLUMN reasoning jsonb;
ALTER TABLE public.submissions ADD COLUMN reasoning_request_id uuid;
ALTER TABLE public.submissions ADD CONSTRAINT submissions_reasoning_object_check
  CHECK (reasoning IS NULL OR jsonb_typeof(reasoning) = 'object');
CREATE UNIQUE INDEX submissions_reasoning_request_id_unique
  ON public.submissions(reasoning_request_id) WHERE reasoning_request_id IS NOT NULL;
COMMENT ON COLUMN public.submissions.reasoning IS 'Per-attempt reasons for ppajak level 2; first reasons retained on retry. Existing records remain NULL.';
NOTIFY pgrst, 'reload schema';
