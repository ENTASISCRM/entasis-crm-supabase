-- Entasis Academy, migration 2 : les fonctions.
--
-- Tout ce qui touche aux corriges, aux durees et aux validations passe par
-- des fonctions security definer executees en base avec l identite
-- auth.uid() : le navigateur ne recoit jamais une bonne reponse avant la
-- soumission, le score se calcule ici, la soumission est idempotente par
-- identifiant de tentative, les durees se calculent a partir d intervalles
-- bornes par now() et fusionnes par personne (deux onglets ne comptent pas
-- double). Aucune fonction Vercel, aucune variable d environnement : c est
-- la voie du depot (« le CRM est une application sans serveur »).
--
-- Les fonctions qui ecrivent dans des tables gardees par un declencheur
-- posent le reglage local academy.serveur = on le temps de leur transaction
-- (voir academy_progression_garde dans la migration 1).
--
-- Droits : revoke execute from public, anon ; grant to authenticated ; la
-- fonction de purge est reservee a la cle de service. Chaque fonction verifie
-- is_staff() en tete : un compte du portail client est authenticated sans
-- profil et ne doit rien obtenir.
--
-- « Aujourd hui » se lit en Europe/Paris (academy_aujourdhui) : une revision
-- due le 22 ne bascule pas a 2 h du matin selon l heure de connexion.
--
-- NON APPLIQUEE EN PRODUCTION. Appliquee sur entasis-crm-DEV
-- (leuqchrianpasianwmjg) le 21 septembre 2026.

-- ── 0. Complement de schema ────────────────────────────────────────────────
-- La reponse de la mini question de fin de lecon ne se lit pas par le
-- navigateur : colonne dediee, retiree du select accorde a authenticated.
alter table public.academy_lecons add column if not exists mini_reponse smallint;
revoke select on public.academy_lecons from authenticated;
grant select (id, version_id, ordre, slug, titre, objectif, duree_minutes, contenu_md, mini_question, sources, created_at, updated_at)
  on public.academy_lecons to authenticated;

-- Durees archivees par jour, alimentees par la purge des intervalles bruts.
create table if not exists public.academy_durees_jour (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  lecon_id    uuid references public.academy_lecons(id) on delete set null,
  version_id  uuid references public.academy_module_versions(id),
  jour        date not null,
  secondes    integer not null default 0,
  primary key (profile_id, jour, lecon_id)
);
alter table public.academy_durees_jour enable row level security;
revoke all on public.academy_durees_jour from anon, authenticated;

-- ── 1. Helpers ─────────────────────────────────────────────────────────────
create or replace function public.academy_aujourdhui()
returns date language sql stable set search_path to 'public'
as $function$ select (now() at time zone 'Europe/Paris')::date; $function$;

create or replace function public.academy_exiger_staff()
returns uuid language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Reserve aux collaborateurs du cabinet' using errcode = '42501';
  end if;
  return auth.uid();
end;
$function$;

create or replace function public.academy_exiger_admin()
returns uuid language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  if auth.uid() is null or not public.est_admin_academy() then
    raise exception 'Reserve a l administration de la formation' using errcode = '42501';
  end if;
  return auth.uid();
end;
$function$;

create or replace function public.academy_exiger_direction()
returns uuid language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  if auth.uid() is null or not (public.is_manager() or public.est_admin_academy()) then
    raise exception 'Reserve a la direction' using errcode = '42501';
  end if;
  return auth.uid();
end;
$function$;

create or replace function public.academy_journaliser(p_action text, p_cible text, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  insert into public.academy_journal_admin (profile_id, action, cible, detail)
  values (auth.uid(), p_action, p_cible, coalesce(p_detail, '{}'::jsonb));
end;
$function$;

create or replace function public.academy_evenement(p_profile uuid, p_type text, p_version uuid, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  insert into public.academy_evenements (profile_id, type, version_id, detail)
  values (p_profile, p_type, p_version, coalesce(p_detail, '{}'::jsonb));
end;
$function$;

-- Fusion des intervalles d une personne sur une fenetre : deux onglets, deux
-- appareils ou deux lecons qui se chevauchent ne comptent qu une fois.
create or replace function public.academy_duree_active(p_profile uuid, p_depuis timestamptz default null, p_jusqua timestamptz default null)
returns integer language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  r record;
  v_debut timestamptz; v_fin timestamptz;
  v_total numeric := 0;
  v_archive integer := 0;
begin
  for r in
    select greatest(debut, coalesce(p_depuis, debut)) as d, least(fin, coalesce(p_jusqua, fin)) as f
    from public.academy_intervalles
    where profile_id = p_profile
      and (p_depuis is null or fin >= p_depuis)
      and (p_jusqua is null or debut <= p_jusqua)
    order by 1
  loop
    if v_debut is null then
      v_debut := r.d; v_fin := r.f;
    elsif r.d <= v_fin then
      v_fin := greatest(v_fin, r.f);
    else
      v_total := v_total + extract(epoch from (v_fin - v_debut));
      v_debut := r.d; v_fin := r.f;
    end if;
  end loop;
  if v_debut is not null then
    v_total := v_total + extract(epoch from (v_fin - v_debut));
  end if;
  select coalesce(sum(secondes), 0) into v_archive from public.academy_durees_jour
   where profile_id = p_profile
     and (p_depuis is null or jour >= (p_depuis at time zone 'Europe/Paris')::date)
     and (p_jusqua is null or jour <= (p_jusqua at time zone 'Europe/Paris')::date);
  return round(v_total)::integer + v_archive;
end;
$function$;

-- Meme fusion, restreinte aux lecons d une version.
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

-- Statut derive d une affectation, recalcule a chaque ecriture qui compte.
create or replace function public.academy_recalculer_statut(p_profile uuid, p_version uuid)
returns text language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_valide boolean; v_revision_echouee boolean; v_quiz_echoue boolean; v_commence boolean; v_statut text;
begin
  select exists (select 1 from public.academy_validations where profile_id = p_profile and version_id = p_version) into v_valide;
  select exists (select 1 from public.academy_revisions r where r.profile_id = p_profile and r.version_id = p_version
                   and r.resultat = 'echouee'
                   and r.faite_le = (select max(faite_le) from public.academy_revisions where profile_id = p_profile and version_id = p_version and faite_le is not null))
    into v_revision_echouee;
  select exists (select 1 from public.academy_tentatives t where t.profile_id = p_profile and t.version_id = p_version and t.type = 'quiz'
                   and t.soumise_le is not null and t.reussie = false
                   and t.soumise_le = (select max(soumise_le) from public.academy_tentatives where profile_id = p_profile and version_id = p_version and type = 'quiz' and soumise_le is not null))
    into v_quiz_echoue;
  select exists (select 1 from public.academy_progression_lecons where profile_id = p_profile and version_id = p_version)
      or exists (select 1 from public.academy_tentatives where profile_id = p_profile and version_id = p_version)
    into v_commence;
  if v_valide then
    v_statut := case when v_revision_echouee then 'a_revoir' else 'valide' end;
  elsif v_quiz_echoue then
    v_statut := 'a_revoir';
  elsif v_commence then
    v_statut := 'en_cours';
  else
    v_statut := 'non_commence';
  end if;
  update public.academy_affectations set statut = v_statut, updated_at = now()
   where profile_id = p_profile and version_id = p_version and statut is distinct from v_statut;
  return v_statut;
end;
$function$;

-- ── 2. Lecture : catalogue, parcours, resultats ────────────────────────────
create or replace function public.academy_catalogue()
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_staff();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'module_id', m.id, 'slug', m.slug, 'titre', v.titre, 'theme', m.theme, 'niveau', m.niveau, 'ordre', m.ordre,
      'version_id', v.id, 'numero', v.numero, 'objectif', v.objectif, 'competence', v.competence,
      'duree_minutes', v.duree_minutes, 'prerequis', v.prerequis, 'seuil_reussite', v.seuil_reussite,
      'nb_lecons', (select count(*) from public.academy_lecons l where l.version_id = v.id),
      'nb_questions', (select count(*) from public.academy_questions q where q.version_id = v.id and q.archive_le is null),
      'publie_le', v.publie_le,
      'affectation', (select jsonb_build_object('id', a.id, 'statut', a.statut, 'echeance', a.echeance, 'obligatoire', a.obligatoire, 'parcours_id', a.parcours_id)
                      from public.academy_affectations a where a.profile_id = v_uid and a.version_id = v.id),
      'lecons_terminees', (select count(*) from public.academy_progression_lecons p where p.profile_id = v_uid and p.version_id = v.id and p.terminee_le is not null),
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
    'duree_minutes', mv.duree_minutes, 'prerequis', mv.prerequis, 'seuil_reussite', mv.seuil_reussite,
    'cas_pratique', mv.cas_pratique, 'a_completer', mv.a_completer, 'sources', mv.sources,
    'relu_par', mv.relu_par, 'relu_le', mv.relu_le, 'publie_le', mv.publie_le,
    'lecons', coalesce((select jsonb_agg(jsonb_build_object(
        'id', l.id, 'ordre', l.ordre, 'slug', l.slug, 'titre', l.titre, 'objectif', l.objectif, 'duree_minutes', l.duree_minutes,
        'terminee_le', p.terminee_le, 'mini_question_reussie_le', p.mini_question_reussie_le, 'position', p.position
      ) order by l.ordre)
      from public.academy_lecons l
      left join public.academy_progression_lecons p on p.lecon_id = l.id and p.profile_id = v_uid
      where l.version_id = mv.id), '[]'::jsonb),
    'affectation', (select jsonb_build_object('id', a.id, 'statut', a.statut, 'echeance', a.echeance, 'obligatoire', a.obligatoire)
                    from public.academy_affectations a where a.profile_id = v_uid and a.version_id = mv.id),
    'validation', (select jsonb_build_object('valide_le', x.valide_le) from public.academy_validations x where x.profile_id = v_uid and x.version_id = mv.id),
    'attestation', (select jsonb_build_object('numero', t.numero, 'delivree_le', t.delivree_le, 'score', t.score, 'total', t.total)
                    from public.academy_attestations t where t.profile_id = v_uid and t.version_id = mv.id),
    'revisions', coalesce((select jsonb_agg(jsonb_build_object('type', r.type, 'echeance', r.echeance, 'resultat', r.resultat, 'faite_le', r.faite_le, 'due', (r.tentative_id is null and r.echeance <= public.academy_aujourdhui())) order by r.echeance)
                    from public.academy_revisions r where r.profile_id = v_uid and r.version_id = mv.id), '[]'::jsonb),
    'tentatives', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'type', t.type, 'numero', t.numero, 'soumise_le', t.soumise_le, 'score', t.score, 'total', t.total, 'reussie', t.reussie, 'duree_s', t.duree_s) order by t.soumise_le)
                    from public.academy_tentatives t where t.profile_id = v_uid and t.version_id = mv.id and t.soumise_le is not null), '[]'::jsonb),
    'tentative_ouverte', (select jsonb_build_object('id', t.id, 'type', t.type, 'jeton_client', t.jeton_client) from public.academy_tentatives t
                          where t.profile_id = v_uid and t.version_id = mv.id and t.soumise_le is null order by t.demarree_le desc limit 1),
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
declare v_uid uuid := public.academy_exiger_staff(); v_auj date := public.academy_aujourdhui();
begin
  return jsonb_build_object(
    'aujourdhui', v_auj,
    'affectations', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'module_id', a.module_id, 'version_id', a.version_id, 'parcours_id', a.parcours_id,
        'parcours_titre', (select titre from public.academy_parcours pa where pa.id = a.parcours_id),
        'obligatoire', a.obligatoire, 'echeance', a.echeance, 'statut', a.statut,
        'en_retard', (a.echeance is not null and a.echeance < v_auj and a.statut <> 'valide'),
        'slug', m.slug, 'titre', v.titre, 'theme', m.theme, 'niveau', m.niveau, 'duree_minutes', v.duree_minutes,
        'nb_lecons', (select count(*) from public.academy_lecons l where l.version_id = v.id),
        'lecons_terminees', (select count(*) from public.academy_progression_lecons p where p.profile_id = v_uid and p.version_id = v.id and p.terminee_le is not null),
        'prochaine_lecon', (select jsonb_build_object('id', l.id, 'titre', l.titre, 'ordre', l.ordre)
                            from public.academy_lecons l left join public.academy_progression_lecons p on p.lecon_id = l.id and p.profile_id = v_uid
                            where l.version_id = v.id and p.terminee_le is null order by l.ordre limit 1),
        'derniere_activite', (select max(x) from (
            select max(p.updated_at) x from public.academy_progression_lecons p where p.profile_id = v_uid and p.version_id = v.id
            union all select max(t.soumise_le) from public.academy_tentatives t where t.profile_id = v_uid and t.version_id = v.id
            union all select max(s.dernier_battement_le) from public.academy_sessions s where s.profile_id = v_uid and s.version_id = v.id) u),
        'valide_le', (select valide_le from public.academy_validations x where x.profile_id = v_uid and x.version_id = v.id),
        'version_statut', v.statut,
        'created_at', a.created_at
      ) order by (a.statut = 'valide'), a.echeance nulls last, a.created_at)
      from public.academy_affectations a
      join public.academy_modules m on m.id = a.module_id
      join public.academy_module_versions v on v.id = a.version_id
      where a.profile_id = v_uid), '[]'::jsonb),
    'revisions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'version_id', r.version_id, 'type', r.type, 'echeance', r.echeance, 'resultat', r.resultat, 'faite_le', r.faite_le,
        'due', (r.tentative_id is null and r.echeance <= v_auj), 'slug', m.slug, 'titre', v.titre
      ) order by r.echeance)
      from public.academy_revisions r join public.academy_module_versions v on v.id = r.version_id join public.academy_modules m on m.id = v.module_id
      where r.profile_id = v_uid), '[]'::jsonb),
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

