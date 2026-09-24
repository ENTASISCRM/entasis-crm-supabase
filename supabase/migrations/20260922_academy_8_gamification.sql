-- Entasis Academy, migration 8 : gamification et schemas (socle).
--
-- Demande de Louis du 22 septembre 2026 apres sa premiere session : « je
-- n ai pas eu de points ni d XP, gamifie tout ca ». Conception :
-- docs/superpowers/specs/2026-09-22-academy-gamification-design.md.
--
-- Principe : le serveur decide de tout ce qui se compte (XP par reponse,
-- combo, niveau, succes, defis du jour, classement anonyme) ; le client ne
-- fait qu animer ce qu on lui rend. sum(academy_entrainements.xp) reste la
-- seule source de l XP total : les bonus de fin de session et les defis
-- credites entrent dans l XP de la session qui les gagne.
--
-- Trois fichiers pour une seule migration logique, chacun assez court pour
-- l outil MCP : 8 (colonnes, tables des succes et des defis, catalogue seme,
-- niveau, defis du jour, attribution des succes, classement anonyme), puis
-- 8b (remplacement des fonctions de session et de lecture) et 8c
-- (administration des schemas, pilotage, fiche, droits d execution). Dans
-- cet ordre.
--
-- Appliquee sur entasis-crm-DEV (leuqchrianpasianwmjg) le 22 septembre 2026,
-- nom academy_8_gamification dans schema_migrations ; la version est notee
-- dans scripts/academy/tests-sql/LISEZMOI.md, pour que le fichier reste
-- identique octet pour octet a ce qui a ete applique.

-- ── 1. Colonnes ────────────────────────────────────────────────────────────
alter table public.academy_entrainement_reponses add column if not exists xp integer not null default 0;
alter table public.academy_entrainement_reponses add column if not exists combo integer not null default 0;
alter table public.academy_entrainement_reponses add column if not exists etait_du boolean not null default false;
comment on column public.academy_entrainement_reponses.xp is 'XP total de la reponse, bonus de combo compris (10 bonne reponse, 5 carte sue, +5 a partir de la troisieme bonne d affilee, 0 si fausse).';
comment on column public.academy_entrainement_reponses.combo is 'Valeur du combo apres cette reponse : bonnes reponses consecutives dans la session, 0 apres une erreur.';
comment on column public.academy_entrainement_reponses.etait_du is 'L exercice etait du (revision espacee arrivee a echeance) au moment de la reponse : sert au defi « dix revisions ».';

alter table public.academy_module_versions add column if not exists schemas jsonb not null default '[]'::jsonb;
comment on column public.academy_module_versions.schemas is 'Schemas de la version : [{cle, titre, svg, legende}]. Un item y renvoie par payload.figure = {ref: cle}. Le SVG est assaini cote client avant tout rendu ; 24 000 caracteres au plus par schema.';

-- ── 2. Tables : succes et defis ────────────────────────────────────────────
create table if not exists public.academy_succes (
  code         text primary key,
  titre        text not null,
  description  text not null default '',
  icone        text not null default '',
  ordre        integer not null default 0,
  secret       boolean not null default false
);
comment on table public.academy_succes is 'Catalogue des succes (seme par migration). icone = un mot cle que le client rend en pictogramme, jamais un emoji.';

create table if not exists public.academy_succes_obtenus (
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  code             text not null references public.academy_succes(code) on delete cascade,
  obtenu_le        timestamptz not null default now(),
  entrainement_id  uuid references public.academy_entrainements(id) on delete set null,
  primary key (profile_id, code)
);
comment on table public.academy_succes_obtenus is 'Succes debloques, une ligne par personne et par code, ecrite par academy_attribuer_succes seulement.';
create index if not exists idx_academy_succes_obtenus_date on public.academy_succes_obtenus (profile_id, obtenu_le desc);

