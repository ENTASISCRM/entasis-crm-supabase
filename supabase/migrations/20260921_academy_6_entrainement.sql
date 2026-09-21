-- Entasis Academy, migration 6 : le mode entrainement.
--
-- Decision de Louis du 21 septembre 2026 : les lecons longues et le quiz
-- sont remplaces par des sessions courtes d exercices (douze items, huit
-- types, correction immediate cote serveur), une repetition espacee par
-- item, des XP, une serie de jours et une maitrise par deck en couronnes.
-- Conception : docs/superpowers/specs/2026-09-21-academy-entrainement-design.md.
--
-- Additif sur le socle : les tables des lecons, questions, tentatives et
-- revisions restent en base sans etre lues (nettoyage ulterieur, apres
-- validation). Les fonctions qui les servaient sont retirees pour ne pas
-- laisser une API morte ouverte.
--
-- Regles conservees : corriges dans une table sans policy, reponses en
-- indices presentes (le serveur melange et memorise l ordre), idempotence
-- par jeton et par (entrainement, item), temps actif par intervalles bornes
-- par now(), aucune duree envoyee par le navigateur.

-- Trois fichiers pour une seule migration logique, chacun assez court pour
-- s appliquer par l outil MCP en une fois : 6 (schema, droits sur les tables,
-- helpers, lecture), 6b (sessions, administration) et 6c (pilotage, purge,
-- droits d execution, parametres). Ils s appliquent dans cet ordre, l un
-- apres l autre, et forment ensemble le mode entrainement.

-- ── 1. Schema ─────────────────────────────────────────────────────────────
alter table public.academy_module_versions add column if not exists memo_md text not null default '';
comment on column public.academy_module_versions.memo_md is 'Le memo d une page du deck : ce qu il faut savoir par coeur, en markdown.';

