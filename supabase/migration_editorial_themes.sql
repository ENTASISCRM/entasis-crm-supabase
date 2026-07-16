-- ============================================================================
-- MIGRATION : Agent éditorial — extension de l'enum des thèmes de 4 à 6
-- Exécution MANUELLE dans le SQL Editor Supabase (PROD) après revue.
--
-- Ajoute 'gestion-patrimoine' et 'protection-sociale', alignés sur les 6 hubs
-- du site entasis-conseil.fr/nos-solutions/. Les données existantes restent
-- valides (l'ancien ensemble est un sous-ensemble du nouveau).
-- ============================================================================

-- 1. Suppression de la contrainte CHECK actuelle (4 valeurs).
--    Nom par défaut généré par Postgres : {table}_{colonne}_check.
--    Si le DROP échoue (nom différent), retrouver le nom réel avec la requête
--    de contrôle en bas de fichier, puis adapter.
ALTER TABLE public.editorial_packages
  DROP CONSTRAINT editorial_packages_theme_check;

-- 2. Recréation avec les 6 valeurs.
ALTER TABLE public.editorial_packages
  ADD CONSTRAINT editorial_packages_theme_check
  CHECK (theme IN (
    'per-retraite',
    'assurance-vie',
    'immobilier',
    'fiscalite',
    'gestion-patrimoine',
    'protection-sociale'
  ));

-- ============================================================================
-- RÉVERSIBILITÉ : pour revenir à l'état antérieur (4 thèmes), exécuter —
-- après avoir vérifié qu'aucune ligne n'utilise les 2 nouveaux thèmes :
--
--   ALTER TABLE public.editorial_packages
--     DROP CONSTRAINT editorial_packages_theme_check;
--   ALTER TABLE public.editorial_packages
--     ADD CONSTRAINT editorial_packages_theme_check
--     CHECK (theme IN ('per-retraite', 'assurance-vie', 'immobilier', 'fiscalite'));
-- ============================================================================

-- Contrôle post-migration (lecture seule) :
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.editorial_packages'::regclass AND conname LIKE '%theme%';
