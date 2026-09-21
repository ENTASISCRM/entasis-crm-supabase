-- Entasis Academy, migration 1 : le socle.
--
-- Rubrique de formation interne du CRM : modules versionnes, lecons, banque de
-- questions dont les corriges ne sont lisibles par personne en direct,
-- parcours, affectations, progression par lecon, sessions et intervalles
-- d activite, tentatives de quiz, validations, attestations internes,
-- revisions J+7 et J+30, evenements dates et journal d administration.
--
-- Tout est additif : aucune table existante n est modifiee, hors un drapeau
-- booleen a defaut false sur profiles (academy_admin, modele rh_delegue et
-- acces_pnl) et le bloc correspondant dans prevent_role_escalation(), repris
-- du texte lu EN PRODUCTION le 21 septembre 2026 (pg_get_functiondef).
--
-- RLS : la RLS est la seule couche d autorisation.
--   * Collaborateur = profil actif (is_staff()), ses lignes par
--     profile_id = auth.uid(). Jamais par advisor_code (un arrivant peut ne
--     pas encore en avoir).
--   * Direction = is_manager(). Il n existe aucune hierarchie d equipe en
--     base : le perimetre d un manager est le cabinet entier. Decision
--     documentee, pas de table d equipe inventee.
--   * Administrateur formation = est_admin_academy() : is_manager() ou le
--     drapeau academy_admin sur un profil actif.
--   * Les corriges (academy_corriges) : RLS active, aucune politique, revoke
--     all pour anon et authenticated. Ils ne se lisent que par les fonctions
--     security definer de la migration 2, apres soumission.
--   * Tentatives, reponses, intervalles, validations, attestations,
--     revisions et evenements ne s ecrivent que par ces memes fonctions :
--     insert, update et delete sont retires au role authenticated.
--
-- Versions immuables : une version publiee ne se modifie plus (declencheur
-- academy_version_immuable et ses cousins sur les lecons et les questions) ;
-- le seul passage autorise est publie vers archive.
--
-- Appliquee sur le projet de developpement entasis-crm-DEV
-- (leuqchrianpasianwmjg) le 21 septembre 2026 pour les scenarios
-- d acceptation (scripts/academy/tests-sql), puis EN PRODUCTION le
-- 21 septembre 2026 apres accord de Louis : version 20260921130243,
-- nom academy_1_socle dans supabase_migrations.schema_migrations.

-- ── 1. Droit d administration formation ────────────────────────────────────
-- L ajout de colonne prend un verrou exclusif sur profiles, table que
-- chaque session lit : si le verrou n est pas obtenu en cinq secondes, la
-- migration echoue proprement plutot que de bloquer le cabinet. On rejoue.
set lock_timeout = '5s';
alter table public.profiles
  add column if not exists academy_admin boolean not null default false;

comment on column public.profiles.academy_admin is
  'Administrateur des contenus de formation (Entasis Academy). Distinct du role manager, qui l inclut. Ne se pose que par la direction.';

create or replace function public.est_admin_academy()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.is_manager()
      or exists (
        select 1 from public.profiles
        where id = auth.uid() and academy_admin = true and is_active = true
      );
$function$;

revoke execute on function public.est_admin_academy() from anon, public;
grant execute on function public.est_admin_academy() to authenticated;

