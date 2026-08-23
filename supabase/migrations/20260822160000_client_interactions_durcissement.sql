-- ═══════════════════════════════════════════════════════════════════════════
-- DURCISSEMENT DU JOURNAL D'ÉCHANGES (corrections de revue, Série D)
--
-- 1) Le rattachement d'un échange ne doit jamais changer après coup : sinon un
--    échange pourrait être déplacé vers la fiche d'un client hors périmètre
--    (l'UPDATE ne re-testait pas le périmètre du NOUVEAU client_id).
-- 2) L'auteur est dénormalisé en code conseiller : la RLS de `profiles`
--    interdit à un conseiller de lire le profil d'un collègue, donc la
--    jointure auteur revenait vide sur les échanges des autres.
-- Appliqué sur la base le 22/08/2026.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.client_interactions
  add column if not exists created_by_code text;

comment on column public.client_interactions.created_by_code is
  'Code conseiller de l''auteur, dénormalisé : profiles n''est pas lisible par les pairs (RLS).';

create or replace function public.client_interactions_garde()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    -- Rattachement et auteur figés : on ne corrige que le contenu.
    if new.client_id is distinct from old.client_id then
      raise exception 'Le client d''un échange ne peut pas être modifié. Supprimez l''échange et recréez-le sur la bonne fiche.'
        using errcode = 'check_violation';
    end if;
    new.created_by := old.created_by;
    new.created_by_code := old.created_by_code;
    return new;
  end if;

  -- INSERT : on grave le code conseiller de l'auteur.
  if new.created_by_code is null then
    select advisor_code into new.created_by_code
    from public.profiles where id = auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_client_interactions_garde on public.client_interactions;
create trigger trg_client_interactions_garde
  before insert or update on public.client_interactions
  for each row execute function public.client_interactions_garde();
