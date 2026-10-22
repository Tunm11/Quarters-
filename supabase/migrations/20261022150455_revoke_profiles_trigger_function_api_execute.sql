-- Least privilege: trigger execution does not require direct API-role EXECUTE grants.
REVOKE ALL ON FUNCTION public.profiles_set_updated_at() FROM PUBLIC, anon, authenticated;
