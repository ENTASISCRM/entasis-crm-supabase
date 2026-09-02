// tests/visuel/controle.mjs
//
// Controle visuel automatique du CRM : ouvre les ecrans principaux dans un
// navigateur avec une session simulee et des donnees fictives, verifie des
// invariants de rendu et depose une capture par ecran.
//
// Pourquoi : les tests vitest ne testent que des fonctions. Une regle CSS qui
// ecrase deux tiers des champs d une modale ne fait echouer aucun test, seul
// un navigateur le voit. Ce script joue en CI a chaque pull request.
//
// Variables d environnement :
//   CRM_URL                  adresse du serveur a controler (defaut : vite preview)
//   PLAYWRIGHT_CHROMIUM_PATH chemin d un chromium deja installe (sinon celui de playwright)
//   PLAYWRIGHT_MODULE_DIR    dossier contenant node_modules/playwright (vide en CI)
//   CONTROLE_SCENARIOS       noms de scenarios separes par des virgules, pour n en jouer qu une partie
//
// Lancement : node tests/visuel/controle.mjs
// Captures : tests/visuel/captures/<scenario>.png

import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pageDemo } from './harnais.mjs'

const ICI = path.dirname(fileURLToPath(import.meta.url))
const URL_BASE = (process.env.CRM_URL || 'http://127.0.0.1:4173').replace(/\/$/, '')
const DOSSIER_CAPTURES = path.join(ICI, 'captures')
const CHEMIN_CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined

// Playwright vient du depot (CI) ou d un dossier externe (poste local sans
// installation dans le depot).
function chargerPlaywright() {
  const dossier = process.env.PLAYWRIGHT_MODULE_DIR
  const require = createRequire(dossier ? path.join(dossier, 'package.json') : import.meta.url)
  return require('playwright')
}

// ── Attente du rendu ─────────────────────────────────────────────────────────
// Le CRM affiche des squelettes pendant les chargements. On attend la zone de
// contenu, puis la disparition des squelettes, puis un court delai pour les
// morceaux charges a la demande.
const SELECTEUR_CHARGEMENT = '.skeleton, .skeleton-table, .skeleton-cards, .spinner, .immo-loading'
async function attendreRendu(page) {
  await page.waitForSelector('.app-content', { timeout: 20000 })
  await page.waitForFunction((sel) => !document.querySelector(sel), SELECTEUR_CHARGEMENT, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(700)
}

async function cliquer(page, selecteur, libelle) {
  const bouton = page.locator(selecteur).first()
  if (await bouton.count() === 0) throw new Error(`bouton « ${libelle} » introuvable a l ecran`)
  await bouton.click()
}

async function attendreModale(page) {
  await page.waitForSelector('.modal-overlay .modal-box', { timeout: 10000 })
  await page.waitForTimeout(500)
}

// ── Verifications communes ───────────────────────────────────────────────────
// Chacune renvoie null si tout va bien, sinon un message court.
const VERIFICATIONS = [
  {
    // Le CRM fait defiler .app-content, pas la fenetre : la zone de contenu
    // est controlee au meme titre que le document, sinon un tableau trop
    // large passerait inapercu.
    nom: 'pas de debordement horizontal',
    executer: (page) => page.evaluate(() => {
      const zones = [['document', document.documentElement], ['.app-content', document.querySelector('.app-content')]]
      const defauts = zones
        .filter(([, el]) => el && el.scrollWidth > el.clientWidth)
        .map(([nom, el]) => `${nom} : scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`)
      return defauts.length ? defauts.join(' ; ') : null
    }),
  },
  {
    nom: 'aucune section de formulaire tronquee',
    executer: (page) => page.evaluate(() => {
      const tronquees = [...document.querySelectorAll('.form-section')].filter((el) => {
        const h = el.getBoundingClientRect().height
        return el.scrollHeight > Math.ceil(h) + 1
      })
      if (!tronquees.length) return null
      const titres = tronquees.map((el) => (el.querySelector('.form-section-title')?.textContent || 'sans titre').trim())
      return `${tronquees.length} section(s) tronquee(s) : ${titres.join(', ')}`
    }),
  },
  {
    nom: 'modales completes (fond opaque, pied visible)',
    executer: (page) => page.evaluate(() => {
      const defauts = []
      for (const overlay of document.querySelectorAll('.modal-overlay')) {
        const box = overlay.querySelector('.modal-box')
        if (!box) { defauts.push('.modal-overlay sans .modal-box'); continue }
        const fond = getComputedStyle(box).backgroundColor
        const alpha = /rgba?\([^)]*,\s*([\d.]+)\)$/.exec(fond)
        if (!fond || fond === 'transparent' || fond === 'rgba(0, 0, 0, 0)' || (alpha && Number(alpha[1]) === 0)) {
          defauts.push(`.modal-box au fond transparent (${fond})`)
        }
        const pied = box.querySelector('.modal-foot')
        if (!pied) { defauts.push('.modal-box sans .modal-foot'); continue }
        const r = pied.getBoundingClientRect()
        const visible = r.height > 0 && r.width > 0 && r.top >= 0 && r.bottom <= window.innerHeight + 1
        if (!visible) defauts.push(`.modal-foot hors de l ecran (haut ${Math.round(r.top)}, bas ${Math.round(r.bottom)}, hauteur ${Math.round(r.height)})`)
      }
      return defauts.length ? defauts.join(' ; ') : null
    }),
  },
  {
    nom: 'aucun texte undefined, NaN ou [object Object]',
    executer: (page) => page.evaluate(() => {
      const texte = document.body.innerText || ''
      const m = /\bundefined\b|\bNaN\b|\[object Object\]/.exec(texte)
      if (!m) return null
      const debut = Math.max(0, m.index - 40)
      return `« ${m[0]} » visible pres de : ${texte.slice(debut, m.index + 40).replace(/\s+/g, ' ')}`
    }),
  },
]

