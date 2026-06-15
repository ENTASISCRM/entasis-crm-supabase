-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION : journal de connexions (login_audit), projet CRM
-- Date    : 2026-06-12
--
-- POURQUOI
-- Tracer chaque connexion reussie (date, IP, user agent) pour la securite et
-- les audits. Aucune trace n existe aujourd hui (auth.audit_log_entries vide).
--
-- PRINCIPE
-- Fonction record_login(p_ip, p_user_agent) appelee par le navigateur apres
-- une connexion reussie. Identite (uid, email) prise dans le JWT verifie,
-- jamais dans le client. IP prise en priorite dans les headers proxy
-- (request.headers via PostgREST), repli sur le parametre client (ipify).
-- Dedup 30s pour eviter les doublons multi hooks.
--
-- Lecture reservee aux managers via admin_login_audit() (le CRM est un SPA
-- sans serveur, la lecture passe donc par une fonction SECURITY DEFINER qui
-- verifie profiles.role = 'manager', plutot qu une policy SELECT large).
--
-- ZERO REGRESSION
-- Strictement additif. Nouvelle table, nouvelles fonctions, RLS uniquement
-- sur la nouvelle table. Rien d existant n est modifie.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Table login_audit ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.login_audit (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     UUID,
  email       TEXT,
  ip          TEXT,
  ip_source   TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.login_audit            IS 'Journal des connexions reussies, une ligne par login (dedup 30s). Alimente par record_login().';
COMMENT ON COLUMN public.login_audit.user_id    IS 'auth.uid() au moment de la connexion.';
COMMENT ON COLUMN public.login_audit.email      IS 'Email extrait du JWT (actor), non falsifiable.';
COMMENT ON COLUMN public.login_audit.ip         IS 'IP retenue, header proxy en priorite sinon parametre client.';
COMMENT ON COLUMN public.login_audit.ip_source  IS 'Origine de l IP, header (proxy serveur) ou client (param ipify).';
COMMENT ON COLUMN public.login_audit.user_agent IS 'User agent du navigateur au login.';

CREATE INDEX IF NOT EXISTS login_audit_user_idx    ON public.login_audit (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS login_audit_created_idx  ON public.login_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS login_audit_ip_idx       ON public.login_audit (ip);

-- ─── 2. Fonction record_login ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_login(
  p_ip          TEXT DEFAULT NULL,
  p_user_agent  TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_headers     JSON;
  v_header_ip   TEXT;
  v_ip          TEXT;
  v_ip_source   TEXT;
  v_ua          TEXT;
  v_email       TEXT;
  v_uid         UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  -- Dedup 30 secondes (plusieurs hooks client peuvent tirer pour un login).
  IF EXISTS (
    SELECT 1 FROM public.login_audit
     WHERE user_id = v_uid
       AND created_at > now() - INTERVAL '30 seconds'
  ) THEN
    RETURN;
  END IF;

  BEGIN
    v_headers := current_setting('request.headers', true)::json;
  EXCEPTION WHEN OTHERS THEN
    v_headers := NULL;
  END;
  v_header_ip := COALESCE(
    NULLIF(split_part(v_headers->>'x-forwarded-for', ',', 1), ''),
    v_headers->>'cf-connecting-ip',
    v_headers->>'x-real-ip'
  );

  IF v_header_ip IS NOT NULL THEN
    v_ip := v_header_ip;
    v_ip_source := 'header';
  ELSE
    v_ip := NULLIF(trim(p_ip), '');
    v_ip_source := CASE WHEN v_ip IS NULL THEN NULL ELSE 'client' END;
  END IF;

  v_ua    := COALESCE(NULLIF(v_headers->>'user-agent', ''), p_user_agent);
  v_email := COALESCE(auth.jwt()->>'email', '');

  INSERT INTO public.login_audit (user_id, email, ip, ip_source, user_agent)
  VALUES (v_uid, v_email, v_ip, v_ip_source, v_ua);
END;
$$;

COMMENT ON FUNCTION public.record_login IS
  'Insere une ligne dans login_audit pour l utilisateur courant (uid et email depuis le JWT). IP header proxy en priorite sinon parametre client. Dedup 30s.';

GRANT EXECUTE ON FUNCTION public.record_login(TEXT, TEXT) TO authenticated;

-- ─── 3. Lecture admin (managers uniquement) ─────────────────────────────────
-- Le CRM est un SPA, la lecture passe par cette fonction qui verifie que
-- l appelant est un manager (profiles.role = 'manager') avant de renvoyer
-- les lignes. p_email filtre optionnel (ILIKE), p_limit plafonne a 1000.
CREATE OR REPLACE FUNCTION public.admin_login_audit(
  p_email TEXT DEFAULT NULL,
  p_limit INT  DEFAULT 300
)
RETURNS SETOF public.login_audit
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = auth.uid() AND role = 'manager'
  ) THEN
    RAISE EXCEPTION 'Reserve aux managers';
  END IF;

  RETURN QUERY
    SELECT *
      FROM public.login_audit la
     WHERE (p_email IS NULL OR la.email ILIKE '%' || p_email || '%')
     ORDER BY la.created_at DESC
     LIMIT GREATEST(1, LEAST(p_limit, 1000));
END;
$$;

COMMENT ON FUNCTION public.admin_login_audit IS
  'Renvoie les connexions recentes (login_audit). Reserve aux managers (profiles.role = manager). Filtre email optionnel, limite plafonnee a 1000.';

GRANT EXECUTE ON FUNCTION public.admin_login_audit(TEXT, INT) TO authenticated;

-- ─── 4. RLS ─────────────────────────────────────────────────────────────────
-- RLS activee, aucune policy publique. La table n est lisible que via
-- admin_login_audit (SECURITY DEFINER, check manager) ou service_role.
-- L insert passe par record_login (SECURITY DEFINER), aucune policy INSERT.
ALTER TABLE public.login_audit ENABLE ROW LEVEL SECURITY;
