# Logos des partenaires

Deposer ici le logo d une maison le fait apparaitre automatiquement dans
l onglet Partenaires, a la place du monogramme, sur toutes les lignes de
cette maison. Rien d autre a modifier dans le code.

## Nom du fichier

Le nom de la societe telle qu elle apparait dans l annuaire, en
minuscules, accents retires, espaces et ponctuation remplaces par des
tirets. Extension au choix : svg, png, jpg ou webp. Le svg est preferable,
il reste net sur tous les ecrans.

| Societe dans l annuaire | Fichier | Provenance |
| --- | --- | --- |
| Althera Patrimoine | `althera-patrimoine.png` | logo secondaire carre du site |
| April | `april.png` | pack officiel du groupe, symbole seul |
| ASIO (Hugo Busuttil) | `asio.png` | fourni par la maison, revectorise |
| Asselio | `asselio.png` | signe de la charte 2025 |
| Francois 1er | `francois-1er.png` | icone officielle du site |
| Generali | `generali.png` | lion seul, sans le mot |
| Harlay Avocat | `harlay-avocat.png` | signe carre du site, aux couleurs de la maison |
| I Kapital | `i-kapital.png` | monogramme seul de l en tete |
| Irbis | `irbis.png` | icone officielle du site |
| Notaire partenaire | `notaire-partenaire.svg` | monogramme de l etude Cedric Deplano |
| SCPI Log In | `scpi-log-in.png` | signe de Theoreim, societe de gestion |
| SCPI Reason MNK | `scpi-reason-mnk.png` | signe de MNK Partners |
| SwissLife | `swisslife.png` | le swoosh seul, sans le mot |
| Wemo Reim | `wemo-reim.png` | signe carre du site |

Les quatorze maisons de l annuaire ont leur logo. Un nouveau partenaire
suffit a deposer son fichier ici, sans toucher au code.

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
* Deux pieges rencontres en preparant les douze derniers. Un logo qui
  porte le nom de la maison ecrit a cote devient illisible dans 32 pixels :
  prendre le symbole seul quand il existe, quitte a le decouper. Et un
  fichier dont le fond fait partie de la marque, le disque bleu nuit
  d Irbis ou le carre de Wemo Reim, ne doit pas passer par le detourage,
  qui le viderait de sa couleur : le deposer tel quel.
* Aucun fichier n est obligatoire. Sans logo, la ligne garde son
  monogramme et reste parfaitement lisible : les deux formats cohabitent.
