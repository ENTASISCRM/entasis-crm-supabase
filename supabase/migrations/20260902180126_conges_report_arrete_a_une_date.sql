-- Le solde de conges se cale sur un bulletin de salaire, qui est arrete a une
-- date precise (le 31 aout pour le bulletin d aout), pas au 1er juin.
--
-- Jusqu ici conges_report etait suppose etre le solde au 31 mai, et le CRM
-- redecomptait ensuite tous les conges pris depuis le 1er juin. Or la paie a
-- deja impute les conges d ete dans le solde du bulletin. Pour que le total
-- tombe juste, il fallait gonfler le report d une valeur qui ne correspondait
-- plus a rien : l ecran affichait « report 31 j » quand le bulletin disait 16.
--
-- Avec cette colonne, on saisit le solde du bulletin ET sa date. Le CRM part
-- de ce point et ne decompte que les conges POSTERIEURS, en ajoutant
-- l acquisition depuis cette date. Le chiffre saisi est alors exactement
-- celui du bulletin, verifiable d un coup d oeil.
--
-- Elle sert aussi a l enchainement de contrats : le contrat qui prend le
-- relais reprend le solde arrete a la veille de sa prise d effet, au lieu de
-- repartir de zero et de faire reculer le solde du salarie.
--
-- Colonne facultative : sans elle, le comportement d avant ne change pas.
-- Appliquee en production le 2 septembre 2026.

alter table public.conseiller_contrats
  add column if not exists conges_report_au date;

comment on column public.conseiller_contrats.conges_report_au is
  'Date a laquelle conges_report a ete arrete (date du bulletin de salaire). '
  'Quand elle est posee, le solde part de ce point : seuls les conges pris '
  'apres cette date sont decomptes. Vide : conges_report vaut pour le 31 mai.';