create table if not exists public.academy_items (
  id          uuid primary key default gen_random_uuid(),
  version_id  uuid not null references public.academy_module_versions(id) on delete cascade,
  ordre       integer not null default 0,
  type        text not null check (type in ('choix', 'vrai_faux', 'multi', 'ordre', 'association', 'trou_choix', 'trou_saisie', 'carte')),
  competence  text not null default '',
  difficulte  smallint not null default 2 check (difficulte between 1 and 3),
  payload     jsonb not null default '{}'::jsonb,
  archive_le  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.academy_items is 'Un exercice d un deck : enonce et choix dans payload, jamais la reponse (academy_items_corriges).';
create index if not exists idx_academy_items_version on public.academy_items (version_id, ordre);

create table if not exists public.academy_items_corriges (
  item_id      uuid primary key references public.academy_items(id) on delete cascade,
  corrige      jsonb not null default '{}'::jsonb,
  explication  text not null default '',
  updated_at   timestamptz not null default now()
);
comment on table public.academy_items_corriges is 'Reponses des items. RLS active sans politique, revoke all : lues par les fonctions security definer a la correction.';

create table if not exists public.academy_forces (
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  item_id      uuid not null references public.academy_items(id) on delete cascade,
  force        smallint not null default 0 check (force between 0 and 5),
  prochaine_le timestamptz not null default now(),
  reussites    integer not null default 0,
  echecs       integer not null default 0,
  derniere_le  timestamptz,
  primary key (profile_id, item_id)
);
comment on table public.academy_forces is 'Repetition espacee : la force d un item pour une personne et la date de sa prochaine revision.';
create index if not exists idx_academy_forces_due on public.academy_forces (profile_id, prochaine_le);
create index if not exists idx_academy_forces_item on public.academy_forces (item_id);

create table if not exists public.academy_entrainements (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  version_id    uuid not null references public.academy_module_versions(id),
  session_id    uuid references public.academy_sessions(id) on delete set null,
  jeton_client  uuid not null unique,
  items         jsonb not null default '[]'::jsonb,
  demarree_le   timestamptz not null default now(),
  terminee_le   timestamptz,
  nb_bons       integer,
  nb_total      integer,
  xp            integer not null default 0,
  resume        jsonb
);
comment on column public.academy_entrainements.items is 'Les items tires et l ordre presente de leurs choix, figes a l ouverture : [{item_id, rang, ordre:[...]}].';
create index if not exists idx_academy_entrainements_profil on public.academy_entrainements (profile_id, demarree_le desc);
create index if not exists idx_academy_entrainements_version on public.academy_entrainements (version_id);
create index if not exists idx_academy_entrainements_terminee on public.academy_entrainements (terminee_le desc);

create table if not exists public.academy_entrainement_reponses (
  entrainement_id uuid not null references public.academy_entrainements(id) on delete cascade,
  item_id         uuid not null references public.academy_items(id),
  rang            integer not null default 0,
  reponse         jsonb,
  correcte        boolean not null default false,
  repondu_le      timestamptz not null default now(),
  primary key (entrainement_id, item_id)
);
create index if not exists idx_academy_entrainement_reponses_item on public.academy_entrainement_reponses (item_id);

create table if not exists public.academy_maitrise (
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  version_id        uuid not null references public.academy_module_versions(id),
  couronnes         smallint not null default 0 check (couronnes between 0 and 5),
  xp                integer not null default 0,
  sessions          integer not null default 0,
  derniere_session  timestamptz,
  updated_at        timestamptz not null default now(),
  primary key (profile_id, version_id)
);
create index if not exists idx_academy_maitrise_version on public.academy_maitrise (version_id);

create table if not exists public.academy_series (
  profile_id          uuid primary key references public.profiles(id) on delete cascade,
  serie               integer not null default 0,
  meilleure           integer not null default 0,
  dernier_jour        date,
  objectif_quotidien  integer not null default 1 check (objectif_quotidien between 1 and 10),
  updated_at          timestamptz not null default now()
);

-- Les sessions de temps actif servent aussi aux entrainements : la lecon
-- devient facultative.
alter table public.academy_sessions alter column lecon_id drop not null;
alter table public.academy_sessions add column if not exists entrainement_id uuid;
alter table public.academy_intervalles alter column lecon_id drop not null;

-- Les durees archivees par jour se totalisent par version, plus par lecon :
-- la purge doit conserver le temps des entrainements (table vide en
-- production a ce jour).
alter table public.academy_durees_jour drop constraint if exists academy_durees_jour_pkey;
alter table public.academy_durees_jour drop constraint if exists academy_durees_jour_lecon_id_fkey;
alter table public.academy_durees_jour drop column if exists lecon_id;
alter table public.academy_durees_jour alter column version_id set not null;
alter table public.academy_durees_jour add primary key (profile_id, version_id, jour);

-- updated_at
do $do$
declare t text;
begin
  foreach t in array array['academy_items','academy_items_corriges','academy_maitrise','academy_series'] loop
    execute format('drop trigger if exists trg_%s_updated_at on public.%I', t, t);
    execute format('create trigger trg_%s_updated_at before update on public.%I for each row execute function public.handle_updated_at()', t, t);
  end loop;
end
$do$;

-- Les items et corriges d une version publiee sont figes, comme les lecons.
create or replace function public.academy_item_fige()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_version uuid; v_statut text;
begin
  if TG_TABLE_NAME = 'academy_items_corriges' then
    select i.version_id into v_version from public.academy_items i where i.id = coalesce(new.item_id, old.item_id);
  else
    v_version := coalesce(new.version_id, old.version_id);
  end if;
  select statut into v_statut from public.academy_module_versions where id = v_version;
  if v_statut in ('publie', 'archive') then
    raise exception 'Le contenu d une version publiee ne se modifie pas : creez un nouveau brouillon'
      using errcode = 'check_violation';
  end if;
  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$function$;
do $do$
declare t text;
begin
  foreach t in array array['academy_items','academy_items_corriges'] loop
    execute format('drop trigger if exists trg_%s_fige on public.%I', t, t);
    execute format('create trigger trg_%s_fige before insert or update or delete on public.%I for each row execute function public.academy_item_fige()', t, t);
  end loop;
end
$do$;

-- academy_version_immuable : le memo fait partie du contenu fige.
create or replace function public.academy_version_immuable()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if old.statut = 'publie' then
    if new.statut = 'archive'
       and new.module_id = old.module_id and new.numero = old.numero
       and new.titre = old.titre and new.objectif = old.objectif
       and new.competence = old.competence and new.duree_minutes = old.duree_minutes
       and new.prerequis = old.prerequis and new.seuil_reussite = old.seuil_reussite
       and new.cas_pratique = old.cas_pratique and new.a_completer = old.a_completer
       and new.sources = old.sources and new.fictif = old.fictif
       and new.memo_md = old.memo_md
       and new.publie_le is not distinct from old.publie_le
       and new.publie_par is not distinct from old.publie_par
       and new.relu_par is not distinct from old.relu_par
       and new.relu_le is not distinct from old.relu_le then
      return new;
    end if;
    raise exception 'Une version publiee ne se modifie pas : creez un nouveau brouillon'
      using errcode = 'check_violation';
  end if;
  if old.statut = 'archive' then
    raise exception 'Une version archivee ne se modifie pas'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

-- ── 2. RLS et privileges ───────────────────────────────────────────────────
do $do$
declare t text;
begin
  foreach t in array array['academy_items','academy_items_corriges','academy_forces','academy_entrainements','academy_entrainement_reponses','academy_maitrise','academy_series'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end
$do$;

-- Les items et les sessions ne se lisent que par les fonctions security
-- definer : en direct, l ordre d auteur des elements et la permutation
-- memorisee suffiraient a deduire le corrige des exercices d ordre et
-- d association (relecture du 21 septembre). L administration edite par
-- academy_enregistrer_item, jamais par la table.
revoke all on public.academy_items from anon, authenticated;
revoke all on public.academy_items_corriges from anon, authenticated;

drop policy if exists academy_forces_select on public.academy_forces;
create policy academy_forces_select on public.academy_forces
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.est_admin_academy()));
revoke insert, update, delete on public.academy_forces from authenticated;