create table if not exists public.academy_defis_faits (
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  jour             date not null,
  code             text not null,
  entrainement_id  uuid references public.academy_entrainements(id) on delete set null,
  xp               integer not null default 0,
  fait_le          timestamptz not null default now(),
  primary key (profile_id, jour, code)
);
comment on table public.academy_defis_faits is 'Defis du jour credites : un defi par personne et par jour, son XP est entre dans l XP de la session qui l a complete.';
create index if not exists idx_academy_defis_faits_jour on public.academy_defis_faits (jour, code);

-- RLS : le catalogue se lit par tout collaborateur ; chacun lit ses succes
-- et ses defis, la direction lit tout ; aucune ecriture directe.
alter table public.academy_succes enable row level security;
alter table public.academy_succes_obtenus enable row level security;
alter table public.academy_defis_faits enable row level security;
revoke all on public.academy_succes from anon;
revoke all on public.academy_succes_obtenus from anon;
revoke all on public.academy_defis_faits from anon;
revoke insert, update, delete on public.academy_succes from authenticated;
revoke insert, update, delete on public.academy_succes_obtenus from authenticated;
revoke insert, update, delete on public.academy_defis_faits from authenticated;
grant select on public.academy_succes to authenticated;
grant select on public.academy_succes_obtenus to authenticated;
grant select on public.academy_defis_faits to authenticated;

drop policy if exists academy_succes_select on public.academy_succes;
create policy academy_succes_select on public.academy_succes
  for select to authenticated using ((select public.is_staff()));
drop policy if exists academy_succes_obtenus_select on public.academy_succes_obtenus;
create policy academy_succes_obtenus_select on public.academy_succes_obtenus
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.est_admin_academy()));
drop policy if exists academy_defis_faits_select on public.academy_defis_faits;
create policy academy_defis_faits_select on public.academy_defis_faits
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.est_admin_academy()));

-- ── 3. Catalogue des succes ────────────────────────────────────────────────
insert into public.academy_succes (code, titre, description, icone, ordre) values
  ('premiere_session',   'Premier pas',         'Terminer une première session.',                              'pas',          10),
  ('session_parfaite',   'Sans faute',          'Réussir les douze exercices d’une session.',                  'cible',        20),
  ('combo_6',            'Six d’affilée',       'Enchaîner six bonnes réponses dans une session.',             'eclair',       30),
  ('premiere_couronne',  'Première couronne',   'Gagner une couronne sur un deck.',                            'couronne',     40),
  ('deck_valide',        'Deck validé',         'Atteindre trois couronnes sur un deck.',                      'bouclier',     50),
  ('cinq_couronnes',     'Par cœur',            'Atteindre cinq couronnes sur un deck.',                       'etoile',       60),
  ('trois_decks',        'Trilogie',            'Valider trois decks.',                                        'livres',       70),
  ('tous_decks',         'Encyclopédie',        'Valider tous les decks publiés, au moins cinq.',              'bibliotheque', 80),
  ('serie_3',            'Trois jours',         'Tenir une série de trois jours.',                             'flamme',       90),
  ('serie_7',            'Une semaine',         'Tenir une série de sept jours.',                              'flamme',       100),
  ('serie_30',           'Un mois',             'Tenir une série de trente jours.',                            'flamme',       110),
  ('dix_sessions',       'Dix sessions',        'Terminer dix sessions.',                                      'compteur',     120),
  ('cinquante_sessions', 'Cinquante sessions',  'Terminer cinquante sessions.',                                'compteur',     130),
  ('cent_justes',        'Centurion',           'Cumuler cent bonnes réponses.',                               'medaille',     140),
  ('cinq_cents_justes',  'Marathon',            'Cumuler cinq cents bonnes réponses.',                         'medaille',     150),
  ('leve_tot',           'Lève tôt',            'Terminer une session avant 8 h.',                             'soleil',       160),
  ('noctambule',         'Noctambule',          'Terminer une session après 21 h.',                            'lune',         170),
  ('rattrapage',         'Retour en force',     'Faire passer un deck de « à revoir » à « validé ».',          'fleche',       180),
  ('journee_pleine',     'Journée pleine',      'Réussir les trois défis d’un même jour.',                     'calendrier',   190),
  ('niveau_5',           'Solide',              'Atteindre le niveau 5.',                                      'palier',       200),
  ('niveau_10',          'Légende',             'Atteindre le niveau 10.',                                     'palier',       210)
