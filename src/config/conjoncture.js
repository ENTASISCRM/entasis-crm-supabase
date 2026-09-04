// ════════════════════════════════════════════════════════════════════════════
// CONJONCTURE : le régime de marché et ses inclinaisons
//
// L’écran « Allocations types » pose sa doctrine en tête de
// src/config/allocations.js : RIEN N’EST INVENTÉ, chaque pôle cite le
// document dont il sort, le CRM affiche et contrôle, il ne conçoit pas. Ce
// fichier étend cette doctrine à la conjoncture. Il ne calcule rien : il dit
// dans quel régime la direction estime qu’on se trouve, et quelles inflexions
// une note datée documente pour ce régime.
//
// Une inclinaison sans source n’a pas sa place ici. C’est pour cela que quatre
// régimes sur cinq portent un tableau vide : aucune note ne les documente à ce
// jour. Les remplir de généralités de manuel donnerait au CRM l’air de savoir,
// ce qu’il ne sait pas, et personne ne pourrait dire d’où ça sort.
//
// Le moteur (src/lib/moteur-allocation.js) PROPOSE à partir d’ici. Il
// n’applique jamais seul, et chaque proposition repart avec le pourquoi et les
// sources de l’inclinaison dont elle sort.
// ════════════════════════════════════════════════════════════════════════════

