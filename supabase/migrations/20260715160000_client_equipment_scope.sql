-- ═══════════════════════════════════════════════════════════════════════════
-- PÉRIMÈTRE DU MULTI-ÉQUIPEMENT (Louis 15/07)
--
-- « Les clients c'est seulement ceux signés » : la vue ne montre plus toute la
-- table clients (elle contenait des prospects jamais signés qui noyaient le
-- tableau), mais uniquement :
--   1. les clients avec au moins un deal SIGNÉ,
--   2. plus ceux transmis par les conseillers (listes mail TNS = au moins une
--      ligne dans client_equipements_declares).
-- Appliquée sur PROD et DEV le 15/07/2026.
-- ═══════════════════════════════════════════════════════════════════════════

drop view if exists public.client_equipment;
create view public.client_equipment with (security_invoker = true) as
with deal_fam as (
  select client_id, public.equipment_famille(product) as famille, max(date_signed) as last_signed
  from public.deals where status = 'Signé' and client_id is not null
  group by client_id, public.equipment_famille(product)
),
decl as (select client_id, famille, detenu from public.client_equipements_declares),
held as (
  select client_id, famille from deal_fam
  union
  select client_id, famille from decl where detenu = true
),
absent as (
  select d.client_id, d.famille from decl d
  where d.detenu = false
    and not exists (select 1 from held h where h.client_id = d.client_id and h.famille = d.famille)
)
select
  c.id as client_id, c.nom, c.prenom, c.advisor_code, c.co_advisor_code,
  c.profession, c.statut_pro, c.revenus_annuels, c.patrimoine_estime,
  coalesce((select array_agg(distinct h.famille order by h.famille) from held h where h.client_id = c.id), '{}') as familles,
  coalesce((select count(distinct h.famille) from held h where h.client_id = c.id), 0) as nb_familles,
  coalesce((select array_agg(distinct a.famille order by a.famille) from absent a where a.client_id = c.id), '{}') as absences_confirmees,
  (select max(last_signed) from deal_fam df where df.client_id = c.id) as dernier_deal_signe
from public.clients c
where exists (select 1 from deal_fam df where df.client_id = c.id)
   or exists (select 1 from public.client_equipements_declares d where d.client_id = c.id);
