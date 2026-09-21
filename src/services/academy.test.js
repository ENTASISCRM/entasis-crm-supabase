// Service Entasis Academy. Ce que ces tests verrouillent : les fonctions SQL
// recoivent leurs parametres sous le nom attendu par la base (une session
// d entrainement se joue par demarrerEntrainement, repondre et
// terminerEntrainement), le rejeu ne concerne que les coupures reseau et
// seules les ecritures idempotentes en beneficient, les ecritures directes
// se terminent par .select('id') (un refus silencieux de la RLS doit
// lever), et une liste vide reste une liste.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Faux client Supabase : chaque appel de table rend un builder chainable qui
// enregistre ce qu on lui demande. Les reponses se consomment dans l ordre
// (une par requete), la derniere sert de repli.
const appels = []
const rpcs = []
let reponses = []
let utilisateur = { id: 'u1' }

function prochaineReponse() {
  if (reponses.length > 1) return reponses.shift()
  return reponses[0] || { data: [], error: null }
}

function builder(table) {
  const b = { table, etapes: [] }
  const chaine = (nom) => (...args) => { b.etapes.push([nom, ...args]); return b }
  for (const nom of ['select', 'eq', 'update', 'upsert', 'insert']) b[nom] = chaine(nom)
  b.then = (ok, ko) => Promise.resolve(prochaineReponse()).then(ok, ko)
  appels.push(b)
  return b
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table) => builder(table),
    rpc: (nom, params) => { rpcs.push([nom, params]); return Promise.resolve(prochaineReponse()) },
    auth: { getUser: () => Promise.resolve({ data: { user: utilisateur } }) },
  },
}))