// Les deux univers ne parlent pas la même langue : SwissLife publie 84
// catégories fines (« Actions US Grandes Capitalisations Croissance »), Abeille
// cinq catégories larges (Actions, Mixtes, Obligations, Spéculatifs,
// Monétaire). Une note de marché, elle, parle de classes d’actifs. Les familles
// sont le seul endroit où ces trois vocabulaires se rejoignent.
//
// L’ordre du tableau EST la règle de priorité : le premier motif qui
// correspond gagne. Les obligations passent donc avant les actions
// (« Obligations Marchés Émergents » est une ligne obligataire, pas une ligne
// émergents), et les familles sectorielles avant les familles géographiques
// (« Secteur Immobilier Europe » est de l’immobilier avant d’être de l’Europe).
//
// Les motifs se lisent sur un libellé normalisé : sans accents, en minuscules,
// ponctuation remplacée par des espaces. « Actions France Petites & Moyennes
// Capitalisations » devient « actions france petites moyennes capitalisations »,
// ce qui évite d’écrire la ponctuation des assureurs dans les motifs.
export const FAMILLES = [
  {
    cle: 'monetaire_attente',
    nom: 'Monétaire et fonds d’attente',
    // Verrou 2 de la direction : rien de ce qui tombe ici ne peut être proposé,
    // ni renforcé, ni servi en remplacement. La famille passe en premier pour
    // qu’un support d’attente ne puisse pas être attrapé par une autre.
    motifs: [/monetaire/, /money market/, /liquidite/, /liquidity/, /tresorerie/, /fonds euro/, /capital garanti/, /capital protege/],
  },
  {
    cle: 'inflation',
    nom: 'Protection contre l’inflation',
    motifs: [/inflation/, /indexee/],
  },
  {
    cle: 'oblig_souverain',
    nom: 'Obligations souveraines',
    // On ne classe en souverain que ce qui se déclare souverain. C’est
    // volontairement étroit : la seule inclinaison qui fait bouger les
    // obligations vise la duration longue des États, et un fonds dont la
    // catégorie dit seulement « Obligations » ne dit pas qu’il en porte.
    motifs: [/souverain/, /government/, /gouvernement/, /\betat\b/, /\boat\b/, /\bbund\b/, /treasury/],
  },
  {
    cle: 'oblig_courtes',
    nom: 'Obligations courtes ou flexibles',
    motifs: [/obligations? flexible/, /court terme/, /short term/, /short duration/, /courte duration/],
  },
  {
    cle: 'oblig_credit',
    nom: 'Obligations de crédit',
    // Tout ce qui est obligataire sans se dire souverain, court ou indexé
    // finit ici, y compris les 34 lignes « Obligations » d’Abeille et les
    // fonds à échéance. Aucune inclinaison ne porte sur cette famille
    // aujourd’hui : le moteur ne propose donc rien sur une ligne qu’il ne sait
    // pas identifier plus finement, ce qui est le comportement voulu.
    // Le motif « credit » n’y est pas : il attraperait les fonds actions des
    // maisons dont le nom commence par Crédit.
    motifs: [/emprunts prives/, /haut rendement/, /high yield/, /subordonnee/, /convertible/, /terme fixe/, /obligation/, /\bbonds?\b/, /\bcorporate\b/, /aggregate/],
  },
  {
    cle: 'mixtes',
    nom: 'Mixtes et patrimoniaux',
    // Motif ancré en début de libellé : « Actions US Grandes Capitalisations
    // Mixte » contient le mot mixte et n’est pourtant pas un fonds mixte.
    motifs: [/^mixtes/, /patrimoine/, /patrimonial/, /\ballocation\b/],
  },
  {
    cle: 'performance_absolue',
    nom: 'Performance absolue et long short',
    motifs: [/gestion alternative/, /performance absolue/, /absolute return/, /long short/, /market neutral/, /autres strategies/],
  },
  {
    cle: 'immobilier',
    nom: 'Immobilier',
    motifs: [/immobilier/, /\bimmo\b/, /\bscpi\b/, /\bopci\b/, /\bsci\b/, /\bsiic\b/, /real estate/, /\breit/, /\bpierre\b/],
  },
  {
    cle: 'metaux_precieux',
    nom: 'Métaux précieux et mines',
    // Ni « argent » ni « silver » : le premier désigne l’argent tout court dans
    // la moitié des libellés français, le second un fonds sur le vieillissement.
    motifs: [/metaux precieux/, /precious metal/, /\bor\b/, /\bgold\b/, /\bmines\b/, /\bmining\b/, /minier/],
  },
  {
    cle: 'metaux_strategiques',
    nom: 'Métaux stratégiques et terres rares',
    motifs: [/terres rares/, /rare earth/, /metaux strategiques/, /strategic metal/, /metaux critiques/, /critical metal/, /\bcuivre\b/, /\bcopper\b/, /batterie/, /battery/, /lithium/],
  },
  {
    cle: 'transition_energetique',
    nom: 'Transition énergétique',
    motifs: [/ecologie/, /energie alternative/, /energie propre/, /clean energy/, /new energy/, /transition/, /climat/, /environnement/, /nucleaire/, /hydrogen/, /solar/, /eolien/, /\bespace\b/, /\bspace\b/],
  },
  {
    cle: 'energie',
    nom: 'Énergie',
    // Après la transition : « Secteur Energie Alternative » contient le mot
    // énergie et n’est pas du pétrole.
    motifs: [/\benergie\b/, /\benergy\b/, /petrol/, /\boil\b/, /\bgaz\b/, /parapetrolier/],
  },
  {
    cle: 'sante',
    nom: 'Santé',
    motifs: [/\bsante\b/, /health/, /biotech/, /pharma/, /medical/, /medtech/, /oncolog/],
  },
  {
    cle: 'technologie',
    nom: 'Technologie et innovation',
    motifs: [/technolog/, /\btech\b/, /intelligence artificielle/, /artificial intel/, /\bai\b/, /disrupt/, /innovation/, /digital/, /robotic/, /semiconduct/, /internet/, /cyber/, /software/],
  },
  {
    cle: 'emergents',
    nom: 'Actions émergentes',
    // Motifs sans borne finale du côté anglais : les listes mélangent les deux
    // langues et un fonds « Asian » ou « Emerging » doit tomber ici comme un
    // fonds « Asie » ou « Émergents ».
    motifs: [/emergent/, /emerging/, /\bfrontier\b/, /\bbric\b/, /\bchine\b/, /\bchina/, /\binde\b/, /\bindia/, /\basie\b/, /\basia/, /pacifique/, /pacific/, /\bcoree\b/, /\bkorea/, /taiwan/, /\bbresil\b/, /\bbrazil/, /amerique latine/, /latin america/],
  },
  {
    cle: 'actions_japon',
    nom: 'Actions Japon',
    // Après les émergents, et c’est tout l’intérêt de l’ordre : « Actions Asie
    // Pacifique hors Japon » contient le mot Japon et n’est pas une ligne
    // japonaise.
    motifs: [/\bjapon/, /\bjapan/, /nikkei/, /topix/],
  },
  {
    cle: 'actions_us',
    nom: 'Actions américaines',
    // Les émergents passent avant, ce qui laisse /amerique/ sans danger :
    // « Actions Amérique Latine » est déjà parti chez eux.
    motifs: [/actions us/, /\bus\b/, /\busa\b/, /etats unis/, /amerique/, /north america/, /nasdaq/, /s p 500/, /us large cap/],
  },
  {
    cle: 'actions_france',
    nom: 'Actions France',
    motifs: [/actions france/, /\bfrance\b/, /francaise/, /cac 40/],
  },
  {
    cle: 'actions_europe',
    nom: 'Actions européennes',
    motifs: [/actions europe/, /zone euro/, /\beuro\b/, /\beurope\b/, /\beuropean\b/, /euroland/, /\bemu\b/],
  },
  {
    cle: 'actions_monde',
    nom: 'Actions internationales',
    // Cette famille ne figure pas dans la liste de la direction, et les 55
    // lignes « Actions International » des deux univers n’entrent dans aucune
    // des autres. Les ranger en actions américaines parce qu’elles le sont à
    // 70 % serait exactement le genre de raccourci que la doctrine interdit.
    // Aucune inclinaison ne la vise : elles sont classées, elles ne bougent pas.
    motifs: [/actions international/, /\bmonde\b/, /\bworld\b/, /\bglobal\b/, /international/],
  },
]

