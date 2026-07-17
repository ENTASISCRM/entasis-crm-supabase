-- ═══════════════════════════════════════════════════════════════════════════
-- STATUT PROFESSIONNEL STRUCTURÉ (Multi-équipement)
--
-- Ajoute un statut client structuré (Salarié / TNS / Chef d'entreprise /
-- Retraité / Profession libérale / Autre), rendu OBLIGATOIRE à la signature
-- côté front (blocage au passage en « Signé »). Fiabilise les règles de
-- cross-sell (avant : détection TNS par analyse du texte profession).
--
-- La vue client_equipment est recréée pour exposer statut_pro.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.clients add column if not exists statut_pro text;

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
from public.clients c;
