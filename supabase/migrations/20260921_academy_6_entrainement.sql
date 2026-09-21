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

drop policy if exists academy_items_select on public.academy_items;
create policy academy_items_select on public.academy_items
  for select to authenticated
  using ((select public.is_staff()) and exists (
    select 1 from public.academy_module_versions v
    where v.id = version_id and (v.statut = 'publie' or (select public.est_admin_academy()))));
drop policy if exists academy_items_write_admin on public.academy_items;
create policy academy_items_write_admin on public.academy_items
  for all to authenticated
  using ((select public.est_admin_academy())) with check ((select public.est_admin_academy()));

revoke all on public.academy_items_corriges from anon, authenticated;

drop policy if exists academy_forces_select on public.academy_forces;
create policy academy_forces_select on public.academy_forces
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.est_admin_academy()));
revoke insert, update, delete on public.academy_forces from authenticated;

drop policy if exists academy_entrainements_select on public.academy_entrainements;
create policy academy_entrainements_select on public.academy_entrainements
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.est_admin_academy()));
revoke insert, update, delete on public.academy_entrainements from authenticated;

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

-- ── 6. Une session d entrainement ──────────────────────────────────────────
create or replace function public.academy_presenter_entrainement(p_entrainement_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare e record;
begin
  select * into e from public.academy_entrainements where id = p_entrainement_id;
  return jsonb_build_object(
    'entrainement_id', e.id, 'version_id', e.version_id, 'demarree_le', e.demarree_le, 'terminee_le', e.terminee_le,
    'titre', (select titre from public.academy_module_versions where id = e.version_id),
    'slug', (select m.slug from public.academy_module_versions v join public.academy_modules m on m.id = v.module_id where v.id = e.version_id),
    'items', (select coalesce(jsonb_agg(public.academy_presenter_item((x.elem ->> 'item_id')::uuid, x.elem -> 'ordre') || jsonb_build_object('rang', x.pos) order by x.pos), '[]'::jsonb)
              from jsonb_array_elements(e.items) with ordinality x(elem, pos)),
    'reponses_deja', (select coalesce(jsonb_agg(jsonb_build_object('item_id', r.item_id, 'correcte', r.correcte)), '[]'::jsonb)
                      from public.academy_entrainement_reponses r where r.entrainement_id = e.id)
  );
end;
$function$;

create or replace function public.academy_demarrer_entrainement(p_version_id uuid, p_jeton uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := public.academy_exiger_staff();
  v_version record; v_prm record; v_n integer; v_items jsonb; v_id uuid; v_session uuid;
begin
  perform set_config('academy.serveur', 'on', true);
  select * into v_prm from public.academy_parametres where id = true;
  select * into v_version from public.academy_module_versions where id = p_version_id and (statut = 'publie' or public.est_admin_academy());
  if v_version is null then raise exception 'Module introuvable ou non publie' using errcode = 'P0002'; end if;

  -- Idempotence par jeton.
  select id into v_id from public.academy_entrainements where jeton_client = p_jeton and profile_id = v_uid;
  if v_id is not null then return public.academy_presenter_entrainement(v_id); end if;
  -- Une session ouverte recente est reprise plutot que doublee.
  select id into v_id from public.academy_entrainements
   where profile_id = v_uid and version_id = p_version_id and terminee_le is null and demarree_le > now() - interval '2 hours'
   order by demarree_le desc limit 1;
  if v_id is not null then return public.academy_presenter_entrainement(v_id); end if;

  v_n := coalesce(v_prm.questions_par_quiz, 12);
  -- Tirage : items dus d abord (force basse, echeance passee), puis jamais
  -- vus, puis les autres au hasard ; choix melanges.
  with candidats as (
    select i.id, i.type, i.payload,
           case when f.item_id is null then 1 when f.prochaine_le <= now() and f.force < 5 then 0 else 2 end as groupe,
           coalesce(f.force, 0) as force, random() as alea
      from public.academy_items i left join public.academy_forces f on f.item_id = i.id and f.profile_id = v_uid
     where i.version_id = p_version_id and i.archive_le is null
  ), tires as (
    select * from candidats order by groupe, force, alea limit v_n
  )
  select jsonb_agg(jsonb_build_object('item_id', t.id,
           'ordre', (select coalesce(jsonb_agg(k order by random()), '[]'::jsonb) from generate_series(0, greatest(
             case t.type when 'ordre' then jsonb_array_length(coalesce(t.payload -> 'elements', '[]'::jsonb))
                         when 'association' then jsonb_array_length(coalesce(t.payload -> 'droite', '[]'::jsonb))
                         when 'vrai_faux' then 0 when 'carte' then 0 when 'trou_saisie' then 0
                         else jsonb_array_length(coalesce(t.payload -> 'choix', '[]'::jsonb)) end, 1) - 1) k))
         order by random())
    into v_items from tires t;
  if v_items is null or jsonb_array_length(v_items) = 0 then
    raise exception 'Aucun exercice disponible pour ce deck' using errcode = 'P0002';
  end if;

  insert into public.academy_sessions (profile_id, lecon_id, version_id, jeton_client) values (v_uid, null, p_version_id, gen_random_uuid())
  returning id into v_session;
  insert into public.academy_entrainements (profile_id, version_id, session_id, jeton_client, items)
  values (v_uid, p_version_id, v_session, p_jeton, v_items)
  on conflict (jeton_client) do nothing;
  select id into v_id from public.academy_entrainements where jeton_client = p_jeton and profile_id = v_uid;
  update public.academy_sessions set entrainement_id = v_id where id = v_session;
  insert into public.academy_intervalles (session_id, profile_id, lecon_id, debut, fin) values (v_session, v_uid, null, now(), now());
  perform public.academy_recalculer_statut(v_uid, p_version_id);
  return public.academy_presenter_entrainement(v_id);
end;
$function$;

-- Corrige une reponse presentee contre le corrige, selon le type.
create or replace function public.academy_verifier_reponse(p_type text, p_payload jsonb, p_ordre jsonb, p_corrige jsonb, p_reponse jsonb)
returns jsonb language plpgsql immutable set search_path to 'public'
as $function$
declare
  v_ok boolean := false; v_bonne jsonb; v_orig int; v_idx int; v_pos int; v_txt text; v_n int; k int;
  v_attendu int[]; v_donne int[]; v_texts text[]; v_norm text;
begin
  if p_type in ('choix', 'trou_choix') then
    v_orig := (p_corrige ->> 'index')::int;
    select (o.pos - 1)::int into v_pos from jsonb_array_elements_text(p_ordre) with ordinality o(idx, pos) where o.idx::int = v_orig limit 1;
    v_bonne := to_jsonb(v_pos);
    begin v_idx := (p_reponse #>> '{}')::int; exception when others then v_idx := null; end;
    v_ok := v_idx is not null and v_idx = v_pos;
  elsif p_type = 'vrai_faux' then
    v_bonne := to_jsonb(coalesce((p_corrige ->> 'vrai')::boolean, false));
    begin v_ok := (p_reponse #>> '{}')::boolean = (v_bonne #>> '{}')::boolean; exception when others then v_ok := false; end;
  elsif p_type = 'multi' then
    -- indices originaux attendus -> presentes
    select coalesce(array_agg((o.pos - 1)::int order by o.pos), '{}') into v_attendu
      from jsonb_array_elements_text(p_ordre) with ordinality o(idx, pos)
     where o.idx::int in (select (x)::int from jsonb_array_elements_text(coalesce(p_corrige -> 'indices', '[]'::jsonb)) x);
    v_bonne := to_jsonb(v_attendu);
    begin select coalesce(array_agg((x)::int order by (x)::int), '{}') into v_donne from jsonb_array_elements_text(coalesce(p_reponse, '[]'::jsonb)) x;
    exception when others then v_donne := '{}'; end;
    v_ok := (select coalesce(array_agg(a order by a), '{}') from unnest(v_attendu) a) = (select coalesce(array_agg(a order by a), '{}') from unnest(v_donne) a)
            and array_length(v_attendu, 1) is not null;
  elsif p_type = 'ordre' then
    -- corrige.ordre = indices originaux dans le bon ordre ; le client rend des indices presentes
    select coalesce(array_agg(q.pres order by o.pos), '{}') into v_attendu
      from jsonb_array_elements_text(coalesce(p_corrige -> 'ordre', '[]'::jsonb)) with ordinality o(x, pos)
      join lateral (select (q2.pos - 1)::int as pres from jsonb_array_elements_text(p_ordre) with ordinality q2(idx, pos) where q2.idx::int = o.x::int limit 1) q on true;
    v_bonne := to_jsonb(v_attendu);
    begin select coalesce(array_agg((x)::int order by o.pos), '{}') into v_donne from jsonb_array_elements_text(coalesce(p_reponse, '[]'::jsonb)) with ordinality o(x, pos);
    exception when others then v_donne := '{}'; end;
    v_ok := v_attendu = v_donne and array_length(v_attendu, 1) is not null;
  elsif p_type = 'association' then
    -- corrige.paires = [[gauche, droite originale]] ; reponse = [[gauche, droite presentee]]
    select coalesce(jsonb_agg(jsonb_build_array((p -> 0)::int, (select (q.pos - 1)::int from jsonb_array_elements_text(p_ordre) with ordinality q(idx, pos) where q.idx::int = (p -> 1)::int limit 1)) order by (p -> 0)::int), '[]'::jsonb)
      into v_bonne from jsonb_array_elements(coalesce(p_corrige -> 'paires', '[]'::jsonb)) p;
    begin
      v_ok := (select coalesce(jsonb_agg(jsonb_build_array((p -> 0)::int, (p -> 1)::int) order by (p -> 0)::int), '[]'::jsonb) from jsonb_array_elements(coalesce(p_reponse, '[]'::jsonb)) p) = v_bonne
              and jsonb_array_length(v_bonne) > 0;
    exception when others then v_ok := false; end;
  elsif p_type = 'trou_saisie' then
    select coalesce(array_agg(public.academy_normaliser(x)), '{}') into v_texts from jsonb_array_elements_text(coalesce(p_corrige -> 'reponses', '[]'::jsonb)) x;
    v_bonne := coalesce(p_corrige -> 'reponses', '[]'::jsonb);
    v_norm := public.academy_normaliser(p_reponse #>> '{}');
    v_ok := v_norm <> '' and v_norm = any (v_texts);
  elsif p_type = 'carte' then
    v_bonne := '{}'::jsonb;
    begin v_ok := coalesce((p_reponse ->> 'su')::boolean, false); exception when others then v_ok := false; end;
  end if;
  return jsonb_build_object('correcte', v_ok, 'bonne_reponse', v_bonne);
end;
$function$;

create or replace function public.academy_repondre(p_entrainement_id uuid, p_item_id uuid, p_reponse jsonb)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := public.academy_exiger_staff();
  e record; i record; c record; v_ordre jsonb; v_rang int; v_res jsonb; v_ok boolean; v_force int; v_deja record; v_dernier record; v_now timestamptz := now();
begin
  perform set_config('academy.serveur', 'on', true);
  select * into e from public.academy_entrainements where id = p_entrainement_id and profile_id = v_uid for update;
  if e is null then raise exception 'Session introuvable' using errcode = 'P0002'; end if;
  if e.terminee_le is not null then raise exception 'Session terminee' using errcode = 'P0001'; end if;
  select x.elem -> 'ordre', x.pos into v_ordre, v_rang from jsonb_array_elements(e.items) with ordinality x(elem, pos) where (x.elem ->> 'item_id')::uuid = p_item_id limit 1;
  if v_ordre is null then raise exception 'Cet item ne fait pas partie de la session' using errcode = 'P0002'; end if;
  select * into i from public.academy_items where id = p_item_id;
  select * into c from public.academy_items_corriges where item_id = p_item_id;

  -- Idempotence : une reponse deja enregistree est rendue telle quelle.
  select * into v_deja from public.academy_entrainement_reponses where entrainement_id = e.id and item_id = p_item_id;
  if v_deja is not null then
    v_res := public.academy_verifier_reponse(i.type, i.payload, v_ordre, coalesce(c.corrige, '{}'::jsonb), v_deja.reponse);
    return jsonb_build_object('correcte', v_deja.correcte, 'bonne_reponse', v_res -> 'bonne_reponse', 'explication', coalesce(c.explication, ''),
                              'force', (select force from public.academy_forces where profile_id = v_uid and item_id = p_item_id), 'deja', true);
  end if;

  v_res := public.academy_verifier_reponse(i.type, i.payload, v_ordre, coalesce(c.corrige, '{}'::jsonb), p_reponse);
  v_ok := (v_res ->> 'correcte')::boolean;
  insert into public.academy_entrainement_reponses (entrainement_id, item_id, rang, reponse, correcte)
  values (e.id, p_item_id, v_rang, p_reponse, v_ok) on conflict (entrainement_id, item_id) do nothing;

  -- Repetition espacee.
  insert into public.academy_forces (profile_id, item_id, force, prochaine_le, reussites, echecs, derniere_le)
  values (v_uid, p_item_id, case when v_ok then 1 else 0 end, v_now + public.academy_delai_force(case when v_ok then 1 else 0 end),
          case when v_ok then 1 else 0 end, case when v_ok then 0 else 1 end, v_now)
  on conflict (profile_id, item_id) do update set
    force = case when v_ok then least(5, public.academy_forces.force + 1) else least(public.academy_forces.force, 1) end,
    prochaine_le = v_now + public.academy_delai_force(case when v_ok then least(5, public.academy_forces.force + 1) else least(public.academy_forces.force, 1) end),
    reussites = public.academy_forces.reussites + case when v_ok then 1 else 0 end,
    echecs = public.academy_forces.echecs + case when v_ok then 0 else 1 end,
    derniere_le = v_now
  returning force into v_force;

  -- Chaque reponse vaut un battement d activite.
  if e.session_id is not null then
    select id, fin into v_dernier from public.academy_intervalles where session_id = e.session_id order by fin desc limit 1;
    if v_dernier.id is not null and v_dernier.fin >= v_now - interval '90 seconds' then
      update public.academy_intervalles set fin = v_now where id = v_dernier.id;
    else
      insert into public.academy_intervalles (session_id, profile_id, lecon_id, debut, fin) values (e.session_id, v_uid, null, v_now, v_now);
    end if;
    update public.academy_sessions set dernier_battement_le = v_now where id = e.session_id;
  end if;

  return jsonb_build_object('correcte', v_ok, 'bonne_reponse', v_res -> 'bonne_reponse', 'explication', coalesce(c.explication, ''), 'force', v_force, 'deja', false);
end;
$function$;

create or replace function public.academy_terminer_entrainement(p_entrainement_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := public.academy_exiger_staff();
  e record; v_auj date := public.academy_aujourdhui();
  v_bons int; v_total int; v_cartes int; v_xp int; v_premiere boolean; v_serie record; v_serie_val int; v_meilleure int;
  v_avant int; v_apres int; v_valide boolean := false; v_numero text; v_attestation jsonb; v_statut text; v_erreurs jsonb; v_resume jsonb;
begin
  perform set_config('academy.serveur', 'on', true);
  select * into e from public.academy_entrainements where id = p_entrainement_id and profile_id = v_uid for update;
  if e is null then raise exception 'Session introuvable' using errcode = 'P0002'; end if;
  if e.terminee_le is not null then return e.resume; end if;

  select count(*) filter (where r.correcte), count(*), count(*) filter (where r.correcte and i.type = 'carte')
    into v_bons, v_total, v_cartes
    from public.academy_entrainement_reponses r join public.academy_items i on i.id = r.item_id where r.entrainement_id = e.id;
  if v_total = 0 then raise exception 'Aucune reponse dans cette session' using errcode = 'P0001'; end if;

  select not exists (select 1 from public.academy_entrainements x where x.profile_id = v_uid and x.terminee_le is not null and (x.terminee_le at time zone 'Europe/Paris')::date = v_auj)
    into v_premiere;
  v_xp := (v_bons - v_cartes) * 10 + v_cartes * 5
        + case when v_bons = jsonb_array_length(e.items) and v_total = jsonb_array_length(e.items) then 20 else 0 end
        + case when v_premiere then 10 else 0 end;

  v_avant := coalesce((select couronnes from public.academy_maitrise where profile_id = v_uid and version_id = e.version_id), 0);

  -- Serie de jours.
  select * into v_serie from public.academy_series where profile_id = v_uid;
  if v_serie is null then
    insert into public.academy_series (profile_id, serie, meilleure, dernier_jour) values (v_uid, 1, 1, v_auj);
    v_serie_val := 1; v_meilleure := 1;
  elsif v_serie.dernier_jour = v_auj then
    v_serie_val := v_serie.serie; v_meilleure := v_serie.meilleure;
  else
    v_serie_val := case when v_serie.dernier_jour = v_auj - 1 then v_serie.serie + 1 else 1 end;
    v_meilleure := greatest(v_serie.meilleure, v_serie_val);
    update public.academy_series set serie = v_serie_val, meilleure = v_meilleure, dernier_jour = v_auj, updated_at = now() where profile_id = v_uid;
  end if;

  v_apres := public.academy_couronnes(v_uid, e.version_id);
  insert into public.academy_maitrise (profile_id, version_id, couronnes, xp, sessions, derniere_session)
  values (v_uid, e.version_id, v_apres, v_xp, 1, now())
  on conflict (profile_id, version_id) do update set couronnes = v_apres, xp = public.academy_maitrise.xp + v_xp,
    sessions = public.academy_maitrise.sessions + 1, derniere_session = now(), updated_at = now();

  -- Validation a trois couronnes : attestation interne, une fois.
  if v_apres >= 3 and not exists (select 1 from public.academy_validations where profile_id = v_uid and version_id = e.version_id) then
    insert into public.academy_validations (profile_id, version_id, tentative_id) values (v_uid, e.version_id, null)
    on conflict (profile_id, version_id) do nothing;
    v_valide := true;
    select 'EA-' || to_char(now(), 'YYYY') || '-' || lpad((count(*) + 1)::text, 4, '0') into v_numero
      from public.academy_attestations where delivree_le >= date_trunc('year', now());
    insert into public.academy_attestations (numero, profile_id, version_id, tentative_id, score, total)
    values (v_numero, v_uid, e.version_id, null, v_apres, 5)
    on conflict (profile_id, version_id) do nothing;
    perform public.academy_evenement(v_uid, 'module_valide', e.version_id, jsonb_build_object('entrainement_id', e.id, 'couronnes', v_apres));
  end if;
  select jsonb_build_object('numero', numero, 'delivree_le', delivree_le) into v_attestation
    from public.academy_attestations where profile_id = v_uid and version_id = e.version_id;

  select coalesce(jsonb_agg(jsonb_build_object('item_id', i.id, 'competence', i.competence,
           'enonce_court', left(coalesce(i.payload ->> 'enonce', i.payload ->> 'phrase', i.payload ->> 'recto', ''), 120)) order by r.rang), '[]'::jsonb)
    into v_erreurs from public.academy_entrainement_reponses r join public.academy_items i on i.id = r.item_id
   where r.entrainement_id = e.id and not r.correcte;

  v_statut := public.academy_recalculer_statut(v_uid, e.version_id);
  v_resume := jsonb_build_object(
    'entrainement_id', e.id, 'version_id', e.version_id, 'nb_bons', v_bons, 'nb_total', v_total, 'xp', v_xp,
    'premiere_du_jour', v_premiere, 'serie', v_serie_val, 'meilleure_serie', v_meilleure,
    'couronnes_avant', v_avant, 'couronnes_apres', v_apres, 'valide', v_valide, 'attestation', v_attestation,
    'erreurs', v_erreurs, 'statut_module', v_statut, 'terminee_le', now(),
    'xp_total_version', (select xp from public.academy_maitrise where profile_id = v_uid and version_id = e.version_id)
  );
  update public.academy_entrainements set terminee_le = now(), nb_bons = v_bons, nb_total = v_total, xp = v_xp, resume = v_resume where id = e.id;
  perform public.academy_evenement(v_uid, 'session_terminee', e.version_id, jsonb_build_object('entrainement_id', e.id, 'bons', v_bons, 'total', v_total, 'xp', v_xp, 'couronnes', v_apres));
  return v_resume;
end;
$function$;

create or replace function public.academy_objectif_quotidien(p_objectif integer)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_staff();
begin
  insert into public.academy_series (profile_id, objectif_quotidien) values (v_uid, greatest(1, least(10, coalesce(p_objectif, 1))))
  on conflict (profile_id) do update set objectif_quotidien = greatest(1, least(10, coalesce(p_objectif, 1))), updated_at = now();
end;
$function$;

-- ── 7. Administration : items, memo, versions ──────────────────────────────
create or replace function public.academy_nouvelle_version(p_module_id uuid)
returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := public.academy_exiger_admin();
  src record; v_new uuid; v_numero integer; it record; v_new_item uuid;
begin
  if exists (select 1 from public.academy_module_versions where module_id = p_module_id and statut = 'brouillon') then
    select id into v_new from public.academy_module_versions where module_id = p_module_id and statut = 'brouillon' order by numero desc limit 1;
    return v_new;
  end if;
  select * into src from public.academy_module_versions where module_id = p_module_id order by (statut = 'publie') desc, numero desc limit 1;
  if src is null then raise exception 'Module sans version' using errcode = 'P0002'; end if;
  select coalesce(max(numero), 0) + 1 into v_numero from public.academy_module_versions where module_id = p_module_id;
  insert into public.academy_module_versions (module_id, numero, statut, titre, objectif, competence, duree_minutes, prerequis, seuil_reussite, cas_pratique, a_completer, sources, fictif, memo_md, created_by)
  values (p_module_id, v_numero, 'brouillon', src.titre, src.objectif, src.competence, src.duree_minutes, src.prerequis, src.seuil_reussite, src.cas_pratique, src.a_completer, src.sources, src.fictif, src.memo_md, v_uid)
  returning id into v_new;
  -- L alias ne porte pas le nom d une variable de boucle (lecon de la migration 2).
  for it in select ai.*, c.corrige, c.explication from public.academy_items ai left join public.academy_items_corriges c on c.item_id = ai.id where ai.version_id = src.id order by ai.ordre loop
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload, archive_le)
    values (v_new, it.ordre, it.type, it.competence, it.difficulte, it.payload, it.archive_le)
    returning id into v_new_item;
    insert into public.academy_items_corriges (item_id, corrige, explication) values (v_new_item, coalesce(it.corrige, '{}'::jsonb), coalesce(it.explication, ''));
  end loop;
  perform public.academy_journaliser('nouvelle_version', v_new::text, jsonb_build_object('module_id', p_module_id, 'numero', v_numero, 'source', src.id));
  return v_new;
end;
$function$;

create or replace function public.academy_enregistrer_item(p_version_id uuid, p_item_id uuid, p_patch jsonb)
returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_admin(); v_id uuid; v_statut text; v_type text;
begin
  select statut into v_statut from public.academy_module_versions where id = p_version_id;
  if v_statut is distinct from 'brouillon' then raise exception 'Seul un brouillon se modifie' using errcode = 'check_violation'; end if;
  v_type := p_patch ->> 'type';
  if p_item_id is null then
    if v_type is null or v_type not in ('choix', 'vrai_faux', 'multi', 'ordre', 'association', 'trou_choix', 'trou_saisie', 'carte') then
      raise exception 'Type d exercice inconnu' using errcode = 'P0001';
    end if;
    insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
    values (p_version_id, coalesce((p_patch ->> 'ordre')::int, (select coalesce(max(ordre), 0) + 1 from public.academy_items where version_id = p_version_id)),
            v_type, coalesce(p_patch ->> 'competence', ''), coalesce((p_patch ->> 'difficulte')::smallint, 2), coalesce(p_patch -> 'payload', '{}'::jsonb))
    returning id into v_id;
    insert into public.academy_items_corriges (item_id, corrige, explication)
    values (v_id, coalesce(p_patch -> 'corrige', '{}'::jsonb), coalesce(p_patch ->> 'explication', ''));
  else
    update public.academy_items set
      type = coalesce(v_type, type), competence = coalesce(p_patch ->> 'competence', competence),
      difficulte = coalesce((p_patch ->> 'difficulte')::smallint, difficulte),
      payload = coalesce(p_patch -> 'payload', payload), ordre = coalesce((p_patch ->> 'ordre')::int, ordre),
      archive_le = case when p_patch ? 'archive' then (case when (p_patch ->> 'archive')::boolean then now() else null end) else archive_le end,
      updated_at = now()
    where id = p_item_id and version_id = p_version_id;
    if not found then raise exception 'Exercice introuvable' using errcode = 'P0002'; end if;
    insert into public.academy_items_corriges (item_id, corrige, explication)
    values (p_item_id, coalesce(p_patch -> 'corrige', '{}'::jsonb), coalesce(p_patch ->> 'explication', ''))
    on conflict (item_id) do update set
      corrige = coalesce(p_patch -> 'corrige', public.academy_items_corriges.corrige),
      explication = coalesce(p_patch ->> 'explication', public.academy_items_corriges.explication),
      updated_at = now();
    v_id := p_item_id;
  end if;
  perform public.academy_journaliser('item', v_id::text, jsonb_build_object('version_id', p_version_id, 'type', coalesce(v_type, '')));
  return v_id;
end;
$function$;

create or replace function public.academy_version_admin(p_version_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_admin(); v jsonb;
begin
  select jsonb_build_object(
    'id', mv.id, 'module_id', mv.module_id, 'slug', m.slug, 'theme', m.theme, 'niveau', m.niveau, 'ordre', m.ordre,
    'numero', mv.numero, 'statut', mv.statut, 'titre', mv.titre, 'objectif', mv.objectif, 'competence', mv.competence,
    'duree_minutes', mv.duree_minutes, 'prerequis', mv.prerequis, 'seuil_reussite', mv.seuil_reussite,
    'memo_md', mv.memo_md, 'sources', mv.sources, 'a_completer', mv.a_completer, 'fictif', mv.fictif,
    'publie_le', mv.publie_le, 'relu_par', mv.relu_par, 'relu_le', mv.relu_le, 'commentaire_relecture', mv.commentaire_relecture, 'archive_le', mv.archive_le,
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'ordre', i.ordre, 'type', i.type, 'competence', i.competence, 'difficulte', i.difficulte,
        'payload', i.payload, 'corrige', c.corrige, 'explication', c.explication, 'archive_le', i.archive_le,
        'statistiques', (select jsonb_build_object('reponses', count(*), 'correctes', count(*) filter (where r.correcte)) from public.academy_entrainement_reponses r where r.item_id = i.id)) order by i.ordre, i.created_at)
        from public.academy_items i left join public.academy_items_corriges c on c.item_id = i.id where i.version_id = mv.id), '[]'::jsonb),
    'affectations', (select count(*) from public.academy_affectations a where a.version_id = mv.id),
    'validations', (select count(*) from public.academy_validations x where x.version_id = mv.id)
  ) into v
  from public.academy_module_versions mv join public.academy_modules m on m.id = mv.module_id where mv.id = p_version_id;
  if v is null then raise exception 'Version introuvable' using errcode = 'P0002'; end if;
  return v;
end;
$function$;

create or replace function public.academy_enregistrer_version(p_version_id uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_admin();
begin
  update public.academy_module_versions set
    titre = coalesce(p_patch ->> 'titre', titre), objectif = coalesce(p_patch ->> 'objectif', objectif),
    competence = coalesce(p_patch ->> 'competence', competence), duree_minutes = coalesce((p_patch ->> 'duree_minutes')::int, duree_minutes),
    prerequis = coalesce(p_patch -> 'prerequis', prerequis), seuil_reussite = coalesce((p_patch ->> 'seuil_reussite')::numeric, seuil_reussite),
    cas_pratique = coalesce(p_patch -> 'cas_pratique', cas_pratique), a_completer = coalesce(p_patch -> 'a_completer', a_completer),
    sources = coalesce(p_patch -> 'sources', sources), fictif = coalesce((p_patch ->> 'fictif')::boolean, fictif),
    memo_md = coalesce(p_patch ->> 'memo_md', memo_md), updated_at = now()
  where id = p_version_id and statut = 'brouillon';
  if not found then raise exception 'Seul un brouillon se modifie' using errcode = 'check_violation'; end if;
  if p_patch ? 'theme' or p_patch ? 'niveau' or p_patch ? 'ordre' then
    update public.academy_modules m set theme = coalesce(p_patch ->> 'theme', theme), niveau = coalesce(p_patch ->> 'niveau', niveau), ordre = coalesce((p_patch ->> 'ordre')::int, ordre), updated_at = now()
    where m.id = (select module_id from public.academy_module_versions where id = p_version_id);
  end if;
end;
$function$;

create or replace function public.academy_publier_version(p_version_id uuid, p_relu_par text, p_commentaire text default null, p_imposer_nouvelle_formation boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := public.academy_exiger_admin();
  v record; v_prm record; v_nb_items int; v_nb_sans_corrige int; v_ancienne uuid; v_nouvelles int := 0; a record;
begin
  select * into v from public.academy_module_versions where id = p_version_id for update;
  if v is null then raise exception 'Version introuvable' using errcode = 'P0002'; end if;
  if v.statut <> 'brouillon' then raise exception 'Seul un brouillon se publie' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_relu_par), '') = '' then raise exception 'Le nom du relecteur est obligatoire' using errcode = 'P0001'; end if;
  select * into v_prm from public.academy_parametres where id = true;
  select count(*) into v_nb_items from public.academy_items where version_id = p_version_id and archive_le is null;
  select count(*) into v_nb_sans_corrige from public.academy_items i where i.version_id = p_version_id and i.archive_le is null
     and i.type <> 'carte' and not exists (select 1 from public.academy_items_corriges c where c.item_id = i.id and c.corrige <> '{}'::jsonb);
  if v_nb_items < coalesce(v_prm.questions_par_quiz, 12) then raise exception 'Il faut au moins % exercices pour une session de %', v_prm.questions_par_quiz, v_prm.questions_par_quiz using errcode = 'P0001'; end if;
  if v_nb_sans_corrige > 0 then raise exception '% exercice(s) sans corrige', v_nb_sans_corrige using errcode = 'P0001'; end if;

  select id into v_ancienne from public.academy_module_versions where module_id = v.module_id and statut = 'publie' and id <> p_version_id;
  update public.academy_module_versions
     set statut = 'publie', publie_le = now(), publie_par = v_uid, relu_par = btrim(p_relu_par), relu_le = now(), commentaire_relecture = p_commentaire, updated_at = now()
   where id = p_version_id;
  if v_ancienne is not null then
    update public.academy_module_versions set statut = 'archive', archive_le = now(), updated_at = now() where id = v_ancienne;
    perform public.academy_evenement(null, 'version_archivee', v_ancienne, jsonb_build_object('remplacee_par', p_version_id));
    if p_imposer_nouvelle_formation then
      for a in select distinct profile_id, obligatoire, parcours_id from public.academy_affectations where version_id = v_ancienne loop
        insert into public.academy_affectations (profile_id, module_id, version_id, parcours_id, obligatoire, echeance, affecte_par)
        values (a.profile_id, v.module_id, p_version_id, a.parcours_id, a.obligatoire, public.academy_aujourdhui() + 30, v_uid)
        on conflict (profile_id, version_id) do nothing;
        if found then
          v_nouvelles := v_nouvelles + 1;
          perform public.academy_evenement(a.profile_id, 'affectation_creee', p_version_id, jsonb_build_object('motif', 'nouvelle_version', 'ancienne_version', v_ancienne));
        end if;
      end loop;
    end if;
  end if;
  perform public.academy_evenement(null, 'version_publiee', p_version_id, jsonb_build_object('relu_par', btrim(p_relu_par), 'numero', v.numero));
  perform public.academy_journaliser('publier', p_version_id::text, jsonb_build_object('relu_par', btrim(p_relu_par), 'ancienne', v_ancienne, 'nouvelles_affectations', v_nouvelles));
  return jsonb_build_object('version_id', p_version_id, 'ancienne_version', v_ancienne, 'nouvelles_affectations', v_nouvelles);
end;
$function$;

create or replace function public.academy_admin_vue()
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_admin();
begin
  return jsonb_build_object(
    'modules', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'slug', m.slug, 'titre', m.titre, 'theme', m.theme, 'niveau', m.niveau, 'ordre', m.ordre, 'archive_le', m.archive_le,
        'versions', (select jsonb_agg(jsonb_build_object('id', v.id, 'numero', v.numero, 'statut', v.statut, 'titre', v.titre, 'publie_le', v.publie_le, 'relu_par', v.relu_par, 'updated_at', v.updated_at,
                        'nb_items', (select count(*) from public.academy_items i where i.version_id = v.id and i.archive_le is null),
                        'memo', (v.memo_md <> ''),
                        'affectations', (select count(*) from public.academy_affectations a where a.version_id = v.id),
                        'validations', (select count(*) from public.academy_validations x where x.version_id = v.id)) order by v.numero desc)
                     from public.academy_module_versions v where v.module_id = m.id)
      ) order by m.ordre, m.slug) from public.academy_modules m), '[]'::jsonb),
    'parcours', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'slug', p.slug, 'titre', p.titre, 'description', p.description, 'ordre', p.ordre, 'archive_le', p.archive_le,
        'modules', (select jsonb_agg(jsonb_build_object('module_id', pm.module_id, 'ordre', pm.ordre, 'obligatoire', pm.obligatoire, 'delai_jours', pm.delai_jours, 'titre', m.titre, 'slug', m.slug) order by pm.ordre)
                    from public.academy_parcours_modules pm join public.academy_modules m on m.id = pm.module_id where pm.parcours_id = p.id)
      ) order by p.ordre) from public.academy_parcours p), '[]'::jsonb),
    'collaborateurs', coalesce((select jsonb_agg(jsonb_build_object('id', pr.id, 'full_name', pr.full_name, 'advisor_code', pr.advisor_code, 'role', pr.role) order by pr.full_name)
      from public.profiles pr where pr.is_active = true), '[]'::jsonb),
    'affectations', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'profile_id', a.profile_id, 'nom', pr.full_name, 'module_id', a.module_id, 'version_id', a.version_id, 'titre', v.titre, 'slug', m.slug,
        'parcours_id', a.parcours_id, 'obligatoire', a.obligatoire, 'echeance', a.echeance, 'statut', a.statut, 'created_at', a.created_at,
        'couronnes', public.academy_couronnes(a.profile_id, a.version_id)) order by a.created_at desc)
      from public.academy_affectations a join public.profiles pr on pr.id = a.profile_id join public.academy_module_versions v on v.id = a.version_id join public.academy_modules m on m.id = a.module_id), '[]'::jsonb),
    'journal', coalesce((select jsonb_agg(jsonb_build_object('id', j.id, 'survenu_le', j.survenu_le, 'nom', pr.full_name, 'action', j.action, 'cible', j.cible, 'detail', j.detail) order by j.survenu_le desc)
      from (select * from public.academy_journal_admin order by survenu_le desc limit 200) j left join public.profiles pr on pr.id = j.profile_id), '[]'::jsonb),
    'parametres', (select to_jsonb(p) - 'notice_donnees' from public.academy_parametres p where id = true)
  );
