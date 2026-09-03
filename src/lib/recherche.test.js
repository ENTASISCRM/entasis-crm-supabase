import { describe, it, expect } from 'vitest'
import { normaliser, jetons, scoreTexte, chercher, correspond, segmenter } from './recherche'

// Les cas nommés « cas réel » viennent de la base : 379 clients, dont 48 avec
// un accent dans le nom et 330 sans prénom séparé.

describe('normaliser', () => {
  it('retire les accents', () => {
    expect(normaliser('Aurélie')).toBe('aurelie')
    expect(normaliser('Benoît')).toBe('benoit')
    expect(normaliser('Françoise')).toBe('francoise')
    expect(normaliser('HERVÉ')).toBe('herve')
  })

  it('traite les ligatures, que NFD ne décompose pas', () => {
    expect(normaliser('Lecœur')).toBe('lecoeur')
    expect(normaliser('Lætitia')).toBe('laetitia')
  })

  it('coupe sur le trait d’union et l’apostrophe', () => {
    expect(normaliser('Jean-Émile O’Brien')).toBe('jean emile o brien')
  })

  it('garde ce qui compose un email', () => {
    expect(normaliser('Louis.Hatton+crm@entasis-conseil.fr'))
      .toBe('louis.hatton+crm@entasis conseil.fr')
  })

  it('encaisse l’absence de valeur', () => {
    expect(normaliser(null)).toBe('')
    expect(normaliser(undefined)).toBe('')
    expect(normaliser(0)).toBe('0')
  })
})

describe('jetons', () => {
  it('découpe une requête en mots comparables', () => {
    expect(jetons('  Vacher   Hervé ')).toEqual(['vacher', 'herve'])
  })
  it('rend une liste vide quand il n’y a rien à chercher', () => {
    expect(jetons('   ')).toEqual([])
    expect(jetons('---')).toEqual([])
    expect(jetons(null)).toEqual([])
  })
})

describe('scoreTexte — ce que la recherche actuelle rate', () => {
  it('trouve un nom accentué tapé sans accent', () => {
    // Cas réel : 48 fiches sur 379. `includes` échouait sur toutes.
    expect(scoreTexte('Aurélie buiret', 'aurelie')).toBeGreaterThan(0)
    expect(scoreTexte('Stéphanie Bernard', 'stephanie')).toBeGreaterThan(0)
    expect(scoreTexte('Hervé Vacher', 'herve')).toBeGreaterThan(0)
  })

  it('trouve aussi dans l’autre sens : accent tapé, fiche sans accent', () => {
    expect(scoreTexte('Aurelie Exemple', 'aurélie')).toBeGreaterThan(0)
  })

  it('se moque de l’ordre des mots', () => {
    // Cas réel : `nom` = « Vacher », `prenom` = « Hervé ». Les deux champs
    // étaient interrogés séparément, donc aucun ne contenait la phrase.
    const fiche = 'Hervé Vacher'
    expect(scoreTexte(fiche, 'herve vacher')).toBeGreaterThan(0)
    expect(scoreTexte(fiche, 'vacher herve')).toBeGreaterThan(0)
  })

  it('marche que le prénom soit dans son champ ou collé au nom', () => {
    // Les deux moitiés de la base, même requête.
    expect(scoreTexte('Aurélie buiret', 'buiret aurelie')).toBeGreaterThan(0)
    expect(scoreTexte('Hervé Vacher', 'vacher herve')).toBeGreaterThan(0)
  })

  it('tolère une lettre oubliée', () => {
    expect(scoreTexte('Cédric Cadet', 'cadt')).toBeGreaterThan(0)
    expect(scoreTexte('Georgelin', 'gorgelin')).toBeGreaterThan(0)
  })

  it('ne tolère pas n’importe quoi', () => {
    // Sans garde, une recherche floue remonte toute la base.
    expect(scoreTexte('Cédric Cadet', 'ct')).toBe(0)        // moins de 3 lettres
    expect(scoreTexte('Cédric Cadet', 'adt')).toBe(0)       // initiale différente
    expect(scoreTexte('Cédric Cadet', 'cric cadt xyz')).toBe(0)
  })

  it('ajouter un mot restreint, jamais n’élargit', () => {
    expect(scoreTexte('Hervé Vacher', 'herve')).toBeGreaterThan(0)
    expect(scoreTexte('Hervé Vacher', 'herve manioc')).toBe(0)
  })

  it('classe le mot exact devant le fragment', () => {
    expect(scoreTexte('Cadet', 'cadet')).toBeGreaterThan(scoreTexte('Decadet', 'cadet'))
    expect(scoreTexte('Cadet', 'cadet')).toBeGreaterThan(scoreTexte('Cadenat', 'cade'))
  })

  it('classe la fiche courte devant la longue, à correspondance égale', () => {
    expect(scoreTexte('Cadet', 'cadet'))
      .toBeGreaterThan(scoreTexte('Cadet Villeneuve de la Tour', 'cadet'))
  })

  it('privilégie une correspondance en tête de fiche', () => {
    expect(scoreTexte('Bernard Dupont', 'bernard'))
      .toBeGreaterThan(scoreTexte('Dupont Bernard', 'bernard'))
  })

  it('ne rend jamais de score sans requête ni sans texte', () => {
    expect(scoreTexte('Cadet', '')).toBe(0)
    expect(scoreTexte('', 'cadet')).toBe(0)
    expect(scoreTexte(null, 'cadet')).toBe(0)
    expect(scoreTexte('Cadet', null)).toBe(0)
  })
})

