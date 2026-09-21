-- Entasis Academy, migration 3 : le catalogue seme.
--
-- Douze modules (trois microlecons, un cas pratique, dix questions corrigees
-- chacun) et trois parcours qui les reutilisent sans les dupliquer. Genere
-- par scripts/academy/generer-seed.mjs depuis scripts/academy/catalogue/*.json :
-- ne pas editer ce fichier a la main, regenerer.
--
-- Contenu redige par des redacteurs puis verifie a la source officielle
-- (impots.gouv.fr, service-public.fr, legifrance, AMF, ameli...), les
-- procedures internes remplacees par « [a completer par le cabinet] », les cas
-- fictifs etiquetes. Tout est seme en BROUILLON : la publication est un geste
-- de l administrateur qui enregistre le nom du relecteur.
--
-- Idempotent : un module dont le slug existe est ignore (where not exists),
-- jamais mis a jour ; un parcours existant garde ses modules. Relancer ne
-- duplique rien et n ecrase aucune edition de l administrateur.
--
-- NON APPLIQUEE EN PRODUCTION. Appliquee sur entasis-crm-DEV
-- (leuqchrianpasianwmjg) le 21 septembre 2026.

-- ── Parcours ──
do $seed_parcours$
declare v_p uuid;
begin
  if exists (select 1 from public.academy_parcours where slug = $academy_seed$integration-30-jours$academy_seed$) then return; end if;
  insert into public.academy_parcours (slug, titre, description, ordre) values ($academy_seed$integration-30-jours$academy_seed$, $academy_seed$Intégration, 30 jours$academy_seed$, $academy_seed$Les premiers pas au cabinet : la méthode, le CRM, la découverte, la qualité du dossier et le rendez-vous.$academy_seed$, 1) returning id into v_p;
  insert into public.academy_parcours_modules (parcours_id, module_id, ordre, obligatoire, delai_jours)
  select v_p, id, 1, true, 7 from public.academy_modules where slug = $academy_seed$methode-entasis$academy_seed$
  on conflict (parcours_id, module_id) do nothing;
  insert into public.academy_parcours_modules (parcours_id, module_id, ordre, obligatoire, delai_jours)
  select v_p, id, 2, true, 7 from public.academy_modules where slug = $academy_seed$maitriser-le-crm$academy_seed$
  on conflict (parcours_id, module_id) do nothing;
  insert into public.academy_parcours_modules (parcours_id, module_id, ordre, obligatoire, delai_jours)
  select v_p, id, 3, true, 14 from public.academy_modules where slug = $academy_seed$reussir-la-decouverte$academy_seed$
  on conflict (parcours_id, module_id) do nothing;
  insert into public.academy_parcours_modules (parcours_id, module_id, ordre, obligatoire, delai_jours)
  select v_p, id, 4, true, 21 from public.academy_modules where slug = $academy_seed$qualite-du-dossier$academy_seed$
  on conflict (parcours_id, module_id) do nothing;
  insert into public.academy_parcours_modules (parcours_id, module_id, ordre, obligatoire, delai_jours)
  select v_p, id, 5, true, 30 from public.academy_modules where slug = $academy_seed$conduire-un-rendez-vous$academy_seed$
  on conflict (parcours_id, module_id) do nothing;
end
$seed_parcours$;
do $seed_parcours$
declare v_p uuid;
begin
  if exists (select 1 from public.academy_parcours where slug = $academy_seed$fondamentaux-du-conseiller$academy_seed$) then return; end if;
  insert into public.academy_parcours (slug, titre, description, ordre) values ($academy_seed$fondamentaux-du-conseiller$academy_seed$, $academy_seed$Fondamentaux du conseiller$academy_seed$, $academy_seed$Les six métiers du cabinet, un module chacun : retraite, assurance vie, allocation, immobilier, fiscalité, protection sociale.$academy_seed$, 2) returning id into v_p;
  insert into public.academy_parcours_modules (parcours_id, module_id, ordre, obligatoire, delai_jours)
  select v_p, id, 1, true, null from public.academy_modules where slug = $academy_seed$per-et-retraite$academy_seed$
  on conflict (parcours_id, module_id) do nothing;
  insert into public.academy_parcours_modules (parcours_id, module_id, ordre, obligatoire, delai_jours)
  select v_p, id, 2, true, null from public.academy_modules where slug = $academy_seed$assurance-vie$academy_seed$
  on conflict (parcours_id, module_id) do nothing;
  insert into public.academy_parcours_modules (parcours_id, module_id, ordre, obligatoire, delai_jours)
  select v_p, id, 3, true, null from public.academy_modules where slug = $academy_seed$allocation-et-risques$academy_seed$
  on conflict (parcours_id, module_id) do nothing;
  insert into public.academy_parcours_modules (parcours_id, module_id, ordre, obligatoire, delai_jours)
  select v_p, id, 4, true, null from public.academy_modules where slug = $academy_seed$scpi-et-immobilier$academy_seed$
  on conflict (parcours_id, module_id) do nothing;
  insert into public.academy_parcours_modules (parcours_id, module_id, ordre, obligatoire, delai_jours)
  select v_p, id, 5, true, null from public.academy_modules where slug = $academy_seed$fiscalite-raisonner$academy_seed$
  on conflict (parcours_id, module_id) do nothing;
  insert into public.academy_parcours_modules (parcours_id, module_id, ordre, obligatoire, delai_jours)
  select v_p, id, 6, true, null from public.academy_modules where slug = $academy_seed$protection-sociale-dirigeant$academy_seed$
  on conflict (parcours_id, module_id) do nothing;
end
$seed_parcours$;
do $seed_parcours$
declare v_p uuid;
begin
  if exists (select 1 from public.academy_parcours where slug = $academy_seed$perfectionnement$academy_seed$) then return; end if;
  insert into public.academy_parcours (slug, titre, description, ordre) values ($academy_seed$perfectionnement$academy_seed$, $academy_seed$Perfectionnement$academy_seed$, $academy_seed$Approche globale et conduite du rendez-vous, pour les conseillers qui ont validé les fondamentaux.$academy_seed$, 3) returning id into v_p;
  insert into public.academy_parcours_modules (parcours_id, module_id, ordre, obligatoire, delai_jours)
  select v_p, id, 1, true, null from public.academy_modules where slug = $academy_seed$transmission-approche-globale$academy_seed$
  on conflict (parcours_id, module_id) do nothing;
  insert into public.academy_parcours_modules (parcours_id, module_id, ordre, obligatoire, delai_jours)
  select v_p, id, 2, true, null from public.academy_modules where slug = $academy_seed$conduire-un-rendez-vous$academy_seed$
  on conflict (parcours_id, module_id) do nothing;
end
$seed_parcours$;
