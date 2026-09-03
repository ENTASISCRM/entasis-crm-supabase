-- ═══════════════════════════════════════════════════════════════════════════
-- QUI A SAISI LA FICHE EN DERNIER
--
-- Soixante et une fiches signées incomplètes sont en co conseil. Les deux
-- conseillers voient la même fiche à compléter et aucun ne sait si l autre
-- s en est déjà occupé : le second refait le travail ou attend pour rien.
--
-- La colonne maj_par porte le code du dernier conseiller qui a modifié la
-- fiche. Elle est posée par un déclencheur, depuis le profil de la session,
-- jamais depuis ce que le navigateur envoie. L accueil peut alors dire
-- « dernière saisie par VICTOR le 28/08 » sur une fiche partagée.
--
-- ZERO REGRESSION : une colonne nullable de plus, un déclencheur qui ne peut
-- pas faire échouer une écriture (toute erreur est avalée, la fiche s écrit).
-- Le déclencheur updated_at existant ne bouge pas.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS maj_par TEXT;
COMMENT ON COLUMN public.clients.maj_par IS
  'Code conseiller de la derniere personne qui a modifie la fiche. Pose par declencheur depuis la session, jamais par le client.';

CREATE OR REPLACE FUNCTION public.clients_maj_par()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  BEGIN
    v_code := public.current_advisor_code();
  EXCEPTION WHEN OTHERS THEN
    v_code := NULL;
  END;
  -- Sans code (cle de service, profil inactif), on garde la valeur en place :
  -- une migration ou un script ne doit pas effacer le nom du dernier humain.
  IF v_code IS NOT NULL AND btrim(v_code) <> '' THEN
    NEW.maj_par := btrim(v_code);
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.maj_par := OLD.maj_par;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clients_maj_par ON public.clients;
CREATE TRIGGER trg_clients_maj_par
  BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.clients_maj_par();