// Normalisation d’un libellé avant confrontation aux motifs : sans accents, en
// minuscules, toute ponctuation devenue espace. Les catégories des assureurs
// sont écrites à leur main, avec esperluettes, parenthèses et renvois de bas
// de page ; les motifs n’ont pas à connaître cette typographie.
const normaliser = (texte) => (texte || '')
  .toString()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

const correspond = (texte, motif) =>
  motif instanceof RegExp ? motif.test(texte) : texte.includes(normaliser(motif))

const familleDuLibelle = (libelle) => {
  const texte = normaliser(libelle)
  if (!texte) return null
  for (const famille of FAMILLES) {
    if (famille.motifs.some((motif) => correspond(texte, motif))) return famille.cle
  }
  return null
}

/**
 * Famille d’un support de l’un des deux univers. La catégorie d’abord, parce
 * qu’elle vient de l’assureur ; le nom seulement en dernier recours, pour les
 * catégories qui ne disent rien de la classe d’actif (« Actions autres »,
 * « Spéculatifs », « Fonds Dédiés »).
 *
 * Rend null quand rien ne correspond, et c’est une réponse : un support non
 * classé ne reçoit aucune proposition. On ne devine pas.
 */
export function familleDuSupport(support) {
  if (!support) return null
  return familleDuLibelle(support.categorie) || familleDuLibelle(support.nom)
}

// Les cinq régimes sont un vocabulaire commun, pas une prévision. Le résumé
// décrit un état, il ne dit pas quoi faire : ce qui engage le cabinet, ce sont
// les inclinaisons, et elles ne se remplissent que sur note datée.
export const REGIMES = [
  {
    cle: 'expansion',
    nom: 'Expansion',
    resume: 'La croissance accélère avec une inflation contenue, les banques centrales n’ont pas de raison de resserrer.',
  },
  {
    cle: 'ralentissement',
    nom: 'Ralentissement',
    resume: 'La croissance décélère et l’inflation reflue, le marché se met à attendre des baisses de taux.',
  },
  {
    cle: 'inflation_persistante',
    nom: 'Inflation persistante',
    // Résumé repris mot pour mot de la note du 04/09/2026 : c’est elle qui
    // qualifie le régime, pas nous.
    resume: 'Choc d offre energetique qui a retourne le cycle monetaire : les deux grandes banques centrales resserrent en meme temps dans une croissance molle, l inflation totale remonte pendant que le coeur reste contenu en zone euro, et le prix se paie sur les taux longs, au plus haut depuis quinze ans.',
  },
  {
    cle: 'stress',
    nom: 'Stress de marché',
    resume: 'Épisode de rupture, la liquidité et les corrélations se déforment plus vite que les fondamentaux.',
  },
  {
    cle: 'reprise',
    nom: 'Reprise',
    resume: 'Sortie de creux, l’activité redémarre d’un point bas pendant que la politique monétaire reste accommodante.',
  },
]

// Le régime retenu par la direction, et la note qui le documente. Changer cette
// constante change ce que le moteur propose : elle se modifie sur note datée,
// pas sur impression de marché.
export const REGIME_COURANT = {
  cle: 'inflation_persistante',
  retenuLe: '2026-09-04',
  note: 
    'Le regime a change de nature depuis le printemps. La BCE a releve sa facilite de depot a 2,25 % le 11 juin 2026, premiere hausse depuis 2023, et la Fed tient 3,50 a 3,75 % avec trois dissidents qui reclamaient une hausse, pas une baisse. Le moteur n est pas une surchauffe mais un choc d offre : le Brent est revenu autour de 95 dollars sous l effet du detroit d Ormuz, ce qui porte l inflation de la zone euro a 3,3 % en aout quand l inflation hors energie et alimentation reste a 2,1 % et les salaires negocies a 2,1 %. La consequence porte sur les taux longs bien plus que sur les actions : le Bund 10 ans a 3,35 % est au plus haut depuis 2011, l OAT a 4,21 %, et la France emprunte desormais au meme niveau que l Italie. Les marches actions absorbent le contexte, portes par des benefices reels, mais la mesure de ces benefices est faussee par les plus values latentes d Alphabet et d Amazon, ce qui rend le multiple affiche du S&P 500 trompeusement rassurant. Le point de fragilite du theme dominant n est pas la demande, c est son financement par dette. Trois decisions datees se concentrent sur douze jours, BCE le 10 septembre, inflation americaine le 11, Fed le 16, puis la sequence budgetaire francaise du 30 septembre au 31 decembre. Ce qui suit propose des inflexions documentees, pas une refonte, et gagne a etre execute apres le 17 septembre.',
  source: 'Note de marché du 04/09/2026, confiance annoncée moyenne',
}