describe('correspond', () => {
  it('remplace `includes` sans le trahir', () => {
    expect(correspond('Cédric Cadet · CCAD · cedric@x.fr', 'ccad')).toBe(true)
    expect(correspond('Cédric Cadet', 'manioc')).toBe(false)
  })

  // Le seul point ou correspond s ecarte de `includes` : "abc".includes('')
  // vaut true, une requete vide n a ici aucun jeton donc aucune
  // correspondance. C est voulu pour le classement, mais tout filtre de liste
  // doit neutraliser la requete vide lui meme. Regression « Dossiers du mois »
  // du 28/08 au 03/09 : la liste entiere disparaissait barre de recherche vide.
  it('renvoie false sur une requête vide, au filtre appelant de la neutraliser', () => {
    expect(correspond('Cédric Cadet', '')).toBe(false)
    expect(correspond('Cédric Cadet', '   ')).toBe(false)
  })
})

describe('chercher', () => {
  const base = [
    { id: 1, t: 'Aurélie buiret' },
    { id: 2, t: 'Cédric Cadet' },
    { id: 3, t: 'Véronique Manioc' },
    { id: 4, t: 'Cadenat Paul' },
  ]
  const texteDe = (c) => c.t

  it('rend les fiches triées par pertinence', () => {
    const r = chercher(base, 'cad', texteDe)
    expect(r.map((c) => c.id)).toEqual([2, 4])
  })

  it('rend la liste entière quand la requête est vide', () => {
    expect(chercher(base, '', texteDe)).toHaveLength(4)
    expect(chercher(base, '  ', texteDe)).toHaveLength(4)
  })

  it('borne le nombre de résultats, requête vide comprise', () => {
    expect(chercher(base, '', texteDe, { max: 2 })).toHaveLength(2)
    expect(chercher(base, 'a', texteDe, { max: 1 })).toHaveLength(1)
  })

  it('départage à score égal quand on le lui demande', () => {
    const ex = [{ id: 'b', t: 'Cadet' }, { id: 'a', t: 'Cadet' }]
    const r = chercher(ex, 'cadet', texteDe, { departage: (x, y) => x.id.localeCompare(y.id) })
    expect(r.map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('encaisse une liste absente', () => {
    expect(chercher(null, 'x', texteDe)).toEqual([])
    expect(chercher(undefined, '', texteDe)).toEqual([])
  })
})

describe('segmenter — montrer pourquoi une fiche remonte', () => {
  const recolle = (segs) => segs.map((s) => s.texte).join('')
  const marque = (segs) => segs.filter((s) => s.marque).map((s) => s.texte)

  it('ne perd jamais un caractère du texte affiché', () => {
    for (const q of ['aurelie', 'buiret aurelie', 'xyz', '']) {
      expect(recolle(segmenter('Aurélie buiret', q))).toBe('Aurélie buiret')
    }
  })

  it('marque le texte accentué d’origine quand on tape sans accent', () => {
    // Le piège : « Aurélie » normalisé fait la même longueur ici, mais
    // « Lecœur » non — une position normalisée ne vaut pas une position réelle.
    expect(marque(segmenter('Aurélie buiret', 'aurelie'))).toEqual(['Aurélie'])
  })

  it('reste aligné malgré une ligature, qui change la longueur', () => {
    const segs = segmenter('Lecœur', 'lecoeur')
    expect(recolle(segs)).toBe('Lecœur')
    expect(marque(segs)).toEqual(['Lecœur'])
  })

  it('marque chaque mot de la requête, dans le désordre', () => {
    expect(marque(segmenter('Hervé Vacher', 'vacher herve'))).toEqual(['Hervé', 'Vacher'])
  })

  it('ne marque rien quand rien ne correspond littéralement', () => {
    // « cadt » trouve la fiche par tolérance, mais on ne surligne pas des
    // lettres éparpillées : ça donnerait un mot en confettis.
    expect(marque(segmenter('Cédric Cadet', 'cadt'))).toEqual([])
  })

  it('rend le texte intact sans requête', () => {
    expect(segmenter('Cadet', '')).toEqual([{ texte: 'Cadet', marque: false }])
    expect(segmenter('', 'cadet')).toEqual([{ texte: '', marque: false }])
    expect(segmenter(null, 'x')).toEqual([{ texte: '', marque: false }])
  })
})
