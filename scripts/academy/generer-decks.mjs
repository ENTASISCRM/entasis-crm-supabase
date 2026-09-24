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
// Schemas (22 septembre 2026) : un deck peut porter `schemas` (tableau de
// { cle, titre, svg, legende }, poses sur academy_module_versions.schemas)
// et un item peut porter `figure` ({ ref } vers une cle du deck, ou
// { svg, alt } propre a l exercice), fondu dans payload.figure. Les seeds 7
// les posent sur un deck neuf. Pour un deck DEJA seme (brouillon courant en
// base), le generateur emet en plus une migration 9 par deck qui complete
// ce brouillon : schemas remplaces par cle, figure posee sur les exercices
// existants reperes par (ordre, type) qui n en ont pas, exercices nouveaux
// inseres au dela du maximum. Seuls les items qui portent une figure vont
// dans la migration 9 : un exercice nouveau doit donc renvoyer a un schema.
// Sans deck a schema, les seeds 7 ressortent a l identique et aucune
// migration 9 n est ecrite.
//
// Garde fous : un svg de plus de 12 000 caracteres ou qui contient un motif
// interdit (script, gestionnaire on*, javascript:, foreignObject, image,
// href externe) arrete la generation. Le controle complet du guide de
// style est dans verifier-schemas.mjs (a lancer avant).
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

