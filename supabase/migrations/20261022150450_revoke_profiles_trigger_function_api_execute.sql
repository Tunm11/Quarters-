-- Applied live as version 20261022150450
-- (name: revoke_profiles_trigger_function_api_execute).
--
-- This is the repository record of a security correction that has already been
-- executed against the production project. Do not re-run it against production
-- merely to align files. It exists so a fresh database ends in the same
-- privilege state.
--
-- Trigger functions do not need EXECUTE for the roles that fire them. REVOKE is
-- idempotent, and the owning postgres role retains execution.
--
-- Live history also contains a duplicate entry for this same name at version
-- 20261022150455. That duplicate is intentionally not recreated as a second
-- migration here; see docs/stage-1.md.

revoke all on function public.profiles_set_updated_at() from public;
revoke all on function public.profiles_set_updated_at() from anon;
revoke all on function public.profiles_set_updated_at() from authenticated;
