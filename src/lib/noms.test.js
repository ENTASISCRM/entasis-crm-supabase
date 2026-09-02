import { describe, it, expect } from 'vitest'
import {
  normaliserNomComplet, separerNomComplet, normaliserTelephone, telephoneAppel,
  estToutMajuscule, estParticule, PARTICULES,
} from './noms'

describe('normaliserNomComplet', () => {
  it('met une majuscule à chaque mot et le reste en minuscule', () => {
    expect(normaliserNomComplet('charlotte billard')).toBe('Charlotte Billard')
    expect(normaliserNomComplet('charlotte Billard')).toBe('Charlotte Billard')
  })

  it('réduit les espaces multiples et les espaces de bord', () => {
    expect(normaliserNomComplet('  Eliott  Bec ')).toBe('Eliott Bec')
    expect(normaliserNomComplet('Eliott  Bec')).toBe('Eliott Bec')
  })

  it('garde un nom déjà tout en majuscules, convention voulue', () => {
    expect(normaliserNomComplet('MOREL hyppolite')).toBe('MOREL Hyppolite')
  })

  it('laisse les particules en minuscule', () => {
    expect(normaliserNomComplet('paulin de la fontaine')).toBe('Paulin de la Fontaine')
    expect(normaliserNomComplet('Ludwig VAN beethoven')).toBe('Ludwig VAN Beethoven')
    expect(normaliserNomComplet('anna Von Trapp')).toBe('Anna Von Trapp')
  })

  it('garde le tiret des prénoms composés avec une majuscule après', () => {
    expect(normaliserNomComplet('jean-michel sionneau')).toBe('Jean-Michel Sionneau')
    expect(normaliserNomComplet('MARIE-CLAIRE dupont')).toBe('MARIE-CLAIRE Dupont')
  })

  it('respecte un nom qui porte déjà une majuscule (article, apostrophe, majuscule interne)', () => {
    expect(normaliserNomComplet('Paul Le Goff')).toBe('Paul Le Goff')
    expect(normaliserNomComplet('Sophie McCarthy')).toBe('Sophie McCarthy')
    expect(normaliserNomComplet("Sean O'Neil")).toBe("Sean O'Neil")
    expect(normaliserNomComplet("Jean d'Ormesson")).toBe("Jean d'Ormesson")
    expect(normaliserNomComplet("Jeanne D'Arc")).toBe("Jeanne D'Arc")
    expect(normaliserNomComplet('Jean LeBlanc')).toBe('Jean LeBlanc')
    expect(normaliserNomComplet('le goff paul')).toBe('Le Goff Paul')
  })

  it('gère le d apostrophe et les apostrophes internes', () => {
    expect(normaliserNomComplet("pierre d'artagnan")).toBe("Pierre d'Artagnan")
    expect(normaliserNomComplet("conor o'brien")).toBe("Conor O'Brien")
  })

  it('ne touche pas aux accents', () => {
    expect(normaliserNomComplet('aurélie exemple')).toBe('Aurélie Exemple')
    expect(normaliserNomComplet('émile zola')).toBe('Émile Zola')
  })

  it('rend une chaîne vide pour un libellé vide ou nul', () => {
    expect(normaliserNomComplet('')).toBe('')
    expect(normaliserNomComplet('   ')).toBe('')
    expect(normaliserNomComplet(null)).toBe('')
    expect(normaliserNomComplet(undefined)).toBe('')
  })
})