revoke all on public.academy_entrainements from anon, authenticated;

revoke all on public.academy_entrainement_reponses from anon, authenticated;

drop policy if exists academy_maitrise_select on public.academy_maitrise;
create policy academy_maitrise_select on public.academy_maitrise
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.est_admin_academy()));
revoke insert, update, delete on public.academy_maitrise from authenticated;

drop policy if exists academy_series_select on public.academy_series;
create policy academy_series_select on public.academy_series
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.est_admin_academy()));
revoke insert, update, delete on public.academy_series from authenticated;

-- ── 3. Les anciennes fonctions de lecture et de quiz sont retirees ─────────
drop function if exists public.academy_lecon(uuid);
drop function if exists public.academy_ouvrir_session(uuid, uuid);
drop function if exists public.academy_battement(uuid);
drop function if exists public.academy_terminer_lecon(uuid, integer);
drop function if exists public.academy_presenter_tentative(uuid);
drop function if exists public.academy_ouvrir_tentative(uuid, text, uuid);
drop function if exists public.academy_soumettre_tentative(uuid, jsonb);
drop function if exists public.academy_corrige(uuid);
drop function if exists public.academy_mes_tentatives();
drop function if exists public.academy_enregistrer_lecon(uuid, uuid, jsonb);
drop function if exists public.academy_enregistrer_question(uuid, uuid, jsonb);

-- ── 4. Helpers ─────────────────────────────────────────────────────────────
-- Normalisation d une saisie libre : minuscules, sans accents, espaces
-- reduits, ponctuation de bord retiree.
create or replace function public.academy_normaliser(p text)
returns text language sql immutable set search_path to 'public'
as $function$
  select btrim(regexp_replace(translate(lower(coalesce(p, '')),
    'àáâãäåçèéêëìíîïñòóôõöùúûüýÿœæ’', 'aaaaaaceeeeiiiinooooouuuuyyoa'''), '\s+', ' ', 'g'), ' .,;:!?''"«»()');
$function$;