end;
$function$;

-- ── 8. Pilotage, fiche, matrice ────────────────────────────────────────────
create or replace function public.academy_pilotage(p_depuis date default null, p_jusqua date default null)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := public.academy_exiger_direction();
  v_auj date := public.academy_aujourdhui();
  v_depuis timestamptz; v_jusqua timestamptz; v_prm record;
begin
  select * into v_prm from public.academy_parametres where id = true;
  v_depuis := case when p_depuis is null then null else (p_depuis::timestamp at time zone 'Europe/Paris') end;
  v_jusqua := case when p_jusqua is null then null else ((p_jusqua + 1)::timestamp at time zone 'Europe/Paris') end;
  return jsonb_build_object(
    'fuseau', 'Europe/Paris', 'aujourdhui', v_auj, 'depuis', p_depuis, 'jusqua', p_jusqua,
    'indicateurs', jsonb_build_object(
        'actifs_periode', (select count(distinct e.profile_id) from public.academy_entrainements e where e.terminee_le is not null
                            and (v_depuis is null or e.terminee_le >= v_depuis) and (v_jusqua is null or e.terminee_le < v_jusqua)
                            and e.profile_id in (select profile_id from public.academy_affectations)),
        'affectes', (select count(distinct profile_id) from public.academy_affectations),
        'obligatoires_validees', (select count(*) from public.academy_affectations where obligatoire and statut = 'valide'),
        'obligatoires_total', (select count(*) from public.academy_affectations where obligatoire),
        'echues_non_validees', (select count(*) from public.academy_affectations where echeance is not null and echeance < v_auj and statut <> 'valide'),
        'echues_total', (select count(*) from public.academy_affectations where echeance is not null and echeance < v_auj),
        'sessions_periode', (select count(*) from public.academy_entrainements e where e.terminee_le is not null and (v_depuis is null or e.terminee_le >= v_depuis) and (v_jusqua is null or e.terminee_le < v_jusqua)),
        'serie_moyenne', (select round(avg(case when s.dernier_jour >= v_auj - 1 then s.serie else 0 end), 1) from public.academy_series s where s.profile_id in (select profile_id from public.academy_affectations)),
        'items_dus', (select count(*) from public.academy_forces f join public.academy_items i on i.id = f.item_id join public.academy_module_versions v on v.id = i.version_id
                       where f.prochaine_le <= now() and f.force < 5 and i.archive_le is null and v.statut = 'publie'),
        'temps_actif_s', (select coalesce(sum(public.academy_duree_active(pr.id, v_depuis, v_jusqua)), 0) from public.profiles pr where pr.id in (select profile_id from public.academy_affectations))
    ),
    'lignes', coalesce((select jsonb_agg(jsonb_build_object(
        'profile_id', pr.id, 'nom', pr.full_name, 'advisor_code', pr.advisor_code, 'is_active', pr.is_active,
        'parcours', (select coalesce(jsonb_agg(distinct pa.titre), '[]'::jsonb) from public.academy_affectations a join public.academy_parcours pa on pa.id = a.parcours_id where a.profile_id = pr.id),
        'decks', (select coalesce(jsonb_agg(jsonb_build_object('version_id', a.version_id, 'titre', v.titre, 'couronnes', public.academy_couronnes(pr.id, a.version_id), 'statut', a.statut) order by v.titre), '[]'::jsonb)
                  from public.academy_affectations a join public.academy_module_versions v on v.id = a.version_id where a.profile_id = pr.id),
        'modules_affectes', (select count(*) from public.academy_affectations a where a.profile_id = pr.id),
        'modules_valides', (select count(*) from public.academy_affectations a where a.profile_id = pr.id and a.statut = 'valide'),
        'modules_en_cours', (select count(*) from public.academy_affectations a where a.profile_id = pr.id and a.statut = 'en_cours'),
        'modules_a_revoir', (select count(*) from public.academy_affectations a where a.profile_id = pr.id and a.statut = 'a_revoir'),
        'modules_non_commences', (select count(*) from public.academy_affectations a where a.profile_id = pr.id and a.statut = 'non_commence'),
        'retards', (select count(*) from public.academy_affectations a where a.profile_id = pr.id and a.echeance is not null and a.echeance < v_auj and a.statut <> 'valide'),
        'serie', (select case when s.dernier_jour >= v_auj - 1 then s.serie else 0 end from public.academy_series s where s.profile_id = pr.id),
        'xp_7j', (select coalesce(sum(xp), 0) from public.academy_entrainements e where e.profile_id = pr.id and e.terminee_le >= now() - interval '7 days'),
        'xp_periode', (select coalesce(sum(xp), 0) from public.academy_entrainements e where e.profile_id = pr.id and e.terminee_le is not null and (v_depuis is null or e.terminee_le >= v_depuis) and (v_jusqua is null or e.terminee_le < v_jusqua)),
        'sessions_periode', (select count(*) from public.academy_entrainements e where e.profile_id = pr.id and e.terminee_le is not null and (v_depuis is null or e.terminee_le >= v_depuis) and (v_jusqua is null or e.terminee_le < v_jusqua)),
        'derniere_session', (select max(terminee_le) from public.academy_entrainements e where e.profile_id = pr.id),
        'derniere_activite', (select max(terminee_le) from public.academy_entrainements e where e.profile_id = pr.id),
        'temps_actif_s', public.academy_duree_active(pr.id, v_depuis, v_jusqua),
        'items_dus', public.academy_items_dus(pr.id, null),
        'premier_score', (select jsonb_build_object('score', e.nb_bons, 'total', e.nb_total, 'titre', v.titre, 'le', e.terminee_le) from public.academy_entrainements e join public.academy_module_versions v on v.id = e.version_id
                          where e.profile_id = pr.id and e.terminee_le is not null and (v_depuis is null or e.terminee_le >= v_depuis) and (v_jusqua is null or e.terminee_le < v_jusqua) order by e.terminee_le asc limit 1),
        'dernier_score', (select jsonb_build_object('score', e.nb_bons, 'total', e.nb_total, 'titre', v.titre, 'le', e.terminee_le, 'type', 'session') from public.academy_entrainements e join public.academy_module_versions v on v.id = e.version_id
                          where e.profile_id = pr.id and e.terminee_le is not null and (v_depuis is null or e.terminee_le >= v_depuis) and (v_jusqua is null or e.terminee_le < v_jusqua) order by e.terminee_le desc limit 1),
        'a_examiner', (select coalesce(jsonb_agg(x.fait), '[]'::jsonb) from (
            select 'Session de ' || e.nb_total || ' exercices terminee en ' || extract(epoch from (e.terminee_le - e.demarree_le))::int || ' s (' || v.titre || ')' as fait
              from public.academy_entrainements e join public.academy_module_versions v on v.id = e.version_id
             where e.profile_id = pr.id and e.terminee_le is not null and e.nb_total >= 8 and e.terminee_le - e.demarree_le < interval '40 seconds'
            union all
            select count(*) || ' sessions sous 50 % sur ' || v.titre
              from public.academy_entrainements e join public.academy_module_versions v on v.id = e.version_id
             where e.profile_id = pr.id and e.terminee_le is not null and e.nb_total > 0 and e.nb_bons * 2 < e.nb_total
             group by v.titre having count(*) >= 3) x)
      ) order by pr.full_name)
      from public.profiles pr
      where pr.is_active = true and (pr.id in (select profile_id from public.academy_affectations) or pr.id in (select profile_id from public.academy_entrainements))), '[]'::jsonb),
    'notions', coalesce((select jsonb_agg(jsonb_build_object('competence', x.competence, 'reponses', x.reponses, 'correctes', x.correctes, 'effectif', x.effectif, 'derniere_le', x.derniere_le) order by (x.correctes::numeric / greatest(x.reponses, 1)))
      from (select i.competence, count(*) as reponses, count(*) filter (where r.correcte) as correctes, count(distinct e.profile_id) as effectif, max(r.repondu_le) as derniere_le
              from public.academy_entrainement_reponses r join public.academy_items i on i.id = r.item_id join public.academy_entrainements e on e.id = r.entrainement_id
             where i.competence <> '' and (v_depuis is null or r.repondu_le >= v_depuis) and (v_jusqua is null or r.repondu_le < v_jusqua)
             group by i.competence having count(*) >= 3) x), '[]'::jsonb),
    'semaines', coalesce((select jsonb_agg(jsonb_build_object('semaine', s.semaine, 'sessions', s.sessions, 'xp', s.xp, 'valides', s.valides, 'affectations', s.affectations, 'temps_actif_s', s.temps) order by s.semaine)
      from (select w.semaine,
              (select count(*) from public.academy_entrainements e where e.terminee_le is not null and date_trunc('week', e.terminee_le at time zone 'Europe/Paris')::date = w.semaine) as sessions,
              (select coalesce(sum(xp), 0) from public.academy_entrainements e where e.terminee_le is not null and date_trunc('week', e.terminee_le at time zone 'Europe/Paris')::date = w.semaine) as xp,
              (select count(*) from public.academy_validations x where date_trunc('week', x.valide_le at time zone 'Europe/Paris')::date = w.semaine) as valides,
              (select count(*) from public.academy_affectations a where date_trunc('week', a.created_at at time zone 'Europe/Paris')::date = w.semaine) as affectations,
              (select coalesce(sum(extract(epoch from (i.fin - i.debut))), 0)::int from public.academy_intervalles i where date_trunc('week', i.debut at time zone 'Europe/Paris')::date = w.semaine) as temps
            from (select distinct date_trunc('week', d at time zone 'Europe/Paris')::date as semaine from (
                    select terminee_le d from public.academy_entrainements where terminee_le is not null union all select created_at from public.academy_affectations union all select debut from public.academy_intervalles) z
                  where (v_depuis is null or d >= v_depuis) and (v_jusqua is null or d < v_jusqua)) w) s), '[]'::jsonb),
    'scores_competences', coalesce((select jsonb_agg(jsonb_build_object('competence', y.competence, 'type', 'initial', 'moyenne_pct', y.moyenne, 'effectif', y.effectif, 'derniere_le', y.derniere_le) order by y.competence)
      from (select v.competence, round(avg(100.0 * e.nb_bons / greatest(e.nb_total, 1))) as moyenne, count(distinct e.profile_id) as effectif, max(e.terminee_le) as derniere_le
              from public.academy_entrainements e join public.academy_module_versions v on v.id = e.version_id
             where e.terminee_le is not null and (v_depuis is null or e.terminee_le >= v_depuis) and (v_jusqua is null or e.terminee_le < v_jusqua)
             group by v.competence) y), '[]'::jsonb),
    'definitions', jsonb_build_object(
      'actifs_periode', 'Collaborateurs affectes ayant termine au moins une session sur la periode, rapportes aux collaborateurs affectes.',
      'obligatoires', 'Affectations obligatoires validees (trois couronnes) rapportees aux affectations obligatoires.',
      'echues', 'Affectations dont l echeance est passee et qui ne sont pas validees ; les affectations sans echeance ne comptent pas.',
      'serie', 'Jours consecutifs avec au moins une session terminee, en Europe/Paris ; une journee sans session remet a zero.',
      'items_dus', 'Exercices dont la revision espacee est arrivee a echeance et qui ne sont pas encore su par coeur (force 5).',
      'temps_actif', 'Somme des intervalles d activite acceptes, fusionnes par personne ; chaque reponse vaut un battement, une session laissee ouverte ne compte pas.',
      'a_examiner', 'Faits bruts (session tres rapide, echecs repetes). Aucune qualification automatique.'
    )
  );