create or replace function public.academy_mes_tentatives()
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_staff();
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', t.id, 'version_id', t.version_id, 'slug', m.slug, 'titre', v.titre, 'competence', v.competence,
      'type', t.type, 'numero', t.numero, 'demarree_le', t.demarree_le, 'soumise_le', t.soumise_le,
      'score', t.score, 'total', t.total, 'seuil', t.seuil, 'reussie', t.reussie, 'duree_s', t.duree_s,
      'notions_a_revoir', (select coalesce(jsonb_agg(distinct q.competence), '[]'::jsonb)
                           from public.academy_reponses r join public.academy_questions q on q.id = r.question_id
                           where r.tentative_id = t.id and r.correcte = false and q.competence <> '')
    ) order by t.soumise_le desc)
    from public.academy_tentatives t join public.academy_module_versions v on v.id = t.version_id join public.academy_modules m on m.id = v.module_id
    where t.profile_id = v_uid and t.soumise_le is not null), '[]'::jsonb);
end;
$function$;

create or replace function public.academy_mes_rappels()
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_uid uuid; v_auj date := public.academy_aujourdhui();
begin
  if auth.uid() is null or not public.is_staff() then return '[]'::jsonb; end if;
  v_uid := auth.uid();
  return coalesce((
    select jsonb_agg(x) from (
      select jsonb_build_object('type', 'revisions_dues', 'nombre', count(*), 'echeance', min(r.echeance),
               'titres', jsonb_agg(v.titre order by r.echeance))
        from public.academy_revisions r join public.academy_module_versions v on v.id = r.version_id
       where r.profile_id = v_uid and r.tentative_id is null and r.echeance <= v_auj
      having count(*) > 0
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

-- ── 3. Lecture d une lecon, sessions, battements, fin de lecon ─────────────
create or replace function public.academy_lecon(p_lecon_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_staff(); v jsonb;
begin
  select jsonb_build_object(
    'id', l.id, 'version_id', l.version_id, 'ordre', l.ordre, 'slug', l.slug, 'titre', l.titre, 'objectif', l.objectif,
    'duree_minutes', l.duree_minutes, 'contenu_md', l.contenu_md, 'mini_question', l.mini_question - 'bonne_reponse', 'sources', l.sources,
    'module', jsonb_build_object('slug', m.slug, 'titre', v.titre, 'version_id', v.id),
    'lecons', (select jsonb_agg(jsonb_build_object('id', x.id, 'ordre', x.ordre, 'titre', x.titre, 'terminee_le', p.terminee_le) order by x.ordre)
               from public.academy_lecons x left join public.academy_progression_lecons p on p.lecon_id = x.id and p.profile_id = v_uid
               where x.version_id = v.id),
    'progression', (select jsonb_build_object('position', p.position, 'terminee_le', p.terminee_le, 'mini_question_reussie_le', p.mini_question_reussie_le)
                    from public.academy_progression_lecons p where p.lecon_id = l.id and p.profile_id = v_uid),
    'parametres', (select jsonb_build_object('inactivite_secondes', inactivite_secondes, 'pas_battement_secondes', pas_battement_secondes) from public.academy_parametres where id = true)
  ) into v
  from public.academy_lecons l
  join public.academy_module_versions v on v.id = l.version_id
  join public.academy_modules m on m.id = v.module_id
  where l.id = p_lecon_id and (v.statut = 'publie' or public.est_admin_academy());
  if v is null then raise exception 'Lecon introuvable' using errcode = 'P0002'; end if;
  return v;
end;
$function$;

create or replace function public.academy_ouvrir_session(p_lecon_id uuid, p_jeton uuid)
returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_staff(); v_version uuid; v_id uuid;
begin
  perform set_config('academy.serveur', 'on', true);
  select l.version_id into v_version from public.academy_lecons l join public.academy_module_versions v on v.id = l.version_id
   where l.id = p_lecon_id and (v.statut = 'publie' or public.est_admin_academy());
  if v_version is null then raise exception 'Lecon introuvable' using errcode = 'P0002'; end if;
  insert into public.academy_sessions (profile_id, lecon_id, version_id, jeton_client)
  values (v_uid, p_lecon_id, v_version, p_jeton)
  on conflict (jeton_client) do nothing;
  select id into v_id from public.academy_sessions where jeton_client = p_jeton and profile_id = v_uid;
  if v_id is null then raise exception 'Jeton de session deja utilise' using errcode = '23505'; end if;
  insert into public.academy_progression_lecons (profile_id, lecon_id, version_id)
  values (v_uid, p_lecon_id, v_version)
  on conflict (profile_id, lecon_id) do nothing;
  return v_id;
end;
$function$;

-- Un battement : prolonge l intervalle courant s il date de moins du pas plus
-- une tolerance, sinon ouvre un nouvel intervalle. Le temps vient de now().
create or replace function public.academy_battement(p_session_id uuid)
returns timestamptz language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := public.academy_exiger_staff();
  v_now timestamptz := now();
  v_tolerance interval;
  v_dernier record;
  v_session record;
begin
  select * into v_session from public.academy_sessions where id = p_session_id and profile_id = v_uid;
  if v_session is null then raise exception 'Session inconnue' using errcode = 'P0002'; end if;
  select make_interval(secs => pas_battement_secondes + 15) into v_tolerance from public.academy_parametres where id = true;
  select id, fin into v_dernier from public.academy_intervalles where session_id = p_session_id order by fin desc limit 1;
  if v_dernier.id is not null and v_dernier.fin >= v_now - v_tolerance then
    update public.academy_intervalles set fin = v_now where id = v_dernier.id;
  else
    insert into public.academy_intervalles (session_id, profile_id, lecon_id, debut, fin)
    values (p_session_id, v_uid, v_session.lecon_id, v_now, v_now);
  end if;
  update public.academy_sessions set dernier_battement_le = v_now where id = p_session_id;
  return v_now;
end;
$function$;

create or replace function public.academy_terminer_lecon(p_lecon_id uuid, p_reponse integer)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := public.academy_exiger_staff();
  v_lecon record; v_correcte boolean; v_prog record; v_statut text;
begin
  perform set_config('academy.serveur', 'on', true);
  select l.*, v.statut as version_statut into v_lecon from public.academy_lecons l join public.academy_module_versions v on v.id = l.version_id
   where l.id = p_lecon_id and (v.statut = 'publie' or public.est_admin_academy());
  if v_lecon is null then raise exception 'Lecon introuvable' using errcode = 'P0002'; end if;
  v_correcte := (v_lecon.mini_reponse is null) or (p_reponse is not null and p_reponse = v_lecon.mini_reponse);
  insert into public.academy_progression_lecons (profile_id, lecon_id, version_id)
  values (v_uid, p_lecon_id, v_lecon.version_id) on conflict (profile_id, lecon_id) do nothing;
  if v_correcte then
    update public.academy_progression_lecons
       set mini_question_reussie_le = coalesce(mini_question_reussie_le, now()),
           terminee_le = coalesce(terminee_le, now()), updated_at = now()
     where profile_id = v_uid and lecon_id = p_lecon_id
     returning * into v_prog;
    if v_prog.terminee_le >= now() - interval '2 seconds' then
      perform public.academy_evenement(v_uid, 'lecon_terminee', v_lecon.version_id, jsonb_build_object('lecon_id', p_lecon_id, 'titre', v_lecon.titre));
    end if;
  end if;
  v_statut := public.academy_recalculer_statut(v_uid, v_lecon.version_id);
  return jsonb_build_object(
    'correcte', v_correcte,
    'explication', coalesce(v_lecon.mini_question ->> 'explication', ''),
    'terminee_le', (select terminee_le from public.academy_progression_lecons where profile_id = v_uid and lecon_id = p_lecon_id),
    'statut_module', v_statut
  );
end;
$function$;

-- ── 4. Quiz : tirage, soumission, corrige ──────────────────────────────────
create or replace function public.academy_presenter_tentative(p_tentative_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare t record;
begin
  select * into t from public.academy_tentatives where id = p_tentative_id;
  return jsonb_build_object(
    'tentative_id', t.id, 'type', t.type, 'numero', t.numero, 'total', jsonb_array_length(t.questions),
    'demarree_le', t.demarree_le, 'version_id', t.version_id,
    'seuil', t.seuil,
    'questions', (
      select jsonb_agg(jsonb_build_object(
        'question_id', q.id, 'type', q.type, 'enonce', q.enonce, 'lecon_id', q.lecon_id, 'competence', q.competence,
        'choix', (select jsonb_agg(q.choix -> (o.idx)::int order by o.pos)
                  from jsonb_array_elements_text(e.elem -> 'ordre') with ordinality o(idx, pos))
      ) order by e.pos)
      from jsonb_array_elements(t.questions) with ordinality e(elem, pos)
      join public.academy_questions q on q.id = (e.elem ->> 'question_id')::uuid
    )
  );
end;
$function$;

create or replace function public.academy_ouvrir_tentative(p_version_id uuid, p_type text, p_jeton uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := public.academy_exiger_staff();
  v_version record; v_prm record;
  v_n integer; v_lecons integer; v_terminees integer;
  v_precedentes uuid[]; v_pool_taille integer;
  v_questions jsonb; v_numero integer; v_id uuid; v_rev record;
begin
  if p_type not in ('quiz', 'revision_j7', 'revision_j30') then raise exception 'Type de tentative inconnu'; end if;
  select * into v_prm from public.academy_parametres where id = true;
  select * into v_version from public.academy_module_versions where id = p_version_id and (statut = 'publie' or public.est_admin_academy());
  if v_version is null then raise exception 'Module introuvable ou non publie' using errcode = 'P0002'; end if;

  -- Idempotence : le meme jeton rend la meme tentative.
  select id into v_id from public.academy_tentatives where jeton_client = p_jeton and profile_id = v_uid;
  if v_id is not null then return public.academy_presenter_tentative(v_id); end if;

  -- Une tentative ouverte non soumise du meme type est reprise plutot que doublee.
  select id into v_id from public.academy_tentatives
   where profile_id = v_uid and version_id = p_version_id and type = p_type and soumise_le is null
   order by demarree_le desc limit 1;
  if v_id is not null then return public.academy_presenter_tentative(v_id); end if;

  if p_type = 'quiz' then
    select count(*) into v_lecons from public.academy_lecons where version_id = p_version_id;
    select count(*) into v_terminees from public.academy_progression_lecons where profile_id = v_uid and version_id = p_version_id and terminee_le is not null;
    if v_terminees < v_lecons then
      raise exception 'Terminez les % lecons avant le quiz (% terminee(s))', v_lecons, v_terminees using errcode = 'P0001';
    end if;
    v_n := v_prm.questions_par_quiz;
  else
    select * into v_rev from public.academy_revisions
     where profile_id = v_uid and version_id = p_version_id and type = case p_type when 'revision_j7' then 'J7' else 'J30' end;
    if v_rev is null then raise exception 'Aucune revision programmee pour ce module' using errcode = 'P0002'; end if;
    if v_rev.tentative_id is not null then raise exception 'Cette revision est deja faite' using errcode = 'P0001'; end if;
    if v_rev.echeance > public.academy_aujourdhui() then raise exception 'Cette revision sera due le %', to_char(v_rev.echeance, 'DD/MM/YYYY') using errcode = 'P0001'; end if;
    v_n := v_prm.questions_par_revision;
  end if;

  -- Questions de la derniere tentative de cette personne sur cette version,
  -- exclues du tirage tant que la banque le permet.
  select coalesce(array_agg((e ->> 'question_id')::uuid), '{}') into v_precedentes
    from (select questions from public.academy_tentatives where profile_id = v_uid and version_id = p_version_id order by demarree_le desc limit 1) t,
         jsonb_array_elements(t.questions) e;
  select count(*) into v_pool_taille from public.academy_questions q
   where q.version_id = p_version_id and q.archive_le is null and not (q.id = any (v_precedentes));
  if v_pool_taille < v_n then v_precedentes := '{}'; end if;

  -- Tirage equilibre par lecon : une question par lecon a tour de role, dans
  -- un ordre aleatoire, puis les choix melanges.
  with candidates as (
    select q.id, q.lecon_id, jsonb_array_length(q.choix) as nb_choix,
           row_number() over (partition by q.lecon_id order by random()) as rang, random() as alea
    from public.academy_questions q
    where q.version_id = p_version_id and q.archive_le is null and not (q.id = any (v_precedentes))
  ), tirees as (
    select id, nb_choix, alea from candidates order by rang, alea limit v_n
  )
  select jsonb_agg(jsonb_build_object('question_id', t.id,
           'ordre', (select jsonb_agg(i order by random()) from generate_series(0, greatest(t.nb_choix, 1) - 1) i))
         order by random())
    into v_questions from tirees t;
  if v_questions is null or jsonb_array_length(v_questions) = 0 then
    raise exception 'Aucune question disponible pour ce module' using errcode = 'P0002';
  end if;

  select coalesce(max(numero), 0) + 1 into v_numero from public.academy_tentatives
   where profile_id = v_uid and version_id = p_version_id and type = p_type;
  insert into public.academy_tentatives (profile_id, version_id, type, numero, questions, jeton_client, seuil)
  values (v_uid, p_version_id, p_type, v_numero, v_questions, p_jeton, v_version.seuil_reussite)
  on conflict (jeton_client) do nothing;
  select id into v_id from public.academy_tentatives where jeton_client = p_jeton and profile_id = v_uid;
  perform public.academy_recalculer_statut(v_uid, p_version_id);
  return public.academy_presenter_tentative(v_id);
end;
$function$;

create or replace function public.academy_soumettre_tentative(p_tentative_id uuid, p_reponses jsonb)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := public.academy_exiger_staff();
  t record; e record; v_prm record; v_version record;
  v_ordre jsonb; v_presente int; v_original int; v_bonne int; v_bonne_presentee int;
  v_correcte boolean; v_score int := 0; v_total int := 0;
  v_corrections jsonb := '[]'::jsonb; v_resultat jsonb;
  v_reussie boolean; v_valide boolean := false; v_deja_valide boolean;
  v_lecons int; v_terminees int; v_numero text; v_attestation jsonb;
  v_type_rev text; v_statut text;
begin
  perform set_config('academy.serveur', 'on', true);
  select * into t from public.academy_tentatives where id = p_tentative_id and profile_id = v_uid for update;
  if t is null then raise exception 'Tentative introuvable' using errcode = 'P0002'; end if;
  if t.soumise_le is not null then return t.resultat; end if;
  if p_reponses is null or jsonb_typeof(p_reponses) <> 'object' then p_reponses := '{}'::jsonb; end if;
  select * into v_prm from public.academy_parametres where id = true;
  select * into v_version from public.academy_module_versions where id = t.version_id;

  for e in
    select elem, pos from jsonb_array_elements(t.questions) with ordinality x(elem, pos)
  loop
    v_total := v_total + 1;
    v_ordre := e.elem -> 'ordre';
    select c.bonne_reponse into v_bonne from public.academy_corriges c where c.question_id = (e.elem ->> 'question_id')::uuid;
    v_presente := null;
    begin
      v_presente := (p_reponses ->> (e.elem ->> 'question_id'))::int;
    exception when others then v_presente := null; end;
    if v_presente is not null and v_presente >= 0 and v_presente < jsonb_array_length(v_ordre) then
      v_original := (v_ordre ->> v_presente)::int;
    else
      v_presente := null; v_original := null;
    end if;
    v_correcte := (v_original is not null and v_bonne is not null and v_original = v_bonne);
    if v_correcte then v_score := v_score + 1; end if;
    -- Position de la bonne reponse dans l ordre presente.
    select (o.pos - 1)::int into v_bonne_presentee from jsonb_array_elements_text(v_ordre) with ordinality o(idx, pos) where o.idx::int = v_bonne limit 1;
    insert into public.academy_reponses (tentative_id, question_id, reponse, correcte)
    values (t.id, (e.elem ->> 'question_id')::uuid, v_original, v_correcte)
    on conflict (tentative_id, question_id) do nothing;
    v_corrections := v_corrections || jsonb_build_object(
      'question_id', e.elem ->> 'question_id',
      'reponse', v_presente,
      'bonne_reponse', v_bonne_presentee,
      'correcte', v_correcte,
      'explication', (select c.explication from public.academy_corriges c where c.question_id = (e.elem ->> 'question_id')::uuid),
      'lecon_id', (select q.lecon_id from public.academy_questions q where q.id = (e.elem ->> 'question_id')::uuid),
      'competence', (select q.competence from public.academy_questions q where q.id = (e.elem ->> 'question_id')::uuid)
    );
  end loop;

  v_reussie := v_total > 0 and (v_score::numeric / v_total) >= coalesce(t.seuil, v_version.seuil_reussite);
  select exists (select 1 from public.academy_validations where profile_id = v_uid and version_id = t.version_id) into v_deja_valide;

  if t.type = 'quiz' and v_reussie and not v_deja_valide then
    select count(*) into v_lecons from public.academy_lecons where version_id = t.version_id;
    select count(*) into v_terminees from public.academy_progression_lecons where profile_id = v_uid and version_id = t.version_id and terminee_le is not null;
    if v_terminees >= v_lecons then
      insert into public.academy_validations (profile_id, version_id, tentative_id) values (v_uid, t.version_id, t.id)
      on conflict (profile_id, version_id) do nothing;
      v_valide := true;
      -- Attestation interne, numerotee par annee.
      select 'EA-' || to_char(now(), 'YYYY') || '-' || lpad((count(*) + 1)::text, 4, '0') into v_numero
        from public.academy_attestations where delivree_le >= date_trunc('year', now());
      insert into public.academy_attestations (numero, profile_id, version_id, tentative_id, score, total)
      values (v_numero, v_uid, t.version_id, t.id, v_score, v_total)
      on conflict (profile_id, version_id) do nothing;
      insert into public.academy_revisions (profile_id, version_id, type, echeance)
      values (v_uid, t.version_id, 'J7', public.academy_aujourdhui() + v_prm.delai_j7),
             (v_uid, t.version_id, 'J30', public.academy_aujourdhui() + v_prm.delai_j30)
      on conflict (profile_id, version_id, type) do nothing;
      perform public.academy_evenement(v_uid, 'module_valide', t.version_id, jsonb_build_object('tentative_id', t.id, 'score', v_score, 'total', v_total));
    end if;
  end if;

  if t.type in ('revision_j7', 'revision_j30') then
    v_type_rev := case t.type when 'revision_j7' then 'J7' else 'J30' end;
    update public.academy_revisions
       set tentative_id = t.id, resultat = case when v_reussie then 'reussie' else 'echouee' end, faite_le = now()
     where profile_id = v_uid and version_id = t.version_id and type = v_type_rev and tentative_id is null;
    perform public.academy_evenement(v_uid, 'revision_faite', t.version_id, jsonb_build_object('type', v_type_rev, 'reussie', v_reussie, 'score', v_score, 'total', v_total));
  end if;

  select jsonb_build_object('numero', numero, 'delivree_le', delivree_le) into v_attestation
    from public.academy_attestations where profile_id = v_uid and version_id = t.version_id;

  v_resultat := jsonb_build_object(
    'tentative_id', t.id, 'type', t.type, 'numero', t.numero,
    'score', v_score, 'total', v_total,
    'pourcentage', case when v_total > 0 then round(100.0 * v_score / v_total) else 0 end,
    'seuil', coalesce(t.seuil, v_version.seuil_reussite),
    'reussie', v_reussie, 'module_valide', v_valide or v_deja_valide,
    'attestation', v_attestation,
    'corrections', v_corrections,
    'soumise_le', now()
  );
  update public.academy_tentatives
     set soumise_le = now(), score = v_score, total = v_total, reussie = v_reussie,
         duree_s = greatest(0, extract(epoch from (now() - demarree_le)))::int,
         resultat = v_resultat
   where id = t.id;
  perform public.academy_evenement(v_uid, 'tentative_soumise', t.version_id, jsonb_build_object('tentative_id', t.id, 'type', t.type, 'score', v_score, 'total', v_total, 'reussie', v_reussie));
  v_statut := public.academy_recalculer_statut(v_uid, t.version_id);
  return v_resultat || jsonb_build_object('statut_module', v_statut);
end;
$function$;

create or replace function public.academy_corrige(p_tentative_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_staff(); t record;
begin
  select * into t from public.academy_tentatives where id = p_tentative_id;
  if t is null or t.soumise_le is null then raise exception 'Corrige indisponible' using errcode = 'P0002'; end if;
  if t.profile_id <> v_uid and not public.est_admin_academy() then
    raise exception 'Corrige reserve a son auteur' using errcode = '42501';
  end if;
  return t.resultat;
end;
$function$;

-- ── 5. Administration ──────────────────────────────────────────────────────
create or replace function public.academy_affecter(p_profile_ids uuid[], p_module_id uuid, p_parcours_id uuid, p_echeance date, p_obligatoire boolean default true)
returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := public.academy_exiger_admin();
  v_nb integer := 0; v_p uuid; r record; v_version uuid; v_inserted uuid;
begin
  if p_profile_ids is null or array_length(p_profile_ids, 1) is null then return 0; end if;
  foreach v_p in array p_profile_ids loop
    if not exists (select 1 from public.profiles where id = v_p and is_active = true) then continue; end if;
    if p_parcours_id is not null then
      for r in
        select pm.module_id, pm.ordre, pm.obligatoire, pm.delai_jours,
               (select v.id from public.academy_module_versions v where v.module_id = pm.module_id and v.statut = 'publie' order by v.numero desc limit 1) as version_id
        from public.academy_parcours_modules pm where pm.parcours_id = p_parcours_id order by pm.ordre
      loop
        if r.version_id is null then continue; end if;
        insert into public.academy_affectations (profile_id, module_id, version_id, parcours_id, obligatoire, echeance, affecte_par)
        values (v_p, r.module_id, r.version_id, p_parcours_id, coalesce(p_obligatoire, r.obligatoire),
                coalesce(p_echeance, case when r.delai_jours is not null then public.academy_aujourdhui() + r.delai_jours end), v_uid)
        on conflict (profile_id, version_id) do nothing
        returning id into v_inserted;
        if v_inserted is not null then
          v_nb := v_nb + 1;
          perform public.academy_evenement(v_p, 'affectation_creee', r.version_id, jsonb_build_object('parcours_id', p_parcours_id, 'echeance', p_echeance));
          perform public.academy_recalculer_statut(v_p, r.version_id);
        end if;
        v_inserted := null;
      end loop;
    elsif p_module_id is not null then
      select v.id into v_version from public.academy_module_versions v where v.module_id = p_module_id and v.statut = 'publie' order by v.numero desc limit 1;
      if v_version is null then raise exception 'Ce module n a pas de version publiee' using errcode = 'P0001'; end if;
      insert into public.academy_affectations (profile_id, module_id, version_id, obligatoire, echeance, affecte_par)
      values (v_p, p_module_id, v_version, coalesce(p_obligatoire, true), p_echeance, v_uid)
      on conflict (profile_id, version_id) do nothing
      returning id into v_inserted;
      if v_inserted is not null then
        v_nb := v_nb + 1;
        perform public.academy_evenement(v_p, 'affectation_creee', v_version, jsonb_build_object('echeance', p_echeance));
        perform public.academy_recalculer_statut(v_p, v_version);
      end if;
      v_inserted := null;
    end if;
  end loop;
  perform public.academy_journaliser('affecter', coalesce(p_parcours_id::text, p_module_id::text),
    jsonb_build_object('profils', array_length(p_profile_ids, 1), 'creees', v_nb, 'echeance', p_echeance));
  return v_nb;
end;
$function$;

create or replace function public.academy_modifier_echeance(p_affectation_id uuid, p_echeance date, p_obligatoire boolean default null)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_admin();
begin
  update public.academy_affectations
     set echeance = p_echeance, obligatoire = coalesce(p_obligatoire, obligatoire), updated_at = now()
   where id = p_affectation_id;
  if not found then raise exception 'Affectation introuvable' using errcode = 'P0002'; end if;
  perform public.academy_journaliser('modifier_echeance', p_affectation_id::text, jsonb_build_object('echeance', p_echeance, 'obligatoire', p_obligatoire));
end;
$function$;

create or replace function public.academy_retirer_affectation(p_affectation_id uuid)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_admin(); a record;
begin
  select * into a from public.academy_affectations where id = p_affectation_id;
  if a is null then return; end if;
  if a.statut = 'valide' then raise exception 'Une affectation validee ne se retire pas : la preuve de realisation reste' using errcode = 'P0001'; end if;
  delete from public.academy_affectations where id = p_affectation_id;
  perform public.academy_journaliser('retirer_affectation', p_affectation_id::text, jsonb_build_object('profile_id', a.profile_id, 'version_id', a.version_id));
end;
$function$;

create or replace function public.academy_nouvelle_version(p_module_id uuid)
returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := public.academy_exiger_admin();
  src record; v_new uuid; v_numero integer; l record; q record; v_new_lecon uuid; v_new_q uuid;
  v_map jsonb := '{}'::jsonb;
begin
  if exists (select 1 from public.academy_module_versions where module_id = p_module_id and statut = 'brouillon') then
    select id into v_new from public.academy_module_versions where module_id = p_module_id and statut = 'brouillon' order by numero desc limit 1;
    return v_new;
  end if;
  select * into src from public.academy_module_versions where module_id = p_module_id order by (statut = 'publie') desc, numero desc limit 1;
  if src is null then raise exception 'Module sans version' using errcode = 'P0002'; end if;
  select coalesce(max(numero), 0) + 1 into v_numero from public.academy_module_versions where module_id = p_module_id;
  insert into public.academy_module_versions (module_id, numero, statut, titre, objectif, competence, duree_minutes, prerequis, seuil_reussite, cas_pratique, a_completer, sources, fictif, created_by)
  values (p_module_id, v_numero, 'brouillon', src.titre, src.objectif, src.competence, src.duree_minutes, src.prerequis, src.seuil_reussite, src.cas_pratique, src.a_completer, src.sources, src.fictif, v_uid)
  returning id into v_new;
  for l in select * from public.academy_lecons where version_id = src.id order by ordre loop
    insert into public.academy_lecons (version_id, ordre, slug, titre, objectif, duree_minutes, contenu_md, mini_question, mini_reponse, sources)
    values (v_new, l.ordre, l.slug, l.titre, l.objectif, l.duree_minutes, l.contenu_md, l.mini_question, l.mini_reponse, l.sources)
    returning id into v_new_lecon;
    v_map := v_map || jsonb_build_object(l.id::text, v_new_lecon::text);
  end loop;
  for q in select q.*, c.bonne_reponse, c.explication from public.academy_questions q left join public.academy_corriges c on c.question_id = q.id where q.version_id = src.id order by q.cle loop
    insert into public.academy_questions (version_id, lecon_id, cle, type, competence, enonce, choix, difficulte, archive_le)
    values (v_new, case when q.lecon_id is null then null else (v_map ->> q.lecon_id::text)::uuid end, q.cle, q.type, q.competence, q.enonce, q.choix, q.difficulte, q.archive_le)
    returning id into v_new_q;
    insert into public.academy_corriges (question_id, bonne_reponse, explication) values (v_new_q, coalesce(q.bonne_reponse, 0), coalesce(q.explication, ''));
  end loop;
  perform public.academy_journaliser('nouvelle_version', v_new::text, jsonb_build_object('module_id', p_module_id, 'numero', v_numero, 'source', src.id));
  return v_new;
end;
$function$;

create or replace function public.academy_enregistrer_question(p_version_id uuid, p_question_id uuid, p_patch jsonb)
returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_admin(); v_id uuid; v_statut text;
begin
  select statut into v_statut from public.academy_module_versions where id = p_version_id;
  if v_statut is distinct from 'brouillon' then raise exception 'Seul un brouillon se modifie' using errcode = 'check_violation'; end if;
  if p_question_id is null then
    insert into public.academy_questions (version_id, lecon_id, cle, type, competence, enonce, choix, difficulte)
    values (p_version_id, nullif(p_patch ->> 'lecon_id', '')::uuid, coalesce(p_patch ->> 'cle', 'q' || (select lpad((count(*) + 1)::text, 2, '0') from public.academy_questions where version_id = p_version_id)),
            coalesce(p_patch ->> 'type', 'qcm'), coalesce(p_patch ->> 'competence', ''), coalesce(p_patch ->> 'enonce', ''),
            coalesce(p_patch -> 'choix', '[]'::jsonb), coalesce((p_patch ->> 'difficulte')::smallint, 2))
    returning id into v_id;
    insert into public.academy_corriges (question_id, bonne_reponse, explication)
    values (v_id, coalesce((p_patch ->> 'bonne_reponse')::smallint, 0), coalesce(p_patch ->> 'explication', ''));
  else
    update public.academy_questions set
      lecon_id = case when p_patch ? 'lecon_id' then nullif(p_patch ->> 'lecon_id', '')::uuid else lecon_id end,
      type = coalesce(p_patch ->> 'type', type), competence = coalesce(p_patch ->> 'competence', competence),
      enonce = coalesce(p_patch ->> 'enonce', enonce), choix = coalesce(p_patch -> 'choix', choix),
      difficulte = coalesce((p_patch ->> 'difficulte')::smallint, difficulte),
      archive_le = case when p_patch ? 'archive' then (case when (p_patch ->> 'archive')::boolean then now() else null end) else archive_le end,
      updated_at = now()
    where id = p_question_id and version_id = p_version_id;
    if not found then raise exception 'Question introuvable' using errcode = 'P0002'; end if;
    insert into public.academy_corriges (question_id, bonne_reponse, explication)
    values (p_question_id, coalesce((p_patch ->> 'bonne_reponse')::smallint, 0), coalesce(p_patch ->> 'explication', ''))
    on conflict (question_id) do update set
      bonne_reponse = coalesce((p_patch ->> 'bonne_reponse')::smallint, public.academy_corriges.bonne_reponse),
      explication = coalesce(p_patch ->> 'explication', public.academy_corriges.explication),
      updated_at = now();
    v_id := p_question_id;
  end if;
  return v_id;
end;
$function$;

create or replace function public.academy_enregistrer_lecon(p_version_id uuid, p_lecon_id uuid, p_patch jsonb)
returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_admin(); v_id uuid; v_statut text;
begin
  select statut into v_statut from public.academy_module_versions where id = p_version_id;
  if v_statut is distinct from 'brouillon' then raise exception 'Seul un brouillon se modifie' using errcode = 'check_violation'; end if;
  if p_lecon_id is null then
    insert into public.academy_lecons (version_id, ordre, slug, titre, objectif, duree_minutes, contenu_md, mini_question, mini_reponse, sources)
    values (p_version_id,
            coalesce((p_patch ->> 'ordre')::int, (select coalesce(max(ordre), 0) + 1 from public.academy_lecons where version_id = p_version_id)),
            coalesce(p_patch ->> 'slug', 'l' || (select coalesce(max(ordre), 0) + 1 from public.academy_lecons where version_id = p_version_id)),
            coalesce(p_patch ->> 'titre', 'Nouvelle lecon'), coalesce(p_patch ->> 'objectif', ''), coalesce((p_patch ->> 'duree_minutes')::int, 4),
            coalesce(p_patch ->> 'contenu_md', ''), coalesce(p_patch -> 'mini_question', '{}'::jsonb) - 'bonne_reponse',
            (p_patch -> 'mini_question' ->> 'bonne_reponse')::smallint, coalesce(p_patch -> 'sources', '[]'::jsonb))
    returning id into v_id;
  else
    update public.academy_lecons set
      titre = coalesce(p_patch ->> 'titre', titre), objectif = coalesce(p_patch ->> 'objectif', objectif),
      duree_minutes = coalesce((p_patch ->> 'duree_minutes')::int, duree_minutes),
      contenu_md = coalesce(p_patch ->> 'contenu_md', contenu_md),
      mini_question = case when p_patch ? 'mini_question' then (p_patch -> 'mini_question') - 'bonne_reponse' else mini_question end,
      mini_reponse = case when p_patch ? 'mini_question' then (p_patch -> 'mini_question' ->> 'bonne_reponse')::smallint else mini_reponse end,
      sources = coalesce(p_patch -> 'sources', sources),
      ordre = coalesce((p_patch ->> 'ordre')::int, ordre),
      updated_at = now()
    where id = p_lecon_id and version_id = p_version_id;
    if not found then raise exception 'Lecon introuvable' using errcode = 'P0002'; end if;
    v_id := p_lecon_id;
  end if;
  return v_id;
end;
$function$;

-- Lecture d une version pour l administration : contenu complet, corriges
-- inclus (brouillon, publie ou archive). Reserve a l administrateur.
create or replace function public.academy_version_admin(p_version_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_admin(); v jsonb;
begin
  select jsonb_build_object(
    'id', mv.id, 'module_id', mv.module_id, 'slug', m.slug, 'theme', m.theme, 'niveau', m.niveau, 'ordre', m.ordre,
    'numero', mv.numero, 'statut', mv.statut, 'titre', mv.titre, 'objectif', mv.objectif, 'competence', mv.competence,
    'duree_minutes', mv.duree_minutes, 'prerequis', mv.prerequis, 'seuil_reussite', mv.seuil_reussite,
    'cas_pratique', mv.cas_pratique, 'a_completer', mv.a_completer, 'sources', mv.sources, 'fictif', mv.fictif,
    'publie_le', mv.publie_le, 'relu_par', mv.relu_par, 'relu_le', mv.relu_le, 'commentaire_relecture', mv.commentaire_relecture, 'archive_le', mv.archive_le,
    'lecons', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'ordre', l.ordre, 'slug', l.slug, 'titre', l.titre, 'objectif', l.objectif,
        'duree_minutes', l.duree_minutes, 'contenu_md', l.contenu_md, 'mini_question', l.mini_question || jsonb_build_object('bonne_reponse', l.mini_reponse), 'sources', l.sources) order by l.ordre)
        from public.academy_lecons l where l.version_id = mv.id), '[]'::jsonb),
    'questions', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'cle', q.cle, 'type', q.type, 'lecon_id', q.lecon_id, 'competence', q.competence,
        'enonce', q.enonce, 'choix', q.choix, 'difficulte', q.difficulte, 'archive_le', q.archive_le,
        'bonne_reponse', c.bonne_reponse, 'explication', c.explication,
        'statistiques', (select jsonb_build_object('reponses', count(*), 'correctes', count(*) filter (where r.correcte))
                         from public.academy_reponses r where r.question_id = q.id)) order by q.cle)
        from public.academy_questions q left join public.academy_corriges c on c.question_id = q.id where q.version_id = mv.id), '[]'::jsonb),
    'affectations', (select count(*) from public.academy_affectations a where a.version_id = mv.id),
    'validations', (select count(*) from public.academy_validations x where x.version_id = mv.id)
  ) into v
  from public.academy_module_versions mv join public.academy_modules m on m.id = mv.module_id where mv.id = p_version_id;
  if v is null then raise exception 'Version introuvable' using errcode = 'P0002'; end if;
  return v;