// Les inclinaisons d’un régime, telles que sa note les écrit. Le texte du
// pourquoi et la liste des sources sont recopiés mot pour mot : ils ont été
// vérifiés une fois, ils ne se réécrivent pas ici. Le seul ajout du CRM est la
// famille : le rattachement d’une classe d’actifs de la note à ce que les deux
// univers savent nommer.
//
// sens    : 'renforcer' | 'alleger' | 'maintenir'
// ampleur : 'forte' | 'moyenne' | 'legere'
//
// Un 'maintenir' ne produit jamais de proposition. Il reste dans le tableau
// parce qu’il porte un argument que le conseiller doit lire, souvent celui qui
// dit de ne pas bouger.
export const INCLINAISONS = {
  inflation_persistante: [
    // Deux entrées de la note visent la même famille : la duration longue ici,
    // la dette française juste après. Le moteur n’en retient qu’une, la plus
    // forte, et n’additionne pas les points : la borne posée par la direction
    // est une borne par famille, pas par argument.
    {
      famille: 'oblig_souverain',
      classe: 'Duration obligataire longue, souverain euro et americain au dela de dix ans',
      sens: 'alleger',
      ampleur: 'moyenne',
      pourquoi:
        'Le Bund 10 ans cote 3,35 % le 4 septembre 2026 apres un pic a 3,3951 %, plus haut depuis 2011, l OAT 30 ans atteint 4,97 % et le Treasury 30 ans 5,27 %, apres 5,33 % le 18 aout. Quatre forces poussent encore dans le meme sens : pentification en cours, reconstitution de la prime de terme, offre record (plus de 530 milliards d euros toutes maturites pour la France en 2026, adjudication americaine du 30 ans mal couverte avec un ratio de 2,39) et deux banques centrales qui ne sont plus en assouplissement. Sur ces maturites une hausse de 50 points de base efface plusieurs annees de coupon : le risque de prix domine le portage.',
      sources: [
        'Trading Economics, Germany et France Government Bond 10Y, releve du 4 septembre 2026',
        'FRED serie DGS30 et CNBC, adjudication du 30 ans, 2 septembre 2026',
        'Agence France Tresor, programme d emission 2026, via Fondation IFRAP, 12 janvier 2026',
      ],
    },
    {
      famille: 'oblig_souverain',
      classe: 'Dette souveraine francaise',
      sens: 'alleger',
      ampleur: 'moyenne',
      pourquoi:
        'L OAT 10 ans cote 4,21 % le 3 septembre 2026, plus haut depuis 2008, pour un spread de 85,4 points de base contre le Bund alors que le regime normal se situe entre 40 et 60. Le 3 septembre l OAT traitait a 4,117 % contre 4,113 % pour l Italie : la France emprunte au meme niveau. Fitch a certes confirme le A+ perspective stable le 28 aout 2026, ce qui retire un risque immediat, mais en projetant un deficit de 5,2 % en 2026, 5,5 % en 2027 et une dette a 122,7 % du PIB en 2028. Moody s est encore un cran au dessus, a Aa3, donc une degradation reste disponible comme catalyseur. Le PLF 2027 est presente le 30 septembre et depose au plus tard le 6 octobre devant un Parlement fragmente avec une motion de censure deja annoncee.',
      sources: [
        'Ideal Investisseur, spread OAT Bund, releve du 3 septembre 2026 (verifie)',
        'Echos Plus et France Epargne, adjudication AFT du 3 septembre 2026',
        'Fitch Ratings du 28 aout 2026 relaye par Bloomberg et Europe Business News',
        'LCP et Boursorama, calendrier et orientations du budget 2027, 31 aout 2026',
      ],
    },
    {
      famille: 'inflation',
      classe: 'Protection explicite contre l inflation, obligations indexees en euro',
      sens: 'renforcer',
      ampleur: 'legere',
      pourquoi:
        'L inflation de la zone euro remonte a 3,3 % en aout 2026 apres 2,9 % en juillet, avec une energie a 14,3 %, alors que les projections BCE de juin retenaient 3,0 % pour 2026. Le choc est un choc d offre que la politique monetaire ne corrige pas. Aux Etats Unis le FOMC a releve sa projection de PCE hors alimentation et energie de 2,7 % a 3,3 % pour fin 2026, ce qui montre que la diffusion est deja engagee outre Atlantique. Ampleur legere assumee : les points morts d inflation de la zone euro au 4 septembre n ont pas pu etre verifies, l arbitrage entre nominal et indexe doit donc etre confirme sur donnees de marche avant execution, et sur des maturites courtes a intermediaires pour ne pas reintroduire le risque souverain long.',
      sources: [
        'Eurostat, estimation rapide de l inflation, communique du 1er septembre 2026',
        'BCE, projections macroeconomiques de l Eurosysteme, juin 2026',
        'Federal Reserve Board, Summary of Economic Projections du 17 juin 2026',
      ],
    },
    {
      famille: 'actions_us',
      classe: 'Actions americaines via indices ponderes par la capitalisation',
      sens: 'alleger',
      ampleur: 'moyenne',
      pourquoi:
        'Sept valeurs pesent entre 31,5 % et 34 % de la capitalisation du S&P 500 selon les relevés de juillet et aout 2026, et les dix premieres lignes approchent 40 % contre une moyenne historique de l ordre de 24 %. Or l elargissement des benefices est deja documente : les 493 autres societes affichent 31,8 % de croissance benefique au T2 2026, plus haut depuis fin 2021, et le consensus attend des le T4 2026 une croissance superieure pour ces 493 societes (26,8 %) que pour les Magnificent 7 (23,2 %). Le poids indiciel ne reflete donc plus la contribution benefique. Il ne s agit pas de reduire l exposition actions americaines mais de cesser de la prendre par le seul canal capi ponderee.',
      sources: [
        'FactSet Earnings Insight, 28 aout 2026',
        'Forbes Investor Hub et MacroMicro, poids des Magnificent 7, juillet et aout 2026',
      ],
    },
    // Un maintenir ne produit jamais de proposition. Cette entrée reste ici
    // parce qu’elle corrige une mesure et non une pondération : l’écran doit
    // pouvoir l’afficher à côté des lignes américaines.
    {
      famille: 'actions_us',
      classe: 'Qualite des benefices americains et lecture des multiples',
      sens: 'maintenir',
      ampleur: 'forte',
      pourquoi:
        'C est le point le plus important de la note et il ne demande aucun arbitrage, seulement de corriger la mesure. Le PER previsionnel du S&P 500 ressort a 19,6 au 28 aout 2026, sous sa moyenne cinq ans de 19,9, ce qui parait rassurant. Mais le denominateur est gonfle : la croissance benefique du T2 2026 affichee a 52,0 % retombe a 33,8 % hors Alphabet et Amazon, dont les BPA en normes GAAP integrent respectivement 98 milliards et 53,4 milliards de dollars d autres produits, essentiellement des plus values latentes sur participations. Ces gains sont reversibles et non operationnels. Retraite, le marche est sensiblement plus cher que le chiffre affiche, et aucun support client ne doit reprendre 19,6 sans cette reserve.',
      sources: [
        'FactSet Earnings Insight, 28 aout 2026',
      ],
    },
    {
      famille: 'technologie',
      classe: 'Thematiques technologie et intelligence artificielle, cumul dans le portefeuille',
      sens: 'alleger',
      ampleur: 'moyenne',
      pourquoi:
        'La these reste adossee a des resultats reels : benefices des semiconducteurs en hausse de 142 % et chiffre d affaires de 80 % au T2 2026, et hors semiconducteurs la croissance du secteur technologique retombe de 75,3 % a 38,3 %. Le point de fragilite n est pas la demande mais le financement. Le capex 2026 des principaux hyperscalers est estime entre 635 et 770 milliards de dollars, dont environ un tiers finance par dette, avec 194 a 225 milliards d emissions obligataires depuis janvier et un CDS 5 ans d Oracle qui a plus que triple depuis septembre 2025. Une deception sur le retour de ces depenses frapperait simultanement les actions et le credit de qualite de ces memes emetteurs, ce qui annule la diversification habituelle entre les deux. Ce qu il faut alleger, c est le cumul de briques thematiques redondantes, pas l exposition au theme.',
      sources: [
        'FactSet Earnings Insight, 28 aout 2026',
        'UBS, Goldman Sachs, S&P Global et CNBC, dossiers capex et dette liee a l intelligence artificielle, premier semestre et juillet 2026',
        'Moody s, engagements de location de centres de donnees hors bilan, 2026',
      ],
    },
    {
      famille: 'emergents',
      classe: 'Actions emergentes Asie',
      sens: 'alleger',
      ampleur: 'moyenne',
      pourquoi:
        'L argument de diversification ne tient plus dans les faits. Taiwan et la Coree ont depasse la Chine et pesent ensemble un peu plus de 50 % du MSCI Emerging Markets fin juin 2026, la technologie approche 37 % de l indice, et 14 des 22 points de hausse du premier semestre proviennent de trois societes seulement, TSMC, Samsung Electronics et SK Hynix. Ajoutee a une poche technologique americaine, une ligne emergents ne diversifie pas le risque intelligence artificielle, elle le double. Apres 119 % de hausse coreenne en six mois, la question posee au portefeuille est celle du cumul d exposition au meme facteur, pas celle du potentiel restant.',
      sources: [
        'Neuberger Berman, The Ghost Rally, mi 2026',
        'East Capital, Market Commentary Q2 2026, 8 juillet 2026',
        'MSCI, composition de l indice Emerging Markets, avril a juin 2026',
      ],
    },
    {
      famille: 'metaux_precieux',
      classe: 'Mines d or et de metaux precieux',
      sens: 'renforcer',
      ampleur: 'moyenne',
      pourquoi:
        'C est le seul endroit du panorama ou la valorisation est objectivement basse alors que la rentabilite est a son record. VanEck estime les couts complets du deuxieme trimestre 2026 sous 2 000 dollars l once pour un or entre 4 470 et 4 560 dollars le 4 septembre, soit des marges parmi les plus larges de l histoire du secteur, et les multiples des mineurs sont au plus bas depuis au moins une decennie. Le GDX a gagne 23,75 % sur le seul mois d aout 2026, meilleur mois depuis avril 2020, sans que les multiples se tendent, ce qui signale que le marche n a pas integre la duree des marges. La sensibilite au petrole est marginale, de l ordre de 25 dollars de cout supplementaire a l once pour un brut a 100 dollars.',
      sources: [
        'Benzinga et VanEck, performance et couts complets des mineurs, aout 2026',
        'Discovery Alert et analyses sectorielles GDX, 2026',
        'Trading Economics et GoldAvenue, cours de l or, 3 et 4 septembre 2026',
      ],
    },
    // Même famille que les mines : ni SwissLife ni Abeille ne distinguent, dans
    // leur catégorie, un fonds de mineurs d’un support adossé au métal. Le
    // moteur ne retenant que ce qui bouge, la proposition portera l’argument des
    // mines ; la réserve sur le métal reste lisible ici et à l’écran.
    {
      famille: 'metaux_precieux',
      classe: 'Or metal detenu directement',
      sens: 'maintenir',
      ampleur: 'moyenne',
      pourquoi:
        'Le socle structurel tient : 289 tonnes achetees en net par les banques centrales au T2 2026, en hausse de 62 % sur un an, et 89 % des banques centrales interrogees anticipent une hausse des reserves mondiales. Mais deux reserves interdisent de renforcer maintenant. Le premier semestre 2026 ressort a 345 tonnes seulement, plus faible depuis 2022 apres revision a la baisse du T1 de 244 a 57 tonnes. Surtout, le krach du 30 janvier 2026, moins 12 % sur l or et moins 31,4 % sur l argent en une seance, a ete declenche par une nomination restrictive a la Fed : c est exactement la configuration qui se represente le 16 septembre, avec 50 a 66 % de probabilite de hausse selon les relevés. On conserve la couverture, on ne l ajoute pas sur un point haut de cycle monetaire adverse.',
      sources: [
        'World Gold Council, Gold Demand Trends T2 2026 et Central Bank Gold Reserves Survey 2026',
        'Bloomberg via MarketScreener et SD Bullion, seance du 30 janvier 2026',
        'CME FedWatch via CNBC et Forbes, 28 aout au 3 septembre 2026',
      ],
    },
    {
      famille: 'energie',
      classe: 'Energie et parapetrolier',
      sens: 'maintenir',
      ampleur: 'moyenne',
      pourquoi:
        'A contre courant du reflexe de renforcer sur un Brent a 95 dollars. Le marche cote environ 10 dollars au dessus de la prevision officielle de l EIA pour le trimestre en cours (85 dollars au T3 2026), et l agence voit 78 dollars au T4 puis 69 dollars en 2027 avec un retour des flux a la normale debut 2027. La prime actuelle est geopolitique, donc non modelisable et reversible en quelques seances : le Brent est passe de plus de 130 dollars au printemps a moins de 72 en juillet puis a 95 debut septembre. La position garde tout son sens comme couverture du facteur qui degrade simultanement les taux, l inflation et les autres classes d actifs. Elle ne se renforce pas a ce prix et ne se vend pas tant que le conflit est ouvert.',
      sources: [
        'EIA Short Term Energy Outlook, 11 aout 2026',
        'Trading Economics, Brent, 2 et 3 septembre 2026',
        'Titres Presse et France Info, dossier detroit d Ormuz, 2 septembre 2026',
      ],
    },
    {
      famille: 'sante',
      classe: 'Secteur sante',
      sens: 'renforcer',
      ampleur: 'legere',
      pourquoi:
        'Seul secteur du S&P 500 en repli benefique au T2 2026, a moins 6,5 %, ce qui pese sur sa valorisation relative. Mais le repli tient a deux dossiers isoles : hors Gilead Sciences, avec 9,08 dollars par action de charges de recherche et developpement acquise, et Merck, avec 2,31 dollars lies a l acquisition de Terns Pharmaceuticals, le secteur ressort a plus 18,1 %. L ecart entre la perception indicielle et la realite operationnelle constitue un point d entree documente, dans un secteur par ailleurs defensif si le scenario de hausse des taux se materialise.',
      sources: [
        'FactSet Earnings Insight, 28 aout 2026',
      ],
    },
    // Le référentiel range écologie, énergie propre et nucléaire dans la même
    // famille. L’espace n’a de catégorie dans aucun des deux univers : il n’est
    // attrapé que par le libellé du support.
    {
      famille: 'transition_energetique',
      classe: 'Actifs de tres longue duration a profitabilite lointaine, thematiques espace, energie propre pure et nucleaire de nouvelle generation',
      sens: 'alleger',
      ampleur: 'moyenne',
      pourquoi:
        'Ce sont les actifs dont la valorisation depend le plus du taux d actualisation, au moment precis ou le 30 ans americain touche 5,27 a 5,33 %, le Bund 10 ans son plus haut depuis 2011 et ou le marche discute une hausse de la Fed plutot qu une baisse. Le precedent est deja ecrit sur le meme profil : Oklo et NuScale ont perdu 73 % et 83 % depuis leurs plus hauts de 52 semaines sans qu aucun reacteur ne soit raccorde au reseau. Sur l energie propre, le moteur a certes change de nature, passant de la subvention a la demande electrique des centres de donnees, mais 28 a 31 % de hausse sont deja acquis en 2026 apres un effondrement de 45 %, donc l essentiel du rattrapage de valorisation est fait.',
      sources: [
        'FRED serie DGS30 et CNBC, 17 aout et 2 septembre 2026',
        'The Motley Fool, 24/7 Wall St et Seeking Alpha, juillet a septembre 2026',
        'BloombergNEF et donnees ETF TAN et PBW, 2026',
      ],
    },
    {
      famille: 'metaux_strategiques',
      classe: 'Metaux strategiques, terres rares et metaux de batterie',
      sens: 'alleger',
      ampleur: 'legere',
      pourquoi:
        'La these d electrification est valide, le deficit de cuivre est estime a environ 400 000 tonnes en 2026 et les centres de donnees pourraient consommer jusqu a 1,1 million de tonnes par an d ici 2030. Mais le prix ne laisse plus de marge d erreur : le cuivre traite autour de 14 343 dollars la tonne contre un record absolu de 14 527,50 le 29 janvier 2026. Et le compartiment terres rares est administre et binaire : hausses de 37 a 105 % depuis janvier sur les references les plus critiques, sur des marches etroits et opaques, avec l expiration le 10 novembre 2026 de la suspension des controles chinois a l exportation sur sept terres rares lourdes. Ce profil justifie une poche satellite dimensionnee pour etre oubliee, pas un poids structurel.',
      sources: [
        'LME via CarbonCredits et IndexBox, aout 2026',
        'UBS pour le deficit de cuivre et S&P Global pour la demande des centres de donnees, 2026',
        'The Oregon Group, Metal Tech News et Rare Earth Mining, mai a septembre 2026',
        'Agence internationale de l energie, Global Critical Minerals Outlook 2026, juillet 2026',
      ],
    },
    {
      famille: 'actions_france',
      classe: 'Actions francaises domestiques',
      sens: 'alleger',
      ampleur: 'legere',
      pourquoi:
        'Le CAC 40 cloture a 8 280,63 le 4 septembre 2026 contre 8 149,50 fin 2025, soit environ 1,6 % depuis le debut de l annee contre pres de 10 % pour l Euro Stoxx 50, et il abandonne environ 5 % depuis son record de cloture du 10 aout. Le risque est identifie et specifique : PMI construction a 37,3 en aout, plus forte contraction depuis mai 2020, deficit de l Etat a 145,9 milliards d euros sur sept mois contre 142 un an plus tot, et une sequence budgetaire du 30 septembre au 31 decembre sans majorite. Pour un client francais deja expose a la France par son immobilier, son epargne reglementee et son capital humain, ce biais domestique est un risque peu remunere.',
      sources: [
        'Boursedirect et Trading Economics, cloture du CAC 40 du 4 septembre 2026 (verifie)',
        'Trading Economics, PMI construction France et donnees budgetaires, aout et septembre 2026',
        'Boursorama, orientations du budget 2027, 31 aout 2026',
      ],
    },
    // Le change n’est pas une famille d’actifs et n’en aura pas ici tant qu’une
    // note ne le demandera pas. La seule moitié actionnable de cette entrée
    // porte sur la part couverte du Japon : elle est rattachée là, en
    // maintenir, donc sans aucun effet mécanique.
    {
      famille: 'actions_japon',
      classe: 'Change, exposition dollar et yen',
      sens: 'maintenir',
      ampleur: 'moyenne',
      pourquoi:
        'Aucun pari directionnel n est finançable par le dossier. L euro cote 1,1620 a 1,1627 les 3 et 4 septembre 2026, en hausse de 0,64 % sur un mois et en baisse de 0,71 % sur douze mois, soit une absence de tendance, et le consensus vendeur de dollar (1,22 puis 1,25 vises par Deutsche Bank et Goldman Sachs) a deja ete dementi par les faits. Deux banques centrales simultanement orientees au resserrement neutralisent le differentiel de taux. En revanche le point merite d etre tranche explicitement sur le Japon : le Nikkei cede 10 a 12 % depuis son sommet de juin precisement parce que le yen se raffermit et que la Banque du Japon est attendue en hausse, donc une part couverte encaisse la baisse de l indice sans l amortisseur du change. La couverture doit etre traitee comme un choix de reduction de volatilite, pas de performance, mais elle doit etre un choix.',
      sources: [
        'Trading Economics, EUR USD, 3 et 4 septembre 2026',
        'Boursorama et BFM Bourse, previsions de change Deutsche Bank et Goldman Sachs, 3 septembre 2026',
        'Trading Economics et Business Recorder, Nikkei 225, 3 et 4 septembre 2026',
      ],
    },
    // Sans famille, volontairement : cette entrée vise le calendrier, pas une
    // classe d’actifs. Le moteur l’ignore. L’écran, lui, gagne à l’afficher en
    // tête de la note : c’est elle qui dit quand exécuter.
    {
      famille: null,
      classe: 'Calendrier d execution des arbitrages',
      sens: 'maintenir',
      ampleur: 'forte',
      pourquoi:
        'Quatre echeances datees se concentrent sur quatre semaines et tranchent le scenario : decision BCE et projections de l Eurosysteme le 10 septembre a Berlin, inflation americaine d aout le 11 septembre, decision de la Fed le 16 septembre avec une probabilite de hausse comprise entre 50 % et 66 % selon les relevés, puis presentation du PLF 2027 le 30 septembre et navette jusqu au 31 decembre avec motion de censure deja annoncee. Engager un arbitrage directionnel majeur avant ces publications revient a parier sur leur resultat plutot qu a documenter une situation. La revue d allocation gagne a etre calee apres le 17 septembre, et tout besoin de liquidite client identifie avant mars 2027 gagne a etre securise en amont de cette sequence plutot qu en vendeur force pendant.',
      sources: [
        'BCE, calendrier des reunions de politique monetaire 2026',
        'CME FedWatch via CNBC, Forbes et KuCoin, 28 aout au 3 septembre 2026',
        'LCP et France Budget, calendrier du PLF 2027',
      ],
    },
  ],

  // Les quatre régimes qui suivent restent vides, volontairement. Aucune note
  // ne les documente au 04/09/2026. Une inclinaison sans source serait une
  // opinion du CRM sur les marchés : ce fichier n’en a pas. L’écran doit
  // pouvoir dire « rien de documenté pour ce régime », ce qui est une
  // information juste, plutôt que servir un manuel d’allocation. Le jour où une
  // note datée arrive, ses entrées se recopient ici comme celles du régime
  // courant, avec leurs sources.
  expansion: [],
  ralentissement: [],
  stress: [],
  reprise: [],
}

