-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION SECURITE. Date, 2026-09-04. Appliquee en production le 04/09/2026.
--
-- 1. deals_insert_v2 n exigeait que « un profil actif porte mon identifiant » :
--    ni le code conseiller ni le client n etaient contraints. Un conseiller
--    pouvait creer un dossier SIGNE sous le code d un collegue, qui comptait
--    aussitot dans les totaux du cabinet et dans le calcul de SA remuneration.
--    Le trigger de protection du titulaire ne se declenchait qu a l UPDATE, il
--    ne voyait jamais un INSERT. L ecran restreint deja la liste des
--    conseillers selectionnables au code de l utilisateur quand il n est pas
--    manager (src/App.jsx, visibleProfiles) : la regle d acces ne fait que
--    refleter cette intention.
--
-- 2. cabinet_totals_month est SECURITY DEFINER, lit les dossiers sans RLS, et
--    son execution etait accordee a « authenticated » sans controle. Or
--    « authenticated » inclut les comptes de l espace client, crees sur le
--    meme projet et qui n ont volontairement aucune ligne dans profiles : un
--    client du cabinet pouvait lire les primes signees, le pipeline et le
--    nombre de dossiers, mois par mois.
--
-- 3. take_lead : meme profil de risque (SECURITY DEFINER, advisor_id fourni
--    par l appelant) et plus appelee par aucun des deux depots.
--
-- Verifie apres application : un conseiller cree toujours sous son code, est
-- refuse sous celui d un collegue, et lit toujours le chiffre du cabinet ;
-- un compte sans profil ne le lit plus.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS deals_insert_v2 ON public.deals;
CREATE POLICY deals_insert_v2 ON public.deals
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_manager())
    OR advisor_code = (SELECT public.current_advisor_code())
  );

CREATE OR REPLACE FUNCTION public.proteger_titulaire_deal_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  -- La cle de service (crons, pont Lead Room) n a pas d auth.uid().
  if auth.uid() is null then return new; end if;
  if public.is_manager() then return new; end if;
  if new.advisor_code is distinct from public.current_advisor_code() then
    raise exception 'Un dossier se cree sous votre propre code conseiller';
  end if;
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_proteger_titulaire_deal_ins ON public.deals;
CREATE TRIGGER trg_proteger_titulaire_deal_ins
  BEFORE INSERT ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.proteger_titulaire_deal_insert();

CREATE OR REPLACE FUNCTION public.cabinet_totals_month(p_month text)
RETURNS TABLE (pp_signee numeric, pu_signee numeric, pp_pipeline numeric,
               pu_pipeline numeric, signed_count int, pipeline_count int, total_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  -- is_staff() exige une ligne profiles active : les comptes de l espace
  -- client n en ont pas, ils sont donc exclus.
  if not public.is_staff() then
    raise exception 'Reserve aux conseillers en poste';
  end if;
  return query
    select
      coalesce(sum(case when status = 'Signé' then coalesce(pp_m,0)*12 else 0 end),0)::numeric,
      coalesce(sum(case when status = 'Signé' then coalesce(pu,0) else 0 end),0)::numeric,
      coalesce(sum(case when status in ('En cours','Prévu') then coalesce(pp_m,0)*12 else 0 end),0)::numeric,
      coalesce(sum(case when status in ('En cours','Prévu') then coalesce(pu,0) else 0 end),0)::numeric,
      count(*) filter (where status = 'Signé')::int,
      count(*) filter (where status in ('En cours','Prévu'))::int,
      count(*)::int
    from public.deals where month = p_month;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.take_lead(uuid, uuid) FROM authenticated, anon;
