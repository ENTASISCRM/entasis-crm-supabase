#!/usr/bin/env node
// Genere les migrations de seed des decks d exercices (mode entrainement,
// migration 7) a partir de scripts/academy/decks/*.json. Un fichier par
// deck, idempotent : si la version cible porte deja des items, le bloc ne
// fait rien.
//
// Version cible : le brouillon courant du module s il existe ; sinon, si
// le module n a qu une version publiee, une nouvelle version brouillon
// (numero + 1) qui reprend la fiche ; si le module n existe pas (la trame
// de rendez vous), le module et sa version 1. Le memo est pose sur la
// version cible. Les decks sont semes en BROUILLON : la publication est un
// geste de l administrateur.
//
// Usage : node scripts/academy/generer-decks.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ici = dirname(fileURLToPath(import.meta.url))
const dossier = join(ici, 'decks')
const dest = join(ici, '..', '..', 'supabase', 'migrations')
const TAG = '$academy_deck$'
const q = (s) => { const t = String(s ?? ''); if (t.includes(TAG)) throw new Error('tag dans le contenu'); return TAG + t + TAG }
const j = (v) => q(JSON.stringify(v ?? null)) + '::jsonb'
const n = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d)
const TYPES = new Set(['choix', 'vrai_faux', 'multi', 'ordre', 'association', 'trou_choix', 'trou_saisie', 'carte'])

// Ordre de generation : la trame d abord (elle rejoint le parcours
// Integration), puis les modules dans l ordre du catalogue.
const ORDRE = ['trame-rendez-vous-audit', 'methode-entasis', 'reussir-la-decouverte', 'per-et-retraite', 'assurance-vie', 'allocation-et-risques',
  'scpi-et-immobilier', 'fiscalite-raisonner', 'protection-sociale-dirigeant', 'transmission-approche-globale', 'conduire-un-rendez-vous', 'qualite-du-dossier', 'maitriser-le-crm']

const decks = readdirSync(dossier).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dossier, f), 'utf8')))
  .sort((a, b) => ORDRE.indexOf(a.slug) - ORDRE.indexOf(b.slug))

const entete = `-- Entasis Academy, migration 7 : les decks d exercices (mode entrainement).
--
-- Genere par scripts/academy/generer-decks.mjs depuis scripts/academy/decks/*.json :
-- ne pas editer a la main, regenerer. Un deck = un memo d une page et une
-- quarantaine d exercices (huit types), tout en BROUILLON, a relire avant
-- publication. Les corriges vont dans academy_items_corriges (illisible en
-- direct). Idempotent : une version qui porte deja des items est ignoree.
--
-- Contenu : la trame du rendez vous d audit patrimonial (deux pages de
-- Louis, 21 septembre 2026) et les douze modules du catalogue convertis
-- depuis leurs lecons verifiees, sans fait nouveau.
`

const fichiers = []
decks.forEach((d, index) => {
  if (!Array.isArray(d.items) || d.items.length < 12) throw new Error(`${d.slug} : moins de 12 items`)
  for (const it of d.items) {
    if (!TYPES.has(it.type)) throw new Error(`${d.slug} : type inconnu ${it.type}`)
    if (!it.payload || typeof it.payload !== 'object') throw new Error(`${d.slug} : payload manquant sur ${it.cle}`)
  }
  const tagBloc = `$deck_${d.slug.replace(/-/g, '_')}$`
  const lignes = []
  lignes.push(`
-- ── Deck : ${d.titre.replace(/--/g, ' ')} (${d.slug}) ──
do ${tagBloc}
declare v_mod uuid; v_ver uuid; v_numero integer; v_statut text; v_item uuid; v_p uuid;
begin
  select id into v_mod from public.academy_modules where slug = ${q(d.slug)};
  if v_mod is null then
    insert into public.academy_modules (slug, titre, theme, niveau, ordre)
    values (${q(d.slug)}, ${q(d.titre)}, ${q(d.theme || 'methode')}, ${q(d.niveau || 'fondamentaux')}, ${n(d.ordre, 0)})
    returning id into v_mod;
    insert into public.academy_module_versions (module_id, numero, statut, titre, objectif, competence, duree_minutes, prerequis, seuil_reussite, sources, memo_md)
    values (v_mod, 1, 'brouillon', ${q(d.titre)}, ${q(d.objectif || '')}, ${q(d.competence || '')}, ${n(d.duree_minutes, 10)}, '[]'::jsonb, 0.80, ${j(d.sources || [])}, '')
    returning id into v_ver;
  else
    select id into v_ver from public.academy_module_versions where module_id = v_mod and statut = 'brouillon' order by numero desc limit 1;
    if v_ver is null then
      select coalesce(max(numero), 0) + 1 into v_numero from public.academy_module_versions where module_id = v_mod;
      insert into public.academy_module_versions (module_id, numero, statut, titre, objectif, competence, duree_minutes, prerequis, seuil_reussite, cas_pratique, a_completer, sources, fictif, memo_md)
      select v_mod, v_numero, 'brouillon', titre, objectif, competence, duree_minutes, prerequis, seuil_reussite, cas_pratique, a_completer, sources, fictif, ''
        from public.academy_module_versions where module_id = v_mod order by (statut = 'publie') desc, numero desc limit 1
      returning id into v_ver;
    end if;
  end if;
  if exists (select 1 from public.academy_items where version_id = v_ver) then
    return;
  end if;
  update public.academy_module_versions set memo_md = ${q(d.memo_md || '')}, competence = coalesce(nullif(${q(d.competence || '')}, ''), competence), updated_at = now() where id = v_ver;`)
  d.items.forEach((it, i) => {
    lignes.push(`  insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
  values (v_ver, ${i + 1}, ${q(it.type)}, ${q(it.competence || '')}, ${Math.min(3, Math.max(1, n(it.difficulte, 2)))}, ${j(it.payload)})
  returning id into v_item;
  insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, ${j(it.corrige || {})}, ${q(it.explication || '')});`)
  })
  if (d.slug === 'trame-rendez-vous-audit') {
    lignes.push(`  -- La trame ouvre le parcours Integration.
  select id into v_p from public.academy_parcours where slug = 'integration-30-jours';
  if v_p is not null then
    insert into public.academy_parcours_modules (parcours_id, module_id, ordre, obligatoire, delai_jours)
    values (v_p, v_mod, 0, true, 7) on conflict (parcours_id, module_id) do nothing;
  end if;`)
  }
  lignes.push(`end
${tagBloc};
`)
  const nom = `20260921_academy_7_decks_${String(index + 1).padStart(2, '0')}_${d.slug.replace(/-/g, '_')}.sql`
  fichiers.push({ nom, contenu: entete + lignes.join('\n') })
})
for (const f of fichiers) writeFileSync(join(dest, f.nom), f.contenu)
process.stdout.write(fichiers.map((f) => `${f.nom} (${f.contenu.length} caracteres)`).join('\n') + '\n')
