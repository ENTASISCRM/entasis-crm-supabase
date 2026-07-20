-- ============================================================================
-- MIGRATION : Agent éditorial — table veille_notes (note de veille hebdo)
-- Exécution MANUELLE dans le SQL Editor Supabase (PROD) après revue.
-- Entièrement ADDITIVE : aucune donnée existante n'est modifiée.
-- Pré-requis : la fonction public.is_manager() existe déjà (utilisée par
-- editorial_packages / editorial_newsletters — même modèle RLS).
-- ============================================================================

-- Historique des notes de veille réglementaire envoyées par email (une ligne
-- par note, i.e. par semaine). Sert aussi de garde-fou anti-doublon : une note
-- dont sent_at est renseigné pour une période donnée ne sera pas régénérée.
CREATE TABLE public.veille_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start timestamptz NOT NULL,   -- début de la semaine couverte (00:00 UTC)
  period_end timestamptz NOT NULL,     -- fin de la semaine couverte (jour d'envoi)
  items jsonb NOT NULL DEFAULT '[]',   -- items de la note [{titre, source_url, date, resume, impact_cabinet, niveau}]
  synthese text,                       -- synthèse d'ouverture (3-4 phrases)
  sent_at timestamptz,                 -- horodatage d'envoi de l'email (NULL tant que non envoyé)
  created_at timestamptz DEFAULT now()
);

-- Recherche par période (anti-doublon et consultation de l'historique).
CREATE INDEX veille_notes_period_start_idx
  ON public.veille_notes (period_start DESC);

-- RLS : accès réservé aux managers, comme editorial_packages / _newsletters.
ALTER TABLE public.veille_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "veille_notes_select_manager" ON public.veille_notes
  FOR SELECT USING (public.is_manager());
CREATE POLICY "veille_notes_insert_manager" ON public.veille_notes
  FOR INSERT WITH CHECK (public.is_manager());
CREATE POLICY "veille_notes_update_manager" ON public.veille_notes
  FOR UPDATE USING (public.is_manager()) WITH CHECK (public.is_manager());
CREATE POLICY "veille_notes_delete_manager" ON public.veille_notes
  FOR DELETE USING (public.is_manager());

-- ============================================================================
-- RÉVERSIBILITÉ :
--   DROP TABLE public.veille_notes;
-- ============================================================================

-- Contrôles post-migration (lecture seule) :
--   SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'veille_notes'
--   ORDER BY ordinal_position;
--
--   SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname = 'veille_notes';