-- Delai avant la prochaine revision selon la force.
create or replace function public.academy_delai_force(p_force integer)
returns interval language sql immutable set search_path to 'public'
as $function$
  select case greatest(0, least(5, coalesce(p_force, 0)))
    when 0 then interval '10 minutes' when 1 then interval '1 day' when 2 then interval '3 days'
    when 3 then interval '7 days' when 4 then interval '14 days' else interval '30 days' end;
$function$;

-- Couronnes d une personne sur une version, d apres les forces des items.
create or replace function public.academy_couronnes(p_profile uuid, p_version uuid)
returns integer language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_total int; v_vus int; v_f2 int; v_f3 int; v_f4 int;
begin
  select count(*),
         count(f.item_id),
         count(*) filter (where f.force >= 2),
         count(*) filter (where f.force >= 3),
         count(*) filter (where f.force >= 4)
    into v_total, v_vus, v_f2, v_f3, v_f4
    from public.academy_items i left join public.academy_forces f on f.item_id = i.id and f.profile_id = p_profile
   where i.version_id = p_version and i.archive_le is null;
  if coalesce(v_total, 0) = 0 or v_vus = 0 then return 0; end if;
  if v_f4 = v_total then return 5; end if;
  if v_f3 = v_total then return 4; end if;
  if v_f2 = v_total then return 3; end if;
  if v_f2 * 10 >= v_total * 6 then return 2; end if;
  if v_vus = v_total then return 1; end if;
  return 0;
end;
$function$;

-- Items dus d une personne sur une version (ou toutes si null).
create or replace function public.academy_items_dus(p_profile uuid, p_version uuid default null)
returns integer language sql stable security definer set search_path to 'public'
as $function$
  select count(*)::int from public.academy_forces f join public.academy_items i on i.id = f.item_id
   join public.academy_module_versions v on v.id = i.version_id
   where f.profile_id = p_profile and f.prochaine_le <= now() and f.force < 5 and i.archive_le is null
     and v.statut = 'publie' and (p_version is null or i.version_id = p_version);
$function$;

-- Statut derive d une affectation.
create or replace function public.academy_recalculer_statut(p_profile uuid, p_version uuid)
returns text language plpgsql security definer set search_path to 'public'
as $function$
declare v_couronnes int; v_sessions int; v_total int; v_retard int; v_statut text;
begin
  v_couronnes := public.academy_couronnes(p_profile, p_version);
  select count(*) into v_sessions from public.academy_entrainements where profile_id = p_profile and version_id = p_version;
  select count(*), count(*) filter (where f.prochaine_le < now() - interval '7 days' and f.force < 5)
    into v_total, v_retard
    from public.academy_items i left join public.academy_forces f on f.item_id = i.id and f.profile_id = p_profile
   where i.version_id = p_version and i.archive_le is null;
  if v_couronnes >= 3 then
    v_statut := case when v_total > 0 and v_retard * 3 > v_total then 'a_revoir' else 'valide' end;
  elsif exists (select 1 from public.academy_validations x where x.profile_id = p_profile and x.version_id = p_version) then
    -- La validation est une preuve durable : des forces retombees
    -- rendent le deck « a revoir », jamais « en cours ».
    v_statut := 'a_revoir';
  elsif v_sessions > 0 then
    v_statut := 'en_cours';
  else
    v_statut := 'non_commence';
  end if;
  update public.academy_affectations set statut = v_statut, updated_at = now()
   where profile_id = p_profile and version_id = p_version and statut is distinct from v_statut;
  return v_statut;
end;
$function$;

-- Duree active sur une version : sessions liees a la version (entrainements).
create or replace function public.academy_duree_version(p_profile uuid, p_version uuid)
returns integer language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  r record; v_debut timestamptz; v_fin timestamptz; v_total numeric := 0; v_archive integer := 0;
begin
  for r in
    select i.debut as d, i.fin as f from public.academy_intervalles i
    join public.academy_sessions s on s.id = i.session_id
    where i.profile_id = p_profile and s.version_id = p_version
    order by 1
  loop
    if v_debut is null then v_debut := r.d; v_fin := r.f;
    elsif r.d <= v_fin then v_fin := greatest(v_fin, r.f);
    else v_total := v_total + extract(epoch from (v_fin - v_debut)); v_debut := r.d; v_fin := r.f;
    end if;
  end loop;
  if v_debut is not null then v_total := v_total + extract(epoch from (v_fin - v_debut)); end if;
  select coalesce(sum(secondes), 0) into v_archive from public.academy_durees_jour
   where profile_id = p_profile and version_id = p_version;
  return round(v_total)::integer + v_archive;