// Erreurs console a ignorer : une ressource reseau qui ne charge pas parce
// qu elle est simulee (404) ou hors du CRM (polices, hote Supabase fictif,
// temps reel coupe). Jamais une erreur de l application elle meme.
function erreurConsoleIgnoree(msg, texte) {
  if (!/Failed to load resource/i.test(texte)) return false
  const url = msg.location()?.url || ''
  if (url && !url.startsWith(URL_BASE)) return true
  return /404/.test(texte) || /net::ERR_ABORTED/.test(texte)
}
function ecouterConsole(page) {
  const erreurs = []
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const texte = msg.text()
    if (erreurConsoleIgnoree(msg, texte)) return
    const url = msg.location()?.url
    erreurs.push(`${texte.slice(0, 300)}${url ? ` (${url})` : ''}`)
  })
  page.on('pageerror', (err) => erreurs.push(`exception : ${String(err?.message || err).slice(0, 300)}`))
  return erreurs
}

// ── Scenarios ────────────────────────────────────────────────────────────────
// Chaque scenario ouvre une page neuve : pas de fermeture de modale a la main
// (la garde anti perte bloque Escape sur un dossier saisi), pas d etat herite.
// `attendu` : un texte qui doit etre a l ecran, sinon un ecran reste sur son
// squelette ou vide passerait le controle en vert.
const SCENARIOS = [
  { nom: 'accueil-conseiller', role: 'conseiller', route: '#/dashboard', attendu: 'Dossiers sans mouvement' },
  { nom: 'accueil-manager', role: 'manager', route: '#/dashboard', attendu: 'Dossiers sans mouvement' },
  { nom: 'pipeline', role: 'conseiller', route: '#/pipeline', attendu: 'Pipeline commercial' },
  { nom: 'clients-annuaire', role: 'conseiller', route: '#/clients', attendu: 'Camille Exemple' },
  { nom: 'clients-rattrapage', role: 'manager', route: '#/clients/rattrapage', attendu: 'Fiches à rattraper' },
  { nom: 'clients-campagnes', role: 'manager', route: '#/clients/campagnes', attendu: 'Prévoyance TNS' },
  { nom: 'leads-entrants', role: 'conseiller', route: '#/leads', attendu: 'Leads entrants' },
  {
    nom: 'modale-client-edition', role: 'conseiller', route: '#/clients',
    actions: async (page) => {
      await cliquer(page, 'button:has-text("Voir")', 'Voir')
      await attendreRendu(page)
      await cliquer(page, 'button:has-text("Modifier")', 'Modifier')
      await attendreModale(page)
      // Comme dans la verification manuelle : on descend au bas de la modale,
      // le pied doit rester visible et la derniere section entiere.
      await page.evaluate(() => { const b = document.querySelector('.modal-box'); if (b) b.scrollTop = b.scrollHeight })
      await page.waitForTimeout(400)
    },
  },
  {
    nom: 'modale-nouveau-client', role: 'conseiller', route: '#/clients',
    actions: async (page) => {
      await cliquer(page, 'button:has-text("Nouveau client")', '+ Nouveau client')
      await attendreModale(page)
    },
  },
  {
    nom: 'modale-dossier-express', role: 'conseiller', route: '#/clients',
    actions: async (page) => {
      await cliquer(page, 'button:has-text("Nouveau dossier")', 'Nouveau dossier')
      await attendreModale(page)
    },
  },
  {
    nom: 'modale-dossier-complet', role: 'conseiller', route: '#/clients',
    actions: async (page) => {
      await cliquer(page, 'button:has-text("Nouveau dossier")', 'Nouveau dossier')
      await attendreModale(page)
      await cliquer(page, '.modal-overlay button:has-text("Tout renseigner")', 'Tout renseigner')
      await page.waitForTimeout(600)
    },
  },
  { nom: 'partenaires', role: 'conseiller', route: '#/partenaires', attendu: 'Partenaires · annuaire' },
  { nom: 'immobilier-dossiers', role: 'conseiller', route: '#/immobilier', attendu: 'Immobilier · dossiers transmis' },
  {
    nom: 'immobilier-mail-referent', role: 'conseiller', route: '#/immobilier',
    actions: async (page) => {
      await cliquer(page, 'button:has-text("Préparer le mail au référent")', 'Préparer le mail au référent')
      await attendreModale(page)
    },
  },
  {
    nom: 'management-semaine', role: 'manager', route: '#/forecast',
    actions: async (page) => {
      await cliquer(page, 'button[role="tab"]:has-text("Semaine")', 'Semaine')
      await attendreRendu(page)
    },
  },
  { nom: 'remuneration', role: 'conseiller', route: '#/remuneration', attendu: 'Rémunération' },
  { nom: 'smart-rh-direction', role: 'manager', route: '#/smart-rh', attendu: 'À valider' },
  // La responsable RH n est pas manager : elle doit tenir la même file.
  { nom: 'smart-rh-responsable-rh', role: 'rh', route: '#/smart-rh', attendu: 'À valider' },
  { nom: 'multi-equipement', role: 'conseiller', route: '#/multi-equipement', attendu: 'Multi-équipement' },
  { nom: 'conformite', role: 'conseiller', route: '#/conformite', attendu: 'Recueils et devoirs de conseil' },
]

