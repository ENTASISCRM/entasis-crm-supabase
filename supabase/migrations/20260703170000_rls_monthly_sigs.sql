-- ═══════════════════════════════════════════════════════════════════════════
-- DURCISSEMENT RLS (audit du 2026-07-03) - projet CRM (tvgbblbceqvdtqnbeoik)
-- Idempotent, a coller dans le SQL Editor du CRM.
--
-- advisor_monthly_signatures : la lecture etait ouverte a tout authentifie
-- (using true), donc chaque conseiller pouvait reconstituer le classement de
-- production signee de toute l equipe (donnee de pilotage reservee a la
-- direction). Cette table n est pas lue par le navigateur, ce changement n a
-- donc aucun impact applicatif. On scope sur le manager ou le conseiller lui
-- meme, comme la policy d ecriture.
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists "ams_select_authenticated" on public.advisor_monthly_signatures;
drop policy if exists "advisor_monthly_signatures_select" on public.advisor_monthly_signatures;
create policy "ams_select_scope" on public.advisor_monthly_signatures
  for select to authenticated
  using (public.is_manager() or advisor_code = public.current_advisor_code());
