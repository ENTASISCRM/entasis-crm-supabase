#!/usr/bin/env node
// Genere la migration de seed du catalogue Entasis Academy a partir des
// douze fichiers JSON de scripts/academy/catalogue/ (contenu redige, verifie
// a la source, puis corrige). Le SQL produit est idempotent : un module dont
// le slug existe deja n est ni duplique ni ecrase (les editions de
// l administrateur restent). Les versions sont semees en brouillon : la
// publication est un geste de l administrateur, apres relecture.
//
// Usage : node scripts/academy/generer-seed.mjs   (ecrit 13 fichiers dans supabase/migrations/)
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ici = dirname(fileURLToPath(import.meta.url))
const dossier = join(ici, 'catalogue')
const TAG = '$academy_seed$'

const q = (s) => {
  const t = String(s ?? '')
  if (t.includes(TAG)) throw new Error('Le contenu contient le tag de citation')
  return TAG + t + TAG
}
const j = (v) => q(JSON.stringify(v ?? null)) + '::jsonb'
const n = (v, defaut = 0) => (Number.isFinite(Number(v)) ? Number(v) : defaut)

const modules = readdirSync(dossier).filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(dossier, f), 'utf8')))
  .sort((a, b) => a.numero - b.numero)

const PARCOURS = [
  { slug: 'integration-30-jours', titre: 'Intégration, 30 jours', ordre: 1,
    description: 'Les premiers pas au cabinet : la méthode, le CRM, la découverte, la qualité du dossier et le rendez-vous.',
    modules: [['methode-entasis', 7], ['maitriser-le-crm', 7], ['reussir-la-decouverte', 14], ['qualite-du-dossier', 21], ['conduire-un-rendez-vous', 30]] },
  { slug: 'fondamentaux-du-conseiller', titre: 'Fondamentaux du conseiller', ordre: 2,
    description: 'Les six métiers du cabinet, un module chacun : retraite, assurance vie, allocation, immobilier, fiscalité, protection sociale.',
    modules: [['per-et-retraite', null], ['assurance-vie', null], ['allocation-et-risques', null], ['scpi-et-immobilier', null], ['fiscalite-raisonner', null], ['protection-sociale-dirigeant', null]] },
  { slug: 'perfectionnement', titre: 'Perfectionnement', ordre: 3,
    description: 'Approche globale et conduite du rendez-vous, pour les conseillers qui ont validé les fondamentaux.',
    modules: [['transmission-approche-globale', null], ['conduire-un-rendez-vous', null]] },
]

const lignes = []
const out = (s) => lignes.push(s)

out(`-- Entasis Academy, migration 3 : le catalogue seme.
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
`)

