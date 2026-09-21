// Service Entasis Academy. Ce que ces tests verrouillent : la position de
// lecture s ecrit sur la bonne table avec la bonne cle de conflit et se
// termine par .select('id') (un refus silencieux de la RLS doit lever), les
// fonctions SQL recoivent leurs parametres sous le nom attendu par la base,
// le rejeu ne concerne que les coupures reseau, et une liste vide reste une
// liste.

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
const { sauverPosition, ouvrirTentative, avecRetry, estErreurReseau, mesRappels, listerCatalogue, commenterCoaching, enregistrerParametres } = svc

beforeEach(() => {
  appels.length = 0
  rpcs.length = 0
  reponses = []
  utilisateur = { id: 'u1' }
  vi.clearAllMocks()
})

describe('sauverPosition', () => {
  it('met a jour la ligne existante sur academy_progression_lecons et se termine par select id', async () => {
    reponses = [{ data: [{ id: 'p1' }], error: null }]
    const lignes = await sauverPosition('l1', 'v1', { bloc: 3 })
    expect(lignes).toEqual([{ id: 'p1' }])
    expect(appels).toHaveLength(1)
    const b = appels[0]
    expect(b.table).toBe('academy_progression_lecons')
    const patch = b.etapes.find(([n]) => n === 'update')[1]
    expect(patch.position).toEqual({ bloc: 3 })
    expect(Object.keys(patch).sort()).toEqual(['position', 'updated_at'])
    expect(b.etapes).toContainEqual(['eq', 'profile_id', 'u1'])
    expect(b.etapes).toContainEqual(['eq', 'lecon_id', 'l1'])
    expect(b.etapes[b.etapes.length - 1]).toEqual(['select', 'id'])
  })

  it('cree la ligne quand elle manque, avec la cle de conflit profile_id,lecon_id', async () => {
    reponses = [{ data: [], error: null }, { data: [{ id: 'p2' }], error: null }]
    const lignes = await sauverPosition('l1', 'v1', { bloc: 1 })
    expect(lignes).toEqual([{ id: 'p2' }])
    expect(appels).toHaveLength(2)
    const b = appels[1]
    expect(b.table).toBe('academy_progression_lecons')
    const [, ligne, options] = b.etapes.find(([n]) => n === 'upsert')
    expect(ligne).toEqual({ profile_id: 'u1', lecon_id: 'l1', version_id: 'v1', position: { bloc: 1 } })
    expect(options.onConflict).toBe('profile_id,lecon_id')
    expect(b.etapes[b.etapes.length - 1]).toEqual(['select', 'id'])
  })

  it('leve quand la base ne touche aucune ligne, et le journalise', async () => {
    reponses = [{ data: [], error: null }]
    await expect(sauverPosition('l1', 'v1', {})).rejects.toThrow(/refusé/)
    expect(logger.error).toHaveBeenCalledWith('[academy] sauverPosition', expect.any(Error))
  })

  it('ne touche pas la base sans session', async () => {
    utilisateur = null
    await expect(sauverPosition('l1', 'v1', {})).rejects.toThrow(/Session expirée/)
    expect(appels).toHaveLength(0)
  })
})

describe('fonctions SQL', () => {
  it('ouvrirTentative appelle academy_ouvrir_tentative avec p_version_id, p_type et p_jeton', async () => {
    reponses = [{ data: { tentative_id: 't1', questions: [] }, error: null }]
    const t = await ouvrirTentative('v1', 'quiz', 'j1')
    expect(t).toEqual({ tentative_id: 't1', questions: [] })
    expect(rpcs).toEqual([['academy_ouvrir_tentative', { p_version_id: 'v1', p_type: 'quiz', p_jeton: 'j1' }]])
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