on conflict (code) do update set titre = excluded.titre, description = excluded.description, icone = excluded.icone, ordre = excluded.ordre;

-- ── 4. Niveau ──────────────────────────────────────────────────────────────
-- Seuil du niveau n : 25 x (n - 1) x (n + 2). Niveau 10 et au dela : Legende,
-- la formule continue. progression_pct = position entre xp_min et xp_suivant.
create or replace function public.academy_niveau(p_xp integer)
returns jsonb language plpgsql immutable set search_path to 'public'
as $function$
declare
  v_xp int := greatest(0, coalesce(p_xp, 0)); v_n int := 1; v_min int; v_suivant int;
  c_titres text[] := array['Débutant', 'Apprenti', 'Initié', 'Confirmé', 'Solide', 'Expert', 'Maître', 'Mentor', 'Virtuose', 'Légende'];
begin
  while 25 * v_n * (v_n + 3) <= v_xp loop v_n := v_n + 1; end loop;
  v_min := 25 * (v_n - 1) * (v_n + 2);
  v_suivant := 25 * v_n * (v_n + 3);
  return jsonb_build_object(
    'niveau', v_n, 'titre', c_titres[least(v_n, 10)], 'xp_min', v_min, 'xp_suivant', v_suivant, 'xp_total', v_xp,
    'progression_pct', greatest(0, least(100, round(100.0 * (v_xp - v_min) / greatest(v_suivant - v_min, 1))))::int);
end;
$function$;

-- ── 5. Defis du jour ───────────────────────────────────────────────────────
create or replace function public.academy_catalogue_defis()
returns jsonb language sql immutable set search_path to 'public'
as $function$
  select jsonb_build_array(
    jsonb_build_object('code', 'sessions_2', 'titre', 'Deux sessions aujourd’hui', 'description', 'Terminer deux sessions aujourd’hui.', 'cible', 2, 'xp', 30),
    jsonb_build_object('code', 'parfaite_1', 'titre', 'Une session parfaite', 'description', 'Réussir les douze exercices d’une session.', 'cible', 1, 'xp', 40),
    jsonb_build_object('code', 'justes_15', 'titre', 'Quinze bonnes réponses', 'description', 'Donner quinze bonnes réponses dans des sessions terminées.', 'cible', 15, 'xp', 30),
    jsonb_build_object('code', 'dus_10', 'titre', 'Dix révisions', 'description', 'Réussir dix exercices qui étaient à revoir.', 'cible', 10, 'xp', 30),
    jsonb_build_object('code', 'deck_neuf', 'titre', 'Un deck de plus', 'description', 'Terminer une session sur un deck jamais joué avant aujourd’hui.', 'cible', 1, 'xp', 25),
    jsonb_build_object('code', 'combo_5', 'titre', 'Combo de cinq', 'description', 'Enchaîner cinq bonnes réponses dans une session.', 'cible', 5, 'xp', 25),
    jsonb_build_object('code', 'matin_10h', 'titre', 'Avant dix heures', 'description', 'Terminer une session avant 10 h.', 'cible', 1, 'xp', 20),
    jsonb_build_object('code', 'deux_decks', 'titre', 'Deux decks différents', 'description', 'Terminer des sessions sur deux decks différents.', 'cible', 2, 'xp', 30)
  );
$function$;