-- prevent_role_escalation : texte de production du 21 septembre 2026, plus
-- deux lignes pour academy_admin (dans la branche INSERT et en UPDATE).
-- ATTENTION : si la fonction change en production avant l application,
-- repartir de pg_get_functiondef et n y reporter que ces deux lignes.
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if TG_OP = 'INSERT' then
    if not public.is_manager() then
      new.role := 'advisor';
      new.rh_delegue := false;
      new.advisor_code := null;
      new.is_active := coalesce(lower(new.email) like '%@entasis-conseil.fr', false);
      new.academy_admin := false;
    end if;
    new.acces_pnl := false;
    return new;
  end if;

  if new.role is distinct from old.role and not public.is_manager() then
    raise exception 'Modification du role interdite';
  end if;
  if new.is_active is distinct from old.is_active and not public.is_manager() then
    raise exception 'Modification de is_active interdite';
  end if;
  if new.rh_delegue is distinct from old.rh_delegue and not public.is_manager() then
    raise exception 'Modification de la delegation RH interdite';
  end if;
  if new.advisor_code is distinct from old.advisor_code
     and old.advisor_code is not null
     and not public.is_manager() then
    raise exception 'Modification du code conseiller interdite';
  end if;
  if new.email is distinct from old.email and not public.is_manager() then
    raise exception 'Modification de l email interdite';
  end if;
  if new.academy_admin is distinct from old.academy_admin and not public.is_manager() then
    raise exception 'Modification du droit d administration formation interdite';
  end if;

  -- Le drapeau ne suit pas le role manager.
  if new.acces_pnl is distinct from old.acces_pnl
     and auth.uid() is not null
     and not public.est_direction_pnl() then
    raise exception 'Modification de l acces rentabilite interdite';
  end if;

  -- On ne touche pas au PORTEUR du drapeau depuis un autre compte : sans cette
  -- regle, un manager peut retrograder Louis, l usurper, recuperer le drapeau,
  -- puis remettre son role. Deux ecritures, aucune trace.
  if old.acces_pnl = true
     and auth.uid() is not null
     and auth.uid() <> old.id
     and (new.role is distinct from old.role
          or new.is_active is distinct from old.is_active
          or new.email is distinct from old.email) then
    raise exception 'Ce profil est protege : son role, son activation et son adresse ne se modifient pas depuis un autre compte';
  end if;

  return new;
end;
$function$;

-- ── 2. Parametres ──────────────────────────────────────────────────────────
create table if not exists public.academy_parametres (
  id                          boolean primary key default true check (id),
  seuil_reussite_defaut       numeric not null default 0.80 check (seuil_reussite_defaut > 0 and seuil_reussite_defaut <= 1),
  delai_j7                    integer not null default 7 check (delai_j7 > 0),
  delai_j30                   integer not null default 30 check (delai_j30 > 0),
  questions_par_quiz          integer not null default 5 check (questions_par_quiz between 1 and 20),
  questions_par_revision      integer not null default 4 check (questions_par_revision between 1 and 20),
  retention_intervalles_mois  integer not null default 12 check (retention_intervalles_mois between 1 and 60),
  inactivite_secondes         integer not null default 120,
  pas_battement_secondes      integer not null default 30,
  notice_donnees              text not null default 'Entasis Academy enregistre, pour chaque collaborateur : les lecons ouvertes et terminees, la position de reprise, des battements d activite (toutes les 30 secondes, seulement quand la page est visible et apres une interaction de moins de 120 secondes), les tentatives de quiz avec les reponses donnees et le temps du quiz, les revisions. Aucune frappe, aucune capture, aucune webcam. Ces donnees servent au suivi pedagogique. Elles sont lisibles par vous, par la direction et par l administrateur de la formation ; les commentaires de coaching ne le sont que par la direction. Les intervalles bruts d activite sont purges chaque nuit apres la duree de retention fixee par le cabinet (douze mois), seul un total par jour est conserve.',
  updated_at                  timestamptz not null default now()
);
insert into public.academy_parametres (id) values (true) on conflict (id) do nothing;