end;
$function$;

create or replace function public.academy_publier_version(p_version_id uuid, p_relu_par text, p_commentaire text default null, p_imposer_nouvelle_formation boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := public.academy_exiger_admin();
  v record; v_prm record; v_nb_lecons int; v_nb_q int; v_nb_sans_corrige int; v_ancienne uuid; v_nouvelles int := 0; a record;
begin
  select * into v from public.academy_module_versions where id = p_version_id for update;
  if v is null then raise exception 'Version introuvable' using errcode = 'P0002'; end if;
  if v.statut <> 'brouillon' then raise exception 'Seul un brouillon se publie' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_relu_par), '') = '' then raise exception 'Le nom du relecteur est obligatoire' using errcode = 'P0001'; end if;
  select * into v_prm from public.academy_parametres where id = true;
  select count(*) into v_nb_lecons from public.academy_lecons where version_id = p_version_id;
  select count(*) into v_nb_q from public.academy_questions where version_id = p_version_id and archive_le is null;
  select count(*) into v_nb_sans_corrige from public.academy_questions q where q.version_id = p_version_id and q.archive_le is null
     and not exists (select 1 from public.academy_corriges c where c.question_id = q.id);
  if v_nb_lecons = 0 then raise exception 'Une version publiee a au moins une lecon' using errcode = 'P0001'; end if;
  if v_nb_q < v_prm.questions_par_quiz then raise exception 'Il faut au moins % questions pour un quiz de %', v_prm.questions_par_quiz, v_prm.questions_par_quiz using errcode = 'P0001'; end if;
  if v_nb_sans_corrige > 0 then raise exception '% question(s) sans corrige', v_nb_sans_corrige using errcode = 'P0001'; end if;

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