-- Les memes trois defis pour tout le monde un jour donne : trois indices
-- distincts tires de md5(jour). La progression se calcule sur les sessions
-- terminees du jour (a la fin d une session, terminee_le est deja pose sur
-- celle qui se termine, elle compte donc). progression est bornee a cible.
create or replace function public.academy_defis_du_jour(p_profile uuid, p_jour date)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_cat jsonb := public.academy_catalogue_defis(); v_h text := md5(p_jour::text); v_idx int[] := '{}'; v_i int; k int;
  v_debut timestamptz := (p_jour::timestamp at time zone 'Europe/Paris'); v_fin timestamptz := ((p_jour + 1)::timestamp at time zone 'Europe/Paris');
  d jsonb; v_code text; v_cible int; v_prog int; v_out jsonb := '[]'::jsonb;
begin
  for k in 0..9 loop
    exit when coalesce(array_length(v_idx, 1), 0) >= 3;
    v_i := (('x' || substr(v_h, 1 + k * 3, 3))::bit(12)::int) % 8;
    if not (v_i = any (v_idx)) then v_idx := v_idx || v_i; end if;
  end loop;
  -- Cas limite : moins de trois indices distincts en dix tirages, on complete
  -- avec les suivants (toujours deterministe).
  v_i := 0;
  while coalesce(array_length(v_idx, 1), 0) < 3 loop
    if not (v_i = any (v_idx)) then v_idx := v_idx || v_i; end if;
    v_i := v_i + 1;
  end loop;
  for k in 1..3 loop
    d := v_cat -> v_idx[k]; v_code := d ->> 'code'; v_cible := (d ->> 'cible')::int;
    if v_code = 'sessions_2' then
      select count(*) into v_prog from public.academy_entrainements e where e.profile_id = p_profile and e.terminee_le >= v_debut and e.terminee_le < v_fin;
    elsif v_code = 'parfaite_1' then
      select count(*) into v_prog from public.academy_entrainements e where e.profile_id = p_profile and e.terminee_le >= v_debut and e.terminee_le < v_fin and e.nb_bons = e.nb_total and e.nb_total > 0;
    elsif v_code = 'justes_15' then
      select coalesce(sum(e.nb_bons), 0) into v_prog from public.academy_entrainements e where e.profile_id = p_profile and e.terminee_le >= v_debut and e.terminee_le < v_fin;
    elsif v_code = 'dus_10' then
      select count(*) into v_prog from public.academy_entrainement_reponses r join public.academy_entrainements e on e.id = r.entrainement_id
       where e.profile_id = p_profile and e.terminee_le >= v_debut and e.terminee_le < v_fin and r.correcte and r.etait_du;
    elsif v_code = 'deck_neuf' then
      select count(*) into v_prog from public.academy_entrainements e join public.academy_module_versions v on v.id = e.version_id
       where e.profile_id = p_profile and e.terminee_le >= v_debut and e.terminee_le < v_fin
         and not exists (select 1 from public.academy_entrainements e2 join public.academy_module_versions v2 on v2.id = e2.version_id
                          where e2.profile_id = p_profile and v2.module_id = v.module_id and e2.terminee_le is not null and e2.terminee_le < v_debut);
    elsif v_code = 'combo_5' then
      select coalesce(max(r.combo), 0) into v_prog from public.academy_entrainement_reponses r join public.academy_entrainements e on e.id = r.entrainement_id
       where e.profile_id = p_profile and e.terminee_le >= v_debut and e.terminee_le < v_fin;
    elsif v_code = 'matin_10h' then
      select count(*) into v_prog from public.academy_entrainements e where e.profile_id = p_profile and e.terminee_le >= v_debut and e.terminee_le < v_fin
        and (e.terminee_le at time zone 'Europe/Paris')::time < time '10:00';
    elsif v_code = 'deux_decks' then
      select count(distinct v.module_id) into v_prog from public.academy_entrainements e join public.academy_module_versions v on v.id = e.version_id
       where e.profile_id = p_profile and e.terminee_le >= v_debut and e.terminee_le < v_fin;
    else
      v_prog := 0;
    end if;
    v_prog := least(coalesce(v_prog, 0), v_cible);
    v_out := v_out || jsonb_build_object('code', v_code, 'titre', d ->> 'titre', 'description', d ->> 'description', 'cible', v_cible, 'xp', (d ->> 'xp')::int,
      'progression', v_prog,
      'fait', (v_prog >= v_cible) or exists (select 1 from public.academy_defis_faits f where f.profile_id = p_profile and f.jour = p_jour and f.code = v_code));
  end loop;
  return v_out;