// Un schema tient sous cette taille (guide de style) ; au dela, la
// generation s arrete. L assainisseur client refuse a 24 000.
const LIMITE_SCHEMA = 12000
// Motifs qu un svg de la base ne porte jamais : le client les retire de
// toute facon (src/lib/academy/svg.js), mais on ne les seme pas.
const MOTIFS_INTERDITS = [
  { nom: '<script', re: /<script/i },
  { nom: 'gestionnaire on*=', re: /(^|[\s"'/<])on\w+\s*=/i },
  { nom: 'javascript:', re: /javascript:/i },
  { nom: '<foreignObject', re: /<foreignObject/i },
  { nom: '<image', re: /<image/i },
  { nom: 'href externe', re: /href\s*=\s*["']?\s*(https?:|\/\/)/i },
  { nom: 'adresse data: ou vbscript:', re: /=\s*["']?\s*(?:vbscript|data)\s*:/i },
]
// Taille au dela de laquelle un fichier de migration ne se colle plus dans
// l outil MCP (brief : 40 Ko).
const LIMITE_MIGRATION = 40000

// Ordre de generation : la trame d abord (elle rejoint le parcours
// Integration), puis les modules dans l ordre du catalogue.
const ORDRE = ['trame-rendez-vous-audit', 'methode-entasis', 'reussir-la-decouverte', 'per-et-retraite', 'assurance-vie', 'allocation-et-risques',
  'scpi-et-immobilier', 'fiscalite-raisonner', 'protection-sociale-dirigeant', 'transmission-approche-globale', 'conduire-un-rendez-vous', 'qualite-du-dossier', 'maitriser-le-crm']

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

const enteteSchemas = `-- Entasis Academy, migration 9 : schemas et figures des decks (brouillons).
--
-- Genere par scripts/academy/generer-decks.mjs depuis scripts/academy/decks/*.json :
-- ne pas editer a la main, regenerer. Complete le brouillon courant d un
-- module deja seme par la migration 7 : pose les schemas de la version
-- (remplacement par cle, les autres cles conservees), pose payload.figure
-- sur les exercices existants reperes par (ordre, type) qui n en ont pas
-- encore, insere les exercices nouveaux (ordre au dela du maximum existant)
-- avec leur corrige, ordre et association deja melanges. Idempotent. Une
-- version publiee n est jamais touchee : sans brouillon, raise notice et
-- rien. A appliquer apres la migration 8 (colonne academy_module_versions.schemas).
`

// Un exercice d ordre ou d association ne se seme jamais dans l ordre
// d auteur : une lecture de la table ne doit pas donner la reponse. Le
// melange est seede par le slug et la cle de l item pour que deux
// generations donnent le meme fichier (rejeu, md5).
function graine(texte) {
  let h = 2166136261
  for (const c of texte) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0 }
  return h
}
function aleatoire(seed) {
  let a = seed >>> 0
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
function permutation(n, rnd) {
  const p = Array.from({ length: n }, (_, k) => k)
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]] }
  // Jamais l identite quand il y a au moins deux elements.
  if (n > 1 && p.every((v, k) => v === k)) { [p[0], p[1]] = [p[1], p[0]] }
  return p
}
function melanger(slug, it) {
  const cle = it.type === 'ordre' ? 'elements' : (it.type === 'association' ? 'droite' : null)
  if (!cle) return it
  const liste = Array.isArray(it.payload?.[cle]) ? it.payload[cle] : []
  if (liste.length < 2) return it
  const perm = permutation(liste.length, aleatoire(graine(`${slug}:${it.cle}`)))
  const payload = { ...it.payload, [cle]: perm.map((k) => liste[k]) }
  const corrige = { ...(it.corrige || {}) }
  if (it.type === 'ordre') {
    const ordre = Array.isArray(corrige.ordre) ? corrige.ordre : liste.map((_, k) => k)
    corrige.ordre = ordre.map((k) => perm.indexOf(k))
  } else {
    const paires = Array.isArray(corrige.paires) ? corrige.paires : liste.map((_, k) => [k, k])
    corrige.paires = paires.map(([g, d]) => [g, perm.indexOf(d)])
  }
  return { ...it, payload, corrige }
}

// ── Schemas et figures ───────────────────────────────────────────────────────
/**
 * Refuse un svg trop long ou porteur d un motif interdit. `quoi` nomme la
 * piece dans le message (« schema frise », « figure de i42 ») pour qu un
 * agent de contenu la retrouve sans chercher.
 */
function verifierSvgSeme(slug, quoi, svg) {
  const t = String(svg ?? '')
  if (!t.trim()) throw new Error(`${slug} : ${quoi} sans svg`)
  if (t.length > LIMITE_SCHEMA) throw new Error(`${slug} : ${quoi} trop long (${t.length} caracteres, maximum ${LIMITE_SCHEMA})`)
  for (const m of MOTIFS_INTERDITS) {
    if (m.re.test(t)) throw new Error(`${slug} : ${quoi} contient un motif interdit (${m.nom})`)
  }
}

/** Les schemas d un deck, verifies : tableau (vide si absent), cles uniques. */
function schemasDuDeck(d) {
  if (d.schemas == null) return []
  if (!Array.isArray(d.schemas)) throw new Error(`${d.slug} : schemas doit etre un tableau`)
  const cles = new Set()
  return d.schemas.map((s) => {
    if (!s || typeof s !== 'object') throw new Error(`${d.slug} : schema mal forme`)
    const cle = String(s.cle ?? '').trim()
    if (!/^[a-z0-9_]+$/.test(cle)) throw new Error(`${d.slug} : cle de schema invalide « ${s.cle} » (minuscules, chiffres, soulignes)`)
    if (cles.has(cle)) throw new Error(`${d.slug} : schema ${cle} en double`)
    cles.add(cle)
    if (!String(s.titre ?? '').trim()) throw new Error(`${d.slug} : schema ${cle} sans titre`)
    if (!String(s.legende ?? '').trim()) throw new Error(`${d.slug} : schema ${cle} sans legende`)
    verifierSvgSeme(d.slug, `schema ${cle}`, s.svg)
    return { cle, titre: String(s.titre).trim(), svg: String(s.svg), legende: String(s.legende).trim() }
  })
}

/** La figure d un item, verifiee : { ref } vers une cle du deck, ou { svg, alt } ; null si absente. */
function figureDeLItem(d, it, cles) {
  if (it.figure == null) return null
  const f = it.figure
  if (!f || typeof f !== 'object') throw new Error(`${d.slug} : figure mal formee sur ${it.cle}`)
  if (f.ref != null) {
    if (f.svg != null || f.alt != null) throw new Error(`${d.slug} : figure de ${it.cle} : ref OU svg, pas les deux`)
    const ref = String(f.ref).trim()
    if (!cles.has(ref)) throw new Error(`${d.slug} : figure de ${it.cle} renvoie a un schema inconnu « ${ref} »`)
    return { ref }
  }
  if (!String(f.alt ?? '').trim()) throw new Error(`${d.slug} : figure propre de ${it.cle} sans alt`)
  verifierSvgSeme(d.slug, `figure de ${it.cle}`, f.svg)
  return { svg: String(f.svg), alt: String(f.alt).trim() }
}

/** Le payload seme : celui du deck, plus figure quand l item en porte une. */
function payloadSeme(it, figure) {
  return figure ? { ...it.payload, figure } : it.payload
}

/** Les deux insertions d un exercice (item puis corrige), avec son indentation. */
function sqlInsertionItem(it, ordre, indent) {
  return `${indent}insert into public.academy_items (version_id, ordre, type, competence, difficulte, payload)
${indent}values (v_ver, ${ordre}, ${q(it.type)}, ${q(it.competence || '')}, ${Math.min(3, Math.max(1, n(it.difficulte, 2)))}, ${j(it.payload)})
${indent}returning id into v_item;
${indent}insert into public.academy_items_corriges (item_id, corrige, explication) values (v_item, ${j(it.corrige || {})}, ${q(it.explication || '')});`
}

// ── Lecture des decks ────────────────────────────────────────────────────────
const decks = readdirSync(dossier).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dossier, f), 'utf8')))
  .sort((a, b) => ORDRE.indexOf(a.slug) - ORDRE.indexOf(b.slug))