end;
$function$;

-- La presentation d un item : payload avec les choix dans l ordre memorise,
-- jamais le corrige.
create or replace function public.academy_presenter_item(p_item_id uuid, p_ordre jsonb)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare i record; v jsonb;
begin
  select * into i from public.academy_items where id = p_item_id;
  if i is null then return null; end if;
  v := i.payload;
  if i.type in ('choix', 'multi', 'trou_choix') then
    v := v || jsonb_build_object('choix', (select coalesce(jsonb_agg(i.payload -> 'choix' -> (o.idx)::int order by o.pos), '[]'::jsonb)
                                            from jsonb_array_elements_text(p_ordre) with ordinality o(idx, pos)));
  elsif i.type = 'ordre' then
    v := v || jsonb_build_object('elements', (select coalesce(jsonb_agg(i.payload -> 'elements' -> (o.idx)::int order by o.pos), '[]'::jsonb)
                                               from jsonb_array_elements_text(p_ordre) with ordinality o(idx, pos)));
  elsif i.type = 'association' then
    v := v || jsonb_build_object('droite', (select coalesce(jsonb_agg(i.payload -> 'droite' -> (o.idx)::int order by o.pos), '[]'::jsonb)
                                             from jsonb_array_elements_text(p_ordre) with ordinality o(idx, pos)));
  end if;
  return jsonb_build_object('item_id', i.id, 'type', i.type, 'competence', i.competence, 'difficulte', i.difficulte, 'payload', v);
end;
$function$;

-- ── 5. Lecture : catalogue, aujourd hui, deck, resultats, rappels ──────────
create or replace function public.academy_catalogue()
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_staff();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'module_id', m.id, 'slug', m.slug, 'titre', v.titre, 'theme', m.theme, 'niveau', m.niveau, 'ordre', m.ordre,
      'version_id', v.id, 'numero', v.numero, 'objectif', v.objectif, 'competence', v.competence,
      'duree_minutes', v.duree_minutes, 'prerequis', v.prerequis,
      'nb_items', (select count(*) from public.academy_items i where i.version_id = v.id and i.archive_le is null),
      'publie_le', v.publie_le,
      'affectation', (select jsonb_build_object('id', a.id, 'statut', a.statut, 'echeance', a.echeance, 'obligatoire', a.obligatoire, 'parcours_id', a.parcours_id)
                      from public.academy_affectations a where a.profile_id = v_uid and a.version_id = v.id),
      'couronnes', public.academy_couronnes(v_uid, v.id),
      'items_vus', (select count(*) from public.academy_forces f join public.academy_items i on i.id = f.item_id where f.profile_id = v_uid and i.version_id = v.id and i.archive_le is null),
      'items_dus', public.academy_items_dus(v_uid, v.id),
      'xp', coalesce((select xp from public.academy_maitrise x where x.profile_id = v_uid and x.version_id = v.id), 0),
      'valide_le', (select valide_le from public.academy_validations x where x.profile_id = v_uid and x.version_id = v.id)
    ) order by m.ordre, m.slug)
    from public.academy_modules m
    join public.academy_module_versions v on v.module_id = m.id and v.statut = 'publie'
    where m.archive_le is null
  ), '[]'::jsonb);
end;
$function$;

