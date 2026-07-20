-- ============================================================================
-- MIGRATION : Agent éditorial — table de configuration clé/valeur
-- Exécution MANUELLE dans le SQL Editor Supabase (PROD) après revue.
-- Entièrement ADDITIVE : aucune donnée ni table existante n'est modifiée.
--
-- Objectif : permettre au gérant de configurer la liste Brevo de la newsletter
-- depuis le CRM (onglet Éditorial), sans variable d'environnement. Table
-- clé/valeur générique, extensible à d'autres réglages éditoriaux plus tard.
-- Clés utilisées à ce jour :
--   'brevo_list_id'   → { "id": 12, "name": "Newsletter patrimoniale" }
-- ============================================================================

CREATE TABLE public.editorial_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

-- RLS : lecture et écriture réservées aux managers (comme editorial_packages).
ALTER TABLE public.editorial_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "editorial_config_select_manager" ON public.editorial_config
  FOR SELECT USING (public.is_manager());
CREATE POLICY "editorial_config_insert_manager" ON public.editorial_config
  FOR INSERT WITH CHECK (public.is_manager());
CREATE POLICY "editorial_config_update_manager" ON public.editorial_config
  FOR UPDATE USING (public.is_manager()) WITH CHECK (public.is_manager());
CREATE POLICY "editorial_config_delete_manager" ON public.editorial_config
  FOR DELETE USING (public.is_manager());

-- ============================================================================
-- RÉVERSIBILITÉ :
--   DROP TABLE public.editorial_config;
-- ============================================================================

-- Contrôle post-migration (lecture seule) :
--   SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'editorial_config';
--   SELECT key, value FROM public.editorial_config;
