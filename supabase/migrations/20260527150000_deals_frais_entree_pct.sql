-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION : Ajoute deals.frais_entree_pct (taux de frais d'entrée saisi
--             par le conseiller, entre 1 % et 4 %)
-- Date    : 2026-05-27
--
-- POURQUOI
-- Le moteur de calcul commission (calcul-commission.js) lit déjà ce champ
-- pour appliquer les formules type `frais/2 + 1` ou `frais + 10`, mais
-- avec un fallback systématique à 1 % par défaut (FRAIS_ENTREE_DEFAUT_PCT)
-- faute de colonne BDD.
--
-- Louis 27/05 : les conseillers veulent pouvoir saisir leur taux de frais
-- réel (souvent entre 1 % et 4 %) sur chaque deal, pour que la commission
-- reflète la réalité du contrat client. Une molette dans la modale deal
-- permet de l'ajuster par pas de 0,25 %.
--
-- Contraintes : valeur ≥ 0, ≤ 10 (marge pour cas extrêmes). Valeur par
-- défaut 1 % pour préserver le comportement actuel des deals existants.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS frais_entree_pct numeric NOT NULL DEFAULT 1.0
    CHECK (frais_entree_pct >= 0 AND frais_entree_pct <= 10);

COMMENT ON COLUMN public.deals.frais_entree_pct IS
  'Pourcentage de frais d''entrée saisi par le conseiller (typiquement 1-4 %). Utilisé par le moteur de commission pour appliquer les formules du barème (frais/2 + 1 pour PER, frais/2 pour PU, etc.). Default 1 % = comportement legacy.';
