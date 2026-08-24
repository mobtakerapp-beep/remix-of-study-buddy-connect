REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon, authenticated;

CREATE POLICY "Service role only" ON public.code_redemptions FOR ALL TO authenticated USING (false) WITH CHECK (false);