create or replace function public.academy_module(p_slug text)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_staff(); v jsonb;
begin
  select jsonb_build_object(
    'module_id', m.id, 'slug', m.slug, 'titre', mv.titre, 'theme', m.theme, 'niveau', m.niveau,
    'version_id', mv.id, 'numero', mv.numero, 'objectif', mv.objectif, 'competence', mv.competence,
    'duree_minutes', mv.duree_minutes, 'prerequis', mv.prerequis, 'memo_md', mv.memo_md, 'sources', mv.sources,
    'relu_par', mv.relu_par, 'relu_le', mv.relu_le, 'publie_le', mv.publie_le,
    'nb_items', (select count(*) from public.academy_items i where i.version_id = mv.id and i.archive_le is null),
    'couronnes', public.academy_couronnes(v_uid, mv.id),
    'items_vus', (select count(*) from public.academy_forces f join public.academy_items i on i.id = f.item_id where f.profile_id = v_uid and i.version_id = mv.id and i.archive_le is null),
    'items_dus', public.academy_items_dus(v_uid, mv.id),
    'xp', coalesce((select xp from public.academy_maitrise x where x.profile_id = v_uid and x.version_id = mv.id), 0),
    'competences', coalesce((select jsonb_agg(jsonb_build_object('competence', c.competence, 'nb', c.nb, 'force_moyenne', c.fm) order by c.fm, c.competence)
      from (select i.competence, count(*) as nb, round(avg(coalesce(f.force, 0)), 1) as fm
              from public.academy_items i left join public.academy_forces f on f.item_id = i.id and f.profile_id = v_uid
             where i.version_id = mv.id and i.archive_le is null and i.competence <> '' group by i.competence) c), '[]'::jsonb),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'demarree_le', e.demarree_le, 'terminee_le', e.terminee_le, 'nb_bons', e.nb_bons, 'nb_total', e.nb_total, 'xp', e.xp) order by e.demarree_le desc)
      from (select * from public.academy_entrainements where profile_id = v_uid and version_id = mv.id and terminee_le is not null order by demarree_le desc limit 20) e), '[]'::jsonb),
    'affectation', (select jsonb_build_object('id', a.id, 'statut', a.statut, 'echeance', a.echeance, 'obligatoire', a.obligatoire)
                    from public.academy_affectations a where a.profile_id = v_uid and a.version_id = mv.id),
    'validation', (select jsonb_build_object('valide_le', x.valide_le) from public.academy_validations x where x.profile_id = v_uid and x.version_id = mv.id),
    'attestation', (select jsonb_build_object('numero', t.numero, 'delivree_le', t.delivree_le, 'score', t.score, 'total', t.total)
                    from public.academy_attestations t where t.profile_id = v_uid and t.version_id = mv.id),
    'entrainement_ouvert', (select jsonb_build_object('id', e.id, 'jeton_client', e.jeton_client) from public.academy_entrainements e
                            where e.profile_id = v_uid and e.version_id = mv.id and e.terminee_le is null and e.demarree_le > now() - interval '2 hours'
                            order by e.demarree_le desc limit 1),
    'duree_active_s', public.academy_duree_version(v_uid, mv.id)
  ) into v
  from public.academy_modules m
  join public.academy_module_versions mv on mv.module_id = m.id and mv.statut = 'publie'
  where m.slug = p_slug and m.archive_le is null;
  if v is null then raise exception 'Module introuvable ou non publie' using errcode = 'P0002'; end if;
  return v;
end;
$function$;

