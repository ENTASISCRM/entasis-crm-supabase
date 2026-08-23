-- ═══════════════════════════════════════════════════════════════════════════
-- PROCHAINE ACTION PAR DOSSIER (Série D / D3)
--
-- La discipline commerciale des CRM de vente (Pipedrive, Close) : aucun
-- dossier vivant sans prochaine étape datée. Deux colonnes seulement sur
-- `deals`, volontairement libres (pas d'enum) pour ne pas contraindre le
-- vocabulaire des conseillers :
--   next_action       texte court   « Relancer après relevé », « Envoyer devis »
--   next_action_date  date          échéance de cette étape
--
-- L'écran d'accueil liste « Mes actions du jour » = actions échues ou du jour
-- sur les dossiers en cours, triées par date.
--
-- Aucune RLS supplémentaire : ces colonnes vivent dans `deals`, déjà protégée
-- par la policy de scope conseiller/manager existante.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.deals
  add column if not exists next_action text,
  add column if not exists next_action_date date;

comment on column public.deals.next_action is
  'Prochaine étape commerciale à mener sur ce dossier (texte libre, court).';
comment on column public.deals.next_action_date is
  'Échéance de la prochaine étape. Alimente « Mes actions du jour » sur l''accueil.';

-- Index partiel : la liste des actions ne balaie que les dossiers qui en ont
-- une, sur un pipeline vivant (les dossiers signés ou annulés n'en portent pas).
create index if not exists deals_next_action_date_idx
  on public.deals (next_action_date)
  where next_action_date is not null;
