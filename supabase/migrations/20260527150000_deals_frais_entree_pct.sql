-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION : Frais d'entrée saisis par le conseiller (PP + PU séparés)
-- Date    : 2026-05-27
--
-- POURQUOI
-- Le moteur de calcul commission lit déjà les frais d'entrée pour appliquer
-- les formules du barème (PER mandataire = frais + 10, PU = frais/2, etc.),
-- mais avec un fallback systématique à 1 % par défaut faute de colonne BDD.
--
-- Louis 27/05 : les conseillers veulent saisir leur taux de frais réel sur
-- chaque deal, et différencier la PP (versement mensuel) de la PU (versement
-- unique) parce qu'un même contrat peut avoir 3 % de frais sur la PP et
-- 1 % sur la PU (par exemple). Donc 2 colonnes distinctes.
--
-- Valeur par défaut 1 % pour préserver le comportement des deals existants.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS frais_entree_pp_pct numeric NOT NULL DEFAULT 1.0
    CHECK (frais_entree_pp_pct >= 0 AND frais_entree_pp_pct <= 10);

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS frais_entree_pu_pct numeric NOT NULL DEFAULT 1.0
    CHECK (frais_entree_pu_pct >= 0 AND frais_entree_pu_pct <= 10);

COMMENT ON COLUMN public.deals.frais_entree_pp_pct IS
  'Pourcentage de frais d''entrée saisi par le conseiller pour la PP (versement mensuel). Typique 1-4 %. Utilisé par le moteur commission (formules PER mandataire = frais + 10, AV = frais + 2, etc.).';

COMMENT ON COLUMN public.deals.frais_entree_pu_pct IS
  'Pourcentage de frais d''entrée saisi par le conseiller pour la PU (versement unique). Typique 1-4 %. Utilisé pour le calcul commission PU = frais/2.';

-- Note : l'ancienne colonne frais_entree_pct (du commit précédent) reste
-- en BDD comme fallback. Le code la lit via le helper fraisPourProduit()
-- si frais_entree_pp_pct / frais_entree_pu_pct ne sont pas renseignées.