// Ce que la direction a verrouillé, à tenir en dur. Ces trois règles ne sont
// pas des réglages : elles disent ce que le moteur n’a pas le droit de faire,
// et le moteur les relit à chaque appel plutôt que de les avoir apprises.
export const VERROUS = Object.freeze({
  // 1. Le pôle prudent Abeille ne bouge jamais. Aucune proposition, aucun
  //    calcul dessus. C’est le pôle servi aux clients les plus prudents du
  //    cabinet : il se change par mail de l’assureur, pas par un moteur.
  polesIntouchables: Object.freeze(['ab-prudent']),

  // 2. Aucun monétaire, aucun fonds euro, aucun fonds d’attente ne peut être
  //    proposé, jamais. Ni renforcé sur une ligne existante, ni servi comme
  //    candidat de remplacement.
  famillesIntouchables: Object.freeze(['monetaire_attente']),

  // 3. Le total ne se normalise jamais tout seul. Le moteur rend des lignes,
  //    la remise à 100 % reste le geste explicite déjà codé dans
  //    src/config/allocations.js.
  normalisationAutomatique: false,

  // Seuls ces deux sens font bouger un poids. Un 'maintenir' s’affiche, il ne
  // se calcule pas.
  sensQuiBougent: Object.freeze(['renforcer', 'alleger']),

  // La borne du mouvement, en points de poids. Trois points sur une allocation
  // qui en compte douze, c’est déjà un quart de ligne : au delà ce n’est plus
  // une inflexion, c’est une autre allocation, et une autre allocation se
  // présente et se signe.
  pointsParAmpleur: Object.freeze({ forte: 3, moyenne: 2, legere: 1 }),

  // Un poids ne passe jamais sous zéro. Sortir complètement une ligne reste
  // possible, c’est ce que vaut un poids à 0, mais ça se voit.
  poidsPlancher: 0,
})