end;
$function$;

create or replace function public.academy_fiche(p_profile_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_staff(); v_auj date := public.academy_aujourdhui(); v_serie record;
begin
  if p_profile_id <> v_uid and not (public.is_manager() or public.est_admin_academy()) then
    raise exception 'Fiche reservee a la direction' using errcode = '42501';
  end if;
  select * into v_serie from public.academy_series where profile_id = p_profile_id;
  return jsonb_build_object(
    'profil', (select jsonb_build_object('id', id, 'full_name', full_name, 'advisor_code', advisor_code, 'role', role, 'is_active', is_active) from public.profiles where id = p_profile_id),
    'serie', jsonb_build_object('serie', case when v_serie.dernier_jour is null or v_serie.dernier_jour < v_auj - 1 then 0 else coalesce(v_serie.serie, 0) end,
                                'meilleure', coalesce(v_serie.meilleure, 0), 'dernier_jour', v_serie.dernier_jour, 'objectif_quotidien', coalesce(v_serie.objectif_quotidien, 1)),
    'xp_total', coalesce((select sum(xp) from public.academy_entrainements where profile_id = p_profile_id), 0),
    'items_dus', public.academy_items_dus(p_profile_id, null),
    'affectations', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'version_id', a.version_id, 'slug', m.slug, 'titre', v.titre, 'competence', v.competence, 'theme', m.theme,
        'obligatoire', a.obligatoire, 'echeance', a.echeance, 'statut', a.statut, 'en_retard', (a.echeance is not null and a.echeance < v_auj and a.statut <> 'valide'),
        'couronnes', public.academy_couronnes(p_profile_id, a.version_id),
        'nb_items', (select count(*) from public.academy_items i where i.version_id = a.version_id and i.archive_le is null),
        'items_vus', (select count(*) from public.academy_forces f join public.academy_items i on i.id = f.item_id where f.profile_id = p_profile_id and i.version_id = a.version_id and i.archive_le is null),
        'items_dus', public.academy_items_dus(p_profile_id, a.version_id),
        'xp', coalesce(mx.xp, 0), 'sessions', coalesce(mx.sessions, 0), 'derniere_session', mx.derniere_session,
        'valide_le', (select valide_le from public.academy_validations x where x.profile_id = p_profile_id and x.version_id = a.version_id),
        'temps_actif_s', public.academy_duree_version(p_profile_id, a.version_id)) order by a.created_at)
      from public.academy_affectations a join public.academy_module_versions v on v.id = a.version_id join public.academy_modules m on m.id = a.module_id
      left join public.academy_maitrise mx on mx.profile_id = p_profile_id and mx.version_id = a.version_id
      where a.profile_id = p_profile_id), '[]'::jsonb),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'version_id', e.version_id, 'titre', v.titre, 'demarree_le', e.demarree_le, 'terminee_le', e.terminee_le,
        'nb_bons', e.nb_bons, 'nb_total', e.nb_total, 'xp', e.xp) order by e.demarree_le desc)
      from (select * from public.academy_entrainements where profile_id = p_profile_id and terminee_le is not null order by demarree_le desc limit 50) e
      join public.academy_module_versions v on v.id = e.version_id), '[]'::jsonb),
    'items_faibles', coalesce((select jsonb_agg(jsonb_build_object('item_id', i.id, 'titre_module', v.titre, 'competence', i.competence,
        'enonce_court', left(coalesce(i.payload ->> 'enonce', i.payload ->> 'phrase', i.payload ->> 'recto', ''), 120), 'force', f.force, 'prochaine_le', f.prochaine_le) order by f.force, f.prochaine_le)
      from (select * from public.academy_forces where profile_id = p_profile_id and force <= 2 order by force, prochaine_le limit 20) f
      join public.academy_items i on i.id = f.item_id join public.academy_module_versions v on v.id = i.version_id where i.archive_le is null), '[]'::jsonb),
    'evenements', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'survenu_le', e.survenu_le, 'type', e.type, 'version_id', e.version_id, 'titre', v.titre, 'detail', e.detail) order by e.survenu_le desc)
      from (select * from public.academy_evenements where profile_id = p_profile_id order by survenu_le desc limit 300) e left join public.academy_module_versions v on v.id = e.version_id), '[]'::jsonb),
    'semaines', coalesce((select jsonb_agg(jsonb_build_object('semaine', s.semaine, 'temps_actif_s', s.temps, 'xp', s.xp, 'sessions', s.n) order by s.semaine)
      from (select w.semaine,
              (select coalesce(sum(extract(epoch from (i.fin - i.debut))), 0)::int from public.academy_intervalles i where i.profile_id = p_profile_id and date_trunc('week', i.debut at time zone 'Europe/Paris')::date = w.semaine) as temps,
              (select coalesce(sum(xp), 0) from public.academy_entrainements e where e.profile_id = p_profile_id and e.terminee_le is not null and date_trunc('week', e.terminee_le at time zone 'Europe/Paris')::date = w.semaine) as xp,
              (select count(*) from public.academy_entrainements e where e.profile_id = p_profile_id and e.terminee_le is not null and date_trunc('week', e.terminee_le at time zone 'Europe/Paris')::date = w.semaine) as n
            from (select distinct date_trunc('week', d at time zone 'Europe/Paris')::date as semaine from (
                    select debut d from public.academy_intervalles where profile_id = p_profile_id union all select terminee_le from public.academy_entrainements where profile_id = p_profile_id and terminee_le is not null) z) w) s), '[]'::jsonb),
    'commentaires', case when public.is_manager() then coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'texte', c.texte, 'created_at', c.created_at, 'auteur', pr.full_name) order by c.created_at desc)
      from public.academy_commentaires_coaching c left join public.profiles pr on pr.id = c.auteur_id where c.profile_id = p_profile_id), '[]'::jsonb) else '[]'::jsonb end,
    'temps_actif_s', public.academy_duree_active(p_profile_id, null, null)
  );
