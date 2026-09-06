-- ═══════════════════════════════════════════════════════════════════════════
-- ESPACE RENTABILITE. Date, 2026-09-06. NON APPLIQUEE, en attente de Louis.
--
-- Louis veut un suivi annuel de production par personne et savoir si le
-- cabinet est rentable sur chacune, pour lui seul. Le role manager ne suffit
-- pas : Jean et Martin sont managers eux aussi. On introduit donc un drapeau
-- distinct, acces_pnl, porte par le profil, et toutes les donnees de cout et
-- de marge sont fermees a ce seul drapeau.
--
-- Regle du depot respectee : la remuneration du cabinet ne sort pas. Aucune
-- de ces tables n est lisible par un conseiller ni par un manager, et le
-- bareme reste cote serveur, il n entre pas dans ce fichier.
--
-- Contenu :
--   1. Drapeau acces_pnl et fonction est_direction_pnl()
--   2. Garde fou anti escalade etendu au drapeau
--   3. Parametres de cout du cabinet, ligne unique
--   4. Couts propres a une personne pour une annee
--   5. Grand livre de la production encaissee
--   6. Fonction pnl_conseiller_annuel(annee)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Le drapeau ─────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS acces_pnl boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.acces_pnl IS
  'Acces a l espace rentabilite. Distinct du role manager. Ne se donne que par la cle de service ou par un profil qui le porte deja.';

CREATE OR REPLACE FUNCTION public.est_direction_pnl()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND acces_pnl = true AND is_active = true
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.est_direction_pnl() FROM anon;

-- ── 2. Personne ne se donne le drapeau tout seul ──────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if TG_OP = 'INSERT' then
    if not public.is_manager() then
      new.role := 'advisor';
      new.rh_delegue := false;
      new.advisor_code := null;  -- attribue ensuite par trg_profiles_advisor_code
    end if;
    new.acces_pnl := false;      -- jamais a la creation, quel que soit le role
    return new;
  end if;
  if new.role is distinct from old.role and not public.is_manager() then
    raise exception 'Modification du role interdite';
  end if;
  if new.is_active is distinct from old.is_active and not public.is_manager() then
    raise exception 'Modification de is_active interdite';
  end if;
  if new.rh_delegue is distinct from old.rh_delegue and not public.is_manager() then
    raise exception 'Modification de la delegation RH interdite';
  end if;
  if new.advisor_code is distinct from old.advisor_code and not public.is_manager() then
    raise exception 'Modification du code conseiller interdite';
  end if;
  if new.email is distinct from old.email and not public.is_manager() then
    raise exception 'Modification de l email interdite';
  end if;
  -- Le drapeau rentabilite ne suit pas le role manager : seul un porteur du
  -- drapeau, ou la cle de service (auth.uid() nul), peut le deplacer.
  if new.acces_pnl is distinct from old.acces_pnl
     and auth.uid() is not null
     and not public.est_direction_pnl() then
    raise exception 'Modification de l acces rentabilite interdite';
  end if;
  return new;
end;
$function$;

