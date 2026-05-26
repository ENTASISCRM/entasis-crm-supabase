-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION : Ajout colonne kid_url à ucs_structures
-- Date    : 2026-05-26
--
-- Permet de lier chaque UCS à son KID (Key Information Document)
-- pour que les conseillers accèdent directement au détail produit.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.ucs_structures
  ADD COLUMN IF NOT EXISTS kid_url TEXT;

COMMENT ON COLUMN public.ucs_structures.kid_url IS 'URL du KID (Key Information Document) du produit. Ouvert dans un nouvel onglet via un bouton dans le catalogue.';
