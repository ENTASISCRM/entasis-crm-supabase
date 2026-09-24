// tests/visuel/controle.mjs
//
// Controle visuel automatique du CRM : ouvre les ecrans principaux dans un
// navigateur avec une session simulee et des donnees fictives, verifie des
// invariants de rendu et depose une capture par ecran.
//
// Pourquoi : les tests vitest ne testent que des fonctions. Une regle CSS qui
// ecrase deux tiers des champs d’une modale ne fait echouer aucun test, seul
// un navigateur le voit. Ce script joue en CI a chaque pull request.
//
// Variables d’environnement :
//   CRM_URL                  adresse du serveur a controler (defaut : vite preview)
//   PLAYWRIGHT_CHROMIUM_PATH chemin d un chromium deja installe (sinon celui de playwright)
//   PLAYWRIGHT_MODULE_DIR    dossier contenant node_modules/playwright (vide en CI)
//   CONTROLE_SCENARIOS       noms de scenarios separes par des virgules, pour n’en jouer qu’une partie
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

// Playwright vient du depot (CI) ou d’un dossier externe (poste local sans
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
  if (await bouton.count() === 0) throw new Error(`bouton « ${libelle} » introuvable a l’ecran`)
  await bouton.click()
}

async function attendreModale(page) {
  await page.waitForSelector('.modal-overlay .modal-box', { timeout: 10000 })
  await page.waitForTimeout(500)
}

// ── Petites assertions d ecran ───────────────────────────────────────────────
// Elles levent avec un message court : un scenario qui echoue doit dire ce
// qui manquait, pas seulement qu il a echoue. Attention aux textes mis en
// capitales par le CSS (kickers, titres de bloc) : innerText les rend
// transformes, on assure donc sur un texte qui ne l est pas.
async function exigerTextes(page, textes) {
  const absents = await page.evaluate((liste) => {
    const texte = document.body.innerText || ''
    return liste.filter((t) => !texte.includes(t))
  }, textes)
  if (absents.length) throw new Error(`texte(s) absent(s) a l ecran : ${absents.map((t) => `« ${t} »`).join(', ')}`)
}

// Le CRM fait defiler .app-content, pas la fenetre : une capture montre le
// haut de l ecran tant qu on n amene pas l element voulu dans la zone de
// contenu. A utiliser quand ce que le scenario controle vit plus bas.
async function amenerAuCentre(page, selecteur) {
  const trouve = await page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return false
    el.scrollIntoView({ block: 'center' })
    return true
  }, selecteur)
  if (!trouve) throw new Error(`${selecteur} introuvable, rien a amener a l ecran`)
  await page.waitForTimeout(400)
}

async function exigerNombre(page, selecteur, attendu, libelle) {
  const n = await page.locator(selecteur).count()
  if (n !== attendu) throw new Error(`${libelle} : ${n} au lieu de ${attendu} (${selecteur})`)
}