create or replace function public.academy_archiver_version(p_version_id uuid)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_admin();
begin
  update public.academy_module_versions set statut = 'archive', archive_le = now(), updated_at = now() where id = p_version_id and statut = 'publie';
  if not found then raise exception 'Seule une version publiee s archive' using errcode = 'P0001'; end if;
  perform public.academy_evenement(null, 'version_archivee', p_version_id, '{}'::jsonb);
  perform public.academy_journaliser('archiver', p_version_id::text, '{}'::jsonb);
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
                        'nb_lecons', (select count(*) from public.academy_lecons l where l.version_id = v.id),
                        'nb_questions', (select count(*) from public.academy_questions q where q.version_id = v.id and q.archive_le is null),
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
        'parcours_id', a.parcours_id, 'obligatoire', a.obligatoire, 'echeance', a.echeance, 'statut', a.statut, 'created_at', a.created_at) order by a.created_at desc)
      from public.academy_affectations a join public.profiles pr on pr.id = a.profile_id join public.academy_module_versions v on v.id = a.version_id join public.academy_modules m on m.id = a.module_id), '[]'::jsonb),
    'journal', coalesce((select jsonb_agg(jsonb_build_object('id', j.id, 'survenu_le', j.survenu_le, 'nom', pr.full_name, 'action', j.action, 'cible', j.cible, 'detail', j.detail) order by j.survenu_le desc)
      from (select * from public.academy_journal_admin order by survenu_le desc limit 200) j left join public.profiles pr on pr.id = j.profile_id), '[]'::jsonb),
    'parametres', (select to_jsonb(p) - 'notice_donnees' from public.academy_parametres p where id = true)
  );
