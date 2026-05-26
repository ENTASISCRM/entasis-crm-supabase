-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION : Auto-release serveur des leads "contacted" depuis +30 min
-- Date    : 2026-05-26
--
-- Pourquoi : l'auto-release côté client (setInterval dans React) ne tourne
-- que quand au moins un conseiller a la page Leadroom ouverte. Quand
-- personne ne l'a, les leads restent bloqués indéfiniment (cf. retour Paulin :
-- "Pris par Quentin depuis 1 jour").
--
-- Solution : pg_cron côté Supabase qui passe toutes les minutes pour
-- libérer automatiquement les leads "contacted" avec taken_at > 30 min.
--
-- Note : ne touche PAS aux leads avec status 'booked' (RDV planifié) ni
-- 'dead'. Conserve la logique métier existante.
-- ═══════════════════════════════════════════════════════════════════════════

-- Active pg_cron si pas déjà actif (Supabase l'a par défaut)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Fonction qui libère les leads expirés
CREATE OR REPLACE FUNCTION public.auto_release_stale_leads()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  released_count INT;
BEGIN
  UPDATE public.leads
  SET status = 'released',
      taken_by = NULL,
      taken_at = NULL
  WHERE status = 'contacted'
    AND taken_at IS NOT NULL
    AND taken_at < NOW() - INTERVAL '30 minutes';
  GET DIAGNOSTICS released_count = ROW_COUNT;
  RETURN released_count;
END;
$$;

COMMENT ON FUNCTION public.auto_release_stale_leads IS 'Libère automatiquement les leads contacted depuis +30 min. Appelée par pg_cron toutes les minutes.';

-- Planifie l'appel toutes les minutes
SELECT cron.schedule(
  'auto_release_stale_leads',
  '* * * * *',
  $$SELECT public.auto_release_stale_leads();$$
);
