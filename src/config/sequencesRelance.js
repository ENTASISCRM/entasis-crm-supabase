// ═══════════════════════════════════════════════════════════════════════════
// SÉQUENCES DE RELANCE, les gabarits
//
// Item B2 du plan d'amélioration (docs/plan_amelioration.md) : un gabarit
// pose une chaîne de prochaines actions datées sur un dossier. Démarrer la
// séquence écrit l'étape 1 dans next_action et next_action_date ; quand le
// conseiller marque l'action faite, l'étape suivante s'arme au bon délai.
// Aucun email automatique, aucune saisie manuelle : c'est le gabarit qui
// écrit.
//
// Chaque étape porte un délai en jours, compté depuis la date de l'étape
// précédente (ou depuis le démarrage pour la première), et le libellé de
// l'action qui sera affiché dans la file du matin.
//
// Pourquoi un fichier de config et pas une table : trois gabarits suffisent
// pour commencer, ils changent rarement, et un conseiller n'a pas à les
// éditer. Le jour où le cabinet en veut vingt, ce fichier devient une
// table sans que la lib change.
// ═══════════════════════════════════════════════════════════════════════════

export const SEQUENCES = {
  relance_devis: {
    cle: 'relance_devis',
    libelle: 'Relance devis standard',
    description: 'Trois contacts sur quinze jours après l’envoi d’un devis.',
    etapes: [
      { delaiJours: 2, action: 'Appel de suivi du devis' },
      { delaiJours: 7, action: 'Email de relance du devis' },
      { delaiJours: 15, action: 'Dernier contact avant clôture' },
    ],
  },
  apres_rdv: {
    cle: 'apres_rdv',
    libelle: 'Suite de rendez vous',
    description: 'Compte rendu, réponse aux questions, puis décision.',
    etapes: [
      { delaiJours: 1, action: 'Envoi du compte rendu et des documents' },
      { delaiJours: 5, action: 'Appel pour répondre aux questions' },
      { delaiJours: 12, action: 'Relance de décision' },
    ],
  },
  pieces_manquantes: {
    cle: 'pieces_manquantes',
    libelle: 'Pièces manquantes',
    description: 'Trois rappels sur un mois avant mise en attente du dossier.',
    etapes: [
      { delaiJours: 3, action: 'Rappel des pièces manquantes' },
      { delaiJours: 10, action: 'Second rappel des pièces' },
      { delaiJours: 20, action: 'Dernier rappel avant mise en attente' },
    ],
  },
}

// Ordre d'affichage dans le sélecteur : du cas le plus fréquent au moins
// fréquent, tel que vécu au cabinet.
export const SEQUENCES_LISTE = ['relance_devis', 'apres_rdv', 'pieces_manquantes'].map((cle) => SEQUENCES[cle])
