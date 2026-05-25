-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION : Ajout type_contrat sur invitations
-- Date    : 2026-05-25
--
-- Permet de définir le type de contrat (CDI/CDD/Alternant/Stagiaire/
-- Mandataire) directement depuis le panel des invitations, et d'avoir
-- la donnée dispo dès l'onboarding pour pré-remplir le contrat dans
-- conseiller_contrats.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS type_contrat TEXT
  CHECK (type_contrat IN ('CDI', 'CDD', 'ALTERNANT', 'STAGIAIRE', 'MANDATAIRE', 'GERANT'));

COMMENT ON COLUMN public.invitations.type_contrat IS 'Type de contrat prévu pour le nouvel arrivant (informatif, pré-remplit conseiller_contrats à la signature).';
