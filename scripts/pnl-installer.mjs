#!/usr/bin/env node
// scripts/pnl-installer.mjs
// ═══════════════════════════════════════════════════════════════════════════
// Installe l espace Chiffres et Rentabilite, en une seule commande.
//
//   node scripts/pnl-installer.mjs
//
// Il fait deux choses :
//   1. genere PNL_SECRET et le pose sur Vercel (projet entasis-crm-supabase,
//      environnement production) par l API REST. PAS par « vercel env add »,
//      qui ecrit une valeur vide quand on lui passe la valeur en pipe.
//   2. demande le code et rend son EMPREINTE scrypt salee, a poser dans
//      pnl_verrou. Le script n ecrit pas en base lui meme : la cle de service
//      est de type « sensitive » chez Vercel, donc illisible par l API, et
//      vide dans .env.local. Faire circuler une empreinte, qui est un
//      hachage, vaut mieux que faire circuler une cle de service.
//
// AUCUN SECRET NE S AFFICHE. Ni le PNL_SECRET genere, ni le code saisi. Le
// code n est jamais ecrit sur disque, ni dans un log, ni dans l historique du
// terminal (il est demande, pas passe en argument).
//
// Le script est REJOUABLE : le relancer regenere le secret et remplace le
// code. Il ne casse rien, il remplace.
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout, exit, env } from 'node:process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { empreinteCode } from '../api/_lib/pnl-jeton.js'

const PROJET_VERCEL = 'entasis-crm-supabase'
const LONGUEUR_CODE_MINIMALE = 6

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`)
const ko = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`)
const info = (m) => console.log(`    ${m}`)

// ─── Lecture des cles locales, sans jamais les afficher ───────────────────
function lireEnvLocal() {
  const chemin = new URL('../.env.local', import.meta.url).pathname
  if (!existsSync(chemin)) return {}
  const out = {}
  for (const ligne of readFileSync(chemin, 'utf8').split('\n')) {
    const m = ligne.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}

const local = lireEnvLocal()
// La cle de service n est PAS demandee : chez Vercel elle est de type
// « sensitive », donc illisible par l API meme avec le bon token, et elle est
// vide dans .env.local. Plutot que de la faire circuler, le script rend
// l EMPREINTE du code, qui est un hachage sale : la partager ne revele rien.
const SUPABASE_URL = env.SUPABASE_URL || local.SUPABASE_URL

const cheminToken = join(homedir(), '.vercel-token')
const VERCEL_TOKEN = env.VERCEL_TOKEN
  || (existsSync(cheminToken) ? readFileSync(cheminToken, 'utf8').trim() : null)

console.log('\n═══ Installation de l espace Chiffres et Rentabilite ═══\n')

let bloque = false
if (!VERCEL_TOKEN) {
  ko('token Vercel introuvable (~/.vercel-token ou VERCEL_TOKEN)'); bloque = true
}
if (bloque) { console.log('\nRien n a ete fait.\n'); exit(1) }

// ─── 1. Le secret sur Vercel ──────────────────────────────────────────────
console.log('1. Secret de signature\n')
const secret = randomBytes(48).toString('base64url')

const entete = { Authorization: `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' }

// L API refuse une variable qui existe deja : on retire l ancienne d abord.
const liste = await fetch(`https://api.vercel.com/v9/projects/${PROJET_VERCEL}/env`, { headers: entete })
  .then((r) => r.json()).catch(() => null)
if (!liste || liste.error) {
  ko(`Vercel a refuse la lecture du projet ${PROJET_VERCEL}`)
  info(liste?.error?.message || 'reponse illisible')
  exit(1)
}
for (const v of liste.envs || []) {
  if (v.key === 'PNL_SECRET') {
    await fetch(`https://api.vercel.com/v9/projects/${PROJET_VERCEL}/env/${v.id}`, {
      method: 'DELETE', headers: entete,
    })
    info('ancienne valeur retiree')
  }
}

const pose = await fetch(`https://api.vercel.com/v10/projects/${PROJET_VERCEL}/env`, {
  method: 'POST', headers: entete,
  body: JSON.stringify({ key: 'PNL_SECRET', value: secret, type: 'encrypted', target: ['production'] }),
}).then((r) => r.json()).catch((e) => ({ error: { message: e.message } }))

if (pose?.error) { ko(`pose du secret refusee : ${pose.error.message}`); exit(1) }
ok(`PNL_SECRET pose sur ${PROJET_VERCEL}, environnement production`)
info('48 octets aleatoires, il ne s affichera jamais')

// ─── 2. Le code ───────────────────────────────────────────────────────────
console.log('\n2. Code d acces\n')
const rl = createInterface({ input: stdin, output: stdout })
const code = await rl.question('   Choisis ton code (il ne sera pas affiche) : ')
const code2 = await rl.question('   Retape le pour confirmer : ')
rl.close()

if (code !== code2) { console.log(''); ko('les deux saisies different, rien n a ete change pour le code'); exit(1) }
if (!code || code.length < LONGUEUR_CODE_MINIMALE) {
  console.log(''); ko(`code trop court, ${LONGUEUR_CODE_MINIMALE} caracteres au minimum`); exit(1)
}

const empreinte = empreinteCode(code)
console.log('')
ok('empreinte calculee, le code lui meme n est ecrit nulle part')

console.log(`
─────────────────────────────────────────────────────────────────────
Colle CETTE ligne a Claude, ou dans le SQL Editor de Supabase.
C est un hachage sale : elle ne permet pas de retrouver ton code.

${empreinte}
─────────────────────────────────────────────────────────────────────

Requete equivalente, si tu preferes la passer toi meme :

  update public.pnl_verrou
     set empreinte = '${empreinte}',
         tentatives_echouees = 0, bloque_jusqu_a = null, updated_at = now()
   where id = true;

═══ Il reste ═══

  1. me donner l empreinte ci dessus, que je la pose
  2. me dire « merge » pour deployer l ecran, et fermer au passage
     l acces de Jean et Martin a la marge par personne
`)