describe('separerNomComplet', () => {
  it('ne propose jamais une civilité, un couple ou une annotation comme prénom sûr', () => {
    expect(separerNomComplet('Mr et Mme DUPONT')).toMatchObject({ prenom: '', nom: 'DUPONT', confiance: 'faible' })
    expect(separerNomComplet('Mme Exemple')).toMatchObject({ prenom: '', nom: 'Mme Exemple', confiance: 'faible' })
    expect(separerNomComplet('Jean DUPONT (père)')).toMatchObject({ prenom: '', nom: 'DUPONT', confiance: 'faible' })
    expect(separerNomComplet('Camille & Dominique Exemple').confiance).toBe('faible')
  })

  it('un seul mot : pas de prénom, confiance faible', () => {
    const r = separerNomComplet('Exemple')
    expect(r).toMatchObject({ prenom: '', nom: 'Exemple', confiance: 'faible' })
    expect(r.raison).toBeTruthy()
  })

  it('un mot en majuscules est le nom, quel que soit l ordre', () => {
    expect(separerNomComplet('MOREL Hyppolite')).toMatchObject({ prenom: 'Hyppolite', nom: 'MOREL', confiance: 'haute' })
    expect(separerNomComplet('Hyppolite MOREL')).toMatchObject({ prenom: 'Hyppolite', nom: 'MOREL', confiance: 'haute' })
  })

  it('plusieurs mots en majuscules forment le nom ensemble', () => {
    expect(separerNomComplet('Paulin DE LA FONTAINE')).toMatchObject({ prenom: 'Paulin', nom: 'DE LA FONTAINE', confiance: 'haute' })
  })

  it('tout en majuscules : aucun indice, on retombe sur l ordre des mots', () => {
    expect(separerNomComplet('AURELIE BUIRET')).toMatchObject({ prenom: 'AURELIE', nom: 'BUIRET', confiance: 'moyenne' })
  })

  it('une particule annonce le nom, tout ce qui suit lui appartient', () => {
    expect(separerNomComplet('Paulin de La Fontaine')).toMatchObject({ prenom: 'Paulin', nom: 'de La Fontaine', confiance: 'haute' })
    expect(separerNomComplet('Anna von Trapp')).toMatchObject({ prenom: 'Anna', nom: 'von Trapp', confiance: 'haute' })
    expect(separerNomComplet("Pierre d'Artagnan")).toMatchObject({ prenom: 'Pierre', nom: "d'Artagnan", confiance: 'haute' })
  })

  it('un prénom composé avant la particule reste entier', () => {
    expect(separerNomComplet('Jean Baptiste du Val')).toMatchObject({ prenom: 'Jean Baptiste', nom: 'du Val', confiance: 'haute' })
  })

  it('un libellé qui commence par la particule ne fabrique pas un prénom « de »', () => {
    expect(separerNomComplet('de Gaulle')).toMatchObject({ prenom: '', nom: 'de Gaulle', confiance: 'faible' })
    expect(separerNomComplet('de La Fontaine Paulin')).toMatchObject({ prenom: 'Paulin', nom: 'de La Fontaine', confiance: 'moyenne' })
  })

  it('deux mots : prénom puis nom, confiance moyenne', () => {
    expect(separerNomComplet('Aurélie Exemple')).toMatchObject({ prenom: 'Aurélie', nom: 'Exemple', confiance: 'moyenne' })
  })

  it('le tiret garde un prénom composé ensemble', () => {
    expect(separerNomComplet('Jean-Michel Sionneau')).toMatchObject({ prenom: 'Jean-Michel', nom: 'Sionneau', confiance: 'moyenne' })
  })

  it('trois mots ou plus sans indice : premier = prénom, reste = nom, faible', () => {
    expect(separerNomComplet('Marie Claire Dupont')).toMatchObject({ prenom: 'Marie', nom: 'Claire Dupont', confiance: 'faible' })
  })

  it('absorbe les espaces multiples avant de découper', () => {
    expect(separerNomComplet('Eliott  Bec')).toMatchObject({ prenom: 'Eliott', nom: 'Bec', confiance: 'moyenne' })
    expect(separerNomComplet('  MOREL   Hyppolite  ')).toMatchObject({ prenom: 'Hyppolite', nom: 'MOREL' })
  })

  it('ne change pas la casse de ce qui est saisi', () => {
    expect(separerNomComplet('aurélie buiret')).toMatchObject({ prenom: 'aurélie', nom: 'buiret' })
  })

  it('vide ou nul : rien à séparer, confiance faible', () => {
    expect(separerNomComplet('')).toMatchObject({ prenom: '', nom: '', confiance: 'faible' })
    expect(separerNomComplet('   ')).toMatchObject({ prenom: '', nom: '', confiance: 'faible' })
    expect(separerNomComplet(null)).toMatchObject({ prenom: '', nom: '', confiance: 'faible' })
    expect(separerNomComplet(undefined)).toMatchObject({ prenom: '', nom: '', confiance: 'faible' })
  })

  it('ne rend jamais une confiance hors des trois valeurs', () => {
    for (const t of ['A', 'A B', 'A B C', 'A DE B', 'X Y Z W', '', null]) {
      expect(['haute', 'moyenne', 'faible']).toContain(separerNomComplet(t).confiance)
    }
  })
})

