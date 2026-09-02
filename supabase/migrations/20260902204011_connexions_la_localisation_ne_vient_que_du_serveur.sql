-- ═══════════════════════════════════════════════════════════════════════════
-- LA LOCALISATION D UNE CONNEXION NE PEUT VENIR QUE DU SERVEUR
--
-- La premiere version laissait le navigateur transmettre l IP et la ville a
-- record_login(). Un collaborateur curieux pouvait appeler la fonction a la
-- main, depuis la console de son navigateur, et declarer qu il se connectait
-- de Paris alors qu il etait ailleurs. Sur un journal de securite, une donnee
-- que le surveille peut ecrire lui meme ne vaut rien.
--
-- Desormais :
--   • record_login(p_user_agent) ne prend plus que le navigateur. L IP vient
--     des en tetes de la requete, que le client ne controle pas. C est le
--     chemin de repli, sans localisation.
--   • La ligne complete, avec sa ville et son pays, s ecrit par la fonction
--     Vercel api/connexion.js, qui verifie le jeton puis insere avec la cle de
--     service. Elle lit l IP dans l en tete de la vraie requete du navigateur :
--     ni l identite ni le lieu ne passent par ce que le client raconte.
--
-- ZERO REGRESSION : la table ne bouge pas, seule la signature de la fonction
-- d ecriture se resserre.
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.record_login(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.record_login(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.record_login(p_user_agent TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_headers   JSON;
  v_ip        TEXT;
  v_uid       UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

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
  v_ip := COALESCE(
    NULLIF(split_part(v_headers->>'x-forwarded-for', ',', 1), ''),
    v_headers->>'cf-connecting-ip',
    v_headers->>'x-real-ip'
  );

  INSERT INTO public.login_audit (user_id, email, ip, ip_source, user_agent)
  VALUES (
    v_uid,
    COALESCE(auth.jwt()->>'email', ''),
    v_ip,
    CASE WHEN v_ip IS NULL THEN NULL ELSE 'header' END,
    COALESCE(NULLIF(v_headers->>'user-agent', ''), p_user_agent)
  );
END;
$$;

COMMENT ON FUNCTION public.record_login IS
  'Chemin de repli du journal de connexions. Identite prise dans le JWT, IP prise dans les en tetes de la requete. Aucune donnee de localisation ne peut etre transmise par le client. Dedup 30 s.';

GRANT EXECUTE ON FUNCTION public.record_login(TEXT) TO authenticated;

-- La localisation s ecrit uniquement par la cle de service, depuis la fonction
-- Vercel. Cette fonction la sert : elle applique le meme dedup de 30 secondes
-- et refuse une ligne dont l utilisateur n existe pas.
CREATE OR REPLACE FUNCTION public.enregistrer_connexion_serveur(
  p_user_id UUID,
  p_email   TEXT,
  p_ip      TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_pays    TEXT DEFAULT NULL,
  p_region  TEXT DEFAULT NULL,
  p_ville   TEXT DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.login_audit
     WHERE user_id = p_user_id
       AND created_at > now() - INTERVAL '30 seconds'
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.login_audit (user_id, email, ip, ip_source, user_agent, pays, region, ville)
  VALUES (
    p_user_id,
    NULLIF(trim(p_email), ''),
    NULLIF(trim(p_ip), ''),
    CASE WHEN NULLIF(trim(p_ip), '') IS NULL THEN NULL ELSE 'serveur' END,
    NULLIF(trim(p_user_agent), ''),
    NULLIF(trim(p_pays), ''),
    NULLIF(trim(p_region), ''),
    NULLIF(trim(p_ville), '')
  );
  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.enregistrer_connexion_serveur IS
  'Ecrit une connexion avec sa localisation. Reservee a la cle de service, appelee par api/connexion.js apres verification du jeton. Dedup 30 s.';

-- Personne d autre que la cle de service ne peut l appeler : un conseiller ne
-- doit pas pouvoir signer une connexion, encore moins celle d un collegue.
REVOKE EXECUTE ON FUNCTION public.enregistrer_connexion_serveur(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, authenticated, anon;
