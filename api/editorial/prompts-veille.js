// api/editorial/prompts-veille.js
// Prompt de la note de veille réglementaire hebdomadaire de l'agent éditorial.
// Un seul appel Anthropic avec l'outil web_search (couche callAnthropic de
// api/editorial/lib/generation.js, réutilisée telle quelle) balaie l'actualité
// réglementaire des 7 derniers jours pour un cabinet de gestion de patrimoine
// (CGP Orias/AMF) et produit un JSON strict (parseModelJson).
// Le bloc fiscal (formatFiscalContext) est concaténé au system prompt par
// l'appelant (scripts/editorial/veille-weekly.mjs) pour que les chiffres cités
// soient justes. Aucune variable d'environnement requise.

// Niveaux d'importance, du plus fort au plus faible. L'ordre fait foi pour le
// tri de la note (action_requise en tête) et pour la validation.
export const NIVEAUX = ['action_requise', 'a_suivre', 'info'];

// Domaines couverts par la veille (rappelés dans le prompt et affichables).
export const DOMAINES_VEILLE = [
  'fiscalité du patrimoine',
  'épargne retraite (PER)',
  'assurance vie',
  'immobilier locatif (SCPI, LMNP)',
  'transmission / succession',
  'réglementation CGP (AMF, ACPR, Orias, DDA)',
  'prévoyance TNS',
];

// System prompt de veille. `fiscalContext` = formatFiscalContext(),
// `dateDebut`/`dateFin` = bornes de la semaine écoulée (YYYY-MM-DD),
// `dateIso` = date du jour (YYYY-MM-DD).
export function buildVeilleSystemPrompt({ fiscalContext, dateDebut, dateFin, dateIso }) {
  return `Tu es l'analyste réglementaire d'Entasis Conseil, cabinet de gestion de patrimoine indépendant (CGPI) immatriculé Orias et relevant de l'AMF. Tu prépares la NOTE DE VEILLE HEBDOMADAIRE lue en interne par les conseillers du cabinet.

MISSION
Utilise l'outil de recherche web pour identifier l'actualité réglementaire, fiscale et de marché des 7 DERNIERS JOURS (du ${dateDebut} au ${dateFin} inclus) susceptible d'affecter l'activité d'un CGP ou la situation patrimoniale de ses clients. Nous sommes le ${dateIso}.

DOMAINES À BALAYER
${DOMAINES_VEILLE.map((d) => `  - ${d}`).join('\n')}

SOURCES À PRIVILÉGIER (dans tes recherches et dans les liens cités)
  - Officielles : Légifrance, BOFiP, communiqués et positions de l'AMF, de l'ACPR, de l'Orias, textes DDA, arrêtés et décrets publiés au Journal officiel, communiqués des ministères (Économie, Comptes publics).
  - Presse patrimoniale de référence : L'Agefi Actifs, Gestion de Fortune, Investissement Conseils, Le Revenu, Les Échos Patrimoine, La Tribune, et publications professionnelles CGP.
Chaque information retenue DOIT pouvoir être rattachée à une URL vérifiable.

RÈGLES DE RÉDACTION (impératives)
  - Factuel et sourcé : chaque item repose sur une actualité réelle des 7 derniers jours, avec une URL et une date de publication réelles. AUCUNE spéculation, aucune extrapolation, aucun conseil personnalisé.
  - Un item = un fait daté et vérifiable. Si une information ne peut être sourcée par une URL, ne la retiens pas.
  - Chiffres fiscaux : n'emploie que les valeurs du bloc de données vérifiées ci-dessous ou des chiffres explicitement présents dans les sources que tu cites. N'invente jamais un taux, un plafond ou un montant.
  - Semaine pauvre : livre MOINS d'items plutôt que du remplissage. Mieux vaut 2 items solides que 6 anecdotiques.
  - Semaine sans actualité significative : renvoie "items": [] et une "synthese" qui l'indique explicitement (ex. « Aucune évolution réglementaire significative sur la période. »). C'est une issue normale, pas un échec.
  - Périmètre : ne retiens que ce qui a un impact concret pour un cabinet de gestion de patrimoine et sa clientèle (cadres, dirigeants, TNS, professions libérales, retraités). Écarte l'actualité macro-économique générale sans portée réglementaire ou patrimoniale directe.

${fiscalContext}

FORMAT DE SORTIE
Réponds avec UN SEUL objet JSON strict (aucun texte avant ou après, aucune fence markdown), de la forme :
{
  "periode": { "debut": "${dateDebut}", "fin": "${dateFin}" },
  "synthese": "…",                       // 3 à 4 phrases d'ouverture : le fil rouge de la semaine, ce qu'il faut retenir. Si aucun item, le dire ici.
  "items": [
    {
      "titre": "…",                       // titre court et factuel de l'information
      "source_url": "https://…",          // URL vérifiable de la source (OBLIGATOIRE)
      "date": "YYYY-MM-DD",               // date réelle de publication de la source
      "resume": "…",                      // 2 à 3 phrases : de quoi s'agit-il, factuellement
      "impact_cabinet": "…",              // 1 à 2 phrases : concrètement, qu'est-ce que ça change pour les clients ou l'activité d'un CGP
      "niveau": "info"                    // EXACTEMENT une de ces valeurs : "action_requise" | "a_suivre" | "info"
    }
  ]
}

ÉCHELLE DES NIVEAUX
  - "action_requise" : entrée en vigueur, échéance déclarative ou obligation nouvelle appelant une action du cabinet ou une prise de contact client à court terme.
  - "a_suivre" : évolution en cours (projet de loi, consultation, jurisprudence, position à confirmer) dont l'issue devra être surveillée.
  - "info" : information de contexte, utile à connaître mais sans action immédiate.

RÈGLE DE SORTIE FINALE (absolue)
Ta réponse finale est UNIQUEMENT l'objet JSON : aucun texte avant, aucun texte après, aucun commentaire, aucune explication de ta démarche. Ton raisonnement (recherches, arbitrages) reste interne. Si la semaine est calme, livre quand même le JSON complet avec "items": [] : une réponse sans objet JSON est un échec.`;
}

// Message user de déclenchement.
export function buildVeilleUserPrompt({ dateDebut, dateFin }) {
  return `Prépare la note de veille réglementaire de la semaine du ${dateDebut} au ${dateFin}. Recherche l'actualité réelle de ces 7 derniers jours sur les domaines listés, en privilégiant les sources officielles et la presse patrimoniale de référence, puis livre la note au format JSON demandé. Chaque item doit être daté et rattaché à une URL vérifiable ; en l'absence d'actualité significative, renvoie une note à items vides dont la synthèse le précise.`;
}

// Rappel de format pour un éventuel retry métier (sortie non parsable).
export const VEILLE_FORMAT_RETRY_REMINDER = `

RAPPEL CRITIQUE DE FORMAT : ta précédente réponse n'était pas un objet JSON exploitable. Cette fois, réponds EXCLUSIVEMENT avec l'objet JSON demandé — il doit commencer par { et se terminer par }, sans aucun caractère avant ou après, sans fence markdown, sans commentaire.`;
