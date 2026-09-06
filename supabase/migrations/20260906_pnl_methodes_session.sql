-- Le schema auth n est pas expose par PostgREST : la lecture directe de
-- auth.mfa_amr_claims echouait toujours, donc la barriere anti usurpation de
-- l espace rentabilite refusait tout le monde, y compris la direction.
-- On passe par une fonction security definer, reservee a la cle de service,
-- jamais appelable depuis le navigateur.
create or replace function public.pnl_methodes_session(p_session uuid)
returns text[]
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    array_agg(c.authentication_method order by c.authentication_method),
    array[]::text[]
  )
  from auth.mfa_amr_claims c
  where c.session_id = p_session
$$;

revoke all on function public.pnl_methodes_session(uuid) from public;
revoke all on function public.pnl_methodes_session(uuid) from anon;
revoke all on function public.pnl_methodes_session(uuid) from authenticated;
grant execute on function public.pnl_methodes_session(uuid) to service_role;
