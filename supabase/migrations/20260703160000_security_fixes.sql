-- ═══════════════════════════════════════════════════════════════════════════
-- CORRECTIFS DE SECURITE (audit du 2026-07-03)
-- Projet CRM (tvgbblbceqvdtqnbeoik). Idempotent, a coller dans le SQL Editor.
--
-- Corrige deux failles confirmees :
--  1. Escalade de privilege : un conseiller pouvait passer son propre role a
--     manager via un UPDATE PostgREST direct (la policy ne verifiait que
--     l identite de la ligne, pas la valeur du champ role). Debloquait salaires,
--     contrats et marge de toute l equipe.
--  2. conformite_dossiers en RLS using(true) : tout conseiller lisait, modifiait
--     et supprimait les dossiers reglementaires (recueil de besoins, profil
--     investisseur) des clients des autres conseillers.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ 1. Anti escalade de role sur profiles ═══════════════════════════════════
-- Trigger BEFORE UPDATE : seul un manager peut changer role ou is_active.
-- security definer + search_path fige pour etre robuste face a PostgREST.
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_manager() then
    raise exception 'Modification du role interdite';
  end if;
  if new.is_active is distinct from old.is_active and not public.is_manager() then
    raise exception 'Modification de is_active interdite';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_no_selfescalation on public.profiles;
create trigger trg_profiles_no_selfescalation
  before update on public.profiles
  for each row execute function public.prevent_role_escalation();

-- ═══ 2. RLS conformite_dossiers scopee par conseiller ════════════════════════
-- Remplace les 4 policies using(true)/with check(true) par un filtrage sur le
-- conseiller proprietaire (advisor_code), le manager voit tout. Meme pattern
-- que les autres tables du CRM (is_manager() + current_advisor_code()).
drop policy if exists "conformite select authenticated" on public.conformite_dossiers;
create policy "conformite_select_scope" on public.conformite_dossiers
  for select to authenticated
  using (public.is_manager() or advisor_code = public.current_advisor_code());

drop policy if exists "conformite insert authenticated" on public.conformite_dossiers;
create policy "conformite_insert_scope" on public.conformite_dossiers
  for insert to authenticated
  with check (public.is_manager() or advisor_code = public.current_advisor_code());

drop policy if exists "conformite update authenticated" on public.conformite_dossiers;
create policy "conformite_update_scope" on public.conformite_dossiers
  for update to authenticated
  using (public.is_manager() or advisor_code = public.current_advisor_code())
  with check (public.is_manager() or advisor_code = public.current_advisor_code());

drop policy if exists "conformite delete authenticated" on public.conformite_dossiers;
create policy "conformite_delete_scope" on public.conformite_dossiers
  for delete to authenticated
  using (public.is_manager() or advisor_code = public.current_advisor_code());
