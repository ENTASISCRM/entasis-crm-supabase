-- ═══════════════════════════════════════════════════════════════════════
-- Conformite des MANDATAIRES + delegation RH revocable (28/07/2026)
-- Deja appliquee en PROD via l outil de migration Supabase, reprise ici
-- pour que le depot reflete le schema.
--
-- 1. Tables de suivi : immatriculation INPI, habilitation ORIAS,
--    declarations URSSAF trimestrielles (echeances 30/04, 31/07, 31/10,
--    31/01 N+1) confrontees aux commissions versees par Entasis.
-- 2. La delegation RH devient une DONNEE revocable (profiles.rh_delegue)
--    au lieu d un identifiant code en dur dans is_rh().
-- 3. Defense en profondeur contre l injection d en-tetes mail :
--    profiles.email est modifiable par son titulaire et finit dans des
--    en-tetes SMTP (relances mandataires, feuille de temps).
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Delegation RH revocable ────────────────────────────────────────
alter table profiles add column if not exists rh_delegue boolean not null default false;

create or replace function public.is_rh()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_manager()
      or exists (
        select 1 from public.profiles
        where id = auth.uid() and rh_delegue and is_active
      )
$$;

-- Le drapeau n est pas auto attribuable (meme garde que le role)
create or replace function public.prevent_role_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and not public.is_manager() then
    raise exception 'Modification du role interdite';
  end if;
  if new.is_active is distinct from old.is_active and not public.is_manager() then
    raise exception 'Modification de is_active interdite';
  end if;
  if new.rh_delegue is distinct from old.rh_delegue and not public.is_manager() then
    raise exception 'Modification de la delegation RH interdite';
  end if;
  return new;
end;
$$;

-- Destinataires des notifications RH (fonction definer : un conseiller doit
-- pouvoir declencher le mail sans lire la table profiles)
create or replace function public.rh_direction_emails()
returns setof text language sql stable security definer set search_path = public as $$
  select email from profiles
  where email is not null and is_active and (
    (role = 'manager' and email like '%@entasis-conseil.fr')
    or rh_delegue
  )
$$;

alter table profiles drop constraint if exists profiles_email_format;
alter table profiles add constraint profiles_email_format
  check (email is null or email ~ '^[^\s@,;:<>"]+@[^\s@,;:<>"]+\.[A-Za-z]{2,}$');

-- ── 2. Fiches de conformite ───────────────────────────────────────────
create table if not exists mandataire_conformite (
  contrat_id uuid primary key references conseiller_contrats(id) on delete cascade,
  siren text,
  denomination text,
  forme_juridique text,
  inpi_statut text,                 -- actif / cessee / introuvable / a_verifier
  inpi_immatriculation date,
  inpi_verifie_le timestamptz,
  inpi_detail text,
  orias_numero text,
  orias_statut text,                -- ok / expire / a_verifier / ko
  orias_verifie_le date,
  orias_echeance date,
  notes text,
  updated_at timestamptz not null default now()
);
alter table mandataire_conformite enable row level security;
drop policy if exists mandataire_conformite_rh on mandataire_conformite;
create policy mandataire_conformite_rh on mandataire_conformite
  for all to authenticated using (public.is_rh()) with check (public.is_rh());

-- ── 3. Declarations URSSAF trimestrielles ─────────────────────────────
create table if not exists mandataire_urssaf (
  id uuid primary key default gen_random_uuid(),
  contrat_id uuid not null references conseiller_contrats(id) on delete cascade,
  annee int not null,
  trimestre int not null check (trimestre between 1 and 4),
  document_path text,               -- bucket contrats-rh, sous dossier urssaf
  montant_declare numeric,
  valide boolean not null default false,
  valide_par text,
  valide_le timestamptz,
  relance_le timestamptz,
  relance_par text,
  note text,
  updated_at timestamptz not null default now(),
  unique (contrat_id, annee, trimestre)
);
alter table mandataire_urssaf enable row level security;
drop policy if exists mandataire_urssaf_rh on mandataire_urssaf;
create policy mandataire_urssaf_rh on mandataire_urssaf
  for all to authenticated using (public.is_rh()) with check (public.is_rh());

create index if not exists idx_mandataire_urssaf_periode on mandataire_urssaf(annee, trimestre);

-- ── 4. Storage : les documents RH suivent is_rh() ─────────────────────
-- (bucket prive contrats-rh, deja cree ; policies renommees pour inclure
-- le RH delegue en plus des managers)
drop policy if exists "contrats_rh_select_manager" on storage.objects;
drop policy if exists "contrats_rh_insert_manager" on storage.objects;
drop policy if exists "contrats_rh_delete_manager" on storage.objects;
drop policy if exists "contrats_rh_select_rh" on storage.objects;
create policy "contrats_rh_select_rh" on storage.objects
  for select to authenticated using (bucket_id = 'contrats-rh' and public.is_rh());
drop policy if exists "contrats_rh_insert_rh" on storage.objects;
create policy "contrats_rh_insert_rh" on storage.objects
  for insert to authenticated with check (bucket_id = 'contrats-rh' and public.is_rh());
drop policy if exists "contrats_rh_delete_rh" on storage.objects;
create policy "contrats_rh_delete_rh" on storage.objects
  for delete to authenticated using (bucket_id = 'contrats-rh' and public.is_rh());