create or replace function public.academy_mon_parcours()
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_staff(); v_auj date := public.academy_aujourdhui(); v_serie record; v_sess_auj int;
begin
  select * into v_serie from public.academy_series where profile_id = v_uid;
  select count(*) into v_sess_auj from public.academy_entrainements
   where profile_id = v_uid and terminee_le is not null and (terminee_le at time zone 'Europe/Paris')::date = v_auj;
  return jsonb_build_object(
    'aujourdhui', v_auj,
    'serie', jsonb_build_object(
      'serie', case when v_serie.dernier_jour is null or v_serie.dernier_jour < v_auj - 1 then 0 else coalesce(v_serie.serie, 0) end,
      'meilleure', coalesce(v_serie.meilleure, 0), 'dernier_jour', v_serie.dernier_jour,
      'objectif_quotidien', coalesce(v_serie.objectif_quotidien, 1),
      'sessions_aujourdhui', v_sess_auj,
      'objectif_atteint', v_sess_auj >= coalesce(v_serie.objectif_quotidien, 1),
      'en_danger', (v_serie.dernier_jour = v_auj - 1 and v_sess_auj = 0)),
    'xp', jsonb_build_object(
      'total', coalesce((select sum(xp) from public.academy_entrainements where profile_id = v_uid), 0),
      'aujourdhui', coalesce((select sum(xp) from public.academy_entrainements where profile_id = v_uid and (terminee_le at time zone 'Europe/Paris')::date = v_auj), 0),
      'semaine', coalesce((select sum(xp) from public.academy_entrainements where profile_id = v_uid and terminee_le >= now() - interval '7 days'), 0)),
    'items_dus', public.academy_items_dus(v_uid, null),
    'affectations', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'module_id', a.module_id, 'version_id', a.version_id, 'parcours_id', a.parcours_id,
        'parcours_titre', (select titre from public.academy_parcours pa where pa.id = a.parcours_id),
        'obligatoire', a.obligatoire, 'echeance', a.echeance, 'statut', a.statut,
        'en_retard', (a.echeance is not null and a.echeance < v_auj and a.statut <> 'valide'),
        'slug', m.slug, 'titre', v.titre, 'theme', m.theme, 'niveau', m.niveau, 'duree_minutes', v.duree_minutes,
        'nb_items', (select count(*) from public.academy_items i where i.version_id = v.id and i.archive_le is null),
        'couronnes', public.academy_couronnes(v_uid, v.id),
        'items_vus', (select count(*) from public.academy_forces f join public.academy_items i on i.id = f.item_id where f.profile_id = v_uid and i.version_id = v.id and i.archive_le is null),
        'items_dus', public.academy_items_dus(v_uid, v.id),
        'xp', coalesce(mx.xp, 0), 'sessions', coalesce(mx.sessions, 0), 'derniere_session', mx.derniere_session,
        'valide_le', (select valide_le from public.academy_validations x where x.profile_id = v_uid and x.version_id = v.id),
        'version_statut', v.statut, 'created_at', a.created_at
      ) order by (a.statut = 'valide'), a.echeance nulls last, a.created_at)
      from public.academy_affectations a
      join public.academy_modules m on m.id = a.module_id
      join public.academy_module_versions v on v.id = a.version_id
      left join public.academy_maitrise mx on mx.profile_id = v_uid and mx.version_id = v.id
      where a.profile_id = v_uid), '[]'::jsonb),
    'dernieres_reussites', coalesce((select jsonb_agg(jsonb_build_object('version_id', x.version_id, 'titre', v.titre, 'slug', m.slug, 'valide_le', x.valide_le,
        'attestation', (select numero from public.academy_attestations t where t.profile_id = v_uid and t.version_id = x.version_id)) order by x.valide_le desc)
      from (select * from public.academy_validations where profile_id = v_uid order by valide_le desc limit 5) x
      join public.academy_module_versions v on v.id = x.version_id join public.academy_modules m on m.id = v.module_id), '[]'::jsonb),
    'temps_actif_s', public.academy_duree_active(v_uid, null, null),
    'temps_actif_7j_s', public.academy_duree_active(v_uid, now() - interval '7 days', null),
    'notice_donnees', (select notice_donnees from public.academy_parametres where id = true),
    'retention_intervalles_mois', (select retention_intervalles_mois from public.academy_parametres where id = true)
  );
end;
$function$;

