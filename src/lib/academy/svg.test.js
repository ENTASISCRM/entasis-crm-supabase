// Assainissement des schémas SVG. Ce que ces tests verrouillent : la pré
// vérification refuse sous Node (sans DOM) tout ce que le guide d’auteur
// interdit, un schéma sain passe et sa racine reçoit role, aria-label,
// width 100 % et height auto, et les crochets DOMPurify (liste blanche,
// href internes, url() internes) sont branchés avec la bonne logique.
//
// DOMPurify a besoin d’un DOM et jsdom n’est pas dans les dépendances :
// sous Node l’instance réelle est inerte (isSupported faux), le module ne
// l’appelle pas et le texte pré vérifié passe tel quel. L’assainissement
// complet se joue dans le navigateur, le harnais visuel le vérifie. Le faux
// DOMPurify de la dernière section reproduit son contrat (addHook,
// sanitize, isSupported) pour prouver le branchement et la logique des
// crochets.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { assainirSvg, preVerifierSvg, poserRacine, LONGUEUR_MAX, BALISES_INTERDITES, BALISES_AUTORISEES } from './svg'

// Un schéma tel que le guide d’auteur le demande : viewBox 640 × 360, fond
// blanc, palette du cabinet, title, un marker avec url(#…), un use interne.
const SAIN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
  <title>La vie d’un versement PER</title>
  <defs>
    <marker id="fleche" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0L8 4L0 8z" fill="#C5A55A"/></marker>
    <linearGradient id="or"><stop offset="0" stop-color="#F5EDD8"/><stop offset="1" stop-color="#C5A55A"/></linearGradient>
    <g id="etape"><rect width="120" height="60" rx="8" fill="#F5EDD8" stroke="#162443" stroke-width="2"/></g>
  </defs>
  <rect width="640" height="360" fill="#fff"/>
  <use href="#etape" x="40" y="150"/>
  <line x1="170" y1="180" x2="250" y2="180" stroke="#C5A55A" stroke-width="2" marker-end="url(#fleche)"/>
  <text x="100" y="185" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" fill="#2C3548" style="font-weight:600">Versement</text>