end;
$function$;

create or replace function public.academy_enregistrer_parcours(p_parcours_id uuid, p_patch jsonb)
returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_admin(); v_id uuid; e jsonb; i int := 0;
begin
  if p_parcours_id is null then
    insert into public.academy_parcours (slug, titre, description, ordre)
    values (coalesce(p_patch ->> 'slug', 'parcours-' || substr(gen_random_uuid()::text, 1, 8)), coalesce(p_patch ->> 'titre', 'Nouveau parcours'), coalesce(p_patch ->> 'description', ''), coalesce((p_patch ->> 'ordre')::int, 0))
    returning id into v_id;
  else
    update public.academy_parcours set titre = coalesce(p_patch ->> 'titre', titre), description = coalesce(p_patch ->> 'description', description),
      ordre = coalesce((p_patch ->> 'ordre')::int, ordre), archive_le = case when p_patch ? 'archive' then (case when (p_patch ->> 'archive')::boolean then now() else null end) else archive_le end, updated_at = now()
    where id = p_parcours_id;
    v_id := p_parcours_id;
  end if;
  if p_patch ? 'modules' then
    delete from public.academy_parcours_modules where parcours_id = v_id;
    for e in select * from jsonb_array_elements(p_patch -> 'modules') loop
      i := i + 1;
      insert into public.academy_parcours_modules (parcours_id, module_id, ordre, obligatoire, delai_jours)
      values (v_id, (e ->> 'module_id')::uuid, coalesce((e ->> 'ordre')::int, i), coalesce((e ->> 'obligatoire')::boolean, true), nullif(e ->> 'delai_jours', '')::int)
      on conflict (parcours_id, module_id) do update set ordre = excluded.ordre, obligatoire = excluded.obligatoire, delai_jours = excluded.delai_jours;
    end loop;
  end if;
  perform public.academy_journaliser('parcours', v_id::text, p_patch - 'modules');
  return v_id;
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
    sources = coalesce(p_patch -> 'sources', sources), fictif = coalesce((p_patch ->> 'fictif')::boolean, fictif), updated_at = now()
  where id = p_version_id and statut = 'brouillon';
  if not found then raise exception 'Seul un brouillon se modifie' using errcode = 'check_violation'; end if;
  if p_patch ? 'theme' or p_patch ? 'niveau' or p_patch ? 'ordre' then
    update public.academy_modules m set theme = coalesce(p_patch ->> 'theme', theme), niveau = coalesce(p_patch ->> 'niveau', niveau), ordre = coalesce((p_patch ->> 'ordre')::int, ordre), updated_at = now()
    where m.id = (select module_id from public.academy_module_versions where id = p_version_id);
  end if;
