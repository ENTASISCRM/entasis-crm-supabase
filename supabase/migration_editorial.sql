-- ============================================================================
-- MIGRATION : Agent éditorial — table editorial_packages
-- Exécution MANUELLE dans le SQL Editor Supabase (aucun tooling de migration).
-- Prérequis : la fonction helper public.is_manager() existe (cf. schema.sql).
-- ============================================================================

-- 1. Table des packages éditoriaux générés (article + dérivés LinkedIn/X)
CREATE TABLE public.editorial_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sujet text NOT NULL,
  theme text NOT NULL
    CHECK (theme IN ('per-retraite', 'assurance-vie', 'immobilier', 'fiscalite')),

  -- Actualités utilisées pendant la génération : [{url, titre, date}]
  sources jsonb DEFAULT '[]',

  -- Frontmatter conforme au schéma blog du site Astro (title, description,
  -- date, category, author, readingTime, relatedProduct, draft)
  article_frontmatter jsonb NOT NULL,
  -- Corps markdown SANS le frontmatter
  article_md text NOT NULL,
  article_slug text NOT NULL UNIQUE,   -- ex. 'per-plafond-2026-tns'

  post_linkedin text,
  thread_x jsonb DEFAULT '[]',         -- array de strings (tweets)

  statut text NOT NULL DEFAULT 'genere'
    CHECK (statut IN ('genere', 'en_attente_veto', 'publie', 'rejete')),

  notified_at timestamptz,
  veto_deadline timestamptz,
  published_at timestamptz,
  commit_sha text,                     -- traçabilité future publication GitHub
  notes_revision text,

  genere_par uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Index pour la rotation de thème (theme le moins récemment utilisé)
CREATE INDEX idx_editorial_packages_theme_created
  ON public.editorial_packages (theme, created_at DESC);
CREATE INDEX idx_editorial_packages_statut
  ON public.editorial_packages (statut);

-- 3. Trigger updated_at (réutilise le helper existant du schéma)
DROP TRIGGER IF EXISTS trg_editorial_packages_updated_at ON public.editorial_packages;
CREATE TRIGGER trg_editorial_packages_updated_at
BEFORE UPDATE ON public.editorial_packages
FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- 4. RLS : accès réservé aux managers (is_manager()), toutes opérations
ALTER TABLE public.editorial_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "editorial_packages_select_manager" ON public.editorial_packages
  FOR SELECT USING (public.is_manager());

CREATE POLICY "editorial_packages_insert_manager" ON public.editorial_packages
  FOR INSERT WITH CHECK (public.is_manager());

CREATE POLICY "editorial_packages_update_manager" ON public.editorial_packages
  FOR UPDATE USING (public.is_manager())
  WITH CHECK (public.is_manager());

CREATE POLICY "editorial_packages_delete_manager" ON public.editorial_packages
  FOR DELETE USING (public.is_manager());
