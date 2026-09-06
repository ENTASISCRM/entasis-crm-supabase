-- ═══════════════════════════════════════════════════════════════════════════
-- ESPACE RENTABILITE. NON APPLIQUEE, en attente du feu vert de Louis.
--
-- Louis veut savoir, personne par personne et mois par mois, ce que chacun
-- rapporte, ce qu il coute, et si le cabinet gagne de l argent sur lui. Pour
-- lui seul.
--
-- LE ROLE MANAGER NE SUFFIT PAS. Trois profils sont managers actifs : Louis,
-- Jean Decamps et Martin Borgis. On introduit donc un drapeau distinct,
-- acces_pnl, et toutes les donnees de cout et de marge lui sont fermees.
--
-- Regle du depot respectee : la remuneration du cabinet ne sort pas. Aucune de
-- ces tables n est lisible par un conseiller ni par un manager ordinaire, et
-- le bareme reste cote serveur, il n entre pas dans ce fichier.
--
-- Contenu
--   1. Drapeau acces_pnl et fonction est_direction_pnl()
--   2. Garde fou anti escalade etendu au drapeau
--   3. Verrou par code : pnl_verrou, ferme a la seule cle de service
--   4. Journal d acces append only : pnl_acces_log
--   5. Parametres de cout du cabinet
--   6. Couts propres a une personne
--   7. Grand livre de la production encaissee
--   8. Fonction pnl_conseiller_annuel(annee)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Le drapeau ─────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS acces_pnl boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.acces_pnl IS
  'Acces a l espace rentabilite. Distinct du role manager. Ne se pose que par la cle de service ou par un profil qui le porte deja.';

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

REVOKE EXECUTE ON FUNCTION public.est_direction_pnl() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.est_direction_pnl() TO authenticated;

-- ── 2. Personne ne se donne le drapeau, personne ne touche a son porteur ──
-- ATTENTION : ce texte repart de la fonction TELLE QU ELLE EST EN BASE, et n y
-- ajoute que les deux blocs nouveaux. Une premiere version l avait reecrite de
-- memoire et supprimait au passage deux protections existantes : l activation
-- limitee au domaine du cabinet a l inscription, et la regle qui autorise la
-- PREMIERE pose du code conseiller tout en interdisant sa modification ensuite.
-- Ne jamais reecrire une fonction de garde sans relire sa version en production.
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if TG_OP = 'INSERT' then
    -- Un compte ordinaire ne choisit ni son role, ni sa delegation RH, ni son
    -- code : on efface ce qu il a fourni et le generateur, qui passe juste
    -- apres, attribue le code.
    if not public.is_manager() then
      new.role := 'advisor';
      new.rh_delegue := false;
      new.advisor_code := null;
      -- Ni son activation : hors du domaine du cabinet, le profil entre
      -- inactif et c est la direction qui l ouvre.
      new.is_active := coalesce(lower(new.email) like '%@entasis-conseil.fr', false);
    end if;
    new.acces_pnl := false;   -- jamais a la creation, quel que soit le role
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
  -- Le code conseiller definit tout le perimetre d acces : on autorise sa
  -- PREMIERE pose (arrivee d un conseiller), jamais un changement ensuite.
  if new.advisor_code is distinct from old.advisor_code
     and old.advisor_code is not null
     and not public.is_manager() then
    raise exception 'Modification du code conseiller interdite';
  end if;
  if new.email is distinct from old.email and not public.is_manager() then
    raise exception 'Modification de l email interdite';
  end if;

  -- NOUVEAU 1 : le drapeau rentabilite ne suit pas le role manager. Seul un
  -- porteur du drapeau, ou la cle de service (auth.uid() nul), peut le poser
  -- ou le retirer.
  if new.acces_pnl is distinct from old.acces_pnl
     and auth.uid() is not null
     and not public.est_direction_pnl() then
    raise exception 'Modification de l acces rentabilite interdite';
  end if;

  -- NOUVEAU 2 : on ne touche pas au PORTEUR du drapeau. Sans cette regle, un
  -- autre manager peut retrograder Louis en conseiller, l usurper (la route
  -- d usurpation ne refuse que les cibles de role manager), recuperer le
  -- drapeau, puis remettre le role en place. Deux ecritures, aucune trace.
  if old.acces_pnl = true
     and auth.uid() is not null
     and auth.uid() <> old.id
     and (new.role is distinct from old.role
          or new.is_active is distinct from old.is_active
          or new.email is distinct from old.email) then
    raise exception 'Ce profil est protege : son role, son activation et son adresse ne se modifient pas depuis un autre compte';
  end if;

  return new;
