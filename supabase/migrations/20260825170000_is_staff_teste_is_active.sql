-- is_staff() se resumait a « existe-t-il une fiche profiles pour cet
-- utilisateur », sans tester is_active, alors que sa voisine is_manager()
-- teste le role ET is_active. Quatre profils desactives gardaient donc l acces
-- complet aux 23 tables gardees par is_staff, dont les 523 fiches leads avec
-- nom, telephone et donnees patrimoniales partielles.
--
-- Cela ne ferme PAS le compte d authentification lui meme (mot de passe
-- toujours valide) : bannir les comptes reste une decision de la direction, a
-- inscrire dans la procedure de sortie.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and is_active = true
  )
$function$;
