-- ============================================================================
-- MIGRATION : Agent éditorial — formats Instagram/vidéo + table newsletters
-- Exécution MANUELLE dans le SQL Editor Supabase (PROD) après revue.
-- Entièrement ADDITIVE : aucune donnée existante n'est modifiée.
-- ============================================================================

-- 1. Nouveaux formats du package 360° (vides par défaut : les packages
--    existants et les générations dont ces formats seraient invalides
--    restent parfaitement valides).
--    carrousel_insta : array de slides [{titre, texte}] (8 à 10 slides)
--    script_video    : objet {hook, sequences: [{plan, texte_oral,
--                      texte_ecran}], cta, duree_cible_sec}
ALTER TABLE public.editorial_packages
  ADD COLUMN carrousel_insta jsonb DEFAULT '[]',
  ADD COLUMN script_video jsonb DEFAULT '{}';

-- 2. Suivi des newsletters mensuelles (une ligne par campagne Brevo créée).
CREATE TABLE public.editorial_newsletters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start timestamptz NOT NULL,   -- début de la période couverte
  period_end timestamptz NOT NULL,     -- fin de la période couverte
  brevo_campaign_id text,              -- id de la campagne Brevo (brouillon)
  statut text NOT NULL DEFAULT 'draft'
    CHECK (statut IN ('draft', 'sent')),
  created_at timestamptz DEFAULT now()
);

-- 3. RLS : accès réservé aux managers, comme editorial_packages.
ALTER TABLE public.editorial_newsletters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "editorial_newsletters_select_manager" ON public.editorial_newsletters
  FOR SELECT USING (public.is_manager());
CREATE POLICY "editorial_newsletters_insert_manager" ON public.editorial_newsletters
  FOR INSERT WITH CHECK (public.is_manager());
CREATE POLICY "editorial_newsletters_update_manager" ON public.editorial_newsletters
  FOR UPDATE USING (public.is_manager()) WITH CHECK (public.is_manager());
CREATE POLICY "editorial_newsletters_delete_manager" ON public.editorial_newsletters
  FOR DELETE USING (public.is_manager());

-- ============================================================================
-- RÉVERSIBILITÉ :
--   ALTER TABLE public.editorial_packages
--     DROP COLUMN carrousel_insta,
--     DROP COLUMN script_video;
--   DROP TABLE public.editorial_newsletters;
-- ============================================================================

-- Contrôles post-migration (lecture seule) :
--   SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'editorial_packages'
--     AND column_name IN ('carrousel_insta', 'script_video');
--
--   SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname = 'editorial_newsletters';