end;
$function$;

-- ── 6. Attribution des succes ──────────────────────────────────────────────
-- Appelee par academy_terminer_entrainement, une fois terminee_le pose sur
-- la session qui se termine. Le contexte porte ce que terminer sait deja :
-- couronnes_avant, couronnes_apres, statut_avant, statut_apres, combo_max,
-- parfaite, niveau_avant, niveau_apres (objets de academy_niveau), serie,
-- defis_faits (nombre de defis du jour credites). Rend les codes nouveaux.
create or replace function public.academy_attribuer_succes(p_profile uuid, p_entrainement uuid, p_contexte jsonb)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  c jsonb := coalesce(p_contexte, '{}'::jsonb); v_codes text[] := '{}'; v_nouveaux text[] := '{}';
  v_sessions int; v_justes int; v_valides int; v_publies int; v_publies_valides int; v_heure int; v_code text;
begin
  select count(*), coalesce(sum(nb_bons), 0) into v_sessions, v_justes from public.academy_entrainements where profile_id = p_profile and terminee_le is not null;
  select count(distinct v.module_id) into v_valides from public.academy_validations x join public.academy_module_versions v on v.id = x.version_id where x.profile_id = p_profile;
  select count(*), count(*) filter (where exists (select 1 from public.academy_validations x join public.academy_module_versions v2 on v2.id = x.version_id where x.profile_id = p_profile and v2.module_id = v.module_id))
    into v_publies, v_publies_valides
    from public.academy_module_versions v join public.academy_modules m on m.id = v.module_id where v.statut = 'publie' and m.archive_le is null;
  v_heure := extract(hour from (now() at time zone 'Europe/Paris'))::int;

  if v_sessions >= 1 then v_codes := array_append(v_codes, 'premiere_session'); end if;
  if coalesce((c ->> 'parfaite')::boolean, false) then v_codes := array_append(v_codes, 'session_parfaite'); end if;
  if coalesce((c ->> 'combo_max')::int, 0) >= 6 then v_codes := array_append(v_codes, 'combo_6'); end if;
  if coalesce((c ->> 'couronnes_apres')::int, 0) >= 1 then v_codes := array_append(v_codes, 'premiere_couronne'); end if;
  if coalesce((c ->> 'couronnes_apres')::int, 0) >= 3 then v_codes := array_append(v_codes, 'deck_valide'); end if;
  if coalesce((c ->> 'couronnes_apres')::int, 0) >= 5 then v_codes := array_append(v_codes, 'cinq_couronnes'); end if;
  if v_valides >= 3 then v_codes := array_append(v_codes, 'trois_decks'); end if;
  if v_publies >= 5 and v_publies_valides = v_publies then v_codes := array_append(v_codes, 'tous_decks'); end if;
  if coalesce((c ->> 'serie')::int, 0) >= 3 then v_codes := array_append(v_codes, 'serie_3'); end if;
  if coalesce((c ->> 'serie')::int, 0) >= 7 then v_codes := array_append(v_codes, 'serie_7'); end if;
  if coalesce((c ->> 'serie')::int, 0) >= 30 then v_codes := array_append(v_codes, 'serie_30'); end if;
  if v_sessions >= 10 then v_codes := array_append(v_codes, 'dix_sessions'); end if;
  if v_sessions >= 50 then v_codes := array_append(v_codes, 'cinquante_sessions'); end if;
  if v_justes >= 100 then v_codes := array_append(v_codes, 'cent_justes'); end if;
  if v_justes >= 500 then v_codes := array_append(v_codes, 'cinq_cents_justes'); end if;
  if v_heure < 8 then v_codes := array_append(v_codes, 'leve_tot'); end if;
  if v_heure >= 21 then v_codes := array_append(v_codes, 'noctambule'); end if;
  if (c ->> 'statut_avant') = 'a_revoir' and (c ->> 'statut_apres') = 'valide' then v_codes := array_append(v_codes, 'rattrapage'); end if;
  if coalesce((c ->> 'defis_faits')::int, 0) >= 3 then v_codes := array_append(v_codes, 'journee_pleine'); end if;
  if coalesce((c -> 'niveau_apres' ->> 'niveau')::int, 1) >= 5 then v_codes := array_append(v_codes, 'niveau_5'); end if;
  if coalesce((c -> 'niveau_apres' ->> 'niveau')::int, 1) >= 10 then v_codes := array_append(v_codes, 'niveau_10'); end if;

  for v_code in select s.code from public.academy_succes s where s.code = any (v_codes) order by s.ordre loop
    insert into public.academy_succes_obtenus (profile_id, code, entrainement_id) values (p_profile, v_code, p_entrainement)
    on conflict (profile_id, code) do nothing;
    if found then v_nouveaux := array_append(v_nouveaux, v_code); end if;
  end loop;
  return to_jsonb(v_nouveaux);