-- ── 3. Parametres de cout du cabinet ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pnl_parametres (
  id                        boolean PRIMARY KEY DEFAULT true CHECK (id),
  coef_charges_cdi          numeric NOT NULL DEFAULT 0.42,
  coef_charges_cdd          numeric NOT NULL DEFAULT 0.42,
  coef_charges_alternant    numeric NOT NULL DEFAULT 0.05,
  coef_charges_stagiaire    numeric NOT NULL DEFAULT 0,
  coef_charges_mandataire   numeric NOT NULL DEFAULT 0,
  mutuelle_mensuelle        numeric NOT NULL DEFAULT 140,
  outils_mensuels_par_tete  numeric NOT NULL DEFAULT 150,
  frais_fixes_mensuels      numeric NOT NULL DEFAULT 0,
  repartir_frais_fixes      boolean NOT NULL DEFAULT false,
  updated_at                timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.pnl_parametres IS
  'Parametres de calcul du cout complet par personne. Ligne unique. Les valeurs par defaut sont des hypotheses a valider par Louis.';

INSERT INTO public.pnl_parametres (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.pnl_parametres ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pnl_parametres_direction ON public.pnl_parametres;
CREATE POLICY pnl_parametres_direction ON public.pnl_parametres
  FOR ALL TO authenticated
  USING ((SELECT public.est_direction_pnl()))
  WITH CHECK ((SELECT public.est_direction_pnl()));

-- ── 4. Couts propres a une personne ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pnl_couts_personne (
  profile_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  annee                  integer NOT NULL,
  cout_ecole_annuel      numeric NOT NULL DEFAULT 0,
  outils_mensuel         numeric,
  autres_couts_annuels   numeric NOT NULL DEFAULT 0,
  notes                  text,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, annee)
);
COMMENT ON TABLE public.pnl_couts_personne IS
  'Couts propres a une personne pour une annee : ecole des alternants, outils si different du forfait, divers.';

ALTER TABLE public.pnl_couts_personne ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pnl_couts_personne_direction ON public.pnl_couts_personne;
CREATE POLICY pnl_couts_personne_direction ON public.pnl_couts_personne
  FOR ALL TO authenticated
  USING ((SELECT public.est_direction_pnl()))
  WITH CHECK ((SELECT public.est_direction_pnl()));

-- ── 5. Grand livre de la production encaissee ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.production_encaissee (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date_signature        date NOT NULL,
  annee                 integer GENERATED ALWAYS AS (EXTRACT(YEAR FROM date_signature)::int) STORED,
  mois                  integer GENERATED ALWAYS AS (EXTRACT(MONTH FROM date_signature)::int) STORED,
  client_nom            text NOT NULL,
  produit               text,
  famille               text,
  volume_pp             numeric NOT NULL DEFAULT 0,
  volume_pu             numeric NOT NULL DEFAULT 0,
  compagnie             text,
  provenance            text,
  commission_encaissee  numeric NOT NULL DEFAULT 0,
  advisor_code          text,
  profile_id            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  source                text NOT NULL DEFAULT 'CA MOIS',
  import_lot            text,
  created_at            timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.production_encaissee IS
  'Grand livre des contrats signes et des commissions reellement encaissees, repris du fichier CA MOIS. Reserve a la direction rentabilite.';
CREATE INDEX IF NOT EXISTS idx_production_encaissee_annee ON public.production_encaissee (annee, profile_id);

ALTER TABLE public.production_encaissee ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS production_encaissee_direction ON public.production_encaissee;
CREATE POLICY production_encaissee_direction ON public.production_encaissee
  FOR ALL TO authenticated
  USING ((SELECT public.est_direction_pnl()))
  WITH CHECK ((SELECT public.est_direction_pnl()));

-- ── 6. La vue de rentabilite, une ligne par personne ──────────────────────
-- Fonction et non vue : une vue serait lue avec les droits de son proprietaire
-- ou de l appelant selon le reglage, alors qu ici l acces doit etre refuse
-- explicitement a tout le monde sauf au porteur du drapeau.
CREATE OR REPLACE FUNCTION public.pnl_conseiller_annuel(p_annee integer)
RETURNS TABLE (
  profile_id          uuid,
  nom                 text,
  advisor_code        text,
  type_contrat        text,
  mois_actifs         integer,
  cout_fixe           numeric,
  cout_ecole          numeric,
  cout_outils         numeric,
  cout_frais_fixes    numeric,
  cout_total          numeric,
  contrats_signes     integer,
  clients_uniques     integer,
  pp_annualisee       numeric,
  pu_collectee        numeric,
  commission_encaissee numeric,
  marge               numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  prm public.pnl_parametres%rowtype;
  nb_tetes integer;
begin
  if not public.est_direction_pnl() then
    raise exception 'Espace rentabilite reserve a la direction';
  end if;

  select * into prm from public.pnl_parametres where id = true;

  select count(*) into nb_tetes
  from public.conseiller_contrats c
  where c.actif = true and c.type_contrat <> 'GERANT';
  if coalesce(nb_tetes, 0) = 0 then nb_tetes := 1; end if;

  return query
  with contrat as (
    select distinct on (c.profile_id)
      c.profile_id, c.full_name, c.type_contrat,
      c.salaire_brut_mensuel, c.reste_a_charge_mensuel,
      c.date_debut, c.date_fin
    from public.conseiller_contrats c
    where c.type_contrat <> 'GERANT'
      and c.profile_id is not null
    order by c.profile_id, c.date_debut desc
  ),
  periode as (
    select
      ct.*,
      greatest(1, least(12,
        (extract(month from least(coalesce(ct.date_fin, make_date(p_annee,12,31)), make_date(p_annee,12,31)))
         - extract(month from greatest(coalesce(ct.date_debut, make_date(p_annee,1,1)), make_date(p_annee,1,1))) + 1)::int
      )) as mois_actifs
    from contrat ct
  ),
  couts as (
    select
      p.profile_id, p.full_name, p.type_contrat, p.mois_actifs,
      -- reste_a_charge_mensuel porte la part mensuelle du cout ecole de
      -- l alternant (750 a 3 497 euros par an selon l ecole) : il s ajoute
      -- au salaire charge, il ne le remplace pas.
      round(p.mois_actifs * (
        coalesce(p.salaire_brut_mensuel, 0) * (1 + case upper(p.type_contrat)
          when 'CDI' then prm.coef_charges_cdi
          when 'CDD' then prm.coef_charges_cdd
          when 'ALTERNANT' then prm.coef_charges_alternant
          when 'STAGIAIRE' then prm.coef_charges_stagiaire
          else prm.coef_charges_mandataire end)
        + coalesce(p.reste_a_charge_mensuel, 0)
        + case when coalesce(p.salaire_brut_mensuel, 0) > 0 then prm.mutuelle_mensuelle else 0 end
      ), 2) as cout_fixe,
      coalesce(cp.cout_ecole_annuel, 0) + coalesce(cp.autres_couts_annuels, 0) as cout_ecole,
      round(p.mois_actifs * coalesce(cp.outils_mensuel, prm.outils_mensuels_par_tete), 2) as cout_outils,
      case when prm.repartir_frais_fixes
           then round(p.mois_actifs * prm.frais_fixes_mensuels / nb_tetes, 2)
           else 0 end as cout_frais_fixes
    from periode p
    left join public.pnl_couts_personne cp
      on cp.profile_id = p.profile_id and cp.annee = p_annee
  ),
  prod as (
    select
      pe.profile_id,
      count(*)::int as contrats_signes,
      count(distinct upper(trim(pe.client_nom)))::int as clients_uniques,
      sum(pe.volume_pp) as pp_annualisee,
      sum(pe.volume_pu) as pu_collectee,
      sum(pe.commission_encaissee) as commission_encaissee
    from public.production_encaissee pe
    where pe.annee = p_annee and pe.profile_id is not null
    group by pe.profile_id
  )
  select
    c.profile_id,
    c.full_name,
    pr.advisor_code,
    c.type_contrat,
    c.mois_actifs,
    c.cout_fixe, c.cout_ecole, c.cout_outils, c.cout_frais_fixes,
    c.cout_fixe + c.cout_ecole + c.cout_outils + c.cout_frais_fixes as cout_total,
    coalesce(p.contrats_signes, 0),
    coalesce(p.clients_uniques, 0),
    coalesce(p.pp_annualisee, 0),
    coalesce(p.pu_collectee, 0),
    coalesce(p.commission_encaissee, 0),
    coalesce(p.commission_encaissee, 0)
      - (c.cout_fixe + c.cout_ecole + c.cout_outils + c.cout_frais_fixes) as marge
  from couts c
  left join prod p on p.profile_id = c.profile_id
  left join public.profiles pr on pr.id = c.profile_id
  order by 16 desc;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.pnl_conseiller_annuel(integer) FROM anon;
