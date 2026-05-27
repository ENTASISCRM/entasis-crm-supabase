-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION : Normalisation des advisor_code + garde-fou trigger
-- Date    : 2026-05-27
--
-- POURQUOI
-- Avant que les modales Deal/Prospect passent à un dropdown obligatoire,
-- certains deals ont été créés avec des advisor_code/co_advisor_code
-- saisis à la main (ou importés depuis une autre source). Résultat :
-- des codes "GIANNI" alors que le code officiel est "GIANNIP", des
-- codes "JEAN" alors que profiles a "JDECAMPS", etc.
--
-- Conséquence : les conseillers ne voient pas leurs parts 50% sur les
-- deals où ils sont co-conseiller (cas signalé par Gianni Pichon 27/05).
--
-- CE SCRIPT
-- 1. Fixe le deal Chevalier Diane (Jean a oublié de mettre Gianni)
-- 2. Normalise automatiquement les codes tordus via matching par
--    préfixe unique sur les profiles actifs
-- 3. Installe un trigger BEFORE INSERT/UPDATE qui REJETTE désormais
--    toute valeur advisor_code/co_advisor_code qui n'existe pas dans
--    profiles → impossible de refaire le bug même via SQL direct
--
-- Idempotent. À coller dans le Supabase SQL Editor du projet CRM
-- (tvgbblbceqvdtqnbeoik) → Run.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Chevalier Diane → ajouter Gianni en co
UPDATE public.deals
SET co_advisor_code = (
  SELECT advisor_code FROM public.profiles
  WHERE full_name ILIKE '%gianni%pichon%' LIMIT 1
)
WHERE id = 'D-1777909944200-q12qx'
  AND co_advisor_code IS NULL;

-- 2. Normalise co_advisor_code tordus (préfixe unique)
WITH bad AS (
  SELECT DISTINCT co_advisor_code AS c FROM public.deals
  WHERE co_advisor_code IS NOT NULL
    AND co_advisor_code NOT IN (SELECT advisor_code FROM public.profiles WHERE advisor_code IS NOT NULL)
),
fix AS (
  SELECT b.c AS bad, p.advisor_code AS good
  FROM bad b JOIN public.profiles p
    ON p.advisor_code ILIKE b.c || '%' AND p.is_active = true
  WHERE (SELECT COUNT(*) FROM public.profiles p2 WHERE p2.advisor_code ILIKE b.c || '%' AND p2.is_active = true) = 1
)
UPDATE public.deals d SET co_advisor_code = fix.good
FROM fix WHERE d.co_advisor_code = fix.bad;

-- 3. Normalise advisor_code principal tordus
WITH bad AS (
  SELECT DISTINCT advisor_code AS c FROM public.deals
  WHERE advisor_code IS NOT NULL
    AND advisor_code NOT IN (SELECT advisor_code FROM public.profiles WHERE advisor_code IS NOT NULL)
),
fix AS (
  SELECT b.c AS bad, p.advisor_code AS good
  FROM bad b JOIN public.profiles p
    ON p.advisor_code ILIKE b.c || '%' AND p.is_active = true
  WHERE (SELECT COUNT(*) FROM public.profiles p2 WHERE p2.advisor_code ILIKE b.c || '%' AND p2.is_active = true) = 1
)
UPDATE public.deals d SET advisor_code = fix.good
FROM fix WHERE d.advisor_code = fix.bad;

-- 4. GARDE-FOU PERMANENT : rejette tout code qui n'existe pas dans profiles
CREATE OR REPLACE FUNCTION public.deals_validate_advisor_codes()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.advisor_code IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE advisor_code = NEW.advisor_code
  ) THEN
    RAISE EXCEPTION 'advisor_code "%" invalide (n''existe pas dans profiles)', NEW.advisor_code;
  END IF;
  IF NEW.co_advisor_code IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE advisor_code = NEW.co_advisor_code
  ) THEN
    RAISE EXCEPTION 'co_advisor_code "%" invalide (n''existe pas dans profiles)', NEW.co_advisor_code;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deals_validate_codes ON public.deals;
CREATE TRIGGER trg_deals_validate_codes
BEFORE INSERT OR UPDATE OF advisor_code, co_advisor_code ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.deals_validate_advisor_codes();

COMMENT ON FUNCTION public.deals_validate_advisor_codes IS
  'Rejette tout INSERT/UPDATE deals avec un advisor_code ou co_advisor_code qui n''existe pas dans profiles.advisor_code. Garde-fou pour éviter la régression des codes tordus type "GIANNI" vs "GIANNIP" (cf bug 27/05/2026).';
