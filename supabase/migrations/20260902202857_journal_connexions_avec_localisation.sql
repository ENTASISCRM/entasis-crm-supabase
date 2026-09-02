-- ═══════════════════════════════════════════════════════════════════════════
-- JOURNAL DES CONNEXIONS AU CRM, AVEC LOCALISATION
--
-- POURQUOI
-- Le CRM porte les donnees patrimoniales de 379 clients. Aucune connexion n a
-- jamais ete tracee : auth.audit_log_entries est vide et la migration de juin
-- qui creait login_audit n avait jamais ete appliquee, si bien que l appel
-- record_login() du navigateur echouait en silence depuis trois mois.
--
-- CE QUI EST TRACE, ET SEULEMENT CELA
-- Une ligne par connexion reussie : la date et l heure, la personne, l IP, la
-- ville et le pays deduits de cette IP, et le navigateur. Rien pendant la
-- session : ni page consultee, ni position, ni duree. On sait d ou quelqu un
-- s est connecte, pas ce qu il a fait ni ou il se trouve maintenant.
--
-- CONSERVATION
-- Six mois, la duree recommandee par la CNIL pour un journal de connexion.
-- La purge tourne toute seule chaque nuit (pg_cron), les lignes plus vieilles
-- disparaissent sans intervention.
--
-- QUI LIT
-- La direction et la deleguee RH, via journal_connexions() qui verifie is_rh().
-- La table elle meme n est lisible par personne : RLS active, aucune policy.
--
-- SUITE : la migration 20260902204011 resserre l ecriture (la localisation ne
-- peut plus venir du navigateur) et 20260902204357 retire a PUBLIC le droit
-- d executer la purge.
--
-- ZERO REGRESSION
-- Strictement additif : une table neuve, trois fonctions neuves, une tache
-- planifiee neuve. Rien d existant n est touche.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. La table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.login_audit (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     UUID,
  email       TEXT,
  ip          TEXT,
  ip_source   TEXT,
  user_agent  TEXT,
  pays        TEXT,
  region      TEXT,
  ville       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Colonnes de localisation, posees a part : la table peut preexister sur un
-- environnement ou la migration de juin aurait ete jouee.
ALTER TABLE public.login_audit ADD COLUMN IF NOT EXISTS pays   TEXT;
ALTER TABLE public.login_audit ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE public.login_audit ADD COLUMN IF NOT EXISTS ville  TEXT;

COMMENT ON TABLE  public.login_audit            IS 'Journal des connexions reussies au CRM, une ligne par connexion (dedup 30 s). Conservation six mois. Alimente par record_login().';
COMMENT ON COLUMN public.login_audit.user_id    IS 'auth.uid() au moment de la connexion.';
COMMENT ON COLUMN public.login_audit.email      IS 'Email extrait du JWT, non falsifiable par le navigateur.';
COMMENT ON COLUMN public.login_audit.ip         IS 'IP publique retenue, header proxy en priorite sinon parametre transmis.';
COMMENT ON COLUMN public.login_audit.ip_source  IS 'Origine de l IP : header (proxy) ou serveur (fonction Vercel).';
COMMENT ON COLUMN public.login_audit.pays       IS 'Pays deduit de l IP au moment de la connexion, jamais recalcule ensuite.';
COMMENT ON COLUMN public.login_audit.region     IS 'Region deduite de l IP.';
COMMENT ON COLUMN public.login_audit.ville      IS 'Ville deduite de l IP. Approximative, elle situe le fournisseur d acces.';

CREATE INDEX IF NOT EXISTS login_audit_user_idx    ON public.login_audit (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS login_audit_created_idx ON public.login_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS login_audit_ip_idx      ON public.login_audit (ip);

ALTER TABLE public.login_audit ENABLE ROW LEVEL SECURITY;

-- ─── 2. Lecture ─────────────────────────────────────────────────────────────
-- Le CRM est une application sans serveur : la lecture passe par une fonction
-- SECURITY DEFINER qui verifie is_rh() plutot que par une policy large.
CREATE OR REPLACE FUNCTION public.journal_connexions(
  p_jours INT  DEFAULT 30,
  p_email TEXT DEFAULT NULL,
  p_limit INT  DEFAULT 300
)
RETURNS TABLE (
  id         BIGINT,
  user_id    UUID,
  email      TEXT,
  ip         TEXT,
  ip_source  TEXT,
  user_agent TEXT,
  pays       TEXT,
  region     TEXT,
  ville      TEXT,
  created_at TIMESTAMPTZ,
  full_name  TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_rh() THEN
    RAISE EXCEPTION 'Reserve a la direction et a la deleguee RH';
  END IF;

  RETURN QUERY
    SELECT la.id, la.user_id, la.email, la.ip, la.ip_source, la.user_agent,
           la.pays, la.region, la.ville, la.created_at, p.full_name
      FROM public.login_audit la
      LEFT JOIN public.profiles p ON p.id = la.user_id
     WHERE la.created_at > now() - make_interval(days => GREATEST(1, LEAST(p_jours, 190)))
       AND (p_email IS NULL OR la.email ILIKE '%' || p_email || '%')
     ORDER BY la.created_at DESC
     LIMIT GREATEST(1, LEAST(p_limit, 1000));
END;
$$;

COMMENT ON FUNCTION public.journal_connexions IS
  'Connexions recentes avec le nom du profil. Reserve a is_rh(). Fenetre bornee a 190 jours, limite plafonnee a 1000.';

GRANT EXECUTE ON FUNCTION public.journal_connexions(INT, TEXT, INT) TO authenticated;

-- ─── 3. Conservation six mois ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.purger_login_audit()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer;
BEGIN
  DELETE FROM public.login_audit WHERE created_at < now() - INTERVAL '6 months';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

COMMENT ON FUNCTION public.purger_login_audit IS
  'Efface les connexions de plus de six mois, duree recommandee par la CNIL pour un journal de connexion. Planifiee chaque nuit par pg_cron.';

REVOKE EXECUTE ON FUNCTION public.purger_login_audit() FROM authenticated, anon;

-- Tache planifiee, posee a part par cron.schedule :
--   select cron.schedule('purge-login-audit', '17 3 * * *',
--                        $cron$select public.purger_login_audit()$cron$);
