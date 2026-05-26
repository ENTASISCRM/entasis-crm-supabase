-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION : Réaligne deals.month sur date_signed pour les deals signés
-- Date    : 2026-05-26
--
-- POURQUOI
-- Pour les deals signés, la colonne `month` doit refléter le mois de
-- signature (date_signed) — c'est ce que filtre advisorMetrics() pour
-- afficher les PP/PU dans le Dashboard du conseiller.
--
-- Pour les nouveaux deals, l'alignement se fait au save (cf
-- alignedMonthForDeal dans src/lib/metrics.js). Mais pour les anciens
-- deals signés AVANT cette logique, le month est resté sur le mois de
-- création → ces deals n'apparaissent pas dans le Dashboard du mois de
-- signature → Gianni ne voit pas sa part 50% sur les deals signés où
-- il est co-conseiller.
--
-- Ce script réaligne tous les deals signés en une passe. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE public.deals
SET month = CASE EXTRACT(MONTH FROM date_signed)::INT
  WHEN  1 THEN 'JANVIER'
  WHEN  2 THEN 'FÉVRIER'
  WHEN  3 THEN 'MARS'
  WHEN  4 THEN 'AVRIL'
  WHEN  5 THEN 'MAI'
  WHEN  6 THEN 'JUIN'
  WHEN  7 THEN 'JUILLET'
  WHEN  8 THEN 'AOÛT'
  WHEN  9 THEN 'SEPTEMBRE'
  WHEN 10 THEN 'OCTOBRE'
  WHEN 11 THEN 'NOVEMBRE'
  WHEN 12 THEN 'DÉCEMBRE'
END
WHERE status = 'Signé'
  AND date_signed IS NOT NULL
  AND month <> CASE EXTRACT(MONTH FROM date_signed)::INT
    WHEN  1 THEN 'JANVIER'
    WHEN  2 THEN 'FÉVRIER'
    WHEN  3 THEN 'MARS'
    WHEN  4 THEN 'AVRIL'
    WHEN  5 THEN 'MAI'
    WHEN  6 THEN 'JUIN'
    WHEN  7 THEN 'JUILLET'
    WHEN  8 THEN 'AOÛT'
    WHEN  9 THEN 'SEPTEMBRE'
    WHEN 10 THEN 'OCTOBRE'
    WHEN 11 THEN 'NOVEMBRE'
    WHEN 12 THEN 'DÉCEMBRE'
  END;

-- Retourne le nombre de lignes mises à jour pour validation
SELECT
  COUNT(*) AS total_signed,
  COUNT(*) FILTER (WHERE date_signed IS NULL) AS without_date_signed,
  COUNT(DISTINCT month) AS distinct_months
FROM public.deals
WHERE status = 'Signé';
