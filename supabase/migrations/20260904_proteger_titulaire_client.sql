-- Le titulaire d une fiche client ne se change pas par la bande.
--
-- Pourquoi : la politique clients_update_scope autorise l ecriture au porteur
-- de advisor_code, a celui de co_advisor_code et a la direction. Son WITH
-- CHECK ne juge que la ligne NEW : un co conseiller pouvait donc se mettre
-- lui meme en advisor_code et devenir titulaire de la fiche, la politique
-- validant la ligne d arrivee. C est exactement le trou ferme cote deals par
-- trg_proteger_titulaire_deal apres l incident de vol de dossier, reste
-- ouvert cote clients, et le rattrapage du 04/09/2026 a porte le nombre de
-- fiches partagees de 16 a 66.
--
-- La regle est celle des dossiers, au mot pres : la direction change ce
-- qu elle veut, le titulaire actuel peut transmettre sa fiche, personne
-- d autre ne touche a advisor_code. La cle de service (crons, pont Lead Room,
-- migrations) n a pas d auth.uid() et passe, sinon on casserait le pont.
--
-- Impact verifie avant application : la section Attribution de la fiche
-- client est deja reservee au role manager cote ecran, et aucun autre chemin
-- d ecriture du CRM ne touche a clients.advisor_code. Une ecriture qui ne
-- change pas ce champ sort du trigger a la premiere ligne.
create or replace function public.proteger_titulaire_client()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  mon_code text;
  suis_manager boolean;
  trouve boolean;
begin
  if new.advisor_code is not distinct from old.advisor_code then
    return new;
  end if;

  -- Hors session utilisateur (service_role, cron, migration) : on laisse faire.
  if auth.uid() is null then
    return new;
  end if;

  select p.advisor_code, p.role = 'manager', true
    into mon_code, suis_manager, trouve
  from profiles p where p.id = auth.uid();

  -- Profil introuvable : on ne bloque pas une mecanique interne sur une
  -- absence de fiche, la RLS a deja filtre l acces a la ligne.
  if not coalesce(trouve, false) then
    return new;
  end if;

  if coalesce(suis_manager, false) or old.advisor_code is not distinct from mon_code then
    return new;
  end if;

  raise exception
    'Seul le conseiller titulaire (%) ou la direction peut changer l attribution de cette fiche client.',
    coalesce(old.advisor_code, 'non renseigne')
    using errcode = 'check_violation';
end;
$function$;

drop trigger if exists trg_proteger_titulaire_client on public.clients;
create trigger trg_proteger_titulaire_client
  before update on public.clients
  for each row
  execute function public.proteger_titulaire_client();