end;
$function$;

create or replace function public.academy_creer_module(p_slug text, p_titre text, p_theme text, p_niveau text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_admin(); v_mod uuid; v_ver uuid;
begin
  insert into public.academy_modules (slug, titre, theme, niveau, ordre, created_by)
  values (lower(regexp_replace(p_slug, '[^a-zA-Z0-9]+', '-', 'g')), p_titre, coalesce(p_theme, 'methode'), coalesce(p_niveau, 'fondamentaux'), (select coalesce(max(ordre), 0) + 1 from public.academy_modules), v_uid)
  returning id into v_mod;
  insert into public.academy_module_versions (module_id, numero, statut, titre, created_by) values (v_mod, 1, 'brouillon', p_titre, v_uid) returning id into v_ver;
  perform public.academy_journaliser('creer_module', v_mod::text, jsonb_build_object('slug', p_slug, 'titre', p_titre));
  return jsonb_build_object('module_id', v_mod, 'version_id', v_ver);
end;
$function$;

-- ── 6. Pilotage direction ──────────────────────────────────────────────────
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
    'indicateurs', (
      select jsonb_build_object(
        'actifs_periode', (select count(distinct profile_id) from (
            select profile_id from public.academy_intervalles where (v_depuis is null or fin >= v_depuis) and (v_jusqua is null or debut < v_jusqua)
            union select profile_id from public.academy_tentatives where soumise_le is not null and (v_depuis is null or soumise_le >= v_depuis) and (v_jusqua is null or soumise_le < v_jusqua)
            union select profile_id from public.academy_progression_lecons where (v_depuis is null or updated_at >= v_depuis) and (v_jusqua is null or updated_at < v_jusqua)) u
            where profile_id in (select profile_id from public.academy_affectations)),
        'affectes', (select count(distinct profile_id) from public.academy_affectations),
        'obligatoires_validees', (select count(*) from public.academy_affectations where obligatoire and statut = 'valide'),
        'obligatoires_total', (select count(*) from public.academy_affectations where obligatoire),
        'echues_non_validees', (select count(*) from public.academy_affectations where echeance is not null and echeance < v_auj and statut <> 'valide'),
        'echues_total', (select count(*) from public.academy_affectations where echeance is not null and echeance < v_auj),
        'premiere_reussite_num', (select count(*) from public.academy_tentatives where type = 'quiz' and numero = 1 and soumise_le is not null and reussie
                                   and (v_depuis is null or soumise_le >= v_depuis) and (v_jusqua is null or soumise_le < v_jusqua)),
        'premiere_reussite_den', (select count(*) from public.academy_tentatives where type = 'quiz' and numero = 1 and soumise_le is not null
                                   and (v_depuis is null or soumise_le >= v_depuis) and (v_jusqua is null or soumise_le < v_jusqua)),
        'revisions_en_attente', (select count(*) from public.academy_revisions where tentative_id is null and echeance <= v_auj),
        'temps_actif_s', (select coalesce(sum(public.academy_duree_active(pr.id, v_depuis, v_jusqua)), 0) from public.profiles pr where pr.id in (select profile_id from public.academy_affectations))
      )
    ),
    'lignes', coalesce((select jsonb_agg(jsonb_build_object(
        'profile_id', pr.id, 'nom', pr.full_name, 'advisor_code', pr.advisor_code, 'is_active', pr.is_active,
        'parcours', (select coalesce(jsonb_agg(distinct pa.titre), '[]'::jsonb) from public.academy_affectations a join public.academy_parcours pa on pa.id = a.parcours_id where a.profile_id = pr.id),
        'modules_affectes', (select count(*) from public.academy_affectations a where a.profile_id = pr.id),
        'modules_valides', (select count(*) from public.academy_affectations a where a.profile_id = pr.id and a.statut = 'valide'),
        'modules_en_cours', (select count(*) from public.academy_affectations a where a.profile_id = pr.id and a.statut = 'en_cours'),
        'modules_a_revoir', (select count(*) from public.academy_affectations a where a.profile_id = pr.id and a.statut = 'a_revoir'),
        'modules_non_commences', (select count(*) from public.academy_affectations a where a.profile_id = pr.id and a.statut = 'non_commence'),
        'retards', (select count(*) from public.academy_affectations a where a.profile_id = pr.id and a.echeance is not null and a.echeance < v_auj and a.statut <> 'valide'),
        'derniere_activite', (select max(x) from (
            select max(updated_at) x from public.academy_progression_lecons where profile_id = pr.id
            union all select max(soumise_le) from public.academy_tentatives where profile_id = pr.id
            union all select max(fin) from public.academy_intervalles where profile_id = pr.id) u),
        'temps_actif_s', public.academy_duree_active(pr.id, v_depuis, v_jusqua),
        'premier_score', (select jsonb_build_object('score', score, 'total', total, 'titre', v.titre, 'le', soumise_le) from public.academy_tentatives t join public.academy_module_versions v on v.id = t.version_id
                          where t.profile_id = pr.id and t.type = 'quiz' and t.soumise_le is not null and (v_depuis is null or t.soumise_le >= v_depuis) and (v_jusqua is null or t.soumise_le < v_jusqua) order by t.soumise_le asc limit 1),
        'dernier_score', (select jsonb_build_object('score', score, 'total', total, 'titre', v.titre, 'le', soumise_le, 'type', t.type) from public.academy_tentatives t join public.academy_module_versions v on v.id = t.version_id
                          where t.profile_id = pr.id and t.soumise_le is not null and (v_depuis is null or t.soumise_le >= v_depuis) and (v_jusqua is null or t.soumise_le < v_jusqua) order by t.soumise_le desc limit 1),
        'prochaine_revision', (select min(echeance) from public.academy_revisions r where r.profile_id = pr.id and r.tentative_id is null),
        'revisions_dues', (select count(*) from public.academy_revisions r where r.profile_id = pr.id and r.tentative_id is null and r.echeance <= v_auj),
        'a_examiner', (select coalesce(jsonb_agg(x.fait), '[]'::jsonb) from (
            select 'Quiz de ' || t.total || ' questions soumis en ' || t.duree_s || ' s (' || v.titre || ')' as fait
              from public.academy_tentatives t join public.academy_module_versions v on v.id = t.version_id
             where t.profile_id = pr.id and t.soumise_le is not null and t.duree_s < 20 and t.total >= 5
            union all
            select count(*) || ' echecs au quiz de ' || v.titre
              from public.academy_tentatives t join public.academy_module_versions v on v.id = t.version_id
             where t.profile_id = pr.id and t.type = 'quiz' and t.soumise_le is not null and t.reussie = false
             group by v.titre having count(*) >= 3) x)
      ) order by pr.full_name)
      from public.profiles pr
      where pr.is_active = true and (pr.id in (select profile_id from public.academy_affectations) or pr.id in (select profile_id from public.academy_tentatives))), '[]'::jsonb),
    'notions', coalesce((select jsonb_agg(jsonb_build_object('competence', x.competence, 'reponses', x.reponses, 'correctes', x.correctes, 'effectif', x.effectif, 'derniere_le', x.derniere_le) order by (x.correctes::numeric / greatest(x.reponses, 1)))
      from (select q.competence, count(*) as reponses, count(*) filter (where r.correcte) as correctes, count(distinct t.profile_id) as effectif, max(t.soumise_le) as derniere_le
              from public.academy_reponses r join public.academy_questions q on q.id = r.question_id join public.academy_tentatives t on t.id = r.tentative_id
             where t.soumise_le is not null and q.competence <> '' and (v_depuis is null or t.soumise_le >= v_depuis) and (v_jusqua is null or t.soumise_le < v_jusqua)
             group by q.competence having count(*) >= 3) x), '[]'::jsonb),
    'semaines', coalesce((select jsonb_agg(jsonb_build_object('semaine', s.semaine, 'valides', s.valides, 'affectations', s.affectations, 'temps_actif_s', s.temps) order by s.semaine)
      from (select w.semaine,
              (select count(*) from public.academy_validations x where date_trunc('week', x.valide_le at time zone 'Europe/Paris')::date = w.semaine) as valides,
              (select count(*) from public.academy_affectations a where date_trunc('week', a.created_at at time zone 'Europe/Paris')::date = w.semaine) as affectations,
              (select coalesce(sum(extract(epoch from (i.fin - i.debut))), 0)::int from public.academy_intervalles i where date_trunc('week', i.debut at time zone 'Europe/Paris')::date = w.semaine) as temps
            from (select distinct date_trunc('week', d at time zone 'Europe/Paris')::date as semaine from (
                    select valide_le d from public.academy_validations union all select created_at from public.academy_affectations union all select debut from public.academy_intervalles) z
                  where (v_depuis is null or d >= v_depuis) and (v_jusqua is null or d < v_jusqua)) w) s), '[]'::jsonb),
    'scores_competences', coalesce((select jsonb_agg(jsonb_build_object('competence', y.competence, 'type', y.type, 'moyenne_pct', y.moyenne, 'effectif', y.effectif, 'derniere_le', y.derniere_le) order by y.competence, y.type)
      from (select v.competence, case when t.type = 'quiz' then 'initial' else 'revision' end as type,
                   round(avg(100.0 * t.score / greatest(t.total, 1))) as moyenne, count(distinct t.profile_id) as effectif, max(t.soumise_le) as derniere_le
              from public.academy_tentatives t join public.academy_module_versions v on v.id = t.version_id
             where t.soumise_le is not null and (v_depuis is null or t.soumise_le >= v_depuis) and (v_jusqua is null or t.soumise_le < v_jusqua)
             group by v.competence, case when t.type = 'quiz' then 'initial' else 'revision' end) y), '[]'::jsonb),
    'definitions', jsonb_build_object(
      'actifs_periode', 'Collaborateurs affectes ayant eu au moins une activite acceptee (lecture, battement ou quiz) sur la periode, rapportes aux collaborateurs affectes.',
      'obligatoires', 'Affectations obligatoires validees rapportees aux affectations obligatoires du perimetre.',
      'echues', 'Affectations dont l echeance est passee et qui ne sont pas validees ; les affectations sans echeance ne comptent pas.',
      'premiere_reussite', 'Premieres tentatives de quiz reussies rapportees aux premieres tentatives soumises sur la periode.',
      'temps_actif', 'Somme des intervalles d activite acceptes, fusionnes par personne. Une lecture attentive sans interaction pendant plus de ' || v_prm.inactivite_secondes || ' secondes n est pas comptee.',
      'a_examiner', 'Faits bruts (quiz tres rapide, echecs repetes). Aucune qualification automatique.'
    )
  );