-- ── 3. Contenus ────────────────────────────────────────────────────────────
create table if not exists public.academy_modules (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  titre       text not null,
  theme       text not null,
  niveau      text not null default 'fondamentaux'
                check (niveau in ('decouverte', 'fondamentaux', 'perfectionnement')),
  ordre       integer not null default 0,
  archive_le  timestamptz,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.academy_modules is 'Identite stable d un module de formation ; le contenu vit dans academy_module_versions.';

create table if not exists public.academy_module_versions (
  id                uuid primary key default gen_random_uuid(),
  module_id         uuid not null references public.academy_modules(id) on delete cascade,
  numero            integer not null,
  statut            text not null default 'brouillon'
                      check (statut in ('brouillon', 'publie', 'archive')),
  titre             text not null,
  objectif          text not null default '',
  competence        text not null default '',
  duree_minutes     integer not null default 15 check (duree_minutes > 0),
  prerequis         jsonb not null default '[]'::jsonb,
  seuil_reussite    numeric not null default 0.80 check (seuil_reussite > 0 and seuil_reussite <= 1),
  cas_pratique      jsonb not null default '{}'::jsonb,
  a_completer       jsonb not null default '[]'::jsonb,
  sources           jsonb not null default '[]'::jsonb,
  fictif            boolean not null default false,
  publie_le         timestamptz,
  publie_par        uuid references public.profiles(id),
  relu_par          text,
  relu_le           timestamptz,
  commentaire_relecture text,
  archive_le        timestamptz,
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (module_id, numero)
);
comment on table public.academy_module_versions is 'Version d un module. Une version publiee est immuable ; modifier un module publie cree un nouveau brouillon.';
create index if not exists idx_academy_module_versions_module on public.academy_module_versions (module_id, numero desc);
create index if not exists idx_academy_module_versions_statut on public.academy_module_versions (statut);

create table if not exists public.academy_lecons (
  id              uuid primary key default gen_random_uuid(),
  version_id      uuid not null references public.academy_module_versions(id) on delete cascade,
  ordre           integer not null,
  slug            text not null,
  titre           text not null,
  objectif        text not null default '',
  duree_minutes   integer not null default 4 check (duree_minutes > 0),
  contenu_md      text not null default '',
  mini_question   jsonb not null default '{}'::jsonb,
  sources         jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (version_id, ordre),
  unique (version_id, slug)
);
comment on column public.academy_lecons.mini_question is 'Question de comprehension de fin de lecon : {enonce, choix, bonne_reponse, explication}. Interaction obligatoire, jamais une note.';
create index if not exists idx_academy_lecons_version on public.academy_lecons (version_id, ordre);

create table if not exists public.academy_questions (
  id            uuid primary key default gen_random_uuid(),
  version_id    uuid not null references public.academy_module_versions(id) on delete cascade,
  lecon_id      uuid references public.academy_lecons(id) on delete set null,
  cle           text not null,
  type          text not null default 'qcm' check (type in ('qcm', 'vrai_faux', 'cas_court')),
  competence    text not null default '',
  enonce        text not null,
  choix         jsonb not null default '[]'::jsonb,
  difficulte    smallint not null default 2 check (difficulte between 1 and 3),
  archive_le    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (version_id, cle)
);
comment on table public.academy_questions is 'Enonce et choix d une question. La bonne reponse et l explication vivent dans academy_corriges, illisible en direct.';
create index if not exists idx_academy_questions_version on public.academy_questions (version_id);
create index if not exists idx_academy_questions_lecon on public.academy_questions (lecon_id);

create table if not exists public.academy_corriges (
  question_id     uuid primary key references public.academy_questions(id) on delete cascade,
  bonne_reponse   smallint not null check (bonne_reponse >= 0),
  explication     text not null default '',
  updated_at      timestamptz not null default now()
);
comment on table public.academy_corriges is 'Corriges des questions. RLS active sans politique, revoke all : lecture par fonction security definer apres soumission seulement.';

create table if not exists public.academy_parcours (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  titre       text not null,
  description text not null default '',
  ordre       integer not null default 0,
  archive_le  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.academy_parcours_modules (
  parcours_id   uuid not null references public.academy_parcours(id) on delete cascade,
  module_id     uuid not null references public.academy_modules(id) on delete cascade,
  ordre         integer not null default 0,
  obligatoire   boolean not null default true,
  delai_jours   integer check (delai_jours is null or delai_jours > 0),
  primary key (parcours_id, module_id)
);
create index if not exists idx_academy_parcours_modules_module on public.academy_parcours_modules (module_id);

-- ── 4. Affectations et progression ─────────────────────────────────────────
create table if not exists public.academy_affectations (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  module_id     uuid not null references public.academy_modules(id) on delete cascade,
  version_id    uuid not null references public.academy_module_versions(id),
  parcours_id   uuid references public.academy_parcours(id) on delete set null,
  obligatoire   boolean not null default true,
  echeance      date,
  statut        text not null default 'non_commence'
                  check (statut in ('non_commence', 'en_cours', 'a_revoir', 'valide')),
  affecte_par   uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (profile_id, version_id)
);
comment on column public.academy_affectations.statut is 'non_commence, en_cours, a_revoir, valide. Le retard est un indicateur distinct : echeance passee et non valide.';
create index if not exists idx_academy_affectations_profil on public.academy_affectations (profile_id, echeance);
create index if not exists idx_academy_affectations_module on public.academy_affectations (module_id);
create index if not exists idx_academy_affectations_version on public.academy_affectations (version_id);
create index if not exists idx_academy_affectations_parcours on public.academy_affectations (parcours_id);

create table if not exists public.academy_progression_lecons (
  id                        uuid primary key default gen_random_uuid(),
  profile_id                uuid not null references public.profiles(id) on delete cascade,
  lecon_id                  uuid not null references public.academy_lecons(id) on delete cascade,
  version_id                uuid not null references public.academy_module_versions(id),
  position                  jsonb not null default '{}'::jsonb,
  mini_question_reussie_le  timestamptz,
  terminee_le               timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (profile_id, lecon_id)
);
create index if not exists idx_academy_progression_version on public.academy_progression_lecons (profile_id, version_id);
create index if not exists idx_academy_progression_lecon on public.academy_progression_lecons (lecon_id);

-- ── 5. Sessions et intervalles d activite ──────────────────────────────────
create table if not exists public.academy_sessions (
  id                   uuid primary key default gen_random_uuid(),
  profile_id           uuid not null references public.profiles(id) on delete cascade,
  lecon_id             uuid not null references public.academy_lecons(id) on delete cascade,
  version_id           uuid not null references public.academy_module_versions(id),
  jeton_client         uuid not null unique,
  ouverte_le           timestamptz not null default now(),
  dernier_battement_le timestamptz
);
create index if not exists idx_academy_sessions_profil on public.academy_sessions (profile_id, ouverte_le desc);
create index if not exists idx_academy_sessions_lecon on public.academy_sessions (lecon_id);
create index if not exists idx_academy_sessions_version on public.academy_sessions (version_id);

create table if not exists public.academy_intervalles (
  id          bigint generated always as identity primary key,
  session_id  uuid not null references public.academy_sessions(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  lecon_id    uuid references public.academy_lecons(id) on delete set null,
  debut       timestamptz not null,
  fin         timestamptz not null,
  check (fin >= debut)
);
comment on table public.academy_intervalles is 'Intervalles d activite acceptes, bornes par now() en base. La duree active se calcule par fusion des intervalles d une personne, jamais depuis une duree envoyee par le navigateur.';
create index if not exists idx_academy_intervalles_session on public.academy_intervalles (session_id, debut);
create index if not exists idx_academy_intervalles_profil on public.academy_intervalles (profile_id, debut);
create index if not exists idx_academy_intervalles_lecon on public.academy_intervalles (lecon_id);

-- ── 6. Tentatives, reponses, validations, attestations, revisions ─────────
create table if not exists public.academy_tentatives (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  version_id    uuid not null references public.academy_module_versions(id),
  type          text not null default 'quiz' check (type in ('quiz', 'revision_j7', 'revision_j30')),
  numero        integer not null,
  questions     jsonb not null default '[]'::jsonb,
  jeton_client  uuid not null unique,
  demarree_le   timestamptz not null default now(),
  soumise_le    timestamptz,
  score         integer,
  total         integer,
  seuil         numeric,
  reussie       boolean,
  duree_s       integer,
  resultat      jsonb,
  unique (profile_id, version_id, type, numero)
);
comment on column public.academy_tentatives.questions is 'Questions tirees et ordre des choix presente, figes a l ouverture : [{question_id, ordre:[index...]}].';
create index if not exists idx_academy_tentatives_profil on public.academy_tentatives (profile_id, version_id, numero desc);
create index if not exists idx_academy_tentatives_version on public.academy_tentatives (version_id);
create index if not exists idx_academy_tentatives_soumise on public.academy_tentatives (soumise_le desc);

create table if not exists public.academy_reponses (
  tentative_id  uuid not null references public.academy_tentatives(id) on delete cascade,
  question_id   uuid not null references public.academy_questions(id),
  reponse       smallint,
  correcte      boolean not null default false,
  primary key (tentative_id, question_id)
);
create index if not exists idx_academy_reponses_question on public.academy_reponses (question_id);

create table if not exists public.academy_validations (
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  version_id    uuid not null references public.academy_module_versions(id),
  tentative_id  uuid references public.academy_tentatives(id),
  valide_le     timestamptz not null default now(),
  primary key (profile_id, version_id)
);
create index if not exists idx_academy_validations_version on public.academy_validations (version_id);

create table if not exists public.academy_attestations (
  id            uuid primary key default gen_random_uuid(),
  numero        text not null unique,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  version_id    uuid not null references public.academy_module_versions(id),
  tentative_id  uuid references public.academy_tentatives(id),
  delivree_le   timestamptz not null default now(),
  score         integer not null,
  total         integer not null,
  unique (profile_id, version_id)
);
comment on table public.academy_attestations is 'Attestation interne de realisation, ecrite par la base a la validation. Aucune valeur reglementaire, aucune heure DDA.';
create index if not exists idx_academy_attestations_version on public.academy_attestations (version_id);

create table if not exists public.academy_revisions (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  version_id    uuid not null references public.academy_module_versions(id),
  type          text not null check (type in ('J7', 'J30')),
  echeance      date not null,
  tentative_id  uuid references public.academy_tentatives(id),
  resultat      text check (resultat in ('reussie', 'echouee')),
  faite_le      timestamptz,
  created_at    timestamptz not null default now(),
  unique (profile_id, version_id, type)
);
create index if not exists idx_academy_revisions_profil on public.academy_revisions (profile_id, echeance);
create index if not exists idx_academy_revisions_echeance on public.academy_revisions (echeance) where tentative_id is null;
create index if not exists idx_academy_revisions_version on public.academy_revisions (version_id);

-- ── 7. Journaux ────────────────────────────────────────────────────────────
create table if not exists public.academy_evenements (
  id          bigint generated always as identity primary key,
  survenu_le  timestamptz not null default now(),
  profile_id  uuid references public.profiles(id) on delete cascade,
  type        text not null,
  version_id  uuid references public.academy_module_versions(id),
  detail      jsonb not null default '{}'::jsonb
);
comment on table public.academy_evenements is 'Historique date, append only : affectation_creee, lecon_terminee, tentative_soumise, module_valide, revision_faite, version_publiee, version_archivee.';
create index if not exists idx_academy_evenements_profil on public.academy_evenements (profile_id, survenu_le desc);
create index if not exists idx_academy_evenements_type on public.academy_evenements (type, survenu_le desc);
create index if not exists idx_academy_evenements_version on public.academy_evenements (version_id);

create table if not exists public.academy_journal_admin (
  id          bigint generated always as identity primary key,
  survenu_le  timestamptz not null default now(),
  profile_id  uuid references public.profiles(id),
  action      text not null,
  cible       text,
  detail      jsonb not null default '{}'::jsonb
);
create index if not exists idx_academy_journal_admin_date on public.academy_journal_admin (survenu_le desc);

create table if not exists public.academy_commentaires_coaching (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  auteur_id   uuid references public.profiles(id),
  texte       text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_academy_commentaires_profil on public.academy_commentaires_coaching (profile_id, created_at desc);

-- ── 8. Declencheurs ────────────────────────────────────────────────────────
-- updated_at : handle_updated_at() existe deja en base.
do $do$
declare t text;
begin
  foreach t in array array['academy_parametres','academy_modules','academy_module_versions','academy_lecons','academy_questions','academy_corriges','academy_parcours','academy_affectations','academy_progression_lecons','academy_commentaires_coaching'] loop
    execute format('drop trigger if exists trg_%s_updated_at on public.%I', t, t);
    execute format('create trigger trg_%s_updated_at before update on public.%I for each row execute function public.handle_updated_at()', t, t);
  end loop;
end
$do$;

-- Une version publiee ne se modifie plus. Seul passage tolere : publie vers
-- archive (et la date d archivage). Une version archivee ne bouge plus.
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

drop trigger if exists trg_academy_version_immuable on public.academy_module_versions;
create trigger trg_academy_version_immuable
  before update on public.academy_module_versions
  for each row execute function public.academy_version_immuable();

-- Une version publiee ne se supprime pas : les preuves de realisation la
-- referencent. Archiver, jamais effacer.
create or replace function public.academy_version_indelebile()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if old.statut in ('publie', 'archive') then
    raise exception 'Une version publiee ou archivee ne se supprime pas'
      using errcode = 'check_violation';
  end if;
  return old;
end;
$function$;

drop trigger if exists trg_academy_version_indelebile on public.academy_module_versions;
create trigger trg_academy_version_indelebile
  before delete on public.academy_module_versions
  for each row execute function public.academy_version_indelebile();

-- Lecons, questions et corriges d une version publiee : figes.
create or replace function public.academy_contenu_fige()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_version uuid;
  v_statut text;
begin
  if TG_TABLE_NAME = 'academy_corriges' then
    select q.version_id into v_version from public.academy_questions q
     where q.id = coalesce(new.question_id, old.question_id);
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
  foreach t in array array['academy_lecons','academy_questions','academy_corriges'] loop
    execute format('drop trigger if exists trg_%s_fige on public.%I', t, t);
    execute format('create trigger trg_%s_fige before insert or update or delete on public.%I for each row execute function public.academy_contenu_fige()', t, t);
  end loop;
end
$do$;

-- La progression d une lecon appartient a la session : profile_id est impose
-- par auth.uid() a l insertion et fige ensuite (modele
-- proteger_titulaire_deal_insert et proteger_titulaire_client).
create or replace function public.academy_progression_garde()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Cle de service, migration, ou fonction serveur de l Academy (qui pose le
  -- reglage local academy.serveur le temps de sa transaction) : on laisse
  -- faire. Une session navigateur ne peut pas poser ce reglage : PostgREST
  -- n execute que la fonction appelee, et set_config y est local.
  if auth.uid() is null or current_setting('academy.serveur', true) = 'on' then
    return new;
  end if;
  if TG_OP = 'INSERT' then
    new.profile_id := auth.uid();
    new.terminee_le := null;
    new.mini_question_reussie_le := null;
    -- La version est celle de la lecon, jamais celle que le client annonce :
    -- sinon trois lecons d un module comptees sur un autre ouvriraient son quiz.
    select l.version_id into new.version_id from public.academy_lecons l where l.id = new.lecon_id;
    if new.version_id is null then
      raise exception 'Lecon introuvable' using errcode = 'P0002';
    end if;
    return new;
  end if;
  if new.profile_id is distinct from old.profile_id
     or new.lecon_id is distinct from old.lecon_id
     or new.version_id is distinct from old.version_id then
    raise exception 'La progression d une lecon ne change ni de personne ni de lecon'
      using errcode = 'check_violation';
  end if;
  -- terminee_le et la mini question ne se posent que par la fonction
  -- academy_terminer_lecon ; le navigateur ne peut pas se declarer termine.
  new.terminee_le := old.terminee_le;
  new.mini_question_reussie_le := old.mini_question_reussie_le;
  return new;
end;
$function$;

drop trigger if exists trg_academy_progression_garde on public.academy_progression_lecons;
create trigger trg_academy_progression_garde
  before insert or update on public.academy_progression_lecons
  for each row execute function public.academy_progression_garde();

-- Journaux append only pour toute session utilisateur. La cle de service et
-- les migrations (auth.uid() null) gardent la main : c est ce qui permet la
-- cascade d une suppression de profil decidee par l administration.
create or replace function public.academy_append_only()
returns trigger
language plpgsql
as $function$
begin
  if auth.uid() is null then
    if TG_OP = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'Ce journal ne se modifie pas et ne s efface pas';
end;
$function$;

do $do$
declare t text;
begin
  foreach t in array array['academy_evenements','academy_journal_admin'] loop
    execute format('drop trigger if exists trg_%s_append_only on public.%I', t, t);
    execute format('create trigger trg_%s_append_only before update or delete on public.%I for each row execute function public.academy_append_only()', t, t);
    execute format('drop trigger if exists trg_%s_no_truncate on public.%I', t, t);
    execute format('create trigger trg_%s_no_truncate before truncate on public.%I for each statement execute function public.academy_append_only()', t, t);
  end loop;
end
$do$;

-- ── 9. RLS et privileges ───────────────────────────────────────────────────
do $do$
declare t text;
begin
  foreach t in array array['academy_parametres','academy_modules','academy_module_versions','academy_lecons','academy_questions','academy_corriges','academy_parcours','academy_parcours_modules','academy_affectations','academy_progression_lecons','academy_sessions','academy_intervalles','academy_tentatives','academy_reponses','academy_validations','academy_attestations','academy_revisions','academy_evenements','academy_journal_admin','academy_commentaires_coaching'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end
$do$;

-- Parametres : lecture par le cabinet, ecriture par l administrateur.
drop policy if exists academy_parametres_select_staff on public.academy_parametres;
create policy academy_parametres_select_staff on public.academy_parametres
  for select to authenticated using ((select public.is_staff()));
drop policy if exists academy_parametres_update_admin on public.academy_parametres;
create policy academy_parametres_update_admin on public.academy_parametres
  for update to authenticated
  using ((select public.est_admin_academy())) with check ((select public.est_admin_academy()));
revoke insert, delete on public.academy_parametres from authenticated;

-- Modules et parcours : le cabinet lit, l administrateur ecrit.
drop policy if exists academy_modules_select_staff on public.academy_modules;
create policy academy_modules_select_staff on public.academy_modules
  for select to authenticated
  using ((select public.is_staff()) and (archive_le is null or (select public.est_admin_academy())));
drop policy if exists academy_modules_write_admin on public.academy_modules;
create policy academy_modules_write_admin on public.academy_modules
  for all to authenticated
  using ((select public.est_admin_academy())) with check ((select public.est_admin_academy()));

drop policy if exists academy_parcours_select_staff on public.academy_parcours;
create policy academy_parcours_select_staff on public.academy_parcours
  for select to authenticated using ((select public.is_staff()));
drop policy if exists academy_parcours_write_admin on public.academy_parcours;
create policy academy_parcours_write_admin on public.academy_parcours
  for all to authenticated
  using ((select public.est_admin_academy())) with check ((select public.est_admin_academy()));

drop policy if exists academy_parcours_modules_select_staff on public.academy_parcours_modules;
create policy academy_parcours_modules_select_staff on public.academy_parcours_modules
  for select to authenticated using ((select public.is_staff()));
drop policy if exists academy_parcours_modules_write_admin on public.academy_parcours_modules;
create policy academy_parcours_modules_write_admin on public.academy_parcours_modules
  for all to authenticated
  using ((select public.est_admin_academy())) with check ((select public.est_admin_academy()));

-- Versions, lecons, questions : le cabinet ne lit que le publie ; les
-- brouillons et archives sont visibles de l administrateur.
drop policy if exists academy_versions_select on public.academy_module_versions;
create policy academy_versions_select on public.academy_module_versions
  for select to authenticated
  using ((select public.is_staff()) and (statut = 'publie' or (select public.est_admin_academy())));
drop policy if exists academy_versions_write_admin on public.academy_module_versions;
create policy academy_versions_write_admin on public.academy_module_versions
  for all to authenticated
  using ((select public.est_admin_academy())) with check ((select public.est_admin_academy()));

drop policy if exists academy_lecons_select on public.academy_lecons;
create policy academy_lecons_select on public.academy_lecons
  for select to authenticated
  using ((select public.is_staff()) and exists (
    select 1 from public.academy_module_versions v
    where v.id = version_id and (v.statut = 'publie' or (select public.est_admin_academy()))));
drop policy if exists academy_lecons_write_admin on public.academy_lecons;
create policy academy_lecons_write_admin on public.academy_lecons
  for all to authenticated
  using ((select public.est_admin_academy())) with check ((select public.est_admin_academy()));

drop policy if exists academy_questions_select on public.academy_questions;
create policy academy_questions_select on public.academy_questions
  for select to authenticated
  using ((select public.is_staff()) and exists (
    select 1 from public.academy_module_versions v
    where v.id = version_id and (v.statut = 'publie' or (select public.est_admin_academy()))));
drop policy if exists academy_questions_write_admin on public.academy_questions;
create policy academy_questions_write_admin on public.academy_questions
  for all to authenticated
  using ((select public.est_admin_academy())) with check ((select public.est_admin_academy()));

-- Corriges : personne en direct. Lecture et ecriture par fonctions.
revoke all on public.academy_corriges from anon, authenticated;

-- Affectations : soi, la direction, l administrateur ; ecriture administrateur.
drop policy if exists academy_affectations_select on public.academy_affectations;
create policy academy_affectations_select on public.academy_affectations
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.est_admin_academy()));
drop policy if exists academy_affectations_write_admin on public.academy_affectations;
create policy academy_affectations_write_admin on public.academy_affectations
  for all to authenticated
  using ((select public.est_admin_academy())) with check ((select public.est_admin_academy()));

-- Progression : ses lignes ; la direction lit tout. Le navigateur n ecrit que
-- la position ; terminee_le passe par academy_terminer_lecon.
drop policy if exists academy_progression_select on public.academy_progression_lecons;
create policy academy_progression_select on public.academy_progression_lecons
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.est_admin_academy()));
drop policy if exists academy_progression_insert_self on public.academy_progression_lecons;
create policy academy_progression_insert_self on public.academy_progression_lecons
  for insert to authenticated
  with check (profile_id = (select auth.uid()) and (select public.is_staff()));
drop policy if exists academy_progression_update_self on public.academy_progression_lecons;
create policy academy_progression_update_self on public.academy_progression_lecons
  for update to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
revoke update on public.academy_progression_lecons from authenticated;
grant update (position, updated_at) on public.academy_progression_lecons to authenticated;
revoke delete on public.academy_progression_lecons from authenticated;

-- Sessions : lecture de ses sessions et par la direction ; ecriture par fonction.
drop policy if exists academy_sessions_select on public.academy_sessions;
create policy academy_sessions_select on public.academy_sessions
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.est_admin_academy()));
revoke insert, update, delete on public.academy_sessions from authenticated;

