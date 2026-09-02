-- Les profils naissent a la premiere connexion Google avec le nom tel que
-- Google le renvoie : « charlotte Billard », « eliottt bec ». Ce nom est
-- ensuite affiche partout (equipe, dossiers, remuneration). On le met au
-- propre a la creation : espaces multiples reduits, premiere lettre de chaque
-- mot en majuscule, particules en minuscule, un mot deja tout en majuscules
-- (au moins deux lettres) conserve tel quel, accents intacts.
-- Appliquee en production le 2 septembre 2026 (04h42 UTC). Le nom du fichier
-- porte la version enregistree dans supabase_migrations.schema_migrations.

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
  particules constant text[] := array['de','du','des','le','la','les','van','von','der','den','di','da','del','della','d'''];
  i int;
  fragment text;
  frags text[];
begin
  if texte is null then return null; end if;
  mots := regexp_split_to_array(btrim(regexp_replace(texte, '\s+', ' ', 'g')), ' ');
  if array_length(mots, 1) is null then return ''; end if;
  foreach mot in array mots loop
    if mot = '' then continue; end if;
    if lower(mot) = any(particules) and array_length(sortie, 1) is not null then
      sortie := sortie || lower(mot);
    elsif mot = upper(mot) and char_length(mot) >= 2 and mot ~ '[[:alpha:]]' then
      sortie := sortie || mot;
    else
      -- Un prenom compose garde son trait d union et une majuscule apres.
      frags := string_to_array(mot, '-');
      for i in 1..array_length(frags, 1) loop
        fragment := frags[i];
        if fragment <> '' then
          frags[i] := upper(left(fragment, 1)) || lower(substr(fragment, 2));
        end if;
      end loop;
      sortie := sortie || array_to_string(frags, '-');
    end if;
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
begin
  if coalesce(new.raw_user_meta_data ->> 'portal_client', '') = 'true' then
    return new;
  end if;
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    public.normaliser_nom_complet(
      coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
    )
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$function$;
