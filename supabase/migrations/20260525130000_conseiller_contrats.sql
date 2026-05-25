-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION : Module Rémunération — table conseiller_contrats
-- Date    : 2026-05-25
-- Auteur  : Louis Hatton (via assistant)
--
-- Source : barème BAREME-CDI-2026 + fiches de paie avril 2026
-- Doc canonique : src/lib/bareme-entasis.js
--
-- CONFIDENTIALITÉ STRICTE (consigne Louis) :
--   • Les salaires et conditions de rémunération NE DOIVENT JAMAIS être
--     visibles par un conseiller autre que celui concerné.
--   • Seul le rôle 'manager' a accès à l'ensemble de la table.
--   • Les conseillers (rôle 'advisor') voient UNIQUEMENT leur propre ligne.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.conseiller_contrats (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id            UUID         REFERENCES public.profiles(id) ON DELETE SET NULL,
  matricule             TEXT,                                    -- matricule paie (00002, 00006, …)
  full_name             TEXT         NOT NULL,
  type_contrat          TEXT         NOT NULL
    CHECK (type_contrat IN ('CDI', 'CDD', 'ALTERNANT', 'STAGIAIRE', 'MANDATAIRE', 'GERANT')),
  salaire_brut_mensuel  NUMERIC(10,2) NOT NULL DEFAULT 0,        -- 0 pour mandataire/gérant
  palier_pp_mensuel     NUMERIC(10,2) NOT NULL DEFAULT 0,        -- en € de PP annualisée
  palier_pu_mensuel     NUMERIC(12,2) NOT NULL DEFAULT 0,        -- en € de PU
  date_debut            DATE         NOT NULL,
  date_fin              DATE,                                    -- NULL = en cours
  actif                 BOOLEAN      NOT NULL DEFAULT true,
  notes                 TEXT,                                    -- commentaires libres manager
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conseiller_contrats_profile     ON public.conseiller_contrats(profile_id);
CREATE INDEX IF NOT EXISTS idx_conseiller_contrats_actif       ON public.conseiller_contrats(actif);
CREATE INDEX IF NOT EXISTS idx_conseiller_contrats_type        ON public.conseiller_contrats(type_contrat);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_conseiller_contrats_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_conseiller_contrats_updated ON public.conseiller_contrats;
CREATE TRIGGER trg_conseiller_contrats_updated
  BEFORE UPDATE ON public.conseiller_contrats
  FOR EACH ROW EXECUTE FUNCTION public.set_conseiller_contrats_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- RLS : confidentialité stricte
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.conseiller_contrats ENABLE ROW LEVEL SECURITY;

-- Manager : accès total (lecture + écriture)
DROP POLICY IF EXISTS "manager_full_access" ON public.conseiller_contrats;
CREATE POLICY "manager_full_access"
  ON public.conseiller_contrats
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'manager'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'manager'
    )
  );

-- Conseiller : lecture UNIQUEMENT de sa propre ligne. Aucune écriture possible.
DROP POLICY IF EXISTS "advisor_own_row_select" ON public.conseiller_contrats;
CREATE POLICY "advisor_own_row_select"
  ON public.conseiller_contrats
  FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- Seed initial — conseillers connus au 2026-05-25
-- Source : barème BAREME-CDI-2026 + fiches de paie avril 2026
-- Les profile_id sont laissés NULL ici, à raccorder via l'UI Pilotage RH
-- après que les profils Supabase auth correspondants seront créés.
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO public.conseiller_contrats
  (matricule, full_name, type_contrat, salaire_brut_mensuel, palier_pp_mensuel, palier_pu_mensuel, date_debut, date_fin, actif)
VALUES
  -- Alternants (fiches paie avril 2026 confirmées)
  ('00002', 'Nans MARRO-DUZAT',  'ALTERNANT',   1162.07, 12000,  0,      '2024-09-16', NULL,         true),
  ('00006', 'Dany DUBOIS',       'ALTERNANT',   1422.00, 15000,  0,      '2025-09-08', NULL,         true),
  ('00007', 'Gianni PICHON',     'ALTERNANT',   1019.19, 11000,  0,      '2025-09-01', NULL,         true),
  ('00008', 'Alexis MINH',       'ALTERNANT',   1112.07, 12000,  0,      '2025-09-01', NULL,         true),
  -- CDD
  (NULL,    'Quentin BAUQUET',   'CDD',         1009.64, 10000,  10000,  '2026-05-04', '2026-06-24', true),
  -- Stagiaires
  (NULL,    'Paulin',            'STAGIAIRE',   0,       10000,  0,      '2026-05-04', NULL,         true),
  (NULL,    'Arthur',            'STAGIAIRE',   0,       10000,  0,      '2026-05-26', NULL,         true),
  (NULL,    'Victor OSCHENSEI',  'STAGIAIRE',   660,     10000,  0,      '2026-03-16', NULL,         true),
  -- Mandataires (pas de palier, commission dès le 1er €)
  (NULL,    'Clément MESSAGER',  'MANDATAIRE',  0,       0,      0,      '2026-01-01', NULL,         true),
  (NULL,    'Thomas POPEA',      'MANDATAIRE',  0,       0,      0,      '2026-01-01', NULL,         true),
  -- Gérant
  (NULL,    'Louis HATTON',      'GERANT',      0,       0,      0,      '2023-01-01', NULL,         true)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE  public.conseiller_contrats IS 'Contrats des conseillers Entasis (CDI/CDD/Alternant/Stagiaire/Mandataire/Gérant). RLS stricte : manager voit tout, conseillers voient leur ligne uniquement. Doc : src/lib/bareme-entasis.js.';
COMMENT ON COLUMN public.conseiller_contrats.salaire_brut_mensuel IS '€ brut/mois. 0 pour mandataire/gérant. Sert de référence au calcul du seuil de rentabilité.';
COMMENT ON COLUMN public.conseiller_contrats.palier_pp_mensuel    IS '€ de PP annualisée à atteindre dans le mois pour débloquer le variable PP. 0 = pas de palier (mandataire).';
COMMENT ON COLUMN public.conseiller_contrats.palier_pu_mensuel    IS '€ de PU à atteindre dans le mois pour débloquer le variable PU. 0 = pas de palier PU.';