async function exigerTexteDe(page, selecteur, attendu, libelle) {
  const element = page.locator(selecteur).first()
  if (await element.count() === 0) throw new Error(`${libelle} : ${selecteur} introuvable`)
  const texte = (await element.innerText()).replace(/\s+/g, ' ').trim()
  if (!texte.includes(attendu)) throw new Error(`${libelle} : « ${texte} » ne contient pas « ${attendu} »`)
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
        if (!visible) defauts.push(`.modal-foot hors de l’ecran (haut ${Math.round(r.top)}, bas ${Math.round(r.bottom)}, hauteur ${Math.round(r.height)})`)
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
// qu’elle est simulee (404) ou hors du CRM (polices, hote Supabase fictif,
// temps reel coupe). Jamais une erreur de l’application elle meme.
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
// (la garde anti perte bloque Escape sur un dossier saisi), pas d’etat herite.
// `attendu` : un texte qui doit etre a l’ecran, sinon un ecran reste sur son
// squelette ou vide passerait le controle en vert. `largeurs` : les largeurs
// de fenetre a controler et a capturer (une capture par largeur), pour les
// ecrans qui doivent tenir au telephone comme au bureau.
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
    // « Déjà signé » depuis le bloc sans mouvement : la modale s’ouvre sur un
    // dossier EXISTANT, en Signé. C’est le seul écran qui joue la lecture de
    // la fiche à l’ouverture et le préremplissage des champs client.
    nom: 'deja-signe', role: 'manager', route: '#/dashboard', attendu: 'Date de signature',
    actions: async (page) => {
      await cliquer(page, 'button:has-text("Déjà signé")', 'Déjà signé')
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
  { nom: 'marches', role: 'conseiller', route: '#/market', attendu: 'Suivi allocations clients' },
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
  { nom: 'connexions', role: 'manager', route: '#/connexions', attendu: 'Connexions au CRM' },
  { nom: 'smart-rh-direction', role: 'manager', route: '#/smart-rh', attendu: 'À valider' },
  // La responsable RH n’est pas manager : elle doit tenir la même file.
  { nom: 'smart-rh-responsable-rh', role: 'rh', route: '#/smart-rh', attendu: 'À valider' },
  { nom: 'multi-equipement', role: 'conseiller', route: '#/multi-equipement', attendu: 'Multi-équipement' },
  { nom: 'conformite', role: 'conseiller', route: '#/conformite', attendu: 'Recueils et devoirs de conseil' },
  // Entasis Academy : les ecrans du collaborateur puis ceux de la direction.
  // Les donnees viennent de harnais-academy.mjs (fonctions SQL simulees).
  {
    // Aujourd hui porte la carte de niveau, les trois defis du jour et le
    // classement anonyme de la semaine (migration 8). Les titres de bloc
    // sont mis en capitales par le CSS : on assure sur leur contenu.
    nom: 'formation-parcours', role: 'conseiller', route: '#/formation/parcours', attendu: 'Aujourd hui',
    actions: async (page) => {
      await exigerNombre(page, '.ac-niveau', 1, 'carte de niveau')
      await exigerNombre(page, '.ac-defi', 3, 'defis du jour')
      await exigerTextes(page, [
        'Solide', 'niveau 5 · 930 XP au total', '70 XP avant Expert',
        'Deux sessions aujourd’hui', 'Quinze bonnes réponses', 'Combo de cinq', '+30 XP',
        'sur 9 participants', '3e sur 9 cette semaine, 10 XP de la place au dessus',
        'Classement anonyme : ni les noms ni les scores des collègues n’apparaissent.',
        'Sans faute', '8 sur 21', 'Tous mes succès',
      ])
    },
  },
  { nom: 'formation-catalogue', role: 'conseiller', route: '#/formation/catalogue', attendu: 'PER et retraite' },
  {
    // Le memo pose la figure appelee par [schema:frise] a sa place et celle
    // qu aucun marqueur n appelle a la fin ; aucun marqueur ne reste visible.
    nom: 'formation-deck', role: 'conseiller', route: '#/formation/module/methode-entasis', attendu: 'Démarrer une session',
    actions: async (page) => {
      await exigerNombre(page, '.ac-memo .ac-schema', 2, 'figures du memo')
      await exigerTextes(page, ['Les cinq temps', 'Les pièces à réunir', 'L’ordre ne change pas'])
      const defaut = await page.evaluate(() => {
        const memo = document.querySelector('.ac-memo')
        if (!memo) return 'memo absent'
        if (/\[schema:/i.test(memo.innerText || '')) return 'un marqueur [schema:…] reste visible dans le memo'
        const figures = [...memo.querySelectorAll('.ac-schema')]
        const citation = memo.querySelector('blockquote')
        if (!citation) return 'le memo n a pas rendu son markdown'
        const haut = (el) => el.getBoundingClientRect().top
        if (haut(figures[0]) > haut(citation)) return 'la figure appelee par son marqueur n est pas a sa place'
        if (haut(figures[1]) < haut(citation)) return 'la figure sans marqueur ne s est pas posee a la fin du memo'
        const dessin = memo.querySelector('.ac-schema-image svg')
        if (!dessin) return 'aucun schema rendu dans le memo'
        if (dessin.getAttribute('role') !== 'img' || !dessin.getAttribute('aria-label')) return 'la racine assainie n a ni role img ni aria-label'
        return null
      })
      if (defaut) throw new Error(defaut)
      await amenerAuCentre(page, '.ac-memo .ac-schema')
    },
  },
  {
    nom: 'formation-entrainement', role: 'conseiller', route: '#/formation/entrainement/av1', attendu: 'Vérifier',
    actions: async (page) => {
      // Session neuve : douze segments, le compteur d XP part de zero.
      await exigerNombre(page, '.ae-segment', 12, 'segments de progression')
      await exigerTexteDe(page, '.ae-jauge-valeur', '0 XP', 'compteur d XP de la session')
    },
  },
  { nom: 'formation-resultats', role: 'conseiller', route: '#/formation/resultats', attendu: 'exercices à force basse' },
  {
    // Une reponse jouee de bout en bout : on coche, on verifie, le bandeau
    // de correction arrive avec l’explication servie par la fonction simulee
    // et l XP gagne (10, sans bonus : le combo n est qu a un).
    nom: 'formation-entrainement-reponse', role: 'conseiller', route: '#/formation/entrainement/av1', attendu: 'Continuer',
    actions: async (page) => {
      await cliquer(page, 'label:has-text("Le premier appel")', 'Le premier appel')
      await cliquer(page, 'button:has-text("Vérifier")', 'Vérifier')
      await page.waitForSelector('button:has-text("Continuer")', { timeout: 10000 })
      await page.waitForTimeout(900)
      await exigerTexteDe(page, '.ae-bandeau-titre', 'Bonne réponse ! +10 XP', 'bandeau de correction')
      await exigerTexteDe(page, '.ae-jauge-valeur', '10 XP', 'compteur d XP apres la reponse')
      await exigerNombre(page, '.ae-segment.is-bon', 1, 'segment vert')
    },
  },
  {
    // Une session reprise : le compteur et le combo repartent de ce que le
    // serveur a garde. Une bonne reponse de plus porte le combo a trois,
    // donc 15 XP, et allume un segment vert.
    nom: 'formation-entrainement-xp', role: 'conseiller', route: '#/formation/entrainement/av1-reprise',
    attendu: '+15 XP, combo ×3', largeurs: [375, 1280],
    actions: async (page) => {
      await exigerTexteDe(page, '.ae-jauge-valeur', '20 XP', 'compteur d XP repris')
      await exigerTexteDe(page, '.ae-combo', 'Combo ×2', 'pastille de combo reprise')
      await exigerNombre(page, '.ae-segment', 10, 'segments de progression')
      await cliquer(page, 'label:has-text("À trois mois")', 'À trois mois')
      await cliquer(page, 'button:has-text("Vérifier")', 'Vérifier')
      await page.waitForSelector('button:has-text("Continuer")', { timeout: 10000 })
      await page.waitForTimeout(900)
      await exigerTexteDe(page, '.ae-bandeau-titre', 'Bonne réponse ! +15 XP, combo ×3', 'bandeau de gain')
      await exigerTexteDe(page, '.ae-jauge-valeur', '35 XP', 'compteur d XP apres la reponse')
      await exigerTexteDe(page, '.ae-combo', 'Combo ×3', 'pastille de combo')
      await exigerNombre(page, '.ae-segment.is-bon', 1, 'segment vert')
    },
  },
  {
    // Un exercice qui s appuie sur un schema de la version : la figure se
    // pose au dessus de l enonce, se reduit au lieu de defiler et tient dans
    // la fenetre d un telephone.
    nom: 'formation-entrainement-figure', role: 'conseiller', route: '#/formation/entrainement/av1-reprise',
    attendu: 'Les cinq temps', largeurs: [375, 1280],
    actions: async (page) => {
      await page.setViewportSize({ width: 375, height: 812 })
      await page.waitForTimeout(500)
      const defaut = await page.evaluate(() => {
        const figure = document.querySelector('.ae-figure .ac-schema')
        const image = document.querySelector('.ae-figure .ac-schema-image')
        const dessin = document.querySelector('.ae-figure .ac-schema-image svg')
        const corps = document.querySelector('.ae-corps')
        if (!figure || !image || !dessin) return 'aucune figure rendue dans la session'
        if (!corps) return 'aucun corps d exercice'
        if (figure.getBoundingClientRect().bottom > corps.getBoundingClientRect().top + 1) return 'la figure n est pas au dessus de l enonce'
        if (image.scrollHeight > Math.ceil(image.getBoundingClientRect().height) + 1) return 'la figure defile au lieu de se reduire'
        const hauteur = dessin.getBoundingClientRect().height
        if (hauteur > window.innerHeight * 0.45 + 1) return `la figure prend ${Math.round(hauteur)} px sur une fenetre de ${window.innerHeight}`
        if (dessin.getAttribute('role') !== 'img' || !dessin.getAttribute('aria-label')) return 'la figure n a ni role img ni aria-label'
        return null
      })
      if (defaut) throw new Error(defaut)
    },
  },
  {
    // Le bilan de fin de session : le detail des XP ligne par ligne, le
    // passage de niveau, les succes debloques et le classement anonyme. La
    // session simulee est deja entierement repondue, la vue va droit au bilan.
    nom: 'formation-bilan', role: 'conseiller', route: '#/formation/entrainement/av1-bilan',
    attendu: 'Bonnes réponses', largeurs: [375, 1280],
    actions: async (page) => {
      await page.waitForSelector('.ae-fin', { timeout: 15000 })
      await page.waitForTimeout(1500)
      await exigerNombre(page, '.ae-confetti', 100, 'confettis')
      await exigerNombre(page, '.ae-detail-ligne', 4, 'lignes du detail d XP')
      await exigerTexteDe(page, '.ae-detail-somme', '+170 XP', 'total du detail')
      await exigerTextes(page, [
        'Bonnes réponses', 'Combos, jusqu’à 8 d’affilée', 'Première session du jour', 'Combo de cinq',
        'Expert', 'Niveau 6 atteint : Expert.', '250 XP avant Maître',
        'Six d’affilée', 'Centurion', '3e sur 9 cette semaine, 10 XP de la place au dessus',
        'Le classement est anonyme : ni nom ni score de personne.',
        '11 bonnes réponses sur 12', 'Encore une session', 'Revoir mes erreurs', 'Retour au deck',
      ])
    },
  },
  {
    // La galerie des succes : tout le catalogue, les acquis avec leur date,
    // les autres avec leur condition en clair.
    nom: 'formation-succes', role: 'conseiller', route: '#/formation/succes',
    attendu: '8 sur 21 débloqués', largeurs: [375, 1280],
    actions: async (page) => {
      await exigerNombre(page, '.ac-succes', 21, 'cartes de succes')
      await exigerNombre(page, '.ac-succes.obtenu', 8, 'succes debloques')
      await exigerNombre(page, '.ac-succes.verrouille', 13, 'succes verrouilles')
      await exigerTextes(page, ['Premier pas', 'Encyclopédie', 'Pas encore débloqué', 'Obtenu le'])
    },
  },
  {
    // Un schema hostile range en base ne doit rien pouvoir : celui qui porte
    // un script, un onload et un foreignObject est refuse des la pre
    // verification (« Schéma indisponible », la legende reste lisible) ;
    // l autre passe la pre verification et DOMPurify lui retire ce qui sort
    // de la liste blanche. Rien ne s execute, aucune balise interdite
    // n atteint le DOM.
    nom: 'formation-svg-hostile', role: 'conseiller', route: '#/formation/module/assurance-vie',
    attendu: 'Schéma indisponible', largeurs: [375, 1280],
    actions: async (page) => {
      const defaut = await page.evaluate(() => {
        if (window.__academy_xss !== undefined) return `le schema piege s est execute (__academy_xss = ${String(window.__academy_xss)})`
        const memo = document.querySelector('.ac-memo')
        if (!memo) return 'memo absent'
        const figures = [...memo.querySelectorAll('.ac-schema')]
        if (figures.length !== 2) return `${figures.length} figure(s) dans le memo au lieu de deux`
        if (!memo.querySelector('.ac-schema-indisponible')) return 'le schema piege n a pas ete refuse'
        const interdites = memo.querySelectorAll('script, foreignObject, foreignobject, animate, iframe, object, embed, image')
        if (interdites.length) return `balise interdite rendue dans le memo : ${interdites[0].nodeName}`
        if (/\son[a-z]+\s*=/i.test(memo.innerHTML)) return 'attribut de gestionnaire d evenement rendu dans le memo'
        if (memo.querySelector('[tabindex]')) return 'attribut tabindex rendu dans le memo'
        const dessin = memo.querySelector('.ac-schema-image svg')
        if (!dessin) return 'le schema assaini n est pas rendu'
        if (dessin.getAttribute('role') !== 'img' || !dessin.getAttribute('aria-label')) return 'la racine assainie n a ni role img ni aria-label'
        return null
      })
      if (defaut) throw new Error(defaut)
      await exigerTextes(page, ['Schéma indisponible', 'Ce schéma porte un script', 'Une enveloppe, deux moteurs'])
      await amenerAuCentre(page, '.ac-memo .ac-schema-indisponible')
    },
  },
  { nom: 'formation-pilotage', role: 'manager', route: '#/formation/pilotage', attendu: 'Conseiller Témoin' },
  { nom: 'formation-fiche', role: 'manager', route: '#/formation/fiche/u-conseiller', attendu: 'Conseiller Démo' },
  { nom: 'formation-administration', role: 'manager', route: '#/formation/administration', attendu: 'Fiscalité : raisonner' },
  {
    // L editeur d une version : la section « Schémas » (cle, titre, legende,
    // SVG, apercu assaini) et le champ « Figure » d un exercice.
    nom: 'formation-editeur', role: 'manager', route: '#/formation/administration/version/av4', attendu: 'Fiscalité : raisonner',
    actions: async (page) => {
      await exigerNombre(page, '.aca-schema', 2, 'schemas de la version')
      await exigerNombre(page, '.aca-schema-apercu .ac-schema-image svg', 2, 'apercus assainis')
      await exigerTexteDe(page, '.aca-schema-compte', 'caractères sur 24 000 au plus', 'compteur de caracteres')
      await exigerTextes(page, ['Dans le mémo : [schema:frise]', 'Dans le mémo : [schema:pieces]', 'Ajouter un schéma', 'Enregistrer les schémas'])
      await amenerAuCentre(page, '.aca-schemas')
    },
  },
  {
    // Aucun module publie : un conseiller qui suit un lien #/formation est
    // ramene a l’accueil et le menu ne montre pas l’onglet ; la direction
    // garde l’acces pour relire et publier.
    nom: 'formation-fermee-conseiller', role: 'conseiller', formationFermee: true, route: '#/formation/parcours', attendu: 'Dossiers sans mouvement',
    actions: async (page) => {
      const onglet = await page.locator('.nav-item, nav a, nav button').filter({ hasText: 'Formation' }).count()
      if (onglet > 0) throw new Error('l’onglet Formation est visible sans module publie')
    },
  },
  { nom: 'formation-fermee-direction', role: 'manager', formationFermee: true, route: '#/formation/administration', attendu: 'Fiscalité : raisonner' },
]

// ── Execution d’un scenario ──────────────────────────────────────────────────
// Un scenario peut demander plusieurs largeurs (`largeurs: [375, 1280]`) :
// les verifications communes repassent a chaque largeur et la capture porte
// alors le suffixe de la largeur. Sans cette clef, un seul passage, a la
// taille de fenetre du harnais.
async function capturer(page, nom, largeur) {
  const fichier = path.join(DOSSIER_CAPTURES, largeur ? `${nom}-${largeur}.png` : `${nom}.png`)
  try { await page.screenshot({ path: fichier }) } catch { /* page fermee */ }
}

async function jouer(browser, scenario) {
  const resultat = { nom: scenario.nom, passees: 0, echecs: [] }
  const largeurs = Array.isArray(scenario.largeurs) && scenario.largeurs.length ? scenario.largeurs : [null]
  let page = null
  let erreursConsole = []
  let capturees = 0
  try {
    page = await pageDemo(browser, { role: scenario.role, formationFermee: scenario.formationFermee === true })
    erreursConsole = ecouterConsole(page)
    await page.goto(`${URL_BASE}/${scenario.route}`)
    await attendreRendu(page)
    if (scenario.actions) await scenario.actions(page)

    // Assertion positive : l’ecran attendu est bien la.
    if (scenario.attendu) {
      const present = await page.evaluate((t) => (document.body.innerText || '').includes(t), scenario.attendu)
      if (present) resultat.passees++
      else resultat.echecs.push(`texte attendu absent : « ${scenario.attendu} »`)
    }

    for (const largeur of largeurs) {
      if (largeur) {
        await page.setViewportSize({ width: largeur, height: largeur < 700 ? 812 : 900 })
        await page.waitForTimeout(500)
      }
      const ou = largeur ? ` a ${largeur} px` : ''
      for (const v of VERIFICATIONS) {
        let defaut
        try { defaut = await v.executer(page) } catch (e) { defaut = `verification impossible : ${e.message}` }
        if (defaut) resultat.echecs.push(`${v.nom}${ou} : ${defaut}`)
        else resultat.passees++
      }
      await capturer(page, scenario.nom, largeur)
      capturees++
    }
    if (erreursConsole.length) resultat.echecs.push(`erreurs console : ${erreursConsole.join(' | ')}`)
    else resultat.passees++
  } catch (e) {
    resultat.echecs.push(`scenario interrompu : ${String(e?.message || e).split('\n')[0]}`)
    if (erreursConsole.length) resultat.echecs.push(`erreurs console : ${erreursConsole.join(' | ')}`)
  } finally {
    if (page) {
      // Scenario interrompu avant la premiere capture : on en garde une, la
      // capture d un ecran en echec est ce qui explique l echec.
      if (capturees === 0) await capturer(page, scenario.nom, largeurs[0])
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

// ── Point d’entree ───────────────────────────────────────────────────────────
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