describe('normaliserTelephone', () => {
  it('reconnaît les quatre formes courantes d un mobile', () => {
    expect(normaliserTelephone('0612345678')).toBe('06 12 34 56 78')
    expect(normaliserTelephone('+33 6 12 34 56 78')).toBe('06 12 34 56 78')
    expect(normaliserTelephone('33612345678')).toBe('06 12 34 56 78')
    expect(normaliserTelephone('06.12.34.56.78')).toBe('06 12 34 56 78')
  })

  it('accepte les tirets, le 0033 et le (0) après l indicatif', () => {
    expect(normaliserTelephone('06-12-34-56-78')).toBe('06 12 34 56 78')
    expect(normaliserTelephone('0033612345678')).toBe('06 12 34 56 78')
    expect(normaliserTelephone('+33 (0)6 12 34 56 78')).toBe('06 12 34 56 78')
  })

  it('traite un fixe comme un mobile', () => {
    expect(normaliserTelephone('0145678901')).toBe('01 45 67 89 01')
    expect(normaliserTelephone('+33145678901')).toBe('01 45 67 89 01')
  })

  it('laisse un numéro non reconnu tel quel, espaces doubles retirés', () => {
    expect(normaliserTelephone('+41 79  123 45 67')).toBe('+41 79 123 45 67')
    expect(normaliserTelephone('0612')).toBe('0612')
    expect(normaliserTelephone('poste  412')).toBe('poste 412')
  })

  it('rend une chaîne vide pour une saisie vide ou nulle', () => {
    expect(normaliserTelephone('')).toBe('')
    expect(normaliserTelephone('   ')).toBe('')
    expect(normaliserTelephone(null)).toBe('')
    expect(normaliserTelephone(undefined)).toBe('')
  })
})

describe('telephoneAppel', () => {
  it('ne garde que les chiffres et le plus de tête', () => {
    expect(telephoneAppel('06 12 34 56 78')).toBe('0612345678')
    expect(telephoneAppel('+33 6 12 34 56 78')).toBe('+33612345678')
    expect(telephoneAppel('06.12.34.56.78')).toBe('0612345678')
  })

  it('rend vide quand il n y a rien à composer', () => {
    expect(telephoneAppel('')).toBe('')
    expect(telephoneAppel('abc')).toBe('')
    expect(telephoneAppel(null)).toBe('')
  })
})

describe('utilitaires exposés', () => {
  it('PARTICULES contient les particules françaises et germaniques usuelles', () => {
    for (const p of ['de', 'du', 'des', 'le', 'la', 'van', 'von', 'd']) expect(PARTICULES).toContain(p)
  })

  it('estToutMajuscule exige au moins deux lettres', () => {
    expect(estToutMajuscule('MOREL')).toBe(true)
    expect(estToutMajuscule('J.')).toBe(false)
    expect(estToutMajuscule('Morel')).toBe(false)
    expect(estToutMajuscule('')).toBe(false)
  })

  it('estParticule reconnaît la particule quelle que soit sa casse', () => {
    expect(estParticule('La')).toBe(true)
    expect(estParticule("d'Artagnan")).toBe(true)
    expect(estParticule('Fontaine')).toBe(false)
    expect(estParticule('')).toBe(false)
  })
})
