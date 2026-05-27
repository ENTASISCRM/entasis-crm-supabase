-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION : Ajoute deals.is_ordre_placement (transfert/replacement)
-- Date    : 2026-05-27
--
-- POURQUOI
-- Louis 27/05 : "sur les ordres de placement on est pas payé. Par exemple
-- Clément a mis pour Chloé Boban donc pas de com sur l'assurance vie en
-- ordre de placement (PU ramenée chez nous en gestion)".
--
-- Un ordre de placement = le client transfère un contrat existant chez
-- nous pour gestion, mais sans nouveaux frais d'entrée payés à Entasis.
-- Donc :
--   • Pas de commission versée
--   • Ne compte pas dans la valeur cabinet (ne sert pas au seuil)
--   • Le deal reste enregistré (pour suivi des encours) mais avec une
--     case à cocher visible dans la modale + badge "Ordre de placement"
--     dans le détail Rémunération.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS is_ordre_placement boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.deals.is_ordre_placement IS
  'true si le deal est un ordre de placement / replacement (client transfère son contrat existant en gestion chez nous). Pas de commission, ne compte pas dans le seuil de rentabilité.';
