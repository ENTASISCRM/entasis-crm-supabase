#!/usr/bin/env python3
"""Prepare les logos partenaires pour l annuaire du CRM.

Un logo telecharge sur internet arrive avec un fond blanc ou gris, des
marges au hasard et une taille quelconque. Affiche tel quel dans une
pastille de 32 pixels, il est minuscule, decentre, et son fond fait une
tache claire sur la ligne.

Ce script normalise tout : fond rendu transparent, image recadree au plus
juste, centree dans un carre avec une marge constante, exportee en PNG.
Tous les logos sortent au meme format et occupent la meme place a l ecran.

    python3 scripts/preparer-logos.py entrant/*.png

Les fichiers prets sont ecrits dans src/assets/logos/, ou l application
les recense automatiquement.
"""

# Le python livre avec macOS est en 3.9 : sans cette ligne, l annotation
# « str | None » plus bas fait echouer le script des son chargement.
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

RACINE = Path(__file__).resolve().parent.parent
SORTIE = RACINE / 'src' / 'assets' / 'logos'
COTE = 256          # le logo est affiche en 32 px, 256 tient le retina
MARGE = 0.06        # marge interieure, proportion du cote
TOLERANCE = 26      # ecart admis pour considerer un pixel comme du fond


def cle(nom: str) -> str:
    """Nom de fichier attendu par l application, deduit du nom de societe."""
    import unicodedata
    sans = unicodedata.normalize('NFD', nom)
    sans = ''.join(c for c in sans if unicodedata.category(c) != 'Mn')
    propre = ''.join(c if c.isalnum() else '-' for c in sans.lower())
    while '--' in propre:
        propre = propre.replace('--', '-')
    return propre.strip('-')


def detourer(img: Image.Image) -> Image.Image:
    """Rend transparent le fond uni, en partant des quatre coins.

    On ne touche qu aux pixels relies au bord : une zone claire a l
    interieur du logo (le blanc d un oeil, une contre-forme) est
    conservee.
    """
    img = img.convert('RGBA')
    largeur, hauteur = img.size
    pixels = img.load()

    coins = [pixels[0, 0], pixels[largeur - 1, 0],
             pixels[0, hauteur - 1], pixels[largeur - 1, hauteur - 1]]
    opaques = [c for c in coins if c[3] > 10]
    if not opaques:
        return img  # deja detoure

    fond = tuple(sum(c[i] for c in opaques) // len(opaques) for i in range(3))

    proche = lambda p: (p[3] > 10
                        and abs(p[0] - fond[0]) <= TOLERANCE
                        and abs(p[1] - fond[1]) <= TOLERANCE
                        and abs(p[2] - fond[2]) <= TOLERANCE)

    a_voir = [(x, y) for x in range(largeur) for y in (0, hauteur - 1)]
    a_voir += [(x, y) for y in range(hauteur) for x in (0, largeur - 1)]
    vus = set()
    while a_voir:
        x, y = a_voir.pop()
        if (x, y) in vus or not (0 <= x < largeur and 0 <= y < hauteur):
            continue
        vus.add((x, y))
        if not proche(pixels[x, y]):
            continue
        pixels[x, y] = (255, 255, 255, 0)
        a_voir += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    return img


def normaliser(img: Image.Image) -> Image.Image:
    """Recadre sur le contenu puis centre dans un carre a marge constante."""
    boite = img.getbbox()
    if boite:
        img = img.crop(boite)

    utile = int(COTE * (1 - 2 * MARGE))
    largeur, hauteur = img.size
    echelle = min(utile / largeur, utile / hauteur)
    img = img.resize((max(1, round(largeur * echelle)),
                      max(1, round(hauteur * echelle))), Image.LANCZOS)

    carre = Image.new('RGBA', (COTE, COTE), (255, 255, 255, 0))
    carre.paste(img, ((COTE - img.width) // 2, (COTE - img.height) // 2), img)
    return carre


def traiter(chemin: Path, societe: str | None = None) -> Path:
    nom = cle(societe or chemin.stem)
    image = normaliser(detourer(Image.open(chemin)))
    SORTIE.mkdir(parents=True, exist_ok=True)
    destination = SORTIE / f'{nom}.png'
    image.save(destination, 'PNG', optimize=True)
    return destination


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(1)
    for argument in sys.argv[1:]:
        source = Path(argument)
        if not source.exists():
            print(f'introuvable : {source}')
            continue
        sortie = traiter(source)
        largeur, hauteur = Image.open(source).size
        print(f'{source.name}  {largeur}x{hauteur}  ->  {sortie.name}  {COTE}x{COTE}')