end;
$function$;

create or replace function public.academy_matrice_competences()
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_direction();
begin
  return jsonb_build_object(
    'seuils', jsonb_build_object('acquis', 'trois couronnes ou plus : tous les exercices sus au moins deux fois', 'a_renforcer', 'une ou deux couronnes, ou revisions en retard', 'non_evalue', 'aucune session terminee'),
    'competences', coalesce((select jsonb_agg(jsonb_build_object('version_id', v.id, 'competence', v.competence, 'titre', v.titre, 'slug', m.slug) order by m.ordre)
      from public.academy_module_versions v join public.academy_modules m on m.id = v.module_id where v.statut = 'publie'), '[]'::jsonb),
    'lignes', coalesce((select jsonb_agg(jsonb_build_object('profile_id', pr.id, 'nom', pr.full_name,
        'cellules', (select coalesce(jsonb_agg(jsonb_build_object('version_id', v.id,
            'couronnes', public.academy_couronnes(pr.id, v.id),
            'statut', case
              when not exists (select 1 from public.academy_entrainements e where e.profile_id = pr.id and e.version_id = v.id and e.terminee_le is not null) then 'non_evalue'
              when public.academy_couronnes(pr.id, v.id) >= 3 and coalesce((select a.statut from public.academy_affectations a where a.profile_id = pr.id and a.version_id = v.id), 'valide') <> 'a_revoir' then 'acquis'
              else 'a_renforcer' end,
            'items_dus', public.academy_items_dus(pr.id, v.id),
            'derniere_le', (select max(terminee_le) from public.academy_entrainements e where e.profile_id = pr.id and e.version_id = v.id),
            'dernier_pct', (select round(100.0 * nb_bons / greatest(nb_total, 1)) from public.academy_entrainements e where e.profile_id = pr.id and e.version_id = v.id and e.terminee_le is not null order by terminee_le desc limit 1)
          )), '[]'::jsonb)
          from public.academy_module_versions v where v.statut = 'publie')
      ) order by pr.full_name)
      from public.profiles pr where pr.is_active = true and pr.id in (select profile_id from public.academy_affectations)), '[]'::jsonb)
  );
