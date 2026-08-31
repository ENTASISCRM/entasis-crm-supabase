# Logos des partenaires

Deposer ici le logo d une maison le fait apparaitre automatiquement dans
l onglet Partenaires, a la place du monogramme, sur toutes les lignes de
cette maison. Rien d autre a modifier dans le code.

## Nom du fichier

Le nom de la societe telle qu elle apparait dans l annuaire, en
minuscules, accents retires, espaces et ponctuation remplaces par des
tirets. Extension au choix : svg, png, jpg ou webp. Le svg est preferable,
il reste net sur tous les ecrans.

| Societe dans l annuaire | Fichier attendu |
| --- | --- |
| Althera Patrimoine | `althera-patrimoine.svg` |
| Francois 1er | `francois-1er.svg` |
| Notaire partenaire | `notaire-partenaire.svg` |
| Harlay Avocat | `harlay-avocat.svg` |
| SwissLife | `swisslife.svg` |
| April | `april.svg` |
| Generali | `generali.svg` |
| Asselio | `asselio.svg` (logo Abeille Assurances, la marque de la maison) |
| Irbis | `irbis.svg` |
| I Kapital | `i-kapital.svg` |
| Wemo Reim | `wemo-reim.svg` |
| SCPI Log In | `scpi-log-in.svg` |
| SCPI Reason MNK | `scpi-reason-mnk.svg` |
| Adezio | `adezio.svg` |

## Preparer un logo telecharge

Un logo pris sur internet arrive avec un fond blanc ou gris, des marges
au hasard et un format quelconque. Le script le normalise :

    python3 scripts/preparer-logos.py ~/Telechargements/swisslife.png

Il detoure le fond, recadre au plus juste, centre dans un carre a marge
constante et ecrit le fichier pret dans ce dossier. Tous les logos
sortent au meme format et occupent la meme place a l ecran.

Le nom du fichier de sortie vient du nom du fichier d entree : renommer
la source avant de lancer le script, ou renommer la sortie ensuite.

## Conseils

* Format carre ou proche du carre : le logo est affiche dans 30 pixels.
* Fond transparent de preference, le cadre est deja dessine par le CRM.
* Demander son kit de marque au partenaire donne le meilleur rendu et
  vaut autorisation d usage.
* Aucun fichier n est obligatoire. Sans logo, la ligne garde son
  monogramme et reste parfaitement lisible : les deux formats cohabitent.
