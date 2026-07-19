-- ═══════════════════════════════════════════════════════════════════════════
-- VERROU FICHE COMPLETE A LA SIGNATURE (demande Louis : « oblige les a bien
-- remplir les fiches a chaque fois »)
--
-- La validation cote navigateur (modale de dossier) etait contournable par les
-- chemins secondaires (multi produits, completion de brouillon, appel API). On
-- pose donc la regle DANS LA BASE : un dossier ne peut pas DEVENIR « Signé »
-- si la fiche du client rattache est incomplete. Le trigger liste precisement
-- les champs manquants dans le message d erreur (remonte tel quel a l ecran).
--
-- Ne se declenche qu au MOMENT de la signature (insertion en Signé ou
-- transition depuis un autre statut). L edition d un dossier deja signe
-- (historique d avant la regle) n est jamais bloquee.
-- Applique sur PROD et DEV le 22/07/2026.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.exiger_fiche_complete_a_la_signature()
returns trigger
language plpgsql
as $$
declare
  c public.clients%rowtype;
  manque text[] := array[]::text[];
begin
  if new.status is distinct from 'Signé' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'Signé' then
    return new;
  end if;

  if new.client_id is null then
    raise exception 'Rattachez un client a ce dossier avant de le signer (pour tracer et recroiser la signature).'
      using errcode = 'check_violation';
  end if;

  select * into c from public.clients where id = new.client_id;
  if not found then
    raise exception 'Client introuvable, impossible de signer.' using errcode = 'check_violation';
  end if;

  if coalesce(trim(c.email), '') = '' then manque := array_append(manque, 'email'); end if;
  if coalesce(trim(c.telephone), '') = '' then manque := array_append(manque, 'téléphone'); end if;
  if coalesce(trim(c.statut_pro), '') = '' then manque := array_append(manque, 'statut'); end if;
  if coalesce(trim(c.profession), '') = '' then manque := array_append(manque, 'profession'); end if;
  if c.revenus_annuels is null then manque := array_append(manque, 'revenus annuels'); end if;
  if c.patrimoine_estime is null then manque := array_append(manque, 'patrimoine estimé'); end if;

  if array_length(manque, 1) is not null then
    raise exception 'Fiche client incomplete : renseigne d abord % avant de signer.', array_to_string(manque, ', ')
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_exiger_fiche_complete on public.deals;
create trigger trg_exiger_fiche_complete
  before insert or update on public.deals
  for each row execute function public.exiger_fiche_complete_a_la_signature();
