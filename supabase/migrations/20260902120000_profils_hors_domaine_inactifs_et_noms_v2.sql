-- Audit du 2 septembre 2026 : trois correctifs sur les profils et un sur les
-- cibles de campagne.
--
-- 1. Un compte Google hors @entasis-conseil.fr qui se connecte obtient un
--    profil INACTIF (is_active a faux) : il ne lit rien, is_staff() exige un
--    profil actif, tant que la direction ne l active pas dans Pilotage RH.
--    La restriction de domaine versionnee en mai n avait jamais ete appliquee
--    en base : n importe quel compte Google obtenait un profil conseiller
--    actif. Un compte portail client (metadonnee portal_client) n a toujours
--    pas de profil.
-- 2. normaliser_nom_complet ne touche plus qu aux mots ecrits tout en
--    minuscules : « Paul Le Goff », « Sophie McCarthy », « Sean O'Neil » et
--    « Jean d'Ormesson » restent tels quels ; « charlotte  billard » devient
--    toujours « Charlotte Billard » ; l apostrophe est une frontiere de mot
--    (« o'brien » devient « O'Brien », « d'artagnan » devient « d'Artagnan »).
--    Meme regle que normaliserNomComplet dans src/lib/noms.js.
-- 3. Le nom de repli sans metadonnee Google lit aussi « name », puis la
--    partie locale de l email, points remplaces par des espaces.
-- 4. normaliser_nom_complet n est plus executable par anon.
-- 5. Un conseiller ne peut plus reecrire client_id, campagne_id ni
--    advisor_code de ses cibles de campagne : le role authenticated ne peut
--    modifier que statut, note, updated_at et updated_by. La RLS continue de
--    limiter chacun a ses propres cibles.
-- Appliquee en production le 2 septembre 2026.

-- Majuscule au debut du mot et apres chaque tiret ou apostrophe. Le mot recu
-- est entierement en minuscules. Le « d » apostrophe reste en minuscule sauf
-- en tete de libelle (premier).
create or replace function public.capitaliser_mot(mot text, premier boolean)
returns text
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  resultat text := '';
  c text;
  i int;
  n int := char_length(mot);
  debut boolean := true;
begin
  for i in 1..n loop
    c := substr(mot, i, 1);
    if c in ('-', '''', '’') then
      resultat := resultat || c;
      debut := true;
    elsif debut then
      if i = 1 and not premier and c = 'd' and n > 1 and substr(mot, 2, 1) in ('''', '’') then
        resultat := resultat || c;
      else
        resultat := resultat || upper(c);
      end if;
      debut := false;
    else
      resultat := resultat || c;
    end if;
  end loop;
  return resultat;
end;
$function$;

create or replace function public.normaliser_nom_complet(texte text)
returns text
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  mots text[];
  mot text;
  sortie text[] := '{}';
  particules constant text[] := array['de','du','des','le','la','les','van','von','der','den','di','da','del','della'];
  premier boolean := true;
begin
  if texte is null then return null; end if;
  mots := regexp_split_to_array(btrim(regexp_replace(texte, '\s+', ' ', 'g')), ' ');
  if array_length(mots, 1) is null then return ''; end if;
  foreach mot in array mots loop
    if mot = '' then continue; end if;
    if mot <> lower(mot) then
      -- Deja une majuscule quelque part (MOREL, McCarthy, O'Neil, Le) : un
      -- choix, pas une faute. On ne touche a rien.
      sortie := sortie || mot;
    elsif not premier and mot = any(particules) then
      -- Une particule saisie en minuscule reste en minuscule.
      sortie := sortie || mot;
    else
      sortie := sortie || public.capitaliser_mot(mot, premier);
    end if;
    premier := false;
  end loop;
  return array_to_string(sortie, ' ');
end;
$function$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_nom text;
  v_actif boolean;
begin
  if coalesce(new.raw_user_meta_data ->> 'portal_client', '') = 'true' then
    return new;
  end if;
  v_nom := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    replace(split_part(coalesce(new.email, ''), '@', 1), '.', ' ')
  );
  -- Hors domaine du cabinet : profil cree inactif. La direction l active dans
  -- Pilotage RH si la personne est bien du cabinet ; d ici la, la RLS ne lui
  -- rend rien.
  v_actif := coalesce(new.email, '') ilike '%@entasis-conseil.fr';
  insert into public.profiles (id, email, full_name, is_active)
  values (new.id, new.email, public.normaliser_nom_complet(v_nom), v_actif)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$function$;

revoke execute on function public.normaliser_nom_complet(text) from public, anon;
revoke execute on function public.capitaliser_mot(text, boolean) from public, anon;

revoke update on table public.campagne_cibles from authenticated;
grant update (statut, note, updated_at, updated_by) on table public.campagne_cibles to authenticated;

comment on function public.handle_new_user is
  'Cree le profil a la premiere connexion. Nom mis au propre. Hors @entasis-conseil.fr : profil inactif, a activer par la direction. Compte portail client : pas de profil.';