// ── Execution d un scenario ──────────────────────────────────────────────────
async function jouer(browser, scenario) {
  const resultat = { nom: scenario.nom, passees: 0, echecs: [] }
  let page = null
  let erreursConsole = []
  try {
    page = await pageDemo(browser, { role: scenario.role })
    erreursConsole = ecouterConsole(page)
    await page.goto(`${URL_BASE}/${scenario.route}`)
    await attendreRendu(page)
    if (scenario.actions) await scenario.actions(page)

    // Assertion positive : l ecran attendu est bien la.
    if (scenario.attendu) {
      const present = await page.evaluate((t) => (document.body.innerText || '').includes(t), scenario.attendu)
      if (present) resultat.passees++
      else resultat.echecs.push(`texte attendu absent : « ${scenario.attendu} »`)
    }

    for (const v of VERIFICATIONS) {
      let defaut
      try { defaut = await v.executer(page) } catch (e) { defaut = `verification impossible : ${e.message}` }
      if (defaut) resultat.echecs.push(`${v.nom} : ${defaut}`)
      else resultat.passees++
    }
    if (erreursConsole.length) resultat.echecs.push(`erreurs console : ${erreursConsole.join(' | ')}`)
    else resultat.passees++
  } catch (e) {
    resultat.echecs.push(`scenario interrompu : ${String(e?.message || e).split('\n')[0]}`)
    if (erreursConsole.length) resultat.echecs.push(`erreurs console : ${erreursConsole.join(' | ')}`)
  } finally {
    if (page) {
      try { await page.screenshot({ path: path.join(DOSSIER_CAPTURES, `${scenario.nom}.png`) }) } catch { /* page fermee */ }
      await page.close().catch(() => {})
    }
  }
  return resultat
}

// ── Tableau recapitulatif ────────────────────────────────────────────────────
function afficherTableau(resultats) {
  const largeurNom = Math.max(8, ...resultats.map((r) => r.nom.length))
  const ligne = (a, b, c) => `${a.padEnd(largeurNom)}  ${String(b).padStart(11)}  ${c}`
  console.log('')
  console.log(ligne('scenario', 'passees', 'echecs'))
  console.log(ligne('='.repeat(largeurNom), '='.repeat(11), '======'))
  for (const r of resultats) {
    console.log(ligne(r.nom, r.passees, r.echecs.length ? r.echecs.length : 'aucun'))
    for (const e of r.echecs) console.log(`${' '.repeat(largeurNom + 2)}  ${e}`)
  }
  const total = resultats.reduce((n, r) => n + r.echecs.length, 0)
  console.log('')
  console.log(total ? `${total} echec(s) sur ${resultats.length} scenarios.` : `${resultats.length} scenarios, aucun echec.`)
  console.log(`Captures : ${DOSSIER_CAPTURES}`)
  return total
}

// ── Point d entree ───────────────────────────────────────────────────────────
async function principal() {
  mkdirSync(DOSSIER_CAPTURES, { recursive: true })
  const { chromium } = chargerPlaywright()
  const browser = await chromium.launch({ executablePath: CHEMIN_CHROMIUM })
  const choisis = (process.env.CONTROLE_SCENARIOS || '').split(',').map((s) => s.trim()).filter(Boolean)
  const scenarios = choisis.length ? SCENARIOS.filter((s) => choisis.includes(s.nom)) : SCENARIOS
  if (!scenarios.length) throw new Error(`aucun scenario ne correspond a CONTROLE_SCENARIOS=${process.env.CONTROLE_SCENARIOS}`)
  console.log(`Controle visuel sur ${URL_BASE} (${scenarios.length} scenarios)`)
  const resultats = []
  try {
    for (const scenario of scenarios) {
      const r = await jouer(browser, scenario)
      resultats.push(r)
      console.log(`  ${r.echecs.length ? 'ECHEC ' : 'ok    '} ${r.nom}`)
    }
  } finally {
    await browser.close().catch(() => {})
  }
  const total = afficherTableau(resultats)
  process.exit(total ? 1 : 0)
}

principal().catch((e) => {
  console.error(`Controle visuel impossible : ${e?.message || e}`)
  process.exit(1)
})