end;
$function$;

-- ── 7. Classement anonyme de la semaine ────────────────────────────────────
-- Pour la personne connectee seulement : rang, nombre de participants, XP du
-- premier et de la personne juste devant. Aucun nom, aucun identifiant
-- d autrui ne sort. Participants : profils actifs ayant au moins une
-- affectation ou une session ; XP = sessions terminees du lundi 0 h
-- (Europe/Paris) au dimanche.
create or replace function public.academy_classement_semaine()
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := public.academy_exiger_staff();
  v_lundi date := date_trunc('week', now() at time zone 'Europe/Paris')::date;
  v_debut timestamptz; v_fin timestamptz; v_moi int; v_premier int; v_devant int; v_participants int; v_rang int;
begin
  v_debut := (v_lundi::timestamp at time zone 'Europe/Paris');
  v_fin := ((v_lundi + 7)::timestamp at time zone 'Europe/Paris');
  v_moi := coalesce((select sum(e.xp) from public.academy_entrainements e where e.profile_id = v_uid and e.terminee_le >= v_debut and e.terminee_le < v_fin), 0);
  select count(*), coalesce(max(p.xp), 0), count(*) filter (where p.xp > v_moi) + 1, min(p.xp) filter (where p.xp > v_moi)
    into v_participants, v_premier, v_rang, v_devant
    from (select pr.id, coalesce((select sum(e.xp) from public.academy_entrainements e where e.profile_id = pr.id and e.terminee_le >= v_debut and e.terminee_le < v_fin), 0) as xp
            from public.profiles pr
           where pr.is_active = true
             and (exists (select 1 from public.academy_affectations a where a.profile_id = pr.id) or exists (select 1 from public.academy_entrainements e where e.profile_id = pr.id))) p;
  return jsonb_build_object('semaine', v_lundi, 'rang', v_rang, 'participants', v_participants, 'xp_moi', v_moi,
    'xp_premier', greatest(v_premier, v_moi), 'xp_devant', v_devant, 'ecart_premier', greatest(v_premier, v_moi) - v_moi);
end;
$function$;

-- ── 8. Droits d execution ──────────────────────────────────────────────────
revoke execute on function public.academy_niveau(integer) from public, anon;
grant execute on function public.academy_niveau(integer) to authenticated;
revoke execute on function public.academy_classement_semaine() from public, anon;
grant execute on function public.academy_classement_semaine() to authenticated;
revoke execute on function public.academy_catalogue_defis() from public, anon, authenticated;
revoke execute on function public.academy_defis_du_jour(uuid, date) from public, anon, authenticated;
revoke execute on function public.academy_attribuer_succes(uuid, uuid, jsonb) from public, anon, authenticated;