-- Intervalles bruts : personne en direct, les durees se lisent par fonction.
revoke all on public.academy_intervalles from anon, authenticated;

-- Tentatives : ses tentatives soumises et la direction ; ecriture par fonction.
drop policy if exists academy_tentatives_select on public.academy_tentatives;
create policy academy_tentatives_select on public.academy_tentatives
  for select to authenticated
  using ((profile_id = (select auth.uid()) and soumise_le is not null) or (select public.est_admin_academy()));
revoke insert, update, delete on public.academy_tentatives from authenticated;
-- La colonne questions garde l ordre des choix, jamais la bonne reponse ;
-- le resultat detaille (corrige) ne se lit qu apres soumission, et la
-- policy ci dessus l impose.

-- Reponses : par fonction seulement.
revoke all on public.academy_reponses from anon, authenticated;

-- Validations, attestations, revisions : lecture de ses lignes et par la
-- direction, ecriture par fonction.
drop policy if exists academy_validations_select on public.academy_validations;
create policy academy_validations_select on public.academy_validations
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.est_admin_academy()));
revoke insert, update, delete on public.academy_validations from authenticated;

drop policy if exists academy_attestations_select on public.academy_attestations;
create policy academy_attestations_select on public.academy_attestations
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.est_admin_academy()));
revoke insert, update, delete on public.academy_attestations from authenticated;

