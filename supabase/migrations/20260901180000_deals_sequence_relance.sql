-- Sequences de relance (plan B2) : un gabarit pose une chaine d etapes
-- datees sur le dossier. Les deux colonnes portent le gabarit en cours et
-- le numero de l etape ; next_action et next_action_date, deja presents,
-- portent l etape courante. Colonnes nullables, aucune valeur existante
-- modifiee, aucun changement de RLS (les policies update de deals
-- couvrent deja ces colonnes).
-- Appliquee en production le 1er septembre 2026.
alter table public.deals
  add column if not exists sequence_key text,
  add column if not exists sequence_etape integer;

comment on column public.deals.sequence_key is 'Cle du gabarit de sequence de relance en cours (src/config/sequencesRelance.js), null sinon';
comment on column public.deals.sequence_etape is 'Numero de l etape en cours dans la sequence (1 = premiere), null sinon';