create or replace function public.academy_mes_resultats()
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_staff(); v_serie record; v_auj date := public.academy_aujourdhui();
begin
  select * into v_serie from public.academy_series where profile_id = v_uid;
  return jsonb_build_object(
    'serie', case when v_serie.dernier_jour is null or v_serie.dernier_jour < v_auj - 1 then 0 else coalesce(v_serie.serie, 0) end,
    'meilleure', coalesce(v_serie.meilleure, 0),
    'xp_total', coalesce((select sum(xp) from public.academy_entrainements where profile_id = v_uid), 0),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'version_id', e.version_id, 'slug', m.slug, 'titre', v.titre,
        'demarree_le', e.demarree_le, 'terminee_le', e.terminee_le, 'nb_bons', e.nb_bons, 'nb_total', e.nb_total, 'xp', e.xp) order by e.demarree_le desc)
      from (select * from public.academy_entrainements where profile_id = v_uid and terminee_le is not null order by demarree_le desc limit 100) e
      join public.academy_module_versions v on v.id = e.version_id join public.academy_modules m on m.id = v.module_id), '[]'::jsonb),
    'semaines', coalesce((select jsonb_agg(jsonb_build_object('semaine', s.semaine, 'xp', s.xp, 'sessions', s.n) order by s.semaine)
      from (select date_trunc('week', terminee_le at time zone 'Europe/Paris')::date as semaine, sum(xp) as xp, count(*) as n
              from public.academy_entrainements where profile_id = v_uid and terminee_le is not null and terminee_le >= now() - interval '12 weeks' group by 1) s), '[]'::jsonb),
    'items_faibles', coalesce((select jsonb_agg(jsonb_build_object('item_id', i.id, 'version_id', i.version_id, 'titre_module', v.titre, 'slug', m.slug,
        'competence', i.competence, 'enonce_court', left(coalesce(i.payload ->> 'enonce', i.payload ->> 'phrase', i.payload ->> 'recto', ''), 120),
        'force', f.force, 'prochaine_le', f.prochaine_le) order by f.force, f.prochaine_le)
      from (select * from public.academy_forces where profile_id = v_uid and force <= 2 order by force, prochaine_le limit 30) f
      join public.academy_items i on i.id = f.item_id join public.academy_module_versions v on v.id = i.version_id join public.academy_modules m on m.id = v.module_id
      where i.archive_le is null and v.statut = 'publie'), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.academy_mes_rappels()
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_uid uuid; v_auj date := public.academy_aujourdhui(); v_serie record; v_dus int; v_sess_auj int;
begin
  if auth.uid() is null or not public.is_staff() then return '[]'::jsonb; end if;
  v_uid := auth.uid();
  select * into v_serie from public.academy_series where profile_id = v_uid;
  v_dus := public.academy_items_dus(v_uid, null);
  select count(*) into v_sess_auj from public.academy_entrainements
   where profile_id = v_uid and terminee_le is not null and (terminee_le at time zone 'Europe/Paris')::date = v_auj;
  return coalesce((
    select jsonb_agg(x) from (
      select jsonb_build_object('type', 'items_dus', 'nombre', v_dus, 'echeance', v_auj, 'titres', (
               select coalesce(jsonb_agg(distinct v.titre), '[]'::jsonb) from public.academy_forces f join public.academy_items i on i.id = f.item_id
               join public.academy_module_versions v on v.id = i.version_id where f.profile_id = v_uid and f.prochaine_le <= now() and f.force < 5 and v.statut = 'publie'))
       where v_dus > 0
      union all
      select jsonb_build_object('type', 'serie_en_danger', 'nombre', v_serie.serie, 'echeance', v_auj, 'titres', '[]'::jsonb)
       where v_serie.dernier_jour = v_auj - 1 and v_sess_auj = 0 and coalesce(v_serie.serie, 0) >= 2
      union all
      select jsonb_build_object('type', 'affectations_en_retard', 'nombre', count(*), 'echeance', min(a.echeance),
               'titres', jsonb_agg(v.titre order by a.echeance))
        from public.academy_affectations a join public.academy_module_versions v on v.id = a.version_id
       where a.profile_id = v_uid and a.statut <> 'valide' and a.echeance is not null and a.echeance < v_auj
      having count(*) > 0
      union all
      select jsonb_build_object('type', 'echeances_proches', 'nombre', count(*), 'echeance', min(a.echeance),
               'titres', jsonb_agg(v.titre order by a.echeance))
        from public.academy_affectations a join public.academy_module_versions v on v.id = a.version_id
       where a.profile_id = v_uid and a.statut <> 'valide' and a.echeance is not null and a.echeance between v_auj and v_auj + 7
      having count(*) > 0
    ) x
  ), '[]'::jsonb);
end;
$function$;