const fichiers = []
const avertissements = []
decks.forEach((d, index) => {
  if (!Array.isArray(d.items) || d.items.length < 12) throw new Error(`${d.slug} : moins de 12 items`)
  for (const it of d.items) {
    if (!TYPES.has(it.type)) throw new Error(`${d.slug} : type inconnu ${it.type}`)
    if (!it.payload || typeof it.payload !== 'object') throw new Error(`${d.slug} : payload manquant sur ${it.cle}`)
  }
  const schemas = schemasDuDeck(d)
  const cles = new Set(schemas.map((s) => s.cle))
  // Les items avec leur figure fondue dans payload, puis melanges (le
  // melange conserve payload.figure puisqu il recopie le payload).
  const items = d.items.map((it) => {
    const figure = figureDeLItem(d, it, cles)
    return melanger(d.slug, { ...it, payload: payloadSeme(it, figure), figure })
  })
  const numero = String(index + 1).padStart(2, '0')
  const slugSql = d.slug.replace(/-/g, '_')

  // ── Seed 7 : le deck neuf ──
  const tagBloc = `$deck_${slugSql}$`
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
  update public.academy_module_versions set memo_md = ${q(d.memo_md || '')}, competence = coalesce(nullif(${q(d.competence || '')}, ''), competence)${schemas.length ? `, schemas = ${j(schemas)}` : ''}, updated_at = now() where id = v_ver;`)
  items.forEach((it, i) => {
    lignes.push(sqlInsertionItem(it, i + 1, '  '))
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
  fichiers.push({ nom: `20260921_academy_7_decks_${numero}_${slugSql}.sql`, contenu: entete + lignes.join('\n') })

  // ── Migration 9 : le brouillon deja seme ──
  const avecFigure = items.map((it, i) => ({ it, ordre: i + 1 })).filter(({ it }) => it.figure)
  if (!schemas.length && !avecFigure.length) return
  const tagSchemas = `$schemas_${slugSql}$`
  const l9 = []
  l9.push(`
-- ── Schemas : ${d.titre.replace(/--/g, ' ')} (${d.slug}) ──
do ${tagSchemas}
declare v_mod uuid; v_ver uuid; v_max integer; v_item uuid; v_nouveaux jsonb; v_conserves jsonb;
begin
  select id into v_mod from public.academy_modules where slug = ${q(d.slug)};
  if v_mod is null then
    raise notice 'academy_9_schemas : module % absent, rien a faire (semer la migration 7 d abord)', ${q(d.slug)};
    return;
  end if;
  select id into v_ver from public.academy_module_versions where module_id = v_mod and statut = 'brouillon' order by numero desc limit 1;
  if v_ver is null then
    raise notice 'academy_9_schemas : aucun brouillon pour %, rien a faire (une version publiee ne se modifie pas)', ${q(d.slug)};
    return;
  end if;`)
  if (schemas.length) {
    l9.push(`  -- Schemas de la version : les cles du deck remplacent les leurs, les autres restent.
  v_nouveaux := ${j(schemas)};
  select coalesce(jsonb_agg(s), '[]'::jsonb) into v_conserves
    from jsonb_array_elements(coalesce((select schemas from public.academy_module_versions where id = v_ver), '[]'::jsonb)) s
   where not exists (select 1 from jsonb_array_elements(v_nouveaux) x where x ->> 'cle' = s ->> 'cle');
  update public.academy_module_versions set schemas = v_conserves || v_nouveaux, updated_at = now() where id = v_ver;`)
  }
  if (avecFigure.length) {
    l9.push(`  -- Figures : posee sur l exercice existant (ordre, type) qui n en a pas ; au dela du maximum, exercice nouveau.
  select coalesce(max(ordre), 0) into v_max from public.academy_items where version_id = v_ver;`)
    for (const { it, ordre } of avecFigure) {
      l9.push(`  if v_max >= ${ordre} then
    update public.academy_items set payload = payload || jsonb_build_object('figure', ${j(it.figure)}), updated_at = now()
     where version_id = v_ver and ordre = ${ordre} and type = ${q(it.type)} and archive_le is null and not (payload ? 'figure');
  else
${sqlInsertionItem(it, ordre, '    ')}
  end if;`)
    }
  }
  l9.push(`end
${tagSchemas};
`)
  const nom9 = `20260922_academy_9_schemas_${numero}_${slugSql}.sql`
  const contenu9 = enteteSchemas + l9.join('\n')
  if (contenu9.length > LIMITE_MIGRATION) avertissements.push(`${nom9} fait ${contenu9.length} caracteres : au dela de ${LIMITE_MIGRATION}, il ne se colle pas dans l outil MCP (alleger les svg)`)
  fichiers.push({ nom: nom9, contenu: contenu9 })
})
for (const f of fichiers) writeFileSync(join(dest, f.nom), f.contenu)
process.stdout.write(fichiers.map((f) => `${f.nom} (${f.contenu.length} caracteres)`).join('\n') + '\n')
for (const a of avertissements) process.stderr.write(`Attention : ${a}\n`)