end;
$function$;

create or replace function public.academy_fiche(p_profile_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_staff(); v_auj date := public.academy_aujourdhui();
begin
  if p_profile_id <> v_uid and not (public.is_manager() or public.est_admin_academy()) then
    raise exception 'Fiche reservee a la direction' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'profil', (select jsonb_build_object('id', id, 'full_name', full_name, 'advisor_code', advisor_code, 'role', role, 'is_active', is_active) from public.profiles where id = p_profile_id),
    'affectations', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'version_id', a.version_id, 'slug', m.slug, 'titre', v.titre, 'competence', v.competence, 'theme', m.theme,
        'obligatoire', a.obligatoire, 'echeance', a.echeance, 'statut', a.statut, 'en_retard', (a.echeance is not null and a.echeance < v_auj and a.statut <> 'valide'),
        'lecons_terminees', (select count(*) from public.academy_progression_lecons p where p.profile_id = p_profile_id and p.version_id = a.version_id and p.terminee_le is not null),
        'nb_lecons', (select count(*) from public.academy_lecons l where l.version_id = a.version_id),
        'valide_le', (select valide_le from public.academy_validations x where x.profile_id = p_profile_id and x.version_id = a.version_id),
        'temps_actif_s', public.academy_duree_version(p_profile_id, a.version_id)) order by a.created_at)
      from public.academy_affectations a join public.academy_module_versions v on v.id = a.version_id join public.academy_modules m on m.id = a.module_id where a.profile_id = p_profile_id), '[]'::jsonb),
    'tentatives', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'version_id', t.version_id, 'titre', v.titre, 'competence', v.competence, 'type', t.type, 'numero', t.numero, 'soumise_le', t.soumise_le,
        'score', t.score, 'total', t.total, 'reussie', t.reussie, 'duree_s', t.duree_s) order by t.soumise_le desc)
      from public.academy_tentatives t join public.academy_module_versions v on v.id = t.version_id where t.profile_id = p_profile_id and t.soumise_le is not null), '[]'::jsonb),
    'revisions', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'version_id', r.version_id, 'titre', v.titre, 'type', r.type, 'echeance', r.echeance, 'resultat', r.resultat, 'faite_le', r.faite_le,
        'due', (r.tentative_id is null and r.echeance <= v_auj)) order by r.echeance)
      from public.academy_revisions r join public.academy_module_versions v on v.id = r.version_id where r.profile_id = p_profile_id), '[]'::jsonb),
    'evenements', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'survenu_le', e.survenu_le, 'type', e.type, 'version_id', e.version_id, 'titre', v.titre, 'detail', e.detail) order by e.survenu_le desc)
      from (select * from public.academy_evenements where profile_id = p_profile_id order by survenu_le desc limit 300) e left join public.academy_module_versions v on v.id = e.version_id), '[]'::jsonb),
    'semaines', coalesce((select jsonb_agg(jsonb_build_object('semaine', s.semaine, 'temps_actif_s', s.temps) order by s.semaine)
      from (select date_trunc('week', i.debut at time zone 'Europe/Paris')::date as semaine, sum(extract(epoch from (i.fin - i.debut)))::int as temps
              from public.academy_intervalles i where i.profile_id = p_profile_id group by 1) s), '[]'::jsonb),
    'commentaires', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'texte', c.texte, 'created_at', c.created_at, 'auteur', pr.full_name) order by c.created_at desc)
      from public.academy_commentaires_coaching c left join public.profiles pr on pr.id = c.auteur_id where c.profile_id = p_profile_id), '[]'::jsonb),
    'temps_actif_s', public.academy_duree_active(p_profile_id, null, null)
  );