vi.mock('../lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { logger } = await import('../lib/logger')
const svc = await import('./academy')
const {
  avecRetry, estErreurReseau, mesRappels, listerCatalogue, commenterCoaching, enregistrerParametres,
  demarrerEntrainement, repondre, terminerEntrainement, mesResultats, objectifQuotidien, enregistrerItem,
} = svc

beforeEach(() => {
  appels.length = 0
  rpcs.length = 0
  reponses = []
  utilisateur = { id: 'u1' }
  vi.clearAllMocks()
})

describe('fonctions SQL', () => {
  it('demarrerEntrainement appelle academy_demarrer_entrainement avec p_version_id et p_jeton', async () => {
    const session = { entrainement_id: 'e1', version_id: 'v1', titre: 'Le PER', slug: 'per', items: [], reponses_deja: [] }
    reponses = [{ data: session, error: null }]
    expect(await demarrerEntrainement('v1', 'j1')).toEqual(session)
    expect(rpcs).toEqual([['academy_demarrer_entrainement', { p_version_id: 'v1', p_jeton: 'j1' }]])
  })

  it('demarrerEntrainement refuse de partir sans deck ou sans jeton', async () => {
    await expect(demarrerEntrainement(null, 'j1')).rejects.toThrow(/identifiant/)
    await expect(demarrerEntrainement('v1', '')).rejects.toThrow(/jeton/)
    expect(rpcs).toHaveLength(0)
  })

  it('repondre appelle academy_repondre avec la session, l item et la reponse telle quelle', async () => {
    const correction = { correcte: true, bonne_reponse: 2, explication: 'Parce que.', force: 1, deja: false }
    reponses = [{ data: correction, error: null }]
    expect(await repondre('e1', 'i1', 2)).toEqual(correction)
    expect(rpcs).toEqual([['academy_repondre', { p_entrainement_id: 'e1', p_item_id: 'i1', p_reponse: 2 }]])

    await repondre('e1', 'i2', [[0, 1], [1, 0]])
    expect(rpcs[1][1].p_reponse).toEqual([[0, 1], [1, 0]])
    await repondre('e1', 'i3', { su: false })
    expect(rpcs[2][1].p_reponse).toEqual({ su: false })
    await repondre('e1', 'i4', undefined)
    expect(rpcs[3][1].p_reponse).toBeNull()
  })

  it('repondre refuse une reponse sans session ou sans item, sans toucher la base', async () => {
    await expect(repondre(null, 'i1', 0)).rejects.toThrow(/sans session/)
    await expect(repondre('e1', null, 0)).rejects.toThrow(/sans session/)
    expect(rpcs).toHaveLength(0)
  })

  it('repondre rejoue une coupure reseau puis rend la correction (avecRetry)', async () => {
    vi.useFakeTimers()
    try {
      reponses = [
        { data: null, error: new TypeError('Failed to fetch') },
        { data: { correcte: false, bonne_reponse: 1, explication: '', force: 0, deja: false }, error: null },
      ]
      const promesse = repondre('e1', 'i1', 0)
      await vi.advanceTimersByTimeAsync(800)
      const r = await promesse
      expect(r.correcte).toBe(false)
      expect(rpcs).toHaveLength(2)
      expect(rpcs.every(([n]) => n === 'academy_repondre')).toBe(true)
      expect(logger.error).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('repondre ne rejoue pas une erreur de la base et la journalise', async () => {
    reponses = [{ data: null, error: new Error('Session terminee') }]
    await expect(repondre('e1', 'i1', 0)).rejects.toThrow(/Session terminee/)
    expect(rpcs).toHaveLength(1)
    expect(logger.error).toHaveBeenCalledWith('[academy] repondre', expect.any(Error))
  })

  it('terminerEntrainement appelle academy_terminer_entrainement et rend le resume', async () => {
    const resume = { entrainement_id: 'e1', nb_bons: 10, nb_total: 12, xp: 110, serie: 3, couronnes_avant: 1, couronnes_apres: 2, valide: false, attestation: null, erreurs: [] }
    reponses = [{ data: resume, error: null }]
    expect(await terminerEntrainement('e1')).toEqual(resume)
    expect(rpcs).toEqual([['academy_terminer_entrainement', { p_entrainement_id: 'e1' }]])
    await expect(terminerEntrainement('')).rejects.toThrow(/identifiant/)
  })

  it('terminerEntrainement rejoue lui aussi une coupure reseau', async () => {
    vi.useFakeTimers()
    try {
      reponses = [
        { data: null, error: new TypeError('Load failed') },
        { data: { nb_bons: 1, nb_total: 1 }, error: null },
      ]
      const promesse = terminerEntrainement('e1')
      await vi.advanceTimersByTimeAsync(800)
      expect(await promesse).toEqual({ nb_bons: 1, nb_total: 1 })
      expect(rpcs).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('mesResultats appelle academy_mes_resultats sans parametre', async () => {
    const resultats = { serie: 2, meilleure: 5, xp_total: 300, sessions: [], semaines: [], items_faibles: [] }
    reponses = [{ data: resultats, error: null }]
    expect(await mesResultats()).toEqual(resultats)
    expect(rpcs).toEqual([['academy_mes_resultats', undefined]])
  })

  it('objectifQuotidien envoie un entier, 1 par defaut, et accepte un retour vide', async () => {
    reponses = [{ data: null, error: null }]
    expect(await objectifQuotidien(3)).toBeNull()
    expect(await objectifQuotidien('2')).toBeNull()
    expect(await objectifQuotidien('abc')).toBeNull()
    expect(rpcs).toEqual([
      ['academy_objectif_quotidien', { p_objectif: 3 }],
      ['academy_objectif_quotidien', { p_objectif: 2 }],
      ['academy_objectif_quotidien', { p_objectif: 1 }],
    ])
  })

  it('enregistrerItem cree (item null) ou modifie un exercice par academy_enregistrer_item', async () => {
    reponses = [{ data: 'i9', error: null }]
    const patch = { type: 'choix', competence: 'Sortie du PER', difficulte: 1, payload: { enonce: 'Q', choix: ['a', 'b'] }, corrige: { index: 1 }, explication: 'b.' }
    expect(await enregistrerItem('v1', null, patch)).toBe('i9')
    await enregistrerItem('v1', 'i9', { archive: true })
    await enregistrerItem('v1', 'i9')
    expect(rpcs).toEqual([
      ['academy_enregistrer_item', { p_version_id: 'v1', p_item_id: null, p_patch: patch }],
      ['academy_enregistrer_item', { p_version_id: 'v1', p_item_id: 'i9', p_patch: { archive: true } }],
      ['academy_enregistrer_item', { p_version_id: 'v1', p_item_id: 'i9', p_patch: {} }],
    ])
    await expect(enregistrerItem(null, null, patch)).rejects.toThrow(/identifiant/)
  })

  it('mesRappels et listerCatalogue rendent un tableau vide quand la base rend null', async () => {
    reponses = [{ data: null, error: null }]
    expect(await mesRappels()).toEqual([])
    expect(await listerCatalogue()).toEqual([])
    expect(rpcs.map(([n]) => n)).toEqual(['academy_mes_rappels', 'academy_catalogue'])
  })

  it('relance une erreur de la base apres l avoir journalisee', async () => {
    reponses = [{ data: null, error: new Error('permission denied for function academy_pilotage') }]
    await expect(svc.pilotage('2026-09-01', null)).rejects.toThrow(/permission denied/)
    expect(logger.error).toHaveBeenCalledWith('[academy] pilotage', expect.any(Error))
  })
})

describe('avecRetry', () => {
  it('rejoue deux fois une erreur Failed to fetch puis reussit', async () => {
    let n = 0
    const fn = vi.fn(async () => {
      n += 1
      if (n < 3) throw new TypeError('Failed to fetch')
      return 'ok'
    })
    await expect(avecRetry(fn, { attentesMs: [1, 1] })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('abandonne apres le nombre d essais sur une panne qui dure', async () => {
    const fn = vi.fn(async () => { throw new TypeError('NetworkError when attempting to fetch resource.') })
    await expect(avecRetry(fn, { essais: 2, attentesMs: [1] })).rejects.toThrow(/NetworkError/)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('ne rejoue jamais un refus de la RLS ni une autre erreur metier', async () => {
    const rls = vi.fn(async () => { throw new Error('new row violates row-level security policy') })
    await expect(avecRetry(rls, { attentesMs: [1, 1] })).rejects.toThrow(/row-level security/)
    expect(rls).toHaveBeenCalledTimes(1)

    const metier = vi.fn(async () => { throw new Error('Enregistrement de la progression : la base a refusé la modification.') })
    await expect(avecRetry(metier, { attentesMs: [1, 1] })).rejects.toThrow(/refusé/)
    expect(metier).toHaveBeenCalledTimes(1)
  })

  it('reconnait les messages reseau des navigateurs, sans tenir compte de la casse', () => {
    expect(estErreurReseau(new TypeError('Failed to fetch'))).toBe(true)
    expect(estErreurReseau(new TypeError('Load failed'))).toBe(true)
    expect(estErreurReseau({ message: 'Network request failed' })).toBe(true)
    expect(estErreurReseau(new Error('duplicate key value'))).toBe(false)
    expect(estErreurReseau(null)).toBe(false)
  })
})

describe('ecritures directes', () => {
  it('commenterCoaching insere avec l auteur connecte et verifie la ligne', async () => {
    reponses = [{ data: [{ id: 'c1' }], error: null }]
    await commenterCoaching('p9', '  Bon rythme, viser le quiz avant vendredi.  ')
    const b = appels[0]
    expect(b.table).toBe('academy_commentaires_coaching')
    const ligne = b.etapes.find(([n]) => n === 'insert')[1]
    expect(ligne).toEqual({ profile_id: 'p9', auteur_id: 'u1', texte: 'Bon rythme, viser le quiz avant vendredi.' })
    expect(b.etapes).toContainEqual(['select', 'id'])
  })

  it('commenterCoaching refuse un texte vide sans toucher la base', async () => {
    await expect(commenterCoaching('p9', '   ')).rejects.toThrow(/vide/)
    expect(appels).toHaveLength(0)
  })

  it('enregistrerParametres ne garde que les colonnes connues et vise la ligne id = true', async () => {
    reponses = [{ data: [{ id: true }], error: null }]
    await enregistrerParametres({ delai_j7: 10, inconnue: 'x', questions_par_quiz: 6 })
    const b = appels[0]
    expect(b.table).toBe('academy_parametres')
    const patch = b.etapes.find(([n]) => n === 'update')[1]
    expect(patch.delai_j7).toBe(10)
    expect(patch.questions_par_quiz).toBe(6)
    expect(patch).not.toHaveProperty('inconnue')
    expect(b.etapes).toContainEqual(['eq', 'id', true])
    expect(b.etapes).toContainEqual(['select', 'id'])
  })

  it('enregistrerParametres leve quand la base refuse en silence', async () => {
    reponses = [{ data: [], error: null }]
    await expect(enregistrerParametres({ delai_j7: 10 })).rejects.toThrow(/refusé/)
  })
})