end;
$function$;

-- Le drapeau implique le role manager. Cette contrainte fait echouer la
-- retrogradation elle meme, et pas seulement l usurpation qui la suivrait.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_acces_pnl_manager;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_acces_pnl_manager
  CHECK (acces_pnl = false OR role = 'manager') NOT VALID;

-- ── 3. Le verrou par code ─────────────────────────────────────────────────
-- Aucune politique de lecture : meme le porteur du drapeau ne lit pas cette
-- table depuis le navigateur. Seule la cle de service y accede, depuis
-- api/pnl-deverrouiller.js. Le code n est jamais stocke en clair, seulement
-- son empreinte scrypt salee.
CREATE TABLE IF NOT EXISTS public.pnl_verrou (
  id                  boolean PRIMARY KEY DEFAULT true CHECK (id),
  empreinte           text,
  tentatives_echouees integer NOT NULL DEFAULT 0,
  bloque_jusqu_a      timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.pnl_verrou IS
  'Empreinte du code de l espace rentabilite et compteur de tentatives. Aucune politique RLS : lecture et ecriture reservees a la cle de service.';

INSERT INTO public.pnl_verrou (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.pnl_verrou ENABLE ROW LEVEL SECURITY;
-- RLS activee SANS aucune politique : tout acces via anon ou authenticated est
-- refuse par defaut. C est voulu, ce n est pas un oubli.
REVOKE ALL ON public.pnl_verrou FROM anon, authenticated;

-- ── 4. Journal d acces, append only ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pnl_acces_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  survenu_le  timestamptz NOT NULL DEFAULT now(),
  profile_id  uuid,
  email       text,
  action      text NOT NULL,   -- tentative | deverrouillage | lecture | export | refus
  detail      text,
  ip          text,
  agent       text
);
COMMENT ON TABLE public.pnl_acces_log IS
  'Journal append only des acces a l espace rentabilite. Alimente par la cle de service uniquement. Aucune politique de mise a jour ni de suppression.';
CREATE INDEX IF NOT EXISTS idx_pnl_acces_log_date ON public.pnl_acces_log (survenu_le DESC);

ALTER TABLE public.pnl_acces_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pnl_acces_log FROM anon, authenticated;

-- Append only au sens fort : meme la cle de service ne peut ni modifier ni
-- supprimer une ligne du journal.
CREATE OR REPLACE FUNCTION public.pnl_log_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
begin
  raise exception 'Le journal des acces rentabilite ne se modifie pas et ne s efface pas';
end;
$function$;

DROP TRIGGER IF EXISTS trg_pnl_acces_log_append_only ON public.pnl_acces_log;
CREATE TRIGGER trg_pnl_acces_log_append_only
  BEFORE UPDATE OR DELETE ON public.pnl_acces_log
  FOR EACH ROW EXECUTE FUNCTION public.pnl_log_append_only();

-- Un declencheur par ligne ne voit pas passer un TRUNCATE : sans celui ci, la
-- promesse « le journal ne s efface pas » serait fausse.
DROP TRIGGER IF EXISTS trg_pnl_acces_log_no_truncate ON public.pnl_acces_log;
CREATE TRIGGER trg_pnl_acces_log_no_truncate
  BEFORE TRUNCATE ON public.pnl_acces_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.pnl_log_append_only();

-- ── 5. Parametres de cout du cabinet ──────────────────────────────────────
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
  'Parametres de calcul du cout complet. Ligne unique. Les valeurs par defaut sont des HYPOTHESES, l ecran doit les afficher comme telles.';

INSERT INTO public.pnl_parametres (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.pnl_parametres ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pnl_parametres_direction ON public.pnl_parametres;
CREATE POLICY pnl_parametres_direction ON public.pnl_parametres
  FOR ALL TO authenticated
  USING ((SELECT public.est_direction_pnl()))
  WITH CHECK ((SELECT public.est_direction_pnl()));
-- Le role authentifie herite par defaut de tous les droits sur une table
-- nouvellement creee dans ce schema, et la cle publique du projet est dans le
-- paquet livre au navigateur. Sans ce retrait, une session porteuse du drapeau
-- lisait cette table EN DIRECT, sans passer par le verrou a quinze minutes et
-- sans laisser de ligne dans pnl_acces_log. La policy reste en place en
-- seconde barriere, mais c est ce REVOKE qui ferme la porte.
REVOKE ALL ON public.pnl_parametres FROM anon, authenticated;

-- ── 6. Couts propres a une personne ───────────────────────────────────────
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
-- Le role authentifie herite par defaut de tous les droits sur une table
-- nouvellement creee dans ce schema, et la cle publique du projet est dans le
-- paquet livre au navigateur. Sans ce retrait, une session porteuse du drapeau
-- lisait cette table EN DIRECT, sans passer par le verrou a quinze minutes et
-- sans laisser de ligne dans pnl_acces_log. La policy reste en place en
-- seconde barriere, mais c est ce REVOKE qui ferme la porte.
REVOKE ALL ON public.pnl_couts_personne FROM anon, authenticated;

-- ── 7. Grand livre de la production encaissee ─────────────────────────────
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
  -- Un contrat signe dont la commission tombe au cycle suivant n est pas un
  -- mois blanc : sans cette colonne, aout 2026 affiche zero de production
  -- alors que sept contrats sont signes.
  commission_attendue   numeric NOT NULL DEFAULT 0,
  advisor_code          text,
  profile_id            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  source                text NOT NULL DEFAULT 'CA MOIS',
  import_lot            text,
  created_at            timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.production_encaissee IS
  'Grand livre des contrats signes et des commissions reellement encaissees. Reserve a la direction rentabilite.';
CREATE INDEX IF NOT EXISTS idx_production_encaissee_annee ON public.production_encaissee (annee, profile_id);

ALTER TABLE public.production_encaissee ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS production_encaissee_direction ON public.production_encaissee;
CREATE POLICY production_encaissee_direction ON public.production_encaissee
  FOR ALL TO authenticated
  USING ((SELECT public.est_direction_pnl()))
  WITH CHECK ((SELECT public.est_direction_pnl()));
-- Le role authentifie herite par defaut de tous les droits sur une table
-- nouvellement creee dans ce schema, et la cle publique du projet est dans le
-- paquet livre au navigateur. Sans ce retrait, une session porteuse du drapeau
-- lisait cette table EN DIRECT, sans passer par le verrou a quinze minutes et
-- sans laisser de ligne dans pnl_acces_log. La policy reste en place en
-- seconde barriere, mais c est ce REVOKE qui ferme la porte.
REVOKE ALL ON public.production_encaissee FROM anon, authenticated;

-- ── 8. La rentabilite, une ligne par personne ─────────────────────────────
-- Fonction et non vue : l acces doit etre refuse explicitement a tout le monde
-- sauf au porteur du drapeau, et une vue serait lue avec les droits de son
-- proprietaire ou de l appelant selon le reglage.
CREATE OR REPLACE FUNCTION public.pnl_conseiller_annuel(p_annee integer)
RETURNS TABLE (
  profile_id           uuid,
  nom                  text,
  advisor_code         text,
  type_contrat         text,
  mois_actifs          integer,
  cout_fixe            numeric,
  cout_ecole           numeric,
  cout_outils          numeric,
  cout_frais_fixes     numeric,
  cout_total           numeric,
  contrats_signes      integer,
  clients_uniques      integer,
  pp_annualisee        numeric,
  pu_collectee         numeric,
  commission_encaissee numeric,
  marge                numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  prm public.pnl_parametres%rowtype;
  nb_tetes integer;
  debut_annee date := make_date(p_annee, 1, 1);
  fin_annee   date := make_date(p_annee, 12, 31);
begin
  -- Deux appelants legitimes, et deux seulement.
  --   - la cle de service, depuis api/pnl.js : auth.uid() y est nul, et c est
  --     le SEUL chemin qui traverse le verrou par code et ecrit au journal
  --   - un porteur du drapeau, en filet de secours
  -- Le GRANT est retire au role authentifie plus bas : sans lui, personne ne
  -- peut appeler cette fonction depuis un navigateur, meme avec le drapeau.
  -- Une premiere version refusait l appel serveur (auth.uid() nul) : le chemin
  -- legitime etait casse, et le seul qui fonctionnait etait celui sans verrou.
  if auth.uid() is not null and not public.est_direction_pnl() then
    raise exception 'Espace rentabilite reserve a la direction';
  end if;

  select * into prm from public.pnl_parametres where id = true;

  select count(*) into nb_tetes
  from public.conseiller_contrats c
  where c.actif = true and c.type_contrat <> 'GERANT';
  if coalesce(nb_tetes, 0) = 0 then nb_tetes := 1; end if;

  return query
  with contrat as (
    -- On retient le contrat qui RECOUVRE l annee demandee, pas simplement le
    -- plus recent : quelqu un dont le prochain contrat commence l annee
    -- suivante ne doit pas voir ce contrat futur ecraser celui en cours.
    select distinct on (c.profile_id)
      c.profile_id, c.full_name, c.type_contrat,
      c.salaire_brut_mensuel, c.reste_a_charge_mensuel,
      c.date_debut, c.date_fin
    from public.conseiller_contrats c
    where c.type_contrat <> 'GERANT'
      and c.profile_id is not null
      and coalesce(c.date_debut, debut_annee) <= fin_annee
      and coalesce(c.date_fin, fin_annee)     >= debut_annee
    order by c.profile_id, c.date_debut desc
  ),
  periode as (
    select
      ct.*,
      -- Mois de presence DANS l annee demandee. La borne basse est 0 et non 1 :
      -- la version precedente comptait 11 mois de cout pour quelqu un dont le
      -- contrat demarrait en 2027, et 6 mois pour quelqu un parti en 2025.
      -- Elle inventait des charges sur des gens absents.
      greatest(0, least(12,
        (extract(month from least(coalesce(ct.date_fin, fin_annee), fin_annee))
         - extract(month from greatest(coalesce(ct.date_debut, debut_annee), debut_annee)) + 1)::int
      )) as mois_actifs
    from contrat ct
  ),
  couts as (
    select
      p.profile_id, p.full_name, p.type_contrat, p.mois_actifs,
      -- reste_a_charge_mensuel porte la part mensuelle du cout ecole de
      -- l alternant : il s ajoute au salaire charge, il ne le remplace pas.
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
  -- FULL JOIN : un mandataire produit sans porter de contrat salarie, il doit
  -- apparaitre avec un cout nul. Un INNER ou LEFT depuis les couts l aurait
  -- fait disparaitre du tableau, et sa marge avec.
  select
    coalesce(c.profile_id, p.profile_id),
    coalesce(c.full_name, pr2.full_name),
    coalesce(pr.advisor_code, pr2.advisor_code),
    coalesce(c.type_contrat, 'MANDATAIRE'),
    coalesce(c.mois_actifs, 0),
    coalesce(c.cout_fixe, 0), coalesce(c.cout_ecole, 0),
    coalesce(c.cout_outils, 0), coalesce(c.cout_frais_fixes, 0),
    coalesce(c.cout_fixe, 0) + coalesce(c.cout_ecole, 0)
      + coalesce(c.cout_outils, 0) + coalesce(c.cout_frais_fixes, 0) as cout_total,
    coalesce(p.contrats_signes, 0),
    coalesce(p.clients_uniques, 0),
    coalesce(p.pp_annualisee, 0),
    coalesce(p.pu_collectee, 0),
    coalesce(p.commission_encaissee, 0),
    coalesce(p.commission_encaissee, 0)
      - (coalesce(c.cout_fixe, 0) + coalesce(c.cout_ecole, 0)
         + coalesce(c.cout_outils, 0) + coalesce(c.cout_frais_fixes, 0)) as marge
  from couts c
  full join prod p on p.profile_id = c.profile_id
  left join public.profiles pr  on pr.id  = c.profile_id
  left join public.profiles pr2 on pr2.id = p.profile_id
  order by 16 desc;
end;
$function$;

-- Aucun GRANT au role authentifie : le seul appelant est api/pnl.js, avec la
-- cle de service, apres avoir verifie les deux jetons et journalise la lecture.
REVOKE EXECUTE ON FUNCTION public.pnl_conseiller_annuel(integer) FROM anon, authenticated, public;