drop policy if exists academy_revisions_select on public.academy_revisions;
create policy academy_revisions_select on public.academy_revisions
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.est_admin_academy()));
revoke insert, update, delete on public.academy_revisions from authenticated;

-- Evenements : ses lignes et la direction ; insertion par fonction.
drop policy if exists academy_evenements_select on public.academy_evenements;
create policy academy_evenements_select on public.academy_evenements
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.est_admin_academy()));
revoke insert, update, delete on public.academy_evenements from authenticated;

-- Journal d administration : administrateur en lecture ; insertion par fonction.
drop policy if exists academy_journal_admin_select on public.academy_journal_admin;
create policy academy_journal_admin_select on public.academy_journal_admin
  for select to authenticated using ((select public.est_admin_academy()));
revoke insert, update, delete on public.academy_journal_admin from authenticated;

-- Commentaires de coaching : le collaborateur lit les siens, la direction
-- lit et ecrit.
drop policy if exists academy_coaching_select on public.academy_commentaires_coaching;
create policy academy_coaching_select on public.academy_commentaires_coaching
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_manager()));
drop policy if exists academy_coaching_write_manager on public.academy_commentaires_coaching;
create policy academy_coaching_write_manager on public.academy_commentaires_coaching
  for all to authenticated
  using ((select public.is_manager())) with check ((select public.is_manager()) and auteur_id = (select auth.uid()));