for (const m of modules) {
  const sourcesVersion = []
  const vues = new Set()
  for (const l of m.lecons) for (const s of l.sources || []) {
    const cle = (s.url || s.titre || '').trim()
    if (!cle || vues.has(cle)) continue
    vues.add(cle); sourcesVersion.push(s)
  }
  out(`
-- ── Module ${m.numero} : ${m.titre.replace(/--/g, ' ')} (${m.slug}) ──
do $seed_${m.slug.replace(/-/g, '_')}$
declare v_mod uuid; v_ver uuid; v_l1 uuid; v_l2 uuid; v_l3 uuid; v_q uuid; v_lecon uuid;
begin
  if exists (select 1 from public.academy_modules where slug = ${q(m.slug)}) then
    return;
  end if;
  insert into public.academy_modules (slug, titre, theme, niveau, ordre)
  values (${q(m.slug)}, ${q(m.titre)}, ${q(m.theme)}, ${q(m.niveau)}, ${n(m.numero)})
  returning id into v_mod;
  insert into public.academy_module_versions (module_id, numero, statut, titre, objectif, competence, duree_minutes, prerequis, seuil_reussite, cas_pratique, a_completer, sources, fictif)
  values (v_mod, 1, 'brouillon', ${q(m.titre)}, ${q(m.objectif)}, ${q(m.competence)}, ${n(m.duree_minutes, 15)}, ${j(m.prerequis || [])}, 0.80,
          ${j(m.cas_pratique || {})}, ${j(m.a_completer_par_le_cabinet || [])}, ${j(sourcesVersion)}, false)
  returning id into v_ver;`)
  m.lecons.forEach((l, i) => {
    const mq = l.mini_question || {}
    const mini = { enonce: mq.enonce || '', choix: mq.choix || [], explication: mq.explication || '', competence: mq.competence || '' }
    out(`  insert into public.academy_lecons (version_id, ordre, slug, titre, objectif, duree_minutes, contenu_md, mini_question, mini_reponse, sources)
  values (v_ver, ${i + 1}, ${q(l.slug)}, ${q(l.titre)}, ${q(l.objectif_observable)}, ${n(l.duree_minutes, 4)}, ${q(l.corps_markdown)}, ${j(mini)}, ${n(mq.bonne_reponse, 0)}, ${j(l.sources || [])})
  returning id into v_l${i + 1};`)
  })
  m.questions.forEach((qq) => {
    const idx = { l1: 'v_l1', l2: 'v_l2', l3: 'v_l3' }[qq.lecon] || 'null'
    out(`  insert into public.academy_questions (version_id, lecon_id, cle, type, competence, enonce, choix, difficulte)
  values (v_ver, ${idx}, ${q(qq.cle)}, ${q(qq.type)}, ${q(qq.competence)}, ${q(qq.enonce)}, ${j(qq.choix)}, ${Math.min(3, Math.max(1, n(qq.difficulte, 2)))})
  returning id into v_q;
  insert into public.academy_corriges (question_id, bonne_reponse, explication) values (v_q, ${n(qq.bonne_reponse, 0)}, ${q(qq.explication)});`)
  })
  out(`end
$seed_${m.slug.replace(/-/g, '_')}$;`)
}

out(`
-- ── Parcours ──`)
for (const p of PARCOURS) {
  out(`do $seed_parcours$
declare v_p uuid;
begin
  if exists (select 1 from public.academy_parcours where slug = ${q(p.slug)}) then return; end if;
  insert into public.academy_parcours (slug, titre, description, ordre) values (${q(p.slug)}, ${q(p.titre)}, ${q(p.description)}, ${p.ordre}) returning id into v_p;`)
  p.modules.forEach(([slug, delai], i) => {
    out(`  insert into public.academy_parcours_modules (parcours_id, module_id, ordre, obligatoire, delai_jours)
  select v_p, id, ${i + 1}, true, ${delai === null ? 'null' : delai} from public.academy_modules where slug = ${q(slug)}
  on conflict (parcours_id, module_id) do nothing;`)
  })
  out(`end
$seed_parcours$;`)
}

// Un fichier par module et un pour les parcours : l outil d application
// (MCP apply_migration) accepte mal un fichier de 600 Ko, et chaque bloc est
// independant. Ecrit dans supabase/migrations/ sous un nom provisoire.
import { writeFileSync } from 'node:fs'
const entete = lignes[0]
const blocs = lignes.slice(1)
const dest = join(ici, '..', '..', 'supabase', 'migrations')
let index = 0
const fichiers = []
for (const bloc of blocs) {
  if (bloc.startsWith('\n-- ── Module')) {
    index += 1
    const slug = bloc.match(/\((.+?)\) ──/)[1]
    const nom = `20260921_academy_3_seed_${String(index).padStart(2, '0')}_${slug.replace(/-/g, '_')}.sql`
    fichiers.push({ nom, contenu: entete + bloc + '\n' })
  } else if (bloc.startsWith('\n-- ── Parcours')) {
    fichiers.push({ nom: '20260921_academy_3_seed_13_parcours.sql', contenu: entete + bloc + '\n' })
  } else {
    fichiers[fichiers.length - 1].contenu += bloc + '\n'
  }
}
for (const f of fichiers) writeFileSync(join(dest, f.nom), f.contenu)
process.stdout.write(fichiers.map((f) => f.nom + ' (' + f.contenu.length + ' caracteres)').join('\n') + '\n')