end;
$function$;

create or replace function public.academy_matrice_competences()
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_uid uuid := public.academy_exiger_direction(); v_auj date := public.academy_aujourdhui();
begin
  return jsonb_build_object(
    'seuils', jsonb_build_object('acquis', 'module valide et derniere revision non echouee', 'a_renforcer', 'dernier quiz ou derniere revision sous le seuil du module', 'non_evalue', 'aucune tentative soumise'),
    'competences', coalesce((select jsonb_agg(jsonb_build_object('version_id', v.id, 'competence', v.competence, 'titre', v.titre, 'slug', m.slug) order by m.ordre)
      from public.academy_module_versions v join public.academy_modules m on m.id = v.module_id where v.statut = 'publie'), '[]'::jsonb),
    'lignes', coalesce((select jsonb_agg(jsonb_build_object('profile_id', pr.id, 'nom', pr.full_name,
        'cellules', (select coalesce(jsonb_agg(jsonb_build_object('version_id', v.id,
            'statut', case
              when not exists (select 1 from public.academy_tentatives t where t.profile_id = pr.id and t.version_id = v.id and t.soumise_le is not null) then 'non_evalue'
              when exists (select 1 from public.academy_validations x where x.profile_id = pr.id and x.version_id = v.id)
                   and not exists (select 1 from public.academy_revisions r where r.profile_id = pr.id and r.version_id = v.id and r.resultat = 'echouee'
                                   and r.faite_le = (select max(faite_le) from public.academy_revisions where profile_id = pr.id and version_id = v.id and faite_le is not null)) then 'acquis'
              else 'a_renforcer' end,
            'derniere_le', (select max(soumise_le) from public.academy_tentatives t where t.profile_id = pr.id and t.version_id = v.id and t.soumise_le is not null),
            'dernier_pct', (select round(100.0 * score / greatest(total, 1)) from public.academy_tentatives t where t.profile_id = pr.id and t.version_id = v.id and t.soumise_le is not null order by soumise_le desc limit 1)
          )), '[]'::jsonb)
          from public.academy_module_versions v where v.statut = 'publie')
      ) order by pr.full_name)
      from public.profiles pr where pr.is_active = true and pr.id in (select profile_id from public.academy_affectations)), '[]'::jsonb)
  );
end;
$function$;

-- ── 7. Retention : purge des intervalles bruts, agregats par jour ──────────
create or replace function public.academy_purger_intervalles()
returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare v_limite timestamptz; v_nb integer;
begin
  select now() - make_interval(months => retention_intervalles_mois) into v_limite from public.academy_parametres where id = true;
  insert into public.academy_durees_jour (profile_id, lecon_id, version_id, jour, secondes)
  select i.profile_id, i.lecon_id, s.version_id, (i.debut at time zone 'Europe/Paris')::date, sum(extract(epoch from (i.fin - i.debut)))::int
    from public.academy_intervalles i join public.academy_sessions s on s.id = i.session_id
   where i.fin < v_limite
   group by i.profile_id, i.lecon_id, s.version_id, (i.debut at time zone 'Europe/Paris')::date
  on conflict (profile_id, jour, lecon_id) do update set secondes = public.academy_durees_jour.secondes + excluded.secondes;
  delete from public.academy_intervalles where fin < v_limite;
  get diagnostics v_nb = row_count;
  return v_nb;
end;
$function$;

-- ── 8. Droits d execution ──────────────────────────────────────────────────
do $do$
declare f text;
begin
  foreach f in array array[
    'academy_aujourdhui()', 'academy_exiger_staff()', 'academy_exiger_admin()', 'academy_exiger_direction()',
    'academy_duree_active(uuid, timestamptz, timestamptz)', 'academy_duree_version(uuid, uuid)',
    'academy_catalogue()', 'academy_module(text)', 'academy_mon_parcours()', 'academy_mes_tentatives()', 'academy_mes_rappels()',
    'academy_lecon(uuid)', 'academy_ouvrir_session(uuid, uuid)', 'academy_battement(uuid)', 'academy_terminer_lecon(uuid, integer)',
    'academy_ouvrir_tentative(uuid, text, uuid)', 'academy_soumettre_tentative(uuid, jsonb)', 'academy_corrige(uuid)',
    'academy_affecter(uuid[], uuid, uuid, date, boolean)', 'academy_modifier_echeance(uuid, date, boolean)', 'academy_retirer_affectation(uuid)',
    'academy_nouvelle_version(uuid)', 'academy_enregistrer_question(uuid, uuid, jsonb)', 'academy_enregistrer_lecon(uuid, uuid, jsonb)',
    'academy_version_admin(uuid)', 'academy_publier_version(uuid, text, text, boolean)', 'academy_archiver_version(uuid)', 'academy_admin_vue()',
    'academy_enregistrer_parcours(uuid, jsonb)', 'academy_enregistrer_version(uuid, jsonb)', 'academy_creer_module(text, text, text, text)',
    'academy_pilotage(date, date)', 'academy_fiche(uuid)', 'academy_matrice_competences()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  -- Fonctions internes et purge : personne cote navigateur.
  foreach f in array array['academy_journaliser(text, text, jsonb)', 'academy_evenement(uuid, text, uuid, jsonb)', 'academy_recalculer_statut(uuid, uuid)', 'academy_presenter_tentative(uuid)', 'academy_purger_intervalles()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end
$do$;
