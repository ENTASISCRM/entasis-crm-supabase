-- ═══════════════════════════════════════════════════════════════════════════
-- MODULE MULTI-ÉQUIPEMENT
--
-- Objectif : voir, pour chaque client, les familles de produits qu'il détient,
-- et faire ressortir les opportunités de cross-sell (clients mono-équipés).
--
-- Principe : « une famille par produit » (décision Louis). Le multi-équipement
-- se compte en nombre de FAMILLES distinctes détenues.
--
-- Deux sources d'équipement fusionnées :
--   1. les deals au statut « Signé » (produit vendu dans le CRM),
--   2. les équipements DÉCLARÉS à la main (produits détenus avant le CRM, ou
--      renseignés par le conseiller), avec possibilité d'enregistrer une
--      ABSENCE confirmée (ex. « TNS sans prévoyance ») qui alimente les
--      opportunités.
--
-- RLS : la vue est en security_invoker, elle hérite donc automatiquement des
-- règles des tables sous-jacentes (manager voit tout, conseiller voit ses
-- clients). Aucune règle dupliquée.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Table de référence des familles de produits ────────────────────────
create table if not exists public.product_families (
  key     text primary key,          -- identifiant technique (ex. 'prevoyance')
  label   text not null,             -- libellé affiché (ex. 'Prévoyance')
  couleur text not null,             -- couleur d'accent du badge (hex)
  ordre   int  not null default 100  -- ordre d'affichage
);

-- Une famille par produit. Couleurs alignées sur la charte (badges maquette).
insert into public.product_families (key, label, couleur, ordre) values
  ('per',            'PER',                 '#274B73', 10),
  ('av',             'Assurance Vie',       '#8A6A2F', 20),
  ('scpi',           'SCPI',                '#8F5636', 30),
  ('structures',     'Produits Structurés', '#5B4B8A', 40),
  ('private_equity', 'Private Equity',      '#7A5C3E', 50),
  ('prevoyance',     'Prévoyance',          '#2C6B4E', 60),
  ('mutuelle',       'Mutuelle Santé',      '#2E8A8A', 70),
  ('emprunteur',     'Assurance Emprunteur','#B4453B', 80),
  ('immobilier',     'Immobilier / LMNP',   '#6B7A2E', 90),
  ('autre',          'Autre',               '#8A95A8', 999)
on conflict (key) do update
  set label = excluded.label, couleur = excluded.couleur, ordre = excluded.ordre;

-- ─── 2. Mapping libellé produit (texte libre) vers famille ─────────────────
-- Gère la casse et les accents (translate manuel, pas de dépendance unaccent).
-- Ordre des tests important : les libellés les plus spécifiques d'abord.
create or replace function public.equipment_famille(product text)
returns text
language plpgsql
immutable
as $$
declare
  p text;
begin
  if product is null then return 'autre'; end if;
  -- minuscules + retrait des accents courants des libellés produits
  p := lower(translate(product, 'àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ',
                                'aaaeeeeiioouuucAAAEEEEIIOOUUUC'));
  if p like '%scpi%'                                   then return 'scpi'; end if;
  if p like '%private equity%' or p like '%private-equity%'
                                                       then return 'private_equity'; end if;
  if p like '%structur%'                               then return 'structures'; end if;
  if p like '%assurance vie%' or p = 'av'              then return 'av'; end if;
  if p like '%emprunteur%'                             then return 'emprunteur'; end if;
  if p like '%prevoyance%'                             then return 'prevoyance'; end if;
  if p like '%mutuelle%' or p like '%sante%'           then return 'mutuelle'; end if;
  if p like '%lmnp%' or p like '%immobil%' or p like '%monument%'
     or p like '%girardin%' or p like '%vefa%'         then return 'immobilier'; end if;
  -- PER en dernier (le fragment 'per' n'apparait pas dans les autres libellés)
  if p like '%per%' or p like '%retraite%' or p like '%pero%'
                                                       then return 'per'; end if;
  return 'autre';
end;
$$;

-- ─── 3. Équipements DÉCLARÉS (produits d'avant le CRM, ou absences) ─────────
create table if not exists public.client_equipements_declares (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  famille    text not null references public.product_families(key),
  compagnie  text,
  detenu     boolean not null default true,  -- true = détenu, false = absence confirmée
  note       text,
  saisi_par  uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, famille)                -- une déclaration par famille et par client
);

comment on table public.client_equipements_declares is
  'Équipement produit renseigné à la main (avant le CRM, ou connu du conseiller). detenu=false = absence confirmee (ex. TNS sans prevoyance), utilisee pour les opportunites.';

-- RLS alignée sur clients (manager voit tout, conseiller voit ses clients).
alter table public.client_equipements_declares enable row level security;

create policy "declares_select_scope" on public.client_equipements_declares
  for select using (
    exists (
      select 1 from public.clients c
      where c.id = client_id
        and (public.is_manager()
             or c.advisor_code = public.current_advisor_code()
             or c.co_advisor_code = public.current_advisor_code())
    )
  );

create policy "declares_write_scope" on public.client_equipements_declares
  for all using (
    exists (
      select 1 from public.clients c
      where c.id = client_id
        and (public.is_manager()
             or c.advisor_code = public.current_advisor_code()
             or c.co_advisor_code = public.current_advisor_code())
    )
  )
  with check (
    exists (
      select 1 from public.clients c
      where c.id = client_id
        and (public.is_manager()
             or c.advisor_code = public.current_advisor_code()
             or c.co_advisor_code = public.current_advisor_code())
    )
  );

-- ─── 4. Vue d'équipement par client (deals signés + déclarés) ──────────────
-- security_invoker : hérite de la RLS de clients / deals / declares.
create or replace view public.client_equipment
with (security_invoker = true) as
with deal_fam as (
  -- familles issues des deals SIGNÉS rattachés à un client
  select client_id,
         public.equipment_famille(product) as famille,
         max(date_signed) as last_signed
  from public.deals
  where status = 'Signé' and client_id is not null
  group by client_id, public.equipment_famille(product)
),
decl as (
  select client_id, famille, detenu
  from public.client_equipements_declares
),
held as (
  -- familles DÉTENUES : deal signé, ou déclaré détenu
  select client_id, famille from deal_fam
  union
  select client_id, famille from decl where detenu = true
),
absent as (
  -- absences CONFIRMÉES (déclaré non détenu, et pas détenu par ailleurs)
  select d.client_id, d.famille
  from decl d
  where d.detenu = false
    and not exists (
      select 1 from held h where h.client_id = d.client_id and h.famille = d.famille
    )
)
select
  c.id                as client_id,
  c.nom, c.prenom,
  c.advisor_code, c.co_advisor_code,
  c.profession, c.revenus_annuels, c.patrimoine_estime,
  coalesce(
    (select array_agg(distinct h.famille order by h.famille)
       from held h where h.client_id = c.id), '{}') as familles,
  coalesce(
    (select count(distinct h.famille)
       from held h where h.client_id = c.id), 0)     as nb_familles,
  coalesce(
    (select array_agg(distinct a.famille order by a.famille)
       from absent a where a.client_id = c.id), '{}') as absences_confirmees,
  (select max(last_signed) from deal_fam df where df.client_id = c.id) as dernier_deal_signe
from public.clients c;