</svg>`

describe('preVerifierSvg et assainirSvg, les SVG hostiles', () => {
  const refuse = (texte, motif) => {
    const r = assainirSvg(texte)
    expect(r.ok).toBe(false)
    expect(r.raison).toMatch(motif)
    expect(r).not.toHaveProperty('svg')
    expect(preVerifierSvg(texte).ok).toBe(false)
  }

  it('refuse une balise script, même en majuscules ou fermante', () => {
    refuse('<svg viewBox="0 0 10 10"><script>alert(1)</script></svg>', /Balise interdite : script/)
    refuse('<svg viewBox="0 0 10 10"><SCRIPT src="x"></SCRIPT></svg>', /Balise interdite : script/)
    refuse('<svg viewBox="0 0 10 10"></script ></svg>', /Balise interdite : script/)
  })

  it('refuse un attribut on*, quel que soit le séparateur', () => {
    refuse('<svg viewBox="0 0 10 10" onload="alert(1)"></svg>', /gestionnaire/)
    refuse('<svg/onload=alert(1)>', /gestionnaire/)
    refuse('<svg viewBox="0 0 10 10"><rect width="1" height="1"onclick = "x"/></svg>', /gestionnaire/)
    refuse('<svg viewBox="0 0 10 10"><text ONMOUSEOVER="x">a</text></svg>', /gestionnaire/)
  })

  it('refuse foreignObject, image, iframe, object, embed et l’élément style', () => {
    refuse('<svg viewBox="0 0 10 10"><foreignObject><div>x</div></foreignObject></svg>', /Balise interdite : foreignObject/)
    refuse('<svg viewBox="0 0 10 10"><image href="#a"/></svg>', /Balise interdite : image/)
    refuse('<svg viewBox="0 0 10 10"><iframe></iframe></svg>', /Balise interdite : iframe/)
    refuse('<svg viewBox="0 0 10 10"><object data="x"></object></svg>', /Balise interdite : object/)
    refuse('<svg viewBox="0 0 10 10"><embed src="x"/></svg>', /Balise interdite : embed/)
    refuse('<svg viewBox="0 0 10 10"><style>rect{fill:url(http://e)}</style></svg>', /Balise interdite : style/)
  })

  it('refuse un href ou xlink:href qui ne renvoie pas à l’intérieur du schéma', () => {
    refuse('<svg viewBox="0 0 10 10"><use href="https://exemple.fr/x.svg#a"/></svg>', /Lien externe/)
    refuse('<svg viewBox="0 0 10 10"><use xlink:href="//exemple.fr/x.svg#a"/></svg>', /Lien externe/)
    refuse("<svg viewBox='0 0 10 10'><use href='/local.svg#a'/></svg>", /Lien externe/)
    refuse('<svg viewBox="0 0 10 10"><use href=x.svg /></svg>', /Lien externe/)
    refuse('<svg viewBox="0 0 10 10"><use href="&#106;avascript:alert(1)"/></svg>', /Lien externe/)
    refuse('<svg viewBox="0 0 10 10"><use href=""/></svg>', /Lien externe/)
  })

  it('refuse javascript:, data: et url() vers l’extérieur', () => {
    refuse('<svg viewBox="0 0 10 10"><a href="javascript:alert(1)"><text>x</text></a></svg>', /Lien externe|javascript/)
    refuse('<svg viewBox="0 0 10 10"><rect fill="javascript:alert(1)"/></svg>', /javascript/)
    refuse('<svg viewBox="0 0 10 10"><rect fill="data:image/svg+xml;base64,AAAA"/></svg>', /data:/)
    refuse('<svg viewBox="0 0 10 10"><rect style="fill:url(https://exemple.fr/x.svg#g)"/></svg>', /url\(\)/)
    refuse('<svg viewBox="0 0 10 10"><rect fill="url( \'http://exemple.fr\' )"/></svg>', /url\(\)/)
  })

  it('refuse un texte trop long, vide, qui n’est pas un SVG ou qui porte une déclaration', () => {
    const long = `<svg viewBox="0 0 10 10"><desc>${'a'.repeat(LONGUEUR_MAX)}</desc></svg>`
    expect(long.length).toBeGreaterThan(LONGUEUR_MAX)
    refuse(long, /trop long/)
    refuse('', /vide/)
    refuse('   \n', /vide/)
    refuse(null, /vide/)
    refuse(42, /vide/)
    refuse('<div>pas un svg</div>', /balise svg/)
    refuse('Un simple texte', /balise svg/)
    refuse('<svg viewBox="0 0 10 10"><![CDATA[<x>]]></svg>', /Déclaration/)
    refuse('<svg viewBox="0 0 10 10"><!DOCTYPE svg [<!ENTITY x "y">]></svg>', /Déclaration/)
    refuse('<svg viewBox="0 0 10 10"><?php echo 1 ?></svg>', /Déclaration/)
  })

  it('accepte exactement LONGUEUR_MAX caractères', () => {
    const debut = '<svg viewBox="0 0 10 10"><desc>'
    const fin = '</desc></svg>'
    const juste = `${debut}${'a'.repeat(LONGUEUR_MAX - debut.length - fin.length)}${fin}`
    expect(juste.length).toBe(LONGUEUR_MAX)
    expect(assainirSvg(juste).ok).toBe(true)
  })
})

describe('assainirSvg, un schéma sain', () => {
  it('passe, garde son contenu et reçoit role, aria-label, width 100 % et height auto', () => {
    const r = assainirSvg(SAIN)
    expect(r.ok).toBe(true)
    expect(r.raison).toBeUndefined()
    expect(r.svg).toMatch(/^<svg /)
    expect(r.svg).toContain('role="img"')
    // Sans alt, le <title> du schéma sert de libellé accessible.
    expect(r.svg).toContain('aria-label="La vie d’un versement PER"')
    const racine = r.svg.slice(0, r.svg.indexOf('>') + 1)
    expect(racine).toContain('width="100%"')
    expect(racine).not.toContain('height=')
    expect(racine).not.toContain('width="640"')
    expect(racine).not.toContain('height="360"')
    expect(racine).toContain('viewBox="0 0 640 360"')
    expect(r.svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(r.svg).toContain('marker-end="url(#fleche)"')
    expect(r.svg).toContain('<use href="#etape"')
    expect(r.svg).toContain('style="font-weight:600"')
    expect(r.svg).toContain('>Versement</text>')
    expect(r.svg.trim().endsWith('</svg>')).toBe(true)
    // Le width="640" du rect de fond, lui, reste : seule la racine est normalisée.
    expect(r.svg).toContain('<rect width="640" height="360" fill="#fff"/>')
  })

  it('prend l’alt fourni avant le title, et « Schéma » à défaut', () => {
    expect(assainirSvg(SAIN, { alt: '  Les trois étapes  du versement ' }).svg).toContain('aria-label="Les trois étapes du versement"')
    expect(assainirSvg('<svg viewBox="0 0 10 10"><rect width="1" height="1"/></svg>').svg).toContain('aria-label="Schéma"')
    expect(assainirSvg('<svg viewBox="0 0 10 10"><title>  </title></svg>').svg).toContain('aria-label="Schéma"')
    expect(assainirSvg('<svg viewBox="0 0 10 10"><title>A &amp; B &lt;c&gt;</title></svg>').svg).toContain('aria-label="A &amp; B &lt;c&gt;"')
    expect(assainirSvg(SAIN, { alt: 'Dit "ceci" <là>' }).svg).toContain('aria-label="Dit &quot;ceci&quot; &lt;là&gt;"')
  })

  it('retire le prologue XML, le DOCTYPE simple et les commentaires', () => {
    const r = assainirSvg('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n<!-- Généré à la main -->\n<svg viewBox="0 0 10 10"><!-- fond --><rect width="10" height="10"/></svg>')
    expect(r.ok).toBe(true)
    expect(r.svg).not.toContain('<?xml')
    expect(r.svg).not.toContain('DOCTYPE')
    expect(r.svg).not.toContain('<!--')
    expect(r.svg).toMatch(/^<svg viewBox="0 0 10 10" role="img"/)
  })

  it('accepte une racine auto fermante ou en majuscules', () => {
    expect(assainirSvg('<svg viewBox="0 0 10 10"/>').svg).toBe('<svg viewBox="0 0 10 10" role="img" aria-label="Schéma" width="100%" />')
    expect(assainirSvg('<SVG viewBox="0 0 10 10"></SVG>').svg).toBe('<svg viewBox="0 0 10 10" role="img" aria-label="Schéma" width="100%"></SVG>')
  })
})

describe('poserRacine', () => {
  it('remplace role, aria-label, width et height déjà présents, même avec un > entre guillemets', () => {
    const svg = poserRacine('<svg role="presentation" aria-label="x" width=640 height="360px" data-note="a > b" viewBox="0 0 640 360"><g/></svg>', 'Mon schéma')
    expect(svg).toBe('<svg data-note="a > b" viewBox="0 0 640 360" role="img" aria-label="Mon schéma" width="100%"><g/></svg>')
  })
  it('rend null sur une balise illisible', () => {
    expect(poserRacine('<svg viewBox="0 0 1 1', 'x')).toBeNull()
    expect(poserRacine('<rect/>', 'x')).toBeNull()
    expect(poserRacine('', 'x')).toBeNull()
  })
})

describe('les listes publiées', () => {
  it('interdit les sept balises de la spec et n’autorise que la liste blanche', () => {
    expect([...BALISES_INTERDITES]).toEqual(['script', 'foreignObject', 'image', 'iframe', 'object', 'embed', 'style'])
    expect(BALISES_AUTORISEES).toContain('use')
    expect(BALISES_AUTORISEES).toContain('lineargradient')
    expect(BALISES_AUTORISEES).not.toContain('a')
    expect(BALISES_AUTORISEES).not.toContain('animate')
    expect(BALISES_AUTORISEES.every((b) => b === b.toLowerCase())).toBe(true)
    expect(LONGUEUR_MAX).toBe(24000)
  })
})

// ─── Branchement de DOMPurify, avec un faux qui a un DOM ──────────────────

describe('assainirSvg avec DOMPurify supporté (faux)', () => {
  afterEach(() => {
    vi.doUnmock('dompurify')
    vi.resetModules()
  })

  async function chargerAvecFaux() {
    vi.resetModules()
    const crochets = {}
    const appels = []
    vi.doMock('dompurify', () => {
      // sanitize rend, comme avec RETURN_DOM, un corps dont le premier
      // élément est la racine svg (nodeName et outerHTML suffisent ici).
      const instance = {
        isSupported: true,
        addHook: (nom, fn) => { (crochets[nom] ||= []).push(fn) },
        sanitize: (texte, config) => {
          appels.push({ texte, config })
          return { firstElementChild: { nodeName: 'svg', outerHTML: String(texte).replace(/<svg\b/i, '<svg data-purifie="1"') } }
        },
      }
      const fabrique = () => instance
      return { default: fabrique }
    })
    const mod = await import('./svg')
    return { mod, crochets, appels }
  }

  it('appelle sanitize en profil svg, avec use ajouté et les sept balises interdites', async () => {
    const { mod, appels } = await chargerAvecFaux()
    const r = mod.assainirSvg(SAIN, { alt: 'Versement' })
    expect(r.ok).toBe(true)
    expect(r.svg).toContain('data-purifie="1"')
    expect(r.svg).toContain('role="img" aria-label="Versement" width="100%"')
    expect(appels).toHaveLength(1)
    const { config } = appels[0]
    expect(config.USE_PROFILES).toEqual({ svg: true })
    expect(config.ADD_TAGS).toEqual(['use'])
    expect(config.FORBID_TAGS).toEqual(['script', 'foreignobject', 'image', 'iframe', 'object', 'embed', 'style'])
    expect(config.FORBID_ATTR).toEqual(['tabindex'])
    expect(config.ALLOW_DATA_ATTR).toBe(false)
    expect(config.KEEP_CONTENT).toBe(true)
    expect(config.RETURN_DOM).toBe(true)
  })

  it('ne sanitize pas ce que la pré vérification a déjà refusé', async () => {
    const { mod, appels } = await chargerAvecFaux()
    expect(mod.assainirSvg('<svg onload="x"></svg>').ok).toBe(false)
    expect(appels).toHaveLength(0)
  })

  it('refuse quand DOMPurify ne rend plus de racine svg', async () => {
    vi.resetModules()
    vi.doMock('dompurify', () => ({ default: () => ({ isSupported: true, addHook: () => {}, sanitize: () => ({ firstElementChild: null }) }) }))
    let mod = await import('./svg')
    let r = mod.assainirSvg(SAIN)
    expect(r.ok).toBe(false)
    expect(r.raison).toMatch(/rien de rendable/)
    // Un premier élément qui n’est pas la racine svg (sortie du contenu étranger) : refus aussi.
    vi.resetModules()
    vi.doMock('dompurify', () => ({ default: () => ({ isSupported: true, addHook: () => {}, sanitize: () => ({ firstElementChild: { nodeName: 'DIV', outerHTML: '<div>x</div>' } }) }) }))
    mod = await import('./svg')
    r = mod.assainirSvg(SAIN)
    expect(r.ok).toBe(false)
    expect(r.raison).toMatch(/rien de rendable/)
  })

  it('le crochet d’élément écarte tout ce qui n’est pas dans la liste blanche, texte compris', async () => {
    const { crochets } = await chargerAvecFaux()
    const [surElement] = crochets.uponSanitizeElement
    const passe = (tagName, nodeType = 1) => {
      const data = { tagName, allowedTags: { [tagName]: true } }
      surElement({ nodeType }, data)
      return data.allowedTags[tagName]
    }
    for (const b of BALISES_AUTORISEES) expect(passe(b)).toBe(true)
    expect(passe('a')).toBe(false)
    expect(passe('animate')).toBe(false)
    expect(passe('set')).toBe(false)
    expect(passe('symbol')).toBe(false)
    expect(passe('pattern')).toBe(false)
    expect(passe('mask')).toBe(false)
    expect(passe('filter')).toBe(false)
    // Un nœud texte n’est pas un élément : on ne touche pas à sa ligne.
    expect(passe('#text', 3)).toBe(true)
  })

  it('le crochet d’attribut garde les href internes, retire les externes, les url() externes et les on*', async () => {
    const { crochets } = await chargerAvecFaux()
    const [surAttribut] = crochets.uponSanitizeAttribute
    const garde = (attrName, attrValue) => {
      const data = { attrName, attrValue, keepAttr: true }
      surAttribut({}, data)
      return data.keepAttr
    }
    expect(garde('href', '#etape')).toBe(true)
    expect(garde('xlink:href', ' #etape')).toBe(true)
    expect(garde('href', 'https://exemple.fr/x.svg#a')).toBe(false)
    expect(garde('xlink:href', 'javascript:alert(1)')).toBe(false)
    expect(garde('href', '')).toBe(false)
    expect(garde('fill', 'url(#or)')).toBe(true)
    expect(garde('marker-end', 'url(#fleche)')).toBe(true)
    expect(garde('style', 'font-weight:600;fill:url(#or)')).toBe(true)
    expect(garde('style', 'fill:url(https://exemple.fr/x.svg#g)')).toBe(false)
    expect(garde('fill', "url('http://exemple.fr')")).toBe(false)
    expect(garde('onload', 'x')).toBe(false)
    expect(garde('d', 'M0 0L8 4L0 8z')).toBe(true)
  })
})