end;
$function$;

-- ── 9. Purge : les intervalles d entrainement n ont pas de lecon ───────────
create or replace function public.academy_purger_intervalles()
returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare v_limite timestamptz; v_nb integer;
begin
  select now() - make_interval(months => retention_intervalles_mois) into v_limite from public.academy_parametres where id = true;
  insert into public.academy_durees_jour (profile_id, lecon_id, version_id, jour, secondes)
  select i.profile_id, i.lecon_id, s.version_id, (i.debut at time zone 'Europe/Paris')::date, sum(extract(epoch from (i.fin - i.debut)))::int
    from public.academy_intervalles i join public.academy_sessions s on s.id = i.session_id
   where i.fin < v_limite and i.lecon_id is not null
   group by i.profile_id, i.lecon_id, s.version_id, (i.debut at time zone 'Europe/Paris')::date
  on conflict (profile_id, jour, lecon_id) do update set secondes = public.academy_durees_jour.secondes + excluded.secondes;
  delete from public.academy_intervalles where fin < v_limite;
  get diagnostics v_nb = row_count;
  return v_nb;
end;
$function$;

-- ── 10. Droits d execution ─────────────────────────────────────────────────
do $do$
declare f text;
begin
  foreach f in array array[
    'academy_catalogue()', 'academy_module(text)', 'academy_mon_parcours()', 'academy_mes_resultats()', 'academy_mes_rappels()',
    'academy_demarrer_entrainement(uuid, uuid)', 'academy_repondre(uuid, uuid, jsonb)', 'academy_terminer_entrainement(uuid)', 'academy_objectif_quotidien(integer)',
    'academy_nouvelle_version(uuid)', 'academy_enregistrer_item(uuid, uuid, jsonb)', 'academy_version_admin(uuid)', 'academy_enregistrer_version(uuid, jsonb)',
    'academy_publier_version(uuid, text, text, boolean)', 'academy_admin_vue()', 'academy_pilotage(date, date)', 'academy_fiche(uuid)', 'academy_matrice_competences()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['academy_normaliser(text)', 'academy_delai_force(integer)', 'academy_couronnes(uuid, uuid)', 'academy_items_dus(uuid, uuid)', 'academy_recalculer_statut(uuid, uuid)',
    'academy_duree_version(uuid, uuid)', 'academy_presenter_item(uuid, jsonb)', 'academy_presenter_entrainement(uuid)', 'academy_verifier_reponse(text, jsonb, jsonb, jsonb, jsonb)', 'academy_purger_intervalles()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end
$do$;

-- Une session vaut douze exercices par defaut.
update public.academy_parametres set questions_par_quiz = 12 where id = true and questions_par_quiz = 5;
